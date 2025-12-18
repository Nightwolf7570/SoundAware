// Main Application Entry Point - Conversational Awareness Backend
import 'dotenv/config';
import express from 'express';
import { Server } from 'http';
import {
  WebSocketManagerImpl,
  VoiceProfileServiceImpl,
  TranscriptionServiceImpl,
  AttentionDetectionEngineImpl,
  ConfigurationManagerImpl,
  VolumeActionDispatcherImpl,
  globalErrorHandler
} from './services';
import { AttentionDecision, VolumeAction } from './interfaces';
import { AudioBuffer } from './types/audio';

export class ConversationalAwarenessBackend {
  private app: express.Application;
  private server: Server | null = null;
  private wsManager: WebSocketManagerImpl;
  private voiceProfileService: VoiceProfileServiceImpl;
  private transcriptionService: TranscriptionServiceImpl | null = null;
  private attentionEngine: AttentionDetectionEngineImpl;
  private configManager: ConfigurationManagerImpl;
  private volumeDispatcher: VolumeActionDispatcherImpl;
  
  private httpPort: number;
  private wsPort: number;
  private isRunning: boolean = false;

  constructor(httpPort: number = 3000, wsPort: number = 3001, configDir?: string) {
    this.httpPort = httpPort;
    this.wsPort = wsPort;
    
    // Initialize Express app
    this.app = express();
    this.app.use(express.json());
    
    // Enable CORS for frontend
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, PUT, POST, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type');
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
      } else {
        next();
      }
    });
    
    // Initialize services
    this.wsManager = new WebSocketManagerImpl();
    this.voiceProfileService = new VoiceProfileServiceImpl();
    this.attentionEngine = new AttentionDetectionEngineImpl();
    this.configManager = new ConfigurationManagerImpl(configDir);
    this.volumeDispatcher = new VolumeActionDispatcherImpl();
    
    this.setupRoutes();
    this.setupEventHandlers();
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'conversational-awareness-backend',
        wsConnections: this.wsManager.getClientCount(),
        isRunning: this.isRunning
      });
    });

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        message: 'Conversational Awareness Backend is running!',
        version: '1.0.0',
        status: 'ready',
        endpoints: {
          health: '/health',
          config: '/config',
          profiles: '/profiles'
        }
      });
    });

    // Configuration endpoints
    this.app.get('/config', (req, res) => {
      res.json(this.configManager.getConfiguration());
    });

    this.app.put('/config', async (req, res) => {
      try {
        await this.configManager.saveConfiguration(req.body);
        await this.applyConfiguration();
        res.json({ success: true, config: this.configManager.getConfiguration() });
      } catch (error: any) {
        res.status(400).json({ error: error.message });
      }
    });

    this.app.put('/config/sensitivity', async (req, res) => {
      try {
        await this.configManager.updateSensitivity(req.body.level);
        this.voiceProfileService.setSensitivityLevel(req.body.level);
        this.volumeDispatcher.setSensitivityLevel(req.body.level);
        res.json({ success: true, sensitivityLevel: req.body.level });
      } catch (error: any) {
        res.status(400).json({ error: error.message });
      }
    });

    this.app.post('/config/keywords', async (req, res) => {
      try {
        await this.configManager.addKeyword(req.body.keyword);
        this.attentionEngine.addKeyword(req.body.keyword);
        res.json({ success: true, keywords: this.configManager.getKeywords() });
      } catch (error: any) {
        res.status(400).json({ error: error.message });
      }
    });

    // Profile management endpoints
    this.app.get('/profiles', async (req, res) => {
      const profiles = await this.voiceProfileService.listProfiles();
      res.json({ profiles });
    });

    this.app.delete('/profiles/:id', async (req, res) => {
      const deleted = await this.voiceProfileService.removeProfile(req.params.id);
      res.json({ success: deleted });
    });

    // Error stats endpoint
    this.app.get('/errors', (req, res) => {
      res.json({
        failures: globalErrorHandler.getFailureStats(),
        circuitBreakers: globalErrorHandler.getCircuitBreakerStats()
      });
    });
  }

  private setupEventHandlers(): void {
    // WebSocket audio chunk handler
    this.wsManager.on('audio_chunk', async (data: { clientId: string; chunk: AudioBuffer }) => {
      await this.processAudioChunk(data.clientId, data.chunk);
    });

    // WebSocket connection events
    this.wsManager.on('connection', (data: { clientId: string }) => {
      console.log(`New client connected: ${data.clientId}`);
    });

    this.wsManager.on('disconnection', (data: { clientId: string }) => {
      console.log(`Client disconnected: ${data.clientId}`);
    });

    // Volume action handler - broadcast to all clients
    this.volumeDispatcher.on('volume_action', (action: VolumeAction) => {
      console.log(`Broadcasting volume action: ${action.type}`);
      this.wsManager.broadcastVolumeAction(action);
    });

    // Error handler warnings
    globalErrorHandler.on('warning', (warning: { operationName: string; message: string }) => {
      console.warn(`[WARNING] ${warning.message}`);
      // Could broadcast to frontend here
    });
  }

  private async processAudioChunk(clientId: string, chunk: AudioBuffer): Promise<void> {
    try {
      console.log(`[DEBUG] Processing audio chunk: ${chunk.length} bytes from ${clientId}`);
      
      // Step 1: Check against ignore list
      const matchResult = await this.voiceProfileService.matchesIgnoreList(chunk);
      
      if (matchResult.isMatch) {
        // Voice is in ignore list, skip transcription
        console.log(`Audio from ignored profile: ${matchResult.profileId}`);
        return;
      }

      // Step 2: Send to transcription service
      if (this.transcriptionService) {
        // Start stream if not connected (lazy connection)
        if (!this.transcriptionService.isConnected()) {
          console.log('Starting Deepgram stream on first audio...');
          await this.transcriptionService.startStream((partialText: string) => {
            console.log(`Partial: ${partialText}`);
          });
          console.log('Deepgram stream started');
        }
        console.log(`[DEBUG] Sending ${chunk.length} bytes to Deepgram`);
        await this.transcriptionService.sendAudio(chunk);
      } else {
        console.log('[DEBUG] No transcription service available');
      }
    } catch (error) {
      console.error('[DEBUG] Error in processAudioChunk:', error);
      globalErrorHandler.recordFailure('audio_processing', error as Error);
      // Continue processing next chunk - don't throw
    }
  }

  private async handleTranscript(text: string, confidence: number, isPartial: boolean, transcriptId: string = ''): Promise<void> {
    try {
      // Create transcript object
      const transcript = {
        id: transcriptId || `transcript-${Date.now()}`,
        text,
        confidence,
        timestamp: new Date(),
        isPartial,
        audioSegmentId: ''
      };

      // Broadcast transcript to all connected clients
      this.wsManager.broadcastTranscript(transcript);
      console.log(`Transcript: "${text}" (partial: ${isPartial}, confidence: ${(confidence * 100).toFixed(1)}%)`);

      if (isPartial) {
        // Don't analyze partial transcripts for attention
        return;
      }

      // Step 3: Analyze for attention
      const decision = await this.attentionEngine.analyzeTranscript(
        transcript,
        this.configManager.getSensitivityLevel()
      );

      // Step 4: Dispatch volume action
      await this.volumeDispatcher.dispatchAction(
        decision,
        this.configManager.getSensitivityLevel()
      );
    } catch (error) {
      globalErrorHandler.recordFailure('transcript_processing', error as Error);
    }
  }

  private async applyConfiguration(): Promise<void> {
    const config = this.configManager.getConfiguration();
    
    // Apply sensitivity
    this.voiceProfileService.setSensitivityLevel(config.sensitivityLevel);
    this.volumeDispatcher.setSensitivityLevel(config.sensitivityLevel);
    
    // Apply keywords
    for (const keyword of config.attentionKeywords) {
      this.attentionEngine.addKeyword(keyword);
    }
    
    // Apply user name
    if (config.userName) {
      this.attentionEngine.setUserName(config.userName);
    }
    
    // Apply timeout
    this.volumeDispatcher.setSilenceTimeout(config.silenceTimeoutMs);
    
    // Initialize transcription service if API key is set (but don't start stream yet)
    if (config.deepgramApiKey) {
      // Close existing service if any
      if (this.transcriptionService) {
        await this.transcriptionService.closeStream();
      }
      
      this.transcriptionService = new TranscriptionServiceImpl({
        apiKey: config.deepgramApiKey
      });
      
      // Set up transcript handlers
      this.transcriptionService.on('partial_transcript', (data: { text: string; confidence: number }) => {
        this.handleTranscript(data.text, data.confidence, true);
      });
      
      this.transcriptionService.on('final_transcript', (transcript) => {
        this.handleTranscript(transcript.text, transcript.confidence, false, transcript.id);
      });
      
      // Handle connection closed - will reconnect when audio arrives
      this.transcriptionService.on('connection_closed', () => {
        console.log('Deepgram connection closed - will reconnect when audio arrives');
      });
      
      console.log('Transcription service initialized (will connect when audio arrives)');
    } else {
      console.warn('No Deepgram API key configured - transcription disabled');
    }
    
    // Initialize LLM service (Ollama) for intent detection
    const llmAvailable = await this.attentionEngine.initializeLLM(
      process.env.OLLAMA_URL || 'http://localhost:11434',
      process.env.OLLAMA_MODEL || 'llama3.2:1b'
    );
    
    // Apply LLM setting
    if (config.llmEnabled && llmAvailable) {
      this.attentionEngine.enableLLM();
      console.log('LLM intent detection enabled');
    } else {
      this.attentionEngine.disableLLM();
      if (config.llmEnabled && !llmAvailable) {
        console.log('LLM requested but Ollama not available - using heuristics only');
      }
    }
  }

  public async start(): Promise<void> {
    // Load configuration
    await this.configManager.loadConfiguration();
    await this.applyConfiguration();

    // Start HTTP server
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.httpPort, async () => {
        console.log(`HTTP server running on http://localhost:${this.httpPort}`);
        
        try {
          // Start WebSocket server
          await this.wsManager.start(this.wsPort);
          console.log(`WebSocket server running on ws://localhost:${this.wsPort}`);
          
          this.isRunning = true;
          console.log('Conversational Awareness Backend started successfully');
          resolve();
        } catch (error) {
          reject(error);
        }
      });

      this.server.on('error', reject);
    });
  }

  public async stop(): Promise<void> {
    console.log('Shutting down Conversational Awareness Backend...');
    
    // Stop WebSocket server
    await this.wsManager.stop();
    
    // Close transcription service
    if (this.transcriptionService) {
      await this.transcriptionService.closeStream();
    }
    
    // Stop volume dispatcher
    this.volumeDispatcher.dispose();
    
    // Stop HTTP server
    if (this.server) {
      return new Promise((resolve) => {
        this.server!.close(() => {
          this.isRunning = false;
          console.log('Backend stopped');
          resolve();
        });
      });
    }
    
    this.isRunning = false;
  }

  // Getters for testing
  public getWebSocketManager(): WebSocketManagerImpl {
    return this.wsManager;
  }

  public getVoiceProfileService(): VoiceProfileServiceImpl {
    return this.voiceProfileService;
  }

  public getAttentionEngine(): AttentionDetectionEngineImpl {
    return this.attentionEngine;
  }

  public getConfigManager(): ConfigurationManagerImpl {
    return this.configManager;
  }

  public getVolumeDispatcher(): VolumeActionDispatcherImpl {
    return this.volumeDispatcher;
  }
}

// Main entry point
const httpPort = parseInt(process.env.PORT || '3000', 10);
const wsPort = parseInt(process.env.WS_PORT || '3001', 10);

const backend = new ConversationalAwarenessBackend(httpPort, wsPort);

// Graceful shutdown
process.on('SIGINT', async () => {
  await backend.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await backend.stop();
  process.exit(0);
});

// Start the server
backend.start().catch((error) => {
  console.error('Failed to start backend:', error);
  process.exit(1);
});

export default backend;