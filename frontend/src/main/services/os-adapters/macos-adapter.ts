import { exec } from 'child_process'
import { promisify } from 'util'
import type { IOSAdapter } from './types'
import { OSAdapterError } from './types'

const execAsync = promisify(exec)

/**
 * macOS volume adapter using osascript (AppleScript)
 * Uses native macOS commands for volume control
 * 
 * Requirements: 6.2, 6.5
 */
export class MacOSVolumeAdapter implements IOSAdapter {
  readonly platform = 'darwin' as const

  /**
   * Check if this adapter is supported (running on macOS)
   */
  isSupported(): boolean {
    return process.platform === 'darwin'
  }

  /**
   * Get the current system volume level using osascript
   * @returns Promise resolving to volume level (0-100)
   */
  async getSystemVolume(): Promise<number> {
    if (!this.isSupported()) {
      throw new OSAdapterError(
        'macOS volume adapter is not supported on this platform',
        'darwin',
        'This adapter only works on macOS operating systems.'
      )
    }

    try {
      // Use osascript to get the current output volume
      // macOS volume is 0-100, which matches our expected range
      const { stdout } = await execAsync('osascript -e "output volume of (get volume settings)"')
      const volume = parseInt(stdout.trim(), 10)

      if (isNaN(volume) || volume < 0 || volume > 100) {
        throw new Error('Invalid volume value received')
      }

      return volume
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      throw new OSAdapterError(
        `Failed to get system volume: ${message}`,
        'darwin',
        'Ensure the application has permission to control system audio. Check System Preferences > Security & Privacy > Privacy > Automation.'
      )
    }
  }

  /**
   * Set the system volume level using osascript
   * @param level - Volume level to set (0-100)
   */
  async setSystemVolume(level: number): Promise<void> {
    if (!this.isSupported()) {
      throw new OSAdapterError(
        'macOS volume adapter is not supported on this platform',
        'darwin',
        'This adapter only works on macOS operating systems.'
      )
    }

    // Clamp level to valid range
    const clampedLevel = Math.max(0, Math.min(100, Math.round(level)))

    try {
      // Use osascript to set the output volume
      await execAsync(`osascript -e "set volume output volume ${clampedLevel}"`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      throw new OSAdapterError(
        `Failed to set system volume: ${message}`,
        'darwin',
        'Ensure the application has permission to control system audio. Check System Preferences > Security & Privacy > Privacy > Automation.'
      )
    }
  }
}
