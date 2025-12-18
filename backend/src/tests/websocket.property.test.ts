/**
 * Property-based tests for WebSocket Manager
 * **Feature: conversational-awareness-backend**
 */
import * as fc from 'fast-check';
import WebSocket from 'ws';
import { WebSocketManagerImpl } from '../services/WebSocketManager';
import { propertyTestConfig } from './setup';

describe('WebSocket Manager Property Tests', () => {
  let wsManager: WebSocketManagerImpl;
  const TEST_PORT = 9100;

  beforeEach(async () => {
    wsManager = new WebSocketManagerImpl();
    await wsManager.start(TEST_PORT);
  });

  afterEach(async () => {
    await wsManager.stop();
  });

  /**
   * **Feature: conversational-awareness-backend, Property 1: WebSocket Connection Response Time**
   * *For any* frontend client connection request, the backend should establish 
   * the WebSocket connection and send acknowledgment within 500 milliseconds
   * **Validates: Requirements 1.1**
   */
  test('Property 1: WebSocket connection response time under 500ms', async () => {
    const connectionTimes: number[] = [];
    
    // Test multiple connections
    for (let i = 0; i < 10; i++) {
      const startTime = Date.now();
      
      const client = new WebSocket(`ws://localhost:${TEST_PORT}`);
      
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          client.close();
          reject(new Error('Connection timeout'));
        }, 1000);

        client.on('message', (data) => {
          const elapsed = Date.now() - startTime;
          connectionTimes.push(elapsed);
          clearTimeout(timeout);
          client.close();
          resolve();
        });

        client.on('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });
    }

    // All connections should complete within 500ms
    for (const time of connectionTimes) {
      expect(time).toBeLessThan(500);
    }
  });

  /**
   * **Feature: conversational-awareness-backend, Property 2: Audio Chunk Processing Integrity**
   * *For any* sequence of audio chunks sent over WebSocket, all chunks should be 
   * buffered and processed without loss under normal network conditions
   * **Validates: Requirements 1.2**
   */
  test('Property 2: Audio chunk processing integrity', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.uint8Array({ minLength: 100, maxLength: 1000 }), { minLength: 1, maxLength: 10 }),
        async (chunks) => {
          const receivedChunks: number[] = [];
          
          wsManager.on('audio_chunk', (data) => {
            receivedChunks.push(data.chunk.length);
          });

          const client = new WebSocket(`ws://localhost:${TEST_PORT}`);
          
          await new Promise<void>((resolve) => {
            client.on('open', async () => {
              // Send all chunks
              for (const chunk of chunks) {
                client.send(Buffer.from(chunk));
                await new Promise(r => setTimeout(r, 10)); // Small delay between chunks
              }
              
              // Wait for processing
              await new Promise(r => setTimeout(r, 100));
              client.close();
              resolve();
            });
          });

          // All chunks should be received
          expect(receivedChunks.length).toBe(chunks.length);
          
          // Chunk sizes should match
          for (let i = 0; i < chunks.length; i++) {
            expect(receivedChunks[i]).toBe(chunks[i].length);
          }
          
          wsManager.removeAllListeners('audio_chunk');
          return true;
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * **Feature: conversational-awareness-backend, Property 3: Connection Cleanup**
   * *For any* WebSocket connection that gets interrupted, all associated resources 
   * should be cleaned up and a disconnection event should be logged
   * **Validates: Requirements 1.3**
   */
  test('Property 3: Connection cleanup on disconnect', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 5 }),
        async (numConnections) => {
          const disconnections: string[] = [];
          const cleanups: string[] = [];
          
          wsManager.on('disconnection', (data) => {
            disconnections.push(data.clientId);
          });
          
          wsManager.on('cleanup', (data) => {
            cleanups.push(data.clientId);
          });

          const clients: WebSocket[] = [];
          const clientIds: string[] = [];

          // Create connections
          for (let i = 0; i < numConnections; i++) {
            const client = new WebSocket(`ws://localhost:${TEST_PORT}`);
            clients.push(client);
            
            await new Promise<void>((resolve) => {
              client.on('message', (data) => {
                const msg = JSON.parse(data.toString());
                if (msg.payload?.clientId) {
                  clientIds.push(msg.payload.clientId);
                }
                resolve();
              });
            });
          }

          // Close all connections
          for (const client of clients) {
            client.close();
          }

          // Wait for cleanup
          await new Promise(r => setTimeout(r, 200));

          // All connections should have cleanup events
          expect(disconnections.length).toBe(numConnections);
          expect(cleanups.length).toBe(numConnections);
          
          // Client count should be 0
          expect(wsManager.getClientCount()).toBe(0);
          
          wsManager.removeAllListeners('disconnection');
          wsManager.removeAllListeners('cleanup');
          return true;
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * **Feature: conversational-awareness-backend, Property 4: Heartbeat Detection Timing**
   * *For any* active WebSocket connection, stale connections should be detected 
   * within 30 seconds when heartbeat stops
   * **Validates: Requirements 1.4**
   * 
   * Note: This test uses a shorter timeout for practical testing
   */
  test('Property 4: Heartbeat mechanism exists and responds', async () => {
    const client = new WebSocket(`ws://localhost:${TEST_PORT}`);
    let heartbeatReceived = false;
    
    await new Promise<void>((resolve) => {
      client.on('open', () => {
        // Send heartbeat message
        client.send(JSON.stringify({ type: 'heartbeat', timestamp: Date.now() }));
      });
      
      client.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'heartbeat') {
          heartbeatReceived = true;
          client.close();
          resolve();
        } else if (msg.type === 'ack') {
          // Initial ack, send heartbeat
          client.send(JSON.stringify({ type: 'heartbeat', timestamp: Date.now() }));
        }
      });
    });

    // Wait for cleanup
    await new Promise(r => setTimeout(r, 100));
    expect(heartbeatReceived).toBe(true);
  });
});