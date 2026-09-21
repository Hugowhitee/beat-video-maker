export type OutputFormatPreset = 'youtube' | 'shorts' | 'square' | 'custom';
export type ResolutionTier = '1080p' | '1440p' | '2160p';
export type OutputFrameRate = 24 | 25 | 30 | 50 | 60;
export type BackgroundFill = 'blur' | 'black';

export type ProjectOutputSettings = {
  format: OutputFormatPreset;
  resolution: ResolutionTier;
  fps: OutputFrameRate;
  customWidth: number;
  customHeight: number;
  backgroundFill: BackgroundFill;
};

export type ResolvedOutputSettings = {
  width: number;
  height: number;
  fps: OutputFrameRate;
  format: OutputFormatPreset;
  resolution: ResolutionTier;
  backgroundFill: BackgroundFill;
  aspectLabel: string;
  summary: string;
};

const STORAGE_KEY = 'beatvideo-maker:project-output:v1';

export const DEFAULT_PROJECT_OUTPUT: ProjectOutputSettings = {
  format: 'youtube',
  resolution: '1080p',
  fps: 30,
  customWidth: 1920,
  customHeight: 1080,
  backgroundFill: 'blur',
};

const formatSet = new Set<OutputFormatPreset>(['youtube', 'shorts', 'square', 'custom']);
const resolutionSet = new Set<ResolutionTier>(['1080p', '1440p', '2160p']);
const fpsSet = new Set<OutputFrameRate>([24, 25, 30, 50, 60]);
const fillSet = new Set<BackgroundFill>(['blur', 'black']);

function boundedInteger(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(320, Math.min(3840, Math.round(value)))
    : fallback;
}

export function resolveProjectOutput(
  settings: ProjectOutputSettings,
): ResolvedOutputSettings {
  const longEdge =
    settings.resolution === '2160p' ? 3840
      : settings.resolution === '1440p' ? 2560
        : 1920;
  const shortEdge =
    settings.resolution === '2160p' ? 2160
      : settings.resolution === '1440p' ? 1440
        : 1080;

  let width = longEdge;
  let height = shortEdge;
  let aspectLabel = '16:9';

  if (settings.format === 'shorts') {
    width = shortEdge;
    height = longEdge;
    aspectLabel = '9:16';
  } else if (settings.format === 'square') {
    width = shortEdge;
    height = shortEdge;
    aspectLabel = '1:1';
  } else if (settings.format === 'custom') {
    width = boundedInteger(settings.customWidth, 1920);
    height = boundedInteger(settings.customHeight, 1080);
    aspectLabel = width + ':' + height;
  }

  return {
    width,
    height,
    fps: settings.fps,
    format: settings.format,
    resolution: settings.resolution,
    backgroundFill: settings.backgroundFill,
    aspectLabel,
    summary: width + '×' + height + ' · ' + settings.fps + ' fps',
  };
}

export function previewCanvasSize(output: ResolvedOutputSettings) {
  const maxLongEdge = 1280;
  const sourceLong = Math.max(output.width, output.height);
  const scale = Math.min(1, maxLongEdge / sourceLong);
  return {
    width: Math.max(1, Math.round(output.width * scale)),
    height: Math.max(1, Math.round(output.height * scale)),
  };
}

export function loadProjectOutputSettings(): ProjectOutputSettings {
  if (typeof localStorage === 'undefined') return DEFAULT_PROJECT_OUTPUT;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PROJECT_OUTPUT;
    const parsed = JSON.parse(raw) as Partial<ProjectOutputSettings>;
    return {
      format: formatSet.has(parsed.format as OutputFormatPreset)
        ? parsed.format as OutputFormatPreset
        : DEFAULT_PROJECT_OUTPUT.format,
      resolution: resolutionSet.has(parsed.resolution as ResolutionTier)
        ? parsed.resolution as ResolutionTier
        : DEFAULT_PROJECT_OUTPUT.resolution,
      fps: fpsSet.has(parsed.fps as OutputFrameRate)
        ? parsed.fps as OutputFrameRate
        : DEFAULT_PROJECT_OUTPUT.fps,
      customWidth: boundedInteger(parsed.customWidth, DEFAULT_PROJECT_OUTPUT.customWidth),
      customHeight: boundedInteger(parsed.customHeight, DEFAULT_PROJECT_OUTPUT.customHeight),
      backgroundFill: fillSet.has(parsed.backgroundFill as BackgroundFill)
        ? parsed.backgroundFill as BackgroundFill
        : DEFAULT_PROJECT_OUTPUT.backgroundFill,
    };
  } catch {
    return DEFAULT_PROJECT_OUTPUT;
  }
}

export function saveProjectOutputSettings(settings: ProjectOutputSettings) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
