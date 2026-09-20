import type {
  BrandLayout,
  BrandPosition,
  MotionAmount,
  TitleAlign,
  TitleFont,
  VisualPreset,
} from '../compositor/types';

const STORAGE_KEY = 'beatvideo-maker:settings:v1';

type LegacyTitlePosition = 'top-left' | 'bottom-left' | 'bottom-center';

export type UserSettings = {
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
};

export const DEFAULT_USER_SETTINGS: UserSettings = {
  titleSize: 58,
  titleX: 0.055,
  titleY: 0.88,
  titleAlign: 'left',
  titleFont: 'clean',
  titleTracking: 1,
  brandText: '',
  brandLayout: 'corner',
  brandPosition: 'top-right',
  brandOpacity: 0.72,
  preset: 'clean',
  motion: 'low',
};

const titleAligns = new Set<TitleAlign>(['left', 'center', 'right']);
const titleFonts = new Set<TitleFont>(['clean', 'condensed', 'serif', 'mono']);
const brandLayouts = new Set<BrandLayout>(['corner', 'grid']);
const brandPositions = new Set<BrandPosition>(['top-left', 'top-right', 'bottom-left', 'bottom-right']);
const presets = new Set<VisualPreset>(['clean', 'ambient', 'reactive', 'pulse', 'visualizer']);
const motions = new Set<MotionAmount>(['off', 'low', 'medium']);

function numberInRange(value: unknown, minimum: number, maximum: number, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(minimum, Math.min(maximum, value))
    : fallback;
}

function legacyPlacement(position: unknown) {
  if (position === 'top-left') {
    return { titleX: 0.055, titleY: 0.14, titleAlign: 'left' as const };
  }
  if (position === 'bottom-center') {
    return { titleX: 0.5, titleY: 0.88, titleAlign: 'center' as const };
  }
  return { titleX: 0.055, titleY: 0.88, titleAlign: 'left' as const };
}

export function loadUserSettings(): UserSettings {
  if (typeof localStorage === 'undefined') return DEFAULT_USER_SETTINGS;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_USER_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<UserSettings> & {
      titlePosition?: LegacyTitlePosition;
    };
    const legacy = legacyPlacement(parsed.titlePosition);

    return {
      titleSize: numberInRange(parsed.titleSize, 36, 86, DEFAULT_USER_SETTINGS.titleSize),
      titleX: numberInRange(parsed.titleX, 0.02, 0.98, legacy.titleX),
      titleY: numberInRange(parsed.titleY, 0.06, 0.94, legacy.titleY),
      titleAlign: titleAligns.has(parsed.titleAlign as TitleAlign)
        ? parsed.titleAlign as TitleAlign
        : legacy.titleAlign,
      titleFont: titleFonts.has(parsed.titleFont as TitleFont)
        ? parsed.titleFont as TitleFont
        : DEFAULT_USER_SETTINGS.titleFont,
      titleTracking: numberInRange(parsed.titleTracking, -2, 8, DEFAULT_USER_SETTINGS.titleTracking),
      brandText: typeof parsed.brandText === 'string'
        ? parsed.brandText.slice(0, 60)
        : DEFAULT_USER_SETTINGS.brandText,
      brandLayout: brandLayouts.has(parsed.brandLayout as BrandLayout)
        ? parsed.brandLayout as BrandLayout
        : DEFAULT_USER_SETTINGS.brandLayout,
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
