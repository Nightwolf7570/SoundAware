import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'

/**
 * Database initialization and connection management for SQLite
 * Requirements: 5.1
 */

let db: Database.Database | null = null

/**
 * SQL schema for the chat history table
 */
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
`

/**
 * Get the database file path
 * Uses app.getPath('userData') for production, or a custom path for testing
 */
export function getDatabasePath(customPath?: string): string {
  if (customPath) {
    return customPath
  }
  // In production, store in user data directory
  try {
    return join(app.getPath('userData'), 'chat-history.db')
  } catch {
    // Fallback for testing when app is not ready
    return ':memory:'
  }
}

/**
 * Initialize the database connection and create schema
 * @param dbPath - Optional custom database path (useful for testing)
 * @returns The database instance
 */
export function initializeDatabase(dbPath?: string): Database.Database {
  if (db) {
    return db
  }

  const path = getDatabasePath(dbPath)
  db = new Database(path)
  
  // Enable WAL mode for better concurrent access
  db.pragma('journal_mode = WAL')
  
  // Execute schema creation
  db.exec(CHAT_HISTORY_SCHEMA)
  
  return db
}

/**
 * Get the current database instance
 * Initializes the database if not already done
 */
export function getDatabase(): Database.Database {
  if (!db) {
    return initializeDatabase()
  }
  return db
}

/**
 * Close the database connection
 * Should be called when the application is shutting down
 */
export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}

/**
 * Reset the database instance (useful for testing)
 */
export function resetDatabase(): void {
  closeDatabase()
}

/**
 * Create an in-memory database for testing
 * @returns A new in-memory database instance
 */
export function createTestDatabase(): Database.Database {
  const testDb = new Database(':memory:')
  testDb.exec(CHAT_HISTORY_SCHEMA)
  return testDb
}
