import { format, getDay, startOfMonth, subDays } from 'date-fns'
import type { HeatCellKey } from '../lib/types'

type Props = {
  monthAnchor: Date
  selected: HeatCellKey | null
}

const weekdayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function HeatmapHud({ monthAnchor, selected }: Props) {
  const start = startOfMonth(monthAnchor)

  const weekday = (d: Date) => (getDay(d) + 6) % 7
  const gridStart = subDays(start, weekday(start))
  const gridEnd = subDays(gridStart, -(6 * 7 - 1))

  return (
    <div className="hudRoot" aria-hidden="true">
      <div className="hudTop">
        <div className="hudMonth">{format(monthAnchor, 'yyyy MMM')}</div>
        <div className="hudRange mono">
          {format(gridStart, 'yyyy-MM-dd')} → {format(gridEnd, 'yyyy-MM-dd')}
        </div>
      </div>

      <div className="hudAxis">
        <div className="hudWeekdays">
          {weekdayLabels.map((d) => (
            <div key={d} className="hudW">
              {d}
            </div>
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
        <div className="hudSelected mono">{selected?.day ? `Selected: ${selected.day}` : `In month: ${format(start, 'yyyy-MM')} (${format(start, 'MM')})`}</div>
      </div>
    </div>
  )
}

