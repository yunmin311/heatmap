import { format } from 'date-fns'
import { db } from './db'

export async function seedIfEmpty() {
  const count = await db.entries.count()
  if (count > 0) return

  const today = new Date()
  const day = format(today, 'yyyy-MM-dd')

  const id = await db.entries.add({
    day,
    dimension: 'overall',
    intensity: 3,
    mood: 4,
    tags: ['start', 'vibe'],
    note: '第一条记录：热力图项目启动。',
    createdAt: new Date().toISOString(),
  })

  await db.links.bulkAdd([
    {
      entryId: id,
      type: 'url',
      title: 'Vite',
      target: 'https://vite.dev',
    },
    {
      entryId: id,
      type: 'url',
      title: 'React',
      target: 'https://react.dev',
    },
  ])
}

