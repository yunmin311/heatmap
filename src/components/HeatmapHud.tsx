import { format, getDay, startOfMonth, subDays } from 'date-fns'
import type { HeatCellKey } from '../lib/types'

// HUD（叠加层）组件输入参数。
type Props = {
  monthAnchor: Date
  selected: HeatCellKey | null
  onFocusOverview: () => void
  onFocusWeekday: (weekday: number) => void
  onFocusSelectedDay: (day: string) => void
}

// 周标签（周一到周日）。
const weekdayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function HeatmapHud({
  monthAnchor,
  selected,
  onFocusOverview,
  onFocusWeekday,
  onFocusSelectedDay,
}: Props) {
  const start = startOfMonth(monthAnchor)

  // 将 JS 的周日开头转换为周一开头。
  const weekday = (d: Date) => (getDay(d) + 6) % 7
  const gridStart = subDays(start, weekday(start))
  const gridEnd = subDays(gridStart, -(6 * 7 - 1))

  return (
    <div className="hudRoot">
      <button className="hudTop hudClick" type="button" onClick={onFocusOverview}>
        <div className="hudMonth">{format(monthAnchor, 'yyyy MMM')}</div>
        <div className="hudRange mono">
          {format(gridStart, 'yyyy-MM-dd')} → {format(gridEnd, 'yyyy-MM-dd')}
        </div>
      </button>

      <div className="hudAxis">
        <div className="hudWeekdays">
          {weekdayLabels.map((d, idx) => (
            <button key={d} className="hudW hudClick" type="button" onClick={() => onFocusWeekday(idx)}>
              {d}
            </button>
          ))}
        </div>
      </div>

      <div className="hudBottom">
        <div className="hudLegend">
          <div className="hudLegendLabel">Intensity</div>
          <div className="hudLegendBar">
            {[0, 1, 2, 3, 4, 5].map((n) => (
              <div key={n} className={`hudSwatch i${n}`} />
            ))}
          </div>
        </div>
        <button
          className="hudSelected mono hudClick"
          type="button"
          onClick={() => {
            if (selected?.day) onFocusSelectedDay(selected.day)
            else onFocusOverview()
          }}
        >
          {selected?.day ? `Selected: ${selected.day}` : `In month: ${format(start, 'yyyy-MM')} (${format(start, 'MM')})`}
        </button>
      </div>
    </div>
  )
}
