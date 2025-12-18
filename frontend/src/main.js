const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { exec } = require('child_process');

let mainWindow;
let originalVolume = 100;

// Get current system volume (macOS)
function getSystemVolume() {
  return new Promise((resolve) => {
    exec('osascript -e "output volume of (get volume settings)"', (err, stdout) => {
      if (err) {
        resolve(100);
      } else {
        resolve(parseInt(stdout.trim()) || 100);
      }
    });
  });
}

// Set system volume (macOS)
function setSystemVolume(level) {
  return new Promise((resolve) => {
    exec(`osascript -e "set volume output volume ${level}"`, (err) => {
      resolve(!err);
    });
  });
}

// IPC handlers for volume control
ipcMain.handle('volume:get', async () => {
  return await getSystemVolume();
});

ipcMain.handle('volume:set', async (event, level) => {
  return await setSystemVolume(level);
});

ipcMain.handle('volume:dim', async (event, targetLevel) => {
  originalVolume = await getSystemVolume();
  console.log(`Dimming volume from ${originalVolume} to ${targetLevel}`);
  return await setSystemVolume(targetLevel);
});

ipcMain.handle('volume:restore', async () => {
  console.log(`Restoring volume to ${originalVolume}`);
  return await setSystemVolume(originalVolume);
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0b0f10',
    titleBarStyle: 'hiddenInset',
    vibrancy: 'dark',
    visualEffectState: 'active',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  
  // Open DevTools in development
  mainWindow.webContents.openDevTools();
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
