import { useState, useCallback, useRef, useEffect } from 'react'

/**
 * Configuration for audio capture
 */
export interface AudioCaptureConfig {
  deviceId: string
  sampleRate?: number      // Default: 16000 Hz
  channelCount?: number    // Default: 1 (mono)
  bufferSize?: number      // Default: 4096 samples
}

/**
 * State of the audio capture module
 */
export interface AudioCaptureState {
  isCapturing: boolean
  currentDevice: MediaDeviceInfo | null
  audioLevel: number       // 0-100 normalized level
  error: string | null
  availableDevices: MediaDeviceInfo[]
}

/**
 * Return type for the useAudioCapture hook
 */
export interface UseAudioCaptureReturn {
  state: AudioCaptureState
  startCapture: (config: AudioCaptureConfig) => Promise<void>
  stopCapture: () => void
  getDevices: () => Promise<MediaDeviceInfo[]>
  onAudioData: (callback: (data: Float32Array) => void) => void
}

const DEFAULT_SAMPLE_RATE = 16000
const DEFAULT_CHANNEL_COUNT = 1
const DEFAULT_BUFFER_SIZE = 4096

/**
 * Calculate RMS (Root Mean Square) audio level from audio samples
 * Returns a normalized value between 0-100
 */
export function calculateAudioLevel(samples: Float32Array): number {
  if (samples.length === 0) return 0
  
  let sum = 0
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] * samples[i]
  }
  const rms = Math.sqrt(sum / samples.length)
  
  // Convert to 0-100 scale (RMS typically ranges 0-1 for normalized audio)
  // Apply some amplification for better visual feedback
  const level = Math.min(100, Math.round(rms * 300))
  return level
}

/**
 * Custom hook for capturing audio from microphone using Web Audio API
 * 
 * Requirements covered:
 * - 1.1: Begin capturing raw audio from selected microphone when permission granted
 * - 1.2: Continuously stream audio data in real-time
 * - 1.3: Display clear error message when microphone access is denied
 * - 1.4: Allow user to select desired microphone device
 */
export function useAudioCapture(): UseAudioCaptureReturn {
  const [state, setState] = useState<AudioCaptureState>({
    isCapturing: false,
    currentDevice: null,
    audioLevel: 0,
    error: null,
    availableDevices: []
  })

  // Refs to hold audio resources for cleanup
  const audioContextRef = useRef<AudioContext | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const audioDataCallbackRef = useRef<((data: Float32Array) => void) | null>(null)
  const animationFrameRef = useRef<number | null>(null)

  /**
   * Get list of available audio input devices
   */
  const getDevices = useCallback(async (): Promise<MediaDeviceInfo[]> => {
    try {
      // Request permission first to get device labels
      await navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
          // Stop the stream immediately, we just needed permission
          stream.getTracks().forEach(track => track.stop())
        })
        .catch(() => {
          // Permission denied, but we can still enumerate devices (without labels)
        })

      const devices = await navigator.mediaDevices.enumerateDevices()
      const audioInputDevices = devices.filter(device => device.kind === 'audioinput')
      
      setState(prev => ({ ...prev, availableDevices: audioInputDevices }))
      return audioInputDevices
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to enumerate devices'
      setState(prev => ({ ...prev, error: errorMessage }))
      return []
    }
  }, [])

  /**
   * Start capturing audio from the specified device
   */
  const startCapture = useCallback(async (config: AudioCaptureConfig): Promise<void> => {
    // Clear any previous error
    setState(prev => ({ ...prev, error: null }))

    try {
      // Request microphone access with specified device
      const constraints: MediaStreamConstraints = {
        audio: {
          deviceId: config.deviceId ? { exact: config.deviceId } : undefined,
          sampleRate: config.sampleRate || DEFAULT_SAMPLE_RATE,
          channelCount: config.channelCount || DEFAULT_CHANNEL_COUNT,
          echoCancellation: true,
          noiseSuppression: true
        }
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      mediaStreamRef.current = stream

      // Get the actual device info
      const audioTrack = stream.getAudioTracks()[0]
      const settings = audioTrack.getSettings()
      
      // Find the device info for the current device
      const devices = await navigator.mediaDevices.enumerateDevices()
      const currentDevice = devices.find(
        d => d.kind === 'audioinput' && d.deviceId === settings.deviceId
      ) || null

      // Create audio context
      const audioContext = new AudioContext({
        sampleRate: config.sampleRate || DEFAULT_SAMPLE_RATE
      })
      audioContextRef.current = audioContext

      // Create source from stream
      const source = audioContext.createMediaStreamSource(stream)

      // Create analyser for audio level monitoring
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 2048
      analyserRef.current = analyser

      // Create script processor for raw audio data
      const bufferSize = config.bufferSize || DEFAULT_BUFFER_SIZE
      const processor = audioContext.createScriptProcessor(bufferSize, 1, 1)
      processorRef.current = processor

      // Connect nodes: source -> analyser -> processor -> destination
      source.connect(analyser)
      analyser.connect(processor)
      processor.connect(audioContext.destination)

      // Handle audio data
      processor.onaudioprocess = (event) => {
        const inputData = event.inputBuffer.getChannelData(0)
        const audioData = new Float32Array(inputData)
        
        // Call the registered callback with audio data
        if (audioDataCallbackRef.current) {
          audioDataCallbackRef.current(audioData)
        }
      }

      // Start audio level monitoring
      const updateAudioLevel = () => {
        if (analyserRef.current) {
          const dataArray = new Float32Array(analyserRef.current.fftSize)
          analyserRef.current.getFloatTimeDomainData(dataArray)
          const level = calculateAudioLevel(dataArray)
          setState(prev => ({ ...prev, audioLevel: level }))
        }
        animationFrameRef.current = requestAnimationFrame(updateAudioLevel)
      }
      updateAudioLevel()

      // Update state
      setState(prev => ({
        ...prev,
        isCapturing: true,
        currentDevice,
        error: null,
        availableDevices: devices.filter(d => d.kind === 'audioinput')
      }))

    } catch (err) {
      let errorMessage: string
      
      if (err instanceof DOMException) {
        switch (err.name) {
          case 'NotAllowedError':
            errorMessage = 'Microphone access required. Please grant permission in system settings.'
            break
          case 'NotFoundError':
            errorMessage = 'Selected microphone not found. Please select another device.'
            break
          case 'NotReadableError':
            errorMessage = 'Microphone is in use by another application.'
            break
          default:
            errorMessage = `Microphone error: ${err.message}`
        }
      } else {
        errorMessage = err instanceof Error ? err.message : 'Failed to start audio capture'
      }

      setState(prev => ({
        ...prev,
        isCapturing: false,
        currentDevice: null,
        audioLevel: 0,
        error: errorMessage
      }))
      
      throw new Error(errorMessage)
    }
  }, [])

  /**
   * Stop audio capture and clean up resources
   */
  const stopCapture = useCallback(() => {
    // Cancel animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }

    // Disconnect and clean up processor
    if (processorRef.current) {
      processorRef.current.disconnect()
      processorRef.current.onaudioprocess = null
      processorRef.current = null
    }

    // Clean up analyser
    if (analyserRef.current) {
      analyserRef.current.disconnect()
      analyserRef.current = null
    }

    // Close audio context
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }

    // Stop media stream tracks
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop())
      mediaStreamRef.current = null
    }

    // Update state
    setState(prev => ({
      ...prev,
      isCapturing: false,
      currentDevice: null,
      audioLevel: 0
    }))
  }, [])

  /**
   * Register callback for receiving audio data
   */
  const onAudioData = useCallback((callback: (data: Float32Array) => void) => {
    audioDataCallbackRef.current = callback
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCapture()
    }
  }, [stopCapture])

  // Listen for device changes
  useEffect(() => {
    const handleDeviceChange = async () => {
      const devices = await navigator.mediaDevices.enumerateDevices()
      const audioInputDevices = devices.filter(d => d.kind === 'audioinput')
      setState(prev => ({ ...prev, availableDevices: audioInputDevices }))
    }

    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange)
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange)
    }
  }, [])

  return {
    state,
    startCapture,
    stopCapture,
    getDevices,
    onAudioData
  }
}
