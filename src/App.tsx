import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  CSSProperties,
  ChangeEvent,
  DragEvent as ReactDragEvent,
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
import { VideoSourcesPanel } from './features/media/VideoSourcesPanel';
import { useVideoSources } from './features/media/useVideoSources';
import { classifyMediaFiles } from './features/media/classifyMediaFiles';
import { ProjectSettingsDialog } from './features/project/ProjectSettingsDialog';
import {
  DEFAULT_PROJECT_OUTPUT,
  loadProjectOutputSettings,
  previewCanvasSize,
  resolveProjectOutput,
  saveProjectOutputSettings,
} from './features/project/projectSettings';
import type { ProjectOutputSettings } from './features/project/projectSettings';
import {
  createDefaultModulation,
  createEffectInstance,
  effectDefinition,
  EFFECT_TYPES,
} from './features/effects/registry';
import type {
  EffectModulation,
  EffectType,
  ModulationDriver,
  VisualEffectInstance,
  VisualTarget,
} from './features/effects/types';
import {
  canMoveEffectWithinTarget,
  moveEffectWithinTarget,
  removeEffect as removeEffectFromStack,
  setEffectEnabled,
  setEffectStrength,
  setEffectTarget,
} from './features/effects/stack';

const fixtureMode = new URLSearchParams(window.location.search).has('fixture');
const storedSettings = fixtureMode ? DEFAULT_USER_SETTINGS : loadUserSettings();
const storedProjectOutput = fixtureMode
  ? DEFAULT_PROJECT_OUTPUT
  : loadProjectOutputSettings();

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
  effects: VisualEffectInstance[];
  modulations: EffectModulation[];
  bpmOverride: string | null;
  barOffset: number | null;
  projectOutput: ProjectOutputSettings;
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
  const waveformRef = useRef<HTMLDivElement>(null);
  const gridDragPointerRef = useRef<number | null>(null);
  const exportAbortRef = useRef<AbortController | null>(null);
  const audioLoadIdRef = useRef(0);
  const mediaInputRef = useRef<HTMLInputElement>(null);

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
  const [projectOutput, setProjectOutput] = useState<ProjectOutputSettings>(storedProjectOutput);
  const [projectSettingsOpen, setProjectSettingsOpen] = useState(false);
  const [mediaDragActive, setMediaDragActive] = useState(false);
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
  const [analysisState, setAnalysisState] = useState<'idle' | 'decoding' | 'analyzing' | 'ready' | 'error'>('idle');
  const [waveformState, setWaveformState] = useState<'idle' | 'preparing' | 'ready' | 'error'>('idle');
  const [analysis, setAnalysis] = useState<BeatGridAnalysis | null>(null);
  const [manualBpm, setManualBpm] = useState<string | null>(null);
  const [manualBarOffset, setManualBarOffset] = useState<number | null>(null);
  const [gridEditing, setGridEditing] = useState(false);
  const [analysisMessage, setAnalysisMessage] = useState('');
  const [amplitudeEnvelope, setAmplitudeEnvelope] = useState<AmplitudeEnvelope | null>(null);
  const [preset, setPreset] = useState<VisualPreset>(storedSettings.preset);
  const [motion, setMotion] = useState<MotionAmount>(storedSettings.motion);
  const [effects, setEffects] = useState<VisualEffectInstance[]>(storedSettings.effects);
  const [modulations, setModulations] = useState<EffectModulation[]>(storedSettings.modulations);
  const [effectToAdd, setEffectToAdd] = useState<EffectType>('zoom-punch');
  const videoSources = useVideoSources();
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
    effects,
    modulations,
    bpmOverride: manualBpm,
    barOffset: manualBarOffset,
    projectOutput,
  }), [
    brandLayout, brandOpacity, brandPosition, brandText, effects, manualBarOffset, manualBpm,
    modulations, motion, preset, projectOutput, title, titleAlign, titleFont, titleSize, titleTracking, titleX, titleY,
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
    setEffects(snapshot.effects);
    setModulations(snapshot.modulations);
    setManualBpm(snapshot.bpmOverride);
    setManualBarOffset(snapshot.barOffset);
    setProjectOutput(snapshot.projectOutput);
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

  const resolvedOutput = useMemo(
    () => resolveProjectOutput(projectOutput),
    [projectOutput],
  );
  const previewSize = useMemo(
    () => previewCanvasSize(resolvedOutput),
    [resolvedOutput],
  );

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
    effects,
    modulations,
  }), [
    brandLayout, brandOpacity, brandPosition, brandText, effects, modulations, motion, preset,
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
    backgroundFill: projectOutput.backgroundFill,
    effects,
    modulations,
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
    projectOutput.backgroundFill,
    effects,
    modulations,
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

  useEffect(() => {
    if (fixtureMode) return;
    saveProjectOutputSettings(projectOutput);
  }, [projectOutput]);

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
    setEffects(DEFAULT_USER_SETTINGS.effects);
    setModulations(DEFAULT_USER_SETTINGS.modulations);
  };

  const addEffect = () => {
    const effect = createEffectInstance(effectToAdd);
    const modulation = createDefaultModulation(effect);
    setEffects((current) => [...current, effect]);
    if (modulation) {
      setModulations((current) => [...current, modulation]);
    }
  };

  const removeEffect = (effectId: string) => {
    setEffects((current) => removeEffectFromStack(current, effectId));
    setModulations((current) => current.filter((modulation) => modulation.effectId !== effectId));
  };

  const moveEffect = (effectId: string, direction: -1 | 1) => {
    setEffects((current) => moveEffectWithinTarget(current, effectId, direction));
  };

  const setEffectDriver = (
    effect: VisualEffectInstance,
    driver: ModulationDriver | 'static',
  ) => {
    setModulations((current) => {
      const existing = current.find((modulation) => modulation.effectId === effect.id);
      if (driver === 'static') {
        return current.filter((modulation) => modulation.effectId !== effect.id);
      }
      if (existing) {
        return current.map((modulation) =>
          modulation.id === existing.id ? { ...modulation, driver, enabled: true } : modulation
        );
      }
      const next = createDefaultModulation(effect);
      if (!next) {
        return [
          ...current,
          {
            id: 'mod-' + effect.id,
            effectId: effect.id,
            parameter: 'strength',
            driver,
            amount: 1,
            enabled: true,
          },
        ];
      }
      return [...current, { ...next, driver }];
    });
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
      setEffects(next.effects);
      setModulations(next.modulations);
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
      if (!cover) {
        mediaInputRef.current?.click();
        return;
      }
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
    setCapability((current) => ({
      ...current,
      supported: false,
      label: 'Checking ' + resolvedOutput.summary + ' encoder…',
    }));
    void detectExportCapability(resolvedOutput)
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
  }, [resolvedOutput]);

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
  }, [
    amplitudeEnvelope,
    cover,
    currentTime,
    previewSize.height,
    previewSize.width,
    resolveGrid,
    settings,
  ]);

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
    setWaveformState('idle');
    setAnalysis(null);
    setManualBpm(null);
    setManualBarOffset(null);
    setGridEditing(false);
    setAnalysisState('decoding');
    setAnalysisMessage('Decoding audio…');
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

      setWaveformState('preparing');
      void Promise.all([
        buildPeaksAsync(decoded),
        buildAmplitudeEnvelopeAsync(decoded),
      ])
        .then(([nextPeaks, nextEnvelope]) => {
          if (audioLoadIdRef.current !== loadId) return;
          setPeaks(nextPeaks);
          setAmplitudeEnvelope(nextEnvelope);
          setWaveformState('ready');
        })
        .catch(() => {
          if (audioLoadIdRef.current !== loadId) return;
          setWaveformState('error');
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
      const message = error instanceof Error ? error.message : 'Could not load audio.';
      setAnalysisState('error');
      setAnalysisMessage(message);
      setMediaMessage(message);
    }
  };

  const handleMediaFiles = async (files: File[]) => {
    const classified = classifyMediaFiles(files);
    const tasks: Promise<void>[] = [];

    if (classified.image) tasks.push(handleCover(classified.image));
    if (classified.audio) tasks.push(handleAudio(classified.audio));
    if (classified.videos.length > 0) videoSources.addFiles(classified.videos);

    if (
      !classified.image
      && !classified.audio
      && classified.videos.length === 0
    ) {
      setMediaMessage('No supported image, audio or video files found.');
      return;
    }

    if (classified.unsupported.length > 0) {
      setMediaMessage(
        'Added supported media · skipped '
        + classified.unsupported.length
        + ' unsupported file'
        + (classified.unsupported.length === 1 ? '' : 's')
        + '.',
      );
    }

    await Promise.all(tasks);
  };

  const handleMediaDrop = (event: ReactDragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setMediaDragActive(false);
    const files = Array.from(event.dataTransfer.files ?? []);
    if (files.length > 0) void handleMediaFiles(files);
  };

  const handleMediaDragOver = (event: ReactDragEvent<HTMLElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setMediaDragActive(true);
  };

  const handleMediaDragLeave = (event: ReactDragEvent<HTMLElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setMediaDragActive(false);
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
    setExportMessage('Rendering ' + resolvedOutput.summary + ' locally…');

    try {
      const result = await exportVideo({
        source: cover,
        audioBuffer,
        settings,
        capability,
        title,
        grid: resolveGrid(),
        amplitudeEnvelope,
        output: resolvedOutput,
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
    analysisState === 'decoding'
      ? 'Decoding…'
      : analysisState === 'analyzing'
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
          <span className="brand-mark"><AppMark /></span>
          <div>
            <strong>Beatvideo Maker</strong>
            <span>local beat editor</span>
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
          <button
            type="button"
            className="output-pill output-settings-button"
            data-testid="output-settings-button"
            onClick={() => setProjectSettingsOpen(true)}
          >
            {resolvedOutput.summary}
          </button>
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
        <aside className="panel inputs-panel" aria-label="Sources">
          <div className="panel-heading">
            <div><h2>Sources</h2><p>Local media · nothing uploaded.</p></div>
          </div>

          <input
            ref={mediaInputRef}
            data-testid="media-intake-input"
            className="visually-hidden"
            type="file"
            multiple
            accept="image/*,audio/*,video/*,.mov,.mkv,.flac,.m4a"
            onChange={(event) => {
              const files = Array.from(event.currentTarget.files ?? []);
              if (files.length > 0) void handleMediaFiles(files);
              event.currentTarget.value = '';
            }}
          />
          <div
            className={'media-intake ' + (mediaDragActive ? 'is-dragging' : '')}
            data-testid="media-intake"
            role="button"
            tabIndex={0}
            onClick={() => mediaInputRef.current?.click()}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                mediaInputRef.current?.click();
              }
            }}
            onDragEnter={handleMediaDragOver}
            onDragOver={handleMediaDragOver}
            onDragLeave={handleMediaDragLeave}
            onDrop={handleMediaDrop}
          >
            <strong>Drop media here</strong>
            <span>Image · beat · one or more videos</span>
            <small>or click to browse · files stay on this device</small>
          </div>

          <FileControl label="Still image" detail={coverName} accept="image/png,image/jpeg,image/webp" testId="cover-input" onChange={handleCover} />
          <FileControl label="Beat / audio" detail={audioName} accept="audio/*,.wav,.mp3,.m4a,.flac" testId="audio-input" onChange={handleAudio} />

          <VideoSourcesPanel
            items={videoSources.items}
            detector={videoSources.detector}
            onAddFiles={videoSources.addFiles}
            onCancel={videoSources.cancel}
            onRetry={videoSources.retry}
            onRemove={videoSources.remove}
            onRole={videoSources.setRole}
          />

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
            className={'canvas-shell ' + (mediaDragActive ? 'is-media-dragging' : '')}
            data-testid="preview-shell"
            style={{
              '--preview-aspect': String(resolvedOutput.width / resolvedOutput.height),
            } as CSSProperties}
            onClick={handlePreviewClick}
            onDragEnter={handleMediaDragOver}
            onDragOver={handleMediaDragOver}
            onDragLeave={handleMediaDragLeave}
            onDrop={handleMediaDrop}
          >
            <canvas
              ref={canvasRef}
              data-testid="preview-canvas"
              className={placingTitle ? 'is-placing-title' : ''}
              width={previewSize.width}
              height={previewSize.height}
              aria-label={
                placingTitle
                  ? 'Click to place title'
                  : resolvedOutput.aspectLabel + ' video preview'
              }
            />
            {placingTitle ? (
              <div className="canvas-placement-hint" data-testid="title-placement-hint">
                Click the preview to place the title
              </div>
            ) : null}
            {!cover && (
              <button
                type="button"
                className="empty-overlay empty-overlay-button"
                data-testid="empty-media-action"
                onClick={(event) => {
                  event.stopPropagation();
                  mediaInputRef.current?.click();
                }}
              >
                <span>Add a cover image</span>
                <small>Click or drop image · audio · video</small>
              </button>
            )}
            {(analysisState === 'decoding'
              || analysisState === 'analyzing'
              || waveformState === 'preparing') && (
              <div className="processing-card" data-testid="audio-processing" role="status">
                <span className="activity-spinner" aria-hidden="true" />
                <div>
                  <strong>
                    {analysisState === 'decoding'
                      ? 'Decoding beat'
                      : analysisState === 'analyzing'
                        ? 'Analyzing beat grid'
                        : 'Preparing waveform'}
                  </strong>
                  <small>
                    {analysisState === 'analyzing'
                      ? (analysisMessage || 'Analyzing tempo and beat phase…')
                      : waveformState === 'preparing' && analysisState === 'ready'
                        ? 'Building waveform and audio envelope…'
                        : 'Working locally…'}
                  </small>
                </div>
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

          <section className="edit-dock" aria-label="Beat edit">
            <div className="edit-dock-header">
              <strong>Beat</strong>
              <span>{audioBuffer ? audioName : 'Add audio to reveal the musical grid'}</span>
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
  
                {analysisState === 'ready'
                  && (analysis?.confidence === 'low' || manualBarOffset === null) ? (
                    <div className="analysis-attention" data-testid="analysis-attention">
                      <div>
                        <strong>Beat grid needs a quick check</strong>
                        <span>
                          Analysis is finished. Confirm tempo and place bar 1 before phrase-based motion or auto-edit relies on it.
                        </span>
                      </div>
                      <button
                        type="button"
                        className="grid-action"
                        data-testid="review-grid"
                        onClick={() => {
                          setGridEditing(true);
                          requestAnimationFrame(() => {
                            waveformRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
                          });
                        }}
                      >
                        Review grid
                      </button>
                    </div>
                  ) : null}

                {gridEditing ? (
                  <p className="grid-help">
                    Click or drag on the waveform to place the first downbeat. Arrow keys fine-adjust the marker; Shift makes a larger move.
                  </p>
                ) : analysisState === 'error' ? (
                  <p className="grid-help is-error">{analysisMessage || 'Beat analysis failed.'}</p>
                ) : null}
              </section>
            )}
          </section>

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

        <aside className="panel style-panel" aria-label="Inspector">
          <div className="panel-heading">
            <div><h2>Inspector</h2><p>Visual, title and brand.</p></div>
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

          <div className="control-group effects-control" data-testid="effects-control">
            <h3>Effects</h3>
            <div className="effect-add-row">
              <select
                data-testid="effect-add-type"
                value={effectToAdd}
                onChange={(event) => setEffectToAdd(event.target.value as EffectType)}
              >
                {EFFECT_TYPES.map((type) => (
                  <option key={type} value={type}>{effectDefinition(type).name}</option>
                ))}
              </select>
              <button
                type="button"
                className="small-button"
                data-testid="effect-add"
                onClick={addEffect}
              >
                Add
              </button>
            </div>

            {effects.length === 0 ? (
              <p className="control-hint">Add effects by target. Order matters within the same target.</p>
            ) : (
              <div className="effect-stack" data-testid="effect-stack">
                {effects.map((effect) => {
                  const definition = effectDefinition(effect.type);
                  const modulation = modulations.find((candidate) => candidate.effectId === effect.id) ?? null;
                  return (
                    <article
                      key={effect.id}
                      className={'effect-row ' + (effect.enabled ? '' : 'is-disabled')}
                      data-effect-type={effect.type}
                    >
                      <div className="effect-row-header">
                        <label className="effect-enable">
                          <input
                            type="checkbox"
                            checked={effect.enabled}
                            aria-label={'Enable ' + definition.name}
                            onChange={(event) => setEffects((current) =>
                              setEffectEnabled(current, effect.id, event.target.checked)
                            )}
                          />
                          <span>{definition.name}</span>
                        </label>
                        <div className="effect-order-actions">
                          <button
                            type="button"
                            aria-label={'Move ' + definition.name + ' up'}
                            disabled={!canMoveEffectWithinTarget(effects, effect.id, -1)}
                            onClick={() => moveEffect(effect.id, -1)}
                          >↑</button>
                          <button
                            type="button"
                            aria-label={'Move ' + definition.name + ' down'}
                            disabled={!canMoveEffectWithinTarget(effects, effect.id, 1)}
                            onClick={() => moveEffect(effect.id, 1)}
                          >↓</button>
                          <button
                            type="button"
                            aria-label={'Remove ' + definition.name}
                            onClick={() => removeEffect(effect.id)}
                          >×</button>
                        </div>
                      </div>

                      <p>{definition.description}</p>

                      <div className="effect-row-controls">
                        <label>
                          <span>Target</span>
                          <select
                            aria-label={definition.name + ' target'}
                            value={effect.target}
                            disabled={definition.targets.length === 1}
                            onChange={(event) => setEffects((current) =>
                              setEffectTarget(current, effect.id, event.target.value as VisualTarget)
                            )}
                          >
                            {definition.targets.map((target) => (
                              <option key={target} value={target}>{target}</option>
                            ))}
                          </select>
                        </label>

                        <label>
                          <span>Driver</span>
                          <select
                            aria-label={definition.name + ' driver'}
                            value={modulation?.driver ?? 'static'}
                            onChange={(event) => setEffectDriver(
                              effect,
                              event.target.value as ModulationDriver | 'static',
                            )}
                          >
                            <option value="static">Static</option>
                            {definition.drivers.map((driver) => (
                              <option key={driver} value={driver}>{driver}</option>
                            ))}
                          </select>
                        </label>
                      </div>

                      <label className="range-control effect-strength">
                        <span>
                          <span>Strength</span>
                          <output>{Math.round(effect.strength * 100)}%</output>
                        </span>
                        <input
                          aria-label={definition.name + ' strength'}
                          type="range"
                          min={0}
                          max={1}
                          step={0.05}
                          value={effect.strength}
                          onChange={(event) => setEffects((current) =>
                            setEffectStrength(current, effect.id, Number(event.target.value))
                          )}
                        />
                      </label>
                    </article>
                  );
                })}
              </div>
            )}
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

      {exportState === 'exporting' ? (
        <section
          className="render-progress-popover"
          role="dialog"
          aria-label="Rendering video"
          data-testid="render-progress"
        >
          <div className="render-progress-heading">
            <span className="activity-spinner" aria-hidden="true" />
            <div>
              <strong>Rendering locally</strong>
              <span>{resolvedOutput.summary}</span>
            </div>
            <b>{Math.round(exportProgress * 100)}%</b>
          </div>
          <div className="render-progress-track" aria-hidden="true">
            <span style={{ width: Math.round(exportProgress * 100) + '%' }} />
          </div>
          <div className="render-progress-footer">
            <span>Media stays on this device.</span>
            <button type="button" className="small-button" onClick={cancelExport}>
              Cancel
            </button>
          </div>
        </section>
      ) : null}

      {projectSettingsOpen ? (
        <ProjectSettingsDialog
          settings={projectOutput}
          onChange={setProjectOutput}
          onClose={() => setProjectSettingsOpen(false)}
        />
      ) : null}
    </main>
  );
}

export default App;
