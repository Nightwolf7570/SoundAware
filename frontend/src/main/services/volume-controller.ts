import type { VolumeState, VolumeStatus } from '../../shared/types'
import type { IOSAdapter } from './os-adapters/types'
import { getOSAdapter } from './os-adapters/adapter-factory'

/**
 * Configuration for the volume controller
 */
export interface VolumeControllerConfig {
  /** Target volume level when dimmed (0-100) */
  dimLevel: number
  /** Duration of smooth volume transitions in milliseconds */
  transitionDuration: number
}

/**
 * Interface for volume controller operations
 * Requirements: 3.1, 3.2, 3.4
 */
export interface IVolumeController {
  getVolume(): Promise<number>
  setVolume(level: number, smooth?: boolean): Promise<void>
  dimVolume(targetLevel: number): Promise<void>
  restoreVolume(): Promise<void>
  getStatus(): VolumeStatus
}

const DEFAULT_CONFIG: VolumeControllerConfig = {
  dimLevel: 20,
  transitionDuration: 200
}

/**
 * VolumeController manages system volume with smooth transitions
 * and tracks previous volume for restore functionality.
 * 
 * Requirements: 3.1, 3.2, 3.4
 */
export class VolumeController implements IVolumeController {
  private adapter: IOSAdapter
  private config: VolumeControllerConfig
  private currentLevel: number = 100
  private previousLevel: number = 100
  private state: VolumeState = 'normal'

  constructor(adapter?: IOSAdapter, config?: Partial<VolumeControllerConfig>) {
    this.adapter = adapter ?? getOSAdapter()
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * Get the current system volume level
   * @returns Volume level (0-100)
   */
  async getVolume(): Promise<number> {
    const level = await this.adapter.getSystemVolume()
    this.currentLevel = level
    return level
  }

  /**
   * Set the system volume level
   * @param level - Target volume level (0-100)
   * @param smooth - Whether to apply smooth transition (default: false)
   * Requirements: 3.4
   */
  async setVolume(level: number, smooth: boolean = false): Promise<void> {
    const clampedLevel = Math.max(0, Math.min(100, level))

    if (smooth && this.config.transitionDuration > 0) {
      await this.smoothTransition(clampedLevel)
    } else {
      await this.adapter.setSystemVolume(clampedLevel)
    }

    this.currentLevel = clampedLevel
  }


  /**
   * Dim the volume to a target level, storing the current level for later restore
   * @param targetLevel - Target dim level (0-100)
   * Requirements: 3.1
   */
  async dimVolume(targetLevel: number): Promise<void> {
    if (this.state === 'dimmed') {
      // Already dimmed, just update the dim level
      await this.setVolume(targetLevel, true)
      return
    }

    // Store current volume before dimming
    this.previousLevel = await this.getVolume()
    
    // Apply smooth transition to dim level
    await this.setVolume(targetLevel, true)
    
    this.state = 'dimmed'
  }

  /**
   * Restore the volume to the level before dimming
   * Requirements: 3.2
   */
  async restoreVolume(): Promise<void> {
    if (this.state === 'normal') {
      // Already at normal state, nothing to restore
      return
    }

    // Apply smooth transition back to previous level
    await this.setVolume(this.previousLevel, true)
    
    this.state = 'normal'
  }

  /**
   * Get the current volume status
   * @returns VolumeStatus with current level, previous level, and state
   */
  getStatus(): VolumeStatus {
    return {
      currentLevel: this.currentLevel,
      previousLevel: this.previousLevel,
      state: this.state
    }
  }

  /**
   * Apply a smooth volume transition over the configured duration
   * @param targetLevel - Target volume level
   * Requirements: 3.4
   */
  private async smoothTransition(targetLevel: number): Promise<void> {
    const startLevel = this.currentLevel
    const diff = targetLevel - startLevel
    
    if (diff === 0) {
      return
    }

    const steps = 10 // Number of steps for smooth transition
    const stepDuration = this.config.transitionDuration / steps
    const stepSize = diff / steps

    for (let i = 1; i <= steps; i++) {
      const intermediateLevel = Math.round(startLevel + stepSize * i)
      await this.adapter.setSystemVolume(intermediateLevel)
      
      if (i < steps) {
        await this.sleep(stepDuration)
      }
    }
  }

  /**
   * Sleep for a specified duration
   * @param ms - Duration in milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * Update the configuration
   * @param config - Partial configuration to update
   */
  updateConfig(config: Partial<VolumeControllerConfig>): void {
    this.config = { ...this.config, ...config }
  }
}

// Singleton instance
let volumeControllerInstance: VolumeController | null = null

/**
 * Get the singleton VolumeController instance
 */
export function getVolumeController(): VolumeController {
  if (!volumeControllerInstance) {
    volumeControllerInstance = new VolumeController()
  }
  return volumeControllerInstance
}

/**
 * Reset the singleton instance (useful for testing)
 */
export function resetVolumeControllerInstance(): void {
  volumeControllerInstance = null
}
