import React, { useEffect, useRef } from 'react'
import { useAppState, useAppDispatch } from '../context/AppContext'
import type { TranscriptMessage } from '../hooks/useWebSocket'

/**
 * Format timestamp to readable time string
 */
function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

/**
 * Highlight trigger phrase in text
 */
function highlightTriggerPhrase(text: string, triggerPhrase: string | null): JSX.Element {
  if (!triggerPhrase) {
    return <span>{text}</span>
  }

  const lowerText = text.toLowerCase()
  const lowerTrigger = triggerPhrase.toLowerCase()
  const index = lowerText.indexOf(lowerTrigger)

  if (index === -1) {
    return <span>{text}</span>
  }

  const before = text.slice(0, index)
  const match = text.slice(index, index + triggerPhrase.length)
  const after = text.slice(index + triggerPhrase.length)

  return (
    <span>
      {before}
      <mark className="bg-yellow-500 text-black px-1 rounded font-medium">
        {match}
      </mark>
      {after}
    </span>
  )
}

/**
 * Single transcript entry component
 */
interface TranscriptEntryProps {
  entry: TranscriptMessage
}

function TranscriptEntry({ entry }: TranscriptEntryProps): JSX.Element {
  const hasDecision = entry.decision !== null

  return (
    <div
      className={`p-3 rounded-lg mb-2 ${
        hasDecision ? 'bg-gray-700 border-l-4 border-yellow-500' : 'bg-gray-800'
      }`}
      data-testid="transcript-entry"
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-400">
          {formatTimestamp(entry.timestamp)}
        </span>
        {entry.decision && (
          <span
            className={`text-xs px-2 py-0.5 rounded ${
              entry.decision === 'LOWER_VOLUME'
                ? 'bg-yellow-600 text-white'
                : 'bg-green-600 text-white'
            }`}
          >
            {entry.decision === 'LOWER_VOLUME' ? '🔉 Volume Lowered' : '🔊 Volume Restored'}
          </span>
        )}
      </div>
      <p className="text-gray-200 text-sm">
        {highlightTriggerPhrase(entry.text, entry.triggerPhrase)}
      </p>
    </div>
  )
}


/**
 * TranscriptDisplay component
 * Renders live transcript entries with auto-scroll and trigger phrase highlighting
 * 
 * Requirements:
 * - 4.1: Render transcript text within 50ms of receipt
 * - 4.2: Auto-scroll to show most recent content
 * - 4.3: Visually distinguish between different speakers or trigger phrases
 * - 4.4: Highlight trigger phrases that caused volume changes
 */
export function TranscriptDisplay(): JSX.Element {
  const state = useAppState()
  const dispatch = useAppDispatch()
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const { entries, isAutoScrollEnabled } = state.transcript

  // Auto-scroll to bottom when new entries arrive
  useEffect(() => {
    if (isAutoScrollEnabled && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight
    }
  }, [entries, isAutoScrollEnabled])

  const handleToggleAutoScroll = (): void => {
    dispatch({ type: 'TRANSCRIPT_TOGGLE_AUTOSCROLL' })
  }

  const handleClearTranscript = (): void => {
    dispatch({ type: 'TRANSCRIPT_CLEAR' })
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header with controls */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
        <h2 className="text-sm font-medium text-gray-300">Live Transcript</h2>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isAutoScrollEnabled}
              onChange={handleToggleAutoScroll}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-800"
            />
            <span className="text-xs text-gray-400">Auto-scroll</span>
          </label>
          <button
            onClick={handleClearTranscript}
            className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded hover:bg-gray-700 transition-colors"
            disabled={entries.length === 0}
          >
            Clear
          </button>
        </div>
      </div>

      {/* Transcript entries */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto p-4"
        data-testid="transcript-container"
      >
        {entries.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500 text-sm">
              Waiting for transcript...
            </p>
          </div>
        ) : (
          entries.map((entry) => (
            <TranscriptEntry key={entry.id} entry={entry} />
          ))
        )}
      </div>
    </div>
  )
}

export default TranscriptDisplay
