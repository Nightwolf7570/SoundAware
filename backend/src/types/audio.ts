// Audio types for Node.js environment
// In a real implementation, we'd use Buffer or typed arrays for audio data

export type AudioBuffer = Buffer;

// Helper to create audio buffer from Float32Array
export function createAudioBuffer(data: Float32Array): AudioBuffer {
  const buffer = Buffer.allocUnsafe(data.length * 4);
  for (let i = 0; i < data.length; i++) {
    buffer.writeFloatLE(data[i], i * 4);
  }
  return buffer;
}

// Helper to read Float32Array from audio buffer
export function readAudioBuffer(buffer: AudioBuffer): Float32Array {
  const length = buffer.length / 4;
  const data = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    data[i] = buffer.readFloatLE(i * 4);
  }
  return data;
}