import type { Platform } from '../../../shared/types'

/**
 * Interface for OS-specific volume control adapters
 * Each platform (Windows, macOS, Linux) implements this interface
 * 
 * Requirements: 6.1, 6.2, 6.3, 6.4
 */
export interface IOSAdapter {
  /** The platform this adapter supports */
  platform: Platform

  /**
   * Get the current system volume level
   * @returns Promise resolving to volume level (0-100)
   * @throws Error if volume cannot be retrieved
   */
  getSystemVolume(): Promise<number>

  /**
   * Set the system volume level
   * @param level - Volume level to set (0-100)
   * @throws Error if volume cannot be set
   */
  setSystemVolume(level: number): Promise<void>

  /**
   * Check if this adapter is supported on the current system
   * @returns true if the adapter can function on this system
   */
  isSupported(): boolean
}

/**
 * Error class for OS adapter errors
 * Provides OS-specific error messages with troubleshooting guidance
 * 
 * Requirements: 6.5
 */
export class OSAdapterError extends Error {
  constructor(
    message: string,
    public readonly platform: Platform,
    public readonly troubleshooting: string
  ) {
    super(message)
    this.name = 'OSAdapterError'
  }
}
