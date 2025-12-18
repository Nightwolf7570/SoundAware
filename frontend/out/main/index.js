"use strict";
const electron = require("electron");
const path = require("path");
const utils = require("@electron-toolkit/utils");
const Store = require("electron-store");
const child_process = require("child_process");
const util = require("util");
const uuid = require("uuid");
const Database = require("better-sqlite3");
const IPC_CHANNELS = {
  // Volume control channels
  VOLUME: {
    GET: "volume:get",
    SET: "volume:set",
    DIM: "volume:dim",
    RESTORE: "volume:restore",
    STATUS: "volume:status"
  },
  // Chat history channels
  HISTORY: {
    SAVE: "history:save",
    QUERY: "history:query",
    DELETE: "history:delete",
    COUNT: "history:count"
  },
  // Settings channels
  SETTINGS: {
    GET: "settings:get",
    SET: "settings:set"
  },
  // Platform channels
  PLATFORM: {
    GET: "platform:get"
  }
};
const DEFAULT_SETTINGS = {
  serverUrl: "ws://localhost:8080",
  dimLevel: 20,
  selectedDeviceId: null,
  transitionDuration: 200
};
const settingsSchema = {
  serverUrl: {
    type: "string",
    default: DEFAULT_SETTINGS.serverUrl
  },
  dimLevel: {
    type: "number",
    minimum: 0,
    maximum: 100,
    default: DEFAULT_SETTINGS.dimLevel
  },
  selectedDeviceId: {
    type: ["string", "null"],
    default: DEFAULT_SETTINGS.selectedDeviceId
  },
  transitionDuration: {
    type: "number",
    minimum: 0,
    default: DEFAULT_SETTINGS.transitionDuration
  }
};
class SettingsManager {
  store;
  constructor(storeName) {
    this.store = new Store({
      name: storeName || "settings",
      schema: settingsSchema,
      defaults: DEFAULT_SETTINGS
    });
  }
  /**
   * Get a single setting value by key
   * @param key - The setting key to retrieve
   * @returns The setting value
   */
  get(key) {
    return this.store.get(key);
  }
  /**
   * Set a single setting value
   * Changes are persisted immediately (Requirement 7.3)
   * @param key - The setting key to update
   * @param value - The new value
   */
  set(key, value) {
    this.store.set(key, value);
  }
  /**
   * Get all settings
   * @returns Complete AppSettings object
   */
  getAll() {
    return {
      serverUrl: this.store.get("serverUrl"),
      dimLevel: this.store.get("dimLevel"),
      selectedDeviceId: this.store.get("selectedDeviceId"),
      transitionDuration: this.store.get("transitionDuration")
    };
  }
  /**
   * Update multiple settings at once
   * Changes are persisted immediately (Requirement 7.3)
   * @param settings - Partial settings object with values to update
   */
  setAll(settings) {
    for (const [key, value] of Object.entries(settings)) {
      if (value !== void 0) {
        this.store.set(key, value);
      }
    }
  }
  /**
   * Reset all settings to default values
   */
  reset() {
    this.store.clear();
  }
  /**
   * Get the path to the settings file (useful for testing/debugging)
   */
  getStorePath() {
    return this.store.path;
  }
}
let settingsManagerInstance = null;
function getSettingsManager() {
  if (!settingsManagerInstance) {
    settingsManagerInstance = new SettingsManager();
  }
  return settingsManagerInstance;
}
class OSAdapterError extends Error {
  constructor(message, platform, troubleshooting) {
    super(message);
    this.platform = platform;
    this.troubleshooting = troubleshooting;
    this.name = "OSAdapterError";
  }
}
const execAsync$2 = util.promisify(child_process.exec);
class WindowsVolumeAdapter {
  platform = "win32";
  /**
   * Check if this adapter is supported (running on Windows)
   */
  isSupported() {
    return process.platform === "win32";
  }
  /**
   * Get the current system volume level using PowerShell
   * @returns Promise resolving to volume level (0-100)
   */
  async getSystemVolume() {
    if (!this.isSupported()) {
      throw new OSAdapterError(
        "Windows volume adapter is not supported on this platform",
        "win32",
        "This adapter only works on Windows operating systems."
      );
    }
    try {
      const script = `
        Add-Type -TypeDefinition @'
        using System.Runtime.InteropServices;
        [Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IAudioEndpointVolume {
            int _0(); int _1(); int _2(); int _3();
            int SetMasterVolumeLevelScalar(float fLevel, System.Guid pguidEventContext);
            int _5();
            int GetMasterVolumeLevelScalar(out float pfLevel);
            int _7(); int _8(); int _9(); int _10(); int _11(); int _12();
        }
        [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IMMDevice { int Activate(ref System.Guid iid, int dwClsCtx, IntPtr pActivationParams, out IAudioEndpointVolume ppInterface); }
        [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IMMDeviceEnumerator { int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice ppDevice); }
        [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumerator { }
        public class Audio {
            static IAudioEndpointVolume Vol() {
                var enumerator = new MMDeviceEnumerator() as IMMDeviceEnumerator;
                IMMDevice dev; enumerator.GetDefaultAudioEndpoint(0, 1, out dev);
                IAudioEndpointVolume vol; var guid = typeof(IAudioEndpointVolume).GUID;
                dev.Activate(ref guid, 1, IntPtr.Zero, out vol); return vol;
            }
            public static float GetVolume() { float v; Vol().GetMasterVolumeLevelScalar(out v); return v; }
            public static void SetVolume(float v) { Vol().SetMasterVolumeLevelScalar(v, System.Guid.Empty); }
        }
'@
        [Math]::Round([Audio]::GetVolume() * 100)
      `;
      const { stdout } = await execAsync$2(`powershell -NoProfile -Command "${script.replace(/"/g, '\\"').replace(/\n/g, " ")}"`);
      const volume = parseInt(stdout.trim(), 10);
      if (isNaN(volume) || volume < 0 || volume > 100) {
        throw new Error("Invalid volume value received");
      }
      return volume;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new OSAdapterError(
        `Failed to get system volume: ${message}`,
        "win32",
        "Ensure you have permission to access audio devices. Try running the application as administrator if the issue persists."
      );
    }
  }
  /**
   * Set the system volume level using PowerShell
   * @param level - Volume level to set (0-100)
   */
  async setSystemVolume(level) {
    if (!this.isSupported()) {
      throw new OSAdapterError(
        "Windows volume adapter is not supported on this platform",
        "win32",
        "This adapter only works on Windows operating systems."
      );
    }
    const clampedLevel = Math.max(0, Math.min(100, Math.round(level)));
    const volumeScalar = clampedLevel / 100;
    try {
      const script = `
        Add-Type -TypeDefinition @'
        using System.Runtime.InteropServices;
        [Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IAudioEndpointVolume {
            int _0(); int _1(); int _2(); int _3();
            int SetMasterVolumeLevelScalar(float fLevel, System.Guid pguidEventContext);
            int _5();
            int GetMasterVolumeLevelScalar(out float pfLevel);
            int _7(); int _8(); int _9(); int _10(); int _11(); int _12();
        }
        [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IMMDevice { int Activate(ref System.Guid iid, int dwClsCtx, IntPtr pActivationParams, out IAudioEndpointVolume ppInterface); }
        [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IMMDeviceEnumerator { int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice ppDevice); }
        [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumerator { }
        public class Audio {
            static IAudioEndpointVolume Vol() {
                var enumerator = new MMDeviceEnumerator() as IMMDeviceEnumerator;
                IMMDevice dev; enumerator.GetDefaultAudioEndpoint(0, 1, out dev);
                IAudioEndpointVolume vol; var guid = typeof(IAudioEndpointVolume).GUID;
                dev.Activate(ref guid, 1, IntPtr.Zero, out vol); return vol;
            }
            public static float GetVolume() { float v; Vol().GetMasterVolumeLevelScalar(out v); return v; }
            public static void SetVolume(float v) { Vol().SetMasterVolumeLevelScalar(v, System.Guid.Empty); }
        }
'@
        [Audio]::SetVolume(${volumeScalar})
      `;
      await execAsync$2(`powershell -NoProfile -Command "${script.replace(/"/g, '\\"').replace(/\n/g, " ")}"`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new OSAdapterError(
        `Failed to set system volume: ${message}`,
        "win32",
        "Ensure you have permission to control audio devices. Try running the application as administrator if the issue persists."
      );
    }
  }
}
const execAsync$1 = util.promisify(child_process.exec);
class MacOSVolumeAdapter {
  platform = "darwin";
  /**
   * Check if this adapter is supported (running on macOS)
   */
  isSupported() {
    return process.platform === "darwin";
  }
  /**
   * Get the current system volume level using osascript
   * @returns Promise resolving to volume level (0-100)
   */
  async getSystemVolume() {
    if (!this.isSupported()) {
      throw new OSAdapterError(
        "macOS volume adapter is not supported on this platform",
        "darwin",
        "This adapter only works on macOS operating systems."
      );
    }
    try {
      const { stdout } = await execAsync$1('osascript -e "output volume of (get volume settings)"');
      const volume = parseInt(stdout.trim(), 10);
      if (isNaN(volume) || volume < 0 || volume > 100) {
        throw new Error("Invalid volume value received");
      }
      return volume;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new OSAdapterError(
        `Failed to get system volume: ${message}`,
        "darwin",
        "Ensure the application has permission to control system audio. Check System Preferences > Security & Privacy > Privacy > Automation."
      );
    }
  }
  /**
   * Set the system volume level using osascript
   * @param level - Volume level to set (0-100)
   */
  async setSystemVolume(level) {
    if (!this.isSupported()) {
      throw new OSAdapterError(
        "macOS volume adapter is not supported on this platform",
        "darwin",
        "This adapter only works on macOS operating systems."
      );
    }
    const clampedLevel = Math.max(0, Math.min(100, Math.round(level)));
    try {
      await execAsync$1(`osascript -e "set volume output volume ${clampedLevel}"`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new OSAdapterError(
        `Failed to set system volume: ${message}`,
        "darwin",
        "Ensure the application has permission to control system audio. Check System Preferences > Security & Privacy > Privacy > Automation."
      );
    }
  }
}
const execAsync = util.promisify(child_process.exec);
class LinuxVolumeAdapter {
  platform = "linux";
  usePulseAudio = null;
  /**
   * Check if this adapter is supported (running on Linux)
   */
  isSupported() {
    return process.platform === "linux";
  }
  /**
   * Detect whether PulseAudio is available
   * Falls back to ALSA (amixer) if not
   */
  async detectAudioSystem() {
    if (this.usePulseAudio !== null) {
      return this.usePulseAudio;
    }
    try {
      await execAsync("pactl --version");
      this.usePulseAudio = true;
      return true;
    } catch {
      this.usePulseAudio = false;
      return false;
    }
  }
  /**
   * Get the current system volume level
   * Uses pactl for PulseAudio or amixer for ALSA
   * @returns Promise resolving to volume level (0-100)
   */
  async getSystemVolume() {
    if (!this.isSupported()) {
      throw new OSAdapterError(
        "Linux volume adapter is not supported on this platform",
        "linux",
        "This adapter only works on Linux operating systems."
      );
    }
    const usePulse = await this.detectAudioSystem();
    try {
      if (usePulse) {
        return await this.getVolumePulseAudio();
      } else {
        return await this.getVolumeALSA();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new OSAdapterError(
        `Failed to get system volume: ${message}`,
        "linux",
        'Ensure PulseAudio or ALSA is properly configured. Try running "pactl info" or "amixer" to verify audio system status.'
      );
    }
  }
  /**
   * Get volume using PulseAudio (pactl)
   */
  async getVolumePulseAudio() {
    const { stdout } = await execAsync(
      "pactl get-sink-volume @DEFAULT_SINK@ | grep -oP '\\d+%' | head -1 | tr -d '%'"
    );
    const volume = parseInt(stdout.trim(), 10);
    if (isNaN(volume)) {
      throw new Error("Could not parse PulseAudio volume");
    }
    return Math.min(100, Math.max(0, volume));
  }
  /**
   * Get volume using ALSA (amixer)
   */
  async getVolumeALSA() {
    const { stdout } = await execAsync(
      "amixer get Master | grep -oP '\\[\\d+%\\]' | head -1 | tr -d '[]%'"
    );
    const volume = parseInt(stdout.trim(), 10);
    if (isNaN(volume)) {
      throw new Error("Could not parse ALSA volume");
    }
    return Math.min(100, Math.max(0, volume));
  }
  /**
   * Set the system volume level
   * Uses pactl for PulseAudio or amixer for ALSA
   * @param level - Volume level to set (0-100)
   */
  async setSystemVolume(level) {
    if (!this.isSupported()) {
      throw new OSAdapterError(
        "Linux volume adapter is not supported on this platform",
        "linux",
        "This adapter only works on Linux operating systems."
      );
    }
    const clampedLevel = Math.max(0, Math.min(100, Math.round(level)));
    const usePulse = await this.detectAudioSystem();
    try {
      if (usePulse) {
        await this.setVolumePulseAudio(clampedLevel);
      } else {
        await this.setVolumeALSA(clampedLevel);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new OSAdapterError(
        `Failed to set system volume: ${message}`,
        "linux",
        'Ensure you have permission to control audio. You may need to add your user to the "audio" group.'
      );
    }
  }
  /**
   * Set volume using PulseAudio (pactl)
   */
  async setVolumePulseAudio(level) {
    await execAsync(`pactl set-sink-volume @DEFAULT_SINK@ ${level}%`);
  }
  /**
   * Set volume using ALSA (amixer)
   */
  async setVolumeALSA(level) {
    await execAsync(`amixer set Master ${level}%`);
  }
}
class OSAdapterFactory {
  /**
   * Detect the current operating system platform
   * @returns The detected platform
   */
  static detectPlatform() {
    const platform = process.platform;
    if (platform === "win32") return "win32";
    if (platform === "darwin") return "darwin";
    return "linux";
  }
  /**
   * Create an OS adapter for the specified platform
   * @param platform - The platform to create an adapter for
   * @returns The appropriate IOSAdapter implementation
   */
  static createAdapter(platform) {
    switch (platform) {
      case "win32":
        return new WindowsVolumeAdapter();
      case "darwin":
        return new MacOSVolumeAdapter();
      case "linux":
        return new LinuxVolumeAdapter();
      default:
        const _exhaustive = platform;
        throw new Error(`Unsupported platform: ${_exhaustive}`);
    }
  }
  /**
   * Create an OS adapter for the current platform
   * Combines platform detection with adapter creation
   * @returns The appropriate IOSAdapter for the current OS
   */
  static createForCurrentPlatform() {
    const platform = this.detectPlatform();
    return this.createAdapter(platform);
  }
}
let adapterInstance = null;
function getOSAdapter() {
  if (!adapterInstance) {
    adapterInstance = OSAdapterFactory.createForCurrentPlatform();
  }
  return adapterInstance;
}
const DEFAULT_CONFIG = {
  dimLevel: 20,
  transitionDuration: 200
};
class VolumeController {
  adapter;
  config;
  currentLevel = 100;
  previousLevel = 100;
  state = "normal";
  constructor(adapter, config) {
    this.adapter = adapter ?? getOSAdapter();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }
  /**
   * Get the current system volume level
   * @returns Volume level (0-100)
   */
  async getVolume() {
    const level = await this.adapter.getSystemVolume();
    this.currentLevel = level;
    return level;
  }
  /**
   * Set the system volume level
   * @param level - Target volume level (0-100)
   * @param smooth - Whether to apply smooth transition (default: false)
   * Requirements: 3.4
   */
  async setVolume(level, smooth = false) {
    const clampedLevel = Math.max(0, Math.min(100, level));
    if (smooth && this.config.transitionDuration > 0) {
      await this.smoothTransition(clampedLevel);
    } else {
      await this.adapter.setSystemVolume(clampedLevel);
    }
    this.currentLevel = clampedLevel;
  }
  /**
   * Dim the volume to a target level, storing the current level for later restore
   * @param targetLevel - Target dim level (0-100)
   * Requirements: 3.1
   */
  async dimVolume(targetLevel) {
    if (this.state === "dimmed") {
      await this.setVolume(targetLevel, true);
      return;
    }
    this.previousLevel = await this.getVolume();
    await this.setVolume(targetLevel, true);
    this.state = "dimmed";
  }
  /**
   * Restore the volume to the level before dimming
   * Requirements: 3.2
   */
  async restoreVolume() {
    if (this.state === "normal") {
      return;
    }
    await this.setVolume(this.previousLevel, true);
    this.state = "normal";
  }
  /**
   * Get the current volume status
   * @returns VolumeStatus with current level, previous level, and state
   */
  getStatus() {
    return {
      currentLevel: this.currentLevel,
      previousLevel: this.previousLevel,
      state: this.state
    };
  }
  /**
   * Apply a smooth volume transition over the configured duration
   * @param targetLevel - Target volume level
   * Requirements: 3.4
   */
  async smoothTransition(targetLevel) {
    const startLevel = this.currentLevel;
    const diff = targetLevel - startLevel;
    if (diff === 0) {
      return;
    }
    const steps = 10;
    const stepDuration = this.config.transitionDuration / steps;
    const stepSize = diff / steps;
    for (let i = 1; i <= steps; i++) {
      const intermediateLevel = Math.round(startLevel + stepSize * i);
      await this.adapter.setSystemVolume(intermediateLevel);
      if (i < steps) {
        await this.sleep(stepDuration);
      }
    }
  }
  /**
   * Sleep for a specified duration
   * @param ms - Duration in milliseconds
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  /**
   * Update the configuration
   * @param config - Partial configuration to update
   */
  updateConfig(config) {
    this.config = { ...this.config, ...config };
  }
}
let volumeControllerInstance = null;
function getVolumeController() {
  if (!volumeControllerInstance) {
    volumeControllerInstance = new VolumeController();
  }
  return volumeControllerInstance;
}
let db = null;
const CHAT_HISTORY_SCHEMA = `
CREATE TABLE IF NOT EXISTS chat_history (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  text TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  trigger_phrase TEXT,
  decision TEXT CHECK(decision IN ('LOWER_VOLUME', 'RESTORE_VOLUME') OR decision IS NULL),
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_chat_history_timestamp ON chat_history(timestamp);
CREATE INDEX IF NOT EXISTS idx_chat_history_session ON chat_history(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_history_text ON chat_history(text);
`;
function getDatabasePath(customPath) {
  try {
    return path.join(electron.app.getPath("userData"), "chat-history.db");
  } catch {
    return ":memory:";
  }
}
function initializeDatabase(dbPath) {
  if (db) {
    return db;
  }
  const path2 = getDatabasePath();
  db = new Database(path2);
  db.pragma("journal_mode = WAL");
  db.exec(CHAT_HISTORY_SCHEMA);
  return db;
}
function getDatabase() {
  if (!db) {
    return initializeDatabase();
  }
  return db;
}
function rowToEntry(row) {
  return {
    id: row.id,
    sessionId: row.session_id,
    text: row.text,
    timestamp: row.timestamp,
    triggerPhrase: row.trigger_phrase,
    decision: row.decision
  };
}
class ChatHistoryRepository {
  db;
  constructor(database) {
    this.db = database || getDatabase();
  }
  /**
   * Save a new chat history entry
   * Requirement 5.1: Persist transcript data to the database
   * @param entry - Entry data without id
   * @returns The saved entry with generated id
   */
  save(entry) {
    const id = uuid.v4();
    const stmt = this.db.prepare(`
      INSERT INTO chat_history (id, session_id, text, timestamp, trigger_phrase, decision)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      id,
      entry.sessionId,
      entry.text,
      entry.timestamp,
      entry.triggerPhrase,
      entry.decision
    );
    return {
      id,
      ...entry
    };
  }
  /**
   * Find all entries matching the query criteria
   * Requirements: 5.2, 5.3, 5.4
   * @param query - Optional query parameters for filtering
   * @returns Array of matching entries
   */
  findAll(query) {
    const conditions = [];
    const params = [];
    if (query?.startDate !== void 0) {
      conditions.push("timestamp >= ?");
      params.push(query.startDate);
    }
    if (query?.endDate !== void 0) {
      conditions.push("timestamp <= ?");
      params.push(query.endDate);
    }
    if (query?.searchText) {
      conditions.push("text LIKE ?");
      params.push(`%${query.searchText}%`);
    }
    let sql = "SELECT * FROM chat_history";
    if (conditions.length > 0) {
      sql += " WHERE " + conditions.join(" AND ");
    }
    sql += " ORDER BY timestamp DESC";
    if (query?.limit !== void 0) {
      sql += " LIMIT ?";
      params.push(query.limit);
    }
    if (query?.offset !== void 0) {
      sql += " OFFSET ?";
      params.push(query.offset);
    }
    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params);
    return rows.map(rowToEntry);
  }
  /**
   * Find a single entry by id
   * Requirement 5.2: Display stored conversations
   * @param id - The entry id to find
   * @returns The entry or null if not found
   */
  findById(id) {
    const stmt = this.db.prepare("SELECT * FROM chat_history WHERE id = ?");
    const row = stmt.get(id);
    return row ? rowToEntry(row) : null;
  }
  /**
   * Delete an entry by id
   * Requirement 5.5: Remove selected history entries
   * @param id - The entry id to delete
   * @returns true if entry was deleted, false if not found
   */
  delete(id) {
    const stmt = this.db.prepare("DELETE FROM chat_history WHERE id = ?");
    const result = stmt.run(id);
    return result.changes > 0;
  }
  /**
   * Delete entries within a date range
   * @param startDate - Start timestamp (inclusive)
   * @param endDate - End timestamp (inclusive)
   * @returns Number of entries deleted
   */
  deleteByDateRange(startDate, endDate) {
    const stmt = this.db.prepare(
      "DELETE FROM chat_history WHERE timestamp >= ? AND timestamp <= ?"
    );
    const result = stmt.run(startDate, endDate);
    return result.changes;
  }
  /**
   * Count entries matching the query criteria
   * @param query - Optional query parameters for filtering
   * @returns Number of matching entries
   */
  count(query) {
    const conditions = [];
    const params = [];
    if (query?.startDate !== void 0) {
      conditions.push("timestamp >= ?");
      params.push(query.startDate);
    }
    if (query?.endDate !== void 0) {
      conditions.push("timestamp <= ?");
      params.push(query.endDate);
    }
    if (query?.searchText) {
      conditions.push("text LIKE ?");
      params.push(`%${query.searchText}%`);
    }
    let sql = "SELECT COUNT(*) as count FROM chat_history";
    if (conditions.length > 0) {
      sql += " WHERE " + conditions.join(" AND ");
    }
    const stmt = this.db.prepare(sql);
    const result = stmt.get(...params);
    return result.count;
  }
}
let repositoryInstance = null;
function getChatHistoryRepository() {
  if (!repositoryInstance) {
    repositoryInstance = new ChatHistoryRepository();
  }
  return repositoryInstance;
}
function registerIPCHandlers() {
  initializeDatabase();
  electron.ipcMain.handle(IPC_CHANNELS.VOLUME.GET, async () => {
    const volumeController = getVolumeController();
    return volumeController.getVolume();
  });
  electron.ipcMain.handle(IPC_CHANNELS.VOLUME.SET, async (_event, level) => {
    const volumeController = getVolumeController();
    await volumeController.setVolume(level);
  });
  electron.ipcMain.handle(IPC_CHANNELS.VOLUME.DIM, async (_event, targetLevel) => {
    const volumeController = getVolumeController();
    await volumeController.dimVolume(targetLevel);
  });
  electron.ipcMain.handle(IPC_CHANNELS.VOLUME.RESTORE, async () => {
    const volumeController = getVolumeController();
    await volumeController.restoreVolume();
  });
  electron.ipcMain.handle(IPC_CHANNELS.VOLUME.STATUS, async () => {
    const volumeController = getVolumeController();
    return volumeController.getStatus();
  });
  electron.ipcMain.handle(
    IPC_CHANNELS.HISTORY.SAVE,
    async (_event, entry) => {
      const repository = getChatHistoryRepository();
      return repository.save(entry);
    }
  );
  electron.ipcMain.handle(
    IPC_CHANNELS.HISTORY.QUERY,
    async (_event, query) => {
      const repository = getChatHistoryRepository();
      return repository.findAll(query);
    }
  );
  electron.ipcMain.handle(IPC_CHANNELS.HISTORY.DELETE, async (_event, id) => {
    const repository = getChatHistoryRepository();
    return repository.delete(id);
  });
  electron.ipcMain.handle(
    IPC_CHANNELS.HISTORY.COUNT,
    async (_event, query) => {
      const repository = getChatHistoryRepository();
      return repository.count(query);
    }
  );
  electron.ipcMain.handle(IPC_CHANNELS.SETTINGS.GET, async () => {
    const settingsManager = getSettingsManager();
    return settingsManager.getAll();
  });
  electron.ipcMain.handle(
    IPC_CHANNELS.SETTINGS.SET,
    async (_event, settings) => {
      const settingsManager = getSettingsManager();
      settingsManager.setAll(settings);
    }
  );
  electron.ipcMain.handle(IPC_CHANNELS.PLATFORM.GET, async () => {
    return process.platform;
  });
}
function createWindow() {
  const mainWindow = new electron.BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
  });
  mainWindow.webContents.setWindowOpenHandler((details) => {
    electron.shell.openExternal(details.url);
    return { action: "deny" };
  });
  if (utils.is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}
electron.app.whenReady().then(() => {
  utils.electronApp.setAppUserModelId("com.smart-volume-control");
  registerIPCHandlers();
  electron.app.on("browser-window-created", (_, window) => {
    utils.optimizer.watchWindowShortcuts(window);
  });
  createWindow();
  electron.app.on("activate", function() {
    if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
