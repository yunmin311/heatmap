import Dexie, { type Table } from 'dexie'
import type { EntryLink, LogEntry } from './types'

// IndexedDB 封装：统一管理日志与链接两张表。
class HeatmapVibeDb extends Dexie {
  entries!: Table<LogEntry, number>
  links!: Table<EntryLink, number>

  constructor() {
    super('heatmap-vibe')
    // v1 数据表结构定义与索引。
    this.version(1).stores({
      entries: '++id, day, dimension, createdAt',
      links: '++id, entryId, type',
    })
  }
}

export const db = new HeatmapVibeDb()
