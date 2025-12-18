// Voice Profile Service - manages ignore list and voice matching
import { EventEmitter } from 'events';
import { VoiceProfileService as IVoiceProfileService, AudioProfile, MatchResult } from '../interfaces';
import { AudioBuffer, readAudioBuffer } from '../types/audio';
import { AudioProfileModel } from '../models';

export class VoiceProfileServiceImpl extends EventEmitter implements IVoiceProfileService {
  private profiles: Map<string, AudioProfileModel> = new Map();
  private sensitivityLevel: number = 0.7;

  constructor() {
    super();
  }

  public setSensitivityLevel(level: number): void {
    if (level < 0 || level > 1) {
      throw new Error('Sensitivity level must be between 0 and 1');
    }
    this.sensitivityLevel = level;
  }

  public getSensitivityLevel(): number {
    return this.sensitivityLevel;
  }

  public async addProfile(audioSamples: AudioBuffer[], profileId: string, name?: string): Promise<void> {
    if (audioSamples.length === 0) {
      throw new Error('At least one audio sample is required');
    }

    // Extract voice signature from audio samples
    const voiceSignature = this.extractVoiceSignature(audioSamples);
    
    const profile = new AudioProfileModel(name || `Profile ${profileId}`, voiceSignature);
    // Override the auto-generated ID with the provided one
    (profile as any).id = profileId;
    
    this.profiles.set(profileId, profile);
    
    this.emit('profile_added', { profileId, name: profile.name });
  }

  public async removeProfile(profileId: string): Promise<boolean> {
    const existed = this.profiles.has(profileId);
    
    if (existed) {
      this.profiles.delete(profileId);
      this.emit('profile_removed', { profileId });
    }
    
    return existed;
  }

  public async matchesIgnoreList(audioChunk: AudioBuffer): Promise<MatchResult> {
    if (this.profiles.size === 0) {
      return { isMatch: false, confidence: 0 };
    }

    // Extract features from the audio chunk
    const chunkFeatures = this.extractFeatures(audioChunk);
    
    let bestMatch: MatchResult = { isMatch: false, confidence: 0 };
    
    for (const [profileId, profile] of this.profiles) {
      const similarity = this.calculateSimilarity(chunkFeatures, profile.voiceSignature);
      
      if (similarity > bestMatch.confidence) {
        bestMatch = {
          isMatch: similarity >= this.sensitivityLevel,
          confidence: similarity,
          profileId: similarity >= this.sensitivityLevel ? profileId : undefined
        };
      }
    }

    // Update profile usage stats if matched
    if (bestMatch.isMatch && bestMatch.profileId) {
      const profile = this.profiles.get(bestMatch.profileId);
      if (profile) {
        profile.updateLastUsed();
      }
      this.emit('profile_matched', { profileId: bestMatch.profileId, confidence: bestMatch.confidence });
    }

    return bestMatch;
  }

  public async listProfiles(): Promise<AudioProfile[]> {
    return Array.from(this.profiles.values()).map(profile => ({
      id: profile.id,
      name: profile.name,
      voiceSignature: profile.voiceSignature,
      createdAt: profile.createdAt,
      lastUsed: profile.lastUsed,
      matchCount: profile.matchCount
    }));
  }

  public async getProfile(profileId: string): Promise<AudioProfile | undefined> {
    return this.profiles.get(profileId);
  }

  public async updateProfileName(profileId: string, name: string): Promise<boolean> {
    const profile = this.profiles.get(profileId);
    if (!profile) return false;
    
    profile.name = name;
    this.emit('profile_updated', { profileId, name });
    return true;
  }

  public getProfileCount(): number {
    return this.profiles.size;
  }

  // Voice signature extraction from multiple audio samples
  private extractVoiceSignature(audioSamples: AudioBuffer[]): Float32Array {
    // Combine features from all samples to create a robust voice signature
    const allFeatures: Float32Array[] = audioSamples.map(sample => this.extractFeatures(sample));
    
    // Average the features across all samples
    const signatureLength = 128; // Standard feature vector length
    const signature = new Float32Array(signatureLength);
    
    for (const features of allFeatures) {
      for (let i = 0; i < Math.min(features.length, signatureLength); i++) {
        signature[i] += features[i] / allFeatures.length;
      }
    }
    
    // Normalize the signature
    const magnitude = Math.sqrt(signature.reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 0) {
      for (let i = 0; i < signature.length; i++) {
        signature[i] /= magnitude;
      }
    }
    
    return signature;
  }

  // Extract audio features from a single buffer
  private extractFeatures(audioBuffer: AudioBuffer): Float32Array {
    const audioData = readAudioBuffer(audioBuffer);
    const featureLength = 128;
    const features = new Float32Array(featureLength);
    
    if (audioData.length === 0) {
      return features;
    }

    // Simple feature extraction based on audio statistics
    // In production, this would use MFCC or similar audio fingerprinting
    
    // 1. Energy-based features (first 32 features)
    const frameSize = Math.floor(audioData.length / 32);
    for (let i = 0; i < 32; i++) {
      const start = i * frameSize;
      const end = Math.min(start + frameSize, audioData.length);
      let energy = 0;
      for (let j = start; j < end; j++) {
        energy += audioData[j] * audioData[j];
      }
      features[i] = Math.sqrt(energy / (end - start));
    }

    // 2. Zero-crossing rate features (next 32 features)
    const zcFrameSize = Math.floor(audioData.length / 32);
    for (let i = 0; i < 32; i++) {
      const start = i * zcFrameSize;
      const end = Math.min(start + zcFrameSize, audioData.length);
      let zeroCrossings = 0;
      for (let j = start + 1; j < end; j++) {
        if ((audioData[j] >= 0) !== (audioData[j - 1] >= 0)) {
          zeroCrossings++;
        }
      }
      features[32 + i] = zeroCrossings / (end - start);
    }

    // 3. Spectral centroid approximation (next 32 features)
    for (let i = 0; i < 32; i++) {
      const start = i * frameSize;
      const end = Math.min(start + frameSize, audioData.length);
      let weightedSum = 0;
      let sum = 0;
      for (let j = start; j < end; j++) {
        const magnitude = Math.abs(audioData[j]);
        weightedSum += (j - start) * magnitude;
        sum += magnitude;
      }
      features[64 + i] = sum > 0 ? weightedSum / sum : 0;
    }

    // 4. Statistical features (last 32 features)
    const mean = audioData.reduce((a, b) => a + b, 0) / audioData.length;
    const variance = audioData.reduce((sum, val) => sum + (val - mean) ** 2, 0) / audioData.length;
    const stdDev = Math.sqrt(variance);
    
    features[96] = mean;
    features[97] = stdDev;
    features[98] = Math.max(...audioData);
    features[99] = Math.min(...audioData);
    
    // Fill remaining with derived statistics
    for (let i = 100; i < 128; i++) {
      features[i] = features[i - 100] * features[i - 64];
    }

    return features;
  }

  // Calculate cosine similarity between two feature vectors
  private calculateSimilarity(features1: Float32Array, features2: Float32Array): number {
    const length = Math.min(features1.length, features2.length);
    
    let dotProduct = 0;
    let magnitude1 = 0;
    let magnitude2 = 0;
    
    for (let i = 0; i < length; i++) {
      dotProduct += features1[i] * features2[i];
      magnitude1 += features1[i] * features1[i];
      magnitude2 += features2[i] * features2[i];
    }
    
    magnitude1 = Math.sqrt(magnitude1);
    magnitude2 = Math.sqrt(magnitude2);
    
    if (magnitude1 === 0 || magnitude2 === 0) {
      return 0;
    }
    
    // Return similarity as a value between 0 and 1
    return Math.max(0, Math.min(1, (dotProduct / (magnitude1 * magnitude2) + 1) / 2));
  }

  // Serialize profiles for persistence
  public toJSON(): any {
    const profiles: any[] = [];
    for (const profile of this.profiles.values()) {
      profiles.push(profile.toJSON());
    }
    return { profiles, sensitivityLevel: this.sensitivityLevel };
  }

  // Load profiles from persisted data
  public fromJSON(data: any): void {
    this.profiles.clear();
    
    if (data.profiles && Array.isArray(data.profiles)) {
      for (const profileData of data.profiles) {
        const profile = AudioProfileModel.fromJSON(profileData);
        this.profiles.set(profile.id, profile);
      }
    }
    
    if (typeof data.sensitivityLevel === 'number') {
      this.sensitivityLevel = data.sensitivityLevel;
    }
  }
}