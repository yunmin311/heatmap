import { Canvas, useFrame } from '@react-three/fiber'
import { RoundedBox, Text } from '@react-three/drei'
import { addDays, endOfMonth, format, getDay, isAfter, parseISO, startOfDay, startOfMonth, subDays } from 'date-fns'
import { useMemo, useRef, useState } from 'react'
import type { HeatCellKey } from '../lib/types'
import { Vector3, type Mesh } from 'three'

// 热力图场景组件输入参数。
type Props = {
  monthAnchor: Date
  intensityByDay: Record<string, number>
  selected: HeatCellKey | null
  onSelect: (key: HeatCellKey) => void
}

// 单个网格单元在场景中的计算结果。
type Cell = {
  key: HeatCellKey
  x: number
  y: number
  intensity: number
  inMonth: boolean
  isFuture: boolean
}

// 点击涟漪动画数据。
type Ripple = {
  id: string
  origin: [number, number, number]
  startedAt: number
  strength: number
}

// 限制到 0~1 区间。
function clamp01(v: number) {
  return Math.max(0, Math.min(1, v))
}

function intensityColor(intensity: number) {
  // 强度 0..5 对应颜色渐变（深靛蓝到青绿色）。
  const t = clamp01(intensity / 5)
  const stops = [
    { r: 18, g: 22, b: 30 }, // 0
    { r: 40, g: 56, b: 95 }, // 1
    { r: 60, g: 92, b: 170 }, // 2
    { r: 70, g: 150, b: 170 }, // 3
    { r: 85, g: 205, b: 155 }, // 4
    { r: 140, g: 245, b: 170 }, // 5
  ]
  const scaled = t * 5
  const i0 = Math.floor(scaled)
  const i1 = Math.min(5, i0 + 1)
  const localT = scaled - i0
  const a = stops[i0] ?? stops[0]
  const b = stops[i1] ?? stops[5]
  const r = Math.round(a.r + (b.r - a.r) * localT)
  const g = Math.round(a.g + (b.g - a.g) * localT)
  const bb = Math.round(a.b + (b.b - a.b) * localT)
  return `rgb(${r} ${g} ${bb})`
}

export function HeatmapScene({ monthAnchor, intensityByDay, selected, onSelect }: Props) {
  // 当前悬停方块、涟漪效果、点击时间戳等交互状态。
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [ripples, setRipples] = useState<Ripple[]>([])
  const clickT0Ref = useRef<Record<string, number>>({})
  const cameraShakeRef = useRef<{ t0: number; amp: number }>({ t0: 0, amp: 0 })
  const baseCamPosRef = useRef<Vector3 | null>(null)
  const cameraRigRef = useRef<{
    target: Vector3
    distance: number
    yaw: number
    pitch: number
    drag?: { button: number; x: number; y: number }
    lastMMB?: number
    bound?: boolean
  }>({
    target: new Vector3(2.7, 0, 2.5),
    distance: 14,
    yaw: -0.65,
    pitch: 0.85,
  })

  const cells = useMemo<Cell[]>(() => {
    const start = startOfMonth(monthAnchor)
    const end = endOfMonth(monthAnchor)
    const today0 = startOfDay(new Date())

    // 周起始按周一计算（JS 默认周日为 0）。
    const weekday = (d: Date) => (getDay(d) + 6) % 7
    const firstWeekday = weekday(start)
    const gridStart = subDays(start, firstWeekday)

    const total = 6 * 7 // 固定 6 周网格，保证布局稳定。
    const out: Cell[] = []
    for (let i = 0; i < total; i++) {
      const d = subDays(gridStart, -i)
      const day = format(d, 'yyyy-MM-dd')
      const inMonth = d >= start && d <= end
      const isFuture = isAfter(startOfDay(d), today0)
      const intensity = intensityByDay[day] ?? 0
      out.push({
        key: { day, dimension: 'overall' },
        x: i % 7,
        y: Math.floor(i / 7),
        intensity,
        inMonth,
        isFuture,
      })
    }
    return out
  }, [intensityByDay, monthAnchor])

  const selectedId = selected ? `${selected.dimension}:${selected.day}` : null
  const gridStartDay = cells[0]?.key.day

  const weekdayLabels = useMemo(() => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], [])
  const rowLabels = useMemo(() => {
    if (!gridStartDay) return []
    const start = parseISO(gridStartDay)
    return Array.from({ length: 6 }, (_, row) => {
      const d = addDays(start, row * 7)
      return format(d, 'MM/dd')
    })
  }, [gridStartDay])

  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [7.5, 8.5, 9.5], fov: 35, near: 0.1, far: 200 }}
      gl={{ antialias: true, alpha: true }}
      style={{ background: 'transparent' }}
    >
      <SceneContent
        monthAnchor={monthAnchor}
        weekdayLabels={weekdayLabels}
        rowLabels={rowLabels}
        cells={cells}
        selectedId={selectedId}
        hoveredId={hoveredId}
        onHoveredIdChange={setHoveredId}
        clickT0Ref={clickT0Ref}
        ripples={ripples}
        onRipplesChange={setRipples}
        cameraShakeRef={cameraShakeRef}
        baseCamPosRef={baseCamPosRef}
        cameraRigRef={cameraRigRef}
        onSelect={onSelect}
      />
    </Canvas>
  )
}

function SceneContent({
  monthAnchor,
  weekdayLabels,
  rowLabels,
  cells,
  selectedId,
  hoveredId,
  onHoveredIdChange,
  clickT0Ref,
  ripples,
  onRipplesChange,
  cameraShakeRef,
  baseCamPosRef,
  cameraRigRef,
  onSelect,
}: {
  monthAnchor: Date
  weekdayLabels: string[]
  rowLabels: string[]
  cells: Cell[]
  selectedId: string | null
  hoveredId: string | null
  onHoveredIdChange: (id: string | null) => void
  clickT0Ref: React.MutableRefObject<Record<string, number>>
  ripples: Ripple[]
  onRipplesChange: React.Dispatch<React.SetStateAction<Ripple[]>>
  cameraShakeRef: React.MutableRefObject<{ t0: number; amp: number }>
  baseCamPosRef: React.MutableRefObject<Vector3 | null>
  cameraRigRef: React.MutableRefObject<{
    target: Vector3
    distance: number
    yaw: number
    pitch: number
    drag?: { button: number; x: number; y: number }
    lastMMB?: number
    bound?: boolean
  }>
  onSelect: (key: HeatCellKey) => void
}) {
  const todayStr = format(new Date(), 'yyyy-MM-dd')

  useFrame(({ camera, clock, gl }) => {
    const now = clock.getElapsedTime()
    if (!baseCamPosRef.current) baseCamPosRef.current = camera.position.clone()

    // 自定义鼠标控制逻辑。
    const el = gl.domElement
    const rig = cameraRigRef.current
    if (!rig.bound) {
      rig.bound = true
      el.addEventListener('contextmenu', (e) => e.preventDefault())

      el.addEventListener('pointerdown', (e: PointerEvent) => {
        el.setPointerCapture?.(e.pointerId)
        rig.drag = { button: e.button, x: e.clientX, y: e.clientY }

        // 中键双击复位镜头（不是右键）。
        if (e.button === 1) {
          const t = performance.now()
          const last = rig.lastMMB ?? 0
          rig.lastMMB = t
          if (t - last < 320) {
            rig.target.set(2.7, 0, 2.5)
            rig.distance = 14
            rig.yaw = -0.65
            rig.pitch = 0.85
          }
        }
      })

      el.addEventListener('pointerup', () => {
        rig.drag = undefined
      })

      el.addEventListener('pointermove', (e: PointerEvent) => {
        if (!rig.drag) return
        const dx = e.clientX - rig.drag.x
        const dy = e.clientY - rig.drag.y
        rig.drag.x = e.clientX
        rig.drag.y = e.clientY

        const scale = rig.distance * 0.0022
        // 左键：仅在 XZ 平面平移。
        rig.target.x -= dx * scale
        rig.target.z -= dy * scale

        // 右键：XZ 平移 + Y 轴高度微调。
        if (rig.drag.button === 2) {
          rig.target.y += dy * scale * 0.8
          rig.target.y = Math.max(-1.2, Math.min(3.5, rig.target.y))
        }
      })

      el.addEventListener(
        'wheel',
        (e: WheelEvent) => {
          e.preventDefault()
          rig.distance *= Math.exp(e.deltaY * 0.001)
          rig.distance = Math.max(9, Math.min(30, rig.distance))
        },
        { passive: false },
      )
    }

    const cy = Math.cos(rig.yaw)
    const sy = Math.sin(rig.yaw)
    const cp = Math.cos(rig.pitch)
    const sp = Math.sin(rig.pitch)
    const desired = new Vector3(
      rig.target.x + rig.distance * cp * cy,
      rig.target.y + rig.distance * sp,
      rig.target.z + rig.distance * cp * sy,
    )
    camera.position.lerp(desired, 0.18)
    camera.lookAt(rig.target)

    const { t0, amp } = cameraShakeRef.current
    const dt = now - t0
    if (dt <= 0) return
    const decay = Math.exp(-dt * 10)
    if (decay < 0.02) {
      camera.position.copy(baseCamPosRef.current)
      return
    }
    const a = amp * decay
    const ox = Math.sin(dt * 75) * a
    const oy = Math.cos(dt * 60) * a * 0.6
    camera.position.copy(baseCamPosRef.current).add(new Vector3(ox, oy, 0))
  })

  return (
    <>
      {/* 画布保持透明，磨砂背景由 CSS 负责。 */}

      <ambientLight intensity={0.85} />
      <directionalLight position={[8, 10, 6]} intensity={0.7} />

      <group position={[-3.0, 0, -2.8]} rotation={[0, -0.65, 0]}>
        {/* 底板 */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[3.0, -0.08, 2.5]}>
          <planeGeometry args={[14, 12]} />
          <meshStandardMaterial color="#0a0e15" roughness={0.95} metalness={0.02} />
        </mesh>

        {/* 场景内坐标标签（不仅在 HUD 中显示） */}
        <group position={[0, 0.02, -0.95]}>
          {weekdayLabels.map((w, i) => (
            <Text
              key={w}
              position={[i * 0.9, 0.0, 0]}
              fontSize={0.18}
              color="#ffffff"
              fillOpacity={0.6}
              anchorX="center"
              anchorY="middle"
              rotation={[-0.35, 0, 0]}
            >
              {w}
            </Text>
          ))}
        </group>

        <group position={[-0.95, 0.02, 0]}>
          {rowLabels.map((lab, row) => (
            <Text
              key={lab}
              position={[0, 0.0, row * 0.9]}
              fontSize={0.18}
              color="#ffffff"
              fillOpacity={0.55}
              anchorX="right"
              anchorY="middle"
              rotation={[-0.35, 0, 0]}
            >
              {lab}
            </Text>
          ))}
        </group>

        <Text
          position={[2.7, 0.05, 5.85]}
          fontSize={0.28}
          color="#ffffff"
          fillOpacity={0.78}
          anchorX="left"
          anchorY="middle"
          rotation={[-0.35, 0, 0]}
        >
          {format(monthAnchor, 'yyyy MMM')}
        </Text>

        {cells.map((c) => {
          const isToday = c.key.day === todayStr
          const h0 = 0.06 + 0.24 * (c.intensity / 5) + (isToday ? 0.05 : 0)
          const id = `${c.key.dimension}:${c.key.day}`
          const isSelected = id === selectedId
          const isHovered = id === hoveredId
          const clickT0 = clickT0Ref.current[id] ?? 0
          const color = intensityColor(c.intensity)
          const fade = c.inMonth ? (c.isFuture ? 0.45 : 1) : 0.25

          // 点击回弹：轻微弹性反馈，不做夸张效果。
          const now = performance.now() / 1000
          const dt = clickT0 ? now - clickT0 : 999
          const bounce = dt < 0.55 ? Math.exp(-dt * 10) * Math.sin(dt * 28) : 0
          const h = Math.max(0.05, h0 + bounce * 0.12)

          const dom = format(parseISO(c.key.day), 'd')

          return (
            <group key={id} position={[c.x * 0.9, 0, c.y * 0.9]}>
              <Text
                position={[-0.26, h + 0.04, -0.26]}
                fontSize={0.14}
                color="#ffffff"
                fillOpacity={c.isFuture ? 0.38 : 0.62}
                anchorX="left"
                anchorY="middle"
                rotation={[-Math.PI / 2, 0, 0]}
              >
                {dom}
              </Text>
              <RoundedBox
                args={[0.72, h, 0.72]}
                radius={0.14}
                smoothness={8}
                position={[0, h / 2, 0]}
                onPointerDown={(e) => {
                  e.stopPropagation()
                  const t0 = performance.now() / 1000
                  clickT0Ref.current[id] = t0
                  cameraShakeRef.current = { t0: now, amp: 0.07 }
                  onRipplesChange((prev) => [
                    ...prev,
                    {
                      id: `${id}:${t0}`,
                      origin: [c.x * 0.9, 0.02, c.y * 0.9],
                      startedAt: t0,
                      strength: c.isFuture ? 0.5 : 1,
                    },
                  ])
                  onSelect(c.key)
                }}
                onPointerOver={(e) => {
                  e.stopPropagation()
                  onHoveredIdChange(id)
                  document.body.style.cursor = 'pointer'
                }}
                onPointerOut={() => {
                  onHoveredIdChange(null)
                  document.body.style.cursor = 'default'
                }}
              >
                <meshPhysicalMaterial
                  color={color}
                  roughness={c.isFuture ? 0.55 : 0.34}
                  metalness={c.isFuture ? 0.18 : 0.32}
                  clearcoat={c.isFuture ? 0.2 : 0.38}
                  clearcoatRoughness={0.62}
                  emissive={isSelected || isHovered ? '#ffffff' : '#000000'}
                  emissiveIntensity={isSelected ? 0.15 : isHovered ? 0.09 : 0}
                  transparent
                  opacity={fade}
                />
              </RoundedBox>
            </group>
          )
        })}

        {/* 点击涟漪冲击波 */}
        <Ripples
          ripples={ripples}
          onDone={(id) => onRipplesChange((prev) => prev.filter((r) => r.id !== id))}
        />
      </group>

      {/* 自定义鼠标控制：左键平移、右键含高度调节、中键双击复位。 */}
    </>
  )
}

function Ripples({ ripples, onDone }: { ripples: Ripple[]; onDone: (id: string) => void }) {
  useFrame(() => {
    const now = performance.now() / 1000
    for (const r of ripples) {
      if (now - r.startedAt > 0.9) onDone(r.id)
    }
  })

  return (
    <group>
      {ripples.map((r) => (
        <RippleRing key={r.id} ripple={r} />
      ))}
    </group>
  )
}

function RippleRing({ ripple }: { ripple: Ripple }) {
  const ref = useRef<Mesh | null>(null)
  useFrame(() => {
    const now = performance.now() / 1000
    const t = (now - ripple.startedAt) / 0.85
    if (!ref.current) return
    const tt = Math.max(0, Math.min(1, t))
    const s = 0.2 + tt * 3.2
    ref.current.scale.set(s, s, s)
    ;(ref.current.material as any).opacity = (1 - tt) * 0.22 * ripple.strength
  })

  return (
    <mesh ref={ref as any} position={ripple.origin} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.18, 0.22, 64]} />
      <meshBasicMaterial color="#8cf5aa" transparent opacity={0.22} depthWrite={false} />
    </mesh>
  )
}
