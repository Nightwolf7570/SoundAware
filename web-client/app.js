// Simple WebSocket + Audio client for Smart Volume Control
const WS_URL = 'ws://localhost:3001';
const SAMPLE_RATE = 16000;

let ws = null;
let audioContext = null;
let mediaStream = null;
let audioWorklet = null;
let isCapturing = false;

// DOM elements
const wsStatus = document.getElementById('wsStatus');
const wsStatusText = document.getElementById('wsStatusText');
const micStatus = document.getElementById('micStatus');
const audioLevel = document.getElementById('audioLevel');
const connectBtn = document.getElementById('connectBtn');
const micBtn = document.getElementById('micBtn');
const transcriptBox = document.getElementById('transcriptBox');
const debugLog = document.getElementById('debugLog');

// Debug logging
function log(msg, type = 'info') {
  const entry = document.createElement('div');
  entry.className = `debug-entry ${type}`;
  entry.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  debugLog.appendChild(entry);
  debugLog.scrollTop = debugLog.scrollHeight;
  console.log(msg);
}

// WebSocket connection
function connect() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    log('Already connected', 'error');
    return;
  }

  log(`Connecting to ${WS_URL}...`);
  wsStatus.className = 'status-dot connecting';
  wsStatusText.textContent = 'Connecting...';
  connectBtn.disabled = true;

  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    log('WebSocket connected!', 'success');
    wsStatus.className = 'status-dot connected';
    wsStatusText.textContent = 'Connected';
    connectBtn.textContent = 'Disconnect';
    connectBtn.className = 'btn-danger';
    connectBtn.disabled = false;
    micBtn.disabled = false;
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      log(`Received: ${msg.type}`);
      
      if (msg.type === 'transcript') {
        addTranscript(msg.text, msg.isFinal, msg.timestamp);
      } else if (msg.type === 'decision') {
        log(`Volume decision: ${msg.decision}`, 'success');
      } else if (msg.type === 'ack') {
        log(`Server acknowledged: ${msg.payload?.status}`, 'success');
      }
    } catch (e) {
      log(`Parse error: ${e.message}`, 'error');
    }
  };

  ws.onerror = (error) => {
    log(`WebSocket error`, 'error');
  };

  ws.onclose = () => {
    log('WebSocket disconnected');
    wsStatus.className = 'status-dot disconnected';
    wsStatusText.textContent = 'Disconnected';
    connectBtn.textContent = 'Connect to Server';
    connectBtn.className = 'btn-primary';
    connectBtn.disabled = false;
    micBtn.disabled = true;
    ws = null;
  };
}

function disconnect() {
  if (ws) {
    ws.close();
    ws = null;
  }
  stopMicrophone();
}

// Transcript display
function addTranscript(text, isFinal, timestamp) {
  // Remove empty state
  const emptyState = transcriptBox.querySelector('.empty-state');
  if (emptyState) emptyState.remove();

  // Remove previous partial if this is final
  if (isFinal) {
    const partials = transcriptBox.querySelectorAll('.partial');
    partials.forEach(p => p.remove());
  }

  const entry = document.createElement('div');
  entry.className = `transcript-entry ${isFinal ? '' : 'partial'}`;
  
  const time = document.createElement('div');
  time.className = 'transcript-time';
  time.textContent = new Date(timestamp).toLocaleTimeString();
  
  const textEl = document.createElement('div');
  textEl.className = 'transcript-text';
  textEl.textContent = text;
  
  entry.appendChild(time);
  entry.appendChild(textEl);
  transcriptBox.appendChild(entry);
  transcriptBox.scrollTop = transcriptBox.scrollHeight;
}


// Audio capture using ScriptProcessor (simpler than AudioWorklet for testing)
async function startMicrophone() {
  if (isCapturing) return;

  try {
    log('Requesting microphone access...');
    mediaStream = await navigator.mediaDevices.getUserMedia({ 
      audio: { 
        sampleRate: SAMPLE_RATE,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true
      } 
    });

    audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
    const source = audioContext.createMediaStreamSource(mediaStream);
    
    // Use ScriptProcessor for simplicity (deprecated but works everywhere)
    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    
    processor.onaudioprocess = (e) => {
      if (!isCapturing || !ws || ws.readyState !== WebSocket.OPEN) return;
      
      const inputData = e.inputBuffer.getChannelData(0);
      
      // Calculate audio level for visualization
      let sum = 0;
      for (let i = 0; i < inputData.length; i++) {
        sum += inputData[i] * inputData[i];
      }
      const rms = Math.sqrt(sum / inputData.length);
      const level = Math.min(100, rms * 500);
      audioLevel.style.width = level + '%';
      
      // Convert Float32 to base64 and send
      const base64 = float32ToBase64(inputData);
      const msg = {
        type: 'audio',
        data: base64,
        timestamp: Date.now(),
        sampleRate: SAMPLE_RATE
      };
      ws.send(JSON.stringify(msg));
    };

    source.connect(processor);
    processor.connect(audioContext.destination);
    
    isCapturing = true;
    micStatus.textContent = 'Capturing';
    micBtn.textContent = 'Stop Microphone';
    micBtn.className = 'btn-danger';
    log('Microphone started!', 'success');
    
  } catch (err) {
    log(`Microphone error: ${err.message}`, 'error');
  }
}

function stopMicrophone() {
  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
    mediaStream = null;
  }
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
  isCapturing = false;
  micStatus.textContent = 'Not capturing';
  audioLevel.style.width = '0%';
  micBtn.textContent = 'Start Microphone';
  micBtn.className = 'btn-primary';
  log('Microphone stopped');
}

// Convert Float32Array to base64
function float32ToBase64(float32Array) {
  const bytes = new Uint8Array(float32Array.buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Event listeners
connectBtn.addEventListener('click', () => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    disconnect();
  } else {
    connect();
  }
});

micBtn.addEventListener('click', () => {
  if (isCapturing) {
    stopMicrophone();
  } else {
    startMicrophone();
  }
});

// Initial state
wsStatus.className = 'status-dot disconnected';
log('Ready. Click "Connect to Server" to start.');
