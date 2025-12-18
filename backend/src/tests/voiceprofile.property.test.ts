/**
 * Property-based tests for Voice Profile Service
 * **Feature: conversational-awareness-backend**
 */
import * as fc from 'fast-check';
import { VoiceProfileServiceImpl } from '../services/VoiceProfileService';
import { createAudioBuffer } from '../types/audio';

describe('Voice Profile Service Property Tests', () => {
  let voiceProfileService: VoiceProfileServiceImpl;

  beforeEach(() => {
    voiceProfileService = new VoiceProfileServiceImpl();
  });

  /**
   * **Feature: conversational-awareness-backend, Property 5: Audio Profile Creation**
   * *For any* valid audio samples submitted for profile creation, an Audio_Profile 
   * should be created and stored in the Ignore_List
   * **Validates: Requirements 2.1**
   */
  test('Property 5: Audio profile creation stores profile in ignore list', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.array(
          fc.float32Array({ minLength: 100, maxLength: 500 }),
          { minLength: 1, maxLength: 3 }
        ),
        async (profileId, audioSamples) => {
          const buffers = audioSamples.map(arr => createAudioBuffer(arr));
          
          await voiceProfileService.addProfile(buffers, profileId, `Profile ${profileId}`);
          
          const profiles = await voiceProfileService.listProfiles();
          const createdProfile = profiles.find(p => p.id === profileId);
          
          expect(createdProfile).toBeDefined();
          expect(createdProfile!.name).toBe(`Profile ${profileId}`);
          expect(createdProfile!.voiceSignature).toBeDefined();
          expect(createdProfile!.voiceSignature.length).toBeGreaterThan(0);
          
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Feature: conversational-awareness-backend, Property 6: Ignore List Processing**
   * *For any* Speech_Segment, if it matches an Audio_Profile in the Ignore_List 
   * with confidence above the Sensitivity_Level, transcription should be skipped 
   * and IGNORE decision returned
   * **Validates: Requirements 2.2, 2.3**
   */
  test('Property 6: Ignore list processing with sensitivity threshold', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.float({ min: Math.fround(0.1), max: Math.fround(0.9), noNaN: true }),
        fc.array(fc.float({ min: Math.fround(-1), max: Math.fround(1), noNaN: true }), { minLength: 200, maxLength: 500 }),
        async (sensitivity, audioDataArray) => {
          const service = new VoiceProfileServiceImpl();
          service.setSensitivityLevel(sensitivity);
          
          // Create audio data with some non-zero values
          const audioData = new Float32Array(audioDataArray);
          
          // Create a profile from the audio
          const buffer = createAudioBuffer(audioData);
          await service.addProfile([buffer], 'test-profile');
          
          // Check if the same audio matches
          const result = await service.matchesIgnoreList(buffer);
          
          // Confidence should be defined
          expect(result.confidence).toBeGreaterThanOrEqual(0);
          expect(result.confidence).toBeLessThanOrEqual(1);
          
          // If confidence >= sensitivity, should be a match
          if (result.confidence >= sensitivity) {
            expect(result.isMatch).toBe(true);
            expect(result.profileId).toBe('test-profile');
          } else {
            expect(result.isMatch).toBe(false);
          }
          
          return true;
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * **Feature: conversational-awareness-backend, Property 7: Profile Management Operations**
   * *For any* Audio_Profile deletion request, the profile should be removed 
   * from the Ignore_List and deletion should be confirmed
   * **Validates: Requirements 2.4**
   */
  test('Property 7: Profile deletion removes from ignore list', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 5 }),
        async (profileIds) => {
          // Create profiles
          for (const id of profileIds) {
            const buffer = createAudioBuffer(new Float32Array(200).fill(Math.random()));
            await voiceProfileService.addProfile([buffer], id);
          }
          
          // Verify all created
          let profiles = await voiceProfileService.listProfiles();
          expect(profiles.length).toBe(profileIds.length);
          
          // Delete each profile
          for (const id of profileIds) {
            const deleted = await voiceProfileService.removeProfile(id);
            expect(deleted).toBe(true);
          }
          
          // Verify all deleted
          profiles = await voiceProfileService.listProfiles();
          expect(profiles.length).toBe(0);
          
          // Deleting again should return false
          for (const id of profileIds) {
            const deleted = await voiceProfileService.removeProfile(id);
            expect(deleted).toBe(false);
          }
          
          return true;
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * **Feature: conversational-awareness-backend, Property 8: Profile List Retrieval**
   * *For any* request for Audio_Profiles list, all stored profiles with their 
   * identifiers and metadata should be returned
   * **Validates: Requirements 2.5**
   */
  test('Property 8: Profile list retrieval returns all profiles with metadata', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc.hexaString({ minLength: 5, maxLength: 10 }),
            name: fc.string({ minLength: 1, maxLength: 50 })
          }),
          { minLength: 1, maxLength: 5 }
        ),
        async (profileData) => {
          // Fresh service for each test
          const service = new VoiceProfileServiceImpl();
          
          // Create profiles with unique IDs
          const uniqueProfiles = profileData.filter((p, i, arr) => 
            arr.findIndex(x => x.id === p.id) === i
          );
          
          for (const { id, name } of uniqueProfiles) {
            const buffer = createAudioBuffer(new Float32Array(200).fill(Math.random()));
            await service.addProfile([buffer], id, name);
          }
          
          // Retrieve all profiles
          const profiles = await service.listProfiles();
          
          // Should have all profiles
          expect(profiles.length).toBe(uniqueProfiles.length);
          
          // Each profile should have required metadata
          for (const profile of profiles) {
            expect(profile.id).toBeDefined();
            expect(profile.name).toBeDefined();
            expect(profile.voiceSignature).toBeDefined();
            expect(profile.createdAt).toBeInstanceOf(Date);
            expect(profile.lastUsed).toBeInstanceOf(Date);
            expect(typeof profile.matchCount).toBe('number');
          }
          
          return true;
        }
      ),
      { numRuns: 20 }
    );
  });
});