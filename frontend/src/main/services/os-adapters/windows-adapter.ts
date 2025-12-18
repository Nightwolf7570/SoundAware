import { exec } from 'child_process'
import { promisify } from 'util'
import type { IOSAdapter } from './types'
import { OSAdapterError } from './types'

const execAsync = promisify(exec)

/**
 * Windows volume adapter using PowerShell commands
 * Uses AudioDeviceCmdlets or native PowerShell for volume control
 * 
 * Requirements: 6.1, 6.5
 */
export class WindowsVolumeAdapter implements IOSAdapter {
  readonly platform = 'win32' as const

  /**
   * Check if this adapter is supported (running on Windows)
   */
  isSupported(): boolean {
    return process.platform === 'win32'
  }

  /**
   * Get the current system volume level using PowerShell
   * @returns Promise resolving to volume level (0-100)
   */
  async getSystemVolume(): Promise<number> {
    if (!this.isSupported()) {
      throw new OSAdapterError(
        'Windows volume adapter is not supported on this platform',
        'win32',
        'This adapter only works on Windows operating systems.'
      )
    }

    try {
      // Use PowerShell to get the current volume via Windows Audio API
      const script = `
        Add-Type -TypeDefinition @'
        using System.Runtime.InteropServices;
        [Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IAudioEndpointVolume {
            int _0(); int _1(); int _2(); int _3();
            int SetMasterVolumeLevelScalar(float fLevel, System.Guid pguidEventContext);
            int _5();
            int GetMasterVolumeLevelScalar(out float pfLevel);
            int _7(); int _8(); int _9(); int _10(); int _11(); int _12();
        }
        [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IMMDevice { int Activate(ref System.Guid iid, int dwClsCtx, IntPtr pActivationParams, out IAudioEndpointVolume ppInterface); }
        [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IMMDeviceEnumerator { int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice ppDevice); }
        [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumerator { }
        public class Audio {
            static IAudioEndpointVolume Vol() {
                var enumerator = new MMDeviceEnumerator() as IMMDeviceEnumerator;
                IMMDevice dev; enumerator.GetDefaultAudioEndpoint(0, 1, out dev);
                IAudioEndpointVolume vol; var guid = typeof(IAudioEndpointVolume).GUID;
                dev.Activate(ref guid, 1, IntPtr.Zero, out vol); return vol;
            }
            public static float GetVolume() { float v; Vol().GetMasterVolumeLevelScalar(out v); return v; }
            public static void SetVolume(float v) { Vol().SetMasterVolumeLevelScalar(v, System.Guid.Empty); }
        }
'@
        [Math]::Round([Audio]::GetVolume() * 100)
      `

      const { stdout } = await execAsync(`powershell -NoProfile -Command "${script.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`)
      const volume = parseInt(stdout.trim(), 10)

      if (isNaN(volume) || volume < 0 || volume > 100) {
        throw new Error('Invalid volume value received')
      }

      return volume
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      throw new OSAdapterError(
        `Failed to get system volume: ${message}`,
        'win32',
        'Ensure you have permission to access audio devices. Try running the application as administrator if the issue persists.'
      )
    }
  }

  /**
   * Set the system volume level using PowerShell
   * @param level - Volume level to set (0-100)
   */
  async setSystemVolume(level: number): Promise<void> {
    if (!this.isSupported()) {
      throw new OSAdapterError(
        'Windows volume adapter is not supported on this platform',
        'win32',
        'This adapter only works on Windows operating systems.'
      )
    }

    // Clamp level to valid range
    const clampedLevel = Math.max(0, Math.min(100, Math.round(level)))
    const volumeScalar = clampedLevel / 100

    try {
      const script = `
        Add-Type -TypeDefinition @'
        using System.Runtime.InteropServices;
        [Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IAudioEndpointVolume {
            int _0(); int _1(); int _2(); int _3();
            int SetMasterVolumeLevelScalar(float fLevel, System.Guid pguidEventContext);
            int _5();
            int GetMasterVolumeLevelScalar(out float pfLevel);
            int _7(); int _8(); int _9(); int _10(); int _11(); int _12();
        }
        [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IMMDevice { int Activate(ref System.Guid iid, int dwClsCtx, IntPtr pActivationParams, out IAudioEndpointVolume ppInterface); }
        [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IMMDeviceEnumerator { int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice ppDevice); }
        [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumerator { }
        public class Audio {
            static IAudioEndpointVolume Vol() {
                var enumerator = new MMDeviceEnumerator() as IMMDeviceEnumerator;
                IMMDevice dev; enumerator.GetDefaultAudioEndpoint(0, 1, out dev);
                IAudioEndpointVolume vol; var guid = typeof(IAudioEndpointVolume).GUID;
                dev.Activate(ref guid, 1, IntPtr.Zero, out vol); return vol;
            }
            public static float GetVolume() { float v; Vol().GetMasterVolumeLevelScalar(out v); return v; }
            public static void SetVolume(float v) { Vol().SetMasterVolumeLevelScalar(v, System.Guid.Empty); }
        }
'@
        [Audio]::SetVolume(${volumeScalar})
      `

      await execAsync(`powershell -NoProfile -Command "${script.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      throw new OSAdapterError(
        `Failed to set system volume: ${message}`,
        'win32',
        'Ensure you have permission to control audio devices. Try running the application as administrator if the issue persists.'
      )
    }
  }
}
