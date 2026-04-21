import { format } from 'date-fns'
import { db } from './db'

export async function seedIfEmpty() {
  // 仅在数据库为空时写入一条示例数据，方便首次体验。
  const count = await db.entries.count()
  if (count > 0) return

  const today = new Date()
  const day = format(today, 'yyyy-MM-dd')

  // 先写入日志主记录。
  const id = await db.entries.add({
    day,
    dimension: 'overall',
    intensity: 3,
    mood: 4,
    tags: ['start', 'vibe'],
    note: '第一条记录：热力图项目启动。',
    createdAt: new Date().toISOString(),
  })

  // 再写入该日志的演示链接。
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
