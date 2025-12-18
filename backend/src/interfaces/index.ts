// Core interfaces for the conversational awareness backend
import { AudioBuffer } from '../types/audio';

export interface AudioProfile {
  id: string;
  name: string;
  voiceSignature: Float32Array; // Processed voice features
  createdAt: Date;
  lastUsed: Date;
  matchCount: number;
}

export interface Transcript {
  id: string;
  text: string;
  confidence: number;
  timestamp: Date;
  isPartial: boolean;
  audioSegmentId: string;
}

export interface VolumeAction {
  type: 'LOWER_VOLUME' | 'RESTORE_VOLUME';
  timestamp: Date;
  triggerReason: AttentionDecision;
  confidence: number;
}

export interface Configuration {
  sensitivityLevel: number; // 0.0 - 1.0
  attentionKeywords: string[];
  userName: string;
  silenceTimeoutMs: number;
  deepgramApiKey: string;
  llmEnabled: boolean;
}

export enum AttentionDecision {
  IGNORE = 'IGNORE',
  PROBABLY_TO_ME = 'PROBABLY_TO_ME',
  DEFINITELY_TO_ME = 'DEFINITELY_TO_ME'
}

export interface MatchResult {
  isMatch: boolean;
  confidence: number;
  profileId?: string;
}

// Service interfaces
export interface WebSocketManager {
  handleConnection(socket: WebSocket): void;
  processAudioChunk(chunk: AudioBuffer, clientId: string): void;
  sendVolumeAction(action: VolumeAction, clientId: string): void;
  broadcastTranscript(transcript: Transcript): void;
}

export interface VoiceProfileService {
  addProfile(audioSamples: AudioBuffer[], profileId: string): Promise<void>;
  removeProfile(profileId: string): Promise<boolean>;
  matchesIgnoreList(audioChunk: AudioBuffer): Promise<MatchResult>;
  listProfiles(): Promise<AudioProfile[]>;
}

export interface TranscriptionService {
  startStream(onPartialTranscript: (text: string) => void): Promise<void>;
  sendAudio(chunk: AudioBuffer): Promise<void>;
  onFinalTranscript(callback: (transcript: Transcript) => void): void;
  closeStream(): Promise<void>;
}

export interface AttentionDetectionEngine {
  analyzeTranscript(transcript: Transcript, sensitivity: number): Promise<AttentionDecision>;
  addKeyword(keyword: string): void;
  setUserName(name: string): void;
}

export interface ConfigurationManager {
  loadConfiguration(): Promise<Configuration>;
  saveConfiguration(config: Configuration): Promise<void>;
  updateSensitivity(level: number): Promise<void>;
  addKeyword(keyword: string): Promise<void>;
  setTimeout(timeoutMs: number): Promise<void>;
}

export interface VolumeActionDispatcher {
  dispatchAction(decision: AttentionDecision, sensitivity: number): Promise<void>;
  startSilenceTimer(): void;
  stopSilenceTimer(): void;
}