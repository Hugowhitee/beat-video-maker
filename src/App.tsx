import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { renderComposition } from './features/compositor/renderComposition';
import type { BrandPosition, CompositionSettings, TitlePosition } from './features/compositor/types';
import { buildPeaks, decodeAudioFile, formatTime, loadImageFile, makeFixtureCover } from './features/media/media';
import { detectExportCapability, downloadBlob, exportMp4, safeExportName } from './features/export/exportMp4';
import type { ExportCapability } from './features/export/exportMp4';

const fixtureMode = new URLSearchParams(window.location.search).has('fixture');

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
}) {
  return (
    <label className="control">
      <span className="field-label">{props.label}</span>
      <select value={props.value} onChange={(event) => props.onChange(event.target.value as T)}>
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

  const [cover, setCover] = useState<CanvasImageSource | null>(() => fixtureMode ? makeFixtureCover() : null);
  const [coverName, setCoverName] = useState(fixtureMode ? 'visual-qa-fixture' : 'No image');
  const [brandGraphic, setBrandGraphic] = useState<CanvasImageSource | null>(null);
  const [brandGraphicName, setBrandGraphicName] = useState('Text only');
  const [audioUrl, setAudioUrl] = useState('');
  const [audioName, setAudioName] = useState('No audio');
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [peaks, setPeaks] = useState<number[]>([]);
  const [title, setTitle] = useState(fixtureMode ? 'MIDNIGHT STATIC' : '');
  const [titleSize, setTitleSize] = useState(58);
  const [titlePosition, setTitlePosition] = useState<TitlePosition>('bottom-left');
  const [brandText, setBrandText] = useState(fixtureMode ? 'prod. usolido' : '');
  const [brandPosition, setBrandPosition] = useState<BrandPosition>('top-right');
  const [brandOpacity, setBrandOpacity] = useState(0.72);
  const [showGuides, setShowGuides] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [mediaMessage, setMediaMessage] = useState('');
  const [capability, setCapability] = useState<ExportCapability>({
    supported: false,
    videoCodec: null,
    label: 'Checking browser encoder…',
  });
  const [exportState, setExportState] = useState<'idle' | 'exporting' | 'done' | 'error'>('idle');
  const [exportProgress, setExportProgress] = useState(0);
  const [exportMessage, setExportMessage] = useState('');

  const settings: CompositionSettings = useMemo(() => ({
    title,
    titleSize,
    titlePosition,
    brandText,
    brandGraphic,
    brandPosition,
    brandOpacity,
    showGuides,
  }), [title, titleSize, titlePosition, brandText, brandGraphic, brandPosition, brandOpacity, showGuides]);

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
            videoCodec: null,
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
    });
    canvas.dataset.rendered = 'true';
  }, [cover, currentTime, settings]);

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
      setCurrentTime(0);
      setMediaMessage('Audio ready · ' + decoded.duration.toFixed(1) + ' s');
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

  const handleExport = async () => {
    if (!cover || !audioBuffer || !capability.videoCodec || exportState === 'exporting') return;
    setExportState('exporting');
    setExportProgress(0);
    setExportMessage('Rendering 1080p frames locally…');
    try {
      const blob = await exportMp4({
        source: cover,
        audioBuffer,
        settings,
        videoCodec: capability.videoCodec,
        title,
        onProgress: setExportProgress,
      });
      downloadBlob(blob, safeExportName(title));
      setExportState('done');
      setExportMessage('MP4 encoded and downloaded · ' + (blob.size / 1_000_000).toFixed(1) + ' MB');
    } catch (error) {
      setExportState('error');
      setExportMessage(error instanceof Error ? error.message : 'Export failed.');
    }
  };

  const duration = audioBuffer?.duration || 0;
  const exportReady = Boolean(cover && audioBuffer && capability.supported && capability.videoCodec);

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
            className="primary-button"
            disabled={!exportReady || exportState === 'exporting'}
            onClick={() => void handleExport()}
          >
            {exportState === 'exporting' ? Math.round(exportProgress * 100) + '%' : 'Export MP4'}
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

          <div className="waveform" aria-label="Audio waveform">
            {peaks.length > 0 ? peaks.map((peak, index) => (
              <span key={index} style={{ height: Math.max(8, peak * 42) }} />
            )) : <p>Waveform appears after audio is decoded.</p>}
          </div>

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

          <div className="preset-card is-selected">
            <div className="preset-swatch" />
            <div><strong>Clean</strong><span>Photo first · nearly still</span></div>
            <span className="check">✓</span>
          </div>

          <div className="control-group">
            <h3>Text</h3>
            <label className="range-control">
              <span><span>Title size</span><output>{titleSize}px</output></span>
              <input
                type="range"
                min={36}
                max={86}
                value={titleSize}
                onChange={(event) => setTitleSize(Number(event.target.value))}
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
            <strong>Vertical slice</strong>
            <p>Beat-grid analysis and extra visual presets stay out until preview/export parity is proven.</p>
          </div>
        </aside>
      </section>
    </main>
  );
}

export default App;
