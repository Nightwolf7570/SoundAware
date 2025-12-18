import React, { useState, useEffect } from 'react'
import { useAppState, useAppDispatch } from '../context/AppContext'

/**
 * SettingsPanel component
 * Provides configuration options for the application
 * 
 * Requirements:
 * - 7.1: Display configurable options for dim volume level (0-100%)
 * - 7.2: Display option to set WebSocket server URL
 * - 7.5: Allow selection of audio input device
 */
export function SettingsPanel(): JSX.Element {
  const state = useAppState()
  const dispatch = useAppDispatch()
  
  // Local state for form inputs
  const [dimLevel, setDimLevel] = useState(state.settings.dimLevel)
  const [serverUrl, setServerUrl] = useState(state.settings.serverUrl)
  const [selectedDeviceId, setSelectedDeviceId] = useState(state.settings.selectedDeviceId || '')
  const [isSaving, setIsSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle')

  // Sync local state with app state
  useEffect(() => {
    setDimLevel(state.settings.dimLevel)
    setServerUrl(state.settings.serverUrl)
    setSelectedDeviceId(state.settings.selectedDeviceId || '')
  }, [state.settings])

  // Save settings to persistence
  const saveSettings = async (): Promise<void> => {
    setIsSaving(true)
    setSaveStatus('idle')
    
    try {
      const newSettings = {
        dimLevel,
        serverUrl,
        selectedDeviceId: selectedDeviceId || null
      }
      
      await window.electronAPI.settings.set(newSettings)
      dispatch({ type: 'SETTINGS_UPDATE', settings: newSettings })
      setSaveStatus('saved')
      
      // Clear saved status after 2 seconds
      setTimeout(() => setSaveStatus('idle'), 2000)
    } catch (err) {
      setSaveStatus('error')
      const message = err instanceof Error ? err.message : 'Failed to save settings'
      dispatch({
        type: 'ERROR_ADD',
        error: { message, severity: 'error' }
      })
    } finally {
      setIsSaving(false)
    }
  }

  // Handle dim level change
  const handleDimLevelChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const value = parseInt(e.target.value, 10)
    setDimLevel(Math.max(0, Math.min(100, value)))
  }

  // Handle server URL change
  const handleServerUrlChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    setServerUrl(e.target.value)
  }

  // Handle device selection change
  const handleDeviceChange = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    setSelectedDeviceId(e.target.value)
  }

  // Check if settings have changed
  const hasChanges = 
    dimLevel !== state.settings.dimLevel ||
    serverUrl !== state.settings.serverUrl ||
    (selectedDeviceId || null) !== state.settings.selectedDeviceId

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h2 className="text-xl font-semibold text-white mb-6">Settings</h2>

      <div className="space-y-6">
        {/* Dim Volume Level */}
        <div className="bg-gray-800 rounded-lg p-4">
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Dim Volume Level
          </label>
          <div className="flex items-center gap-4">
            <input
              type="range"
              min="0"
              max="100"
              value={dimLevel}
              onChange={handleDimLevelChange}
              className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
              data-testid="dim-level-slider"
            />
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                max="100"
                value={dimLevel}
                onChange={handleDimLevelChange}
                className="w-16 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                data-testid="dim-level-input"
              />
              <span className="text-gray-400">%</span>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Volume level when conversation is detected (0-100%)
          </p>
        </div>

        {/* Server URL */}
        <div className="bg-gray-800 rounded-lg p-4">
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Server URL
          </label>
          <input
            type="text"
            value={serverUrl}
            onChange={handleServerUrlChange}
            placeholder="ws://localhost:8080"
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            data-testid="server-url-input"
          />
          <p className="text-xs text-gray-500 mt-2">
            WebSocket server URL for audio processing
          </p>
        </div>

        {/* Audio Device Selection */}
        <div className="bg-gray-800 rounded-lg p-4">
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Audio Input Device
          </label>
          <select
            value={selectedDeviceId}
            onChange={handleDeviceChange}
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            data-testid="device-selector"
          >
            <option value="">Default Device</option>
            {state.audio.availableDevices
              .filter(device => device.kind === 'audioinput')
              .map(device => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || `Microphone ${device.deviceId.slice(0, 8)}`}
                </option>
              ))}
          </select>
          <p className="text-xs text-gray-500 mt-2">
            Select the microphone to use for audio capture
          </p>
          {state.audio.availableDevices.length === 0 && (
            <p className="text-xs text-yellow-500 mt-2">
              No audio devices found. Grant microphone permission to see available devices.
            </p>
          )}
        </div>

        {/* Save Button */}
        <div className="flex items-center justify-between pt-4">
          <div>
            {saveStatus === 'saved' && (
              <span className="text-green-400 text-sm">✓ Settings saved</span>
            )}
            {saveStatus === 'error' && (
              <span className="text-red-400 text-sm">Failed to save settings</span>
            )}
          </div>
          <button
            onClick={saveSettings}
            disabled={isSaving || !hasChanges}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              hasChanges
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : 'bg-gray-700 text-gray-400 cursor-not-allowed'
            }`}
            data-testid="save-settings-button"
          >
            {isSaving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default SettingsPanel
