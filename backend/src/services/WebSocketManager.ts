// WebSocket Manager - handles client connections and audio streaming
import WebSocket, { WebSocketServer } from 'ws';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { VolumeAction, Transcript, AttentionDecision } from '../interfaces';
import { AudioBuffer } from '../types/audio';

export interface ClientConnection {
  id: string;
  socket: WebSocket;
  lastHeartbeat: number;
  audioBuffer: Buffer[];
  isAlive: boolean;
}

export interface WebSocketMessage {
  type: 'audio' | 'heartbeat' | 'config' | 'transcript' | 'volume_action' | 'ack';
  payload?: any;
  timestamp: number;
  clientId?: string;
}

export class WebSocketManagerImpl extends EventEmitter {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, ClientConnection> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private readonly HEARTBEAT_INTERVAL_MS = 10000; // 10 seconds
  private readonly HEARTBEAT_TIMEOUT_MS = 30000; // 30 seconds
  private readonly CONNECTION_ACK_TIMEOUT_MS = 500; // 500ms for connection acknowledgment

  constructor() {
    super();
  }

  public start(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.wss = new WebSocketServer({ port });
        
        this.wss.on('connection', (socket: WebSocket) => {
          this.handleConnection(socket);
        });

        this.wss.on('error', (error) => {
          this.emit('error', error);
          reject(error);
        });

        this.wss.on('listening', () => {
          this.startHeartbeatMonitor();
          console.log(`WebSocket server listening on port ${port}`);
          resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  public stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = null;
      }

      // Close all client connections
      for (const [clientId, client] of this.clients) {
        this.cleanupConnection(clientId);
      }

      if (this.wss) {
        this.wss.close(() => {
          this.wss = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  public handleConnection(socket: WebSocket): string {
    const clientId = uuidv4();
    const connectionStartTime = Date.now();
    
    const client: ClientConnection = {
      id: clientId,
      socket,
      lastHeartbeat: Date.now(),
      audioBuffer: [],
      isAlive: true
    };

    this.clients.set(clientId, client);

    // Send acknowledgment within 500ms requirement
    const ackMessage: WebSocketMessage = {
      type: 'ack',
      payload: { clientId, status: 'connected' },
      timestamp: Date.now()
    };
    
    socket.send(JSON.stringify(ackMessage));
    
    const ackTime = Date.now() - connectionStartTime;
    if (ackTime > this.CONNECTION_ACK_TIMEOUT_MS) {
      console.warn(`Connection acknowledgment took ${ackTime}ms, exceeding ${this.CONNECTION_ACK_TIMEOUT_MS}ms target`);
    }

    socket.on('message', (data: Buffer) => {
      this.handleMessage(clientId, data);
    });

    socket.on('close', () => {
      this.handleDisconnection(clientId);
    });

    socket.on('error', (error) => {
      console.error(`WebSocket error for client ${clientId}:`, error);
      this.emit('client_error', { clientId, error });
    });

    socket.on('pong', () => {
      const client = this.clients.get(clientId);
      if (client) {
        client.isAlive = true;
        client.lastHeartbeat = Date.now();
      }
    });

    this.emit('connection', { clientId, timestamp: Date.now() });
    console.log(`Client connected: ${clientId}`);
    
    return clientId;
  }

  private handleMessage(clientId: string, data: Buffer): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    try {
      // Try to parse as JSON message first
      const message = JSON.parse(data.toString()) as WebSocketMessage;
      
      switch (message.type) {
        case 'heartbeat':
          client.lastHeartbeat = Date.now();
          client.isAlive = true;
          this.sendToClient(clientId, { type: 'heartbeat', timestamp: Date.now() });
          break;
        case 'config':
          this.emit('config_update', { clientId, config: message.payload });
          break;
        default:
          console.warn(`Unknown message type: ${message.type}`);
      }
    } catch {
      // Not JSON, treat as raw audio data
      this.processAudioChunk(data as AudioBuffer, clientId);
    }
  }

  public processAudioChunk(chunk: AudioBuffer, clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) {
      console.warn(`Received audio chunk for unknown client: ${clientId}`);
      return;
    }

    // Buffer the audio chunk
    client.audioBuffer.push(chunk);
    
    // Emit event for processing pipeline
    this.emit('audio_chunk', { 
      clientId, 
      chunk, 
      timestamp: Date.now(),
      bufferSize: client.audioBuffer.length 
    });
  }

  public getBufferedAudio(clientId: string): Buffer[] {
    const client = this.clients.get(clientId);
    if (!client) return [];
    
    const buffered = [...client.audioBuffer];
    client.audioBuffer = []; // Clear buffer after retrieval
    return buffered;
  }

  public sendVolumeAction(action: VolumeAction, clientId: string): void {
    const message: WebSocketMessage = {
      type: 'volume_action',
      payload: {
        type: action.type,
        timestamp: action.timestamp.toISOString(),
        triggerReason: action.triggerReason,
        confidence: action.confidence
      },
      timestamp: Date.now(),
      clientId
    };

    this.sendToClient(clientId, message);
    this.emit('volume_action_sent', { clientId, action });
  }

  public broadcastTranscript(transcript: Transcript): void {
    const message: WebSocketMessage = {
      type: 'transcript',
      payload: {
        id: transcript.id,
        text: transcript.text,
        confidence: transcript.confidence,
        timestamp: transcript.timestamp.toISOString(),
        isPartial: transcript.isPartial,
        audioSegmentId: transcript.audioSegmentId
      },
      timestamp: Date.now()
    };

    for (const [clientId] of this.clients) {
      this.sendToClient(clientId, message);
    }
  }

  public sendTranscriptToClient(transcript: Transcript, clientId: string): void {
    const message: WebSocketMessage = {
      type: 'transcript',
      payload: {
        id: transcript.id,
        text: transcript.text,
        confidence: transcript.confidence,
        timestamp: transcript.timestamp.toISOString(),
        isPartial: transcript.isPartial,
        audioSegmentId: transcript.audioSegmentId
      },
      timestamp: Date.now(),
      clientId
    };

    this.sendToClient(clientId, message);
  }

  private sendToClient(clientId: string, message: WebSocketMessage): boolean {
    const client = this.clients.get(clientId);
    if (!client || client.socket.readyState !== WebSocket.OPEN) {
      return false;
    }

    try {
      client.socket.send(JSON.stringify(message));
      return true;
    } catch (error) {
      console.error(`Failed to send message to client ${clientId}:`, error);
      return false;
    }
  }

  private handleDisconnection(clientId: string): void {
    this.cleanupConnection(clientId);
    this.emit('disconnection', { clientId, timestamp: Date.now() });
    console.log(`Client disconnected: ${clientId}`);
  }

  public cleanupConnection(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Clear audio buffer
    client.audioBuffer = [];
    
    // Close socket if still open
    if (client.socket.readyState === WebSocket.OPEN) {
      client.socket.close();
    }

    // Remove from clients map
    this.clients.delete(clientId);
    
    this.emit('cleanup', { clientId, timestamp: Date.now() });
  }

  private startHeartbeatMonitor(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      
      for (const [clientId, client] of this.clients) {
        if (!client.isAlive) {
          // Connection is stale, clean it up
          console.log(`Stale connection detected for client ${clientId}`);
          this.emit('stale_connection', { clientId, lastHeartbeat: client.lastHeartbeat });
          this.cleanupConnection(clientId);
          continue;
        }

        // Check if heartbeat timeout exceeded
        if (now - client.lastHeartbeat > this.HEARTBEAT_TIMEOUT_MS) {
          console.log(`Heartbeat timeout for client ${clientId}`);
          this.emit('heartbeat_timeout', { clientId, lastHeartbeat: client.lastHeartbeat });
          this.cleanupConnection(clientId);
          continue;
        }

        // Send ping and mark as not alive until pong received
        client.isAlive = false;
        client.socket.ping();
      }
    }, this.HEARTBEAT_INTERVAL_MS);
  }

  public getClientCount(): number {
    return this.clients.size;
  }

  public getClient(clientId: string): ClientConnection | undefined {
    return this.clients.get(clientId);
  }

  public isClientConnected(clientId: string): boolean {
    const client = this.clients.get(clientId);
    return client !== undefined && client.socket.readyState === WebSocket.OPEN;
  }
}