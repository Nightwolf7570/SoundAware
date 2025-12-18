import type { Platform } from '../../../shared/types'
import type { IOSAdapter } from './types'
import { WindowsVolumeAdapter } from './windows-adapter'
import { MacOSVolumeAdapter } from './macos-adapter'
import { LinuxVolumeAdapter } from './linux-adapter'

/**
 * Factory for creating OS-specific volume adapters
 * Detects the current platform and returns the appropriate adapter
 * 
 * Requirements: 6.4
 */
export class OSAdapterFactory {
  /**
   * Detect the current operating system platform
   * @returns The detected platform
   */
  static detectPlatform(): Platform {
    const platform = process.platform
    if (platform === 'win32') return 'win32'
    if (platform === 'darwin') return 'darwin'
    return 'linux'
  }

  /**
   * Create an OS adapter for the specified platform
   * @param platform - The platform to create an adapter for
   * @returns The appropriate IOSAdapter implementation
   */
  static createAdapter(platform: Platform): IOSAdapter {
    switch (platform) {
      case 'win32':
        return new WindowsVolumeAdapter()
      case 'darwin':
        return new MacOSVolumeAdapter()
      case 'linux':
        return new LinuxVolumeAdapter()
      default:
        // TypeScript exhaustiveness check
        const _exhaustive: never = platform
        throw new Error(`Unsupported platform: ${_exhaustive}`)
    }
  }

  /**
   * Create an OS adapter for the current platform
   * Combines platform detection with adapter creation
   * @returns The appropriate IOSAdapter for the current OS
   */
  static createForCurrentPlatform(): IOSAdapter {
    const platform = this.detectPlatform()
    return this.createAdapter(platform)
  }
}

// Singleton instance for use throughout the application
let adapterInstance: IOSAdapter | null = null

/**
 * Get the singleton OS adapter instance
 * Creates the instance on first call using the current platform
 */
export function getOSAdapter(): IOSAdapter {
  if (!adapterInstance) {
    adapterInstance = OSAdapterFactory.createForCurrentPlatform()
  }
  return adapterInstance
}

/**
 * Reset the singleton instance (useful for testing)
 */
export function resetOSAdapterInstance(): void {
  adapterInstance = null
}
