# Implementation Plan

- [x] 1. Set up project structure and core interfaces
  - Convert existing backend from JavaScript to TypeScript
  - Install required dependencies (ws, @deepgram/sdk, fast-check for testing)
  - Create directory structure: src/services, src/models, src/interfaces, src/tests
  - Define core TypeScript interfaces for all data models and services
  - Set up testing framework with Jest and fast-check
  - _Requirements: 1.1, 2.1, 3.1_

- [x] 2. Implement WebSocket Manager
  - Create WebSocketManager class with connection handling
  - Implement audio chunk buffering and processing pipeline
  - Add heartbeat mechanism for connection monitoring
  - Implement connection cleanup and resource management
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x]* 2.1 Write property test for WebSocket connection response time
  - **Property 1: WebSocket Connection Response Time**
  - **Validates: Requirements 1.1**

- [x]* 2.2 Write property test for audio chunk processing integrity
  - **Property 2: Audio Chunk Processing Integrity**
  - **Validates: Requirements 1.2**

- [x]* 2.3 Write property test for connection cleanup
  - **Property 3: Connection Cleanup**
  - **Validates: Requirements 1.3**

- [x]* 2.4 Write property test for heartbeat detection timing
  - **Property 4: Heartbeat Detection Timing**
  - **Validates: Requirements 1.4**

- [x] 3. Implement Voice Profile Service
  - Create AudioProfile data model with voice signature storage
  - Implement profile creation from audio samples
  - Build voice matching algorithm using audio fingerprinting
  - Add CRUD operations for profile management
  - Implement ignore list checking with confidence scoring
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [x]* 3.1 Write property test for audio profile creation
  - **Property 5: Audio Profile Creation**
  - **Validates: Requirements 2.1**

- [x]* 3.2 Write property test for ignore list processing
  - **Property 6: Ignore List Processing**
  - **Validates: Requirements 2.2, 2.3**

- [x]* 3.3 Write property test for profile management operations
  - **Property 7: Profile Management Operations**
  - **Validates: Requirements 2.4**

- [x]* 3.4 Write property test for profile list retrieval
  - **Property 8: Profile List Retrieval**
  - **Validates: Requirements 2.5**

- [x] 4. Implement Deepgram Transcription Service
  - Set up Deepgram WebSocket client integration
  - Implement streaming audio to Deepgram API
  - Handle partial and final transcript processing
  - Add error handling and retry logic with exponential backoff
  - Implement transcript forwarding to frontend and attention detection
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 7.1_

- [x]* 4.1 Write property test for Deepgram streaming
  - **Property 9: Deepgram Streaming**
  - **Validates: Requirements 3.1**

- [x]* 4.2 Write property test for transcript forwarding
  - **Property 10: Transcript Forwarding**
  - **Validates: Requirements 3.2**

- [x]* 4.3 Write property test for final transcript processing
  - **Property 11: Final Transcript Processing**
  - **Validates: Requirements 3.3**

- [x]* 4.4 Write property test for Deepgram error recovery
  - **Property 12: Deepgram Error Recovery**
  - **Validates: Requirements 3.4**

- [x]* 4.5 Write property test for transcript serialization round trip
  - **Property 13: Transcript Serialization Round Trip**
  - **Validates: Requirements 3.5, 3.6**

- [x]* 4.6 Write property test for Deepgram retry mechanism
  - **Property 26: Deepgram Retry Mechanism**
  - **Validates: Requirements 7.1**

- [x] 5. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement Attention Detection Engine
  - Create rule-based attention detection with keyword matching
  - Implement pattern recognition for questions and direct address
  - Add configurable attention keywords and user name detection
  - Implement confidence scoring and uncertainty handling
  - Add optional LLM integration for contextual analysis
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 7.2_

- [x]* 6.1 Write property test for attention detection logic
  - **Property 14: Attention Detection Logic**
  - **Validates: Requirements 4.1, 4.2, 4.3**

- [x]* 6.2 Write property test for LLM fallback invocation
  - **Property 15: LLM Fallback Invocation**
  - **Validates: Requirements 4.4**

- [x]* 6.3 Write property test for LLM score integration
  - **Property 16: LLM Score Integration**
  - **Validates: Requirements 4.5**

- [x]* 6.4 Write property test for LLM fallback behavior
  - **Property 27: LLM Fallback Behavior**
  - **Validates: Requirements 7.2**

- [x] 7. Implement Volume Action Dispatcher
  - Create VolumeAction data model and dispatcher
  - Implement decision-to-action mapping logic
  - Add sensitivity-based conditional actions
  - Implement silence timeout and volume restoration
  - Add action metadata (timestamp, trigger reason) for logging
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x]* 7.1 Write property test for volume action for definite attention
  - **Property 17: Volume Action for Definite Attention**
  - **Validates: Requirements 5.1**

- [x]* 7.2 Write property test for conditional volume action
  - **Property 18: Conditional Volume Action**
  - **Validates: Requirements 5.2**

- [x]* 7.3 Write property test for volume restoration timeout
  - **Property 19: Volume Restoration Timeout**
  - **Validates: Requirements 5.3**

- [ ]* 7.4 Write property test for volume action metadata
  - **Property 20: Volume Action Metadata**
  - **Validates: Requirements 5.4**

- [x] 8. Implement Configuration Manager
  - Create Configuration data model with validation
  - Implement persistent storage using JSON files
  - Add configuration loading and default value handling
  - Implement real-time configuration updates
  - Add validation for all configuration parameters
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

- [x]* 8.1 Write property test for configuration persistence
  - **Property 21: Configuration Persistence**
  - **Validates: Requirements 6.1**

- [x]* 8.2 Write property test for keyword configuration
  - **Property 22: Keyword Configuration**
  - **Validates: Requirements 6.2**

- [x]* 8.3 Write property test for timeout configuration
  - **Property 23: Timeout Configuration**
  - **Validates: Requirements 6.3**

- [x]* 8.4 Write property test for startup configuration loading
  - **Property 24: Startup Configuration Loading**
  - **Validates: Requirements 6.4**

- [x]* 8.5 Write property test for configuration serialization round trip
  - **Property 25: Configuration Serialization Round Trip**
  - **Validates: Requirements 6.5, 6.6**

- [x] 9. Implement Error Handling and Resilience
  - Add comprehensive error handling across all services
  - Implement circuit breaker pattern for external API calls
  - Add error logging and monitoring
  - Implement graceful degradation when services are unavailable
  - Add repeated failure detection and warning system
  - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [x]* 9.1 Write property test for audio processing error recovery
  - **Property 28: Audio Processing Error Recovery**
  - **Validates: Requirements 7.3**

- [x]* 9.2 Write property test for repeated failure warning
  - **Property 29: Repeated Failure Warning**
  - **Validates: Requirements 7.4**

- [x] 10. Integration and Main Application Setup
  - Create main application entry point
  - Wire all services together with dependency injection
  - Set up environment configuration and secrets management
  - Implement graceful shutdown handling
  - Add health check endpoints
  - Update package.json with proper scripts and dependencies
  - _Requirements: All requirements integration_

- [x]* 10.1 Write integration tests for end-to-end audio processing pipeline
  - Test complete flow from WebSocket audio input to volume action output
  - Verify all components work together correctly
  - _Requirements: All requirements integration_

- [x] 11. Final Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.