import { useEffect, useMemo, useState } from 'react'
import { startOfMonth } from 'date-fns'
import { HeatmapScene } from './components/HeatmapScene'
import { HeatmapHud } from './components/HeatmapHud'
import { Sidebar } from './components/Sidebar'
import { db } from './lib/db'
import type { HeatCellKey, LogEntry, UiLink } from './lib/types'
import { seedIfEmpty } from './lib/seed'
import './App.css'

export type ViewMode = 'calendar-2p5d' | 'voxel-3d' | 'terrain'

function App() {
  const [monthAnchor, setMonthAnchor] = useState<Date>(() => startOfMonth(new Date()))
  const [selected, setSelected] = useState<HeatCellKey | null>(null)
  const [entriesByDay, setEntriesByDay] = useState<Record<string, LogEntry[]>>({})
  const [viewMode, setViewMode] = useState<ViewMode>('calendar-2p5d')

  useEffect(() => {
    void seedIfEmpty()
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const entries = await db.entries.toArray()
      if (cancelled) return
      const grouped: Record<string, LogEntry[]> = {}
      for (const e of entries) {
        grouped[e.day] ??= []
        grouped[e.day].push(e)
      }
      for (const day of Object.keys(grouped)) {
        grouped[day].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      }
      setEntriesByDay(grouped)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const selectedDayEntries = useMemo(() => {
    if (!selected) return []
    return entriesByDay[selected.day] ?? []
  }, [entriesByDay, selected])

  const intensityByDay = useMemo(() => {
    const map: Record<string, number> = {}
    for (const [day, list] of Object.entries(entriesByDay)) {
      // 简单聚合：同一天多条记录相加，最大裁剪到 5（后续可做更丰富维度）
      const score = list.reduce((sum, e) => sum + e.intensity, 0)
      map[day] = Math.max(0, Math.min(5, score))
    }
    return map
  }, [entriesByDay])

  async function addEntry(input: Omit<LogEntry, 'id' | 'createdAt'>, links?: UiLink[]) {
    const id = await db.entries.add({ ...input, createdAt: new Date().toISOString() })
    if (links?.length) {
      await db.links.bulkAdd(
        links.map((l) => ({
          entryId: id,
          type: l.type,
          title: l.title,
          target: l.target,
        })),
      )
    }

    const added: LogEntry = { ...input, id, createdAt: new Date().toISOString() }
    setEntriesByDay((prev) => {
      const next = { ...prev }
      const dayList = [added, ...(next[added.day] ?? [])]
      next[added.day] = dayList
      return next
    })
  }

  return (
    <div className="appShell">
      <div className="canvasPane" role="application" aria-label="Heatmap canvas">
        <div className="canvasStack">
          {viewMode === 'calendar-2p5d' ? (
            <HeatmapScene
              monthAnchor={monthAnchor}
              intensityByDay={intensityByDay}
              selected={selected}
              onSelect={setSelected}
            />
          ) : (
            <div className="viewStub">
              <div className="viewStubTitle">View mode not implemented yet</div>
              <div className="viewStubBody mono">{viewMode}</div>
              <div className="viewStubHint">先把接口开放出来：后续我们会接上 3D / 地形视角。</div>
            </div>
          )}
          <HeatmapHud monthAnchor={monthAnchor} selected={selected} />
        </div>
      </div>
      <div className="sidePane" role="complementary" aria-label="Details panel">
        <Sidebar
          monthAnchor={monthAnchor}
          onMonthAnchorChange={setMonthAnchor}
          selected={selected}
          selectedDayEntries={selectedDayEntries}
          onAddEntry={addEntry}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
        />
      </div>
    </div>
  )
}

export default App
