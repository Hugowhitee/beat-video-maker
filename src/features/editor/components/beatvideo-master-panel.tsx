import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  Activity,
  BookmarkPlus,
  Flame,
  Plus,
  Power,
  RotateCcw,
  Shield,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  captureSnapshot,
  useTimelineCommandStore,
  useTimelineStore,
} from '@/features/editor/deps/timeline-store'
import { usePlaybackStore } from '@/shared/state/playback'
import { useEditorStore } from '@/shared/state/editor'
import {
  AUTO_LEVEL_LIMITER_CEILING_DB,
  MASTERING_PRESETS,
  analyzeProgramLevel,
  createSaturationCurve,
  resolveAutoLevelPlan,
  resolveMasterFxSettings,
} from '@/shared/utils/mastering'
import { getSparseAudioEqSettings } from '@/shared/utils/audio-eq'
import type {
  AudioEqSettings,
  MasterFxSettings,
  MasteringPresetId,
  MasterProcessorId,
} from '@/types/audio'
import { AudioEqPanelContent } from './properties-sidebar/clip-panel/audio-eq-panel-content'
import type { AudioEqPatch } from './properties-sidebar/clip-panel/audio-eq-curve-editor'
import { getOrDecodeAudio, getPreviewMasterReduction } from '@/features/editor/deps/composition-runtime'
import { resolveMediaUrl } from '@/features/editor/deps/media-library'
import { useProjectStore } from '@/features/editor/deps/projects'
import { cn } from '@/shared/ui/cn'
import { RotaryKnob } from '@/shared/ui/property-controls/rotary-knob'
import { AudioMeterPanel } from './audio-meter-panel'

type MasterSlot = MasterProcessorId

const MAX_MASTER_SLOTS = 5

const SLOT_META: ReadonlyArray<{
  id: MasterSlot
  label: string
  hint: string
  icon: typeof SlidersHorizontal
}> = [
  { id: 'eq', label: 'EQ', hint: 'Tone shaping', icon: SlidersHorizontal },
  { id: 'compressor', label: 'Compressor', hint: 'Glue', icon: Activity },
  { id: 'saturator', label: 'Saturator', hint: 'Warmth', icon: Flame },
  { id: 'limiter', label: 'Limiter', hint: 'Peak control', icon: Shield },
]

const SLOT_META_BY_ID = new Map(SLOT_META.map((meta) => [meta.id, meta]))

const SAVED_MASTER_PRESETS_KEY = 'beatvideo:master-presets:v1'

interface SavedMasterPreset {
  id: string
  name: string
  masterFx: MasterFxSettings
  busAudioEq?: AudioEqSettings
}

function loadSavedMasterPresets(): SavedMasterPreset[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(SAVED_MASTER_PRESETS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((candidate) => {
      if (
        !candidate ||
        typeof candidate !== 'object' ||
        typeof candidate.id !== 'string' ||
        typeof candidate.name !== 'string' ||
        !candidate.masterFx ||
        typeof candidate.masterFx !== 'object'
      ) {
        return []
      }
      return [{
        id: candidate.id,
        name: candidate.name,
        masterFx: candidate.masterFx as MasterFxSettings,
        busAudioEq:
          candidate.busAudioEq && typeof candidate.busAudioEq === 'object'
            ? candidate.busAudioEq as AudioEqSettings
            : undefined,
      }]
    })
  } catch {
    return []
  }
}

function persistSavedMasterPresets(presets: SavedMasterPreset[]): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(SAVED_MASTER_PRESETS_KEY, JSON.stringify(presets))
  } catch {
    /* A full/private storage surface should not break the master rack. */
  }
}

function MasterRange({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
  onGestureStart,
  onGestureEnd,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit?: string
  onChange: (value: number) => void
  onGestureStart: () => void
  onGestureEnd: () => void
}) {
  const decimals = step < 0.1 ? 2 : step < 1 ? 1 : 0
  const scaleMidpoint = min <= 0 && max >= 0 ? 0 : (min + max) / 2
  const formatScale = (next: number) =>
    `${next.toFixed(decimals)}${unit ?? ''}`

  return (
    <label className="grid grid-cols-[82px_1fr_62px] items-start gap-2 text-[11px]">
      <span className="pt-0.5 text-muted-foreground">{label}</span>
      <span className="min-w-0">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onPointerDown={onGestureStart}
          onPointerUp={onGestureEnd}
          onPointerCancel={onGestureEnd}
          onChange={(event) => onChange(Number(event.target.value))}
          className="block h-4 w-full min-w-0 accent-primary"
        />
        <span className="mt-0.5 grid grid-cols-3 font-mono text-[8px] leading-none text-muted-foreground/60">
          <span>{formatScale(min)}</span>
          <span className="text-center">{formatScale(scaleMidpoint)}</span>
          <span className="text-right">{formatScale(max)}</span>
        </span>
      </span>
      <span className="pt-0.5 text-right font-mono text-xs tabular-nums text-foreground">
        {value.toFixed(step < 0.1 ? 2 : 1)}
        {unit ?? ''}
      </span>
    </label>
  )
}

function MasterKnob({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
  onGestureStart,
  onGestureEnd,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  display: string
  onChange: (value: number) => void
  onGestureStart: () => void
  onGestureEnd: () => void
}) {
  return (
    <div className="flex w-[74px] shrink-0 flex-col items-start pl-[10px]">
      <RotaryKnob
        value={value}
        min={min}
        max={max}
        step={step}
        size={32}
        onLiveChange={onChange}
        onChange={onChange}
        onGestureStart={onGestureStart}
        onGestureEnd={onGestureEnd}
      />
      <div className="mt-[7px] text-[10px] font-medium uppercase leading-3 text-muted-foreground">
        {label}
      </div>
      <div className="mt-px font-mono text-[10px] leading-3 tabular-nums text-foreground">
        {display}
      </div>
    </div>
  )
}

function TransferGraph({
  thresholdDb,
  ratio,
  ceilingDb,
  reductionDb,
  mode,
}: {
  thresholdDb: number
  ratio: number
  ceilingDb?: number
  reductionDb: number
  mode: 'compressor' | 'limiter'
}) {
  const points = useMemo(() => {
    const values: string[] = []
    for (let i = 0; i <= 60; i++) {
      const inputDb = -60 + i
      let outputDb =
        inputDb <= thresholdDb ? inputDb : thresholdDb + (inputDb - thresholdDb) / ratio
      if (ceilingDb !== undefined) outputDb = Math.min(outputDb, ceilingDb)
      const x = (i / 60) * 100
      const y = (1 - (outputDb + 60) / 60) * 100
      values.push(`${x.toFixed(2)},${y.toFixed(2)}`)
    }
    return values.join(' ')
  }, [ceilingDb, ratio, thresholdDb])

  const thresholdX = ((thresholdDb + 60) / 60) * 100
  const ceilingY = ceilingDb === undefined ? null : (1 - (ceilingDb + 60) / 60) * 100

  return (
    <div className="relative h-36 overflow-hidden rounded border border-[#555a55] bg-[#343834]">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        {[25, 50, 75].map((n) => (
          <g key={n}>
            <line x1={n} x2={n} y1="0" y2="100" stroke="currentColor" className="text-border" strokeWidth="0.45" />
            <line x1="0" x2="100" y1={n} y2={n} stroke="currentColor" className="text-border" strokeWidth="0.45" />
          </g>
        ))}
        <line x1="0" y1="100" x2="100" y2="0" stroke="currentColor" className="text-muted-foreground/35" strokeWidth="0.65" />
        <line x1={thresholdX} x2={thresholdX} y1="0" y2="100" stroke="currentColor" className="text-muted-foreground" strokeDasharray="2 2" strokeWidth="0.65" />
        {ceilingY !== null ? (
          <line x1="0" x2="100" y1={ceilingY} y2={ceilingY} stroke="currentColor" className="text-muted-foreground" strokeDasharray="2 2" strokeWidth="0.65" />
        ) : null}
        <polyline points={points} fill="none" stroke="currentColor" className="text-primary" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="absolute left-2 top-2 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
        {mode === 'compressor' ? 'Transfer' : 'Peak control'}
      </div>
      <div className="absolute bottom-2 right-2 rounded bg-background/80 px-1.5 py-0.5 font-mono text-xs text-foreground">
        GR {Math.abs(reductionDb).toFixed(1)} dB
      </div>
    </div>
  )
}

function SaturationGraph({ driveDb, mix }: { driveDb: number; mix: number }) {
  const points = useMemo(() => {
    const curve = createSaturationCurve(driveDb, 128)
    return Array.from(curve, (sample, index) => {
      const x = (index / Math.max(1, curve.length - 1)) * 100
      const wetY = (1 - (sample + 1) / 2) * 100
      const drySample = (index / Math.max(1, curve.length - 1)) * 2 - 1
      const y = wetY * mix + (1 - (drySample + 1) / 2) * 100 * (1 - mix)
      return `${x.toFixed(2)},${y.toFixed(2)}`
    }).join(' ')
  }, [driveDb, mix])

  return (
    <div className="relative h-36 overflow-hidden rounded border border-[#555a55] bg-[#343834]">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        <line x1="0" y1="100" x2="100" y2="0" stroke="currentColor" className="text-muted-foreground/35" strokeWidth="0.65" />
        <line x1="50" y1="0" x2="50" y2="100" stroke="currentColor" className="text-border" strokeWidth="0.45" />
        <line x1="0" y1="50" x2="100" y2="50" stroke="currentColor" className="text-border" strokeWidth="0.45" />
        <polyline points={points} fill="none" stroke="currentColor" className="text-primary" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="absolute left-2 top-2 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
        Transfer curve
      </div>
    </div>
  )
}

export function BeatvideoMasterPanel() {
  const masterFx = usePlaybackStore((state) => state.masterFx)
  const setMasterFx = usePlaybackStore((state) => state.setMasterFx)
  const busAudioEq = usePlaybackStore((state) => state.busAudioEq)
  const setBusAudioEq = usePlaybackStore((state) => state.setBusAudioEq)
  const currentProject = useProjectStore((state) => state.currentProject)
  const mixerFloating = useEditorStore((state) => state.mixerFloating)
  const toggleMixerFloating = useEditorStore((state) => state.toggleMixerFloating)
  const resolved = useMemo(() => resolveMasterFxSettings(masterFx), [masterFx])
  const [selectedSlot, setSelectedSlot] = useState<MasterSlot | null>('compressor')
  const [draggingSlot, setDraggingSlot] = useState<MasterSlot | null>(null)
  const [dragOverSlot, setDragOverSlot] = useState<MasterSlot | null>(null)
  const [addEffectOpen, setAddEffectOpen] = useState(false)
  const [reduction, setReduction] = useState({ compressorDb: 0, limiterDb: 0 })
  const gestureSnapshotRef = useRef<ReturnType<typeof captureSnapshot> | null>(null)
  const [savedPresets, setSavedPresets] = useState<SavedMasterPreset[]>(loadSavedMasterPresets)
  const [savingPreset, setSavingPreset] = useState(false)
  const [presetName, setPresetName] = useState('')
  const [autoLeveling, setAutoLeveling] = useState(false)
  const [autoLevelResult, setAutoLevelResult] = useState<{
    rmsDb: number
    peakDb: number
    inputGainDb: number
    targetRmsDb: number
    projectedRmsDb: number
    projectedPeakDb: number
    estimatedLimiterReductionDb: number
    limitedByPeak: boolean
  } | null>(null)

  const activeBuiltInPresetId = useMemo(() => {
    if (busAudioEq !== undefined) return null
    const current = JSON.stringify(resolved)
    return (
      MASTERING_PRESETS.find(
        (preset) =>
          JSON.stringify(resolveMasterFxSettings(preset.settings)) === current,
      )?.id ?? null
    )
  }, [busAudioEq, resolved])

  const availableProcessors = useMemo(
    () => SLOT_META.filter((meta) => !resolved.order.includes(meta.id)),
    [resolved.order],
  )

  useEffect(() => {
    if (selectedSlot && resolved.order.includes(selectedSlot)) return
    setSelectedSlot(resolved.order[0] ?? null)
  }, [resolved.order, selectedSlot])

  useEffect(() => {
    let frame = 0
    let lastUpdate = 0
    const tick = (time: number) => {
      if (time - lastUpdate >= 80) {
        lastUpdate = time
        setReduction(getPreviewMasterReduction())
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  const markChanged = useCallback(() => {
    useTimelineStore.getState().markDirty()
  }, [])

  const commitMasterFx = useCallback(
    (next: MasterFxSettings | undefined, command = 'UPDATE_MASTER_FX') => {
      const before = captureSnapshot()
      setMasterFx(next)
      markChanged()
      useTimelineCommandStore.getState().addUndoEntry({ type: command, payload: {} }, before)
    },
    [markChanged, setMasterFx],
  )

  const beginGesture = useCallback(() => {
    gestureSnapshotRef.current ??= captureSnapshot()
  }, [])

  const endGesture = useCallback(() => {
    const before = gestureSnapshotRef.current
    gestureSnapshotRef.current = null
    if (!before) return
    useTimelineCommandStore
      .getState()
      .addUndoEntry({ type: 'UPDATE_MASTER_FX', payload: {} }, before)
  }, [])

  const liveSettings = useCallback(
    (next: MasterFxSettings) => {
      setMasterFx(next)
      markChanged()
    },
    [markChanged, setMasterFx],
  )

  const patchMaster = useCallback(
    (patch: Partial<MasterFxSettings>) => {
      liveSettings({ ...resolved, ...patch })
    },
    [liveSettings, resolved],
  )

  const applyPreset = useCallback(
    (presetId: MasteringPresetId) => {
      const preset = MASTERING_PRESETS.find((candidate) => candidate.id === presetId)
      if (!preset) return

      // Built-ins are complete mastering recipes, not deltas over leftover EQ/FX.
      // The Mixer owns project output gain, so presets deliberately leave its
      // bus fader untouched.
      const before = captureSnapshot()
      setBusAudioEq(undefined)
      setMasterFx(preset.settings)
      setAutoLevelResult(null)
      markChanged()
      useTimelineCommandStore
        .getState()
        .addUndoEntry({ type: 'APPLY_MASTER_PRESET', payload: { presetId } }, before)
    },
    [markChanged, setBusAudioEq, setMasterFx],
  )

  const applySavedPreset = useCallback(
    (preset: SavedMasterPreset) => {
      const before = captureSnapshot()
      setMasterFx(preset.masterFx)
      setBusAudioEq(preset.busAudioEq)
      setAutoLevelResult(null)
      markChanged()
      useTimelineCommandStore
        .getState()
        .addUndoEntry({ type: 'APPLY_MASTER_PRESET', payload: { presetId: preset.id } }, before)
    },
    [markChanged, setBusAudioEq, setMasterFx],
  )

  const saveCurrentPreset = useCallback(() => {
    const name = presetName.trim()
    if (!name) return

    const existing = savedPresets.find(
      (preset) => preset.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
    )
    const nextPreset: SavedMasterPreset = {
      id: existing?.id ?? crypto.randomUUID(),
      name,
      masterFx: {
        ...resolved,
        compressor: { ...resolved.compressor },
        saturator: { ...resolved.saturator },
        limiter: { ...resolved.limiter },
      },
      busAudioEq: busAudioEq ? { ...busAudioEq } : undefined,
    }
    const next = existing
      ? savedPresets.map((preset) => preset.id === existing.id ? nextPreset : preset)
      : [...savedPresets, nextPreset]
    persistSavedMasterPresets(next)
    setSavedPresets(next)
    setPresetName('')
    setSavingPreset(false)
  }, [busAudioEq, presetName, resolved, savedPresets])

  const removeSavedPreset = useCallback((presetId: string) => {
    setSavedPresets((current) => {
      const next = current.filter((preset) => preset.id !== presetId)
      persistSavedMasterPresets(next)
      return next
    })
  }, [])

  const handleBusEqChange = useCallback(
    (patch: AudioEqPatch) => {
      const before = captureSnapshot()
      const sparse = getSparseAudioEqSettings(patch)
      setBusAudioEq({ ...(usePlaybackStore.getState().busAudioEq ?? {}), ...sparse, midGainDb: 0 })
      markChanged()
      useTimelineCommandStore
        .getState()
        .addUndoEntry({ type: 'UPDATE_MASTER_EQ', payload: {} }, before)
    },
    [markChanged, setBusAudioEq],
  )

  const handleBusEqEnabled = useCallback(
    (enabled: boolean) => {
      const before = captureSnapshot()
      setBusAudioEq({ ...(usePlaybackStore.getState().busAudioEq ?? {}), enabled })
      markChanged()
      useTimelineCommandStore
        .getState()
        .addUndoEntry({ type: 'UPDATE_MASTER_EQ_ENABLED', payload: {} }, before)
    },
    [markChanged, setBusAudioEq],
  )

  const autoLevel = useCallback(async () => {
    if (autoLeveling) return
    const mediaId = currentProject?.beatvideoMusic?.mediaId
    if (!mediaId) {
      toast.error('Add and analyze the beat before Auto level')
      return
    }

    setAutoLeveling(true)
    try {
      const mediaUrl = await resolveMediaUrl(mediaId)
      if (!mediaUrl) throw new Error('The beat source could not be opened')
      const buffer = await getOrDecodeAudio(mediaId, mediaUrl)
      const channels = Array.from(
        { length: buffer.numberOfChannels },
        (_, channel) => buffer.getChannelData(channel),
      )
      const level = analyzeProgramLevel(channels, buffer.sampleRate)
      if (level.analyzedBlocks === 0 || level.rmsDb <= -100) {
        throw new Error('No usable audio level was detected')
      }

      const plan = resolveAutoLevelPlan(level)
      const before = captureSnapshot()
      setMasterFx({
        ...resolved,
        enabled: true,
        order: resolved.order.includes('limiter')
          ? resolved.order
          : [...resolved.order, 'limiter'],
        inputGainDb: plan.inputGainDb,
        limiter: {
          ...resolved.limiter,
          enabled: true,
          ceilingDb: Math.min(
            resolved.limiter.ceilingDb,
            AUTO_LEVEL_LIMITER_CEILING_DB,
          ),
        },
      })
      markChanged()
      useTimelineCommandStore
        .getState()
        .addUndoEntry({ type: 'AUTO_LEVEL_MASTER', payload: {} }, before)
      setAutoLevelResult({
        rmsDb: level.rmsDb,
        peakDb: level.peakDb,
        ...plan,
      })
      toast.success('Auto level applied', {
        description: `Trim ${plan.inputGainDb >= 0 ? '+' : ''}${plan.inputGainDb.toFixed(1)} dB; projected program level ${plan.projectedRmsDb.toFixed(1)} dBFS.`,
      })
    } catch (error) {
      toast.error('Could not auto level the beat', {
        description: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setAutoLeveling(false)
    }
  }, [
    autoLeveling,
    currentProject?.beatvideoMusic?.mediaId,
    markChanged,
    resolved,
    setMasterFx,
  ])

  const resetAll = useCallback(() => {
    const before = captureSnapshot()
    setMasterFx(undefined)
    setBusAudioEq(undefined)
    setAutoLevelResult(null)
    markChanged()
    useTimelineCommandStore
      .getState()
      .addUndoEntry({ type: 'RESET_MASTER_CHAIN', payload: {} }, before)
  }, [markChanged, setBusAudioEq, setMasterFx])

  const slotEnabled = useCallback(
    (slot: MasterSlot) => {
      if (slot === 'eq') return busAudioEq?.enabled !== false && busAudioEq !== undefined
      if (slot === 'compressor') return resolved.enabled && resolved.compressor.enabled
      if (slot === 'saturator') return resolved.enabled && resolved.saturator.enabled
      return resolved.enabled && resolved.limiter.enabled
    },
    [busAudioEq, resolved],
  )

  const toggleSlot = useCallback(
    (slot: MasterSlot) => {
      if (slot === 'eq') {
        handleBusEqEnabled(!(busAudioEq?.enabled !== false && busAudioEq !== undefined))
        return
      }
      const next: MasterFxSettings = { ...resolved, enabled: true }
      if (slot === 'compressor') {
        next.compressor = { ...resolved.compressor, enabled: !resolved.compressor.enabled }
      } else if (slot === 'saturator') {
        next.saturator = { ...resolved.saturator, enabled: !resolved.saturator.enabled }
      } else {
        next.limiter = { ...resolved.limiter, enabled: !resolved.limiter.enabled }
      }
      commitMasterFx(next, 'TOGGLE_MASTER_PLUGIN')
    },
    [busAudioEq, commitMasterFx, handleBusEqEnabled, resolved],
  )

  const reorderSlot = useCallback(
    (source: MasterSlot, target: MasterSlot) => {
      if (source === target) return
      const order = [...resolved.order]
      const sourceIndex = order.indexOf(source)
      const targetIndex = order.indexOf(target)
      if (sourceIndex < 0 || targetIndex < 0) return
      order.splice(sourceIndex, 1)
      order.splice(targetIndex, 0, source)
      commitMasterFx({ ...resolved, order }, 'REORDER_MASTER_CHAIN')
    },
    [commitMasterFx, resolved],
  )

  const addProcessor = useCallback(
    (slot: MasterSlot) => {
      if (resolved.order.includes(slot)) return
      const before = captureSnapshot()
      const order = [...resolved.order, slot]
      const next: MasterFxSettings = { ...resolved, enabled: true, order }

      if (slot === 'eq') {
        setBusAudioEq({ ...(busAudioEq ?? {}), enabled: true })
      } else if (slot === 'compressor') {
        next.compressor = { ...resolved.compressor, enabled: true }
      } else if (slot === 'saturator') {
        next.saturator = { ...resolved.saturator, enabled: true }
      } else {
        next.limiter = { ...resolved.limiter, enabled: true }
      }

      setMasterFx(next)
      markChanged()
      useTimelineCommandStore
        .getState()
        .addUndoEntry({ type: 'ADD_MASTER_PLUGIN', payload: { slot } }, before)
      setSelectedSlot(slot)
      setAddEffectOpen(false)
    },
    [busAudioEq, markChanged, resolved, setBusAudioEq, setMasterFx],
  )

  const removeProcessor = useCallback(
    (slot: MasterSlot) => {
      const nextOrder = resolved.order.filter((candidate) => candidate !== slot)
      if (nextOrder.length === resolved.order.length) return
      commitMasterFx({ ...resolved, order: nextOrder }, 'REMOVE_MASTER_PLUGIN')
      if (selectedSlot === slot) {
        setSelectedSlot(nextOrder[0] ?? null)
      }
      setAddEffectOpen(false)
    },
    [commitMasterFx, resolved, selectedSlot],
  )

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#e8e9e5]">
      <div className="flex h-[62px] shrink-0 items-start border-b border-border px-5 pt-4">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground">
            Master
          </div>
          <div className="mt-1 text-[10px] text-muted-foreground">
            Finish the beat, then export.
          </div>
        </div>

        <div className="ml-auto flex items-center gap-1">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground"
              >
                Presets
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" sideOffset={6} className="w-[360px] p-3">
              <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Master presets
              </div>
              <div className="studio-segmented mt-2 grid grid-cols-3">
                {MASTERING_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyPreset(preset.id)}
                    aria-pressed={activeBuiltInPresetId === preset.id}
                    className="studio-segment h-7 px-2 text-[10px] font-medium"
                    title={preset.description}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              {savedPresets.length > 0 ? (
                <div className="mt-3 border-t border-border pt-2">
                  <div className="mb-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    My presets
                  </div>
                  <div className="space-y-1">
                    {savedPresets.map((preset) => (
                      <div
                        key={preset.id}
                        className="flex h-7 items-center border border-border bg-background"
                      >
                        <button
                          type="button"
                          onClick={() => applySavedPreset(preset)}
                          className="min-w-0 flex-1 truncate px-2 text-left text-[10px] font-medium text-foreground"
                        >
                          {preset.name}
                        </button>
                        <button
                          type="button"
                          onClick={() => removeSavedPreset(preset.id)}
                          className="flex h-full w-7 items-center justify-center border-l border-border text-muted-foreground hover:text-foreground"
                          aria-label={`Delete ${preset.name} preset`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="mt-3 border-t border-border pt-2">
                {savingPreset ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      autoFocus
                      value={presetName}
                      maxLength={48}
                      placeholder="Preset name"
                      onChange={(event) => setPresetName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') saveCurrentPreset()
                        if (event.key === 'Escape') {
                          setSavingPreset(false)
                          setPresetName('')
                        }
                      }}
                      className="h-7 min-w-0 flex-1 border border-input bg-background px-2 text-[10px] text-foreground outline-none"
                    />
                    <Button
                      type="button"
                      size="sm"
                      className="h-7 px-2 text-[10px]"
                      disabled={presetName.trim() === ''}
                      onClick={saveCurrentPreset}
                    >
                      Save
                    </Button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="flex h-7 items-center gap-1.5 text-[10px] font-medium text-muted-foreground hover:text-foreground"
                    onClick={() => setSavingPreset(true)}
                  >
                    <BookmarkPlus className="h-3.5 w-3.5" />
                    Save current preset
                  </button>
                )}
              </div>
            </PopoverContent>
          </Popover>

          <Button
            type="button"
            size="icon"
            variant="ghost"
            className={cn('h-7 w-7', resolved.enabled && 'studio-tool-active')}
            onClick={() =>
              commitMasterFx(
                { ...resolved, enabled: !resolved.enabled },
                'TOGGLE_MASTER_BYPASS',
              )
            }
            aria-label={resolved.enabled ? 'Bypass master dynamics' : 'Enable master dynamics'}
            title={resolved.enabled ? 'Bypass master dynamics' : 'Enable master dynamics'}
          >
            <Power className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={resetAll}
            title="Reset master chain"
            aria-label="Reset master chain"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="shrink-0 px-5 py-4">
        <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Input
        </div>
        <div className="mt-1 text-[20px] font-semibold leading-none tabular-nums text-foreground">
          {resolved.inputGainDb >= 0 ? '+' : ''}{resolved.inputGainDb.toFixed(1)} dB
        </div>
        <div className="mt-3 flex items-center gap-2">
          <input
            type="range"
            min={-12}
            max={12}
            step={0.1}
            value={resolved.inputGainDb}
            onPointerDown={beginGesture}
            onPointerUp={endGesture}
            onPointerCancel={endGesture}
            onChange={(event) => {
              setAutoLevelResult(null)
              patchMaster({ enabled: true, inputGainDb: Number(event.target.value) })
            }}
            className="studio-master-input-range h-6 min-w-0 flex-1 accent-foreground"
            aria-label="Input trim"
          />
          <Button
            type="button"
            size="sm"
            className="studio-primary-action h-8 w-28 shrink-0 px-0"
            disabled={autoLeveling}
            onClick={() => void autoLevel()}
          >
            {autoLeveling ? 'Analyzing…' : 'Auto level'}
          </Button>
        </div>

        {autoLevelResult ? (
          <div className="mt-2 font-mono text-[9px] leading-[17px] text-muted-foreground" data-auto-level-result>
            <div>
              {autoLevelResult.rmsDb.toFixed(1)} dBFS measured
              {'  →  '}
              {autoLevelResult.inputGainDb >= 0 ? '+' : ''}
              {autoLevelResult.inputGainDb.toFixed(1)} dB trim
              {'  →  '}
              {autoLevelResult.projectedRmsDb.toFixed(1)} dBFS into chain
            </div>
            <div>
              Peak headroom{' '}
              {Math.max(
                0,
                AUTO_LEVEL_LIMITER_CEILING_DB - autoLevelResult.projectedPeakDb,
              ).toFixed(1)} dB
              {autoLevelResult.estimatedLimiterReductionDb > 0.05
                ? ` · limiter ~${autoLevelResult.estimatedLimiterReductionDb.toFixed(1)} dB`
                : ''}
            </div>
          </div>
        ) : null}
      </div>

      <div className="shrink-0 border-b border-border px-5 pb-3 pt-2">
        <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
          <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Inserts</span>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] text-muted-foreground">
              {activeBuiltInPresetId
                ? MASTERING_PRESETS.find((preset) => preset.id === activeBuiltInPresetId)?.label
                : 'Custom'}
            </span>
            <span className="text-[11px] text-muted-foreground">top → bottom</span>
          </div>
        </div>
        <div className="space-y-2">
          {Array.from({ length: MAX_MASTER_SLOTS }, (_, index) => {
            const id = resolved.order[index]
            if (!id) {
              const canAdd = availableProcessors.length > 0 && index === resolved.order.length
              return (
                <div
                  key={`empty-${index}`}
                  className="flex h-[46px] min-w-0 items-center gap-2 rounded-[3px] bg-[#d1d4ce] px-2 text-muted-foreground"
                >
                  <span className="w-5 shrink-0 font-mono text-[11px] tabular-nums">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  {canAdd ? (
                    <button
                      type="button"
                      onClick={() => setAddEffectOpen((open) => !open)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left text-xs hover:text-foreground"
                      aria-expanded={addEffectOpen}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add effect
                    </button>
                  ) : (
                    <span className="text-xs text-muted-foreground/55">Empty slot</span>
                  )}
                </div>
              )
            }

            const meta = SLOT_META_BY_ID.get(id)
            if (!meta) return null
            const { label, hint } = meta
            const enabled = slotEnabled(id)
            const selected = selectedSlot === id
            const dragTarget = dragOverSlot === id && draggingSlot !== id

            return (
              <div
                key={id}
                onDragOver={(event) => {
                  if (!draggingSlot || draggingSlot === id) return
                  event.preventDefault()
                  event.dataTransfer.dropEffect = 'move'
                  setDragOverSlot(id)
                }}
                onDragLeave={() => {
                  setDragOverSlot((current) => (current === id ? null : current))
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  if (draggingSlot) reorderSlot(draggingSlot, id)
                  setDraggingSlot(null)
                  setDragOverSlot(null)
                }}
                draggable
                onDragStart={(event) => {
                  setDraggingSlot(id)
                  event.dataTransfer.effectAllowed = 'move'
                  event.dataTransfer.setData('text/plain', id)
                }}
                onDragEnd={() => {
                  setDraggingSlot(null)
                  setDragOverSlot(null)
                }}
                className={cn(
                  'group flex h-[46px] min-w-0 cursor-grab items-stretch rounded-[3px] bg-[#d1d4ce] active:cursor-grabbing',
                  selected && 'bg-[#c7cac4]',
                  dragTarget && 'shadow-[inset_0_2px_0_var(--primary)]',
                )}
              >
                <button
                  type="button"
                  onClick={() => setSelectedSlot(id)}
                  className="flex min-w-0 flex-1 items-center gap-2 py-2 pr-2 text-left"
                  title={hint}
                >
                  <span className="w-5 shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                    {String(index + 1).padStart(2, '0')}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-foreground">
                      {label}
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {hint}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => removeProcessor(id)}
                  className="flex w-8 shrink-0 items-center justify-center border-l border-border text-muted-foreground opacity-0 transition-opacity hover:bg-secondary/60 hover:text-foreground focus:opacity-100 group-hover:opacity-100"
                  aria-label={`Remove ${label}`}
                  title={`Remove ${label}`}
                >
                  <X className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => toggleSlot(id)}
                  className={cn(
                    'flex w-10 shrink-0 items-center justify-center border-l border-border',
                    enabled
                      ? 'text-primary hover:bg-primary/10'
                      : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
                  )}
                  aria-label={`${enabled ? 'Bypass' : 'Enable'} ${label}`}
                  aria-pressed={enabled}
                  title={`${enabled ? 'Bypass' : 'Enable'} ${label}`}
                >
                  <span className="text-[8px] font-semibold uppercase">{enabled ? 'On' : 'Off'}</span>
                </button>
              </div>
            )
          })}
        </div>

        {addEffectOpen ? (
          <div className="border-x border-b border-border bg-background p-1.5">
            <div className="mb-1 px-1 text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
              Available effects
            </div>
            {availableProcessors.length > 0 ? (
              <div className="grid grid-cols-2 gap-1">
                {availableProcessors.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => addProcessor(id)}
                    className="flex h-8 items-center gap-2 border border-border px-2 text-left text-[10px] text-foreground hover:bg-secondary/55"
                  >
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="truncate">{label}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="px-1 py-2 text-[10px] text-muted-foreground">
                All available master effects are already loaded.
              </div>
            )}
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto border-t border-border bg-[#dfe1dc] p-5">
        {selectedSlot === 'eq' ? (
          <AudioEqPanelContent
            targetLabel="Master"
            trackEq={busAudioEq}
            enabled={busAudioEq !== undefined && busAudioEq.enabled !== false}
            onTrackEqChange={handleBusEqChange}
            onEnabledChange={handleBusEqEnabled}
            layoutMode="compact"
          />
        ) : null}

        {selectedSlot === 'compressor' ? (
          <div>
            <div className="text-[9px] font-semibold text-muted-foreground">
              Selected insert · Compressor
            </div>
            <div className="mt-4 flex items-start">
              <MasterKnob
                label="Thresh"
                value={resolved.compressor.thresholdDb}
                min={-40}
                max={0}
                step={0.5}
                display={resolved.compressor.thresholdDb.toFixed(0)}
                onGestureStart={beginGesture}
                onGestureEnd={endGesture}
                onChange={(thresholdDb) =>
                  patchMaster({
                    enabled: true,
                    compressor: { ...resolved.compressor, enabled: true, thresholdDb },
                  })
                }
              />
              <MasterKnob
                label="Ratio"
                value={resolved.compressor.ratio}
                min={1}
                max={12}
                step={0.1}
                display={`${resolved.compressor.ratio.toFixed(1).replace(/\.0$/, '')}:1`}
                onGestureStart={beginGesture}
                onGestureEnd={endGesture}
                onChange={(ratio) =>
                  patchMaster({
                    enabled: true,
                    compressor: { ...resolved.compressor, enabled: true, ratio },
                  })
                }
              />
              <MasterKnob
                label="Attack"
                value={resolved.compressor.attackSec * 1000}
                min={0}
                max={200}
                step={1}
                display={resolved.compressor.attackSec * 1000 < 100
                  ? (resolved.compressor.attackSec * 1000).toFixed(0)
                  : Math.round(resolved.compressor.attackSec * 1000).toString()}
                onGestureStart={beginGesture}
                onGestureEnd={endGesture}
                onChange={(ms) =>
                  patchMaster({
                    enabled: true,
                    compressor: {
                      ...resolved.compressor,
                      enabled: true,
                      attackSec: ms / 1000,
                    },
                  })
                }
              />
              <MasterKnob
                label="Release"
                value={resolved.compressor.releaseSec * 1000}
                min={20}
                max={800}
                step={5}
                display={Math.round(resolved.compressor.releaseSec * 1000).toString()}
                onGestureStart={beginGesture}
                onGestureEnd={endGesture}
                onChange={(ms) =>
                  patchMaster({
                    enabled: true,
                    compressor: {
                      ...resolved.compressor,
                      enabled: true,
                      releaseSec: ms / 1000,
                    },
                  })
                }
              />
              <button
                type="button"
                onClick={() => toggleSlot('compressor')}
                className="studio-secondary-action -ml-2 mt-1 h-7 w-[72px] shrink-0"
                aria-pressed={!slotEnabled('compressor')}
              >
                Bypass
              </button>
            </div>

            <details className="mt-4 border-t border-border pt-2">
              <summary className="cursor-pointer list-none text-[9px] font-medium uppercase tracking-[0.1em] text-muted-foreground marker:hidden [&::-webkit-details-marker]:hidden">
                Advanced
              </summary>
              <div className="mt-3 space-y-3">
                <TransferGraph
                  thresholdDb={resolved.compressor.thresholdDb}
                  ratio={resolved.compressor.ratio}
                  reductionDb={reduction.compressorDb}
                  mode="compressor"
                />
                <MasterRange label="Knee" value={resolved.compressor.kneeDb} min={0} max={40} step={0.5} unit=" dB" onGestureStart={beginGesture} onGestureEnd={endGesture} onChange={(kneeDb) => patchMaster({ enabled: true, compressor: { ...resolved.compressor, enabled: true, kneeDb } })} />
                <MasterRange label="Makeup" value={resolved.compressor.makeupGainDb} min={-6} max={12} step={0.1} unit=" dB" onGestureStart={beginGesture} onGestureEnd={endGesture} onChange={(makeupGainDb) => patchMaster({ enabled: true, compressor: { ...resolved.compressor, enabled: true, makeupGainDb } })} />
              </div>
            </details>
          </div>
        ) : null}

        {selectedSlot === 'saturator' ? (
          <div className="space-y-3">
            <SaturationGraph driveDb={resolved.saturator.driveDb} mix={resolved.saturator.mix} />
            <MasterRange label="Drive" value={resolved.saturator.driveDb} min={0} max={18} step={0.1} unit=" dB" onGestureStart={beginGesture} onGestureEnd={endGesture} onChange={(driveDb) => patchMaster({ enabled: true, saturator: { ...resolved.saturator, enabled: true, driveDb } })} />
            <MasterRange label="Mix" value={resolved.saturator.mix * 100} min={0} max={100} step={1} unit="%" onGestureStart={beginGesture} onGestureEnd={endGesture} onChange={(mix) => patchMaster({ enabled: true, saturator: { ...resolved.saturator, enabled: true, mix: mix / 100 } })} />
            <MasterRange label="Output" value={resolved.saturator.outputGainDb} min={-12} max={6} step={0.1} unit=" dB" onGestureStart={beginGesture} onGestureEnd={endGesture} onChange={(outputGainDb) => patchMaster({ enabled: true, saturator: { ...resolved.saturator, enabled: true, outputGainDb } })} />
            <div className="flex items-center justify-between border-t border-border pt-2 text-xs text-muted-foreground">
              <span>Oversampling</span>
              <div className="flex gap-1">
                {(['none', '2x', '4x'] as const).map((oversample) => (
                  <button key={oversample} type="button" onClick={() => commitMasterFx({ ...resolved, enabled: true, saturator: { ...resolved.saturator, enabled: true, oversample } })} className={cn('rounded border px-2 py-1 font-mono', resolved.saturator.oversample === oversample ? 'border-foreground/50 bg-secondary text-foreground' : 'border-border')}>
                    {oversample}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {selectedSlot === null ? (
          <div className="flex min-h-40 items-center justify-center border border-dashed border-border text-center text-xs text-muted-foreground">
            Add an effect to the Master chain to start processing.
          </div>
        ) : null}

        {selectedSlot === 'limiter' ? (
          <div className="space-y-3">
            <TransferGraph thresholdDb={resolved.limiter.thresholdDb} ratio={20} ceilingDb={resolved.limiter.ceilingDb} reductionDb={reduction.limiterDb} mode="limiter" />
            <MasterRange label="Threshold" value={resolved.limiter.thresholdDb} min={-12} max={0} step={0.1} unit=" dB" onGestureStart={beginGesture} onGestureEnd={endGesture} onChange={(thresholdDb) => patchMaster({ enabled: true, limiter: { ...resolved.limiter, enabled: true, thresholdDb } })} />
            <MasterRange label="Ceiling" value={resolved.limiter.ceilingDb} min={-6} max={0} step={0.1} unit=" dB" onGestureStart={beginGesture} onGestureEnd={endGesture} onChange={(ceilingDb) => patchMaster({ enabled: true, limiter: { ...resolved.limiter, enabled: true, ceilingDb } })} />
            <MasterRange label="Release" value={resolved.limiter.releaseSec * 1000} min={20} max={500} step={5} unit=" ms" onGestureStart={beginGesture} onGestureEnd={endGesture} onChange={(ms) => patchMaster({ enabled: true, limiter: { ...resolved.limiter, enabled: true, releaseSec: ms / 1000 } })} />
            <p className="border-l-2 border-border pl-2 text-xs leading-relaxed text-muted-foreground">
              Slot {resolved.order.indexOf('limiter') + 1}. Ceiling caps peaks at this point in the rack.
            </p>
          </div>
        ) : null}
      </div>

      <div className="shrink-0 border-t border-border bg-[#e8e9e5] px-5 py-3">
        <div className="grid grid-cols-[minmax(0,1fr)_52px] items-end gap-3">
          <div className="min-w-0">
            <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Master out
            </div>
            <div className="mt-1 text-[9px] text-muted-foreground">
              Mixer fader lives in Mixer ↗
            </div>
            <button
              type="button"
              onClick={toggleMixerFloating}
              aria-pressed={mixerFloating}
              className="studio-primary-action mt-3 h-9 w-full"
            >
              {mixerFloating ? 'Close Mixer' : 'Open Mixer'}
            </button>
            <div className="mt-3 text-[9px] font-semibold uppercase tracking-[0.08em] text-foreground">
              Auto level · pre-FX only
            </div>
          </div>
          <AudioMeterPanel initialMode="meter" allowDockedMixer={false} presentation="master-inline" />
        </div>
      </div>
    </div>
  )
}
