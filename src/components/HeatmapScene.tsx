import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, OrthographicCamera, PerspectiveCamera, RoundedBox, Text } from '@react-three/drei'
import { addDays, endOfMonth, format, getDay, isAfter, parseISO, startOfDay, startOfMonth, subDays } from 'date-fns'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CameraCommand } from '../App'
import type { HeatCellKey } from '../lib/types'
import {
  BackSide,
  Color,
  MathUtils,
  MOUSE,
  OrthographicCamera as ThreeOrthographicCamera,
  PerspectiveCamera as ThreePerspectiveCamera,
  Vector3,
  type Mesh,
} from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'

// 热力图场景组件输入参数。
type Props = {
  monthAnchor: Date
  intensityByDay: Record<string, number>
  selected: HeatCellKey | null
  onSelect: (key: HeatCellKey) => void
  cameraCommand: CameraCommand | null
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

type ProjectionMode = 'perspective' | 'orthographic'

type CameraPose = {
  projection: ProjectionMode
  position: Vector3
  target: Vector3
  up?: Vector3
  zoom?: number
}

type CameraTransition = {
  fromPosition: Vector3
  toPosition: Vector3
  fromTarget: Vector3
  toTarget: Vector3
  fromUp: Vector3
  toUp: Vector3
  fromZoom: number
  toZoom: number
  startedAt: number
  duration: number
}

const DEFAULT_CAMERA_POSITION = new Vector3(7.5, 8.5, 9.5)
const DEFAULT_CAMERA_TARGET = new Vector3(2.46, 0, 2.25)
const DEFAULT_CAMERA_UP = new Vector3(0, 1, 0)
const ORTHO_DEFAULT_ZOOM = 58

const BLENDER_MOUSE_BUTTONS = {
  LEFT: -1 as unknown as MOUSE,
  MIDDLE: MOUSE.ROTATE,
  RIGHT: -1 as unknown as MOUSE,
} as const

const BLENDER_KEYS = {
  LEFT: 'ShiftLeft',
  UP: 'ShiftUp',
  RIGHT: 'ShiftRight',
  BOTTOM: 'ShiftDown',
} as const

// 限制到 0~1 区间。
function clamp01(v: number) {
  return Math.max(0, Math.min(1, v))
}

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
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
  return new Color(
    (a.r + (b.r - a.r) * localT) / 255,
    (a.g + (b.g - a.g) * localT) / 255,
    (a.b + (b.b - a.b) * localT) / 255,
  )
}

function scaleColor(c: Color, factor: number) {
  return new Color(clamp01(c.r * factor), clamp01(c.g * factor), clamp01(c.b * factor))
}

export function HeatmapScene({ monthAnchor, intensityByDay, selected, onSelect, cameraCommand }: Props) {
  // 当前悬停方块、涟漪效果、点击时间戳等交互状态。
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [ripples, setRipples] = useState<Ripple[]>([])
  const clickT0Ref = useRef<Record<string, number>>({})

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

  // 保护性去重：避免在时区/边界情况下同一天被重复渲染。
  const uniqueCells = useMemo(() => {
    const seen = new Set<string>()
    return cells.filter((c) => {
      const k = `${c.key.dimension}:${c.key.day}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
  }, [cells])

  return (
    <Canvas
      dpr={[1, 2]}
      shadows
      camera={{ position: [7.5, 8.5, 9.5], fov: 35, near: 0.1, far: 200 }}
      gl={{ antialias: true, alpha: true }}
      style={{ background: 'transparent' }}
    >
      <SceneContent
        monthAnchor={monthAnchor}
        weekdayLabels={weekdayLabels}
        rowLabels={rowLabels}
        cells={uniqueCells}
        selectedId={selectedId}
        hoveredId={hoveredId}
        onHoveredIdChange={setHoveredId}
        clickT0Ref={clickT0Ref}
        ripples={ripples}
        onRipplesChange={setRipples}
        cameraCommand={cameraCommand}
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
  cameraCommand,
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
  cameraCommand: CameraCommand | null
  onSelect: (key: HeatCellKey) => void
}) {
  const { gl, size } = useThree()
  const todayStr = format(new Date(), 'yyyy-MM-dd')
  const handledCommandIdRef = useRef<number>(0)

  const controlsRef = useRef<OrbitControlsImpl | null>(null)
  const perspectiveCameraRef = useRef<ThreePerspectiveCamera | null>(null)
  const orthographicCameraRef = useRef<ThreeOrthographicCamera | null>(null)
  const projectionModeRef = useRef<ProjectionMode>('perspective')
  const [projectionMode, setProjectionMode] = useState<ProjectionMode>('perspective')
  const transitionRef = useRef<CameraTransition | null>(null)
  const transitionTargetRef = useRef<Vector3>(new Vector3())
  const lastMiddleDownRef = useRef<number>(0)
  const initializedRef = useRef(false)

  const xStep = 0.82
  const zStep = 0.9
  const defaultOffset = useMemo(() => DEFAULT_CAMERA_POSITION.clone().sub(DEFAULT_CAMERA_TARGET), [])

  const getActiveCamera = useCallback(() => {
    return projectionModeRef.current === 'perspective' ? perspectiveCameraRef.current : orthographicCameraRef.current
  }, [])

  const beginCameraTransition = useCallback(
    (next: CameraPose) => {
      const controls = controlsRef.current
      const activeCamera = getActiveCamera()
      if (!controls || !activeCamera) return

      const fromPosition = activeCamera.position.clone()
      const fromTarget = controls.target.clone()
      const fromUp = activeCamera.up.clone()
      const fromZoom = activeCamera instanceof ThreeOrthographicCamera ? activeCamera.zoom : ORTHO_DEFAULT_ZOOM

      if (projectionModeRef.current !== next.projection) {
        projectionModeRef.current = next.projection
        setProjectionMode(next.projection)

        const targetCamera = next.projection === 'perspective' ? perspectiveCameraRef.current : orthographicCameraRef.current
        if (targetCamera) {
          targetCamera.position.copy(fromPosition)
          targetCamera.up.copy(fromUp)
          if (targetCamera instanceof ThreeOrthographicCamera) {
            targetCamera.zoom = fromZoom
            targetCamera.updateProjectionMatrix()
          }
        }
      }

      transitionRef.current = {
        fromPosition,
        toPosition: next.position.clone(),
        fromTarget,
        toTarget: next.target.clone(),
        fromUp,
        toUp: next.up?.clone() ?? DEFAULT_CAMERA_UP.clone(),
        fromZoom,
        toZoom: next.zoom ?? fromZoom,
        startedAt: performance.now() / 1000,
        duration: 0.3,
      }
    },
    [getActiveCamera],
  )

  const toPerspectiveAtTarget = useCallback(
    (target: Vector3) => {
      beginCameraTransition({
        projection: 'perspective',
        target,
        position: target.clone().add(defaultOffset),
        up: DEFAULT_CAMERA_UP,
      })
    },
    [beginCameraTransition, defaultOffset],
  )

  const toOrthoView = useCallback(
    (view: 'front' | 'left' | 'top') => {
      const controls = controlsRef.current
      const activeCamera = getActiveCamera()
      if (!controls || !activeCamera) return

      const target = controls.target.clone()
      const distance = Math.max(8, activeCamera.position.distanceTo(target))
      const position = target.clone()
      const up = DEFAULT_CAMERA_UP.clone()

      if (view === 'front') {
        position.add(new Vector3(0, 0, distance))
      }
      if (view === 'left') {
        position.add(new Vector3(-distance, 0, 0))
      }
      if (view === 'top') {
        position.add(new Vector3(0, distance, 0.001))
        up.set(0, 0, -1)
      }

      beginCameraTransition({
        projection: 'orthographic',
        position,
        target,
        up,
        zoom: ORTHO_DEFAULT_ZOOM,
      })
    },
    [beginCameraTransition, getActiveCamera],
  )

  useEffect(() => {
    projectionModeRef.current = projectionMode
  }, [projectionMode])

  useEffect(() => {
    const cam = orthographicCameraRef.current
    if (!cam) return
    const frustumHeight = 12
    const aspect = size.width / Math.max(1, size.height)
    cam.left = (-frustumHeight * aspect) / 2
    cam.right = (frustumHeight * aspect) / 2
    cam.top = frustumHeight / 2
    cam.bottom = -frustumHeight / 2
    cam.updateProjectionMatrix()
  }, [size.height, size.width])

  useEffect(() => {
    const el = gl.domElement

    const onContextMenu = (e: MouseEvent) => {
      // 右键完全保留，不触发相机操作。
      e.preventDefault()
    }

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 1) return
      const now = performance.now()
      if (now - lastMiddleDownRef.current < 320) {
        beginCameraTransition({
          projection: 'perspective',
          position: DEFAULT_CAMERA_POSITION.clone(),
          target: DEFAULT_CAMERA_TARGET.clone(),
          up: DEFAULT_CAMERA_UP,
        })
      }
      lastMiddleDownRef.current = now
    }

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return

      if (e.key === '1') {
        e.preventDefault()
        toOrthoView('front')
      }
      if (e.key === '3') {
        e.preventDefault()
        toOrthoView('left')
      }
      if (e.key === '7') {
        e.preventDefault()
        toOrthoView('top')
      }
      if (e.key === '0') {
        e.preventDefault()
        beginCameraTransition({
          projection: 'perspective',
          position: DEFAULT_CAMERA_POSITION.clone(),
          target: DEFAULT_CAMERA_TARGET.clone(),
          up: DEFAULT_CAMERA_UP,
        })
      }
    }

    el.addEventListener('contextmenu', onContextMenu)
    el.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)

    return () => {
      el.removeEventListener('contextmenu', onContextMenu)
      el.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [beginCameraTransition, gl, toOrthoView])

  useEffect(() => {
    if (!cameraCommand || cameraCommand.id === handledCommandIdRef.current) return
    handledCommandIdRef.current = cameraCommand.id

    if (cameraCommand.type === 'overview') {
      beginCameraTransition({
        projection: 'perspective',
        position: DEFAULT_CAMERA_POSITION.clone(),
        target: DEFAULT_CAMERA_TARGET.clone(),
        up: DEFAULT_CAMERA_UP,
      })
      return
    }

    if (cameraCommand.type === 'weekday') {
      toPerspectiveAtTarget(new Vector3(cameraCommand.weekday * xStep, 0, 2.25))
      return
    }

    const cell = cells.find((x) => x.key.day === cameraCommand.day)
    if (!cell) return
    toPerspectiveAtTarget(new Vector3(cell.x * xStep, 0, cell.y * zStep))
  }, [beginCameraTransition, cameraCommand, cells, toPerspectiveAtTarget])

  useFrame(() => {
    const controls = controlsRef.current
    const perspective = perspectiveCameraRef.current
    if (!initializedRef.current && controls && perspective) {
      perspective.position.copy(DEFAULT_CAMERA_POSITION)
      perspective.up.copy(DEFAULT_CAMERA_UP)
      controls.target.copy(DEFAULT_CAMERA_TARGET)
      controls.update()
      initializedRef.current = true
    }

    const activeCamera = getActiveCamera()
    const transition = transitionRef.current
    if (!controls || !activeCamera || !transition) return

    const now = performance.now() / 1000
    const t = clamp01((now - transition.startedAt) / transition.duration)
    const eased = easeInOutCubic(t)

    activeCamera.position.lerpVectors(transition.fromPosition, transition.toPosition, eased)
    transitionTargetRef.current.lerpVectors(transition.fromTarget, transition.toTarget, eased)
    controls.target.copy(transitionTargetRef.current)
    activeCamera.up.lerpVectors(transition.fromUp, transition.toUp, eased)

    if (activeCamera instanceof ThreeOrthographicCamera) {
      activeCamera.zoom = MathUtils.lerp(transition.fromZoom, transition.toZoom, eased)
      activeCamera.updateProjectionMatrix()
    }

    controls.update()
    if (t < 1) return

    activeCamera.position.copy(transition.toPosition)
    controls.target.copy(transition.toTarget)
    activeCamera.up.copy(transition.toUp)
    if (activeCamera instanceof ThreeOrthographicCamera) {
      activeCamera.zoom = transition.toZoom
      activeCamera.updateProjectionMatrix()
    }
    controls.update()
    transitionRef.current = null
  })

  return (
    <>
      {/* 画布保持透明，磨砂背景由 CSS 负责。 */}
      <PerspectiveCamera
        ref={perspectiveCameraRef}
        makeDefault={projectionMode === 'perspective'}
        position={[7.5, 8.5, 9.5]}
        fov={35}
        near={0.1}
        far={200}
      />
      <OrthographicCamera
        ref={orthographicCameraRef}
        makeDefault={projectionMode === 'orthographic'}
        position={[7.5, 8.5, 9.5]}
        near={0.1}
        far={200}
        zoom={ORTHO_DEFAULT_ZOOM}
      />
      <OrbitControls
        key={projectionMode}
        ref={controlsRef}
        makeDefault
        enablePan
        enableRotate
        enableZoom
        panSpeed={1}
        rotateSpeed={0.5}
        zoomSpeed={0.8}
        dampingFactor={0.05}
        enableDamping
        minDistance={5}
        maxDistance={50}
        minZoom={20}
        maxZoom={120}
        mouseButtons={BLENDER_MOUSE_BUTTONS}
        keys={BLENDER_KEYS}
      />

      <ambientLight intensity={0.8} />
      <directionalLight
        position={[9, 12, 7]}
        intensity={0.9}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-bias={-0.0002}
      />

      <group position={[-3.0, 0, -2.8]} rotation={[0, -0.65, 0]}>
        {/* 场景内坐标标签（不仅在 HUD 中显示） */}
        <group position={[0, 0.02, -0.95]}>
          {weekdayLabels.map((w, i) => (
            <Text
              key={w}
              position={[i * xStep, 0.0, 0]}
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
              position={[0, 0.0, row * zStep]}
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
          const baseColor = intensityColor(c.intensity)
          const fade = c.inMonth ? (c.isFuture ? 0.72 : 0.96) : 0.48
          const boost = isSelected ? 1.2 : isHovered ? 1.08 : 1
          const sideColor = scaleColor(baseColor, 0.7 * boost)
          const topColor = scaleColor(baseColor, 1.1 * boost)

          // 点击回弹：轻微弹性反馈，不做夸张效果。
          const now = performance.now() / 1000
          const dt = clickT0 ? now - clickT0 : 999
          const bounce = dt < 0.55 ? Math.exp(-dt * 10) * Math.sin(dt * 28) : 0
          const waveLift = ripples.reduce((sum, r) => {
            const dtRipple = now - r.startedAt
            if (dtRipple < 0 || dtRipple > 0.95) return sum
            const cx = c.x * xStep
            const cz = c.y * zStep
            const dx = cx - r.origin[0]
            const dz = cz - r.origin[2]
            const dist = Math.sqrt(dx * dx + dz * dz)
            const front = dtRipple * 2.5
            const band = Math.exp(-Math.pow((dist - front) / 0.45, 2))
            const osc = Math.sin(dtRipple * 16 - dist * 5.5)
            return sum + band * osc * 0.018 * r.strength
          }, 0)
          const h = Math.max(0.05, h0 + bounce * 0.12 + waveLift)

          const dom = format(parseISO(c.key.day), 'd')

          return (
            <group key={id} position={[c.x * xStep, 0, c.y * zStep]}>
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
                args={[0.78, h, 0.66]}
                radius={0.15}
                smoothness={8}
                position={[0, h / 2, 0]}
                castShadow
                receiveShadow
                onPointerDown={(e) => {
                  e.stopPropagation()
                  const t0 = performance.now() / 1000
                  clickT0Ref.current[id] = t0
                  onRipplesChange((prev) => [
                    ...prev,
                    {
                      id: `${id}:${t0}`,
                      origin: [c.x * xStep, 0.02, c.y * zStep],
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
                <meshStandardMaterial color={sideColor} roughness={0.3} metalness={0.1} transparent opacity={fade} />
              </RoundedBox>

              <RoundedBox
                args={[0.74, 0.03, 0.62]}
                radius={0.15}
                smoothness={8}
                position={[0, h + 0.016, 0]}
                castShadow
                receiveShadow
              >
                <meshStandardMaterial color={topColor} roughness={0.26} metalness={0.1} transparent opacity={fade} />
              </RoundedBox>

              {isSelected ? (
                <>
                  <RoundedBox
                    args={[0.81, h + 0.06, 0.69]}
                    radius={0.15}
                    smoothness={8}
                    position={[0, (h + 0.06) / 2, 0]}
                  >
                    <meshPhysicalMaterial
                      color="#ffffff"
                      transparent
                      opacity={0.08}
                      roughness={0.08}
                      metalness={0.26}
                      clearcoat={1}
                      clearcoatRoughness={0.06}
                      reflectivity={0.9}
                      side={BackSide}
                      depthWrite={false}
                    />
                  </RoundedBox>
                  <mesh position={[0, h + 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                    <ringGeometry args={[0.34, 0.48, 48]} />
                    <meshBasicMaterial color="#ffffff" transparent opacity={0.07} depthWrite={false} />
                  </mesh>
                </>
              ) : null}
            </group>
          )
        })}

        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[2.5, -0.018, 2.3]} receiveShadow>
          <planeGeometry args={[7.6, 6.2]} />
          <shadowMaterial color="#000000" transparent opacity={0.18} depthWrite={false} />
        </mesh>

        {/* 点击涟漪冲击波 */}
        <Ripples
          ripples={ripples}
          onDone={(id) => onRipplesChange((prev) => prev.filter((r) => r.id !== id))}
        />
      </group>
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
  const ref2 = useRef<Mesh | null>(null)
  useFrame(() => {
    const now = performance.now() / 1000
    const t = (now - ripple.startedAt) / 0.85
    if (!ref.current) return
    const tt = Math.max(0, Math.min(1, t))
    const s = 0.2 + tt * 2.25
    ref.current.scale.set(s, s, s)
    ;(ref.current.material as any).opacity = (1 - tt) * 0.36 * ripple.strength
    if (ref2.current) {
      const s2 = 0.16 + tt * 1.8
      ref2.current.scale.set(s2, s2, s2)
      ;(ref2.current.material as any).opacity = (1 - tt) * 0.26 * ripple.strength
    }
  })

  return (
    <group position={ripple.origin} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh ref={ref as any}>
        <ringGeometry args={[0.14, 0.19, 64]} />
        <meshBasicMaterial color="#9bf6be" transparent opacity={0.24} depthWrite={false} />
      </mesh>
      <mesh ref={ref2 as any}>
        <ringGeometry args={[0.06, 0.1, 48]} />
        <meshBasicMaterial color="#7fdfff" transparent opacity={0.18} depthWrite={false} />
      </mesh>
    </group>
  )
}
