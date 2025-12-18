// Test setup and utilities
import * as fc from 'fast-check';
import { AudioBuffer, createAudioBuffer } from '../types/audio';

// Test data generators for property-based testing
export const audioBufferArbitrary = fc.array(fc.float(), { minLength: 1024, maxLength: 4096 })
  .map(data => {
    return createAudioBuffer(new Float32Array(data));
  });

export const transcriptArbitrary = fc.record({
  text: fc.string({ minLength: 1, maxLength: 500 }),
  confidence: fc.float({ min: 0, max: 1 }),
  isPartial: fc.boolean(),
  audioSegmentId: fc.uuid()
});

export const configurationArbitrary = fc.record({
  sensitivityLevel: fc.float({ min: 0, max: 1 }),
  attentionKeywords: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 10 }),
  userName: fc.string({ minLength: 1, maxLength: 50 }),
  silenceTimeoutMs: fc.integer({ min: 1000, max: 30000 }),
  deepgramApiKey: fc.string({ minLength: 10, maxLength: 100 }),
  llmEnabled: fc.boolean()
});

// Test utilities
export const delay = (ms: number): Promise<void> => 
  new Promise(resolve => setTimeout(resolve, ms));

export const mockWebSocket = () => ({
  send: jest.fn(),
  close: jest.fn(),
  readyState: 1, // OPEN
  addEventListener: jest.fn(),
  removeEventListener: jest.fn()
});

// Property test configuration
export const propertyTestConfig = {
  numRuns: 100,
  timeout: 5000
};