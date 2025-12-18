import React from 'react'
import { useAppState } from '../context/AppContext'
import type { ConnectionStatus } from '../hooks/useWebSocket'
import type { VolumeState } from '../../../shared/types'

/**
 * Get connection status display properties
 */
function getConnectionStatusDisplay(status: ConnectionStatus): { label: string; color: string; pulse: boolean } {
  switch (status) {
    case 'connected':
      return { label: 'Connected', color: 'bg-green-500', pulse: false }
    case 'connecting':
      return { label: 'Connecting...', color: 'bg-yellow-500', pulse: true }
    case 'reconnecting':
      return { label: 'Reconnecting...', color: 'bg-yellow-500', pulse: true }
    case 'disconnected':
    default:
      return { label: 'Disconnected', color: 'bg-red-500', pulse: false }
  }
}

/**
 * Get volume state display properties
 */
function getVolumeStateDisplay(state: VolumeState, level: number): { label: string; icon: string } {
  if (state === 'dimmed') {
    return { label: `Dimmed (${level}%)`, icon: '🔉' }
  }
  return { label: `Normal (${level}%)`, icon: '🔊' }
}

/**
 * Audio level meter component
 */
interface AudioLevelMeterProps {
  level: number
  isCapturing: boolean
}

function AudioLevelMeter({ level, isCapturing }: AudioLevelMeterProps): JSX.Element {
  // Clamp level between 0 and 100
  const clampedLevel = Math.max(0, Math.min(100, level))
  
  // Determine color based on level
  let barColor = 'bg-green-500'
  if (clampedLevel > 80) {
    barColor = 'bg-red-500'
  } else if (clampedLevel > 60) {
    barColor = 'bg-yellow-500'
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-400">🎤</span>
      <div className="w-24 h-2 bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-75 ${isCapturing ? barColor : 'bg-gray-600'}`}
          style={{ width: `${isCapturing ? clampedLevel : 0}%` }}
          role="progressbar"
          aria-valuenow={clampedLevel}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Audio level"
        />
      </div>
      {!isCapturing && (
        <span className="text-xs text-gray-500">Off</span>
      )}
    </div>
  )
}


/**
 * StatusBar component
 * Displays connection status, audio level meter, and volume state
 * 
 * Requirements:
 * - 8.1: Display current connection status (connected/disconnected/reconnecting)
 * - 8.2: Display audio level indicator when microphone is capturing
 * - 8.3: Display current volume level and state (normal/dimmed)
 */
export function StatusBar(): JSX.Element {
  const state = useAppState()
  
  const connectionDisplay = getConnectionStatusDisplay(state.connection.status)
  const volumeDisplay = getVolumeStateDisplay(state.volume.state, state.volume.currentLevel)

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
      {/* Connection Status */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${connectionDisplay.color} ${
              connectionDisplay.pulse ? 'animate-pulse' : ''
            }`}
            aria-hidden="true"
          />
          <span className="text-sm text-gray-300" data-testid="connection-status">
            {connectionDisplay.label}
          </span>
        </div>
        {state.connection.lastError && (
          <span className="text-xs text-red-400 ml-2" title={state.connection.lastError}>
            ⚠️
          </span>
        )}
      </div>

      {/* Audio Level Meter */}
      <div data-testid="audio-level-meter">
        <AudioLevelMeter
          level={state.audio.audioLevel}
          isCapturing={state.audio.isCapturing}
        />
      </div>

      {/* Volume State */}
      <div className="flex items-center gap-2" data-testid="volume-state">
        <span className="text-lg" aria-hidden="true">
          {volumeDisplay.icon}
        </span>
        <span className={`text-sm ${state.volume.state === 'dimmed' ? 'text-yellow-400' : 'text-gray-300'}`}>
          {volumeDisplay.label}
        </span>
      </div>
    </div>
  )
}

export default StatusBar
