# Implementation Plan

- [x] 1. Set up Electron + React project structure






  - [x] 1.1 Initialize electron-vite project with React and TypeScript

    - Create project using electron-vite template
    - Configure TypeScript for both main and renderer processes
    - Set up Tailwind CSS for styling
    - _Requirements: N/A (project setup)_

  - [x] 1.2 Configure Vitest and fast-check for testing

    - Install vitest, @testing-library/react, fast-check
    - Configure vitest.config.ts for both main and renderer
    - _Requirements: N/A (testing setup)_


  - [ ] 1.3 Set up IPC communication structure
    - Create typed IPC channel definitions
    - Implement preload script with contextBridge
    - _Requirements: N/A (infrastructure)_

- [x] 2. Implement Settings Manager






  - [x] 2.1 Create settings manager with persistence

    - Implement ISettingsManager interface
    - Use electron-store or JSON file for persistence
    - Support default values for all settings
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_
  - [ ]* 2.2 Write property test for settings persistence round-trip
    - **Property 15: Settings persistence round-trip**
    - **Validates: Requirements 7.3, 7.4**

- [x] 3. Implement OS Volume Adapters

  - [x] 3.1 Create OS adapter interface and factory
    - Implement IOSAdapter interface
    - Create adapter factory with platform detection
    - _Requirements: 6.4_

  - [x] 3.2 Implement Windows volume adapter
    - Use PowerShell commands for volume control
    - Handle permission errors gracefully
    - _Requirements: 6.1, 6.5_

  - [x] 3.3 Implement macOS volume adapter
    - Use osascript for volume control
    - Handle permission errors gracefully
    - _Requirements: 6.2, 6.5_

  - [x] 3.4 Implement Linux volume adapter

    - Use pactl (PulseAudio) with amixer fallback
    - Handle permission errors gracefully
    - _Requirements: 6.3, 6.5_
  - [ ]* 3.5 Write property test for platform adapter selection
    - **Property 14: Platform adapter selection**
    - **Validates: Requirements 6.4**


- [x] 4. Implement Volume Controller





  - [x] 4.1 Create volume controller with smooth transitions

    - Implement IVolumeController interface
    - Track previous volume for restore functionality
    - Implement smooth volume transitions (200ms)
    - _Requirements: 3.1, 3.2, 3.4_
  - [ ]* 4.2 Write property test for volume dim/restore round-trip
    - **Property 6: Volume dim/restore round-trip**






    - **Validates: Requirements 3.1, 3.2**



- [ ] 5. Implement Chat History Database

  - [ ] 5.1 Set up SQLite database with better-sqlite3
    - Create database initialization with schema
    - Implement connection management
    - _Requirements: 5.1_
  - [ ] 5.2 Implement chat history repository
    - Implement IChatHistoryRepository interface
    - Support save, findAll, findById, delete operations
    - Implement date range and text search filtering
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_
  - [ ]* 5.3 Write property test for chat history persistence round-trip
    - **Property 10: Chat history persistence round-trip**
    - **Validates: Requirements 5.1, 5.2**



  - [x]* 5.4 Write property test for date range filtering







    - **Property 11: Date range filtering correctness**
    - **Validates: Requirements 5.3**
  - [ ]* 5.5 Write property test for text search filtering
    - **Property 12: Text search filtering correctness**
    - **Validates: Requirements 5.4**
  - [ ]* 5.6 Write property test for history deletion
    - **Property 13: History deletion completeness**
    - **Validates: Requirements 5.5**







- [ ] 6. Checkpoint - Ensure all tests pass

  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Implement Audio Capture Hook

  - [ ] 7.1 Create useAudioCapture hook
    - Implement Web Audio API integration



    - Support device enumeration and selection



    - Calculate and expose audio level
    - Handle permission requests and errors
    - _Requirements: 1.1, 1.2, 1.3, 1.4_
  - [ ]* 7.2 Write property test for audio capture state consistency
    - **Property 1: Audio capture state consistency**
    - **Validates: Requirements 1.1**
  - [x]* 7.3 Write property test for device selection availability










    - **Property 3: Device selection availability**
    - **Validates: Requirements 1.4**



- [ ] 8. Implement WebSocket Hook

  - [ ] 8.1 Create useWebSocket hook
    - Implement WebSocket connection management
    - Support automatic reconnection with exponential backoff
    - Handle audio streaming to backend
    - Parse and dispatch volume decisions and transcripts
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_
  - [x]* 8.2 Write property test for reconnection with exponential backoff


    - **Property 5: Reconnection with exponential backoff**
    - **Validates: Requirements 2.4**
  - [ ]* 8.3 Write property test for audio streaming while connected
    - **Property 4: Audio streaming while connected**


    - **Validates: Requirements 2.2**

- [x] 9. Implement React Application State



  - [ ] 9.1 Create AppContext with reducer
    - Define AppState and AppAction types
    - Implement state reducer with all action handlers






    - Create context provider component
    - _Requirements: 8.1, 8.2, 8.3_
  - [x]* 9.2 Write property test for connection status UI reflection


    - **Property 16: Connection status UI reflection**
    - **Validates: Requirements 8.1**


  - [ ]* 9.3 Write property test for volume state display accuracy
    - **Property 18: Volume state display accuracy**
    - **Validates: Requirements 8.3**

- [ ] 10. Checkpoint - Ensure all tests pass

  - Ensure all tests pass, ask the user if questions arise.

- [ ] 11. Implement UI Components

  - [ ] 11.1 Create StatusBar component
    - Display connection status indicator
    - Display audio level meter
    - Display volume state (normal/dimmed)
    - _Requirements: 8.1, 8.2, 8.3_
  - [ ] 11.2 Create TranscriptDisplay component
    - Render live transcript entries
    - Implement auto-scroll functionality
    - Highlight trigger phrases
    - _Requirements: 4.1, 4.2, 4.3, 4.4_
  - [ ]* 11.3 Write property test for transcript auto-scroll behavior
    - **Property 8: Transcript auto-scroll behavior**
    - **Validates: Requirements 4.2**
  - [ ]* 11.4 Write property test for trigger phrase highlighting
    - **Property 9: Trigger phrase highlighting**
    - **Validates: Requirements 4.4**
  - [ ] 11.5 Create HistoryView component
    - Display stored conversation history
    - Implement date range filter controls
    - Implement search input
    - Support entry deletion
    - _Requirements: 5.2, 5.3, 5.4, 5.5_
  - [ ] 11.6 Create SettingsPanel component
    - Dim volume level slider (0-100%)
    - Server URL input field
    - Audio device selector dropdown
    - _Requirements: 7.1, 7.2, 7.5_
  - [ ] 11.7 Create ErrorNotification component
    - Display error messages with dismiss action
    - Support different error severity levels
    - _Requirements: 8.4_
  - [ ]* 11.8 Write property test for error notification generation
    - **Property 19: Error notification generation**
    - **Validates: Requirements 8.4**

- [x] 12. Implement Main Application Shell

  - [x] 12.1 Create App component with routing
    - Set up main layout with StatusBar
    - Implement tab navigation (Live/History/Settings)
    - Wire up all hooks and context
    - _Requirements: All UI requirements_
  - [x] 12.2 Implement IPC handlers in main process
    - Register all volume control handlers
    - Register all chat history handlers
    - Register all settings handlers
    - _Requirements: All IPC-dependent requirements_

- [x] 13. Integration and Polish



  - [x] 13.1 Wire audio capture to WebSocket streaming


    - Connect useAudioCapture output to useWebSocket input
    - Handle start/stop synchronization

    - _Requirements: 1.2, 2.2_
  - [x] 13.2 Wire WebSocket decisions to volume controller

    - Process LOWER_VOLUME and RESTORE_VOLUME decisions
    - Update UI state on volume changes
    - _Requirements: 3.1, 3.2, 3.3_

  - [x] 13.3 Wire transcript to history persistence

    - Save incoming transcripts to database
    - Update live transcript display
    - _Requirements: 4.1, 5.1_
  - [ ]* 13.4 Write property test for volume state UI consistency
    - **Property 7: Volume state UI consistency**
    - **Validates: Requirements 3.3**
  - [ ]* 13.5 Write property test for audio level indicator updates
    - **Property 17: Audio level indicator updates**
    - **Validates: Requirements 8.2**

- [ ] 14. Final Checkpoint - Ensure all tests pass








  - Ensure all tests pass, ask the user if questions arise.
