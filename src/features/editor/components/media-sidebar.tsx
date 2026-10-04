import { useCallback, useMemo, useRef, useEffect, memo, lazy, Suspense, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  AudioLines,
  Gauge,
  Film,
  Layers,
  Type,
  Square,
  Circle,
  Triangle,
  Star,
  Hexagon,
  Heart,
  Pentagon,
  Blend,
  Pen,
  Captions,
  Sticker,
  WandSparkles,
  Plus,
} from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/shared/ui/cn'
import { useEditorStore } from '@/shared/state/editor'
import {
  useCompositionNavigationStore,
  useCompositionsStore,
  useTimelineStore,
} from '@/features/editor/deps/timeline-store'
import { usePlaybackStore } from '@/shared/state/playback'
import { useSelectionStore } from '@/shared/state/selection'
import { useProjectStore } from '@/features/editor/deps/projects'
import { DEFAULT_PROJECT_HEIGHT, DEFAULT_PROJECT_WIDTH } from '@/shared/projects/defaults'
import {
  clearMediaDragData,
  MediaLibrary,
  resolveMediaUrl,
  setMediaDragData,
  useMediaLibraryStore,
} from '@/features/editor/deps/media-library'
import { importTranscriptEditorPanel } from '@/features/editor/deps/timeline-panels'
import { LottieBrowserPanel } from '@/features/editor/deps/lottie-browser'
import { TransitionsPanel } from './transitions-panel'
import {
  createDefaultGradientItem,
  createDefaultShapeItem,
  createDefaultSolidColorItem,
  createClassicTrack,
  createOverlayLayerTrack,
  createTextTemplateItem,
  getDefaultGeneratedLayerDurationInFrames,
  resolvePhotoPublishingDurationInFrames,
  computeInitialTransform,
  buildBeatvideoCoverLayoutItems,
} from '@/features/editor/deps/timeline-utils'
import {
  addItemsOnNewTracks,
  buildDroppedMediaTimelineItems,
  replaceItemsOnTrack,
} from '@/features/editor/deps/timeline-contract'
import { addAdjustmentLayer } from '../utils/add-adjustment-layer'
import type { TextItem, ShapeItem, ShapeType } from '@/types/timeline'
import { useMaskEditorStore } from '@/features/editor/deps/preview'
import type { VisualEffect, GpuEffect } from '@/types/effects'
import { EFFECT_PRESETS } from '@/types/effects'
import { getGpuEffectDefaultParams } from '@/infrastructure/gpu-effects'
import {
  EffectThumbnail,
  isAudioReactiveParam,
  useGpuEffectPreviewData,
} from '@/features/editor/deps/effects-contract'
import { createLogger } from '@/shared/logging/logger'
import { useSettingsStore } from '@/features/editor/deps/settings'
import { resolveGeneratedLayerCanvasSize } from '../utils/generated-layer-canvas-size'
import type { BeatvideoProjectMode } from '@/types/project'
import { isSidebarTabVisibleForBeatvideoMode } from '@/config/beatvideo'
import type { EditorSidebarTab, EditorWorkspaceId } from '@/config/editor-workspaces'
const LazyBeatvideoMusicPanel = lazy(() =>
  import('./beatvideo-music-panel').then((module) => ({ default: module.BeatvideoMusicPanel })),
)
const LazyBeatvideoMasterPanel = lazy(() =>
  import('./beatvideo-master-panel').then((module) => ({ default: module.BeatvideoMasterPanel })),
)
import { BeatvideoVisualSourcePanel } from './beatvideo-visual-source-panel'
import { resolveBeatvideoTimelineGrid } from '@/features/editor/deps/beatvideo-music'
import {
  BEATVIDEO_REACTIVE_GRAPHIC_PRESETS,
  buildBeatvideoReactiveGraphicItems,
  type BeatvideoReactiveGraphicPresetId,
} from '../utils/beatvideo-reactive-graphics'
const LazyAiPanel = lazy(() => import('./ai-tab').then((m) => ({ default: m.AiTab })))
const LazyTranscriptEditorPanel = lazy(() =>
  importTranscriptEditorPanel().then(({ TranscriptEditorPanel }) => ({
    default: TranscriptEditorPanel,
  })),
)
import {
  TEXT_STYLE_PRESETS,
  type TextStylePreset,
} from '@/shared/typography/text-style-presets'
import {
  EDITOR_LAYOUT_CSS_VALUES,
  clampLeftEditorSidebarWidth,
  getEditorLayout,
} from '@/config/editor-layout'

const logger = createLogger('MediaSidebar')

function isSidebarTabVisibleForWorkspace(
  tab: EditorSidebarTab,
  workspace: EditorWorkspaceId,
): boolean {
  if (workspace === 'beat') return tab === 'beat'
  if (workspace === 'master') return tab === 'master'
  if (workspace === 'color') return tab === 'effects'
  if (workspace === 'motion') return tab === 'media'
  if (workspace === 'edit') {
    return tab !== 'beat' && tab !== 'master'
  }
  return tab !== 'beat' && tab !== 'master'
}

function getWorkspaceSidebarFallback(workspace: EditorWorkspaceId): EditorSidebarTab {
  if (workspace === 'beat') return 'beat'
  if (workspace === 'master') return 'master'
  if (workspace === 'color') return 'effects'
  return 'media'
}

const TEXT_TEMPLATE_PREVIEW_SHELL =
  'w-full aspect-video rounded-sm border border-border bg-slate-950'

function renderTextTemplatePreview(
  preset?: TextStylePreset,
  sampleOverride?: Partial<TextStylePreset['sample']>,
) {
  if (!preset) {
    return (
      <div
        className={`${TEXT_TEMPLATE_PREVIEW_SHELL} flex flex-col items-center justify-center gap-1`}
      >
        <Type className="w-3.5 h-3.5 text-muted-foreground/80" />
        <div className="text-[9px] leading-none tracking-wide text-muted-foreground/80 uppercase">
          Text
        </div>
      </div>
    )
  }

  const copy = { ...preset.sample, ...sampleOverride }

  if (preset.previewKind === 'clean') {
    return (
      <div className={`${TEXT_TEMPLATE_PREVIEW_SHELL} flex items-center justify-center px-1.5`}>
        <div className="text-[10px] font-bold tracking-[-0.05em] text-white uppercase leading-none">
          {copy.title}
        </div>
      </div>
    )
  }

  if (preset.previewKind === 'lower-third') {
    return (
      <div className={`${TEXT_TEMPLATE_PREVIEW_SHELL} relative overflow-hidden`}>
        <div className="absolute inset-x-1.5 bottom-1.5 rounded-sm bg-slate-800/95 px-1.5 py-1 text-left">
          <div className="text-[8px] font-semibold leading-none text-slate-50">{copy.title}</div>
          <div className="mt-0.5 text-[7px] leading-none text-slate-300">{copy.subtitle}</div>
        </div>
      </div>
    )
  }

  if (preset.previewKind === 'poster') {
    return (
      <div className={`${TEXT_TEMPLATE_PREVIEW_SHELL} flex items-center justify-center px-1.5`}>
        <div className="text-[12px] tracking-[-0.05em] text-amber-100 uppercase leading-none [text-shadow:0_2px_10px_rgba(127,29,29,0.85)]">
          {copy.title}
        </div>
      </div>
    )
  }

  if (preset.previewKind === 'outline-pill') {
    return (
      <div className={`${TEXT_TEMPLATE_PREVIEW_SHELL} flex items-center justify-center px-1.5`}>
        <div className="rounded-full border border-sky-400/70 bg-slate-900 px-2 py-1 text-[7px] font-bold tracking-[0.18em] text-slate-100 uppercase leading-none">
          {copy.title}
        </div>
      </div>
    )
  }

  if (preset.previewKind === 'cinematic') {
    return (
      <div
        className={`${TEXT_TEMPLATE_PREVIEW_SHELL} flex flex-col items-center justify-center px-1`}
      >
        <div className="text-[11px] tracking-[0.28em] text-amber-100 uppercase leading-none [text-shadow:0_2px_8px_rgba(17,24,39,0.9)]">
          {copy.title}
        </div>
      </div>
    )
  }

  if (preset.previewKind === 'quote') {
    return (
      <div className={`${TEXT_TEMPLATE_PREVIEW_SHELL} p-1.5 flex items-center justify-center`}>
        <div className="w-full rounded-sm bg-slate-800 px-2 py-1.5 text-center">
          <div className="text-[8px] italic leading-tight text-slate-50">{copy.title}</div>
          <div className="mt-0.5 text-[7px] leading-none tracking-[0.08em] text-slate-300">
            {copy.subtitle}
          </div>
        </div>
      </div>
    )
  }

  if (preset.previewKind === 'speaker') {
    return (
      <div className={`${TEXT_TEMPLATE_PREVIEW_SHELL} px-1.5 py-1 flex flex-col justify-end`}>
        <div className="rounded-sm bg-slate-800/95 px-1.5 py-1">
          <div className="text-[8px] font-bold leading-none text-slate-50">{copy.title}</div>
          <div className="mt-0.5 text-[7px] leading-none text-slate-300">{copy.subtitle}</div>
        </div>
      </div>
    )
  }

  if (preset.previewKind === 'neon') {
    return (
      <div className={`${TEXT_TEMPLATE_PREVIEW_SHELL} p-1.5 flex items-center justify-center`}>
        <div className="w-full rounded-sm bg-cyan-950 px-1.5 py-1.5 text-center">
          <div className="text-[10px] font-semibold tracking-[0.16em] text-cyan-300 drop-shadow-[0_0_6px_rgba(34,211,238,0.85)] uppercase">
            {copy.title}
          </div>
        </div>
      </div>
    )
  }

  if (preset.previewKind === 'stacked') {
    return (
      <div
        className={`${TEXT_TEMPLATE_PREVIEW_SHELL} flex flex-col items-center justify-center px-1.5`}
      >
        <div className="text-[6px] font-semibold tracking-[0.2em] text-amber-300 uppercase">
          {copy.eyebrow}
        </div>
        <div className="mt-1 text-[10px] font-bold tracking-[-0.04em] text-white leading-none">
          {copy.title}
        </div>
        <div className="mt-0.5 text-[7px] leading-none text-slate-300">{copy.subtitle}</div>
      </div>
    )
  }

  if (preset.previewKind === 'breaking') {
    return (
      <div className={`${TEXT_TEMPLATE_PREVIEW_SHELL} p-1.5 flex items-center justify-center`}>
        <div className="w-full rounded-sm bg-slate-900 px-1.5 py-1 text-left">
          <div className="text-[6px] font-bold tracking-[0.18em] text-red-300 uppercase leading-none">
            {copy.eyebrow}
          </div>
          <div className="mt-1 text-[9px] font-bold tracking-[-0.04em] text-slate-50 leading-none">
            {copy.title}
          </div>
          <div className="mt-0.5 text-[7px] font-semibold leading-none text-amber-200">
            {copy.subtitle}
          </div>
        </div>
      </div>
    )
  }

  if (preset.previewKind === 'launch') {
    return (
      <div className={`${TEXT_TEMPLATE_PREVIEW_SHELL} p-1.5 flex items-center justify-center`}>
        <div className="w-full rounded-sm border border-blue-800/80 bg-slate-900 px-1.5 py-1 text-center">
          <div className="text-[6px] font-bold tracking-[0.22em] text-cyan-300 uppercase">
            {copy.eyebrow}
          </div>
          <div className="mt-1 text-[9px] font-bold tracking-[-0.04em] text-slate-50 leading-tight">
            {copy.title}
          </div>
          <div className="mt-0.5 text-[7px] leading-none text-blue-200">{copy.subtitle}</div>
        </div>
      </div>
    )
  }

  if (preset.previewKind === 'event') {
    return (
      <div className={`${TEXT_TEMPLATE_PREVIEW_SHELL} p-1.5 flex items-center justify-center`}>
        <div className="w-full rounded-sm bg-slate-900 px-1.5 py-1 text-center">
          <div className="text-[6px] font-bold tracking-[0.22em] text-rose-300 uppercase">
            {copy.eyebrow}
          </div>
          <div className="mt-1 text-[9px] font-bold text-slate-50 leading-tight">{copy.title}</div>
          <div className="mt-0.5 text-[7px] text-blue-200 leading-none uppercase">
            {copy.subtitle}
          </div>
        </div>
      </div>
    )
  }

  if (preset.previewKind === 'badge') {
    return (
      <div className={`${TEXT_TEMPLATE_PREVIEW_SHELL} flex items-center justify-center px-1.5`}>
        <div className="rounded-full border border-slate-600 bg-slate-800 px-2 py-1 text-[7px] font-bold tracking-[0.18em] text-slate-50 uppercase leading-none">
          {copy.title}
        </div>
      </div>
    )
  }

  return (
    <div
      className={`${TEXT_TEMPLATE_PREVIEW_SHELL} flex flex-col items-center justify-center px-1.5`}
    >
      <div className="text-[10px] font-bold tracking-[-0.04em] text-white uppercase leading-none">
        {copy.title}
      </div>
      <div className="mt-0.5 text-[7px] leading-none text-slate-300 uppercase">{copy.subtitle}</div>
    </div>
  )
}

const DEFAULT_TEXT_TEMPLATE_LABEL = 'Text'

type ProducerTextPresetId =
  | 'corner-mark'
  | 'lower-third'
  | 'center-stamp'
  | 'beat-title'

const PRODUCER_TEXT_PRESETS: ReadonlyArray<{
  id: ProducerTextPresetId
  label: string
  description: string
  stylePresetId: TextStylePreset['id']
  text: string
}> = [
  {
    id: 'corner-mark',
    label: 'Corner mark',
    description: 'Small producer ID',
    stylePresetId: 'badge',
    text: 'PROD. NAME',
  },
  {
    id: 'lower-third',
    label: 'Lower third',
    description: 'Name + subline',
    stylePresetId: 'lower-third',
    text: 'PROD. NAME',
  },
  {
    id: 'center-stamp',
    label: 'Center stamp',
    description: 'Bold centered ID',
    stylePresetId: 'poster',
    text: 'PROD. NAME',
  },
  {
    id: 'beat-title',
    label: 'Beat title',
    description: 'Title + producer',
    stylePresetId: 'cinematic',
    text: 'BEAT TITLE\nPROD. NAME',
  },
]

const VISIBLE_TEXT_PRESET_IDS = new Set<TextStylePreset['id']>([
  'clean-title',
  'poster',
  'lower-third',
  'cinematic',
  'badge',
])

function renderProducerTextPreview(preset: (typeof PRODUCER_TEXT_PRESETS)[number]) {
  const displayFont = { fontFamily: "'Staatliches', Impact, sans-serif" }
  const signatureFont = { fontFamily: "'Tritopani', 'Caveat', cursive" }
  return (
    <div className="relative aspect-video w-full overflow-hidden border border-[#474d46] bg-[#252923] text-white">
      {preset.id === 'corner-mark' && (
        <span className="absolute right-[7%] top-[9%] text-[9px] leading-none tracking-[0.04em]" style={displayFont}>
          PROD. NAME
        </span>
      )}
      {preset.id === 'lower-third' && (
        <div className="absolute bottom-[13%] left-[8%] flex flex-col items-start">
          <span className="text-[13px] leading-none tracking-[0.01em]" style={displayFont}>PROD. NAME</span>
          <span className="mt-0.5 text-[10px] leading-none text-[#e9f0df]" style={signatureFont}>Beat by Hugo White</span>
        </div>
      )}
      {preset.id === 'center-stamp' && (
        <span className="absolute inset-0 flex items-center justify-center text-[17px] tracking-[0.025em]" style={displayFont}>
          HUGOWHITE
        </span>
      )}
      {preset.id === 'beat-title' && (
        <div className="absolute inset-x-[5%] top-[9%] flex flex-col items-center">
          <span className="text-[20px] leading-[0.9] tracking-[-0.025em]" style={displayFont}>GLOCK IT</span>
          <span className="mt-[5%] text-[9px] leading-none text-[#ff5a1f]" style={displayFont}>KEVIN TYPE BEAT</span>
          <span className="mt-0.5 text-[10px] leading-none text-white" style={signatureFont}>Hugo White</span>
        </div>
      )}
    </div>
  )
}

const REACTIVE_EFFECT_PRESET_IDS = new Set<BeatvideoReactiveGraphicPresetId>([
  'beat-flash',
  'pulse-frame',
])
const REACTIVE_GRAPHIC_PRESET_IDS = new Set<BeatvideoReactiveGraphicPresetId>([
  'three-band-bars',
])

function renderReactiveGraphicPreview(presetId: BeatvideoReactiveGraphicPresetId) {
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-[2px] border border-border bg-[#343834]">
      <div className="absolute inset-0 bg-[linear-gradient(135deg,#3d423d_0%,#202420_100%)]" />
      {presetId === 'beat-flash' ? (
        <>
          <div className="absolute inset-0 bg-white/40" />
          <div className="absolute inset-x-[18%] top-1/2 h-px -translate-y-1/2 bg-white/80" />
        </>
      ) : presetId === 'pulse-frame' ? (
        <>
          <div className="absolute inset-[14%] border-2 border-white/90" />
          <div className="absolute inset-[22%] border border-white/20" />
        </>
      ) : (
        <div className="absolute inset-x-[24%] bottom-[18%] top-[18%] flex items-end justify-center gap-[8%]">
          <span className="h-[42%] w-[22%] bg-white/75" />
          <span className="h-[86%] w-[22%] bg-[#c7e85a]" />
          <span className="h-[62%] w-[22%] bg-white/75" />
        </div>
      )}
    </div>
  )
}

const PHOTO_QUICK_EFFECT_IDS = [
  'gpu-grain',
  'gpu-vignette',
  'gpu-glow',
  'gpu-sharpen',
  'gpu-rgb-split',
  'gpu-gaussian-blur',
] as const

const MASTER_SIDEBAR_STORAGE_KEY = 'editor:masterSidebarWidth'
const MASTER_SIDEBAR_DEFAULT_WIDTH = 480
const MASTER_SIDEBAR_MIN_WIDTH = 400
const MASTER_SIDEBAR_MAX_WIDTH = 680

function clampMasterSidebarWidth(width: number): number {
  const viewportMax =
    typeof window === 'undefined'
      ? MASTER_SIDEBAR_MAX_WIDTH
      : Math.max(MASTER_SIDEBAR_MIN_WIDTH, Math.floor(window.innerWidth * 0.48))
  return Math.min(
    MASTER_SIDEBAR_MAX_WIDTH,
    viewportMax,
    Math.max(MASTER_SIDEBAR_MIN_WIDTH, width),
  )
}

function loadMasterSidebarWidth(): number {
  try {
    const stored = Number(window.localStorage.getItem(MASTER_SIDEBAR_STORAGE_KEY))
    if (Number.isFinite(stored) && stored > 0) return clampMasterSidebarWidth(stored)
  } catch {
    /* Keep the mastering surface usable when storage is unavailable. */
  }
  return clampMasterSidebarWidth(MASTER_SIDEBAR_DEFAULT_WIDTH)
}

function persistMasterSidebarWidth(width: number): void {
  try {
    window.localStorage.setItem(MASTER_SIDEBAR_STORAGE_KEY, String(width))
  } catch {
    /* Width persistence is a convenience, never a blocker. */
  }
}

export const MediaSidebar = memo(function MediaSidebar({
  beatvideoMode = 'video',
  mobile = false,
  studioTaskColumn = false,
}: {
  beatvideoMode?: BeatvideoProjectMode
  mobile?: boolean
  studioTaskColumn?: boolean
}) {
  const { t } = useTranslation()
  const editorDensity = useSettingsStore((s) => s.editorDensity)
  const editorLayout = getEditorLayout(editorDensity)
  // Use granular selectors - Zustand v5 best practice
  const leftSidebarOpen = useEditorStore((s) => s.leftSidebarOpen)
  const toggleLeftSidebar = useEditorStore((s) => s.toggleLeftSidebar)
  const mediaFullColumn = useEditorStore((s) => s.mediaFullColumn)
  const toggleMediaFullColumn = useEditorStore((s) => s.toggleMediaFullColumn)
  const activeTab = useEditorStore((s) => s.activeTab)
  const workspace = useEditorStore((s) => s.workspace)
  const setActiveTab = useEditorStore((s) => s.setActiveTab)
  const sidebarWidth = useEditorStore((s) => s.sidebarWidth)
  const setSidebarWidth = useEditorStore((s) => s.setSidebarWidth)
  const prefersReducedMotion = useReducedMotion()
  const [masterSidebarWidth, setMasterSidebarWidth] = useState(loadMasterSidebarWidth)
  const effectiveSidebarWidth =
    workspace === 'master' ? masterSidebarWidth : sidebarWidth

  const [beatTabActivated, setBeatTabActivated] = useState(activeTab === 'beat')
  const [aiTabActivated, setAiTabActivated] = useState(activeTab === 'ai')
  const [showAllPhotoEffects, setShowAllPhotoEffects] = useState(false)
  const [importingPhotoCover, setImportingPhotoCover] = useState(false)
  // The Lottie panel hits an external API on mount, so keep it unmounted until
  // the tab is first opened; it then stays mounted (state preserved).
  const [lottieTabActivated, setLottieTabActivated] = useState(activeTab === 'lottie')
  useEffect(() => {
    if (activeTab === 'beat') setBeatTabActivated(true)
    if (activeTab === 'ai') setAiTabActivated(true)
    if (activeTab === 'lottie') setLottieTabActivated(true)
  }, [activeTab])

  // The collapsed panel stays mounted (clipped to 0 width, see NOTE below), so
  // its buttons/inputs would remain in the tab order while invisible. Mark the
  // content `inert` once the close animation settles to pull them out of tab
  // order without yanking focus mid-animation; clear it immediately on open so
  // the panel is interactive as it slides in. Mirrors the right sidebar's
  // contentVisible/onAnimationComplete handoff.
  const [contentInert, setContentInert] = useState(!leftSidebarOpen)
  useEffect(() => {
    if (leftSidebarOpen) setContentInert(false)
  }, [leftSidebarOpen])

  // NOTE: the heavy media-library subtree is deliberately NOT gated behind
  // Activity `hidden` when collapsed. React defers the hidden→visible reveal, so
  // on open the content lands after the (ease-out) width has already raced open —
  // reading as a snap. Instead it stays mounted and is promoted to its own GPU
  // layer (translateZ on the holder below): rasterized once, then the width /
  // overflow clip reveals it via the compositor — no per-frame repaint (the old
  // churn) and it slides symmetrically open/closed. When collapsed it's clipped to
  // 0 width so it isn't painted; the only residual cost is occasional
  // reconciliation, which is negligible for this panel.

  // Resize handle logic
  const isResizingRef = useRef(false)
  const startXRef = useRef(0)
  const startWidthRef = useRef(0)
  const suppressGeneratedItemClickRef = useRef(false)

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      isResizingRef.current = true
      startXRef.current = e.clientX
      startWidthRef.current = effectiveSidebarWidth
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    },
    [effectiveSidebarWidth],
  )

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingRef.current) return
      const delta = e.clientX - startXRef.current
      if (workspace === 'master') {
        const nextWidth = clampMasterSidebarWidth(startWidthRef.current + delta)
        setMasterSidebarWidth(nextWidth)
        persistMasterSidebarWidth(nextWidth)
        return
      }
      const newWidth = clampLeftEditorSidebarWidth(startWidthRef.current + delta, editorLayout)
      setSidebarWidth(newWidth)
    }

    const handleMouseUp = () => {
      if (!isResizingRef.current) return
      isResizingRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      isResizingRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [editorLayout, setSidebarWidth, workspace])

  // NOTE: Don't subscribe to tracks, items, currentProject here!
  // These change frequently and would cause re-renders cascading to MediaLibrary/MediaCards
  // Read from store directly in callbacks using getState()

  // Add text item on its own new layer at the playhead, matching what dragging
  // the same preset onto the canvas does (minus the cursor-driven position).
  const handleAddText = useCallback(
    (presetId?: (typeof TEXT_STYLE_PRESETS)[number]['id']) => {
      // Read all needed state from stores directly to avoid subscriptions
      const { tracks, fps, addItemOnNewTrack } = useTimelineStore.getState()
      const { activeTrackId, selectItems, setActiveTrack } = useSelectionStore.getState()
      const currentProject = useProjectStore.getState().currentProject

      const newTrack = createOverlayLayerTrack({ tracks, activeTrackId })

      if (!newTrack) {
        logger.warn('No available track for text item')
        return
      }

      const durationInFrames = getDefaultGeneratedLayerDurationInFrames(fps)

      // Get canvas dimensions for initial transform
      const canvasWidth = currentProject?.metadata.width ?? DEFAULT_PROJECT_WIDTH
      const canvasHeight = currentProject?.metadata.height ?? DEFAULT_PROJECT_HEIGHT

      const textStylePreset = presetId
        ? TEXT_STYLE_PRESETS.find((preset) => preset.id === presetId)
        : undefined
      const textItem: TextItem = createTextTemplateItem({
        placement: {
          trackId: newTrack.trackId,
          from: Math.max(0, usePlaybackStore.getState().currentFrame),
          durationInFrames,
          canvasWidth,
          canvasHeight,
          fps,
        },
        label: textStylePreset?.label,
        text: t('editor.textSection.defaultText'),
        textStylePresetId: presetId,
      })

      addItemOnNewTrack(textItem, newTrack.tracks)
      setActiveTrack(newTrack.trackId)
      selectItems([textItem.id])
    },
    [t],
  )

  const handleAddProducerText = useCallback((presetId: ProducerTextPresetId) => {
    const preset = PRODUCER_TEXT_PRESETS.find((candidate) => candidate.id === presetId)
    if (!preset) return

    const timeline = useTimelineStore.getState()
    const selection = useSelectionStore.getState()
    const currentProject = useProjectStore.getState().currentProject
    const canvasWidth = currentProject?.metadata.width ?? DEFAULT_PROJECT_WIDTH
    const canvasHeight = currentProject?.metadata.height ?? DEFAULT_PROJECT_HEIGHT
    const publishDuration = resolvePhotoPublishingDurationInFrames(timeline.fps, {
      beatvideoMode: currentProject?.beatvideoMode,
      beatvideoMusic: currentProject?.beatvideoMusic,
      projectMedia: useMediaLibraryStore.getState().mediaItems,
      timelineItems: timeline.items,
    })
    const forFullBeat = currentProject?.beatvideoMode === 'photo' && publishDuration > 0
    const durationInFrames = forFullBeat
      ? publishDuration
      : getDefaultGeneratedLayerDurationInFrames(timeline.fps)
    const from = forFullBeat ? 0 : Math.max(0, usePlaybackStore.getState().currentFrame)
    const placement = (trackId: string) => ({
      trackId,
      from,
      durationInFrames,
      canvasWidth,
      canvasHeight,
      fps: timeline.fps,
    })
    const nextTrack = (tracks: typeof timeline.tracks) =>
      createOverlayLayerTrack({ tracks, activeTrackId: selection.activeTrackId })

    // A type-beat cover is three real independent timeline text layers, not
    // one flattened multiline text item or a parallel graphics document.
    if (presetId === 'beat-title') {
      let workingTracks = timeline.tracks
      const ids = new Map<'title' | 'subtitle' | 'branding', string>()
      for (const role of ['branding', 'subtitle', 'title'] as const) {
        const planned = nextTrack(workingTracks)
        if (!planned) return
        workingTracks = planned.tracks
        ids.set(role, planned.trackId)
      }
      const title = ids.get('title')
      const subtitle = ids.get('subtitle')
      const branding = ids.get('branding')
      if (!title || !subtitle || !branding) return
      const items = buildBeatvideoCoverLayoutItems({
        presetId: 'hero-stack',
        content: { title: 'BEAT TITLE', subtitle: 'TYPE BEAT', branding: 'PROD. NAME' },
        titleMotion: 'static',
        trackIds: { title, subtitle, branding },
        from,
        durationInFrames,
        canvasWidth,
        canvasHeight,
        fps: timeline.fps,
      })
      addItemsOnNewTracks(items, workingTracks)
      selection.setActiveTrack(title)
      selection.selectItems([items[0]!.id])
      return
    }

    // Lower third has an independently editable signature. Its thumbnail and
    // inserted output now share the same actual two-font composition.
    if (presetId === 'lower-third') {
      const creditTrack = nextTrack(timeline.tracks)
      if (!creditTrack) return
      const nameTrack = nextTrack(creditTrack.tracks)
      if (!nameTrack) return
      const nameBase = createTextTemplateItem({
        placement: placement(nameTrack.trackId),
        label: 'Producer name',
        text: 'PROD. NAME',
      })
      const creditBase = createTextTemplateItem({
        placement: placement(creditTrack.trackId),
        label: 'Producer signature',
        text: 'Beat by Hugo White',
      })
      const name: TextItem = {
        ...nameBase,
        label: 'Producer name',
        fontFamily: 'Staatliches', fontWeight: 'normal',
        color: '#ffffff', fontSize: Math.round(canvasHeight * 0.063),
        lineHeight: 0.96, textPadding: 0, textSpans: undefined,
        backgroundColor: undefined, stroke: undefined, textStylePresetId: undefined,
        transform: {
          ...nameBase.transform,
          x: Math.round(-canvasWidth * 0.22),
          y: Math.round(canvasHeight * 0.33),
          width: Math.round(canvasWidth * 0.46),
          height: Math.round(canvasHeight * 0.1),
        },
      }
      const signature: TextItem = {
        ...creditBase,
        label: 'Producer signature',
        fontFamily: 'Caveat', fontWeight: 'normal',
        color: '#ffffff', fontSize: Math.round(canvasHeight * 0.045),
        lineHeight: 1, textPadding: 0, textSpans: undefined,
        backgroundColor: undefined, stroke: undefined, textStylePresetId: undefined,
        transform: {
          ...creditBase.transform,
          x: Math.round(-canvasWidth * 0.22),
          y: Math.round(canvasHeight * 0.413),
          width: Math.round(canvasWidth * 0.42),
          height: Math.round(canvasHeight * 0.075),
        },
      }
      addItemsOnNewTracks([name, signature], nameTrack.tracks)
      selection.setActiveTrack(nameTrack.trackId)
      selection.selectItems([name.id])
      return
    }

    const newTrack = nextTrack(timeline.tracks)
    if (!newTrack) return
    const baseItem = createTextTemplateItem({
      placement: placement(newTrack.trackId),
      label: preset.label,
      text: preset.id === 'corner-mark' ? 'PROD. NAME' : 'HUGOWHITE',
    })
    const isCorner = preset.id === 'corner-mark'
    const item: TextItem = {
      ...baseItem,
      label: preset.label,
      fontFamily: 'Staatliches', fontWeight: 'normal',
      fontSize: Math.round(canvasHeight * (isCorner ? 0.046 : 0.12)),
      lineHeight: 0.95, letterSpacing: 0,
      color: '#ffffff', textPadding: 0,
      backgroundColor: undefined, stroke: undefined,
      textSpans: undefined, textStylePresetId: undefined,
      transform: {
        ...baseItem.transform,
        x: isCorner ? Math.round(canvasWidth * 0.32) : 0,
        y: isCorner ? Math.round(-canvasHeight * 0.4) : 0,
        width: Math.round(canvasWidth * (isCorner ? 0.29 : 0.66)),
        height: Math.round(canvasHeight * (isCorner ? 0.08 : 0.18)),
      },
    }
    addItemsOnNewTracks([item], newTrack.tracks)
    selection.setActiveTrack(newTrack.trackId)
    selection.selectItems([item.id])
  }, [])

  const handleImportPhotoCover = useCallback(async () => {
    if (importingPhotoCover) return

    setImportingPhotoCover(true)
    try {
      const mediaStore = useMediaLibraryStore.getState()
      const imported = await mediaStore.importMedia({ storageMode: 'copy' })
      const coverMedia = imported.find((media) => media.mimeType.startsWith('image/'))

      if (!coverMedia) {
        if (imported.length > 0) {
          toast.warning('Choose an image file for the cover')
        }
        return
      }

      const blobUrl = await resolveMediaUrl(coverMedia.id)
      if (!blobUrl) {
        toast.error('Could not load the imported cover')
        return
      }

      const timeline = useTimelineStore.getState()
      const currentProject = useProjectStore.getState().currentProject
      const existingCoverTrack = timeline.tracks.find(
        (track) => track.kind === 'video' && track.name === 'Cover',
      )
      const maxOrder = timeline.tracks.reduce(
        (max, track) => Math.max(max, track.order ?? 0),
        0,
      )
      const coverTrack =
        existingCoverTrack ??
        {
          ...createClassicTrack({
            tracks: timeline.tracks,
            kind: 'video',
            order: maxOrder + 1,
          }),
          name: 'Cover',
        }
      const nextTracks = existingCoverTrack
        ? timeline.tracks
        : [...timeline.tracks, coverTrack]
      const publishDuration = resolvePhotoPublishingDurationInFrames(timeline.fps, {
        beatvideoMode: 'photo',
        beatvideoMusic: currentProject?.beatvideoMusic,
        projectMedia: useMediaLibraryStore.getState().mediaItems,
        timelineItems: timeline.items,
      })
      const durationInFrames =
        publishDuration > 0
          ? publishDuration
          : getDefaultGeneratedLayerDurationInFrames(timeline.fps)
      const coverItems = buildDroppedMediaTimelineItems({
        media: coverMedia,
        mediaId: coverMedia.id,
        mediaType: 'image',
        label: `Cover: ${coverMedia.fileName}`,
        timelineFps: timeline.fps,
        blobUrl,
        canvasWidth: currentProject?.metadata.width ?? DEFAULT_PROJECT_WIDTH,
        canvasHeight: currentProject?.metadata.height ?? DEFAULT_PROJECT_HEIGHT,
        initialFit: 'cover',
        placement: {
          primary: {
            trackId: coverTrack.id,
            from: 0,
            durationInFrames,
          },
        },
      })
      const coverItem = coverItems.find((item) => item.type === 'image')
      if (!coverItem) {
        toast.error('Could not place the imported cover')
        return
      }

      if (existingCoverTrack) {
        replaceItemsOnTrack(existingCoverTrack.id, coverItems)
      } else {
        addItemsOnNewTracks(coverItems, nextTracks)
      }

      const selection = useSelectionStore.getState()
      selection.setActiveTrack(coverTrack.id)
      selection.selectItems([coverItem.id])
      toast.success(publishDuration > 0 ? 'Cover placed for the full beat' : 'Cover placed')
    } catch (error) {
      toast.error('Could not import the cover', {
        description: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setImportingPhotoCover(false)
    }
  }, [importingPhotoCover])

  const handleFitPhotoCoverToBeat = useCallback(() => {
    const timeline = useTimelineStore.getState()
    const selection = useSelectionStore.getState()
    const currentProject = useProjectStore.getState().currentProject
    const selectedCover = selection.selectedItemIds
      .map((id) => timeline.items.find((item) => item.id === id))
      .find((item) => item?.type === 'image')
    const cover = selectedCover ?? timeline.items.find((item) => item.type === 'image')

    if (!cover || cover.type !== 'image') {
      toast.warning('Add a cover image first')
      return
    }

    const canvasWidth = currentProject?.metadata.width ?? DEFAULT_PROJECT_WIDTH
    const canvasHeight = currentProject?.metadata.height ?? DEFAULT_PROJECT_HEIGHT
    const sourceWidth = cover.sourceWidth ?? canvasWidth
    const sourceHeight = cover.sourceHeight ?? canvasHeight
    const fitted = computeInitialTransform(
      sourceWidth,
      sourceHeight,
      canvasWidth,
      canvasHeight,
      'cover',
    )
    const publishDuration = resolvePhotoPublishingDurationInFrames(timeline.fps, {
      beatvideoMode: 'photo',
      beatvideoMusic: currentProject?.beatvideoMusic,
      projectMedia: useMediaLibraryStore.getState().mediaItems,
      timelineItems: timeline.items,
    })

    timeline.updateItem(cover.id, {
      transform: {
        ...cover.transform,
        ...fitted,
      },
      from: 0,
      ...(publishDuration > 0 ? { durationInFrames: publishDuration } : {}),
    })
    selection.setActiveTrack(cover.trackId)
    selection.selectItems([cover.id])

    toast.success(publishDuration > 0 ? 'Cover fitted to beat' : 'Cover fitted to frame')
  }, [])

  // Add shape item on its own new layer at the playhead, matching the canvas drop.
  const handleAddShape = useCallback((shapeType: ShapeType, shapePreset?: 'solid' | 'gradient') => {
    // Read all needed state from stores directly to avoid subscriptions
    const { tracks, fps, addItemOnNewTrack } = useTimelineStore.getState()
    const { activeTrackId, selectItems, setActiveTrack } = useSelectionStore.getState()
    const currentProject = useProjectStore.getState().currentProject
    const activeCompositionId =
      useCompositionNavigationStore.getState().activeCompositionId
    const activeComposition = activeCompositionId
      ? useCompositionsStore.getState().getComposition(activeCompositionId)
      : undefined

    const newTrack = createOverlayLayerTrack({ tracks, activeTrackId })

    if (!newTrack) {
      logger.warn('No available track for shape item')
      return
    }

    const { width: canvasWidth, height: canvasHeight } = resolveGeneratedLayerCanvasSize(
      activeComposition,
      currentProject?.metadata,
    )

    const placement = {
      trackId: newTrack.trackId,
      from: Math.max(0, usePlaybackStore.getState().currentFrame),
      durationInFrames: getDefaultGeneratedLayerDurationInFrames(fps),
      canvasWidth,
      canvasHeight,
      shapeType,
    }
    const shapeItem: ShapeItem =
      shapePreset === 'solid'
        ? createDefaultSolidColorItem(placement)
        : shapePreset === 'gradient'
          ? createDefaultGradientItem(placement)
          : createDefaultShapeItem(placement)

    addItemOnNewTrack(shapeItem, newTrack.tracks)
    setActiveTrack(newTrack.trackId)
    selectItems([shapeItem.id])
  }, [])

  const handleAddReactiveGraphic = useCallback(
    (presetId: BeatvideoReactiveGraphicPresetId) => {
      const timeline = useTimelineStore.getState()
      const selection = useSelectionStore.getState()
      const currentProject = useProjectStore.getState().currentProject
      const activeCompositionId =
        useCompositionNavigationStore.getState().activeCompositionId

      if (activeCompositionId) {
        toast.warning('Return to Main to add beat-driven graphics')
        return
      }

      const analysis = currentProject?.beatvideoMusic
      if (!analysis) {
        toast.error('Analyze and place the beat first')
        return
      }

      const timelineGrid = resolveBeatvideoTimelineGrid(
        analysis,
        timeline.items,
        timeline.fps,
      )
      if (!timelineGrid) {
        toast.error('Place the analyzed beat on the timeline first')
        return
      }

      const preset = BEATVIDEO_REACTIVE_GRAPHIC_PRESETS.find(
        (candidate) => candidate.id === presetId,
      )
      if (!preset) return

      let workingTracks = timeline.tracks
      let anchorTrackId = selection.activeTrackId
      const trackIds: string[] = []

      for (const trackName of preset.trackNames) {
        const created = createOverlayLayerTrack({
          tracks: workingTracks,
          activeTrackId: anchorTrackId,
        })
        if (!created) {
          toast.error('Could not create the reactive graphic layers')
          return
        }

        workingTracks = created.tracks.map((track) =>
          track.id === created.trackId ? { ...track, name: trackName } : track,
        )
        trackIds.push(created.trackId)
        anchorTrackId = created.trackId
      }

      const canvasWidth = currentProject?.metadata.width ?? DEFAULT_PROJECT_WIDTH
      const canvasHeight = currentProject?.metadata.height ?? DEFAULT_PROJECT_HEIGHT
      const items = buildBeatvideoReactiveGraphicItems({
        presetId,
        grid: timelineGrid.grid,
        fps: timeline.fps,
        from: timelineGrid.placement.from,
        durationInFrames: timelineGrid.placement.durationInFrames,
        canvasWidth,
        canvasHeight,
        trackIds,
      })
      if (items.length === 0) {
        toast.error('Could not build the reactive graphic')
        return
      }

      addItemsOnNewTracks(items, workingTracks)
      selection.setActiveTrack(items[0]!.trackId)
      selection.selectItems(items.map((item) => item.id))
      toast.success(`${preset.label} added`)
    },
    [],
  )

  const revealAppliedEffects = useCallback((itemIds?: string[]) => {
    if (itemIds && itemIds.length > 0) {
      useSelectionStore.getState().selectItems(itemIds)
    }
    const editor = useEditorStore.getState()
    editor.setRightSidebarOpen(true)
    editor.setClipInspectorTab('effects')
  }, [])

  // Add adjustment layer to timeline at the best available position.
  // Selection is created by addAdjustmentLayer; immediately expose its applied
  // effect stack so adding an effect never feels like a silent action.
  const handleAddAdjustmentLayer = useCallback(
    (effects?: VisualEffect[], label?: string) => {
      if (addAdjustmentLayer(effects, label)) {
        revealAppliedEffects()
      }
    },
    [revealAppliedEffects],
  )

  // Create adjustment layer with preset effects
  const handleAddPreset = useCallback(
    (presetId: string) => {
      const preset = EFFECT_PRESETS.find((p) => p.id === presetId)
      if (!preset) return

      if (beatvideoMode === 'photo') {
        const { selectedItemIds } = useSelectionStore.getState()
        const { items, addEffect } = useTimelineStore.getState()
        const selectedVisualIds = selectedItemIds.filter((id) => {
          const item = items.find((candidate) => candidate.id === id)
          return item && (item.type === 'image' || item.type === 'video')
        })
        const coverId = items.find((item) => item.type === 'image')?.id
        const visualIds =
          selectedVisualIds.length > 0
            ? selectedVisualIds
            : coverId
              ? [coverId]
              : []

        if (visualIds.length > 0) {
          preset.effects.forEach((effect) => {
            visualIds.forEach((id) => addEffect(id, effect))
          })
          revealAppliedEffects(visualIds)
          return
        }
      }

      handleAddAdjustmentLayer(preset.effects, preset.name)
    },
    [beatvideoMode, handleAddAdjustmentLayer, revealAppliedEffects],
  )

  // Add a single GPU effect ââ‚¬” to selected clips, or as adjustment layer if nothing selected
  const handleAddGpuEffect = useCallback(
    (gpuEffectId: string) => {
      const { selectedItemIds } = useSelectionStore.getState()
      const { items, addEffect } = useTimelineStore.getState()

      // Find selected visual items (not audio)
      const selectedVisualIds = selectedItemIds.filter((id) => {
        const item = items.find((i) => i.id === id)
        return (
          item &&
          (beatvideoMode === 'photo'
            ? item.type === 'image' || item.type === 'video'
            : item.type !== 'audio')
        )
      })
      const photoCoverId =
        beatvideoMode === 'photo'
          ? items.find((item) => item.type === 'image')?.id
          : undefined
      const visualIds =
        selectedVisualIds.length > 0
          ? selectedVisualIds
          : photoCoverId
            ? [photoCoverId]
            : []

      if (visualIds.length > 0) {
        const defaults = getGpuEffectDefaultParams(gpuEffectId)
        const effect: GpuEffect = {
          type: 'gpu-effect',
          gpuEffectType: gpuEffectId,
          params: defaults,
        }
        visualIds.forEach((id) => addEffect(id, effect))
        revealAppliedEffects(visualIds)
      } else {
        // No visual selection ââ‚¬” create adjustment layer with this effect
        const defaults = getGpuEffectDefaultParams(gpuEffectId)
        handleAddAdjustmentLayer([
          { type: 'gpu-effect', gpuEffectType: gpuEffectId, params: defaults },
        ])
      }
    },
    [beatvideoMode, handleAddAdjustmentLayer, revealAppliedEffects],
  )

  const { gpuCategories, triggerPreviews } = useGpuEffectPreviewData()
  const photoQuickEffects = useMemo(() => {
    const allEffects = gpuCategories.flatMap(({ effects }) => effects)
    return PHOTO_QUICK_EFFECT_IDS.flatMap((id) => {
      const effect = allEffects.find((candidate) => candidate.id === id)
      return effect ? [effect] : []
    })
  }, [gpuCategories])
  // Which effect/preset tile is hovered — drives its live sweep animation.
  const [hoveredEffectKey, setHoveredEffectKey] = useState<string | null>(null)


  // Category items for the vertical nav
  const categories = [
    { id: 'media' as const, icon: Film, label: t('editor.mediaSidebar.media') },
    { id: 'beat' as const, icon: AudioLines, label: 'Beat' },
    { id: 'master' as const, icon: Gauge, label: 'Master' },
    { id: 'text' as const, icon: Type, label: 'Overlays' },
    { id: 'effects' as const, icon: Layers, label: t('editor.mediaSidebar.effects') },
    { id: 'transitions' as const, icon: Blend, label: t('editor.mediaSidebar.transitions') },
    { id: 'lottie' as const, icon: Sticker, label: t('lottieBrowser.tabLabel') },
    { id: 'transcript' as const, icon: Captions, label: t('transcript.tabLabel') },
    { id: 'ai' as const, icon: WandSparkles, label: t('editor.mediaSidebar.ai') },
  ].filter(
    ({ id }) =>
      isSidebarTabVisibleForBeatvideoMode(id, beatvideoMode) &&
      isSidebarTabVisibleForWorkspace(id, workspace),
  )

  const producerShell =
    workspace === 'beat' ||
    workspace === 'edit' ||
    workspace === 'color' ||
    workspace === 'master'

  useEffect(() => {
    // Existing saved selections of the old Graphics tab now open the unified
    // Overlays surface instead of an invisible, unreachable tab.
    if (activeTab === 'shapes') {
      setActiveTab('text')
      return
    }
    if (
      !isSidebarTabVisibleForBeatvideoMode(activeTab, beatvideoMode) ||
      !isSidebarTabVisibleForWorkspace(activeTab, workspace)
    ) {
      setActiveTab(getWorkspaceSidebarFallback(workspace))
    }
  }, [activeTab, beatvideoMode, setActiveTab, workspace])

  const shouldSuppressGeneratedItemClick = useCallback(() => {
    if (!suppressGeneratedItemClickRef.current) {
      return false
    }

    suppressGeneratedItemClickRef.current = false
    return true
  }, [])

  const handleTemplateDragStart = useCallback(
    (payload: {
      itemType: 'text' | 'shape' | 'adjustment'
      label: string
      textStylePresetId?: (typeof TEXT_STYLE_PRESETS)[number]['id']
      shapeType?: ShapeType
      shapePreset?: 'solid' | 'gradient'
      effects?: VisualEffect[]
    }) =>
      (event: React.DragEvent<HTMLButtonElement>) => {
        event.dataTransfer.effectAllowed = 'copy'
        const dragData = {
          type: 'timeline-template' as const,
          ...payload,
        }

        suppressGeneratedItemClickRef.current = true
        event.dataTransfer.setData('application/json', JSON.stringify(dragData))
        setMediaDragData(dragData)
      },
    [],
  )

  const handleTemplateDragEnd = useCallback(() => {
    clearMediaDragData()
    window.setTimeout(() => {
      suppressGeneratedItemClickRef.current = false
    }, 0)
  }, [])

  return (
    <div
      className={cn(
        'flex h-full min-w-0',
        mobile || studioTaskColumn ? 'w-full flex-1' : 'flex-shrink-0',
      )}
    >
      {/* The generic FreeCut icon rail remains available outside the focused
          Beatvideo producer flow. Producer workspaces use labeled tabs instead. */}
      {!mobile && !producerShell ? (
      <div
        className="panel-header border-r border-border flex flex-col items-center flex-shrink-0"
        style={{ width: EDITOR_LAYOUT_CSS_VALUES.sidebarRailWidth }}
      >
        {/* Header row - aligned with content panel header */}
        <div
          className="flex items-center justify-center border-b border-border w-full"
          style={{ height: EDITOR_LAYOUT_CSS_VALUES.sidebarHeaderHeight }}
        >
          <button
            onClick={toggleLeftSidebar}
            className="rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
            style={{
              width: EDITOR_LAYOUT_CSS_VALUES.sidebarHeaderButtonSize,
              height: EDITOR_LAYOUT_CSS_VALUES.sidebarHeaderButtonSize,
            }}
            data-tooltip={
              leftSidebarOpen
                ? t('editor.mediaSidebar.collapsePanel')
                : t('editor.mediaSidebar.expandPanel')
            }
            data-tooltip-side="right"
          >
            {leftSidebarOpen ? (
              <ChevronLeft className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
          </button>
        </div>

        {/* Category Icons — single-purpose Beat/Master workspaces do not repeat themselves here. */}
        {categories.length > 1 ? (
          <div className="flex flex-col gap-1 py-1.5">
          {categories.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => {
                if (activeTab === id && leftSidebarOpen) {
                  toggleLeftSidebar()
                } else {
                  setActiveTab(id)
                  if (!leftSidebarOpen) toggleLeftSidebar()
                  if (id === 'effects') triggerPreviews()
                }
              }}
              className={`
                w-9 h-9 rounded-lg flex items-center justify-center transition-[transform,background-color,color] duration-150 active:scale-95
                ${
                  activeTab === id && leftSidebarOpen
                    ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                }
              `}
              data-tooltip={label}
              data-tooltip-side="right"
            >
              <Icon className="w-4 h-4" />
            </button>
          ))}
          </div>
        ) : null}
      </div>
      ) : null}

      {/* Content Panel — width animated via motion for the open/close toggle.
          We intentionally animate `width` (a layout property, not the cheaper
          transform/opacity) because collapsing must reclaim layout space for the
          preview — transform can't do that. The heavy content is GPU-composited
          (translateZ below) so the clip reveal is compositor-only and does not
          repaint the subtree each frame — that's what previously churned. Close is
          a touch faster than open (exit < entrance). During a resize-drag we snap
          (duration 0) so width tracks the pointer instead of easing behind it. */}
      <motion.div
        className={cn(
          'panel-bg overflow-hidden relative',
          mobile || studioTaskColumn
            ? 'w-full flex-1 border-r-0'
            : 'border-r border-border',
        )}
        initial={false}
        animate={{
          width:
            mobile || studioTaskColumn
              ? '100%'
              : producerShell || leftSidebarOpen
                ? effectiveSidebarWidth
                : 0,
        }}
        transition={
          mobile || studioTaskColumn || isResizingRef.current || prefersReducedMotion
            ? { duration: 0 }
            : { type: 'tween', duration: leftSidebarOpen ? 0.26 : 0.2, ease: [0.32, 0.72, 0, 1] }
        }
        onAnimationComplete={() => {
          if (!mobile && !studioTaskColumn && !producerShell && !leftSidebarOpen) {
            setContentInert(true)
          }
        }}
      >
        {/* Promote the content to its own GPU layer so the panel's width/clip
            animation reveals it without repainting the subtree each frame. The
            sidebar has no fixed-position descendants, so the containing block this
            establishes is harmless. */}
        <div
          className="h-full min-h-0 flex flex-col"
          style={{
            width: mobile || studioTaskColumn ? '100%' : effectiveSidebarWidth,
            transform: 'translateZ(0)',
          }}
          inert={mobile || studioTaskColumn || producerShell ? false : contentInert}
        >
          <>
            {/* Panel Header — sits with the tab content */}
            <div
              className={cn(
                'flex items-center justify-between border-b border-border flex-shrink-0',
                studioTaskColumn && workspace === 'edit' ? 'h-[62px] px-5' : 'px-3',
              )}
              style={
                studioTaskColumn && workspace === 'edit'
                  ? undefined
                  : { height: EDITOR_LAYOUT_CSS_VALUES.sidebarHeaderHeight }
              }
            >
              {studioTaskColumn && workspace === 'edit' ? (
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground">
                    Visual
                  </div>
                  <p className="mt-1.5 truncate text-[10px] text-muted-foreground">
                    Build the picture, then refine selected clips in Inspector.
                  </p>
                </div>
              ) : (
                <span className="text-sm font-medium text-foreground">
                  {categories.find((c) => c.id === activeTab)?.label}
                </span>
              )}
              <div className="flex items-center gap-1">
                {workspace === 'edit' ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 px-2 text-xs"
                        aria-label="Add layer"
                        data-tooltip="Add layer"
                        data-tooltip-side="bottom"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add layer
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-40">
                      <DropdownMenuItem
                        onSelect={() => handleAddText()}
                      >
                        <Type className="mr-2 h-3.5 w-3.5" />
                        Text layer
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => handleAddShape('rectangle')}>
                        <Square className="mr-2 h-3.5 w-3.5" />
                        Shape layer
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => handleAddAdjustmentLayer()}>
                        <Layers className="mr-2 h-3.5 w-3.5" />
                        Adjustment layer
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
                {!mobile && !studioTaskColumn ? (
                <Button
                variant="ghost"
                size="icon"
                className="shrink-0"
                style={{
                  width: EDITOR_LAYOUT_CSS_VALUES.sidebarHeaderButtonSize,
                  height: EDITOR_LAYOUT_CSS_VALUES.sidebarHeaderButtonSize,
                }}
                onClick={toggleMediaFullColumn}
                aria-label={
                  mediaFullColumn
                    ? t('editor.propertiesSidebar.dockToPreview')
                    : t('editor.propertiesSidebar.expandFullColumn')
                }
                data-tooltip={
                  mediaFullColumn
                    ? t('editor.propertiesSidebar.dockToPreview')
                    : t('editor.propertiesSidebar.expandFullColumn')
                }
                data-tooltip-side="bottom"
              >
                {mediaFullColumn ? (
                  <ChevronUp className="w-3 h-3" />
                ) : (
                  <ChevronDown className="w-3 h-3" />
                )}
              </Button>
              ) : null}
              </div>
            </div>

            {producerShell && categories.length > 1 ? (
              <div className="shrink-0 border-b border-border px-5 py-3">
                <div
                  className="studio-segmented flex h-8 w-full min-w-max"
                  role="tablist"
                  aria-label="Visual tools"
                >
                  {categories.map(({ id, label }) => (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      aria-selected={activeTab === id}
                      aria-pressed={activeTab === id}
                      onClick={() => {
                        setActiveTab(id)
                        if (id === 'effects') triggerPreviews()
                      }}
                      className="studio-segment h-7 min-w-[78px] flex-1 px-2 text-[9px] font-medium"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Media Tab - Full Media Library */}
            <div
              className={`min-h-0 flex-1 overflow-hidden ${activeTab === 'media' ? 'block' : 'hidden'}`}
            >
              <div className="flex h-full min-h-0 flex-col">
                <BeatvideoVisualSourcePanel
                  beatvideoMode={beatvideoMode}
                  importingPhotoCover={importingPhotoCover}
                  onImportPhotoCover={handleImportPhotoCover}
                  onFitPhotoCoverToBeat={handleFitPhotoCoverToBeat}
                />
                <div className="min-h-0 flex-1 overflow-hidden">
                  <MediaLibrary />
                </div>
              </div>
            </div>

            {/* Beatvideo musical analysis and grid correction. */}
            <div
              className={`min-h-0 flex-1 overflow-hidden ${activeTab === 'beat' ? 'block' : 'hidden'}`}
            >
              {beatTabActivated ? (
                <Suspense fallback={null}>
                  <LazyBeatvideoMusicPanel />
                </Suspense>
              ) : null}
            </div>

            {/* Project-scoped mastering rack. */}
            <div
              className={`min-h-0 flex-1 overflow-hidden ${activeTab === 'master' ? 'block' : 'hidden'}`}
            >
              {activeTab === 'master' ? (
                <Suspense fallback={null}>
                  <LazyBeatvideoMasterPanel />
                </Suspense>
              ) : null}
            </div>

            {/* Text Tab */}
            <div
              className={`min-h-0 flex-1 overflow-y-auto p-3 ${activeTab === 'text' ? 'block' : 'hidden'}`}
            >
              <div className="space-y-4">
                <section>
                  <div className="mb-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Producer tags
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {PRODUCER_TEXT_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => handleAddProducerText(preset.id)}
                        className="rounded-[3px] bg-[#d9dbd6] p-2 text-left transition-colors hover:bg-[#d1d4ce]"
                      >
                        {renderProducerTextPreview(preset)}
                        <span className="mt-1.5 block truncate text-[9px] font-semibold text-foreground">
                          {preset.label}
                        </span>
                        <span className="mt-0.5 block truncate text-[8px] text-muted-foreground">
                          {preset.description}
                        </span>
                      </button>
                    ))}
                  </div>
                </section>

                <section className="border-t border-border pt-4">
                  <div className="mb-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Titles
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      draggable={true}
                      onDragStart={handleTemplateDragStart({
                        itemType: 'text',
                        label: DEFAULT_TEXT_TEMPLATE_LABEL,
                      })}
                      onDragEnd={handleTemplateDragEnd}
                      onClick={() => {
                        if (shouldSuppressGeneratedItemClick()) return
                        handleAddText()
                      }}
                      className="rounded-[3px] bg-[#d9dbd6] p-2 text-left transition-colors hover:bg-[#d1d4ce]"
                    >
                      {renderTextTemplatePreview()}
                      <span className="mt-1.5 block text-[9px] font-semibold text-foreground">
                        Custom text
                      </span>
                    </button>
                    {TEXT_STYLE_PRESETS.filter((preset) =>
                      VISIBLE_TEXT_PRESET_IDS.has(preset.id),
                    ).map((preset) => (
                      <button
                        key={preset.id}
                        draggable={true}
                        onDragStart={handleTemplateDragStart({
                          itemType: 'text',
                          label: preset.label,
                          textStylePresetId: preset.id,
                        })}
                        onDragEnd={handleTemplateDragEnd}
                        onClick={() => {
                          if (shouldSuppressGeneratedItemClick()) return
                          handleAddText(preset.id)
                        }}
                        className="rounded-[3px] bg-[#d9dbd6] p-2 text-left transition-colors hover:bg-[#d1d4ce]"
                      >
                        {renderTextTemplatePreview(preset)}
                        <span className="mt-1.5 block truncate text-[9px] font-semibold text-foreground">
                          {preset.label}
                        </span>
                      </button>
                    ))}
                  </div>
                  <p className="mt-3 text-[8px] leading-3 text-muted-foreground">
                    Click to add. Drag to place. Edit content, type, motion and effects in Inspector.
                  </p>
                </section>
              </div>

              {/* Shapes remain real draggable editable visual layers, but
                  belong to Overlays alongside titles and producer tags. */}
              <details className="mt-4 border-t border-border pt-3">
                <summary className="flex cursor-pointer list-none items-center justify-between text-[10px] font-semibold text-foreground hover:text-primary">
                  Shapes and reactive graphics
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                </summary>
                <div className="pt-3">
              <section className="mb-3 border-b border-border pb-3">
                <div className="mb-2 text-[11px] font-medium text-foreground">
                  Reactive graphic
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {BEATVIDEO_REACTIVE_GRAPHIC_PRESETS.filter((preset) =>
                    REACTIVE_GRAPHIC_PRESET_IDS.has(preset.id),
                  ).map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleAddReactiveGraphic(preset.id)}
                      className="rounded-[3px] bg-[#d9dbd6] p-2 text-left transition-colors hover:bg-[#d1d4ce]"
                    >
                      {renderReactiveGraphicPreview(preset.id)}
                      <span className="mt-1.5 block truncate text-[9px] font-semibold text-foreground">
                        {preset.label}
                      </span>
                    </button>
                  ))}
                </div>
              </section>

              <div className="grid grid-cols-3 gap-1.5">
                <button
                  draggable={true}
                  onDragStart={handleTemplateDragStart({
                    itemType: 'shape',
                    label: t('editor.shapeSection.solidColor'),
                    shapeType: 'rectangle',
                    shapePreset: 'solid',
                  })}
                  onDragEnd={handleTemplateDragEnd}
                  onClick={() => {
                    if (shouldSuppressGeneratedItemClick()) return
                    handleAddShape('rectangle', 'solid')
                  }}
                  className="flex flex-col items-center justify-center gap-1 p-2 rounded-lg border border-border bg-secondary/30 hover:bg-secondary/50 hover:border-primary/50 transition-[transform,background-color,border-color,color] duration-150 active:scale-[0.98] group"
                >
                  <div className="w-7 h-7 rounded border border-border bg-[#2d2d2d] shadow-inner group-hover:border-primary/50" />
                  <span className="text-[9px] text-muted-foreground group-hover:text-foreground">
                    {t('editor.shapeSection.solidColor')}
                  </span>
                </button>

                <button
                  draggable={true}
                  onDragStart={handleTemplateDragStart({
                    itemType: 'shape',
                    label: t('editor.shapeSection.gradient'),
                    shapeType: 'rectangle',
                    shapePreset: 'gradient',
                  })}
                  onDragEnd={handleTemplateDragEnd}
                  onClick={() => {
                    if (shouldSuppressGeneratedItemClick()) return
                    handleAddShape('rectangle', 'gradient')
                  }}
                  className="flex flex-col items-center justify-center gap-1 p-2 rounded-lg border border-border bg-secondary/30 hover:bg-secondary/50 hover:border-primary/50 transition-[transform,background-color,border-color,color] duration-150 active:scale-[0.98] group"
                >
                  <div className="w-7 h-7 rounded border border-border bg-gradient-to-r from-blue-500 to-violet-500 shadow-inner group-hover:border-primary/50" />
                  <span className="text-[9px] text-muted-foreground group-hover:text-foreground">
                    {t('editor.shapeSection.gradient')}
                  </span>
                </button>

                <button
                  draggable={true}
                  onDragStart={handleTemplateDragStart({
                    itemType: 'shape',
                    label: t('editor.shapeSection.typeRectangle'),
                    shapeType: 'rectangle',
                  })}
                  onDragEnd={handleTemplateDragEnd}
                  onClick={() => {
                    if (shouldSuppressGeneratedItemClick()) return
                    handleAddShape('rectangle')
                  }}
                  className="flex flex-col items-center justify-center gap-1 p-2 rounded-lg border border-border bg-secondary/30 hover:bg-secondary/50 hover:border-primary/50 transition-[transform,background-color,border-color,color] duration-150 active:scale-[0.98] group"
                >
                  <div className="w-7 h-7 rounded border border-border bg-secondary/50 flex items-center justify-center group-hover:bg-secondary/70">
                    <Square className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground" />
                  </div>
                  <span className="text-[9px] text-muted-foreground group-hover:text-foreground">
                    {t('editor.shapeSection.typeRectangle')}
                  </span>
                </button>

                <button
                  draggable={true}
                  onDragStart={handleTemplateDragStart({
                    itemType: 'shape',
                    label: t('editor.shapeSection.typeCircle'),
                    shapeType: 'circle',
                  })}
                  onDragEnd={handleTemplateDragEnd}
                  onClick={() => {
                    if (shouldSuppressGeneratedItemClick()) return
                    handleAddShape('circle')
                  }}
                  className="flex flex-col items-center justify-center gap-1 p-2 rounded-lg border border-border bg-secondary/30 hover:bg-secondary/50 hover:border-primary/50 transition-[transform,background-color,border-color,color] duration-150 active:scale-[0.98] group"
                >
                  <div className="w-7 h-7 rounded border border-border bg-secondary/50 flex items-center justify-center group-hover:bg-secondary/70">
                    <Circle className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground" />
                  </div>
                  <span className="text-[9px] text-muted-foreground group-hover:text-foreground">
                    {t('editor.shapeSection.typeCircle')}
                  </span>
                </button>

                <button
                  draggable={true}
                  onDragStart={handleTemplateDragStart({
                    itemType: 'shape',
                    label: t('editor.shapeSection.typeTriangle'),
                    shapeType: 'triangle',
                  })}
                  onDragEnd={handleTemplateDragEnd}
                  onClick={() => {
                    if (shouldSuppressGeneratedItemClick()) return
                    handleAddShape('triangle')
                  }}
                  className="flex flex-col items-center justify-center gap-1 p-2 rounded-lg border border-border bg-secondary/30 hover:bg-secondary/50 hover:border-primary/50 transition-[transform,background-color,border-color,color] duration-150 active:scale-[0.98] group"
                >
                  <div className="w-7 h-7 rounded border border-border bg-secondary/50 flex items-center justify-center group-hover:bg-secondary/70">
                    <Triangle className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground" />
                  </div>
                  <span className="text-[9px] text-muted-foreground group-hover:text-foreground">
                    {t('editor.shapeSection.typeTriangle')}
                  </span>
                </button>

                <button
                  draggable={true}
                  onDragStart={handleTemplateDragStart({
                    itemType: 'shape',
                    label: t('editor.shapeSection.typeEllipse'),
                    shapeType: 'ellipse',
                  })}
                  onDragEnd={handleTemplateDragEnd}
                  onClick={() => {
                    if (shouldSuppressGeneratedItemClick()) return
                    handleAddShape('ellipse')
                  }}
                  className="flex flex-col items-center justify-center gap-1 p-2 rounded-lg border border-border bg-secondary/30 hover:bg-secondary/50 hover:border-primary/50 transition-[transform,background-color,border-color,color] duration-150 active:scale-[0.98] group"
                >
                  <div className="w-7 h-7 rounded border border-border bg-secondary/50 flex items-center justify-center group-hover:bg-secondary/70">
                    <Circle className="w-3.5 h-2.5 text-muted-foreground group-hover:text-foreground" />
                  </div>
                  <span className="text-[9px] text-muted-foreground group-hover:text-foreground">
                    {t('editor.shapeSection.typeEllipse')}
                  </span>
                </button>

                <button
                  draggable={true}
                  onDragStart={handleTemplateDragStart({
                    itemType: 'shape',
                    label: t('editor.shapeSection.typeStar'),
                    shapeType: 'star',
                  })}
                  onDragEnd={handleTemplateDragEnd}
                  onClick={() => {
                    if (shouldSuppressGeneratedItemClick()) return
                    handleAddShape('star')
                  }}
                  className="flex flex-col items-center justify-center gap-1 p-2 rounded-lg border border-border bg-secondary/30 hover:bg-secondary/50 hover:border-primary/50 transition-[transform,background-color,border-color,color] duration-150 active:scale-[0.98] group"
                >
                  <div className="w-7 h-7 rounded border border-border bg-secondary/50 flex items-center justify-center group-hover:bg-secondary/70">
                    <Star className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground" />
                  </div>
                  <span className="text-[9px] text-muted-foreground group-hover:text-foreground">
                    {t('editor.shapeSection.typeStar')}
                  </span>
                </button>

                <button
                  draggable={true}
                  onDragStart={handleTemplateDragStart({
                    itemType: 'shape',
                    label: t('editor.shapeSection.typePolygon'),
                    shapeType: 'polygon',
                  })}
                  onDragEnd={handleTemplateDragEnd}
                  onClick={() => {
                    if (shouldSuppressGeneratedItemClick()) return
                    handleAddShape('polygon')
                  }}
                  className="flex flex-col items-center justify-center gap-1 p-2 rounded-lg border border-border bg-secondary/30 hover:bg-secondary/50 hover:border-primary/50 transition-[transform,background-color,border-color,color] duration-150 active:scale-[0.98] group"
                >
                  <div className="w-7 h-7 rounded border border-border bg-secondary/50 flex items-center justify-center group-hover:bg-secondary/70">
                    <Hexagon className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground" />
                  </div>
                  <span className="text-[9px] text-muted-foreground group-hover:text-foreground">
                    {t('editor.shapeSection.typePolygon')}
                  </span>
                </button>

                <button
                  draggable={true}
                  onDragStart={handleTemplateDragStart({
                    itemType: 'shape',
                    label: t('editor.shapeSection.typeHeart'),
                    shapeType: 'heart',
                  })}
                  onDragEnd={handleTemplateDragEnd}
                  onClick={() => {
                    if (shouldSuppressGeneratedItemClick()) return
                    handleAddShape('heart')
                  }}
                  className="flex flex-col items-center justify-center gap-1 p-2 rounded-lg border border-border bg-secondary/30 hover:bg-secondary/50 hover:border-primary/50 transition-[transform,background-color,border-color,color] duration-150 active:scale-[0.98] group"
                >
                  <div className="w-7 h-7 rounded border border-border bg-secondary/50 flex items-center justify-center group-hover:bg-secondary/70">
                    <Heart className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground" />
                  </div>
                  <span className="text-[9px] text-muted-foreground group-hover:text-foreground">
                    {t('editor.shapeSection.typeHeart')}
                  </span>
                </button>

                <button
                  onClick={() => useMaskEditorStore.getState().startShapePenMode()}
                  className="flex flex-col items-center justify-center gap-1 p-2 rounded-lg border border-border bg-secondary/30 hover:bg-secondary/50 hover:border-primary/50 transition-[transform,background-color,border-color,color] duration-150 active:scale-[0.98] group"
                  title={t('editor.mediaSidebar.penToolHint')}
                >
                  <div className="w-7 h-7 rounded border border-border bg-secondary/50 flex items-center justify-center group-hover:bg-secondary/70">
                    <Pen className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground" />
                  </div>
                  <span className="text-[9px] text-muted-foreground group-hover:text-foreground">
                    {t('editor.mediaSidebar.pen')}
                  </span>
                </button>
              </div>
                </div>
              </details>
            </div>

            {/* Effects Tab */}
            <div
              className={`min-h-0 flex-1 overflow-y-auto p-3 ${activeTab === 'effects' ? 'block' : 'hidden'}`}
            >
              <div className="space-y-3">
                <section>
                  <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Beat reactive
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {BEATVIDEO_REACTIVE_GRAPHIC_PRESETS.filter((preset) =>
                      REACTIVE_EFFECT_PRESET_IDS.has(preset.id),
                    ).map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => handleAddReactiveGraphic(preset.id)}
                        className="rounded-[3px] border border-border bg-secondary/30 p-2 text-left transition-colors hover:border-primary/50 hover:bg-secondary/50"
                      >
                        {renderReactiveGraphicPreview(preset.id)}
                        <span className="mt-1.5 block truncate text-[9px] font-semibold text-foreground">
                          {preset.label}
                        </span>
                      </button>
                    ))}
                  </div>
                </section>

                {beatvideoMode === 'photo' ? (
                  <div className="space-y-2">
                    <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Essentials
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {photoQuickEffects.map((def) => (
                        <button
                          key={def.id}
                          type="button"
                          onMouseEnter={() => setHoveredEffectKey(def.id)}
                          onMouseLeave={() =>
                            setHoveredEffectKey((key) => (key === def.id ? null : key))
                          }
                          onClick={() => handleAddGpuEffect(def.id)}
                          className="flex flex-col items-center gap-1 rounded-md border border-border bg-secondary/30 p-1.5 transition-[transform,background-color,border-color,color] duration-150 hover:border-primary/50 hover:bg-secondary/50 active:scale-[0.98] group"
                        >
                          <div className="relative w-full">
                            <EffectThumbnail
                              effectId={def.id}
                              active={hoveredEffectKey === def.id}
                              className="w-full aspect-video rounded-sm"
                            />
                            {Object.values(def.params).some(isAudioReactiveParam) ? (
                              <span className="absolute right-1 top-1 inline-flex items-center gap-0.5 rounded-sm border border-primary/40 bg-background/85 px-1 py-0.5 text-[8px] font-semibold text-primary">
                                <AudioLines className="h-2.5 w-2.5" />
                                React
                              </span>
                            ) : null}
                          </div>
                          <span className="w-full truncate text-center text-[10px] leading-tight text-muted-foreground group-hover:text-foreground">
                            {def.name}
                          </span>
                        </button>
                      ))}
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="w-full justify-between px-2 text-xs"
                      onClick={() => setShowAllPhotoEffects((value) => !value)}
                    >
                      {showAllPhotoEffects ? 'Hide advanced effects' : 'All effects'}
                      {showAllPhotoEffects ? (
                        <ChevronUp className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                ) : null}

                {beatvideoMode !== 'photo' || showAllPhotoEffects ? (
                  <>
                {/* Blank Adjustment Layer */}
                <button
                  draggable={true}
                  onDragStart={handleTemplateDragStart({
                    itemType: 'adjustment',
                    label: t('editor.mediaSidebar.adjustmentLayer'),
                  })}
                  onDragEnd={handleTemplateDragEnd}
                  onClick={() => {
                    if (shouldSuppressGeneratedItemClick()) return
                    handleAddAdjustmentLayer()
                  }}
                  className="w-full flex items-center gap-3 p-2.5 rounded-lg border border-border bg-secondary/30 hover:bg-secondary/50 hover:border-primary/50 transition-[transform,background-color,border-color,color] duration-150 active:scale-[0.98] group"
                >
                  <div className="w-8 h-8 rounded-md border border-border bg-secondary/50 flex items-center justify-center group-hover:bg-secondary/70 flex-shrink-0">
                    <Layers className="w-4 h-4 text-muted-foreground group-hover:text-foreground" />
                  </div>
                  <div className="text-left">
                    <div className="text-xs text-muted-foreground group-hover:text-foreground">
                      {t('editor.mediaSidebar.blankAdjustmentLayer')}
                    </div>
                  </div>
                </button>

                {/* Presets */}
                <div>
                  <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                    {t('editor.mediaSidebar.presets')}
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {EFFECT_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        draggable={true}
                        onDragStart={handleTemplateDragStart({
                          itemType: 'adjustment',
                          label: preset.name,
                          effects: preset.effects,
                        })}
                        onDragEnd={handleTemplateDragEnd}
                        onMouseEnter={() => setHoveredEffectKey(`preset:${preset.id}`)}
                        onMouseLeave={() =>
                          setHoveredEffectKey((k) => (k === `preset:${preset.id}` ? null : k))
                        }
                        onClick={() => {
                          if (shouldSuppressGeneratedItemClick()) return
                          handleAddPreset(preset.id)
                        }}
                        className="flex flex-col items-center gap-1 p-1.5 rounded-md border border-border bg-secondary/30 hover:bg-secondary/50 hover:border-primary/50 transition-[transform,background-color,border-color,color] duration-150 active:scale-[0.98] group"
                      >
                        <EffectThumbnail
                          effects={preset.effects}
                          active={hoveredEffectKey === `preset:${preset.id}`}
                          className="w-full aspect-video rounded-sm"
                        />
                        <span className="text-[9px] text-muted-foreground group-hover:text-foreground text-center leading-tight">
                          {preset.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* GPU Effects by Category */}
                {gpuCategories.map(({ category, effects: catEffects }) => (
                  <div key={category}>
                    <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                      {category}
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {catEffects.map((def) => (
                        <button
                          key={def.id}
                          draggable={true}
                          onDragStart={handleTemplateDragStart({
                            itemType: 'adjustment',
                            label: def.name,
                            effects: [
                              {
                                type: 'gpu-effect',
                                gpuEffectType: def.id,
                                params: getGpuEffectDefaultParams(def.id),
                              },
                            ],
                          })}
                          onDragEnd={handleTemplateDragEnd}
                          onMouseEnter={() => setHoveredEffectKey(def.id)}
                          onMouseLeave={() => setHoveredEffectKey((k) => (k === def.id ? null : k))}
                          onClick={() => {
                            if (shouldSuppressGeneratedItemClick()) return
                            handleAddGpuEffect(def.id)
                          }}
                          className="flex flex-col items-center gap-1 p-1.5 rounded-md border border-border bg-secondary/30 hover:bg-secondary/50 hover:border-primary/50 transition-[transform,background-color,border-color,color] duration-150 active:scale-[0.98] group"
                        >
                          <div className="relative w-full">
                            <EffectThumbnail
                              effectId={def.id}
                              active={hoveredEffectKey === def.id}
                              className="w-full aspect-video rounded-sm"
                            />
                            {Object.values(def.params).some(isAudioReactiveParam) ? (
                              <span className="absolute right-1 top-1 inline-flex items-center gap-0.5 rounded-sm border border-primary/40 bg-background/85 px-1 py-0.5 text-[8px] font-semibold text-primary">
                                <AudioLines className="h-2.5 w-2.5" />
                                React
                              </span>
                            ) : null}
                          </div>
                          <span className="text-[9px] text-muted-foreground group-hover:text-foreground text-center leading-tight truncate w-full">
                            {def.name}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                  </>
                ) : null}
              </div>
            </div>

            {/* Transitions Tab */}
            <div
              className={`min-h-0 flex-1 overflow-hidden ${activeTab === 'transitions' ? 'block' : 'hidden'}`}
            >
              {activeTab === 'transitions' && <TransitionsPanel />}
            </div>

            {/* Lottie Browser Tab */}
            <div
              className={`min-h-0 flex-1 overflow-hidden ${activeTab === 'lottie' ? 'block' : 'hidden'}`}
            >
              {lottieTabActivated && <LottieBrowserPanel />}
            </div>

            {/* Transcript Tab */}
            <div
              className={`min-h-0 flex-1 overflow-hidden ${activeTab === 'transcript' ? 'block' : 'hidden'}`}
            >
              {activeTab === 'transcript' && (
                <Suspense fallback={null}>
                  <LazyTranscriptEditorPanel active />
                </Suspense>
              )}
            </div>

            {/* AI Tab */}
            <div
              className={`min-h-0 flex-1 overflow-hidden ${activeTab === 'ai' ? 'block' : 'hidden'}`}
            >
              {aiTabActivated && (
                <Suspense fallback={null}>
                  <LazyAiPanel />
                </Suspense>
              )}
            </div>
          </>
        </div>
        {/* Resize Handle */}
        {leftSidebarOpen && !studioTaskColumn && (
          <div
            data-resize-handle
            onMouseDown={handleResizeStart}
            className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/50 active:bg-primary/50 transition-colors z-10"
          />
        )}
      </motion.div>
    </div>
  )
})