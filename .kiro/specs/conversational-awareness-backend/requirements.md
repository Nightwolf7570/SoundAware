# Requirements Document

## Introduction

The Conversational Awareness Backend is a Node.js/TypeScript service that acts as the "brain" for AirPods that automatically detect when someone is speaking to the user. The service receives audio streams from a frontend Electron app, processes them through voice profile matching and speech-to-text transcription, and determines whether the detected speech is directed at the user. Based on this analysis, it sends commands back to the frontend to lower or restore music volume, enabling seamless real-world conversations without manual AirPod removal.

## Glossary

- **Audio_Profile**: A stored voice signature used to identify and filter known speakers (e.g., background TV, coworkers to ignore)
- **Ignore_List**: A collection of Audio_Profiles that the system should not respond to
- **Speech_Segment**: A discrete chunk of audio containing detected speech
- **Transcript**: Text output from Deepgram speech-to-text processing of a Speech_Segment
- **Deepgram_API**: The streaming speech-to-text service used for real-time transcription
- **Attention_Decision**: The system's determination of whether speech is directed at the user (IGNORE, PROBABLY_TO_ME, DEFINITELY_TO_ME)
- **Volume_Action**: A command sent to the frontend to modify system volume (LOWER_VOLUME, RESTORE_VOLUME)
- **WebSocket_Connection**: A persistent bidirectional communication channel between frontend and backend
- **Sensitivity_Level**: A user-configurable threshold (0.0-1.0) that affects how readily the system triggers volume changes

## Requirements

### Requirement 1: WebSocket Audio Stream Handling

**User Story:** As a user, I want the backend to receive my AirPods audio stream in real-time, so that it can analyze conversations happening around me.

#### Acceptance Criteria

1. WHEN a frontend client initiates a WebSocket connection THEN the Backend SHALL establish the connection and acknowledge readiness within 500 milliseconds
2. WHEN the Backend receives audio data chunks over WebSocket THEN the Backend SHALL buffer and process the audio without dropping frames under normal network conditions
3. WHEN a WebSocket connection is interrupted THEN the Backend SHALL clean up associated resources and log the disconnection event
4. WHILE a WebSocket connection is active THEN the Backend SHALL maintain a heartbeat mechanism to detect stale connections within 30 seconds

### Requirement 2: Voice Profile Management

**User Story:** As a user, I want to manage audio profiles for voices I want to ignore, so that background conversations and media don't trigger volume changes.

#### Acceptance Criteria

1. WHEN a user submits audio samples for a new profile THEN the Backend SHALL create an Audio_Profile and store it in the Ignore_List
2. WHEN the Backend receives a Speech_Segment THEN the Backend SHALL compare it against all Audio_Profiles in the Ignore_List
3. WHEN a Speech_Segment matches an Audio_Profile in the Ignore_List with confidence above the Sensitivity_Level THEN the Backend SHALL skip transcription and return IGNORE decision
4. WHEN a user requests deletion of an Audio_Profile THEN the Backend SHALL remove the profile from the Ignore_List and confirm deletion
5. WHEN a user requests the list of Audio_Profiles THEN the Backend SHALL return all stored profiles with their identifiers and metadata

### Requirement 3: Speech-to-Text Integration

**User Story:** As a user, I want non-ignored speech to be transcribed in real-time, so that the system can analyze what is being said.

#### Acceptance Criteria

1. WHEN a Speech_Segment passes the Ignore_List check THEN the Backend SHALL stream the audio to the Deepgram_API via WebSocket
2. WHEN the Deepgram_API returns partial transcripts THEN the Backend SHALL forward them to the frontend for live display
3. WHEN the Deepgram_API returns a final transcript THEN the Backend SHALL pass it to the attention detection module
4. IF the Deepgram_API returns an error THEN the Backend SHALL log the error and continue processing subsequent Speech_Segments
5. WHEN serializing Transcript data for storage or transmission THEN the Backend SHALL encode the Transcript using JSON format
6. WHEN deserializing Transcript data THEN the Backend SHALL parse the JSON and reconstruct the Transcript object with all original fields

### Requirement 4: Attention Detection Rules

**User Story:** As a user, I want the system to detect when someone is talking to me based on keywords and context, so that my music volume adjusts appropriately.

#### Acceptance Criteria

1. WHEN a Transcript contains attention keywords ("hey", "hello", "excuse me", or the user's configured name) THEN the Backend SHALL return DEFINITELY_TO_ME decision
2. WHEN a Transcript contains probable attention indicators (questions, direct address patterns) THEN the Backend SHALL return PROBABLY_TO_ME decision
3. WHEN a Transcript contains no attention indicators THEN the Backend SHALL return IGNORE decision
4. WHEN the rule-based detection is uncertain and confidence is below threshold THEN the Backend SHALL invoke an optional LLM for contextual analysis
5. WHEN the LLM returns a confidence score THEN the Backend SHALL use the score combined with Sensitivity_Level to determine the final Attention_Decision

### Requirement 5: Volume Action Commands

**User Story:** As a user, I want the backend to send clear volume commands to my frontend, so that my music volume changes smoothly during conversations.

#### Acceptance Criteria

1. WHEN an Attention_Decision is DEFINITELY_TO_ME THEN the Backend SHALL send LOWER_VOLUME action to the frontend
2. WHEN an Attention_Decision is PROBABLY_TO_ME and Sensitivity_Level is above 0.5 THEN the Backend SHALL send LOWER_VOLUME action to the frontend
3. WHEN no speech is detected for a configurable timeout period (default 5 seconds) THEN the Backend SHALL send RESTORE_VOLUME action to the frontend
4. WHEN sending a Volume_Action THEN the Backend SHALL include a timestamp and the triggering Attention_Decision for frontend logging

### Requirement 6: Configuration Management

**User Story:** As a user, I want to configure sensitivity and other settings, so that the system behaves according to my preferences.

#### Acceptance Criteria

1. WHEN a user updates the Sensitivity_Level THEN the Backend SHALL persist the new value and apply it to subsequent detections
2. WHEN a user configures attention keywords THEN the Backend SHALL add them to the detection ruleset
3. WHEN a user sets the silence timeout duration THEN the Backend SHALL use the new value for RESTORE_VOLUME timing
4. WHEN the Backend starts THEN the Backend SHALL load persisted configuration or apply default values
5. WHEN serializing configuration data for persistence THEN the Backend SHALL encode the configuration using JSON format
6. WHEN loading configuration from storage THEN the Backend SHALL parse the JSON and validate all required fields exist

### Requirement 7: Error Handling and Resilience

**User Story:** As a user, I want the system to handle errors gracefully, so that temporary issues don't disrupt my experience.

#### Acceptance Criteria

1. IF the Deepgram_API is unavailable THEN the Backend SHALL queue Speech_Segments for retry with exponential backoff
2. IF the LLM service is unavailable THEN the Backend SHALL fall back to rule-based detection only
3. WHEN an unexpected error occurs during audio processing THEN the Backend SHALL log the error and continue processing the next Speech_Segment
4. WHEN the Backend encounters repeated failures for a specific operation THEN the Backend SHALL emit a warning event to the frontend
