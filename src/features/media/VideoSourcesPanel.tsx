import type {
  VideoDetectorState,
  VideoSourceItem,
  VideoSourceRole,
} from './useVideoSources';

function formatDuration(seconds: number | undefined) {
  if (!seconds || !Number.isFinite(seconds)) return '';
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60).toString().padStart(2, '0');
  return minutes + ':' + remainder;
}

function stateLabel(item: VideoSourceItem) {
  if (item.state === 'ready') return item.detail;
  if (item.state === 'error') return item.error || item.detail;
  return item.detail;
}

export function VideoSourcesPanel(props: {
  items: VideoSourceItem[];
  detector: VideoDetectorState;
  onAddFiles: (files: File[]) => void;
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
  onRole: (id: string, role: VideoSourceRole) => void;
}) {
  const working = props.items.some((item) =>
    ['queued', 'opening', 'preparing', 'analyzing'].includes(item.state)
  );

  return (
    <section className="video-sources" aria-label="Video sources">
      <div className="source-section-heading">
        <div>
          <strong>Video sources</strong>
          <span>Local footage for Loop · Guided · Auto</span>
        </div>
        <label className="small-button">
          Add videos
          <input
            className="visually-hidden"
            data-testid="video-sources-input"
            type="file"
            accept="video/*,.mp4,.webm,.mov,.mkv"
            multiple
            onChange={(event) => {
              const files = Array.from(event.currentTarget.files ?? []);
              if (files.length > 0) props.onAddFiles(files);
              event.currentTarget.value = '';
            }}
          />
        </label>
      </div>

      {props.detector.state === 'loading' ? (
        <div className="detector-status" data-testid="video-detector-status">
          <span className="activity-spinner" aria-hidden="true" />
          <div>
            <strong>{props.detector.detail}</strong>
            <small>First use loads the pinned shot model once; media stays local.</small>
          </div>
        </div>
      ) : props.detector.state === 'error' ? (
        <div className="detector-status is-error" data-testid="video-detector-status">
          <div>
            <strong>Shot detector unavailable</strong>
            <small>{props.detector.detail}</small>
          </div>
        </div>
      ) : null}

      {props.items.length === 0 ? (
        <p className="source-empty">Optional · add one or more clips when you want video editing.</p>
      ) : (
        <div className="video-source-list" data-testid="video-source-list">
          {props.items.map((item) => (
            <article
              className={'video-source-row state-' + item.state}
              data-testid="video-source-row"
              key={item.id}
            >
              <div className="video-source-main">
                <div className="video-source-name">
                  <strong title={item.file.name}>{item.file.name}</strong>
                  <span>
                    {item.metadata
                      ? formatDuration(item.metadata.duration)
                        + ' · ' + item.metadata.width + '×' + item.metadata.height
                      : Math.max(1, Math.round(item.file.size / 1024 / 1024)) + ' MB'}
                  </span>
                </div>

                <select
                  aria-label={'Role for ' + item.file.name}
                  data-testid="video-source-role"
                  value={item.role}
                  onChange={(event) => props.onRole(item.id, event.target.value as VideoSourceRole)}
                >
                  <option value="footage">Footage</option>
                  <option value="intro">Intro</option>
                  <option value="outro">Outro</option>
                </select>
              </div>

              <div className="video-source-state">
                <span className={'source-state-dot state-' + item.state} aria-hidden="true" />
                <span title={item.error || item.detail}>{stateLabel(item)}</span>
              </div>

              {item.state === 'analyzing' ? (
                <div className="source-progress" aria-label="Analysis progress">
                  <span style={{ width: (item.progress * 100).toFixed(1) + '%' }} />
                </div>
              ) : null}

              <div className="video-source-actions">
                {['queued', 'opening', 'preparing', 'analyzing'].includes(item.state) ? (
                  <button type="button" onClick={() => props.onCancel(item.id)}>Cancel</button>
                ) : null}
                {item.state === 'error' || item.state === 'cancelled' ? (
                  <button type="button" onClick={() => props.onRetry(item.id)}>Retry</button>
                ) : null}
                <button type="button" onClick={() => props.onRemove(item.id)}>Remove</button>
              </div>
            </article>
          ))}
        </div>
      )}

      {working ? (
        <p className="source-local-note">Analyzing locally · you can keep editing while this runs.</p>
      ) : null}
    </section>
  );
}
