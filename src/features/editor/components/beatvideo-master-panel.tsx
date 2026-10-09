import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Activity, BookmarkPlus, Flame, Shield, SlidersHorizontal, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  captureSnapshot,
  useTimelineCommandStore,
  useTimelineStore,
} from '@/features/editor/deps/timeline-store'
import { usePlaybackStore } from '@/shared/state/playback'
import { useEditorStore } from '@/shared/state/editor'
import {
  MASTERING_PRESETS,
  DEFAULT_MASTER_FX_SETTINGS,
  analyzeProgramLevel,
  createSaturationCurve,
  resolveAutoLevelPlan,
  resolveMasterFxSettings,
  withPreservedMasterInputGain,
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
import {
  getOrDecodeAudio,
  getPreviewMasterReduction,
} from '@/features/editor/deps/composition-runtime'
import { resolveMediaUrl } from '@/features/editor/deps/media-library'
import { useProjectStore } from '@/features/editor/deps/projects'
import { cn } from '@/shared/ui/cn'
import { ConsoleFader } from '@/shared/ui/property-controls/console-fader'
import { RotaryKnob } from '@/shared/ui/property-controls/rotary-knob'
import { SliderInput } from '@/shared/ui/property-controls/slider-input'
import { NumberInput } from '@/shared/ui/property-controls/number-input'
import { AudioMeterPanel } from './audio-meter-panel'

type MasterSlot = MasterProcessorId

const MAX_MASTER_SLOTS = 4

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
  masterBusDb?: number
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
      return [
        {
          id: candidate.id,
          name: candidate.name,
          masterFx: candidate.masterFx as MasterFxSettings,
          busAudioEq:
            candidate.busAudioEq && typeof candidate.busAudioEq === 'object'
              ? (candidate.busAudioEq as AudioEqSettings)
              : undefined,
          masterBusDb:
            typeof candidate.masterBusDb === 'number' && Number.isFinite(candidate.masterBusDb)
              ? candidate.masterBusDb
              : undefined,
        },
      ]
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
  const formatScale = (next: number) => `${next > 0 && min < 0 ? '+' : ''}${next}`

  return (
    <div
      className="min-w-0"
      onPointerDownCapture={onGestureStart}
      onPointerUp={onGestureEnd}
      onPointerCancel={onGestureEnd}
    >
      <SliderInput
        label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        unit={unit}
        onLiveChange={onChange}
        onChange={(next) => {
          onGestureStart()
          onChange(next)
          onGestureEnd()
        }}
      />
      <div
        aria-hidden="true"
        className="mt-1 grid grid-cols-[80px_minmax(0,1fr)_80px] gap-2 font-mono text-[10px] leading-none text-muted-foreground"
      >
        <span />
        <span className="flex justify-between gap-1">
          <span>{formatScale(min)}</span>
          <span>{formatScale(max)}</span>
        </span>
        <span />
      </div>
    </div>
  )
}

function MasterKnob({
  label,
  value,
  min,
  max,
  step,
  display,
  defaultValue,
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
  display: string
  defaultValue: number
  unit: string
  onChange: (value: number) => void
  onGestureStart: () => void
  onGestureEnd: () => void
}) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-1">
      <RotaryKnob
        value={value}
        min={min}
        max={max}
        step={step}
        size={44}
        label={label}
        defaultValue={defaultValue}
        onLiveChange={onChange}
        onChange={onChange}
        onGestureStart={onGestureStart}
        onGestureEnd={onGestureEnd}
      />
      <div className="mt-1 text-[11px] font-medium leading-4 text-muted-foreground">{label}</div>
      <label className="w-full max-w-20" title={display}>
        <span className="sr-only">{label} value</span>
        <NumberInput
          value={value}
          min={min}
          max={max}
          step={step}
          unit={unit}
          unitWidth={22}
          scrubEnabled={false}
          className="h-6 rounded-[3px]"
          formatInputValue={(next) => next.toFixed(step < 1 ? 1 : 0)}
          onChange={(next) => {
            if (next === value) return
            onGestureStart()
            onChange(next)
            onGestureEnd()
          }}
        />
      </label>
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
    <div className="relative h-36 overflow-hidden rounded border border-border bg-background/60">
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
      >
        {[25, 50, 75].map((n) => (
          <g key={n}>
            <line
              x1={n}
              x2={n}
              y1="0"
              y2="100"
              stroke="currentColor"
              className="text-border"
              strokeWidth="0.45"
            />
            <line
              x1="0"
              x2="100"
              y1={n}
              y2={n}
              stroke="currentColor"
              className="text-border"
              strokeWidth="0.45"
            />
          </g>
        ))}
        <line
          x1="0"
          y1="100"
          x2="100"
          y2="0"
          stroke="currentColor"
          className="text-muted-foreground/35"
          strokeWidth="0.65"
        />
        <line
          x1={thresholdX}
          x2={thresholdX}
          y1="0"
          y2="100"
          stroke="currentColor"
          className="text-muted-foreground"
          strokeDasharray="2 2"
          strokeWidth="0.65"
        />
        {ceilingY !== null ? (
          <line
            x1="0"
            x2="100"
            y1={ceilingY}
            y2={ceilingY}
            stroke="currentColor"
            className="text-muted-foreground"
            strokeDasharray="2 2"
            strokeWidth="0.65"
          />
        ) : null}
        <polyline
          points={points}
          fill="none"
          stroke="currentColor"
          className="text-primary"
          strokeWidth="1.6"
          vectorEffect="non-scaling-stroke"
        />
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
    <div className="relative h-36 overflow-hidden rounded border border-border bg-background/60">
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
      >
        <line
          x1="0"
          y1="100"
          x2="100"
          y2="0"
          stroke="currentColor"
          className="text-muted-foreground/35"
          strokeWidth="0.65"
        />
        <line
          x1="50"
          y1="0"
          x2="50"
          y2="100"
          stroke="currentColor"
          className="text-border"
          strokeWidth="0.45"
        />
        <line
          x1="0"
          y1="50"
          x2="100"
          y2="50"
          stroke="currentColor"
          className="text-border"
          strokeWidth="0.45"
        />
        <polyline
          points={points}
          fill="none"
          stroke="currentColor"
          className="text-primary"
          strokeWidth="1.6"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="absolute left-2 top-2 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
        Transfer curve
      </div>
    </div>
  )
}

interface MasterOptionsContentProps {
  savedPresets: SavedMasterPreset[]
  savingPreset: boolean
  presetName: string
  enabled: boolean
  applySavedPreset: (preset: SavedMasterPreset) => void
  removeSavedPreset: (id: string) => void
  setPresetName: (name: string) => void
  setSavingPreset: (saving: boolean) => void
  saveCurrentPreset: () => void
  toggleChain: () => void
  resetAll: () => void
}

function MasterOptionsContent({
  savedPresets,
  savingPreset,
  presetName,
  enabled,
  applySavedPreset,
  removeSavedPreset,
  setPresetName,
  setSavingPreset,
  saveCurrentPreset,
  toggleChain,
  resetAll,
}: MasterOptionsContentProps) {
  return (
    <>
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        Master options
      </div>

      {savedPresets.length > 0 ? (
        <div className="mt-3 border-t border-border pt-2">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
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
                if (event.key === 'Enter') {
                  event.stopPropagation()
                  saveCurrentPreset()
                }
                if (event.key === 'Escape') {
                  event.stopPropagation()
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

      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-2">
        <button type="button" className="studio-secondary-action h-8" onClick={() => toggleChain()}>
          {enabled ? 'Bypass chain' : 'Enable chain'}
        </button>
        <button type="button" className="studio-secondary-action h-8" onClick={resetAll}>
          Reset chain
        </button>
      </div>
    </>
  )
}

interface MasterAutoLevelResult {
  rmsDb: number
  peakDb: number
  inputGainDb: number
  targetRmsDb: number
  projectedRmsDb: number
  projectedPeakDb: number
  estimatedLimiterReductionDb: number
  limitedByPeak: boolean
}

function MasterAutoLevelReadout({ result }: { result: MasterAutoLevelResult }) {
  return (
    <div
      className="mt-3 border-t border-border pt-2 font-mono text-xs leading-5 text-muted-foreground"
      data-auto-level-result
    >
      Source {result.rmsDb.toFixed(1)} dBFS RMS
      {' → '}
      Trim {result.inputGainDb >= 0 ? '+' : ''}
      {result.inputGainDb.toFixed(1)} dB
      {' → '}
      Into chain {result.projectedRmsDb.toFixed(1)} dBFS RMS
      <div>
        Peak {result.projectedPeakDb.toFixed(1)} dBFS
        {' · '}
        Headroom {Math.max(0, -result.projectedPeakDb).toFixed(1)} dB
        {result.estimatedLimiterReductionDb > 0
          ? ` · Estimated peak control ${result.estimatedLimiterReductionDb.toFixed(1)} dB`
          : ''}
      </div>
    </div>
  )
}

export function BeatvideoMasterPanel() {
  const masterFx = usePlaybackStore((state) => state.masterFx)
  const setMasterFx = usePlaybackStore((state) => state.setMasterFx)
  const busAudioEq = usePlaybackStore((state) => state.busAudioEq)
  const setBusAudioEq = usePlaybackStore((state) => state.setBusAudioEq)
  const masterBusDb = usePlaybackStore((state) => state.masterBusDb)
  const setMasterBusDb = usePlaybackStore((state) => state.setMasterBusDb)
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
  const outputGestureSnapshotRef = useRef<ReturnType<typeof captureSnapshot> | null>(null)
  const [savedPresets, setSavedPresets] = useState<SavedMasterPreset[]>(loadSavedMasterPresets)
  const [savingPreset, setSavingPreset] = useState(false)
  const [presetName, setPresetName] = useState('')
  const [autoLeveling, setAutoLeveling] = useState(false)
  const [autoLevelResult, setAutoLevelResult] = useState<MasterAutoLevelResult | null>(null)

  const activeBuiltInPresetId = useMemo(() => {
    if (busAudioEq !== undefined) return null
    const current = JSON.stringify(resolved, (key, value) =>
      key === 'processorInstanceIds' || key === 'inputGainDb' ? undefined : value,
    )
    return (
      MASTERING_PRESETS.find(
        (preset) =>
          JSON.stringify(resolveMasterFxSettings(preset.settings), (key, value) =>
            key === 'processorInstanceIds' || key === 'inputGainDb' ? undefined : value,
          ) === current,
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

  const beginOutputGesture = useCallback(() => {
    outputGestureSnapshotRef.current ??= captureSnapshot()
  }, [])

  const endOutputGesture = useCallback(() => {
    const before = outputGestureSnapshotRef.current
    outputGestureSnapshotRef.current = null
    if (!before) return
    useTimelineCommandStore
      .getState()
      .addUndoEntry({ type: 'UPDATE_MASTER_OUTPUT', payload: {} }, before)
  }, [])

  const setOutputTrimLive = useCallback(
    (db: number) => {
      setMasterBusDb(Math.max(-60, Math.min(12, db)))
      markChanged()
      setAutoLevelResult(null)
    },
    [markChanged, setMasterBusDb],
  )

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
      const presetOrder = resolveMasterFxSettings(preset.settings).order
      setMasterFx({
        ...withPreservedMasterInputGain(resolved, preset.settings),
        processorInstanceIds: Object.fromEntries(
          presetOrder.map((processor) => [processor, crypto.randomUUID()]),
        ),
      })
      setAutoLevelResult(null)
      markChanged()
      useTimelineCommandStore
        .getState()
        .addUndoEntry({ type: 'APPLY_MASTER_PRESET', payload: { presetId } }, before)
    },
    [markChanged, resolved, setBusAudioEq, setMasterFx],
  )

  const applySavedPreset = useCallback(
    (preset: SavedMasterPreset) => {
      const before = captureSnapshot()
      const presetOrder = resolveMasterFxSettings(preset.masterFx).order
      setMasterFx({
        ...withPreservedMasterInputGain(resolved, preset.masterFx),
        processorInstanceIds: Object.fromEntries(
          presetOrder.map((processor) => [processor, crypto.randomUUID()]),
        ),
      })
      setBusAudioEq(preset.busAudioEq)
      // Restoring rack presets must not edit the independently owned output trim.
      setAutoLevelResult(null)
      markChanged()
      useTimelineCommandStore
        .getState()
        .addUndoEntry({ type: 'APPLY_MASTER_PRESET', payload: { presetId: preset.id } }, before)
    },
    [markChanged, resolved, setBusAudioEq, setMasterFx],
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
      masterBusDb,
    }
    const next = existing
      ? savedPresets.map((preset) => (preset.id === existing.id ? nextPreset : preset))
      : [...savedPresets, nextPreset]
    persistSavedMasterPresets(next)
    setSavedPresets(next)
    setPresetName('')
    setSavingPreset(false)
  }, [busAudioEq, masterBusDb, presetName, resolved, savedPresets])

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
      const channels = Array.from({ length: buffer.numberOfChannels }, (_, channel) =>
        buffer.getChannelData(channel),
      )
      const sourceLevel = analyzeProgramLevel(channels, buffer.sampleRate)
      if (sourceLevel.analyzedBlocks === 0 || sourceLevel.rmsDb <= -100) {
        throw new Error('No usable audio level was detected')
      }

      // The track mixer is pre-master. Include the canonical Beat clip + track
      // gain so Auto level measures the signal that actually reaches Master.
      const timeline = useTimelineStore.getState()
      const beatItem = timeline.items.find(
        (item) => (item.type === 'audio' || item.type === 'video') && item.mediaId === mediaId,
      )
      const beatTrack = beatItem
        ? timeline.tracks.find((track) => track.id === beatItem.trackId)
        : undefined
      if (beatTrack?.muted) {
        throw new Error('Unmute the Beat track before Auto level')
      }
      const preMasterGainDb = (beatTrack?.volume ?? 0) + (beatItem?.volume ?? 0)
      const level = {
        ...sourceLevel,
        rmsDb: sourceLevel.rmsDb + preMasterGainDb,
        peakDb: sourceLevel.peakDb + preMasterGainDb,
      }

      const plan = resolveAutoLevelPlan(level)
      const before = captureSnapshot()
      // Auto level owns gain staging into the rack. Keep the final Master
      // output at unity so a hidden post-rack offset cannot invalidate it.
      setMasterBusDb(0)
      setMasterFx({
        ...resolved,
        enabled: true,
        inputGainDb: plan.inputGainDb,
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
    setMasterBusDb,
    setMasterFx,
  ])

  const resetAll = useCallback(() => {
    const before = captureSnapshot()
    setMasterFx(undefined)
    setBusAudioEq(undefined)
    setMasterBusDb(0)
    setAutoLevelResult(null)
    markChanged()
    useTimelineCommandStore
      .getState()
      .addUndoEntry({ type: 'RESET_MASTER_CHAIN', payload: {} }, before)
  }, [markChanged, setBusAudioEq, setMasterBusDb, setMasterFx])

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
      const next: MasterFxSettings = {
        ...resolved,
        enabled: true,
        order,
        processorInstanceIds: {
          ...resolved.processorInstanceIds,
          [slot]: crypto.randomUUID(),
        },
      }

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
      const processorInstanceIds = { ...resolved.processorInstanceIds }
      delete processorInstanceIds[slot]
      commitMasterFx(
        { ...resolved, order: nextOrder, processorInstanceIds },
        'REMOVE_MASTER_PLUGIN',
      )
      if (selectedSlot === slot) {
        setSelectedSlot(nextOrder[0] ?? null)
      }
      setAddEffectOpen(false)
    },
    [commitMasterFx, resolved, selectedSlot],
  )

  return (
    <div className="@container grid h-full min-h-0 min-w-0 grid-cols-[minmax(0,1fr)_152px] gap-4 bg-panel-bg p-4">
      <div className="min-h-0 flex-1 overflow-y-auto" data-testid="master-chain-scroll-region">
        <div className="shrink-0 pb-3">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground"
                    title="Master options"
                  >
                    Master
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  sideOffset={8}
                  className="w-[min(440px,calc(100vw-24px))] p-3"
                >
                  <MasterOptionsContent
                    savedPresets={savedPresets}
                    savingPreset={savingPreset}
                    presetName={presetName}
                    enabled={resolved.enabled}
                    applySavedPreset={applySavedPreset}
                    removeSavedPreset={removeSavedPreset}
                    setPresetName={setPresetName}
                    setSavingPreset={setSavingPreset}
                    saveCurrentPreset={saveCurrentPreset}
                    toggleChain={() =>
                      commitMasterFx(
                        { ...resolved, enabled: !resolved.enabled },
                        'TOGGLE_MASTER_BYPASS',
                      )
                    }
                    resetAll={resetAll}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <button
              type="button"
              onClick={toggleMixerFloating}
              aria-pressed={mixerFloating}
              className="studio-secondary-action h-7 shrink-0 px-2 text-[10px]"
              title="Balance Beat, producer tags and watermark audio before Master"
            >
              {mixerFloating ? 'Close mix' : 'Track mix'}
            </button>
          </div>

          <select
            aria-label="Master preset"
            value={activeBuiltInPresetId ?? ''}
            onChange={(event) => applyPreset(event.currentTarget.value as MasteringPresetId)}
            className="mt-3 h-8 w-full rounded-sm border border-input bg-secondary px-3 text-xs"
          >
            <option value="" disabled>
              Custom
            </option>
            {MASTERING_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </select>
        </div>

        <div
          className="shrink-0 border-b border-border pb-3 mb-3"
          data-testid="master-auto-level-section"
        >
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold text-foreground">Auto level</div>
              <div className="mt-1 text-xs text-muted-foreground">Input trim · before plugins</div>
            </div>
            <Button
              type="button"
              size="sm"
              className="studio-primary-action h-9 shrink-0 px-3 text-xs"
              disabled={autoLeveling}
              onClick={() => void autoLevel()}
            >
              {autoLeveling ? 'Analyzing…' : 'Auto level'}
            </Button>
          </div>
          <div className="mt-2">
            <MasterRange
              label="Input trim"
              min={-12}
              max={12}
              step={0.1}
              value={resolved.inputGainDb}
              unit=" dB"
              onGestureStart={beginGesture}
              onGestureEnd={endGesture}
              onChange={(inputGainDb) => {
                setAutoLevelResult(null)
                patchMaster({ enabled: true, inputGainDb })
              }}
            />
            {Math.abs(resolved.inputGainDb) > 0.0001 ? (
              <button
                type="button"
                className="studio-secondary-action mt-3 h-7 px-2 text-[11px]"
                onClick={() => {
                  setAutoLevelResult(null)
                  commitMasterFx({ ...resolved, inputGainDb: 0 }, 'RESET_MASTER_INPUT')
                }}
              >
                Reset input
              </button>
            ) : null}
          </div>
          {autoLevelResult && <MasterAutoLevelReadout result={autoLevelResult} />}
        </div>
        <div className="relative space-y-2 pb-3">
          <div className="text-xs font-medium uppercase text-muted-foreground">Master inserts</div>
          {Array.from({ length: MAX_MASTER_SLOTS }, (_, index) => {
            const id = resolved.order[index]
            if (!id)
              return (
                <button
                  key={index}
                  type="button"
                  className="flex h-10 w-full items-center gap-3 rounded-sm border border-dashed border-border px-3 text-left text-xs text-muted-foreground"
                  disabled={availableProcessors.length === 0}
                  onClick={() => setAddEffectOpen((open) => !open)}
                >
                  {String(index + 1).padStart(2, '0')} <span>+ Add processor</span>
                </button>
              )
            const meta = SLOT_META_BY_ID.get(id)
            if (!meta) return null
            const { label, hint } = meta
            return (
              <div
                key={resolved.processorInstanceIds[id] ?? id}
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
                onDragOver={(event) => {
                  if (draggingSlot && draggingSlot !== id) {
                    event.preventDefault()
                    setDragOverSlot(id)
                  }
                }}
                onDragLeave={() => setDragOverSlot(null)}
                onDrop={(event) => {
                  event.preventDefault()
                  if (draggingSlot) reorderSlot(draggingSlot, id)
                  setDraggingSlot(null)
                  setDragOverSlot(null)
                }}
                className={cn(
                  'group flex h-10 min-w-0 items-center gap-2 rounded-sm border border-border bg-secondary px-2',
                  selectedSlot === id && 'border-l-2 border-l-primary',
                  dragOverSlot === id && 'shadow-[inset_0_2px_0_var(--primary)]',
                )}
                data-selected={selectedSlot === id ? 'true' : undefined}
              >
                <button
                  type="button"
                  onClick={() => setSelectedSlot(id)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left text-xs"
                  title={hint}
                >
                  <span className="font-mono text-muted-foreground">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="truncate">{label}</span>
                </button>
                <button
                  type="button"
                  onClick={() => removeProcessor(id)}
                  className="text-muted-foreground opacity-0 group-hover:opacity-100 focus:opacity-100"
                  aria-label={'Remove ' + label}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                <Switch
                  checked={slotEnabled(id)}
                  onCheckedChange={() => toggleSlot(id)}
                  aria-label={label + ' enabled'}
                />
              </div>
            )
          })}
          {addEffectOpen ? (
            <div className="border border-border bg-popover p-2">
              {availableProcessors.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => addProcessor(id)}
                  className="flex h-8 w-full items-center gap-2 px-2 text-xs hover:bg-secondary"
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="min-h-[190px] border-t border-border pt-3">
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
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="block text-[10px] font-semibold leading-[11px] text-muted-foreground"
                    title="Compressor advanced controls"
                  >
                    Compressor · Advanced
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" sideOffset={8} className="w-[440px] p-3">
                  <div className="space-y-3">
                    <TransferGraph
                      thresholdDb={resolved.compressor.thresholdDb}
                      ratio={resolved.compressor.ratio}
                      reductionDb={reduction.compressorDb}
                      mode="compressor"
                    />
                    <MasterRange
                      label="Knee"
                      value={resolved.compressor.kneeDb}
                      min={0}
                      max={40}
                      step={0.5}
                      unit=" dB"
                      onGestureStart={beginGesture}
                      onGestureEnd={endGesture}
                      onChange={(kneeDb) =>
                        patchMaster({
                          enabled: true,
                          compressor: { ...resolved.compressor, enabled: true, kneeDb },
                        })
                      }
                    />
                    <MasterRange
                      label="Makeup"
                      value={resolved.compressor.makeupGainDb}
                      min={-6}
                      max={12}
                      step={0.1}
                      unit=" dB"
                      onGestureStart={beginGesture}
                      onGestureEnd={endGesture}
                      onChange={(makeupGainDb) =>
                        patchMaster({
                          enabled: true,
                          compressor: { ...resolved.compressor, enabled: true, makeupGainDb },
                        })
                      }
                    />
                  </div>
                </PopoverContent>
              </Popover>
              <div className="mt-4 grid grid-cols-2 items-start gap-x-2 gap-y-4 @min-[520px]:grid-cols-4">
                <MasterKnob
                  label="Thresh"
                  unit="dB"
                  defaultValue={DEFAULT_MASTER_FX_SETTINGS.compressor.thresholdDb}
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
                  unit=":1"
                  defaultValue={DEFAULT_MASTER_FX_SETTINGS.compressor.ratio}
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
                  unit="ms"
                  defaultValue={DEFAULT_MASTER_FX_SETTINGS.compressor.attackSec * 1000}
                  value={resolved.compressor.attackSec * 1000}
                  min={0}
                  max={200}
                  step={1}
                  display={
                    resolved.compressor.attackSec * 1000 < 100
                      ? (resolved.compressor.attackSec * 1000).toFixed(0)
                      : Math.round(resolved.compressor.attackSec * 1000).toString()
                  }
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
                  unit="ms"
                  defaultValue={DEFAULT_MASTER_FX_SETTINGS.compressor.releaseSec * 1000}
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
                  className="studio-secondary-action col-span-full h-7 justify-self-end px-3 text-[11px]"
                  aria-pressed={!slotEnabled('compressor')}
                >
                  Bypass
                </button>
              </div>
            </div>
          ) : null}

          {selectedSlot === 'saturator' ? (
            <div className="space-y-3">
              <SaturationGraph driveDb={resolved.saturator.driveDb} mix={resolved.saturator.mix} />
              <MasterRange
                label="Drive"
                value={resolved.saturator.driveDb}
                min={0}
                max={18}
                step={0.1}
                unit=" dB"
                onGestureStart={beginGesture}
                onGestureEnd={endGesture}
                onChange={(driveDb) =>
                  patchMaster({
                    enabled: true,
                    saturator: { ...resolved.saturator, enabled: true, driveDb },
                  })
                }
              />
              <MasterRange
                label="Mix"
                value={resolved.saturator.mix * 100}
                min={0}
                max={100}
                step={1}
                unit="%"
                onGestureStart={beginGesture}
                onGestureEnd={endGesture}
                onChange={(mix) =>
                  patchMaster({
                    enabled: true,
                    saturator: { ...resolved.saturator, enabled: true, mix: mix / 100 },
                  })
                }
              />
              <MasterRange
                label="Output"
                value={resolved.saturator.outputGainDb}
                min={-12}
                max={6}
                step={0.1}
                unit=" dB"
                onGestureStart={beginGesture}
                onGestureEnd={endGesture}
                onChange={(outputGainDb) =>
                  patchMaster({
                    enabled: true,
                    saturator: { ...resolved.saturator, enabled: true, outputGainDb },
                  })
                }
              />
              <div className="flex items-center justify-between border-t border-border pt-2 text-xs text-muted-foreground">
                <span>Oversampling</span>
                <div className="flex gap-1">
                  {(['none', '2x', '4x'] as const).map((oversample) => (
                    <button
                      key={oversample}
                      type="button"
                      onClick={() =>
                        commitMasterFx({
                          ...resolved,
                          enabled: true,
                          saturator: { ...resolved.saturator, enabled: true, oversample },
                        })
                      }
                      className={cn(
                        'rounded border px-2 py-1 font-mono',
                        resolved.saturator.oversample === oversample
                          ? 'border-foreground/50 bg-secondary text-foreground'
                          : 'border-border',
                      )}
                    >
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
              <TransferGraph
                thresholdDb={resolved.limiter.thresholdDb}
                ratio={20}
                ceilingDb={resolved.limiter.ceilingDb}
                reductionDb={reduction.limiterDb}
                mode="limiter"
              />
              <MasterRange
                label="Threshold"
                value={resolved.limiter.thresholdDb}
                min={-12}
                max={0}
                step={0.1}
                unit=" dB"
                onGestureStart={beginGesture}
                onGestureEnd={endGesture}
                onChange={(thresholdDb) =>
                  patchMaster({
                    enabled: true,
                    limiter: { ...resolved.limiter, enabled: true, thresholdDb },
                  })
                }
              />
              <MasterRange
                label="Ceiling"
                value={resolved.limiter.ceilingDb}
                min={-6}
                max={0}
                step={0.1}
                unit=" dB"
                onGestureStart={beginGesture}
                onGestureEnd={endGesture}
                onChange={(ceilingDb) =>
                  patchMaster({
                    enabled: true,
                    limiter: { ...resolved.limiter, enabled: true, ceilingDb },
                  })
                }
              />
              <MasterRange
                label="Release"
                value={resolved.limiter.releaseSec * 1000}
                min={20}
                max={500}
                step={5}
                unit=" ms"
                onGestureStart={beginGesture}
                onGestureEnd={endGesture}
                onChange={(ms) =>
                  patchMaster({
                    enabled: true,
                    limiter: { ...resolved.limiter, enabled: true, releaseSec: ms / 1000 },
                  })
                }
              />
              <p className="border-l-2 border-border pl-2 text-xs leading-relaxed text-muted-foreground">
                Slot {resolved.order.indexOf('limiter') + 1}. Ceiling caps peaks at this point in
                the rack.
              </p>
            </div>
          ) : null}
        </div>
      </div>

      <div
        className="min-h-0 overflow-y-auto border-l border-border pl-3"
        data-testid="master-output-controls"
      >
        <div className="mb-4 text-[10px] text-muted-foreground">After master inserts</div>
        <div className="flex items-center gap-2">
          <ConsoleFader
            label="Output"
            value={masterBusDb}
            onLiveChange={setOutputTrimLive}
            onGestureStart={beginOutputGesture}
            onGestureEnd={endOutputGesture}
          />
          <div className="shrink-0">
            <AudioMeterPanel
              initialMode="meter"
              allowDockedMixer={false}
              presentation="master-inline"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
