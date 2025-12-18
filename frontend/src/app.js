// ============================================
// CONVERSATIONAL AWARE AUDIO - APP
// ============================================

const WS_URL = 'ws://localhost:3001';
const SAMPLE_RATE = 16000;

// State
let ws = null;
let audioContext = null;
let mediaStream = null;
let isCapturing = false;
let currentVolume = 100;
let currentState = 'idle'; // idle, maybe, detected, ignored

// DOM Elements
const statusSubtitle = document.getElementById('statusSubtitle');
const statusLine = document.getElementById('statusLine');
const volumeOrb = document.getElementById('volumeOrb');
const orbGlow = document.getElementById('orbGlow');
const volumeValue = document.getElementById('volumeValue');
const orbStatus = document.getElementById('orbStatus');
const transcriptFeed = document.getElementById('transcriptFeed');
const connectionIndicator = document.getElementById('connectionIndicator');
const connectionText = document.getElementById('connectionText');
const profilesBtn = document.getElementById('profilesBtn');
const profilesModal = document.getElementById('profilesModal');
const closeModal = document.getElementById('closeModal');
const sensitivitySlider = document.getElementById('sensitivitySlider');

// ============================================
// WEBSOCKET CONNECTION
// ============================================

function connect() {
  if (ws && ws.readyState === WebSocket.OPEN) return;

  updateConnectionStatus('connecting');
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    console.log('WebSocket connected');
    updateConnectionStatus('connected');
    updateStatus('Listening through microphone...', 'idle');
    startMicrophone();
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      handleServerMessage(msg);
    } catch (e) {
      console.error('Parse error:', e);
    }
  };

  ws.onerror = () => {
    console.error('WebSocket error');
  };

  ws.onclose = () => {
    console.log('WebSocket disconnected');
    updateConnectionStatus('disconnected');
    updateStatus('Disconnected', 'idle');
    stopMicrophone();
    
    // Auto-reconnect after 3 seconds
    setTimeout(() => {
      if (!ws || ws.readyState === WebSocket.CLOSED) {
        connect();
      }
    }, 3000);
  };
}

function handleServerMessage(msg) {
  switch (msg.type) {
    case 'transcript':
      addTranscript(msg.text, msg.isFinal, msg.timestamp);
      break;
    case 'decision':
      handleVolumeDecision(msg.decision, msg.triggerPhrase);
      break;
    case 'ack':
      console.log('Server acknowledged connection');
      break;
  }
}

function updateConnectionStatus(status) {
  connectionIndicator.className = 'status-indicator ' + status;
  connectionText.textContent = status.charAt(0).toUpperCase() + status.slice(1);
}

// ============================================
// STATUS & STATE MANAGEMENT
// ============================================

function updateStatus(text, state) {
  statusSubtitle.textContent = text;
  currentState = state;
  
  // Update status line
  statusLine.className = 'status-line ' + state;
  
  // Update orb
  volumeOrb.className = 'orb ' + state;
  orbGlow.className = 'orb-glow ' + state;
}

async function handleVolumeDecision(decision, triggerPhrase) {
  if (decision === 'LOWER_VOLUME') {
    updateStatus('Conversation detected', 'detected');
    
    // Actually lower system volume!
    if (window.volumeControl) {
      await window.volumeControl.dim(20); // Dim to 20%
    }
    
    setVolumeDisplay(20);
    orbStatus.textContent = 'Volume Lowered';
    console.log('Volume lowered - conversation detected:', triggerPhrase);
  } else if (decision === 'RESTORE_VOLUME') {
    updateStatus('Listening through microphone...', 'idle');
    
    // Restore system volume!
    if (window.volumeControl) {
      await window.volumeControl.restore();
      const vol = await window.volumeControl.get();
      setVolumeDisplay(vol);
    } else {
      setVolumeDisplay(100);
    }
    
    orbStatus.textContent = 'System Volume';
    console.log('Volume restored');
  }
}

function setVolumeDisplay(level) {
  currentVolume = level;
  volumeValue.textContent = level;
  
  // Animate orb size based on volume
  const scale = 0.7 + (level / 100) * 0.3;
  volumeOrb.style.transform = `scale(${scale})`;
  
  if (level < 50) {
    volumeOrb.classList.add('dimmed');
  } else {
    volumeOrb.classList.remove('dimmed');
  }
}

// Alias for backward compatibility
function setVolume(level) {
  setVolumeDisplay(level);
}


// ============================================
// TRANSCRIPT FEED
// ============================================

function addTranscript(text, isFinal, timestamp) {
  // Remove empty state if present
  const emptyState = transcriptFeed.querySelector('.empty-state');
  if (emptyState) emptyState.remove();

  // Remove previous partial transcripts if this is final
  if (isFinal) {
    const partials = transcriptFeed.querySelectorAll('.transcript-entry.partial');
    partials.forEach(p => p.remove());
  }

  // Determine state based on content (simplified - backend should send this)
  let entryState = 'background';
  const lowerText = text.toLowerCase();
  if (lowerText.includes('hey') || lowerText.includes('excuse me') || lowerText.includes('hello')) {
    entryState = 'detected';
  }

  const entry = document.createElement('div');
  entry.className = `transcript-entry ${isFinal ? entryState : 'partial'}`;
  
  entry.innerHTML = `
    <div class="transcript-text">${escapeHtml(text)}</div>
    <div class="transcript-meta">
      <span class="transcript-time">${formatTime(timestamp)}</span>
      ${isFinal ? `<span class="transcript-tag ${entryState}">${entryState === 'detected' ? 'Detected' : 'Background'}</span>` : ''}
    </div>
  `;
  
  transcriptFeed.appendChild(entry);
  transcriptFeed.scrollTop = transcriptFeed.scrollHeight;
  
  // Update status briefly when speech detected
  if (isFinal && entryState === 'detected') {
    updateStatus('Speech directed at you', 'detected');
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ============================================
// AUDIO CAPTURE (using AudioWorklet)
// ============================================

let audioWorkletNode = null;
let analyser = null;

async function startMicrophone() {
  if (isCapturing) return;

  try {
    console.log('Requesting microphone access...');
    mediaStream = await navigator.mediaDevices.getUserMedia({ 
      audio: { 
        sampleRate: SAMPLE_RATE,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true
      } 
    });

    audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
    
    // Load AudioWorklet module
    await audioContext.audioWorklet.addModule('audio-processor.js');
    
    const source = audioContext.createMediaStreamSource(mediaStream);
    
    // Create analyser for visualization
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    
    // Create AudioWorklet node
    audioWorkletNode = new AudioWorkletNode(audioContext, 'audio-processor');
    
    // Handle audio data from worklet
    audioWorkletNode.port.onmessage = (event) => {
      if (!isCapturing || !ws || ws.readyState !== WebSocket.OPEN) return;
      
      if (event.data.type === 'audio') {
        const audioData = event.data.data;
        
        // Update visualization
        if (analyser) {
          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          analyser.getByteFrequencyData(dataArray);
          const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
          updateAudioVisualization(average / 255);
        }
        
        // Send audio to server
        const base64 = float32ToBase64(audioData);
        ws.send(JSON.stringify({
          type: 'audio',
          data: base64,
          timestamp: Date.now(),
          sampleRate: SAMPLE_RATE
        }));
      }
    };

    // Connect nodes
    source.connect(analyser);
    source.connect(audioWorkletNode);
    audioWorkletNode.connect(audioContext.destination);
    
    isCapturing = true;
    console.log('Microphone started with AudioWorklet');
    
  } catch (err) {
    console.error('Microphone error:', err);
    updateStatus('Microphone access denied', 'ignored');
  }
}

function stopMicrophone() {
  if (audioWorkletNode) {
    audioWorkletNode.disconnect();
    audioWorkletNode = null;
  }
  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
    mediaStream = null;
  }
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
  analyser = null;
  isCapturing = false;
}

function updateAudioVisualization(level) {
  // Subtle pulse effect on orb based on audio level
  const pulseScale = 1 + (level * 0.05);
  orbGlow.style.transform = `scale(${pulseScale})`;
}

function float32ToBase64(float32Array) {
  const bytes = new Uint8Array(float32Array.buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// ============================================
// MODAL
// ============================================

profilesBtn.addEventListener('click', () => {
  profilesModal.classList.add('active');
});

closeModal.addEventListener('click', () => {
  profilesModal.classList.remove('active');
});

profilesModal.addEventListener('click', (e) => {
  if (e.target === profilesModal) {
    profilesModal.classList.remove('active');
  }
});

// ============================================
// SETTINGS
// ============================================

sensitivitySlider.addEventListener('input', (e) => {
  const level = e.target.value;
  console.log('Sensitivity:', level);
  // TODO: Send to backend
});

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
  updateStatus('Connecting...', 'idle');
  
  // Get current system volume
  if (window.volumeControl) {
    const vol = await window.volumeControl.get();
    setVolumeDisplay(vol);
    console.log('Current system volume:', vol);
  } else {
    setVolumeDisplay(100);
  }
  
  // Auto-connect on load
  setTimeout(connect, 500);
});

// Handle page visibility
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && (!ws || ws.readyState !== WebSocket.OPEN)) {
    connect();
  }
});
