import { describe, it, expect, afterEach } from 'vitest'
import { createTestDatabase } from './database'

/**
 * Unit tests for database initialization
 * Requirements: 5.1
 */

describe('Database', () => {
  describe('createTestDatabase', () => {
    it('should create an in-memory database with schema', () => {
      const db = createTestDatabase()
      
      // Verify chat_history table exists
      const tables = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='chat_history'"
      ).all()
      
      expect(tables).toHaveLength(1)
      
      db.close()
    })

    it('should create indexes on chat_history table', () => {
      const db = createTestDatabase()
      
      const indexes = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='chat_history'"
      ).all() as { name: string }[]
      
      const indexNames = indexes.map(i => i.name)
      expect(indexNames).toContain('idx_chat_history_timestamp')
      expect(indexNames).toContain('idx_chat_history_session')
      
      db.close()
    })

    it('should allow inserting and querying chat history entries', () => {
      const db = createTestDatabase()
      
      const stmt = db.prepare(`
        INSERT INTO chat_history (id, session_id, text, timestamp, trigger_phrase, decision)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      stmt.run('test-id', 'session-1', 'Hello world', Date.now(), 'Hello', 'LOWER_VOLUME')
      
      const result = db.prepare('SELECT * FROM chat_history WHERE id = ?').get('test-id')
      
      expect(result).toBeDefined()
      
      db.close()
    })

    it('should enforce decision constraint', () => {
      const db = createTestDatabase()
      
      const stmt = db.prepare(`
        INSERT INTO chat_history (id, session_id, text, timestamp, trigger_phrase, decision)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      
      // Valid decisions should work
      expect(() => stmt.run('id1', 's1', 'text', 1000, null, 'LOWER_VOLUME')).not.toThrow()
      expect(() => stmt.run('id2', 's1', 'text', 1000, null, 'RESTORE_VOLUME')).not.toThrow()
      expect(() => stmt.run('id3', 's1', 'text', 1000, null, null)).not.toThrow()
      
      // Invalid decision should fail
      expect(() => stmt.run('id4', 's1', 'text', 1000, null, 'INVALID')).toThrow()
      
      db.close()
    })
  })
})
