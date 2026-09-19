import type {
  BrandPosition,
  MotionAmount,
  TitleFont,
  TitlePosition,
  VisualPreset,
} from '../compositor/types';

const STORAGE_KEY = 'beatvideo-maker:settings:v1';

export type UserSettings = {
  titleSize: number;
  titlePosition: TitlePosition;
  titleFont: TitleFont;
  titleTracking: number;
  brandText: string;
  brandPosition: BrandPosition;
  brandOpacity: number;
  preset: VisualPreset;
  motion: MotionAmount;
};

export const DEFAULT_USER_SETTINGS: UserSettings = {
  titleSize: 58,
  titlePosition: 'bottom-left',
  titleFont: 'clean',
  titleTracking: 1,
  brandText: '',
  brandPosition: 'top-right',
  brandOpacity: 0.72,
  preset: 'clean',
  motion: 'low',
};

const titlePositions = new Set<TitlePosition>(['top-left', 'bottom-left', 'bottom-center']);
const titleFonts = new Set<TitleFont>(['clean', 'condensed', 'serif', 'mono']);
const brandPositions = new Set<BrandPosition>(['top-left', 'top-right', 'bottom-left', 'bottom-right']);
const presets = new Set<VisualPreset>(['clean', 'ambient', 'reactive', 'pulse', 'visualizer']);
const motions = new Set<MotionAmount>(['off', 'low', 'medium']);

function numberInRange(value: unknown, minimum: number, maximum: number, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(minimum, Math.min(maximum, value))
    : fallback;
}

export function loadUserSettings(): UserSettings {
  if (typeof localStorage === 'undefined') return DEFAULT_USER_SETTINGS;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_USER_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<UserSettings>;

    return {
      titleSize: numberInRange(parsed.titleSize, 36, 86, DEFAULT_USER_SETTINGS.titleSize),
      titlePosition: titlePositions.has(parsed.titlePosition as TitlePosition)
        ? parsed.titlePosition as TitlePosition
        : DEFAULT_USER_SETTINGS.titlePosition,
      titleFont: titleFonts.has(parsed.titleFont as TitleFont)
        ? parsed.titleFont as TitleFont
        : DEFAULT_USER_SETTINGS.titleFont,
      titleTracking: numberInRange(parsed.titleTracking, -2, 8, DEFAULT_USER_SETTINGS.titleTracking),
      brandText: typeof parsed.brandText === 'string'
        ? parsed.brandText.slice(0, 60)
        : DEFAULT_USER_SETTINGS.brandText,
      brandPosition: brandPositions.has(parsed.brandPosition as BrandPosition)
        ? parsed.brandPosition as BrandPosition
        : DEFAULT_USER_SETTINGS.brandPosition,
      brandOpacity: numberInRange(parsed.brandOpacity, 0.2, 1, DEFAULT_USER_SETTINGS.brandOpacity),
      preset: presets.has(parsed.preset as VisualPreset)
        ? parsed.preset as VisualPreset
        : DEFAULT_USER_SETTINGS.preset,
      motion: motions.has(parsed.motion as MotionAmount)
        ? parsed.motion as MotionAmount
        : DEFAULT_USER_SETTINGS.motion,
    };
  } catch {
    return DEFAULT_USER_SETTINGS;
  }
}

export function saveUserSettings(settings: UserSettings) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function clearUserSettings() {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}
