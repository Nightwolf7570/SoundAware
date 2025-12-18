import { describe, it, expect, vi, beforeEach } from 'vitest'
import { VolumeController, resetVolumeControllerInstance } from './volume-controller'
import type { IOSAdapter } from './os-adapters/types'

/**
 * Mock OS adapter for testing
 */
function createMockAdapter(initialVolume: number = 100): IOSAdapter {
  let currentVolume = initialVolume
  
  return {
    platform: 'win32',
    getSystemVolume: vi.fn(async () => currentVolume),
    setSystemVolume: vi.fn(async (level: number) => {
      currentVolume = level
    }),
    isSupported: vi.fn(() => true)
  }
}

describe('VolumeController', () => {
  beforeEach(() => {
    resetVolumeControllerInstance()
    vi.clearAllMocks()
  })

  describe('getVolume', () => {
    it('should return the current system volume', async () => {
      const mockAdapter = createMockAdapter(75)
      const controller = new VolumeController(mockAdapter)

      const volume = await controller.getVolume()

      expect(volume).toBe(75)
      expect(mockAdapter.getSystemVolume).toHaveBeenCalled()
    })
  })

  describe('setVolume', () => {
    it('should set the system volume without smooth transition by default', async () => {
      const mockAdapter = createMockAdapter(50)
      const controller = new VolumeController(mockAdapter)

      await controller.setVolume(80)

      expect(mockAdapter.setSystemVolume).toHaveBeenCalledWith(80)
    })

    it('should clamp volume to 0-100 range', async () => {
      const mockAdapter = createMockAdapter(50)
      const controller = new VolumeController(mockAdapter)

      await controller.setVolume(150)
      expect(mockAdapter.setSystemVolume).toHaveBeenCalledWith(100)

      await controller.setVolume(-20)
      expect(mockAdapter.setSystemVolume).toHaveBeenCalledWith(0)
    })
  })


  describe('dimVolume', () => {
    it('should store previous volume and dim to target level', async () => {
      const mockAdapter = createMockAdapter(80)
      const controller = new VolumeController(mockAdapter, { transitionDuration: 0 })

      // Initialize current level
      await controller.getVolume()
      
      await controller.dimVolume(20)

      const status = controller.getStatus()
      expect(status.previousLevel).toBe(80)
      expect(status.currentLevel).toBe(20)
      expect(status.state).toBe('dimmed')
    })

    it('should update dim level if already dimmed', async () => {
      const mockAdapter = createMockAdapter(80)
      const controller = new VolumeController(mockAdapter, { transitionDuration: 0 })

      await controller.getVolume()
      await controller.dimVolume(20)
      await controller.dimVolume(10)

      const status = controller.getStatus()
      expect(status.previousLevel).toBe(80) // Should still be original
      expect(status.currentLevel).toBe(10)
      expect(status.state).toBe('dimmed')
    })
  })

  describe('restoreVolume', () => {
    it('should restore volume to previous level', async () => {
      const mockAdapter = createMockAdapter(80)
      const controller = new VolumeController(mockAdapter, { transitionDuration: 0 })

      await controller.getVolume()
      await controller.dimVolume(20)
      await controller.restoreVolume()

      const status = controller.getStatus()
      expect(status.currentLevel).toBe(80)
      expect(status.state).toBe('normal')
    })

    it('should do nothing if already in normal state', async () => {
      const mockAdapter = createMockAdapter(80)
      const controller = new VolumeController(mockAdapter, { transitionDuration: 0 })

      await controller.getVolume()
      await controller.restoreVolume()

      expect(mockAdapter.setSystemVolume).not.toHaveBeenCalled()
    })
  })

  describe('getStatus', () => {
    it('should return current volume status', async () => {
      const mockAdapter = createMockAdapter(100)
      const controller = new VolumeController(mockAdapter)

      const status = controller.getStatus()

      expect(status).toEqual({
        currentLevel: 100,
        previousLevel: 100,
        state: 'normal'
      })
    })
  })

  describe('smooth transitions', () => {
    it('should apply smooth transition when enabled', async () => {
      const mockAdapter = createMockAdapter(100)
      const controller = new VolumeController(mockAdapter, { transitionDuration: 50 })

      await controller.setVolume(50, true)

      // Should have been called multiple times for smooth transition
      expect(mockAdapter.setSystemVolume).toHaveBeenCalledTimes(10)
    })

    it('should skip transition when duration is 0', async () => {
      const mockAdapter = createMockAdapter(100)
      const controller = new VolumeController(mockAdapter, { transitionDuration: 0 })

      await controller.setVolume(50, true)

      // Should be called once directly
      expect(mockAdapter.setSystemVolume).toHaveBeenCalledTimes(1)
    })
  })
})
