import Database from 'better-sqlite3'
import { v4 as uuidv4 } from 'uuid'
import type { ChatHistoryEntry, ChatHistoryQuery, VolumeDecision } from '../../shared/types'
import { getDatabase } from './database'

/**
 * Interface for the Chat History Repository
 * Provides CRUD operations for chat history entries
 */
export interface IChatHistoryRepository {
  save(entry: Omit<ChatHistoryEntry, 'id'>): ChatHistoryEntry
  findAll(query?: ChatHistoryQuery): ChatHistoryEntry[]
  findById(id: string): ChatHistoryEntry | null
  delete(id: string): boolean
  deleteByDateRange(startDate: number, endDate: number): number
  count(query?: ChatHistoryQuery): number
}

/**
 * Database row type for chat_history table
 */
interface ChatHistoryRow {
  id: string
  session_id: string
  text: string
  timestamp: number
  trigger_phrase: string | null
  decision: string | null
  created_at: number
}

/**
 * Convert database row to ChatHistoryEntry
 */
function rowToEntry(row: ChatHistoryRow): ChatHistoryEntry {
  return {
    id: row.id,
    sessionId: row.session_id,
    text: row.text,
    timestamp: row.timestamp,
    triggerPhrase: row.trigger_phrase,
    decision: row.decision as VolumeDecision | null
  }
}

/**
 * Chat History Repository implementation using better-sqlite3
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
 */
export class ChatHistoryRepository implements IChatHistoryRepository {
  private db: Database.Database

  constructor(database?: Database.Database) {
    this.db = database || getDatabase()
  }


  /**
   * Save a new chat history entry
   * Requirement 5.1: Persist transcript data to the database
   * @param entry - Entry data without id
   * @returns The saved entry with generated id
   */
  save(entry: Omit<ChatHistoryEntry, 'id'>): ChatHistoryEntry {
    const id = uuidv4()
    const stmt = this.db.prepare(`
      INSERT INTO chat_history (id, session_id, text, timestamp, trigger_phrase, decision)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    
    stmt.run(
      id,
      entry.sessionId,
      entry.text,
      entry.timestamp,
      entry.triggerPhrase,
      entry.decision
    )

    return {
      id,
      ...entry
    }
  }

  /**
   * Find all entries matching the query criteria
   * Requirements: 5.2, 5.3, 5.4
   * @param query - Optional query parameters for filtering
   * @returns Array of matching entries
   */
  findAll(query?: ChatHistoryQuery): ChatHistoryEntry[] {
    const conditions: string[] = []
    const params: (string | number)[] = []

    // Date range filtering (Requirement 5.3)
    if (query?.startDate !== undefined) {
      conditions.push('timestamp >= ?')
      params.push(query.startDate)
    }
    if (query?.endDate !== undefined) {
      conditions.push('timestamp <= ?')
      params.push(query.endDate)
    }

    // Text search filtering (Requirement 5.4)
    if (query?.searchText) {
      conditions.push('text LIKE ?')
      params.push(`%${query.searchText}%`)
    }

    let sql = 'SELECT * FROM chat_history'
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ')
    }
    sql += ' ORDER BY timestamp DESC'

    // Pagination
    if (query?.limit !== undefined) {
      sql += ' LIMIT ?'
      params.push(query.limit)
    }
    if (query?.offset !== undefined) {
      sql += ' OFFSET ?'
      params.push(query.offset)
    }

    const stmt = this.db.prepare(sql)
    const rows = stmt.all(...params) as ChatHistoryRow[]
    return rows.map(rowToEntry)
  }

  /**
   * Find a single entry by id
   * Requirement 5.2: Display stored conversations
   * @param id - The entry id to find
   * @returns The entry or null if not found
   */
  findById(id: string): ChatHistoryEntry | null {
    const stmt = this.db.prepare('SELECT * FROM chat_history WHERE id = ?')
    const row = stmt.get(id) as ChatHistoryRow | undefined
    return row ? rowToEntry(row) : null
  }

  /**
   * Delete an entry by id
   * Requirement 5.5: Remove selected history entries
   * @param id - The entry id to delete
   * @returns true if entry was deleted, false if not found
   */
  delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM chat_history WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
  }

  /**
   * Delete entries within a date range
   * @param startDate - Start timestamp (inclusive)
   * @param endDate - End timestamp (inclusive)
   * @returns Number of entries deleted
   */
  deleteByDateRange(startDate: number, endDate: number): number {
    const stmt = this.db.prepare(
      'DELETE FROM chat_history WHERE timestamp >= ? AND timestamp <= ?'
    )
    const result = stmt.run(startDate, endDate)
    return result.changes
  }

  /**
   * Count entries matching the query criteria
   * @param query - Optional query parameters for filtering
   * @returns Number of matching entries
   */
  count(query?: ChatHistoryQuery): number {
    const conditions: string[] = []
    const params: (string | number)[] = []

    if (query?.startDate !== undefined) {
      conditions.push('timestamp >= ?')
      params.push(query.startDate)
    }
    if (query?.endDate !== undefined) {
      conditions.push('timestamp <= ?')
      params.push(query.endDate)
    }
    if (query?.searchText) {
      conditions.push('text LIKE ?')
      params.push(`%${query.searchText}%`)
    }

    let sql = 'SELECT COUNT(*) as count FROM chat_history'
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ')
    }

    const stmt = this.db.prepare(sql)
    const result = stmt.get(...params) as { count: number }
    return result.count
  }
}

// Singleton instance for use throughout the application
let repositoryInstance: ChatHistoryRepository | null = null

/**
 * Get the singleton ChatHistoryRepository instance
 * Creates the instance on first call
 */
export function getChatHistoryRepository(): ChatHistoryRepository {
  if (!repositoryInstance) {
    repositoryInstance = new ChatHistoryRepository()
  }
  return repositoryInstance
}

/**
 * Reset the singleton instance (useful for testing)
 */
export function resetChatHistoryRepositoryInstance(): void {
  repositoryInstance = null
}
