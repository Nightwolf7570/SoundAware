// Error Handler - comprehensive error handling and resilience
import { EventEmitter } from 'events';

export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeoutMs: number;
  halfOpenRequests: number;
}

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

export class CircuitBreaker extends EventEmitter {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastFailureTime: number = 0;
  private halfOpenAttempts: number = 0;
  private config: CircuitBreakerConfig;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    super();
    this.config = {
      failureThreshold: config.failureThreshold || 5,
      resetTimeoutMs: config.resetTimeoutMs || 30000,
      halfOpenRequests: config.halfOpenRequests || 3
    };
  }

  public async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() - this.lastFailureTime >= this.config.resetTimeoutMs) {
        this.transitionTo(CircuitState.HALF_OPEN);
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.config.halfOpenRequests) {
        this.transitionTo(CircuitState.CLOSED);
      }
    } else {
      this.failureCount = 0;
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      this.transitionTo(CircuitState.OPEN);
    } else if (this.failureCount >= this.config.failureThreshold) {
      this.transitionTo(CircuitState.OPEN);
    }
  }

  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;

    if (newState === CircuitState.CLOSED) {
      this.failureCount = 0;
      this.successCount = 0;
    } else if (newState === CircuitState.HALF_OPEN) {
      this.successCount = 0;
      this.halfOpenAttempts = 0;
    }

    this.emit('state_change', { from: oldState, to: newState });
  }

  public getState(): CircuitState {
    return this.state;
  }

  public getFailureCount(): number {
    return this.failureCount;
  }

  public reset(): void {
    this.transitionTo(CircuitState.CLOSED);
  }
}

export interface FailureTracker {
  operationName: string;
  failureCount: number;
  lastFailure: Date | null;
  warningEmitted: boolean;
}

export class ErrorHandler extends EventEmitter {
  private failureTrackers: Map<string, FailureTracker> = new Map();
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();
  private readonly FAILURE_WARNING_THRESHOLD = 3;

  constructor() {
    super();
  }

  public getCircuitBreaker(name: string, config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
    if (!this.circuitBreakers.has(name)) {
      const breaker = new CircuitBreaker(config);
      breaker.on('state_change', (change) => {
        this.emit('circuit_state_change', { name, ...change });
      });
      this.circuitBreakers.set(name, breaker);
    }
    return this.circuitBreakers.get(name)!;
  }

  public recordFailure(operationName: string, error: Error): void {
    let tracker = this.failureTrackers.get(operationName);
    
    if (!tracker) {
      tracker = {
        operationName,
        failureCount: 0,
        lastFailure: null,
        warningEmitted: false
      };
      this.failureTrackers.set(operationName, tracker);
    }

    tracker.failureCount++;
    tracker.lastFailure = new Date();

    // Log the error
    console.error(`[${operationName}] Error (count: ${tracker.failureCount}):`, error.message);
    this.emit('error_recorded', { operationName, error: error.message, count: tracker.failureCount });

    // Emit warning if threshold reached
    if (tracker.failureCount >= this.FAILURE_WARNING_THRESHOLD && !tracker.warningEmitted) {
      tracker.warningEmitted = true;
      this.emit('warning', {
        operationName,
        failureCount: tracker.failureCount,
        message: `Operation "${operationName}" has failed ${tracker.failureCount} times`
      });
    }
  }

  public recordSuccess(operationName: string): void {
    const tracker = this.failureTrackers.get(operationName);
    if (tracker) {
      tracker.failureCount = 0;
      tracker.warningEmitted = false;
    }
  }

  public getFailureCount(operationName: string): number {
    return this.failureTrackers.get(operationName)?.failureCount || 0;
  }

  public resetFailures(operationName: string): void {
    this.failureTrackers.delete(operationName);
  }

  public resetAllFailures(): void {
    this.failureTrackers.clear();
  }

  // Graceful degradation helper
  public async withFallback<T>(
    primary: () => Promise<T>,
    fallback: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    try {
      const result = await primary();
      this.recordSuccess(operationName);
      return result;
    } catch (error) {
      this.recordFailure(operationName, error as Error);
      console.log(`[${operationName}] Falling back to alternative`);
      return fallback();
    }
  }

  // Retry with exponential backoff
  public async withRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    maxRetries: number = 3,
    baseDelayMs: number = 1000
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await operation();
        this.recordSuccess(operationName);
        return result;
      } catch (error) {
        lastError = error as Error;
        this.recordFailure(operationName, lastError);

        if (attempt < maxRetries) {
          const delay = baseDelayMs * Math.pow(2, attempt);
          console.log(`[${operationName}] Retry ${attempt + 1}/${maxRetries} in ${delay}ms`);
          await this.delay(delay);
        }
      }
    }

    throw lastError;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Get all failure stats
  public getFailureStats(): FailureTracker[] {
    return Array.from(this.failureTrackers.values());
  }

  // Get circuit breaker stats
  public getCircuitBreakerStats(): { name: string; state: CircuitState; failures: number }[] {
    const stats: { name: string; state: CircuitState; failures: number }[] = [];
    for (const [name, breaker] of this.circuitBreakers) {
      stats.push({
        name,
        state: breaker.getState(),
        failures: breaker.getFailureCount()
      });
    }
    return stats;
  }
}

// Global error handler instance
export const globalErrorHandler = new ErrorHandler();