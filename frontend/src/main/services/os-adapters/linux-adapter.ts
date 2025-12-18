import { exec } from 'child_process'
import { promisify } from 'util'
import type { IOSAdapter } from './types'
import { OSAdapterError } from './types'

const execAsync = promisify(exec)

/**
 * Linux volume adapter using pactl (PulseAudio) with amixer fallback
 * Supports both PulseAudio and ALSA for broader compatibility
 * 
 * Requirements: 6.3, 6.5
 */
export class LinuxVolumeAdapter implements IOSAdapter {
  readonly platform = 'linux' as const
  private usePulseAudio: boolean | null = null

  /**
   * Check if this adapter is supported (running on Linux)
   */
  isSupported(): boolean {
    return process.platform === 'linux'
  }

  /**
   * Detect whether PulseAudio is available
   * Falls back to ALSA (amixer) if not
   */
  private async detectAudioSystem(): Promise<boolean> {
    if (this.usePulseAudio !== null) {
      return this.usePulseAudio
    }

    try {
      await execAsync('pactl --version')
      this.usePulseAudio = true
      return true
    } catch {
      this.usePulseAudio = false
      return false
    }
  }

  /**
   * Get the current system volume level
   * Uses pactl for PulseAudio or amixer for ALSA
   * @returns Promise resolving to volume level (0-100)
   */
  async getSystemVolume(): Promise<number> {
    if (!this.isSupported()) {
      throw new OSAdapterError(
        'Linux volume adapter is not supported on this platform',
        'linux',
        'This adapter only works on Linux operating systems.'
      )
    }

    const usePulse = await this.detectAudioSystem()

    try {
      if (usePulse) {
        return await this.getVolumePulseAudio()
      } else {
        return await this.getVolumeALSA()
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      throw new OSAdapterError(
        `Failed to get system volume: ${message}`,
        'linux',
        'Ensure PulseAudio or ALSA is properly configured. Try running "pactl info" or "amixer" to verify audio system status.'
      )
    }
  }

  /**
   * Get volume using PulseAudio (pactl)
   */
  private async getVolumePulseAudio(): Promise<number> {
    // Get the default sink volume
    const { stdout } = await execAsync(
      "pactl get-sink-volume @DEFAULT_SINK@ | grep -oP '\\d+%' | head -1 | tr -d '%'"
    )
    const volume = parseInt(stdout.trim(), 10)

    if (isNaN(volume)) {
      throw new Error('Could not parse PulseAudio volume')
    }

    // PulseAudio can go above 100%, clamp to our range
    return Math.min(100, Math.max(0, volume))
  }

  /**
   * Get volume using ALSA (amixer)
   */
  private async getVolumeALSA(): Promise<number> {
    // Get the Master volume
    const { stdout } = await execAsync(
      "amixer get Master | grep -oP '\\[\\d+%\\]' | head -1 | tr -d '[]%'"
    )
    const volume = parseInt(stdout.trim(), 10)

    if (isNaN(volume)) {
      throw new Error('Could not parse ALSA volume')
    }

    return Math.min(100, Math.max(0, volume))
  }

  /**
   * Set the system volume level
   * Uses pactl for PulseAudio or amixer for ALSA
   * @param level - Volume level to set (0-100)
   */
  async setSystemVolume(level: number): Promise<void> {
    if (!this.isSupported()) {
      throw new OSAdapterError(
        'Linux volume adapter is not supported on this platform',
        'linux',
        'This adapter only works on Linux operating systems.'
      )
    }

    // Clamp level to valid range
    const clampedLevel = Math.max(0, Math.min(100, Math.round(level)))
    const usePulse = await this.detectAudioSystem()

    try {
      if (usePulse) {
        await this.setVolumePulseAudio(clampedLevel)
      } else {
        await this.setVolumeALSA(clampedLevel)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      throw new OSAdapterError(
        `Failed to set system volume: ${message}`,
        'linux',
        'Ensure you have permission to control audio. You may need to add your user to the "audio" group.'
      )
    }
  }

  /**
   * Set volume using PulseAudio (pactl)
   */
  private async setVolumePulseAudio(level: number): Promise<void> {
    await execAsync(`pactl set-sink-volume @DEFAULT_SINK@ ${level}%`)
  }

  /**
   * Set volume using ALSA (amixer)
   */
  private async setVolumeALSA(level: number): Promise<void> {
    await execAsync(`amixer set Master ${level}%`)
  }
}
