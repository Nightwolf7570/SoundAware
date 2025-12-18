// Transcription Service - interfaces with Deepgram API for real-time transcription
import { EventEmitter } from 'events';
import { createClient, LiveTranscriptionEvents, LiveClient } from '@deepgram/sdk';
import { v4 as uuidv4 } from 'uuid';
import { TranscriptionService as ITranscriptionService, Transcript } from '../interfaces';
import { AudioBuffer } from '../types/audio';
import { TranscriptModel } from '../models';

export interface TranscriptionConfig {
  apiKey: string;
  language?: string;
  model?: string;
  punctuate?: boolean;
  interimResults?: boolean;
}

interface QueuedSegment {
  chunk: AudioBuffer;
  timestamp: number;
  retryCount: number;
}

export class TranscriptionServiceImpl extends EventEmitter implements ITranscriptionService {
  private deepgramClient: any = null;
  private liveConnection: LiveClient | null = null;
  private config: TranscriptionConfig;
  private isStreaming: boolean = false;
  private currentAudioSegmentId: string = '';
  private partialTranscriptCallback: ((text: string) => void) | null = null;
  private finalTranscriptCallback: ((transcript: Transcript) => void) | null = null;
  
  // Retry queue for when Deepgram is unavailable
  private retryQueue: QueuedSegment[] = [];
  private isRetrying: boolean = false;
  private readonly MAX_RETRY_COUNT = 5;
  private readonly BASE_RETRY_DELAY_MS = 1000;
  private readonly MAX_QUEUE_SIZE = 100;

  constructor(config: TranscriptionConfig) {
    super();
    this.config = config;
    
    if (config.apiKey) {
      this.deepgramClient = createClient(config.apiKey);
    }
  }

  public updateApiKey(apiKey: string): void {
    this.config.apiKey = apiKey;
    this.deepgramClient = createClient(apiKey);
  }

  public async startStream(onPartialTranscript: (text: string) => void): Promise<void> {
    if (!this.deepgramClient) {
      throw new Error('Deepgram API key not configured');
    }

    if (this.isStreaming) {
      await this.closeStream();
    }

    this.partialTranscriptCallback = onPartialTranscript;
    this.currentAudioSegmentId = uuidv4();

    try {
      this.liveConnection = this.deepgramClient.listen.live({
        model: this.config.model || 'nova-2',
        language: this.config.language || 'en-US',
        punctuate: this.config.punctuate ?? true,
        interim_results: this.config.interimResults ?? true,
        encoding: 'linear16',
        sample_rate: 16000,
        channels: 1
      });

      this.setupEventHandlers();
      this.isStreaming = true;
      
      this.emit('stream_started', { audioSegmentId: this.currentAudioSegmentId });
    } catch (error) {
      this.emit('error', { error, context: 'startStream' });
      throw error;
    }
  }

  private setupEventHandlers(): void {
    if (!this.liveConnection) return;

    this.liveConnection.on(LiveTranscriptionEvents.Open, () => {
      this.emit('connection_open');
      console.log('Deepgram connection opened');
    });

    this.liveConnection.on(LiveTranscriptionEvents.Transcript, (data: any) => {
      const transcript = data.channel?.alternatives?.[0];
      if (!transcript) return;

      const text = transcript.transcript;
      if (!text || text.trim() === '') return;

      const isPartial = !data.is_final;
      const confidence = transcript.confidence || 0;

      if (isPartial) {
        // Forward partial transcript
        if (this.partialTranscriptCallback) {
          this.partialTranscriptCallback(text);
        }
        this.emit('partial_transcript', { text, confidence });
      } else {
        // Create final transcript model
        const transcriptModel = new TranscriptModel(
          text,
          confidence,
          false,
          this.currentAudioSegmentId
        );

        // Forward to attention detection
        if (this.finalTranscriptCallback) {
          this.finalTranscriptCallback(transcriptModel);
        }
        
        this.emit('final_transcript', transcriptModel);
      }
    });

    this.liveConnection.on(LiveTranscriptionEvents.Error, (error: any) => {
      console.error('Deepgram error:', error);
      this.emit('error', { error, context: 'transcription' });
      
      // Don't throw - continue processing subsequent segments
      // The error is logged and emitted for monitoring
    });

    this.liveConnection.on(LiveTranscriptionEvents.Close, () => {
      this.isStreaming = false;
      this.emit('connection_closed');
      console.log('Deepgram connection closed');
    });
  }

  public async sendAudio(chunk: AudioBuffer): Promise<void> {
    if (!this.isStreaming || !this.liveConnection) {
      // Queue for retry if not streaming
      this.queueForRetry(chunk);
      return;
    }

    try {
      // Convert Buffer to ArrayBuffer for Deepgram
      const arrayBuffer = chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength);
      this.liveConnection.send(arrayBuffer);
      this.emit('audio_sent', { size: chunk.length, timestamp: Date.now() });
    } catch (error) {
      console.error('Error sending audio to Deepgram:', error);
      this.emit('error', { error, context: 'sendAudio' });
      
      // Queue for retry on send failure
      this.queueForRetry(chunk);
    }
  }

  public onFinalTranscript(callback: (transcript: Transcript) => void): void {
    this.finalTranscriptCallback = callback;
  }

  public async closeStream(): Promise<void> {
    if (this.liveConnection) {
      try {
        this.liveConnection.finish();
      } catch (error) {
        console.error('Error closing Deepgram connection:', error);
      }
      this.liveConnection = null;
    }
    
    this.isStreaming = false;
    this.partialTranscriptCallback = null;
    this.emit('stream_closed', { audioSegmentId: this.currentAudioSegmentId });
  }

  // Retry queue management with exponential backoff
  private queueForRetry(chunk: AudioBuffer): void {
    if (this.retryQueue.length >= this.MAX_QUEUE_SIZE) {
      // Remove oldest item if queue is full
      this.retryQueue.shift();
      this.emit('queue_overflow', { queueSize: this.retryQueue.length });
    }

    this.retryQueue.push({
      chunk,
      timestamp: Date.now(),
      retryCount: 0
    });

    this.emit('segment_queued', { queueSize: this.retryQueue.length });
    
    // Start retry process if not already running
    if (!this.isRetrying) {
      this.processRetryQueue();
    }
  }

  private async processRetryQueue(): Promise<void> {
    if (this.isRetrying || this.retryQueue.length === 0) return;
    
    this.isRetrying = true;

    while (this.retryQueue.length > 0) {
      const segment = this.retryQueue[0];
      
      if (segment.retryCount >= this.MAX_RETRY_COUNT) {
        // Max retries exceeded, discard segment
        this.retryQueue.shift();
        this.emit('segment_discarded', { 
          retryCount: segment.retryCount,
          timestamp: segment.timestamp 
        });
        continue;
      }

      // Calculate exponential backoff delay
      const delay = this.BASE_RETRY_DELAY_MS * Math.pow(2, segment.retryCount);
      await this.delay(delay);

      // Try to send
      if (this.isStreaming && this.liveConnection) {
        try {
          // Convert Buffer to ArrayBuffer for Deepgram
          const arrayBuffer = segment.chunk.buffer.slice(
            segment.chunk.byteOffset, 
            segment.chunk.byteOffset + segment.chunk.byteLength
          );
          this.liveConnection.send(arrayBuffer);
          this.retryQueue.shift(); // Success, remove from queue
          this.emit('segment_retry_success', { retryCount: segment.retryCount });
        } catch (error) {
          segment.retryCount++;
          this.emit('segment_retry_failed', { 
            retryCount: segment.retryCount,
            error 
          });
        }
      } else {
        // Not connected, increment retry count and wait
        segment.retryCount++;
        this.emit('waiting_for_connection', { queueSize: this.retryQueue.length });
      }
    }

    this.isRetrying = false;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Utility methods
  public isConnected(): boolean {
    return this.isStreaming && this.liveConnection !== null;
  }

  public getQueueSize(): number {
    return this.retryQueue.length;
  }

  public getCurrentAudioSegmentId(): string {
    return this.currentAudioSegmentId;
  }

  // Transcript serialization for storage/transmission
  public static serializeTranscript(transcript: Transcript): string {
    return JSON.stringify({
      id: transcript.id,
      text: transcript.text,
      confidence: transcript.confidence,
      timestamp: transcript.timestamp instanceof Date 
        ? transcript.timestamp.toISOString() 
        : transcript.timestamp,
      isPartial: transcript.isPartial,
      audioSegmentId: transcript.audioSegmentId
    });
  }

  public static deserializeTranscript(json: string): Transcript {
    const data = JSON.parse(json);
    return {
      id: data.id,
      text: data.text,
      confidence: data.confidence,
      timestamp: new Date(data.timestamp),
      isPartial: data.isPartial,
      audioSegmentId: data.audioSegmentId
    };
  }
}