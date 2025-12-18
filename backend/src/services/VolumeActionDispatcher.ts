// Volume Action Dispatcher - sends volume commands to frontend
import { EventEmitter } from 'events';
import { VolumeActionDispatcher as IVolumeActionDispatcher, AttentionDecision, VolumeAction } from '../interfaces';
import { VolumeActionModel } from '../models';

export interface VolumeActionCallback {
  (action: VolumeAction): void;
}

export class VolumeActionDispatcherImpl extends EventEmitter implements IVolumeActionDispatcher {
  private silenceTimer: NodeJS.Timeout | null = null;
  private silenceTimeoutMs: number = 10000; // Default 10 seconds
  private currentVolumeState: 'normal' | 'lowered' = 'normal';
  private lastActionTimestamp: Date | null = null;
  private actionCallback: VolumeActionCallback | null = null;
  private sensitivityLevel: number = 0.7;

  constructor() {
    super();
  }

  public setActionCallback(callback: VolumeActionCallback): void {
    this.actionCallback = callback;
  }

  public setSilenceTimeout(timeoutMs: number): void {
    if (timeoutMs < 1000) {
      throw new Error('Silence timeout must be at least 1000ms');
    }
    this.silenceTimeoutMs = timeoutMs;
  }

  public getSilenceTimeout(): number {
    return this.silenceTimeoutMs;
  }

  public setSensitivityLevel(level: number): void {
    if (level < 0 || level > 1) {
      throw new Error('Sensitivity level must be between 0 and 1');
    }
    this.sensitivityLevel = level;
  }

  public getSensitivityLevel(): number {
    return this.sensitivityLevel;
  }

  public async dispatchAction(decision: AttentionDecision, sensitivity: number): Promise<void> {
    let action: VolumeActionModel | null = null;

    switch (decision) {
      case AttentionDecision.DEFINITELY_TO_ME:
        // Always lower volume for definite attention
        action = this.createLowerVolumeAction(decision, 0.95);
        // Reset silence timer - conversation is active
        this.resetSilenceTimer();
        break;

      case AttentionDecision.PROBABLY_TO_ME:
        // Only lower volume if sensitivity is above 0.5
        if (sensitivity > 0.5) {
          action = this.createLowerVolumeAction(decision, 0.7);
          // Reset silence timer - conversation is active
          this.resetSilenceTimer();
        }
        break;

      case AttentionDecision.IGNORE:
        // Don't send any action for ignored speech
        // Don't reset the timer - let it count down to restore volume
        // Only start timer if volume is currently lowered
        if (this.currentVolumeState === 'lowered' && !this.silenceTimer) {
          this.startSilenceTimer();
        }
        break;
    }

    if (action) {
      this.sendAction(action);
      // Start silence timer after lowering volume
      this.startSilenceTimer();
    }
  }

  private createLowerVolumeAction(decision: AttentionDecision, confidence: number): VolumeActionModel {
    return new VolumeActionModel('LOWER_VOLUME', decision, confidence);
  }

  private createRestoreVolumeAction(): VolumeActionModel {
    return new VolumeActionModel('RESTORE_VOLUME', AttentionDecision.IGNORE, 1.0);
  }

  private sendAction(action: VolumeActionModel): void {
    // Only send if state is changing
    if (action.type === 'LOWER_VOLUME' && this.currentVolumeState === 'lowered') {
      // Already lowered, just reset the timer
      return;
    }

    if (action.type === 'RESTORE_VOLUME' && this.currentVolumeState === 'normal') {
      // Already normal, no action needed
      return;
    }

    // Update state
    this.currentVolumeState = action.type === 'LOWER_VOLUME' ? 'lowered' : 'normal';
    this.lastActionTimestamp = action.timestamp;

    // Emit event
    this.emit('volume_action', action);

    // Call callback if set
    if (this.actionCallback) {
      this.actionCallback(action);
    }

    console.log(`Volume action dispatched: ${action.type} (reason: ${action.triggerReason})`);
  }

  public startSilenceTimer(): void {
    // Clear existing timer
    this.stopSilenceTimer();

    // Start new timer
    this.silenceTimer = setTimeout(() => {
      this.onSilenceTimeout();
    }, this.silenceTimeoutMs);

    this.emit('silence_timer_started', { timeoutMs: this.silenceTimeoutMs });
  }

  public stopSilenceTimer(): void {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
      this.emit('silence_timer_stopped');
    }
  }

  private resetSilenceTimer(): void {
    if (this.silenceTimer) {
      this.stopSilenceTimer();
      this.startSilenceTimer();
    }
  }

  private onSilenceTimeout(): void {
    this.silenceTimer = null;
    
    // Restore volume after silence timeout
    if (this.currentVolumeState === 'lowered') {
      const action = this.createRestoreVolumeAction();
      this.sendAction(action);
      this.emit('silence_timeout', { action });
    }
  }

  // Force restore volume (e.g., when user manually requests it)
  public forceRestoreVolume(): void {
    this.stopSilenceTimer();
    
    if (this.currentVolumeState === 'lowered') {
      const action = this.createRestoreVolumeAction();
      this.sendAction(action);
    }
  }

  // Force lower volume (e.g., when user manually requests it)
  public forceLowerVolume(): void {
    this.stopSilenceTimer();
    
    const action = this.createLowerVolumeAction(AttentionDecision.DEFINITELY_TO_ME, 1.0);
    this.sendAction(action);
    
    // Start silence timer for auto-restore
    this.startSilenceTimer();
  }

  // Get current state
  public getCurrentVolumeState(): 'normal' | 'lowered' {
    return this.currentVolumeState;
  }

  public getLastActionTimestamp(): Date | null {
    return this.lastActionTimestamp;
  }

  public isTimerActive(): boolean {
    return this.silenceTimer !== null;
  }

  // Cleanup
  public dispose(): void {
    this.stopSilenceTimer();
    this.actionCallback = null;
    this.removeAllListeners();
  }

  // Serialization
  public toJSON(): any {
    return {
      silenceTimeoutMs: this.silenceTimeoutMs,
      sensitivityLevel: this.sensitivityLevel,
      currentVolumeState: this.currentVolumeState
    };
  }

  public fromJSON(data: any): void {
    if (typeof data.silenceTimeoutMs === 'number') {
      this.silenceTimeoutMs = data.silenceTimeoutMs;
    }
    if (typeof data.sensitivityLevel === 'number') {
      this.sensitivityLevel = data.sensitivityLevel;
    }
  }
}