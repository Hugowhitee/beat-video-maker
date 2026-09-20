import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { renderComposition } from './features/compositor/renderComposition';
import type {
  BrandLayout,
  BrandPosition,
  CompositionSettings,
  MotionAmount,
  TitleFont,
  TitlePosition,
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
  titlePosition: TitlePosition;
  titleFont: TitleFont;
  titleTracking: number;
  brandText: string;
  brandLayout: BrandLayout;
  brandPosition: BrandPosition;
  brandOpacity: number;
  preset: VisualPreset;
  motion: MotionAmount;
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

function AppMark() {
  return (
    <svg viewBox="0 0 15 15" aria-hidden="true">
      <path
        d="M1.59979 8.82434C1.59991 8.32473 2.10284 7.99678 2.54999 8.17004L2.63885 8.21204L6.57245 10.3878L6.65741 10.4425C7.02571 10.7193 7.02591 11.282 6.65741 11.5587L6.57245 11.6134L2.63885 13.7892C2.17257 14.0469 1.60035 13.7095 1.59979 13.1769V8.82434ZM13.0002 8.29993C13.3867 8.30002 13.7004 8.61358 13.7004 9.00012V13.0001C13.7003 13.3866 13.3867 13.7002 13.0002 13.7003H9.00018C8.61362 13.7003 8.30004 13.3867 8.29999 13.0001V9.00012C8.29999 8.61352 8.61358 8.29993 9.00018 8.29993H13.0002ZM2.50018 12.8361L5.81952 11.0001L2.50018 9.16321V12.8361ZM9.20038 12.7999H12.8V9.20032H9.20038V12.7999ZM4.00018 1.24915C5.51931 1.24925 6.75114 2.48097 6.75116 4.00012C6.75105 5.5192 5.51926 6.75099 4.00018 6.7511C2.48103 6.75108 1.24931 5.51925 1.24921 4.00012C1.24922 2.48091 2.48098 1.24916 4.00018 1.24915ZM12.8068 1.55676C12.9826 1.38103 13.2678 1.38103 13.4435 1.55676C13.6191 1.73251 13.6192 2.01781 13.4435 2.19348L11.6369 4.00012L13.4435 5.80676L13.5012 5.87708C13.6165 6.05174 13.5973 6.2897 13.4435 6.44348C13.2898 6.59725 13.0518 6.61646 12.8771 6.5011L12.8068 6.44348L11.0002 4.63684L9.19354 6.44348C9.01787 6.61913 8.73257 6.61902 8.55682 6.44348C8.38109 6.26775 8.38111 5.9825 8.55682 5.80676L10.3635 4.00012L8.55682 2.19348L8.49921 2.12317C8.38371 1.94849 8.403 1.7106 8.55682 1.55676C8.71066 1.40293 8.94854 1.38364 9.12323 1.49915L9.19354 1.55676L11.0002 3.3634L12.8068 1.55676ZM4.00018 2.14954C2.97803 2.14955 2.14961 2.97797 2.1496 4.00012C2.1497 5.0222 2.97809 5.85069 4.00018 5.85071C5.0222 5.8506 5.85066 5.02214 5.85077 4.00012C5.85075 2.97803 5.02226 2.14964 4.00018 2.14954Z"
        fill="currentColor"
      />
    </svg>
  );
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
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
  const [titlePosition, setTitlePosition] = useState<TitlePosition>(storedSettings.titlePosition);
  const [titleFont, setTitleFont] = useState<TitleFont>(storedSettings.titleFont);
  const [titleTracking, setTitleTracking] = useState(storedSettings.titleTracking);
  const [brandText, setBrandText] = useState(fixtureMode ? 'prod. usolido' : storedSettings.brandText);
  const [brandLayout, setBrandLayout] = useState<BrandLayout>(storedSettings.brandLayout);
  const [brandPosition, setBrandPosition] = useState<BrandPosition>(storedSettings.brandPosition);
  const [brandOpacity, setBrandOpacity] = useState(storedSettings.brandOpacity);
  const [showGuides, setShowGuides] = useState(false);
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
  const [manualBpm, setManualBpm] = useState('');
  const [manualBarOffset, setManualBarOffset] = useState<number | null>(null);
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
    titlePosition,
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
    title, titleFont, titlePosition, titleSize, titleTracking,
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
    setTitlePosition(snapshot.titlePosition);
    setTitleFont(snapshot.titleFont);
    setTitleTracking(snapshot.titleTracking);
    setBrandText(snapshot.brandText);
    setBrandLayout(snapshot.brandLayout);
    setBrandPosition(snapshot.brandPosition);
    setBrandOpacity(snapshot.brandOpacity);
    setPreset(snapshot.preset);
    setMotion(snapshot.motion);
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

  const settings: CompositionSettings = useMemo(() => ({
    title,
    titleSize,
    titlePosition,
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
  }), [
    title,
    titleSize,
    titlePosition,
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

    saveUserSettings({
      titleSize,
      titlePosition,
      titleFont,
      titleTracking,
      brandText,
      brandLayout,
      brandPosition,
      brandOpacity,
      preset,
      motion,
    });
  }, [
    brandLayout,
    brandOpacity,
    brandPosition,
    brandText,
    motion,
    preset,
    titleFont,
    titlePosition,
    titleSize,
    titleTracking,
  ]);

  const resetStyle = () => {
    clearUserSettings();
    setTitleSize(DEFAULT_USER_SETTINGS.titleSize);
    setTitlePosition(DEFAULT_USER_SETTINGS.titlePosition);
    setTitleFont(DEFAULT_USER_SETTINGS.titleFont);
    setTitleTracking(DEFAULT_USER_SETTINGS.titleTracking);
    setBrandText(DEFAULT_USER_SETTINGS.brandText);
    setBrandLayout(DEFAULT_USER_SETTINGS.brandLayout);
    setBrandPosition(DEFAULT_USER_SETTINGS.brandPosition);
    setBrandOpacity(DEFAULT_USER_SETTINGS.brandOpacity);
    setPreset(DEFAULT_USER_SETTINGS.preset);
    setMotion(DEFAULT_USER_SETTINGS.motion);
  };

  const resolveGrid = useCallback((): VerifiedGrid | null => {
    const parsedManualBpm = Number(manualBpm);
    const effectiveBpm =
      Number.isFinite(parsedManualBpm) && parsedManualBpm >= 40 && parsedManualBpm <= 260
        ? parsedManualBpm
        : analysis?.bpm ?? null;
    const effectiveBeatOffset = manualBarOffset ?? analysis?.beatOffset ?? null;

    if (effectiveBpm === null || effectiveBeatOffset === null) return null;

    return {
      bpm: effectiveBpm,
      beatOffset: effectiveBeatOffset,
      barOffset: manualBarOffset,
      source:
        manualBarOffset !== analysis?.barOffset ||
        (analysis?.bpm !== null && Math.abs(effectiveBpm - analysis.bpm) > 0.01)
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
    setManualBpm('');
    setManualBarOffset(null);
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
          setManualBpm(result.bpm === null ? '' : result.bpm.toFixed(1));
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
        const grid = resolveGrid();
        const step = event.shiftKey && grid ? 240 / grid.bpm : 1;
        seekTo(currentTime + (event.key === 'ArrowRight' ? step : -step));
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
  }, [audioBuffer, currentTime, redoEditor, resolveGrid, seekTo, togglePlayback, undoEditor]);

  const seek = (event: ChangeEvent<HTMLInputElement>) => {
    seekTo(Number(event.target.value));
  };

  const adjustTempo = (factor: number) => {
    const detected = analysis?.bpm ?? Number.NaN;
    const current = manualBpm.trim() ? Number(manualBpm) : detected;
    const next = Math.round(current * factor * 10) / 10;
    if (!Number.isFinite(next) || next < 40 || next > 260) return;
    setManualBpm(String(next));
    setAnalysisMessage('Manual tempo · ' + next.toFixed(1) + ' BPM');
  };

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

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark"><AppMark /></span>
          <div>
            <strong>Beatvideo Maker</strong>
            <span>Cover + beat → video</span>
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
            <div><h2>Media</h2><p>Cover, beat and title.</p></div>
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
            <button
              className={'guide-toggle ' + (showGuides ? 'is-active' : '')}
              aria-pressed={showGuides}
              onClick={() => setShowGuides((value) => !value)}
            >
              Safe guides
            </button>
          </div>

          <div className="canvas-shell">
            <canvas
              ref={canvasRef}
              data-testid="preview-canvas"
              width={1280}
              height={720}
              aria-label="16 by 9 video preview"
              onClick={() => void togglePlayback()}
            />
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

          <div className="waveform-shell">
            <div className="waveform" aria-label="Audio waveform">
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
          </div>

          {audioBuffer && (
            <section className="analysis-card" data-testid="analysis-card" aria-label="Beat grid">
              <div className="analysis-summary">
                <div>
                  <span className="eyebrow">GRID</span>
                  <strong>{analysisMessage || 'Waiting for analysis…'}</strong>
                </div>
                <span className={'confidence-badge ' + (analysis?.confidence || 'low')}>
                  {analysisState === 'analyzing' ? 'ANALYZING' : analysis?.confidence?.toUpperCase() || 'MANUAL'}
                </span>
              </div>

              <div className="analysis-controls">
                <label className="compact-control">
                  <span>BPM</span>
                  <input
                    data-testid="bpm-input"
                    type="number"
                    min={40}
                    max={260}
                    step={0.1}
                    value={manualBpm}
                    placeholder="—"
                    onChange={(event) => setManualBpm(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter') return;
                      const bpm = Number(event.currentTarget.value);
                      if (Number.isFinite(bpm) && bpm >= 40 && bpm <= 260) {
                        setAnalysisMessage('Manual tempo · ' + bpm.toFixed(1) + ' BPM');
                      }
                      event.currentTarget.blur();
                    }}
                  />
                  <div className="tempo-adjust" aria-label="Tempo correction">
                    <button
                      data-testid="bpm-half"
                      className="nudge-button"
                      type="button"
                      onClick={() => adjustTempo(0.5)}
                    >
                      Half
                    </button>
                    <button
                      data-testid="bpm-double"
                      className="nudge-button"
                      type="button"
                      onClick={() => adjustTempo(2)}
                    >
                      Double
                    </button>
                  </div>
                </label>
                <div className="bar-control">
                  <span>Bar 1</span>
                  <strong data-testid="bar-offset">
                    {manualBarOffset === null ? 'Unverified' : manualBarOffset.toFixed(3) + ' s'}
                  </strong>
                  <button
                    className="small-button"
                    type="button"
                    onClick={() => setManualBarOffset(currentTime)}
                  >
                    Set here
                  </button>
                  <button
                    className="nudge-button"
                    type="button"
                    disabled={manualBarOffset === null}
                    onClick={() => setManualBarOffset((value) => value === null ? value : Math.max(0, value - 0.01))}
                  >
                    −10 ms
                  </button>
                  <button
                    className="nudge-button"
                    type="button"
                    disabled={manualBarOffset === null}
                    onClick={() => setManualBarOffset((value) => value === null ? value : value + 0.01)}
                  >
                    +10 ms
                  </button>
                </div>
              </div>

              {analysis?.notes.length ? (
                <p className="analysis-note">{analysis.notes[0]}</p>
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
            <div><h2>Output style</h2><p>Motion, type and branding.</p></div>
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
            <SelectControl
              label="Title position"
              value={titlePosition}
              onChange={setTitlePosition}
              options={[
                { value: 'bottom-left', label: 'Bottom left' },
                { value: 'bottom-center', label: 'Bottom center' },
                { value: 'top-left', label: 'Top left' },
              ]}
            />
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
            <strong>Local preferences</strong>
            <p>Style and producer settings are saved on this device. Media files are never persisted.</p>
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
