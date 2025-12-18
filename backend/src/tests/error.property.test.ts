/**
 * Property-based tests for Error Handling
 * **Feature: conversational-awareness-backend**
 */
import * as fc from 'fast-check';
import { ErrorHandler, CircuitBreaker, CircuitState } from '../services/ErrorHandler';

describe('Error Handler Property Tests', () => {
  /**
   * **Feature: conversational-awareness-backend, Property 28: Audio Processing Error Recovery**
   * *For any* unexpected error during audio processing, the error should be logged 
   * and processing should continue with the next Speech_Segment
   * **Validates: Requirements 7.3**
   */
  test('Property 28: Error handler records failures and allows continued processing', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 10 }),
        async (operationNames) => {
          const errorHandler = new ErrorHandler();
          
          // Record failures for each operation
          for (const opName of operationNames) {
            errorHandler.recordFailure(opName, new Error('Test error'));
          }
          
          // All failures should be recorded
          for (const opName of operationNames) {
            expect(errorHandler.getFailureCount(opName)).toBeGreaterThan(0);
          }
          
          // Recording success should reset failure count
          for (const opName of operationNames) {
            errorHandler.recordSuccess(opName);
            expect(errorHandler.getFailureCount(opName)).toBe(0);
          }
          
          return true;
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * **Feature: conversational-awareness-backend, Property 29: Repeated Failure Warning**
   * *For any* operation with repeated failures, a warning event should be emitted 
   * to the frontend when failure threshold is reached
   * **Validates: Requirements 7.4**
   */
  test('Property 29: Warning emitted after repeated failures', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 3, max: 10 }),
        async (failureCount) => {
          const errorHandler = new ErrorHandler();
          const warnings: any[] = [];
          
          errorHandler.on('warning', (warning) => {
            warnings.push(warning);
          });
          
          // Record failures until threshold (3) is reached
          for (let i = 0; i < failureCount; i++) {
            errorHandler.recordFailure('test-operation', new Error(`Error ${i}`));
          }
          
          // Warning should be emitted after threshold
          if (failureCount >= 3) {
            expect(warnings.length).toBe(1);
            expect(warnings[0].operationName).toBe('test-operation');
            expect(warnings[0].failureCount).toBe(3);
          }
          
          return true;
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Test Circuit Breaker state transitions
   */
  test('Circuit breaker transitions through states correctly', async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 100 });
    
    expect(breaker.getState()).toBe(CircuitState.CLOSED);
    
    // Fail 3 times to open circuit
    for (let i = 0; i < 3; i++) {
      try {
        await breaker.execute(async () => { throw new Error('fail'); });
      } catch {}
    }
    
    expect(breaker.getState()).toBe(CircuitState.OPEN);
    
    // Wait for reset timeout
    await new Promise(r => setTimeout(r, 150));
    
    // Next call should transition to half-open
    try {
      await breaker.execute(async () => 'success');
    } catch {}
    
    // Should be in half-open or closed now
    expect([CircuitState.HALF_OPEN, CircuitState.CLOSED]).toContain(breaker.getState());
  });

  /**
   * Test fallback mechanism
   */
  test('Fallback is used when primary fails', async () => {
    const errorHandler = new ErrorHandler();
    
    const result = await errorHandler.withFallback(
      async () => { throw new Error('Primary failed'); },
      async () => 'fallback-result',
      'test-operation'
    );
    
    expect(result).toBe('fallback-result');
    expect(errorHandler.getFailureCount('test-operation')).toBe(1);
  });

  /**
   * Test retry mechanism
   */
  test('Retry succeeds after initial failures', async () => {
    const errorHandler = new ErrorHandler();
    let attempts = 0;
    
    const result = await errorHandler.withRetry(
      async () => {
        attempts++;
        if (attempts < 3) throw new Error('Not yet');
        return 'success';
      },
      'retry-operation',
      3,
      10 // Short delay for testing
    );
    
    expect(result).toBe('success');
    expect(attempts).toBe(3);
  });
});