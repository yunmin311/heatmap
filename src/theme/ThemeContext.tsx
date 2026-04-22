import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'

export type ThemePreset = 'deep-space' | 'soft-milk' | 'amber'

export type ThemeSettings = {
  backgroundHue: number
  glassOpacity: number
  blurStrength: number
  fluidOpacity: number
}

type ThemePresetConfig = {
  label: string
  backgroundGradient: string
  fogA: string
  fogB: string
  fogC: string
  fogD: string
  glassRgb: string
  borderRgb: string
  borderAlpha: number
  accent: string
  textTitle: string
  textBody: string
  textMuted: string
  canvasFilter: string
  defaultSettings: ThemeSettings
}

type ThemeContextValue = {
  preset: ThemePreset
  settings: ThemeSettings
  presets: Record<ThemePreset, ThemePresetConfig>
  applyPreset: (preset: ThemePreset) => void
  patchSettings: (next: Partial<ThemeSettings>) => void
  cssVars: CSSProperties
}

const STORAGE_KEY = 'heatmap-vibe.theme.v2'

const PRESETS: Record<ThemePreset, ThemePresetConfig> = {
  'deep-space': {
    label: '深空星云',
    backgroundGradient: 'radial-gradient(circle at 30% 20%, #2d1b4e 0%, #1a1a2e 50%, #0f0f1a 100%)',
    fogA: 'rgba(167, 139, 250, 0.55)',
    fogB: 'rgba(124, 58, 237, 0.42)',
    fogC: 'rgba(76, 29, 149, 0.38)',
    fogD: 'rgba(45, 27, 78, 0.5)',
    glassRgb: '180 160 255',
    borderRgb: '180 160 255',
    borderAlpha: 0.12,
    accent: '#a78bfa',
    textTitle: 'rgba(255, 255, 255, 0.95)',
    textBody: 'rgba(255, 255, 255, 0.8)',
    textMuted: 'rgba(255, 255, 255, 0.6)',
    canvasFilter: 'none',
    defaultSettings: {
      backgroundHue: 262,
      glassOpacity: 0.06,
      blurStrength: 20,
      fluidOpacity: 0.1,
    },
  },
  'soft-milk': {
    label: '雾白极简',
    backgroundGradient: 'radial-gradient(circle at 50% 30%, #fafafa 0%, #f5f5f5 50%, #ebebeb 100%)',
    fogA: 'rgba(255, 255, 255, 0.72)',
    fogB: 'rgba(235, 235, 235, 0.62)',
    fogC: 'rgba(212, 212, 212, 0.5)',
    fogD: 'rgba(245, 245, 245, 0.66)',
    glassRgb: '255 255 255',
    borderRgb: '0 0 0',
    borderAlpha: 0.06,
    accent: '#6b7280',
    textTitle: 'rgba(17, 24, 39, 0.9)',
    textBody: 'rgba(31, 41, 55, 0.75)',
    textMuted: 'rgba(55, 65, 81, 0.55)',
    canvasFilter: 'saturate(0.35) brightness(1.08) contrast(0.96)',
    defaultSettings: {
      backgroundHue: 40,
      glassOpacity: 0.7,
      blurStrength: 20,
      fluidOpacity: 0.06,
    },
  },
  amber: {
    label: '焦糖暖雾',
    backgroundGradient: 'radial-gradient(circle at 40% 30%, #3d2317 0%, #2c1810 50%, #1a0f0a 100%)',
    fogA: 'rgba(212, 165, 116, 0.58)',
    fogB: 'rgba(139, 90, 43, 0.46)',
    fogC: 'rgba(90, 54, 34, 0.42)',
    fogD: 'rgba(61, 35, 23, 0.5)',
    glassRgb: '255 240 220',
    borderRgb: '255 240 220',
    borderAlpha: 0.12,
    accent: '#d4a574',
    textTitle: 'rgba(255, 255, 255, 0.95)',
    textBody: 'rgba(255, 255, 255, 0.8)',
    textMuted: 'rgba(255, 255, 255, 0.6)',
    canvasFilter: 'hue-rotate(-26deg) saturate(1.14) brightness(0.96)',
    defaultSettings: {
      backgroundHue: 30,
      glassOpacity: 0.06,
      blurStrength: 20,
      fluidOpacity: 0.09,
    },
  },
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preset, setPreset] = useState<ThemePreset>('deep-space')
  const [settings, setSettings] = useState<ThemeSettings>(PRESETS['deep-space'].defaultSettings)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as { preset?: ThemePreset; settings?: Partial<ThemeSettings> }

      const nextPreset = parsed.preset && PRESETS[parsed.preset] ? parsed.preset : 'deep-space'
      const base = PRESETS[nextPreset].defaultSettings
      setPreset(nextPreset)
      setSettings({
        backgroundHue: clamp(Number(parsed.settings?.backgroundHue ?? base.backgroundHue), 0, 360),
        glassOpacity: clamp(Number(parsed.settings?.glassOpacity ?? base.glassOpacity), 0.03, 0.75),
        blurStrength: clamp(Number(parsed.settings?.blurStrength ?? base.blurStrength), 8, 36),
        fluidOpacity: clamp(Number(parsed.settings?.fluidOpacity ?? base.fluidOpacity), 0.06, 0.12),
      })
    } catch {
      // 忽略损坏缓存，回退默认主题。
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        preset,
        settings,
      }),
    )
  }, [preset, settings])

  const applyPreset = useCallback((nextPreset: ThemePreset) => {
    setPreset(nextPreset)
    setSettings(PRESETS[nextPreset].defaultSettings)
  }, [])

  const patchSettings = useCallback((next: Partial<ThemeSettings>) => {
    setSettings((prev) => ({
      backgroundHue: clamp(Number(next.backgroundHue ?? prev.backgroundHue), 0, 360),
      glassOpacity: clamp(Number(next.glassOpacity ?? prev.glassOpacity), 0.03, 0.75),
      blurStrength: clamp(Number(next.blurStrength ?? prev.blurStrength), 8, 36),
      fluidOpacity: clamp(Number(next.fluidOpacity ?? prev.fluidOpacity), 0.06, 0.12),
    }))
  }, [])

  const cssVars = useMemo(() => {
    const presetConfig = PRESETS[preset]
    const subAlpha = clamp(settings.glassOpacity * 0.5, 0.03, 0.35)

    return {
      '--theme-bg-gradient': presetConfig.backgroundGradient,
      '--theme-fog-a': presetConfig.fogA,
      '--theme-fog-b': presetConfig.fogB,
      '--theme-fog-c': presetConfig.fogC,
      '--theme-fog-d': presetConfig.fogD,
      '--theme-glass-rgb': presetConfig.glassRgb,
      '--theme-border-rgb': presetConfig.borderRgb,
      '--theme-border-alpha': `${presetConfig.borderAlpha}`,
      '--theme-accent': presetConfig.accent,
      '--text-title': presetConfig.textTitle,
      '--text-body': presetConfig.textBody,
      '--text-muted': presetConfig.textMuted,
      '--heatmap-canvas-filter': presetConfig.canvasFilter,
      '--panel-main-alpha': `${settings.glassOpacity}`,
      '--panel-sub-alpha': `${subAlpha}`,
      '--glass-blur': `${settings.blurStrength}px`,
      '--fluid-opacity': `${settings.fluidOpacity}`,
      '--bg-hue': `${settings.backgroundHue}`,
    } as CSSProperties
  }, [preset, settings])

  const value = useMemo<ThemeContextValue>(
    () => ({
      preset,
      settings,
      presets: PRESETS,
      applyPreset,
      patchSettings,
      cssVars,
    }),
    [applyPreset, cssVars, patchSettings, preset, settings],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const value = useContext(ThemeContext)
  if (!value) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return value
}
