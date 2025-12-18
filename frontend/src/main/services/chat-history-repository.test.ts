import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { ChatHistoryRepository } from './chat-history-repository'
import type { ChatHistoryEntry, VolumeDecision } from '../../shared/types'

/**
 * Unit tests for ChatHistoryRepository
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
 */

// Schema for test database
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

describe('ChatHistoryRepository', () => {
  let db: Database.Database
  let repository: ChatHistoryRepository

  beforeEach(() => {
    // Create in-memory database for each test
    db = new Database(':memory:')
    db.exec(CHAT_HISTORY_SCHEMA)
    repository = new ChatHistoryRepository(db)
  })

  afterEach(() => {
    db.close()
  })

  describe('save', () => {
    it('should save an entry and return it with generated id', () => {
      const entry = {
        sessionId: 'session-1',
        text: 'Hello, how are you?',
        timestamp: Date.now(),
        triggerPhrase: 'Hello',
        decision: 'LOWER_VOLUME' as VolumeDecision
      }

      const saved = repository.save(entry)

      expect(saved.id).toBeDefined()
      expect(saved.id).toHaveLength(36) // UUID format
      expect(saved.sessionId).toBe(entry.sessionId)
      expect(saved.text).toBe(entry.text)
      expect(saved.timestamp).toBe(entry.timestamp)
      expect(saved.triggerPhrase).toBe(entry.triggerPhrase)
      expect(saved.decision).toBe(entry.decision)
    })


    it('should save an entry with null trigger phrase and decision', () => {
      const entry = {
        sessionId: 'session-1',
        text: 'Just some text',
        timestamp: Date.now(),
        triggerPhrase: null,
        decision: null
      }

      const saved = repository.save(entry)

      expect(saved.triggerPhrase).toBeNull()
      expect(saved.decision).toBeNull()
    })
  })

  describe('findById', () => {
    it('should find an entry by id', () => {
      const entry = {
        sessionId: 'session-1',
        text: 'Test message',
        timestamp: Date.now(),
        triggerPhrase: null,
        decision: null
      }
      const saved = repository.save(entry)

      const found = repository.findById(saved.id)

      expect(found).not.toBeNull()
      expect(found?.id).toBe(saved.id)
      expect(found?.text).toBe(entry.text)
    })

    it('should return null for non-existent id', () => {
      const found = repository.findById('non-existent-id')
      expect(found).toBeNull()
    })
  })

  describe('findAll', () => {
    it('should return all entries when no query provided', () => {
      repository.save({ sessionId: 's1', text: 'First', timestamp: 1000, triggerPhrase: null, decision: null })
      repository.save({ sessionId: 's1', text: 'Second', timestamp: 2000, triggerPhrase: null, decision: null })
      repository.save({ sessionId: 's1', text: 'Third', timestamp: 3000, triggerPhrase: null, decision: null })

      const entries = repository.findAll()

      expect(entries).toHaveLength(3)
    })

    it('should filter by date range (Requirement 5.3)', () => {
      repository.save({ sessionId: 's1', text: 'Before', timestamp: 1000, triggerPhrase: null, decision: null })
      repository.save({ sessionId: 's1', text: 'During', timestamp: 2000, triggerPhrase: null, decision: null })
      repository.save({ sessionId: 's1', text: 'After', timestamp: 3000, triggerPhrase: null, decision: null })

      const entries = repository.findAll({ startDate: 1500, endDate: 2500 })

      expect(entries).toHaveLength(1)
      expect(entries[0].text).toBe('During')
    })

    it('should filter by search text (Requirement 5.4)', () => {
      repository.save({ sessionId: 's1', text: 'Hello world', timestamp: 1000, triggerPhrase: null, decision: null })
      repository.save({ sessionId: 's1', text: 'Goodbye world', timestamp: 2000, triggerPhrase: null, decision: null })
      repository.save({ sessionId: 's1', text: 'Hello again', timestamp: 3000, triggerPhrase: null, decision: null })

      const entries = repository.findAll({ searchText: 'Hello' })

      expect(entries).toHaveLength(2)
      entries.forEach(e => expect(e.text.toLowerCase()).toContain('hello'))
    })

    it('should support pagination with limit and offset', () => {
      for (let i = 0; i < 10; i++) {
        repository.save({ sessionId: 's1', text: `Entry ${i}`, timestamp: i * 1000, triggerPhrase: null, decision: null })
      }

      const page1 = repository.findAll({ limit: 3, offset: 0 })
      const page2 = repository.findAll({ limit: 3, offset: 3 })

      expect(page1).toHaveLength(3)
      expect(page2).toHaveLength(3)
      // Results are ordered by timestamp DESC
      expect(page1[0].text).toBe('Entry 9')
    })
  })

  describe('delete', () => {
    it('should delete an entry by id (Requirement 5.5)', () => {
      const saved = repository.save({ sessionId: 's1', text: 'To delete', timestamp: 1000, triggerPhrase: null, decision: null })

      const deleted = repository.delete(saved.id)
      const found = repository.findById(saved.id)

      expect(deleted).toBe(true)
      expect(found).toBeNull()
    })

    it('should return false when deleting non-existent entry', () => {
      const deleted = repository.delete('non-existent-id')
      expect(deleted).toBe(false)
    })
  })

  describe('deleteByDateRange', () => {
    it('should delete entries within date range', () => {
      repository.save({ sessionId: 's1', text: 'Before', timestamp: 1000, triggerPhrase: null, decision: null })
      repository.save({ sessionId: 's1', text: 'During1', timestamp: 2000, triggerPhrase: null, decision: null })
      repository.save({ sessionId: 's1', text: 'During2', timestamp: 2500, triggerPhrase: null, decision: null })
      repository.save({ sessionId: 's1', text: 'After', timestamp: 3000, triggerPhrase: null, decision: null })

      const deletedCount = repository.deleteByDateRange(1500, 2600)
      const remaining = repository.findAll()

      expect(deletedCount).toBe(2)
      expect(remaining).toHaveLength(2)
    })
  })

  describe('count', () => {
    it('should count all entries when no query provided', () => {
      repository.save({ sessionId: 's1', text: 'First', timestamp: 1000, triggerPhrase: null, decision: null })
      repository.save({ sessionId: 's1', text: 'Second', timestamp: 2000, triggerPhrase: null, decision: null })

      const count = repository.count()

      expect(count).toBe(2)
    })

    it('should count entries matching query', () => {
      repository.save({ sessionId: 's1', text: 'Hello', timestamp: 1000, triggerPhrase: null, decision: null })
      repository.save({ sessionId: 's1', text: 'Hello again', timestamp: 2000, triggerPhrase: null, decision: null })
      repository.save({ sessionId: 's1', text: 'Goodbye', timestamp: 3000, triggerPhrase: null, decision: null })

      const count = repository.count({ searchText: 'Hello' })

      expect(count).toBe(2)
    })
  })
})
