import { addMonths, endOfMonth, format, startOfMonth, subMonths } from 'date-fns'
import { useEffect, useMemo, useState } from 'react'
import { db } from '../lib/db'
import type { HeatCellKey, LogEntry, UiLink } from '../lib/types'
import type { ViewMode } from '../App'

// 侧栏组件输入参数。
type Props = {
  monthAnchor: Date
  onMonthAnchorChange: (d: Date) => void
  selected: HeatCellKey | null
  selectedDayEntries: LogEntry[]
  onAddEntry: (input: Omit<LogEntry, 'id' | 'createdAt'>, links?: UiLink[]) => Promise<void>
  viewMode: ViewMode
  onViewModeChange: (m: ViewMode) => void
}

// 月份标题格式化。
function formatMonth(d: Date) {
  return format(d, 'yyyy MMM')
}

// 将数字安全裁剪为整数区间。
function clampInt(n: number, min: number, max: number) {
  const x = Number.isFinite(n) ? n : min
  return Math.max(min, Math.min(max, Math.trunc(x)))
}

export function Sidebar({
  monthAnchor,
  onMonthAnchorChange,
  selected,
  selectedDayEntries,
  onAddEntry,
  viewMode,
  onViewModeChange,
}: Props) {
  const monthRangeText = useMemo(() => {
    const s = startOfMonth(monthAnchor)
    const e = endOfMonth(monthAnchor)
    return `${format(s, 'yyyy-MM-dd')} → ${format(e, 'yyyy-MM-dd')}`
  }, [monthAnchor])

  const selectedDay = selected?.day ?? format(new Date(), 'yyyy-MM-dd')

  const [day, setDay] = useState(selectedDay)
  const [intensity, setIntensity] = useState(2)
  const [mood, setMood] = useState(3)
  const [tags, setTags] = useState('vibe')
  const [note, setNote] = useState('')
  const [linkTitle, setLinkTitle] = useState('')
  const [linkTarget, setLinkTarget] = useState('')
  const [saving, setSaving] = useState(false)
  const [links, setLinks] = useState<UiLink[]>([])
  const [linksByEntryId, setLinksByEntryId] = useState<Record<number, UiLink[]>>({})

  useEffect(() => {
    // 选中日期变化时，同步表单日期输入。
    if (selected?.day) setDay(selected.day)
  }, [selected?.day])

  useEffect(() => {
    // 读取当前选中日志对应的关联链接。
    let cancelled = false
    ;(async () => {
      const ids = selectedDayEntries.map((e) => e.id).filter((x): x is number => typeof x === 'number')
      if (!ids.length) {
        setLinksByEntryId({})
        return
      }

      const rows = await db.links.where('entryId').anyOf(ids).toArray()
      if (cancelled) return
      const map: Record<number, UiLink[]> = {}
      for (const r of rows) {
        map[r.entryId] ??= []
        map[r.entryId].push({ type: r.type, title: r.title, target: r.target })
      }
      setLinksByEntryId(map)
    })()
    return () => {
      cancelled = true
    }
  }, [selectedDayEntries])

  async function addLink() {
    // 暂存待提交的链接项。
    const title = linkTitle.trim()
    const target = linkTarget.trim()
    if (!title || !target) return
    setLinks((prev) => [
      ...prev,
      { type: /^https?:\/\//i.test(target) ? 'url' : 'file', title, target },
    ])
    setLinkTitle('')
    setLinkTarget('')
  }

  async function saveEntry() {
    // 校验并提交新日志，同时携带链接集合。
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return
    const t = tags
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
    setSaving(true)
    try {
      await onAddEntry(
        {
          day,
          dimension: 'overall',
          intensity: clampInt(intensity, 0, 5),
          mood: clampInt(mood, 1, 5),
          tags: t,
          note: note.trim(),
        },
        links,
      )
      setNote('')
      setLinks([])
      setLinkTitle('')
      setLinkTarget('')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="sidebar">
      <div className="panelHeader">
        <div className="titleBlock">
          <div className="title">Heatmap Vibe</div>
          <div className="subtitle">{monthRangeText}</div>
        </div>
        <div className="headerRight">
          <div className="seg" role="tablist" aria-label="View mode">
            <button
              className={`segBtn ${viewMode === 'calendar-2p5d' ? 'active' : ''}`}
              onClick={() => onViewModeChange('calendar-2p5d')}
              type="button"
              role="tab"
              aria-selected={viewMode === 'calendar-2p5d'}
            >
              2.5D
            </button>
            <button
              className={`segBtn ${viewMode === 'voxel-3d' ? 'active' : ''}`}
              onClick={() => onViewModeChange('voxel-3d')}
              type="button"
              role="tab"
              aria-selected={viewMode === 'voxel-3d'}
              title="Coming soon"
            >
              3D
            </button>
            <button
              className={`segBtn ${viewMode === 'terrain' ? 'active' : ''}`}
              onClick={() => onViewModeChange('terrain')}
              type="button"
              role="tab"
              aria-selected={viewMode === 'terrain'}
              title="Coming soon"
            >
              Terrain
            </button>
          </div>

          <div className="monthNav" aria-label="Month navigation">
            <button
              className="btn"
              onClick={() => onMonthAnchorChange(startOfMonth(subMonths(monthAnchor, 1)))}
              aria-label="Previous month"
            >
              ‹
            </button>
            <div className="monthLabel">{formatMonth(monthAnchor)}</div>
            <button
              className="btn"
              onClick={() => onMonthAnchorChange(startOfMonth(addMonths(monthAnchor, 1)))}
              aria-label="Next month"
            >
              ›
            </button>
          </div>
        </div>
      </div>

      <div className="panelSection">
        <div className="sectionTitle">New log</div>
        <div className="formGrid">
          <label className="field">
            <div className="label">Day</div>
            <input className="input" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
          </label>

          <label className="field">
            <div className="label">Intensity (0-5)</div>
            <input
              className="input"
              type="number"
              min={0}
              max={5}
              value={intensity}
              onChange={(e) => setIntensity(Number(e.target.value))}
            />
          </label>

          <label className="field">
            <div className="label">Mood (1-5)</div>
            <input
              className="input"
              type="number"
              min={1}
              max={5}
              value={mood}
              onChange={(e) => setMood(Number(e.target.value))}
            />
          </label>

          <label className="field span2">
            <div className="label">Tags (comma)</div>
            <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} />
          </label>

          <label className="field span2">
            <div className="label">Note</div>
            <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} rows={4} />
          </label>

          <div className="field span2">
            <div className="label">Links</div>
            <div className="linkRow">
              <input
                className="input"
                placeholder="Title"
                value={linkTitle}
                onChange={(e) => setLinkTitle(e.target.value)}
              />
              <input
                className="input"
                placeholder="URL or file path"
                value={linkTarget}
                onChange={(e) => setLinkTarget(e.target.value)}
              />
              <button className="btn" type="button" onClick={addLink}>
                Add
              </button>
            </div>
            {links.length > 0 ? (
              <ul className="linkList">
                {links.map((l, idx) => (
                  <li key={`${l.type}-${idx}`} className="linkItem">
                    <span className="pill">{l.type}</span>
                    <span className="linkTitle">{l.title}</span>
                    <button
                      className="btn subtle"
                      onClick={() => setLinks((prev) => prev.filter((_, i) => i !== idx))}
                      aria-label="Remove link"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="hint">Tip: 先粘贴一个 URL 或本地路径，后续我们再做“文件定位/打开”。</div>
            )}
          </div>

          <div className="actions span2">
            <button className="btn primary" onClick={saveEntry} disabled={saving}>
              {saving ? 'Saving…' : 'Save log'}
            </button>
            <button
              className="btn subtle"
              onClick={async () => {
                await db.delete()
                window.location.reload()
              }}
              title="Clear local database (dev only)"
            >
              Reset DB
            </button>
          </div>
        </div>
      </div>

      <div className="panelSection">
        <div className="sectionTitle">Selected day</div>
        <div className="selectedMeta">
          <div className="k">Day</div>
          <div className="v mono">{selected?.day ?? '—'}</div>
        </div>

        {selected ? (
          selectedDayEntries.length ? (
            <ul className="entryList">
              {selectedDayEntries.map((e) => (
                <li key={e.id} className="entryCard">
                  <div className="entryTop">
                    <div className="pill">intensity {e.intensity}</div>
                    {typeof e.mood === 'number' ? <div className="pill">mood {e.mood}</div> : null}
                    <div className="time mono">{format(new Date(e.createdAt), 'HH:mm')}</div>
                  </div>
                  <div className="entryNote">{e.note || <span className="muted">No note</span>}</div>
                  {e.tags?.length ? (
                    <div className="tagRow">
                      {e.tags.map((t, idx) => (
                        <span key={`${t}-${idx}`} className="tag">
                          {t}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {typeof e.id === 'number' && linksByEntryId[e.id]?.length ? (
                    <div className="linkInline">
                      {linksByEntryId[e.id].map((l, idx) => (
                        <a
                          key={`${l.type}-${idx}`}
                          className="linkA"
                          href={l.type === 'file' ? `file:///${l.target.replace(/\\\\/g, '/')}` : l.target}
                          target="_blank"
                          rel="noreferrer"
                          title={l.target}
                        >
                          {l.title}
                        </a>
                      ))}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <div className="hint">这一天还没有记录。用上面的表单写一条试试。</div>
          )
        ) : (
          <div className="hint">点击左侧热力图的某一天，查看详情。</div>
        )}
      </div>

      <div className="panelFooter">
        <div className="footerText mono">Local-first · IndexedDB · 2.5D</div>
      </div>
    </div>
  )
}
