import { useEffect, useRef } from 'react';
import { CrossIcon } from '../../components/EditorIcons';
import type {
  OutputFormatPreset,
  OutputFrameRate,
  ProjectOutputSettings,
  ResolutionTier,
} from './projectSettings';
import { resolveProjectOutput } from './projectSettings';

const FORMATS: Array<{
  value: OutputFormatPreset;
  label: string;
  detail: string;
}> = [
  { value: 'youtube', label: 'YouTube', detail: '16:9' },
  { value: 'shorts', label: 'Shorts', detail: '9:16' },
  { value: 'square', label: 'Square', detail: '1:1' },
  { value: 'custom', label: 'Custom', detail: 'Exact size' },
];

export function ProjectSettingsDialog(props: {
  settings: ProjectOutputSettings;
  onChange: (settings: ProjectOutputSettings) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const resolved = resolveProjectOutput(props.settings);
  const patch = (next: Partial<ProjectOutputSettings>) =>
    props.onChange({ ...props.settings, ...next });

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    dialogRef.current?.focus();

    return () => {
      previousFocus?.focus();
    };
  }, []);

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) props.onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="project-settings-dialog"
        role="dialog"
        tabIndex={-1}
        aria-modal="true"
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return;
          event.preventDefault();
          props.onClose();
        }}
        aria-labelledby="project-settings-title"
        data-testid="project-settings-dialog"
      >
        <header className="dialog-header">
          <div>
            <span className="eyebrow">PROJECT</span>
            <h2 id="project-settings-title">Project settings</h2>
            <p>Output format, frame rate and canvas fill. Preview and export stay matched.</p>
          </div>
          <button
            type="button"
            className="dialog-close editor-icon-button"
            aria-label="Close project settings"
            title="Close project settings"
            onClick={props.onClose}
          >
            <CrossIcon className="editor-icon" />
          </button>
        </header>

        <div className="dialog-section">
          <span className="field-label">Format</span>
          <div className="format-grid" data-testid="output-format-grid">
            {FORMATS.map((format) => (
              <button
                key={format.value}
                type="button"
                data-testid={'output-format-' + format.value}
                className={props.settings.format === format.value ? 'is-active' : ''}
                aria-pressed={props.settings.format === format.value}
                onClick={() => patch({ format: format.value })}
              >
                <strong>{format.label}</strong>
                <span>{format.detail}</span>
              </button>
            ))}
          </div>
        </div>

        {props.settings.format === 'custom' ? (
          <div className="dialog-section">
            <span className="field-label">Custom frame</span>
            <div className="custom-size-row">
              <label>
                <span>Width</span>
                <input
                  data-testid="custom-output-width"
                  type="number"
                  min={320}
                  max={3840}
                  step={2}
                  value={props.settings.customWidth}
                  onChange={(event) => patch({
                    customWidth: Math.max(320, Math.min(3840, Number(event.target.value) || 320)),
                  })}
                />
              </label>
              <span>×</span>
              <label>
                <span>Height</span>
                <input
                  data-testid="custom-output-height"
                  type="number"
                  min={320}
                  max={3840}
                  step={2}
                  value={props.settings.customHeight}
                  onChange={(event) => patch({
                    customHeight: Math.max(320, Math.min(3840, Number(event.target.value) || 320)),
                  })}
                />
              </label>
            </div>
          </div>
        ) : (
          <div className="dialog-section two-column-settings">
            <label>
              <span className="field-label">Resolution</span>
              <select
                data-testid="output-resolution"
                value={props.settings.resolution}
                onChange={(event) => patch({
                  resolution: event.target.value as ResolutionTier,
                })}
              >
                <option value="1080p">1080p</option>
                <option value="1440p">1440p</option>
                <option value="2160p">4K / 2160p</option>
              </select>
            </label>

            <label>
              <span className="field-label">Frame rate</span>
              <select
                data-testid="output-fps"
                value={props.settings.fps}
                onChange={(event) => patch({
                  fps: Number(event.target.value) as OutputFrameRate,
                })}
              >
                {[24, 25, 30, 50, 60].map((fps) => (
                  <option key={fps} value={fps}>{fps} fps</option>
                ))}
              </select>
            </label>
          </div>
        )}

        {props.settings.format === 'custom' ? (
          <div className="dialog-section">
            <label>
              <span className="field-label">Frame rate</span>
              <select
                data-testid="output-fps"
                value={props.settings.fps}
                onChange={(event) => patch({
                  fps: Number(event.target.value) as OutputFrameRate,
                })}
              >
                {[24, 25, 30, 50, 60].map((fps) => (
                  <option key={fps} value={fps}>{fps} fps</option>
                ))}
              </select>
            </label>
          </div>
        ) : null}

        <div className="dialog-section">
          <span className="field-label">Background fill</span>
          <div className="fill-segmented" role="group" aria-label="Background fill">
            <button
              type="button"
              data-testid="fill-blur"
              className={props.settings.backgroundFill === 'blur' ? 'is-active' : ''}
              aria-pressed={props.settings.backgroundFill === 'blur'}
              onClick={() => patch({ backgroundFill: 'blur' })}
            >
              Blurred fill
            </button>
            <button
              type="button"
              data-testid="fill-black"
              className={props.settings.backgroundFill === 'black' ? 'is-active' : ''}
              aria-pressed={props.settings.backgroundFill === 'black'}
              onClick={() => patch({ backgroundFill: 'black' })}
            >
              Black
            </button>
          </div>
          <p className="dialog-hint">
            Square or portrait media can stay sharp in the center without forcing a stretched crop.
          </p>
        </div>

        <footer className="dialog-footer">
          <div>
            <strong data-testid="resolved-output-summary">{resolved.summary}</strong>
            <span>{resolved.aspectLabel} · {props.settings.backgroundFill === 'blur' ? 'blur fill' : 'black fill'}</span>
          </div>
          <button type="button" className="primary-button" onClick={props.onClose}>
            Done
          </button>
        </footer>
      </section>
    </div>
  );
}
