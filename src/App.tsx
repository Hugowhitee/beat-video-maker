import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { renderComposition } from './features/compositor/renderComposition';
import type {
  BrandPosition,
  CompositionSettings,
  MotionAmount,
  TitleFont,
  TitlePosition,
  VisualPreset,
} from './features/compositor/types';
import {
  buildPeaks,
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
  buildAmplitudeEnvelope,
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
  const exportAbortRef = useRef<AbortController | null>(null);

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

  const settings: CompositionSettings = useMemo(() => ({
    title,
    titleSize,
    titlePosition,
    titleFont,
    titleTracking,
    brandText,
    brandGraphic,
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
    brandPosition,
    brandOpacity,
    preset,
    motion,
    showGuides,
  ]);

  useEffect(() => {
    if (fixtureMode) return;

    saveUserSettings({
      titleSize,
      titlePosition,
      titleFont,
      titleTracking,
      brandText,
      brandPosition,
      brandOpacity,
      preset,
      motion,
    });
  }, [
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
    setMediaMessage('Decoding audio…');
    setAudioBuffer(null);
    try {
      const decoded = await decodeAudioFile(file);
      const nextUrl = URL.createObjectURL(file);
      setAudioUrl(nextUrl);
      setAudioBuffer(decoded);
      setAudioName(file.name);
      setPeaks(buildPeaks(decoded));
      setAmplitudeEnvelope(buildAmplitudeEnvelope(decoded));
      setCurrentTime(0);
      setAnalysis(null);
      setManualBpm('');
      setManualBarOffset(null);
      setAnalysisState('analyzing');
      setAnalysisMessage('Analyzing tempo and beat phase…');
      setMediaMessage('Audio ready · ' + decoded.duration.toFixed(1) + ' s');

      void analyzeBeatGrid(decoded)
        .then((result) => {
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
          setAnalysisState('error');
          setAnalysisMessage(
            analysisError instanceof Error ? analysisError.message : 'Beat analysis failed.',
          );
        });
    } catch (error) {
      setMediaMessage(error instanceof Error ? error.message : 'Could not load audio.');
    }
  };

  const togglePlayback = async () => {
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
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.code !== 'Space' || target?.matches('input, textarea, select, button')) return;
      event.preventDefault();
      void togglePlayback();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const seek = (event: ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value);
    const audio = audioRef.current;
    if (audio) audio.currentTime = value;
    setCurrentTime(value);
    renderPreview(value);
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
          <span className="brand-mark" aria-hidden="true">B</span>
          <div>
            <strong>Beatvideo Maker</strong>
            <span>local compositor</span>
          </div>
        </div>
        <div className="topbar-actions">
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
              disabled={Boolean(brandGraphic)}
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
              <span className="eyebrow">CLEAN</span>
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
                  />
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
            {!verifiedGrid?.barOffset && (preset === 'ambient' || preset === 'pulse') ? (
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
            <label className="range-control">
              <span><span>Opacity</span><output>{Math.round(brandOpacity * 100)}%</output></span>
              <input
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
