# Design Document: Conversational Awareness Backend

## Overview

The Conversational Awareness Backend is a Node.js/TypeScript service that processes real-time audio streams to detect when someone is speaking to the user. The system uses a multi-stage pipeline: WebSocket audio reception → voice profile filtering → Deepgram transcription → attention detection → volume action commands. The architecture prioritizes low latency (~500ms total) and graceful degradation when external services are unavailable.

## Architecture

The system follows a modular, event-driven architecture with clear separation of concerns:

```
Frontend (Electron) 
    ↓ WebSocket Audio Stream
WebSocket Handler
    ↓ Audio Chunks
Voice Profile Matcher
    ↓ Non-ignored Audio
Deepgram Transcription Service
    ↓ Live Transcripts
Attention Detection Engine
    ↓ Attention Decisions
Volume Action Dispatcher
    ↓ Volume Commands
Frontend (Electron)
```

### Core Components

1. **WebSocket Manager** - Handles client connections and audio streaming
2. **Voice Profile Service** - Manages ignore list and voice matching
3. **Transcription Service** - Interfaces with Deepgram API
4. **Attention Detection Engine** - Rule-based + optional LLM analysis
5. **Configuration Manager** - Persists user settings
6. **Volume Action Dispatcher** - Sends commands back to frontend

## Components and Interfaces

### WebSocket Manager
```typescript
interface WebSocketManager {
  handleConnection(socket: WebSocket): void;
  processAudioChunk(chunk: AudioBuffer, clientId: string): void;
  sendVolumeAction(action: VolumeAction, clientId: string): void;
  broadcastTranscript(transcript: Transcript): void;
}
```

### Voice Profile Service
```typescript
interface VoiceProfileService {
  addProfile(audioSamples: AudioBuffer[], profileId: string): Promise<void>;
  removeProfile(profileId: string): Promise<boolean>;
  matchesIgnoreList(audioChunk: AudioBuffer): Promise<MatchResult>;
  listProfiles(): Promise<AudioProfile[]>;
}

interface MatchResult {
  isMatch: boolean;
  confidence: number;
  profileId?: string;
}
```

### Transcription Service
```typescript
interface TranscriptionService {
  startStream(onPartialTranscript: (text: string) => void): Promise<void>;
  sendAudio(chunk: AudioBuffer): Promise<void>;
  onFinalTranscript(callback: (transcript: Transcript) => void): void;
  closeStream(): Promise<void>;
}
```

### Attention Detection Engine
```typescript
interface AttentionDetectionEngine {
  analyzeTranscript(transcript: Transcript, sensitivity: number): Promise<AttentionDecision>;
  addKeyword(keyword: string): void;
  setUserName(name: string): void;
}

enum AttentionDecision {
  IGNORE = 'IGNORE',
  PROBABLY_TO_ME = 'PROBABLY_TO_ME',
  DEFINITELY_TO_ME = 'DEFINITELY_TO_ME'
}
```

## Data Models

### Audio Profile
```typescript
interface AudioProfile {
  id: string;
  name: string;
  voiceSignature: Float32Array; // Processed voice features
  createdAt: Date;
  lastUsed: Date;
  matchCount: number;
}
```

### Transcript
```typescript
interface Transcript {
  id: string;
  text: string;
  confidence: number;
  timestamp: Date;
  isPartial: boolean;
  audioSegmentId: string;
}
```

### Volume Action
```typescript
interface VolumeAction {
  type: 'LOWER_VOLUME' | 'RESTORE_VOLUME';
  timestamp: Date;
  triggerReason: AttentionDecision;
  confidence: number;
}
```

### Configuration
```typescript
interface Configuration {
  sensitivityLevel: number; // 0.0 - 1.0
  attentionKeywords: string[];
  userName: string;
  silenceTimeoutMs: number;
  deepgramApiKey: string;
  llmEnabled: boolean;
}
```
## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

After analyzing the acceptance criteria, several properties can be consolidated to eliminate redundancy:

**Property Reflection:**
- Properties 3.5 and 3.6 (Transcript serialization/deserialization) can be combined into a single round-trip property
- Properties 6.5 and 6.6 (Configuration serialization/deserialization) can be combined into a single round-trip property
- Properties 2.2 and 2.3 can be combined into a comprehensive ignore list processing property
- Properties 4.1, 4.2, and 4.3 can be combined into a comprehensive attention detection property

**Property 1: WebSocket Connection Response Time**
*For any* frontend client connection request, the backend should establish the WebSocket connection and send acknowledgment within 500 milliseconds
**Validates: Requirements 1.1**

**Property 2: Audio Chunk Processing Integrity**
*For any* sequence of audio chunks sent over WebSocket, all chunks should be buffered and processed without loss under normal network conditions
**Validates: Requirements 1.2**

**Property 3: Connection Cleanup**
*For any* WebSocket connection that gets interrupted, all associated resources should be cleaned up and a disconnection event should be logged
**Validates: Requirements 1.3**

**Property 4: Heartbeat Detection Timing**
*For any* active WebSocket connection, stale connections should be detected within 30 seconds when heartbeat stops
**Validates: Requirements 1.4**

**Property 5: Audio Profile Creation**
*For any* valid audio samples submitted for profile creation, an Audio_Profile should be created and stored in the Ignore_List
**Validates: Requirements 2.1**

**Property 6: Ignore List Processing**
*For any* Speech_Segment, if it matches an Audio_Profile in the Ignore_List with confidence above the Sensitivity_Level, transcription should be skipped and IGNORE decision returned
**Validates: Requirements 2.2, 2.3**

**Property 7: Profile Management Operations**
*For any* Audio_Profile deletion request, the profile should be removed from the Ignore_List and deletion should be confirmed
**Validates: Requirements 2.4**

**Property 8: Profile List Retrieval**
*For any* request for Audio_Profiles list, all stored profiles with their identifiers and metadata should be returned
**Validates: Requirements 2.5**

**Property 9: Deepgram Streaming**
*For any* Speech_Segment that passes the Ignore_List check, the audio should be streamed to Deepgram_API via WebSocket
**Validates: Requirements 3.1**

**Property 10: Transcript Forwarding**
*For any* partial transcript returned by Deepgram_API, it should be forwarded to the frontend for live display
**Validates: Requirements 3.2**

**Property 11: Final Transcript Processing**
*For any* final transcript returned by Deepgram_API, it should be passed to the attention detection module
**Validates: Requirements 3.3**

**Property 12: Deepgram Error Recovery**
*For any* error returned by Deepgram_API, the error should be logged and processing should continue with subsequent Speech_Segments
**Validates: Requirements 3.4**

**Property 13: Transcript Serialization Round Trip**
*For any* valid Transcript object, serializing to JSON then deserializing should produce an equivalent Transcript with all original fields
**Validates: Requirements 3.5, 3.6**

**Property 14: Attention Detection Logic**
*For any* Transcript, the attention decision should be DEFINITELY_TO_ME for attention keywords, PROBABLY_TO_ME for probable indicators, and IGNORE for no indicators
**Validates: Requirements 4.1, 4.2, 4.3**

**Property 15: LLM Fallback Invocation**
*For any* uncertain rule-based detection with confidence below threshold, the optional LLM should be invoked for contextual analysis
**Validates: Requirements 4.4**

**Property 16: LLM Score Integration**
*For any* confidence score returned by LLM, it should be combined with Sensitivity_Level to determine the final Attention_Decision
**Validates: Requirements 4.5**

**Property 17: Volume Action for Definite Attention**
*For any* Attention_Decision of DEFINITELY_TO_ME, a LOWER_VOLUME action should be sent to the frontend
**Validates: Requirements 5.1**

**Property 18: Conditional Volume Action**
*For any* Attention_Decision of PROBABLY_TO_ME with Sensitivity_Level above 0.5, a LOWER_VOLUME action should be sent to the frontend
**Validates: Requirements 5.2**

**Property 19: Volume Restoration Timeout**
*For any* period of no speech detection exceeding the configurable timeout, a RESTORE_VOLUME action should be sent to the frontend
**Validates: Requirements 5.3**

**Property 20: Volume Action Metadata**
*For any* Volume_Action sent, it should include a timestamp and the triggering Attention_Decision for frontend logging
**Validates: Requirements 5.4**

**Property 21: Configuration Persistence**
*For any* Sensitivity_Level update, the new value should be persisted and applied to subsequent detections
**Validates: Requirements 6.1**

**Property 22: Keyword Configuration**
*For any* attention keywords configured by user, they should be added to the detection ruleset and used in subsequent analysis
**Validates: Requirements 6.2**

**Property 23: Timeout Configuration**
*For any* silence timeout duration set by user, the new value should be used for RESTORE_VOLUME timing
**Validates: Requirements 6.3**

**Property 24: Startup Configuration Loading**
*For any* backend startup, persisted configuration should be loaded or default values should be applied
**Validates: Requirements 6.4**

**Property 25: Configuration Serialization Round Trip**
*For any* valid Configuration object, serializing to JSON then deserializing should produce an equivalent Configuration with all required fields validated
**Validates: Requirements 6.5, 6.6**

**Property 26: Deepgram Retry Mechanism**
*For any* Deepgram_API unavailability, Speech_Segments should be queued for retry with exponential backoff
**Validates: Requirements 7.1**

**Property 27: LLM Fallback Behavior**
*For any* LLM service unavailability, the system should fall back to rule-based detection only
**Validates: Requirements 7.2**

**Property 28: Audio Processing Error Recovery**
*For any* unexpected error during audio processing, the error should be logged and processing should continue with the next Speech_Segment
**Validates: Requirements 7.3**

**Property 29: Repeated Failure Warning**
*For any* operation with repeated failures, a warning event should be emitted to the frontend when failure threshold is reached
**Validates: Requirements 7.4**

## Error Handling

The system implements multiple layers of error handling:

### Network Resilience
- WebSocket reconnection with exponential backoff
- Deepgram API retry queue with circuit breaker pattern
- Graceful degradation when external services are unavailable

### Audio Processing Errors
- Invalid audio format handling with format conversion fallback
- Buffer overflow protection with automatic chunk size adjustment
- Memory leak prevention through proper resource cleanup

### Configuration Validation
- Schema validation for all configuration updates
- Fallback to default values for invalid settings
- Atomic configuration updates to prevent partial state

## Testing Strategy

### Dual Testing Approach
The system requires both unit testing and property-based testing for comprehensive coverage:

- **Unit tests** verify specific examples, edge cases, and error conditions
- **Property tests** verify universal properties that should hold across all inputs
- Together they provide comprehensive coverage: unit tests catch concrete bugs, property tests verify general correctness

### Property-Based Testing Requirements
- **Library**: fast-check for TypeScript/Node.js property-based testing
- **Iterations**: Minimum 100 iterations per property test to ensure statistical confidence
- **Tagging**: Each property-based test must include a comment with format: `**Feature: conversational-awareness-backend, Property {number}: {property_text}**`
- **Implementation**: Each correctness property must be implemented by a single property-based test
- **Coverage**: All 29 correctness properties must have corresponding property-based tests

### Unit Testing Focus Areas
- WebSocket connection handling and cleanup
- Audio profile CRUD operations
- Configuration management edge cases
- Error recovery scenarios
- Integration points between components

### Test Data Generation
- Audio buffer generators for various formats and sizes
- Transcript generators with different confidence levels
- Configuration generators with valid/invalid combinations
- Network condition simulators for resilience testing