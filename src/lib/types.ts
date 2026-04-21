export type LinkType = 'url' | 'file' | 'command'

export type HeatCellKey = {
  day: string // yyyy-MM-dd
  dimension: 'overall'
}

export type UiLink = {
  type: LinkType
  title: string
  target: string
}

export type LogEntry = {
  id?: number
  day: string // yyyy-MM-dd
  dimension: 'overall'
  intensity: number // 0..5
  mood?: number // 1..5
  tags: string[]
  note: string
  createdAt: string // ISO
}

export type EntryLink = {
  id?: number
  entryId: number
  type: LinkType
  title: string
  target: string
}

