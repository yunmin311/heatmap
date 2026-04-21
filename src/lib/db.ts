import Dexie, { type Table } from 'dexie'
import type { EntryLink, LogEntry } from './types'

class HeatmapVibeDb extends Dexie {
  entries!: Table<LogEntry, number>
  links!: Table<EntryLink, number>

  constructor() {
    super('heatmap-vibe')
    this.version(1).stores({
      entries: '++id, day, dimension, createdAt',
      links: '++id, entryId, type',
    })
  }
}

export const db = new HeatmapVibeDb()

