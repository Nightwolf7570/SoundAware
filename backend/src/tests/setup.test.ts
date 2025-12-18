// Basic setup tests to verify TypeScript and testing framework
import { ConfigurationModel, TranscriptModel, AudioProfileModel, VolumeActionModel } from '../models';
import { AttentionDecision } from '../interfaces';
import * as fc from 'fast-check';
import { configurationArbitrary, transcriptArbitrary, propertyTestConfig } from './setup';

describe('Project Setup', () => {
  test('TypeScript compilation works', () => {
    expect(true).toBe(true);
  });

  test('Models can be instantiated', () => {
    const config = new ConfigurationModel();
    expect(config).toBeInstanceOf(ConfigurationModel);
    expect(config.sensitivityLevel).toBe(0.7);
    expect(config.attentionKeywords).toContain('hey');
  });

  test('JSON serialization works for models', () => {
    const config = new ConfigurationModel();
    const json = config.toJSON();
    const restored = ConfigurationModel.fromJSON(json);
    
    expect(restored.sensitivityLevel).toBe(config.sensitivityLevel);
    expect(restored.attentionKeywords).toEqual(config.attentionKeywords);
  });

  test('Fast-check property testing framework works', () => {
    fc.assert(
      fc.property(fc.integer(), (n) => {
        return n + 0 === n;
      }),
      propertyTestConfig
    );
  });

  test('Configuration validation works', () => {
    const config = new ConfigurationModel();
    config.sensitivityLevel = -1; // Invalid
    config.deepgramApiKey = ''; // Invalid
    
    const errors = config.validate();
    expect(errors).toContain('Sensitivity level must be between 0 and 1');
    expect(errors).toContain('Deepgram API key is required');
  });
});