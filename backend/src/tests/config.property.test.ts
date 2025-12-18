/**
 * Property-based tests for Configuration Manager
 * **Feature: conversational-awareness-backend**
 */
import * as fc from 'fast-check';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { ConfigurationManagerImpl } from '../services/ConfigurationManager';
import { TranscriptionServiceImpl } from '../services/TranscriptionService';
import { ConfigurationModel, TranscriptModel } from '../models';

describe('Configuration Manager Property Tests', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'config-test-'));
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true });
    } catch {}
  });

  /**
   * **Feature: conversational-awareness-backend, Property 21: Configuration Persistence**
   * *For any* Sensitivity_Level update, the new value should be persisted 
   * and applied to subsequent detections
   * **Validates: Requirements 6.1**
   */
  test('Property 21: Sensitivity level persists across reloads', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.float({ min: Math.fround(0.0), max: Math.fround(1.0), noNaN: true }),
        async (sensitivity) => {
          const configManager = new ConfigurationManagerImpl(tempDir);
          await configManager.loadConfiguration();
          
          await configManager.updateSensitivity(sensitivity);
          
          // Create new manager and reload
          const configManager2 = new ConfigurationManagerImpl(tempDir);
          const loaded = await configManager2.loadConfiguration();
          
          expect(loaded.sensitivityLevel).toBeCloseTo(sensitivity, 5);
          return true;
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * **Feature: conversational-awareness-backend, Property 22: Keyword Configuration**
   * *For any* attention keywords configured by user, they should be added 
   * to the detection ruleset and used in subsequent analysis
   * **Validates: Requirements 6.2**
   */
  test('Property 22: Keywords persist and are retrievable', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.stringMatching(/^[a-z]{2,15}$/), { minLength: 1, maxLength: 5 }),
        async (keywords) => {
          const configManager = new ConfigurationManagerImpl(tempDir);
          await configManager.loadConfiguration();
          
          // Add keywords (filter out any empty after trim)
          const validKeywords = keywords.filter(k => k.trim().length > 0);
          for (const keyword of validKeywords) {
            await configManager.addKeyword(keyword);
          }
          
          // Reload and verify
          const configManager2 = new ConfigurationManagerImpl(tempDir);
          const loaded = await configManager2.loadConfiguration();
          
          // All keywords should be present (normalized to lowercase)
          for (const keyword of validKeywords) {
            expect(loaded.attentionKeywords).toContain(keyword.toLowerCase().trim());
          }
          
          return true;
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * **Feature: conversational-awareness-backend, Property 23: Timeout Configuration**
   * *For any* silence timeout duration set by user, the new value should be 
   * used for RESTORE_VOLUME timing
   * **Validates: Requirements 6.3**
   */
  test('Property 23: Timeout configuration persists', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1000, max: 30000 }),
        async (timeout) => {
          const configManager = new ConfigurationManagerImpl(tempDir);
          await configManager.loadConfiguration();
          
          await configManager.setTimeout(timeout);
          
          // Reload and verify
          const configManager2 = new ConfigurationManagerImpl(tempDir);
          const loaded = await configManager2.loadConfiguration();
          
          expect(loaded.silenceTimeoutMs).toBe(timeout);
          return true;
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * **Feature: conversational-awareness-backend, Property 24: Startup Configuration Loading**
   * *For any* backend startup, persisted configuration should be loaded 
   * or default values should be applied
   * **Validates: Requirements 6.4**
   */
  test('Property 24: Defaults applied when no config exists', async () => {
    const configManager = new ConfigurationManagerImpl(tempDir);
    const config = await configManager.loadConfiguration();
    
    // Should have default values
    expect(config.sensitivityLevel).toBe(0.7);
    expect(config.attentionKeywords).toContain('hey');
    expect(config.attentionKeywords).toContain('hello');
    expect(config.silenceTimeoutMs).toBe(5000);
  });

  /**
   * **Feature: conversational-awareness-backend, Property 25: Configuration Serialization Round Trip**
   * *For any* valid Configuration object, serializing to JSON then deserializing 
   * should produce an equivalent Configuration with all required fields validated
   * **Validates: Requirements 6.5, 6.6**
   */
  test('Property 25: Configuration round-trip serialization', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          sensitivityLevel: fc.float({ min: Math.fround(0.0), max: Math.fround(1.0), noNaN: true }),
          attentionKeywords: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 5 }),
          userName: fc.string({ minLength: 0, maxLength: 50 }),
          silenceTimeoutMs: fc.integer({ min: 1000, max: 30000 }),
          deepgramApiKey: fc.string({ minLength: 10, maxLength: 50 }),
          llmEnabled: fc.boolean()
        }),
        async (configData) => {
          // Serialize
          const serialized = ConfigurationManagerImpl.serializeConfiguration(configData);
          
          // Deserialize
          const deserialized = ConfigurationManagerImpl.deserializeConfiguration(serialized);
          
          // Verify all fields match
          expect(deserialized.sensitivityLevel).toBeCloseTo(configData.sensitivityLevel, 5);
          expect(deserialized.attentionKeywords).toEqual(configData.attentionKeywords);
          expect(deserialized.userName).toBe(configData.userName);
          expect(deserialized.silenceTimeoutMs).toBe(configData.silenceTimeoutMs);
          expect(deserialized.deepgramApiKey).toBe(configData.deepgramApiKey);
          expect(deserialized.llmEnabled).toBe(configData.llmEnabled);
          
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Feature: conversational-awareness-backend, Property 13: Transcript Serialization Round Trip**
   * *For any* valid Transcript object, serializing to JSON then deserializing 
   * should produce an equivalent Transcript with all original fields
   * **Validates: Requirements 3.5, 3.6**
   */
  test('Property 13: Transcript round-trip serialization', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          text: fc.string({ minLength: 1, maxLength: 500 }),
          confidence: fc.float({ min: Math.fround(0.0), max: Math.fround(1.0), noNaN: true }),
          isPartial: fc.boolean(),
          audioSegmentId: fc.uuid()
        }),
        async (transcriptData) => {
          const transcript = new TranscriptModel(
            transcriptData.text,
            transcriptData.confidence,
            transcriptData.isPartial,
            transcriptData.audioSegmentId
          );
          
          // Serialize
          const serialized = TranscriptionServiceImpl.serializeTranscript(transcript);
          
          // Deserialize
          const deserialized = TranscriptionServiceImpl.deserializeTranscript(serialized);
          
          // Verify all fields match
          expect(deserialized.text).toBe(transcript.text);
          expect(deserialized.confidence).toBeCloseTo(transcript.confidence, 5);
          expect(deserialized.isPartial).toBe(transcript.isPartial);
          expect(deserialized.audioSegmentId).toBe(transcript.audioSegmentId);
          expect(deserialized.id).toBe(transcript.id);
          
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });
});