import React, { useState, useEffect, useCallback } from 'react'
import { useAppDispatch } from '../context/AppContext'
import type { ChatHistoryEntry, ChatHistoryQuery } from '../../../shared/types'

/**
 * Format timestamp to readable date/time string
 */
function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

/**
 * Format date for input[type="date"]
 */
function formatDateForInput(date: Date): string {
  return date.toISOString().split('T')[0]
}

/**
 * Parse date string to timestamp (start of day)
 */
function parseStartOfDay(dateStr: string): number {
  const date = new Date(dateStr)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

/**
 * Parse date string to timestamp (end of day)
 */
function parseEndOfDay(dateStr: string): number {
  const date = new Date(dateStr)
  date.setHours(23, 59, 59, 999)
  return date.getTime()
}

/**
 * History entry component
 */
interface HistoryEntryProps {
  entry: ChatHistoryEntry
  onDelete: (id: string) => void
}

function HistoryEntry({ entry, onDelete }: HistoryEntryProps): JSX.Element {
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async (): Promise<void> => {
    if (isDeleting) return
    setIsDeleting(true)
    try {
      onDelete(entry.id)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div
      className="p-4 bg-gray-800 rounded-lg mb-3 group"
      data-testid="history-entry"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-gray-400">
              {formatDateTime(entry.timestamp)}
            </span>
            {entry.decision && (
              <span
                className={`text-xs px-2 py-0.5 rounded ${
                  entry.decision === 'LOWER_VOLUME'
                    ? 'bg-yellow-600 text-white'
                    : 'bg-green-600 text-white'
                }`}
              >
                {entry.decision === 'LOWER_VOLUME' ? 'Dimmed' : 'Restored'}
              </span>
            )}
            {entry.triggerPhrase && (
              <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded">
                Trigger: {entry.triggerPhrase}
              </span>
            )}
          </div>
          <p className="text-gray-200 text-sm">{entry.text}</p>
        </div>
        <button
          onClick={handleDelete}
          disabled={isDeleting}
          className="opacity-0 group-hover:opacity-100 ml-3 p-1 text-gray-400 hover:text-red-400 transition-all"
          title="Delete entry"
          aria-label="Delete entry"
        >
          {isDeleting ? '...' : '🗑️'}
        </button>
      </div>
    </div>
  )
}


/**
 * HistoryView component
 * Displays stored conversation history with filtering and search
 * 
 * Requirements:
 * - 5.2: Display all stored conversations with timestamps
 * - 5.3: Allow filtering by date range
 * - 5.4: Allow searching through transcript content
 * - 5.5: Remove selected history entries
 */
export function HistoryView(): JSX.Element {
  const dispatch = useAppDispatch()
  const [entries, setEntries] = useState<ChatHistoryEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Filter state
  const [searchText, setSearchText] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  // Load history entries
  const loadHistory = useCallback(async (): Promise<void> => {
    setIsLoading(true)
    setError(null)
    
    try {
      const query: ChatHistoryQuery = {}
      
      if (searchText.trim()) {
        query.searchText = searchText.trim()
      }
      if (startDate) {
        query.startDate = parseStartOfDay(startDate)
      }
      if (endDate) {
        query.endDate = parseEndOfDay(endDate)
      }

      const result = await window.electronAPI.history.query(query)
      setEntries(result)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load history'
      setError(message)
      dispatch({
        type: 'ERROR_ADD',
        error: { message, severity: 'error' }
      })
    } finally {
      setIsLoading(false)
    }
  }, [searchText, startDate, endDate, dispatch])

  // Load history on mount and when filters change
  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  // Handle entry deletion
  const handleDelete = async (id: string): Promise<void> => {
    try {
      const success = await window.electronAPI.history.delete(id)
      if (success) {
        setEntries(prev => prev.filter(e => e.id !== id))
      } else {
        throw new Error('Failed to delete entry')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete entry'
      dispatch({
        type: 'ERROR_ADD',
        error: { message, severity: 'error' }
      })
    }
  }

  // Handle search input with debounce
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    setSearchText(e.target.value)
  }

  // Clear all filters
  const handleClearFilters = (): void => {
    setSearchText('')
    setStartDate('')
    setEndDate('')
  }

  const hasFilters = searchText || startDate || endDate

  return (
    <div className="flex flex-col h-full">
      {/* Filter controls */}
      <div className="p-4 bg-gray-800 border-b border-gray-700 space-y-3">
        {/* Search input */}
        <div>
          <input
            type="text"
            value={searchText}
            onChange={handleSearchChange}
            placeholder="Search transcripts..."
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            data-testid="history-search"
          />
        </div>

        {/* Date range filters */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-400">From:</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              data-testid="history-start-date"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-400">To:</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              data-testid="history-end-date"
            />
          </div>
          {hasFilters && (
            <button
              onClick={handleClearFilters}
              className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded hover:bg-gray-700 transition-colors"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* History entries */}
      <div className="flex-1 overflow-y-auto p-4" data-testid="history-container">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500 text-sm">Loading history...</p>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        ) : entries.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500 text-sm">
              {hasFilters ? 'No entries match your filters' : 'No history yet'}
            </p>
          </div>
        ) : (
          entries.map((entry) => (
            <HistoryEntry
              key={entry.id}
              entry={entry}
              onDelete={handleDelete}
            />
          ))
        )}
      </div>

      {/* Entry count */}
      {!isLoading && entries.length > 0 && (
        <div className="px-4 py-2 bg-gray-800 border-t border-gray-700">
          <span className="text-xs text-gray-400">
            {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
          </span>
        </div>
      )}
    </div>
  )
}

export default HistoryView
