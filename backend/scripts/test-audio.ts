#!/usr/bin/env ts-node
/**
 * Test script to send audio samples to the backend via WebSocket
 * 
 * Usage:
 *   npx ts-node scripts/test-audio.ts [audio-file.wav]
 * 
 * If no audio file is provided, it will send simulated audio data.
 */

import WebSocket from 'ws';
import * as fs from 'fs';
import * as path from 'path';

const WS_URL = process.env.WS_URL || 'ws://localhost:3001';

interface WebSocketMessage {
  type: string;
  payload?: any;
  timestamp: number;
  clientId?: string;
}

async function connectAndTest(audioFilePath?: string) {
  console.log(`Connecting to ${WS_URL}...`);
  
  const ws = new WebSocket(WS_URL);
  
  ws.on('open', () => {
    console.log('Connected to WebSocket server');
  });
  
  ws.on('message', (data: Buffer) => {
    try {
      const message: WebSocketMessage = JSON.parse(data.toString());
      console.log('\n📨 Received:', message.type);
      
      if (message.type === 'ack') {
        console.log('   Client ID:', message.payload.clientId);
        console.log('   Status:', message.payload.status);
        
        // Start sending audio after connection is acknowledged
        setTimeout(() => sendAudio(ws, audioFilePath), 500);
      } else if (message.type === 'transcript') {
        console.log('   📝 Text:', message.payload.text);
        console.log('   Confidence:', (message.payload.confidence * 100).toFixed(1) + '%');
        console.log('   Partial:', message.payload.isPartial);
      } else if (message.type === 'volume_action') {
        console.log('   🔊 Action:', message.payload.type);
        console.log('   Reason:', message.payload.triggerReason);
        console.log('   Confidence:', (message.payload.confidence * 100).toFixed(1) + '%');
      } else {
        console.log('   Payload:', JSON.stringify(message.payload, null, 2));
      }
    } catch {
      console.log('Received binary data:', data.length, 'bytes');
    }
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket error:', error.message);
  });
  
  ws.on('close', () => {
    console.log('\nDisconnected from server');
    process.exit(0);
  });
}

async function sendAudio(ws: WebSocket, audioFilePath?: string) {
  if (audioFilePath && fs.existsSync(audioFilePath)) {
    console.log(`\n🎤 Sending audio file: ${audioFilePath}`);
    await sendAudioFile(ws, audioFilePath);
  } else {
    console.log('\n🎤 Sending simulated audio (sine wave)...');
    await sendSimulatedAudio(ws);
  }
}

async function sendAudioFile(ws: WebSocket, filePath: string) {
  const audioData = fs.readFileSync(filePath);
  
  // Skip WAV header (44 bytes) if it's a WAV file
  const isWav = filePath.toLowerCase().endsWith('.wav');
  const pcmData = isWav ? audioData.slice(44) : audioData;
  
  console.log(`   File size: ${audioData.length} bytes`);
  console.log(`   PCM data: ${pcmData.length} bytes`);
  
  // Send in chunks (simulating real-time streaming)
  const chunkSize = 3200; // 100ms of 16kHz 16-bit mono audio
  const chunkDelayMs = 100;
  
  let offset = 0;
  let chunkCount = 0;
  
  while (offset < pcmData.length) {
    const chunk = pcmData.slice(offset, offset + chunkSize);
    ws.send(chunk);
    offset += chunkSize;
    chunkCount++;
    
    if (chunkCount % 10 === 0) {
      console.log(`   Sent ${chunkCount} chunks (${offset} bytes)`);
    }
    
    await delay(chunkDelayMs);
  }
  
  console.log(`   ✅ Finished sending ${chunkCount} chunks`);
  console.log('\nWaiting for transcription results...');
  console.log('(Press Ctrl+C to exit)\n');
}

async function sendSimulatedAudio(ws: WebSocket) {
  // Generate 5 seconds of simulated audio
  const sampleRate = 16000;
  const durationSec = 5;
  const totalSamples = sampleRate * durationSec;
  
  // Create a buffer with silence (for testing connection)
  const buffer = Buffer.alloc(totalSamples * 2); // 16-bit = 2 bytes per sample
  
  // Add some low-level noise to simulate real audio
  for (let i = 0; i < totalSamples; i++) {
    const noise = Math.floor((Math.random() - 0.5) * 100);
    buffer.writeInt16LE(noise, i * 2);
  }
  
  // Send in chunks
  const chunkSize = 3200;
  const chunkDelayMs = 100;
  
  let offset = 0;
  let chunkCount = 0;
  
  while (offset < buffer.length) {
    const chunk = buffer.slice(offset, offset + chunkSize);
    ws.send(chunk);
    offset += chunkSize;
    chunkCount++;
    
    await delay(chunkDelayMs);
  }
  
  console.log(`   ✅ Sent ${chunkCount} chunks of simulated audio`);
  console.log('\n⚠️  Note: Simulated audio is just noise - no real speech to transcribe');
  console.log('   To test real transcription, provide a WAV file:');
  console.log('   npx ts-node scripts/test-audio.ts path/to/audio.wav\n');
  console.log('(Press Ctrl+C to exit)\n');
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Main
const audioFile = process.argv[2];
if (audioFile && !fs.existsSync(audioFile)) {
  console.error(`Error: Audio file not found: ${audioFile}`);
  process.exit(1);
}

connectAndTest(audioFile);
