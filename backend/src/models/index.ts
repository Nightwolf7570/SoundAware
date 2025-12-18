// Data models for the conversational awareness backend
import { v4 as uuidv4 } from 'uuid';
import { AudioProfile, Transcript, VolumeAction, Configuration, AttentionDecision } from '../interfaces';

export class AudioProfileModel implements AudioProfile {
  public id: string;
  public name: string;
  public voiceSignature: Float32Array;
  public createdAt: Date;
  public lastUsed: Date;
  public matchCount: number;

  constructor(name: string, voiceSignature: Float32Array) {
    this.id = uuidv4();
    this.name = name;
    this.voiceSignature = voiceSignature;
    this.createdAt = new Date();
    this.lastUsed = new Date();
    this.matchCount = 0;
  }

  public updateLastUsed(): void {
    this.lastUsed = new Date();
    this.matchCount++;
  }

  public toJSON(): any {
    return {
      id: this.id,
      name: this.name,
      voiceSignature: Array.from(this.voiceSignature),
      createdAt: this.createdAt.toISOString(),
      lastUsed: this.lastUsed.toISOString(),
      matchCount: this.matchCount
    };
  }

  public static fromJSON(data: any): AudioProfileModel {
    const profile = new AudioProfileModel(data.name, new Float32Array(data.voiceSignature));
    profile.id = data.id;
    profile.createdAt = new Date(data.createdAt);
    profile.lastUsed = new Date(data.lastUsed);
    profile.matchCount = data.matchCount;
    return profile;
  }
}

export class TranscriptModel implements Transcript {
  public id: string;
  public text: string;
  public confidence: number;
  public timestamp: Date;
  public isPartial: boolean;
  public audioSegmentId: string;

  constructor(
    text: string,
    confidence: number,
    isPartial: boolean,
    audioSegmentId: string
  ) {
    this.id = uuidv4();
    this.text = text;
    this.confidence = confidence;
    this.timestamp = new Date();
    this.isPartial = isPartial;
    this.audioSegmentId = audioSegmentId;
  }

  public toJSON(): any {
    return {
      id: this.id,
      text: this.text,
      confidence: this.confidence,
      timestamp: this.timestamp.toISOString(),
      isPartial: this.isPartial,
      audioSegmentId: this.audioSegmentId
    };
  }

  public static fromJSON(data: any): TranscriptModel {
    const transcript = new TranscriptModel(
      data.text,
      data.confidence,
      data.isPartial,
      data.audioSegmentId
    );
    transcript.id = data.id;
    transcript.timestamp = new Date(data.timestamp);
    return transcript;
  }
}

export class VolumeActionModel implements VolumeAction {
  public type: 'LOWER_VOLUME' | 'RESTORE_VOLUME';
  public timestamp: Date;
  public triggerReason: AttentionDecision;
  public confidence: number;

  constructor(
    type: 'LOWER_VOLUME' | 'RESTORE_VOLUME',
    triggerReason: AttentionDecision,
    confidence: number
  ) {
    this.type = type;
    this.timestamp = new Date();
    this.triggerReason = triggerReason;
    this.confidence = confidence;
  }

  public toJSON(): any {
    return {
      type: this.type,
      timestamp: this.timestamp.toISOString(),
      triggerReason: this.triggerReason,
      confidence: this.confidence
    };
  }

  public static fromJSON(data: any): VolumeActionModel {
    const action = new VolumeActionModel(
      data.type,
      data.triggerReason,
      data.confidence
    );
    action.timestamp = new Date(data.timestamp);
    return action;
  }
}

export class ConfigurationModel implements Configuration {
  public sensitivityLevel: number;
  public attentionKeywords: string[];
  public userName: string;
  public silenceTimeoutMs: number;
  public deepgramApiKey: string;
  public llmEnabled: boolean;

  constructor() {
    // Default configuration
    this.sensitivityLevel = 0.7;
    this.attentionKeywords = ['hey', 'hello', 'excuse me'];
    this.userName = '';
    this.silenceTimeoutMs = 5000;
    this.deepgramApiKey = '';
    this.llmEnabled = false;
  }

  public toJSON(): any {
    return {
      sensitivityLevel: this.sensitivityLevel,
      attentionKeywords: [...this.attentionKeywords],
      userName: this.userName,
      silenceTimeoutMs: this.silenceTimeoutMs,
      deepgramApiKey: this.deepgramApiKey,
      llmEnabled: this.llmEnabled
    };
  }

  public static fromJSON(data: any): ConfigurationModel {
    const config = new ConfigurationModel();
    config.sensitivityLevel = data.sensitivityLevel ?? config.sensitivityLevel;
    config.attentionKeywords = data.attentionKeywords ?? config.attentionKeywords;
    config.userName = data.userName ?? config.userName;
    config.silenceTimeoutMs = data.silenceTimeoutMs ?? config.silenceTimeoutMs;
    config.deepgramApiKey = data.deepgramApiKey ?? config.deepgramApiKey;
    config.llmEnabled = data.llmEnabled ?? config.llmEnabled;
    return config;
  }

  public validate(): string[] {
    const errors: string[] = [];
    
    if (this.sensitivityLevel < 0 || this.sensitivityLevel > 1) {
      errors.push('Sensitivity level must be between 0 and 1');
    }
    
    if (this.silenceTimeoutMs < 1000) {
      errors.push('Silence timeout must be at least 1000ms');
    }
    
    if (!this.deepgramApiKey || this.deepgramApiKey.trim() === '') {
      errors.push('Deepgram API key is required');
    }
    
    return errors;
  }
}