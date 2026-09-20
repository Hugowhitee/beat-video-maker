import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ChangeEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';
import { renderComposition } from './features/compositor/renderComposition';
import type {
  BrandLayout,
  BrandPosition,
  CompositionSettings,
  MotionAmount,
  TitleAlign,
  TitleFont,
  VisualPreset,
} from './features/compositor/types';
import {
  buildPeaksAsync,
  decodeAudioFile,
  formatTime,
  loadImageFile,
  makeFixtureCover,
} from './features/media/media';
import {
  detectExportCapability,
  downloadBlob,
  exportVideo,
  safeExportName,
} from './features/export/exportVideo';
import type { ExportCapability } from './features/export/exportVideo';
import { analyzeBeatGrid } from './features/analysis/analyzeBeatGrid';
import { markersForDuration } from './features/analysis/musicalClock';
import type { BeatGridAnalysis, VerifiedGrid } from './features/analysis/types';
import {
  amplitudeAt,
  buildAmplitudeEnvelopeAsync,
} from './features/analysis/audioFeatures';
import type { AmplitudeEnvelope } from './features/analysis/audioFeatures';
import {
  DEFAULT_USER_SETTINGS,
  clearUserSettings,
  loadUserSettings,
  saveUserSettings,
} from './features/project/settings';
import type { UserSettings } from './features/project/settings';
import {
  createTemplate,
  parseTemplate,
  safeTemplateName,
  serializeTemplate,
  settingsFromTemplate,
} from './features/project/template';
import {
  placementFromPoint,
  placementPreset,
  TITLE_PLACEMENT_KEYS,
} from './features/project/titlePlacement';
import type { TitlePlacementKey } from './features/project/titlePlacement';

const fixtureMode = new URLSearchParams(window.location.search).has('fixture');
const storedSettings = fixtureMode ? DEFAULT_USER_SETTINGS : loadUserSettings();

const PRESET_LABELS: Record<VisualPreset, string> = {
  clean: 'Clean',
  ambient: 'Ambient',
  reactive: 'Reactive',
  pulse: 'Pulse',
  visualizer: 'Minimal visualizer',
};

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

type EditorSnapshot = {
  title: string;
  titleSize: number;
  titleX: number;
  titleY: number;
  titleAlign: TitleAlign;
  titleFont: TitleFont;
  titleTracking: number;
  brandText: string;
  brandLayout: BrandLayout;
  brandPosition: BrandPosition;
  brandOpacity: number;
  preset: VisualPreset;
  motion: MotionAmount;
  bpmOverride: string | null;
  barOffset: number | null;
};

function FileControl(props: {
  label: string;
  detail: string;
  accept: string;
  testId: string;
  onChange: (file: File) => void | Promise<void>;
}) {
  return (
    <div className="file-control">
      <div>
        <span className="field-label">{props.label}</span>
        <span className="file-detail">{props.detail}</span>
      </div>
      <label className="small-button">
        Choose
        <input
          data-testid={props.testId}
          className="visually-hidden"
          type="file"
          accept={props.accept}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) void props.onChange(file);
          }}
        />
      </label>
    </div>
  );
}

function SelectControl<T extends string>(props: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string }>;
  testId?: string;
}) {
  return (
    <label className="control">
      <span className="field-label">{props.label}</span>
      <select
        data-testid={props.testId}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value as T)}
      >
        {props.options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const waveformRef = useRef<HTMLDivElement>(null);
  const gridDragPointerRef = useRef<number | null>(null);
  const exportAbortRef = useRef<AbortController | null>(null);
  const audioLoadIdRef = useRef(0);

  const [cover, setCover] = useState<CanvasImageSource | null>(() => fixtureMode ? makeFixtureCover() : null);
  const [coverName, setCoverName] = useState(fixtureMode ? 'visual-qa-fixture' : 'No image');
  const [brandGraphic, setBrandGraphic] = useState<CanvasImageSource | null>(null);
  const [brandGraphicName, setBrandGraphicName] = useState('Text only');
  const [audioUrl, setAudioUrl] = useState('');
  const [audioName, setAudioName] = useState('No audio');
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [peaks, setPeaks] = useState<number[]>([]);
  const [title, setTitle] = useState(fixtureMode ? 'MIDNIGHT STATIC' : '');
  const [titleSize, setTitleSize] = useState(storedSettings.titleSize);
  const [titleX, setTitleX] = useState(storedSettings.titleX);
  const [titleY, setTitleY] = useState(storedSettings.titleY);
  const [titleAlign, setTitleAlign] = useState<TitleAlign>(storedSettings.titleAlign);
  const [titleFont, setTitleFont] = useState<TitleFont>(storedSettings.titleFont);
  const [titleTracking, setTitleTracking] = useState(storedSettings.titleTracking);
  const [brandText, setBrandText] = useState(fixtureMode ? 'prod. usolido' : storedSettings.brandText);
  const [brandLayout, setBrandLayout] = useState<BrandLayout>(storedSettings.brandLayout);
  const [brandPosition, setBrandPosition] = useState<BrandPosition>(storedSettings.brandPosition);
  const [brandOpacity, setBrandOpacity] = useState(storedSettings.brandOpacity);
  const [showGuides, setShowGuides] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [placingTitle, setPlacingTitle] = useState(false);
  const [templateMessage, setTemplateMessage] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [mediaMessage, setMediaMessage] = useState('');
  const [capability, setCapability] = useState<ExportCapability>({
    supported: false,
    container: null,
    extension: null,
    mimeType: null,
    videoCodec: null,
    audioCodec: null,
    label: 'Checking browser encoder…',
  });
  const [exportState, setExportState] = useState<'idle' | 'exporting' | 'done' | 'error' | 'cancelled'>('idle');
  const [exportProgress, setExportProgress] = useState(0);
  const [exportMessage, setExportMessage] = useState('');
  const [analysisState, setAnalysisState] = useState<'idle' | 'analyzing' | 'ready' | 'error'>('idle');
  const [analysis, setAnalysis] = useState<BeatGridAnalysis | null>(null);
  const [manualBpm, setManualBpm] = useState<string | null>(null);
  const [manualBarOffset, setManualBarOffset] = useState<number | null>(null);
  const [gridEditing, setGridEditing] = useState(false);
  const [analysisMessage, setAnalysisMessage] = useState('');
  const [amplitudeEnvelope, setAmplitudeEnvelope] = useState<AmplitudeEnvelope | null>(null);
  const [preset, setPreset] = useState<VisualPreset>(storedSettings.preset);
  const [motion, setMotion] = useState<MotionAmount>(storedSettings.motion);
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installHelpOpen, setInstallHelpOpen] = useState(false);
  const [isInstalled, setIsInstalled] = useState(() =>
    window.matchMedia('(display-mode: standalone)').matches
    || Boolean((navigator as Navigator & { standalone?: boolean }).standalone),
  );
  const historyRef = useRef<{
    present: EditorSnapshot | null;
    undo: EditorSnapshot[];
    redo: EditorSnapshot[];
    applying: boolean;
  }>({ present: null, undo: [], redo: [], applying: false });

  const editorSnapshot = useMemo<EditorSnapshot>(() => ({
    title,
    titleSize,
    titleX,
    titleY,
    titleAlign,
    titleFont,
    titleTracking,
    brandText,
    brandLayout,
    brandPosition,
    brandOpacity,
    preset,
    motion,
    bpmOverride: manualBpm,
    barOffset: manualBarOffset,
  }), [
    brandLayout, brandOpacity, brandPosition, brandText, manualBarOffset, manualBpm, motion, preset,
    title, titleAlign, titleFont, titleSize, titleTracking, titleX, titleY,
  ]);

  useEffect(() => {
    const history = historyRef.current;
    if (history.applying) {
      history.present = editorSnapshot;
      history.applying = false;
      setHistoryState({ canUndo: history.undo.length > 0, canRedo: history.redo.length > 0 });
      return;
    }
    if (history.present === null) {
      history.present = editorSnapshot;
      return;
    }
    if (JSON.stringify(history.present) === JSON.stringify(editorSnapshot)) return;
    history.undo.push(history.present);
    if (history.undo.length > 50) history.undo.shift();
    history.present = editorSnapshot;
    history.redo = [];
    setHistoryState({ canUndo: true, canRedo: false });
  }, [editorSnapshot]);

  const applyEditorSnapshot = useCallback((snapshot: EditorSnapshot) => {
    setTitle(snapshot.title);
    setTitleSize(snapshot.titleSize);
    setTitleX(snapshot.titleX);
    setTitleY(snapshot.titleY);
    setTitleAlign(snapshot.titleAlign);
    setTitleFont(snapshot.titleFont);
    setTitleTracking(snapshot.titleTracking);
    setBrandText(snapshot.brandText);
    setBrandLayout(snapshot.brandLayout);
    setBrandPosition(snapshot.brandPosition);
    setBrandOpacity(snapshot.brandOpacity);
    setPreset(snapshot.preset);
    setMotion(snapshot.motion);
    setManualBpm(snapshot.bpmOverride);
    setManualBarOffset(snapshot.barOffset);
  }, []);

  const undoEditor = useCallback(() => {
    const history = historyRef.current;
    const previous = history.undo.pop();
    if (!previous) return;
    history.redo.push(history.present ?? editorSnapshot);
    history.present = previous;
    history.applying = true;
    applyEditorSnapshot(previous);
    setHistoryState({ canUndo: history.undo.length > 0, canRedo: true });
  }, [applyEditorSnapshot, editorSnapshot]);

  const redoEditor = useCallback(() => {
    const history = historyRef.current;
    const next = history.redo.pop();
    if (!next) return;
    history.undo.push(history.present ?? editorSnapshot);
    history.present = next;
    history.applying = true;
    applyEditorSnapshot(next);
    setHistoryState({ canUndo: true, canRedo: history.redo.length > 0 });
  }, [applyEditorSnapshot, editorSnapshot]);

  const authoringSettings: UserSettings = useMemo(() => ({
    titleSize,
    titleX,
    titleY,
    titleAlign,
    titleFont,
    titleTracking,
    brandText,
    brandLayout,
    brandPosition,
    brandOpacity,
    preset,
    motion,
  }), [
    brandLayout, brandOpacity, brandPosition, brandText, motion, preset,
    titleAlign, titleFont, titleSize, titleTracking, titleX, titleY,
  ]);

  const settings: CompositionSettings = useMemo(() => ({
    title,
    titleSize,
    titleX,
    titleY,
    titleAlign,
    titleFont,
    titleTracking,
    brandText,
    brandGraphic,
    brandLayout,
    brandPosition,
    brandOpacity,
    preset,
    motion,
    showGuides,
    showGrid,
  }), [
    title,
    titleSize,
    titleX,
    titleY,
    titleAlign,
    titleFont,
    titleTracking,
    brandText,
    brandGraphic,
    brandLayout,
    brandPosition,
    brandOpacity,
    preset,
    motion,
    showGuides,
    showGrid,
  ]);

  useEffect(() => {
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
      setInstallHelpOpen(false);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const handleInstall = useCallback(async () => {
    if (!installPrompt) {
      setInstallHelpOpen((open) => !open);
      return;
    }

    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);
    if (choice.outcome === 'accepted') setInstallHelpOpen(false);
  }, [installPrompt]);

  useEffect(() => {
    if (fixtureMode) return;
    saveUserSettings(authoringSettings);
  }, [authoringSettings]);

  const resetStyle = () => {
    clearUserSettings();
    setTitleSize(DEFAULT_USER_SETTINGS.titleSize);
    setTitleX(DEFAULT_USER_SETTINGS.titleX);
    setTitleY(DEFAULT_USER_SETTINGS.titleY);
    setTitleAlign(DEFAULT_USER_SETTINGS.titleAlign);
    setTitleFont(DEFAULT_USER_SETTINGS.titleFont);
    setTitleTracking(DEFAULT_USER_SETTINGS.titleTracking);
    setBrandText(DEFAULT_USER_SETTINGS.brandText);
    setBrandLayout(DEFAULT_USER_SETTINGS.brandLayout);
    setBrandPosition(DEFAULT_USER_SETTINGS.brandPosition);
    setBrandOpacity(DEFAULT_USER_SETTINGS.brandOpacity);
    setPreset(DEFAULT_USER_SETTINGS.preset);
    setMotion(DEFAULT_USER_SETTINGS.motion);
  };

  const applyTitlePlacement = (key: TitlePlacementKey) => {
    const placement = placementPreset(key);
    setTitleX(placement.x);
    setTitleY(placement.y);
    setTitleAlign(placement.align);
  };

  const saveTemplateFile = () => {
    const template = createTemplate(title, authoringSettings);
    downloadBlob(
      new Blob([serializeTemplate(template)], { type: 'application/json' }),
      safeTemplateName(title),
    );
    setTemplateMessage('Editable template saved.');
  };

  const handleTemplate = async (file: File) => {
    setTemplateMessage('');
    try {
      const parsed = parseTemplate(await file.text());
      const next = settingsFromTemplate(parsed);

      setTitle(parsed.title.text);
      setTitleSize(next.titleSize);
      setTitleX(next.titleX);
      setTitleY(next.titleY);
      setTitleAlign(next.titleAlign);
      setTitleFont(next.titleFont);
      setTitleTracking(next.titleTracking);
      setBrandText(next.brandText);
      setBrandLayout(next.brandLayout);
      setBrandPosition(next.brandPosition);
      setBrandOpacity(next.brandOpacity);
      setPreset(next.preset);
      setMotion(next.motion);
      setBrandGraphic(null);
      setBrandGraphicName('Text only');
      setPlacingTitle(false);
      setTemplateMessage('Opened ' + file.name);
    } catch (error) {
      setTemplateMessage(
        error instanceof Error ? error.message : 'Could not open template.',
      );
    }
  };

  const handlePreviewClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!placingTitle) {
      void togglePlayback();
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const placement = placementFromPoint(event.clientX, event.clientY, rect);
    setTitleX(placement.x);
    setTitleY(placement.y);
    setTitleAlign(placement.align);
    setPlacingTitle(false);
  };

  const resolveGrid = useCallback((): VerifiedGrid | null => {
    const parsedManualBpm = manualBpm === null ? Number.NaN : Number(manualBpm);
    const effectiveBpm =
      manualBpm !== null
      && Number.isFinite(parsedManualBpm)
      && parsedManualBpm >= 40
      && parsedManualBpm <= 260
        ? parsedManualBpm
        : analysis?.bpm ?? null;
    const effectiveBeatOffset = manualBarOffset ?? analysis?.beatOffset ?? null;

    if (effectiveBpm === null || effectiveBeatOffset === null) return null;

    return {
      bpm: effectiveBpm,
      beatOffset: effectiveBeatOffset,
      barOffset: manualBarOffset,
      source:
        manualBarOffset !== null || manualBpm !== null
          ? 'manual'
          : 'auto',
    };
  }, [analysis, manualBarOffset, manualBpm]);

  useEffect(() => {
    let active = true;
    void detectExportCapability()
      .then((next) => {
        if (active) setCapability(next);
      })
      .catch((error: unknown) => {
        if (active) {
          setCapability({
            supported: false,
            container: null,
            extension: null,
            mimeType: null,
            videoCodec: null,
            audioCodec: null,
            label: error instanceof Error ? error.message : 'Encoder check failed',
          });
        }
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!audioUrl) return undefined;
    return () => URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  const renderPreview = useCallback((time = currentTime) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;
    renderComposition(ctx, {
      source: cover,
      width: canvas.width,
      height: canvas.height,
      time,
      settings,
      grid: resolveGrid(),
      audioLevel: amplitudeAt(amplitudeEnvelope, time),
    });
    canvas.dataset.rendered = 'true';
  }, [amplitudeEnvelope, cover, currentTime, resolveGrid, settings]);

  useEffect(() => {
    renderPreview();
  }, [renderPreview]);

  useEffect(() => {
    if (!isPlaying) return undefined;
    let frame = 0;
    const tick = () => {
      const audio = audioRef.current;
      if (!audio || audio.paused || audio.ended) {
        setIsPlaying(false);
        return;
      }
      setCurrentTime(audio.currentTime);
      renderPreview(audio.currentTime);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [isPlaying, renderPreview]);

  const handleCover = async (file: File) => {
    setMediaMessage('');
    try {
      setCover(await loadImageFile(file));
      setCoverName(file.name);
    } catch (error) {
      setMediaMessage(error instanceof Error ? error.message : 'Could not load image.');
    }
  };

  const handleBrandGraphic = async (file: File) => {
    setMediaMessage('');
    try {
      setBrandGraphic(await loadImageFile(file));
      setBrandGraphicName(file.name);
    } catch (error) {
      setMediaMessage(error instanceof Error ? error.message : 'Could not load watermark.');
    }
  };

  const handleAudio = async (file: File) => {
    const loadId = audioLoadIdRef.current + 1;
    audioLoadIdRef.current = loadId;

    audioRef.current?.pause();
    setIsPlaying(false);
    setAudioUrl('');
    setAudioBuffer(null);
    setPeaks([]);
    setAmplitudeEnvelope(null);
    setAnalysis(null);
    setManualBpm(null);
    setManualBarOffset(null);
    setGridEditing(false);
    setAnalysisState('idle');
    setAnalysisMessage('');
    setCurrentTime(0);
    setMediaMessage('Decoding audio…');

    try {
      const decoded = await decodeAudioFile(file);
      if (audioLoadIdRef.current !== loadId) return;

      const nextUrl = URL.createObjectURL(file);
      setAudioUrl(nextUrl);
      setAudioBuffer(decoded);
      setAudioName(file.name);
      setAnalysisState('analyzing');
      setAnalysisMessage('Analyzing tempo and beat phase…');
      setMediaMessage('Audio ready · ' + decoded.duration.toFixed(1) + ' s');

      void Promise.all([
        buildPeaksAsync(decoded),
        buildAmplitudeEnvelopeAsync(decoded),
      ])
        .then(([nextPeaks, nextEnvelope]) => {
          if (audioLoadIdRef.current !== loadId) return;
          setPeaks(nextPeaks);
          setAmplitudeEnvelope(nextEnvelope);
        })
        .catch(() => {
          // Playback/export can continue even if non-essential preview features fail.
        });

      void analyzeBeatGrid(decoded)
        .then((result) => {
          if (audioLoadIdRef.current !== loadId) return;
          setAnalysis(result);
          setManualBpm(null);
          setManualBarOffset(result.barConfidence >= 0.35 ? result.barOffset : null);
          setAnalysisState('ready');
          setAnalysisMessage(
            result.bpm === null
              ? 'Tempo uncertain · enter BPM manually.'
              : result.confidence.toUpperCase() + ' confidence · ' + result.bpm.toFixed(1) + ' BPM',
          );
        })
        .catch((analysisError: unknown) => {
          if (audioLoadIdRef.current !== loadId) return;
          setAnalysisState('error');
          setAnalysisMessage(
            analysisError instanceof Error ? analysisError.message : 'Beat analysis failed.',
          );
        });
    } catch (error) {
      if (audioLoadIdRef.current !== loadId) return;
      setMediaMessage(error instanceof Error ? error.message : 'Could not load audio.');
    }
  };

  const togglePlayback = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;
    if (audio.paused) {
      try {
        await audio.play();
        setIsPlaying(true);
      } catch {
        setMediaMessage('Playback was blocked by the browser.');
      }
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  }, [audioUrl]);

  const seekTo = useCallback((value: number) => {
    const maxTime = audioBuffer?.duration || 0;
    const nextTime = Math.max(0, Math.min(value, maxTime));
    const audio = audioRef.current;
    if (audio) audio.currentTime = nextTime;
    setCurrentTime(nextTime);
    renderPreview(nextTime);
  }, [audioBuffer, renderPreview]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isFormTarget = Boolean(target?.matches('input, textarea, select, button, [contenteditable="true"]'));
      const command = event.ctrlKey || event.metaKey;

      if (command && !isFormTarget) {
        const key = event.key.toLowerCase();
        if (key === 'z') {
          event.preventDefault();
          if (event.shiftKey) redoEditor();
          else undoEditor();
          return;
        }
        if (key === 'y') {
          event.preventDefault();
          redoEditor();
          return;
        }
      }

      if (isFormTarget) return;

      if (event.code === 'Space') {
        event.preventDefault();
        void togglePlayback();
        return;
      }

      if (event.key === 'Home' && audioBuffer) {
        event.preventDefault();
        seekTo(0);
        return;
      }

      if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && audioBuffer) {
        event.preventDefault();
        const direction = event.key === 'ArrowRight' ? 1 : -1;

        if (gridEditing && manualBarOffset !== null) {
          const step = event.shiftKey ? 0.02 : 0.002;
          setManualBarOffset(Math.max(0, Math.min(audioBuffer.duration, manualBarOffset + direction * step)));
          return;
        }

        const grid = resolveGrid();
        const step = event.shiftKey && grid ? 240 / grid.bpm : 1;
        seekTo(currentTime + direction * step);
        return;
      }

      if (event.key.toLowerCase() === 'b' && audioBuffer) {
        event.preventDefault();
        setManualBarOffset(currentTime);
        setAnalysisMessage('Manual bar 1 · ' + currentTime.toFixed(3) + ' s');
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [audioBuffer, currentTime, gridEditing, manualBarOffset, redoEditor, resolveGrid, seekTo, togglePlayback, undoEditor]);

  const seek = (event: ChangeEvent<HTMLInputElement>) => {
    seekTo(Number(event.target.value));
  };

  const adjustTempo = (factor: number) => {
    const detected = analysis?.bpm ?? Number.NaN;
    const current = manualBpm !== null && manualBpm.trim() ? Number(manualBpm) : detected;
    const next = Math.round(current * factor * 10) / 10;
    if (!Number.isFinite(next) || next < 40 || next > 260) return;
    setManualBpm(String(next));
    setAnalysisMessage('Manual tempo · ' + next.toFixed(1) + ' BPM');
  };

  const waveformTimeFromClientX = useCallback((clientX: number) => {
    const waveform = waveformRef.current;
    const maxTime = audioBuffer?.duration ?? 0;
    if (!waveform || maxTime <= 0) return 0;
    const rect = waveform.getBoundingClientRect();
    const ratio = rect.width <= 0 ? 0 : (clientX - rect.left) / rect.width;
    return Math.max(0, Math.min(maxTime, ratio * maxTime));
  }, [audioBuffer]);

  const setDownbeatAtPlayhead = useCallback(() => {
    if (!audioBuffer) return;
    setManualBarOffset(currentTime);
    setAnalysisMessage('First downbeat set at ' + currentTime.toFixed(3) + ' s');
  }, [audioBuffer, currentTime]);

  const resetGridCorrection = useCallback(() => {
    setManualBpm(null);
    setManualBarOffset(null);
    setAnalysisMessage(
      analysis?.bpm === null || analysis?.bpm === undefined
        ? 'Tempo uncertain · enter BPM manually.'
        : analysis.confidence + ' confidence · detector ' + analysis.bpm.toFixed(1) + ' BPM',
    );
  }, [analysis]);

  const handleWaveformPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!audioBuffer) return;
    const time = waveformTimeFromClientX(event.clientX);

    if (!gridEditing) {
      seekTo(time);
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    gridDragPointerRef.current = event.pointerId;
    setManualBarOffset(time);
  }, [audioBuffer, gridEditing, seekTo, waveformTimeFromClientX]);

  const handleWaveformPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (
      !gridEditing
      || gridDragPointerRef.current !== event.pointerId
      || !audioBuffer
    ) return;

    event.preventDefault();
    setManualBarOffset(waveformTimeFromClientX(event.clientX));
  }, [audioBuffer, gridEditing, waveformTimeFromClientX]);

  const handleWaveformPointerEnd = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (gridDragPointerRef.current !== event.pointerId) return;
    gridDragPointerRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const cancelExport = () => {
    exportAbortRef.current?.abort();
    setExportMessage('Stopping export…');
  };

  const handleExport = async () => {
    if (!cover || !audioBuffer || !capability.supported || exportState === 'exporting') return;

    const controller = new AbortController();
    exportAbortRef.current = controller;
    setExportState('exporting');
    setExportProgress(0);
    setExportMessage('Rendering 1080p frames locally…');

    try {
      const result = await exportVideo({
        source: cover,
        audioBuffer,
        settings,
        capability,
        title,
        grid: resolveGrid(),
        amplitudeEnvelope,
        signal: controller.signal,
        onProgress: setExportProgress,
      });

      downloadBlob(
        result.blob,
        safeExportName(title, result.extension),
        result.release,
      );
      setExportState('done');
      setExportMessage(
        result.extension.toUpperCase()
        + ' encoded and downloaded · '
        + (result.blob.size / 1_000_000).toFixed(1)
        + ' MB'
        + (result.targetKind === 'opfs' ? ' · disk-backed render' : ''),
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setExportState('cancelled');
        setExportMessage('Export cancelled · no partial file kept.');
      } else {
        setExportState('error');
        setExportMessage(error instanceof Error ? error.message : 'Export failed.');
      }
    } finally {
      exportAbortRef.current = null;
    }
  };

  const duration = audioBuffer?.duration || 0;
  const verifiedGrid = resolveGrid();
  const effectiveBpm = verifiedGrid?.bpm ?? null;
  const beatMarkers = verifiedGrid && duration > 0
    ? markersForDuration(duration, verifiedGrid).slice(0, 600)
    : [];
  const barPeriod = effectiveBpm ? 240 / effectiveBpm : null;
  const isBarMarker = (time: number) => {
    if (manualBarOffset === null || barPeriod === null) return false;
    const remainder = ((time - manualBarOffset) % barPeriod + barPeriod) % barPeriod;
    return Math.min(remainder, barPeriod - remainder) < 0.02;
  };
  const exportReady = Boolean(cover && audioBuffer && capability.supported);
  const bpmInputValue = manualBpm
    ?? (analysis?.bpm === null || analysis?.bpm === undefined ? '' : analysis.bpm.toFixed(1));
  const gridHasCorrection = manualBpm !== null || manualBarOffset !== null;
  const gridConfidenceText =
    analysisState === 'analyzing'
      ? 'Analyzing…'
      : analysisState === 'error'
        ? 'Analysis failed'
        : analysis?.bpm === null || analysis?.bpm === undefined
          ? 'Tempo not detected'
          : analysis.confidence + ' confidence';
  const downbeatText = manualBarOffset === null
    ? 'First downbeat not set'
    : 'Downbeat ' + manualBarOffset.toFixed(3) + ' s';

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">B</span>
          <div>
            <strong>Beatvideo Maker</strong>
            <span>local compositor</span>
          </div>
        </div>
        <div className="topbar-actions">
          {!isInstalled && (
            <div className="install-control">
              <button
                data-testid="install-button"
                className="install-button"
                type="button"
                aria-expanded={installHelpOpen}
                aria-haspopup="dialog"
                onClick={() => void handleInstall()}
              >
                Install app
              </button>
              {installHelpOpen && (
                <div className="install-popover" role="dialog" aria-label="Install Beatvideo Maker" data-testid="install-help">
                  <strong>Install Beatvideo Maker</strong>
                  <p>In Chrome or Edge, use the install icon in the address bar. If it is not shown, open the browser menu and choose the install-app option; wording can vary by browser.</p>
                  <p>Use the hosted HTTPS version; do not download the GitHub ZIP or run npm for normal use. After the first successful load, the installed app shell can reopen offline; imported media still stays on this device.</p>
                  <button type="button" className="link-button" onClick={() => setInstallHelpOpen(false)}>Close</button>
                </div>
              )}
            </div>
          )}
          <div className="history-actions" aria-label="Edit history">
            <button data-testid="undo-button" className="history-button" type="button" disabled={!historyState.canUndo} onClick={undoEditor}>Undo</button>
            <button data-testid="redo-button" className="history-button" type="button" disabled={!historyState.canRedo} onClick={redoEditor}>Redo</button>
          </div>
          <span className="output-pill">1080p · 30 fps</span>
          <button
            data-testid="export-button"
            className={'primary-button ' + (exportState === 'exporting' ? 'is-cancel' : '')}
            disabled={exportState !== 'exporting' && !exportReady}
            onClick={() => {
              if (exportState === 'exporting') cancelExport();
              else void handleExport();
            }}
          >
            {exportState === 'exporting'
              ? 'Cancel ' + Math.round(exportProgress * 100) + '%'
              : capability.container === 'webm'
                ? 'Export WebM'
                : 'Export MP4'}
          </button>
        </div>
      </header>

      <section className="workspace">
        <aside className="panel inputs-panel" aria-label="Inputs">
          <div className="panel-heading">
            <span className="eyebrow">01</span>
            <div><h2>Inputs</h2><p>Keep source media on this device.</p></div>
          </div>

          <FileControl label="Cover image" detail={coverName} accept="image/png,image/jpeg,image/webp" testId="cover-input" onChange={handleCover} />
          <FileControl label="Beat" detail={audioName} accept="audio/*,.wav,.mp3,.m4a,.flac" testId="audio-input" onChange={handleAudio} />

          <label className="control">
            <span className="field-label">Title</span>
            <input
              name="title"
              data-testid="title-input"
              value={title}
              maxLength={80}
              placeholder="Beat title"
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>

          <label className="control">
            <span className="field-label">Producer / watermark</span>
            <input
              data-testid="brand-input"
              value={brandText}
              maxLength={60}
              placeholder="prod. name"
              disabled={Boolean(brandGraphic) && brandLayout === 'corner'}
              onChange={(event) => setBrandText(event.target.value)}
            />
          </label>

          <FileControl
            label="Watermark graphic"
            detail={brandGraphicName}
            accept="image/png,image/svg+xml"
            testId="brand-graphic-input"
            onChange={handleBrandGraphic}
          />
          {brandGraphic && (
            <button className="link-button" onClick={() => {
              setBrandGraphic(null);
              setBrandGraphicName('Text only');
            }}>
              Use text watermark instead
            </button>
          )}

          {mediaMessage && <p className="status-message" role="status">{mediaMessage}</p>}
        </aside>

        <section className="preview-column" aria-label="Preview">
          <div className="preview-header">
            <div>
              <span className="eyebrow">{PRESET_LABELS[preset].toUpperCase()}</span>
              <h1>{title.trim() || 'Untitled beat'}</h1>
            </div>
            <div className="preview-tools" aria-label="Preview overlays">
              <button
                data-testid="safe-guides-toggle"
                className={'guide-toggle ' + (showGuides ? 'is-active' : '')}
                aria-pressed={showGuides}
                onClick={() => setShowGuides((value) => !value)}
              >
                Safe
              </button>
              <button
                data-testid="grid-guides-toggle"
                className={'guide-toggle ' + (showGrid ? 'is-active' : '')}
                aria-pressed={showGrid}
                onClick={() => setShowGrid((value) => !value)}
              >
                Grid
              </button>
            </div>
          </div>

          <div
            className="canvas-shell"
            data-testid="preview-shell"
            onClick={handlePreviewClick}
          >
            <canvas
              ref={canvasRef}
              data-testid="preview-canvas"
              className={placingTitle ? 'is-placing-title' : ''}
              width={1280}
              height={720}
              aria-label={placingTitle ? 'Click to place title' : '16 by 9 video preview'}
            />
            {placingTitle ? (
              <div className="canvas-placement-hint" data-testid="title-placement-hint">
                Click the preview to place the title
              </div>
            ) : null}
            {!cover && (
              <div className="empty-overlay">
                <span>Add a cover image</span>
                <small>JPG · PNG · WebP</small>
              </div>
            )}
          </div>

          <div className="transport">
            <button
              className="play-button"
              disabled={!audioUrl}
              aria-label={isPlaying ? 'Pause' : 'Play'}
              onClick={() => void togglePlayback()}
            >
              {isPlaying ? 'Ⅱ' : '▶'}
            </button>
            <span className="timecode">{formatTime(currentTime)} / {formatTime(duration)}</span>
            <input
              className="seek"
              data-testid="seek-input"
              aria-label="Playback position"
              type="range"
              min={0}
              max={duration || 1}
              step={0.01}
              value={Math.min(currentTime, duration || 1)}
              disabled={!audioBuffer}
              onChange={seek}
            />
          </div>

          <div
            ref={waveformRef}
            className={'waveform-shell ' + (gridEditing ? 'is-grid-editing' : '')}
            data-testid="waveform-editor"
            aria-label={gridEditing ? 'Beat-grid alignment waveform' : 'Audio waveform'}
            onPointerDown={handleWaveformPointerDown}
            onPointerMove={handleWaveformPointerMove}
            onPointerUp={handleWaveformPointerEnd}
            onPointerCancel={handleWaveformPointerEnd}
          >
            <div className="waveform">
              {peaks.length > 0 ? peaks.map((peak, index) => (
                <span key={index} style={{ height: Math.max(8, peak * 42) }} />
              )) : <p>Waveform appears after audio is decoded.</p>}
            </div>
            <div className="beat-markers" aria-hidden="true">
              {beatMarkers.map((time, index) => (
                <span
                  key={index}
                  className={isBarMarker(time) ? 'is-bar' : ''}
                  style={{ left: (time / Math.max(duration, 0.001) * 100) + '%' }}
                />
              ))}
            </div>
            {duration > 0 ? (
              <span
                className="waveform-playhead"
                aria-hidden="true"
                style={{ left: (currentTime / Math.max(duration, 0.001) * 100) + '%' }}
              />
            ) : null}
            {manualBarOffset !== null && duration > 0 ? (
              <span
                className="downbeat-handle"
                data-testid="downbeat-handle"
                aria-hidden="true"
                style={{ left: (manualBarOffset / duration * 100) + '%' }}
              >
                <b>1</b>
              </span>
            ) : null}
          </div>

          {audioBuffer && (
            <section className="grid-strip" data-testid="grid-strip" aria-label="Beat alignment">
              <div className="grid-readout">
                <label className="bpm-editor">
                  <span>Tempo</span>
                  <span className="bpm-field">
                    <input
                      data-testid="bpm-input"
                      type="number"
                      min={40}
                      max={260}
                      step={0.1}
                      value={bpmInputValue}
                      placeholder="—"
                      onChange={(event) => setManualBpm(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter') return;
                        const bpm = Number(event.currentTarget.value);
                        if (Number.isFinite(bpm) && bpm >= 40 && bpm <= 260) {
                          setManualBpm(event.currentTarget.value);
                          setAnalysisMessage('Manual tempo · ' + bpm.toFixed(1) + ' BPM');
                        }
                        event.currentTarget.blur();
                      }}
                    />
                    <em>BPM</em>
                  </span>
                </label>
                <div className="grid-state">
                  <strong data-testid="grid-confidence">{gridConfidenceText}</strong>
                  <span data-testid="bar-offset">{downbeatText}</span>
                </div>
              </div>

              <div className="grid-actions">
                <button
                  data-testid="grid-edit-toggle"
                  type="button"
                  className={'grid-action ' + (gridEditing ? 'is-active' : '')}
                  aria-pressed={gridEditing}
                  onClick={(event) => {
                    setGridEditing((value) => !value);
                    event.currentTarget.blur();
                  }}
                >
                  {gridEditing ? 'Done' : 'Edit grid'}
                </button>
                <button
                  data-testid="bpm-half"
                  className="grid-action"
                  type="button"
                  onClick={() => adjustTempo(0.5)}
                >
                  ½
                </button>
                <button
                  data-testid="bpm-double"
                  className="grid-action"
                  type="button"
                  onClick={() => adjustTempo(2)}
                >
                  ×2
                </button>
                <button
                  data-testid="set-downbeat"
                  className="grid-action"
                  type="button"
                  onClick={setDownbeatAtPlayhead}
                >
                  Set downbeat
                </button>
                <button
                  data-testid="grid-reset"
                  className="grid-action is-quiet"
                  type="button"
                  disabled={!gridHasCorrection}
                  onClick={resetGridCorrection}
                >
                  Reset
                </button>
              </div>

              {gridEditing ? (
                <p className="grid-help">
                  Click or drag on the waveform to place the first downbeat. Arrow keys fine-adjust the marker; Shift makes a larger move.
                </p>
              ) : analysisState === 'error' ? (
                <p className="grid-help is-error">{analysisMessage || 'Beat analysis failed.'}</p>
              ) : null}
            </section>
          )}

          <div className="export-status" data-testid="export-status">
            <span className={'status-dot ' + (capability.supported ? 'ok' : '')} />
            <div>
              <strong>{capability.label}</strong>
              <small>
                {exportMessage || (exportReady
                  ? 'Ready for deterministic local export.'
                  : 'Add an image and audio file to export.')}
              </small>
            </div>
          </div>

          {audioUrl && (
            <audio
              ref={audioRef}
              src={audioUrl}
              onEnded={() => {
                setIsPlaying(false);
                setCurrentTime(duration);
              }}
              onPause={() => setIsPlaying(false)}
            />
          )}
        </section>

        <aside className="panel style-panel" aria-label="Style">
          <div className="panel-heading">
            <span className="eyebrow">02</span>
            <div><h2>Style</h2><p>One preset, useful controls.</p></div>
          </div>

          <div className="preset-list" data-testid="preset-list">
            {([
              ['clean', 'Clean', 'Photo first · nearly still'],
              ['ambient', 'Ambient', 'Slow background drift'],
              ['reactive', 'Reactive', 'Real amplitude accent'],
              ['pulse', 'Pulse', '8-bar phrase curve'],
              ['visualizer', 'Minimal visualizer', 'Small amplitude line'],
            ] as Array<[VisualPreset, string, string]>).map(([value, label, description]) => (
              <button
                key={value}
                type="button"
                data-testid={'preset-' + value}
                className={'preset-card ' + (preset === value ? 'is-selected' : '')}
                onClick={() => setPreset(value)}
              >
                <div className={'preset-swatch preset-' + value} />
                <div><strong>{label}</strong><span>{description}</span></div>
                <span className="check">{preset === value ? '✓' : ''}</span>
              </button>
            ))}
          </div>

          <div className="control-group">
            <h3>Motion</h3>
            <SelectControl
              label="Amount"
              value={motion}
              onChange={setMotion}
              testId="motion-amount"
              options={[
                { value: 'off', label: 'Off' },
                { value: 'low', label: 'Low' },
                { value: 'medium', label: 'Medium' },
              ]}
            />
            {verifiedGrid?.barOffset == null && (preset === 'ambient' || preset === 'pulse') ? (
              <p className="control-hint">Verify bar 1 to enable bar-synchronised motion.</p>
            ) : null}
          </div>

          <div className="control-group">
            <h3>Text</h3>
            <SelectControl
              label="Font direction"
              value={titleFont}
              onChange={setTitleFont}
              testId="title-font"
              options={[
                { value: 'clean', label: 'Clean grotesk' },
                { value: 'condensed', label: 'Condensed' },
                { value: 'serif', label: 'Editorial serif' },
                { value: 'mono', label: 'Technical mono' },
              ]}
            />
            <label className="range-control">
              <span><span>Title size</span><output>{titleSize}px</output></span>
              <input
                data-testid="title-size"
                type="range"
                min={36}
                max={86}
                value={titleSize}
                onChange={(event) => setTitleSize(Number(event.target.value))}
              />
            </label>
            <label className="range-control">
              <span><span>Tracking</span><output>{titleTracking >= 0 ? '+' : ''}{titleTracking}px</output></span>
              <input
                data-testid="title-tracking"
                type="range"
                min={-2}
                max={8}
                step={1}
                value={titleTracking}
                onChange={(event) => setTitleTracking(Number(event.target.value))}
              />
            </label>
            <div className="title-placement-control">
              <span className="field-label">Quick position</span>
              <div className="title-position-grid" data-testid="title-position-grid">
                {TITLE_PLACEMENT_KEYS.map((key) => {
                  const placement = placementPreset(key);
                  const active =
                    Math.abs(titleX - placement.x) < 0.001
                    && Math.abs(titleY - placement.y) < 0.001
                    && titleAlign === placement.align;
                  return (
                    <button
                      key={key}
                      type="button"
                      className={active ? 'is-active' : ''}
                      data-testid={'title-position-' + key}
                      aria-label={key.replace('-', ' ')}
                      aria-pressed={active}
                      onClick={() => applyTitlePlacement(key)}
                    >
                      <span />
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                className={'small-button place-title-button ' + (placingTitle ? 'is-active' : '')}
                data-testid="place-title"
                aria-pressed={placingTitle}
                onClick={() => {
                  const nextPlacing = !placingTitle;
                  setPlacingTitle(nextPlacing);
                  if (nextPlacing) {
                    setShowGuides(true);
                    setShowGrid(true);
                  }
                }}
              >
                {placingTitle ? 'Cancel placement' : 'Place on canvas'}
              </button>
            </div>

            <div className="title-align-control">
              <span className="field-label">Alignment</span>
              <div className="segmented-control" aria-label="Title alignment">
                {(['left', 'center', 'right'] as TitleAlign[]).map((align) => (
                  <button
                    key={align}
                    type="button"
                    data-testid={'title-align-' + align}
                    className={titleAlign === align ? 'is-active' : ''}
                    aria-pressed={titleAlign === align}
                    onClick={() => setTitleAlign(align)}
                  >
                    {align === 'left' ? 'L' : align === 'center' ? 'C' : 'R'}
                  </button>
                ))}
              </div>
            </div>

            <div className="coordinate-controls">
              <label className="compact-coordinate">
                <span>X</span>
                <input
                  data-testid="title-x"
                  type="number"
                  min={2}
                  max={98}
                  step={0.1}
                  value={Math.round(titleX * 1000) / 10}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    if (Number.isFinite(value)) setTitleX(Math.max(0.02, Math.min(0.98, value / 100)));
                  }}
                />
                <em>%</em>
              </label>
              <label className="compact-coordinate">
                <span>Y</span>
                <input
                  data-testid="title-y"
                  type="number"
                  min={6}
                  max={94}
                  step={0.1}
                  value={Math.round(titleY * 1000) / 10}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    if (Number.isFinite(value)) setTitleY(Math.max(0.06, Math.min(0.94, value / 100)));
                  }}
                />
                <em>%</em>
              </label>
            </div>
          </div>

          <div className="control-group">
            <h3>Brand</h3>
            <SelectControl
              label="Layout"
              value={brandLayout}
              onChange={setBrandLayout}
              testId="brand-layout"
              options={[
                { value: 'corner', label: 'Corner' },
                { value: 'grid', label: 'Watermark grid' },
              ]}
            />
            {brandLayout === 'corner' ? (
              <SelectControl
                label="Corner"
                value={brandPosition}
                onChange={setBrandPosition}
                options={[
                  { value: 'top-right', label: 'Top right' },
                  { value: 'top-left', label: 'Top left' },
                  { value: 'bottom-right', label: 'Bottom right' },
                  { value: 'bottom-left', label: 'Bottom left' },
                ]}
              />
            ) : (
              <p className="control-hint">Grid repeats the text subtly across the sharp cover. Uploaded graphics stay available for Corner.</p>
            )}
            <label className="range-control">
              <span><span>{brandLayout === 'grid' ? 'Grid strength' : 'Opacity'}</span><output>{Math.round(brandOpacity * 100)}%</output></span>
              <input
                data-testid="brand-opacity"
                type="range"
                min={0.2}
                max={1}
                step={0.05}
                value={brandOpacity}
                onChange={(event) => setBrandOpacity(Number(event.target.value))}
              />
            </label>
          </div>

          <div className="scope-note">
            <strong>Templates</strong>
            <p>Save this look as an editable local template. Source media is never embedded.</p>
            <div className="template-actions">
              <button
                type="button"
                className="small-button"
                data-testid="save-template"
                onClick={saveTemplateFile}
              >
                Save template
              </button>
              <label className="small-button">
                Open template
                <input
                  data-testid="template-input"
                  className="visually-hidden"
                  type="file"
                  accept=".json,application/json"
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    if (file) void handleTemplate(file);
                    event.currentTarget.value = '';
                  }}
                />
              </label>
            </div>
            {templateMessage ? (
              <p className="template-message" data-testid="template-message" role="status">{templateMessage}</p>
            ) : null}
            <button type="button" className="link-button" data-testid="reset-settings" onClick={resetStyle}>
              Reset style defaults
            </button>
          </div>
        </aside>
      </section>
    </main>
  );
}

export default App;
