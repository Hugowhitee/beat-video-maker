import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  BookmarkPlus,
  Flame,
  Gauge,
  Power,
  RotateCcw,
  Shield,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  captureSnapshot,
  useTimelineCommandStore,
  useTimelineStore,
} from '@/features/editor/deps/timeline-store'
import { usePlaybackStore } from '@/shared/state/playback'
import {
  MASTERING_PRESETS,
  createSaturationCurve,
  resolveMasterFxSettings,
} from '@/shared/utils/mastering'
import { getSparseAudioEqSettings } from '@/shared/utils/audio-eq'
import type { AudioEqSettings, MasterFxSettings, MasteringPresetId } from '@/types/audio'
import { AudioEqPanelContent } from './properties-sidebar/clip-panel/audio-eq-panel-content'
import type { AudioEqPatch } from './properties-sidebar/clip-panel/audio-eq-curve-editor'
import { getPreviewMasterReduction } from '@/features/editor/deps/composition-runtime'
import { cn } from '@/shared/ui/cn'

type MasterSlot = 'eq' | 'compressor' | 'saturator' | 'limiter'

const SLOT_META: ReadonlyArray<{
  id: MasterSlot
  label: string
  hint: string
  icon: typeof SlidersHorizontal
}> = [
  { id: 'eq', label: 'EQ', hint: 'Tone and cleanup', icon: SlidersHorizontal },
  { id: 'compressor', label: 'Compressor', hint: 'Glue and punch', icon: Activity },
  { id: 'saturator', label: 'Saturator', hint: 'Harmonics and density', icon: Flame },
  { id: 'limiter', label: 'Peak limiter', hint: 'Final peak control', icon: Shield },
]

const SAVED_MASTER_PRESETS_KEY = 'beatvideo:master-presets:v1'

interface SavedMasterPreset {
  id: string
  name: string
  masterFx: MasterFxSettings
  busAudioEq?: AudioEqSettings
  masterBusDb: number
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
        typeof candidate.masterBusDb !== 'number' ||
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
        masterBusDb: candidate.masterBusDb,
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
  return (
    <label className="grid grid-cols-[82px_1fr_62px] items-center gap-2 text-[11px]">
      <span className="text-muted-foreground">{label}</span>
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
        className="min-w-0 accent-foreground"
      />
      <span className="text-right font-mono text-[10px] tabular-nums text-foreground">
        {value.toFixed(step < 0.1 ? 2 : 1)}
        {unit ?? ''}
      </span>
    </label>
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
    <div className="relative h-36 overflow-hidden rounded-md border border-border bg-black/30">
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
        <polyline points={points} fill="none" stroke="currentColor" className="text-foreground" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="absolute left-2 top-2 text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
        {mode === 'compressor' ? 'Transfer' : 'Peak control'}
      </div>
      <div className="absolute bottom-2 right-2 rounded bg-background/80 px-1.5 py-0.5 font-mono text-[10px] text-foreground">
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
    <div className="relative h-36 overflow-hidden rounded-md border border-border bg-black/30">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        <line x1="0" y1="100" x2="100" y2="0" stroke="currentColor" className="text-muted-foreground/35" strokeWidth="0.65" />
        <line x1="50" y1="0" x2="50" y2="100" stroke="currentColor" className="text-border" strokeWidth="0.45" />
        <line x1="0" y1="50" x2="100" y2="50" stroke="currentColor" className="text-border" strokeWidth="0.45" />
        <polyline points={points} fill="none" stroke="currentColor" className="text-foreground" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="absolute left-2 top-2 text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
        Transfer curve
      </div>
    </div>
  )
}

export function BeatvideoMasterPanel() {
  const masterFx = usePlaybackStore((state) => state.masterFx)
  const setMasterFx = usePlaybackStore((state) => state.setMasterFx)
  const masterBusDb = usePlaybackStore((state) => state.masterBusDb)
  const setMasterBusDb = usePlaybackStore((state) => state.setMasterBusDb)
  const busAudioEq = usePlaybackStore((state) => state.busAudioEq)
  const setBusAudioEq = usePlaybackStore((state) => state.setBusAudioEq)
  const resolved = useMemo(() => resolveMasterFxSettings(masterFx), [masterFx])
  const [selectedSlot, setSelectedSlot] = useState<MasterSlot>('eq')
  const [reduction, setReduction] = useState({ compressorDb: 0, limiterDb: 0 })
  const gestureSnapshotRef = useRef<ReturnType<typeof captureSnapshot> | null>(null)
  const [savedPresets, setSavedPresets] = useState<SavedMasterPreset[]>(loadSavedMasterPresets)
  const [savingPreset, setSavingPreset] = useState(false)
  const [presetName, setPresetName] = useState('')

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

      // Built-ins are complete recipes, not deltas over whatever happened to
      // be left in EQ/output. This keeps A/B comparisons repeatable and avoids
      // an old EQ curve making a new preset sound unexpectedly hollow.
      const before = captureSnapshot()
      setBusAudioEq(undefined)
      setMasterBusDb(0)
      setMasterFx(preset.settings)
      markChanged()
      useTimelineCommandStore
        .getState()
        .addUndoEntry({ type: 'APPLY_MASTER_PRESET', payload: { presetId } }, before)
    },
    [markChanged, setBusAudioEq, setMasterBusDb, setMasterFx],
  )

  const applySavedPreset = useCallback(
    (preset: SavedMasterPreset) => {
      const before = captureSnapshot()
      setMasterFx(preset.masterFx)
      setBusAudioEq(preset.busAudioEq)
      setMasterBusDb(preset.masterBusDb)
      markChanged()
      useTimelineCommandStore
        .getState()
        .addUndoEntry({ type: 'APPLY_MASTER_PRESET', payload: { presetId: preset.id } }, before)
    },
    [markChanged, setBusAudioEq, setMasterBusDb, setMasterFx],
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
      ? savedPresets.map((preset) => preset.id === existing.id ? nextPreset : preset)
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

  const resetAll = useCallback(() => {
    const before = captureSnapshot()
    setMasterFx(undefined)
    setBusAudioEq(undefined)
    setMasterBusDb(0)
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

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="shrink-0 border-b border-border px-3 py-3">
        <div className="flex items-center gap-2">
          <Gauge className="h-4 w-4" />
          <div>
            <div className="text-sm font-medium text-foreground">Master</div>
            <div className="text-[10px] text-muted-foreground">Stereo finish · preview = export</div>
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className={cn(
              'ml-auto h-7 w-7',
              resolved.enabled && 'bg-secondary text-foreground',
            )}
            onClick={() =>
              commitMasterFx(
                { ...resolved, enabled: !resolved.enabled },
                'TOGGLE_MASTER_BYPASS',
              )
            }
            aria-label={resolved.enabled ? 'Bypass master FX' : 'Enable master FX'}
            data-tooltip={resolved.enabled ? 'Bypass master FX' : 'Enable master FX'}
          >
            <Power className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={resetAll}
            data-tooltip="Reset master chain"
            aria-label="Reset master chain"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="mt-3 flex gap-1 overflow-x-auto pb-1">
          {MASTERING_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => applyPreset(preset.id)}
              className="shrink-0 rounded-md border border-border bg-secondary/30 px-2 py-1.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground"
              title={preset.description}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {savedPresets.length > 0 ? (
          <div className="mt-2">
            <div className="mb-1 text-[9px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
              My presets
            </div>
            <div className="flex gap-1 overflow-x-auto pb-1">
              {savedPresets.map((preset) => (
                <div
                  key={preset.id}
                  className="flex shrink-0 items-center rounded-md border border-border bg-background"
                >
                  <button
                    type="button"
                    onClick={() => applySavedPreset(preset)}
                    className="px-2 py-1.5 text-[10px] font-medium text-foreground hover:bg-secondary/50"
                    title="Load saved master preset"
                  >
                    {preset.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeSavedPreset(preset.id)}
                    className="flex h-6 w-6 items-center justify-center border-l border-border text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                    aria-label={`Delete ${preset.name} preset`}
                    title="Delete preset"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-2">
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
                className="h-7 min-w-0 flex-1 rounded-md border border-input bg-secondary px-2 text-[10px] text-foreground outline-none focus:border-foreground/40"
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
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => {
                  setSavingPreset(false)
                  setPresetName('')
                }}
                aria-label="Cancel saving preset"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 gap-1.5 px-2 text-[10px] text-muted-foreground"
              onClick={() => setSavingPreset(true)}
            >
              <BookmarkPlus className="h-3.5 w-3.5" />
              Save current preset
            </Button>
          )}
        </div>

        <div className="mt-3 space-y-2 border-t border-border pt-3">
          <MasterRange
            label="Input"
            value={resolved.inputGainDb}
            min={-12}
            max={12}
            step={0.1}
            unit=" dB"
            onGestureStart={beginGesture}
            onGestureEnd={endGesture}
            onChange={(inputGainDb) => patchMaster({ enabled: true, inputGainDb })}
          />
          <MasterRange
            label="Output"
            value={masterBusDb}
            min={-12}
            max={6}
            step={0.1}
            unit=" dB"
            onGestureStart={() => {
              gestureSnapshotRef.current ??= captureSnapshot()
            }}
            onGestureEnd={() => {
              const before = gestureSnapshotRef.current
              gestureSnapshotRef.current = null
              if (!before) return
              useTimelineCommandStore
                .getState()
                .addUndoEntry({ type: 'UPDATE_MASTER_OUTPUT', payload: {} }, before)
            }}
            onChange={(value) => {
              setMasterBusDb(value)
              markChanged()
            }}
          />
        </div>
      </div>

      <div className="grid shrink-0 grid-cols-4 border-b border-border">
        {SLOT_META.map(({ id, label, hint, icon: Icon }) => {
          const enabled = slotEnabled(id)
          return (
            <div
              key={id}
              className={cn(
                'min-w-0 border-r border-border last:border-r-0',
                selectedSlot === id && 'bg-secondary/40',
              )}
            >
              <button
                type="button"
                onClick={() => setSelectedSlot(id)}
                className="flex w-full min-w-0 flex-col items-center gap-1 px-1 py-2 text-center"
                title={hint}
              >
                <Icon className={cn('h-3.5 w-3.5', enabled ? 'text-foreground' : 'text-muted-foreground')} />
                <span className="max-w-full truncate text-[9px] font-medium text-foreground">{label}</span>
              </button>
              <button
                type="button"
                onClick={() => toggleSlot(id)}
                className={cn(
                  'mx-auto mb-1.5 flex h-4 w-4 items-center justify-center rounded-sm border',
                  enabled
                    ? 'border-foreground/50 bg-foreground text-background'
                    : 'border-border text-muted-foreground',
                )}
                aria-label={`${enabled ? 'Bypass' : 'Enable'} ${label}`}
              >
                <Power className="h-2.5 w-2.5" />
              </button>
            </div>
          )
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {selectedSlot === 'eq' ? (
          <AudioEqPanelContent
            targetLabel="Master"
            trackEq={busAudioEq}
            enabled={busAudioEq?.enabled !== false}
            onTrackEqChange={handleBusEqChange}
            onEnabledChange={handleBusEqEnabled}
            layoutMode="compact"
          />
        ) : null}

        {selectedSlot === 'compressor' ? (
          <div className="space-y-3">
            <TransferGraph
              thresholdDb={resolved.compressor.thresholdDb}
              ratio={resolved.compressor.ratio}
              reductionDb={reduction.compressorDb}
              mode="compressor"
            />
            <MasterRange label="Threshold" value={resolved.compressor.thresholdDb} min={-40} max={0} step={0.5} unit=" dB" onGestureStart={beginGesture} onGestureEnd={endGesture} onChange={(thresholdDb) => patchMaster({ enabled: true, compressor: { ...resolved.compressor, enabled: true, thresholdDb } })} />
            <MasterRange label="Ratio" value={resolved.compressor.ratio} min={1} max={12} step={0.1} onGestureStart={beginGesture} onGestureEnd={endGesture} onChange={(ratio) => patchMaster({ enabled: true, compressor: { ...resolved.compressor, enabled: true, ratio } })} />
            <MasterRange label="Knee" value={resolved.compressor.kneeDb} min={0} max={40} step={0.5} unit=" dB" onGestureStart={beginGesture} onGestureEnd={endGesture} onChange={(kneeDb) => patchMaster({ enabled: true, compressor: { ...resolved.compressor, enabled: true, kneeDb } })} />
            <MasterRange label="Attack" value={resolved.compressor.attackSec * 1000} min={0} max={200} step={1} unit=" ms" onGestureStart={beginGesture} onGestureEnd={endGesture} onChange={(ms) => patchMaster({ enabled: true, compressor: { ...resolved.compressor, enabled: true, attackSec: ms / 1000 } })} />
            <MasterRange label="Release" value={resolved.compressor.releaseSec * 1000} min={20} max={800} step={5} unit=" ms" onGestureStart={beginGesture} onGestureEnd={endGesture} onChange={(ms) => patchMaster({ enabled: true, compressor: { ...resolved.compressor, enabled: true, releaseSec: ms / 1000 } })} />
            <MasterRange label="Makeup" value={resolved.compressor.makeupGainDb} min={-6} max={12} step={0.1} unit=" dB" onGestureStart={beginGesture} onGestureEnd={endGesture} onChange={(makeupGainDb) => patchMaster({ enabled: true, compressor: { ...resolved.compressor, enabled: true, makeupGainDb } })} />
          </div>
        ) : null}

        {selectedSlot === 'saturator' ? (
          <div className="space-y-3">
            <SaturationGraph driveDb={resolved.saturator.driveDb} mix={resolved.saturator.mix} />
            <MasterRange label="Drive" value={resolved.saturator.driveDb} min={0} max={18} step={0.1} unit=" dB" onGestureStart={beginGesture} onGestureEnd={endGesture} onChange={(driveDb) => patchMaster({ enabled: true, saturator: { ...resolved.saturator, enabled: true, driveDb } })} />
            <MasterRange label="Mix" value={resolved.saturator.mix * 100} min={0} max={100} step={1} unit="%" onGestureStart={beginGesture} onGestureEnd={endGesture} onChange={(mix) => patchMaster({ enabled: true, saturator: { ...resolved.saturator, enabled: true, mix: mix / 100 } })} />
            <MasterRange label="Output" value={resolved.saturator.outputGainDb} min={-12} max={6} step={0.1} unit=" dB" onGestureStart={beginGesture} onGestureEnd={endGesture} onChange={(outputGainDb) => patchMaster({ enabled: true, saturator: { ...resolved.saturator, enabled: true, outputGainDb } })} />
            <div className="flex items-center justify-between border-t border-border pt-2 text-[10px] text-muted-foreground">
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

        {selectedSlot === 'limiter' ? (
          <div className="space-y-3">
            <TransferGraph thresholdDb={resolved.limiter.thresholdDb} ratio={20} ceilingDb={resolved.limiter.ceilingDb} reductionDb={reduction.limiterDb} mode="limiter" />
            <MasterRange label="Threshold" value={resolved.limiter.thresholdDb} min={-12} max={0} step={0.1} unit=" dB" onGestureStart={beginGesture} onGestureEnd={endGesture} onChange={(thresholdDb) => patchMaster({ enabled: true, limiter: { ...resolved.limiter, enabled: true, thresholdDb } })} />
            <MasterRange label="Ceiling" value={resolved.limiter.ceilingDb} min={-6} max={0} step={0.1} unit=" dB" onGestureStart={beginGesture} onGestureEnd={endGesture} onChange={(ceilingDb) => patchMaster({ enabled: true, limiter: { ...resolved.limiter, enabled: true, ceilingDb } })} />
            <MasterRange label="Release" value={resolved.limiter.releaseSec * 1000} min={20} max={500} step={5} unit=" ms" onGestureStart={beginGesture} onGestureEnd={endGesture} onChange={(ms) => patchMaster({ enabled: true, limiter: { ...resolved.limiter, enabled: true, releaseSec: ms / 1000 } })} />
            <p className="border-l-2 border-border pl-2 text-[10px] leading-relaxed text-muted-foreground">
              Peak limiter combines fast high-ratio compression with a final safety ceiling. It is not a stem-level remix or a look-ahead mastering suite.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  )
}
