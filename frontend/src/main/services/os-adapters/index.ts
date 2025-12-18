// Types and interfaces
export { IOSAdapter, OSAdapterError } from './types'

// Platform-specific adapters
export { WindowsVolumeAdapter } from './windows-adapter'
export { MacOSVolumeAdapter } from './macos-adapter'
export { LinuxVolumeAdapter } from './linux-adapter'

// Factory and singleton
export {
  OSAdapterFactory,
  getOSAdapter,
  resetOSAdapterInstance
} from './adapter-factory'
