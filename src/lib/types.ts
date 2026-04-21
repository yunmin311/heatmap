// 链接类型：支持网页、文件路径与命令占位。
export type LinkType = 'url' | 'file' | 'command'

// 热力格主键：日期 + 维度。
export type HeatCellKey = {
  day: string // yyyy-MM-dd
  dimension: 'overall'
}

// 前端表单中的链接结构。
export type UiLink = {
  type: LinkType
  title: string
  target: string
}

// 日志主表记录结构。
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

// 日志关联资源结构。
export type EntryLink = {
  id?: number
  entryId: number
  type: LinkType
  title: string
  target: string
}
