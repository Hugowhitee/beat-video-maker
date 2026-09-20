import type {
  BrandLayout,
  BrandPosition,
  MotionAmount,
  TitleAlign,
  TitleFont,
  VisualPreset,
} from '../compositor/types';
import {
  EFFECT_TYPES,
  effectDefinition,
  supportsTarget,
} from '../effects/registry';
import type {
  EffectModulation,
  EffectType,
  ModulationDriver,
  VisualEffectInstance,
  VisualTarget,
} from '../effects/types';

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
  effects: VisualEffectInstance[];
  modulations: EffectModulation[];
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
  effects: [],
  modulations: [],
};

const titleAligns = new Set<TitleAlign>(['left', 'center', 'right']);
const titleFonts = new Set<TitleFont>(['clean', 'condensed', 'serif', 'mono']);
const brandLayouts = new Set<BrandLayout>(['corner', 'grid']);
const brandPositions = new Set<BrandPosition>(['top-left', 'top-right', 'bottom-left', 'bottom-right']);
const presets = new Set<VisualPreset>(['clean', 'ambient', 'reactive', 'pulse', 'visualizer']);
const motions = new Set<MotionAmount>(['off', 'low', 'medium']);
const effectTypes = new Set<EffectType>(EFFECT_TYPES);
const targets = new Set<VisualTarget>(['background', 'foreground', 'composite']);
const drivers = new Set<ModulationDriver>(['beat', 'downbeat', 'phrase', 'amplitude']);

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

function sanitizeParams(
  value: unknown,
  defaults: Record<string, number>,
) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...defaults };
  }

  const candidate = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(defaults).map(([key, fallback]) => [
      key,
      typeof candidate[key] === 'number' && Number.isFinite(candidate[key])
        ? candidate[key]
        : fallback,
    ]),
  );
}

function sanitizeEffects(value: unknown): VisualEffectInstance[] {
  if (!Array.isArray(value)) return [];

  const output: VisualEffectInstance[] = [];
  const ids = new Set<string>();

  for (const raw of value.slice(0, 16)) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const candidate = raw as Record<string, unknown>;
    if (typeof candidate.id !== 'string' || !candidate.id || ids.has(candidate.id)) continue;
    if (typeof candidate.type !== 'string' || !effectTypes.has(candidate.type as EffectType)) continue;

    const type = candidate.type as EffectType;
    const definition = effectDefinition(type);
    const requestedTarget = targets.has(candidate.target as VisualTarget)
      ? candidate.target as VisualTarget
      : definition.defaultTarget;
    const target = supportsTarget(type, requestedTarget)
      ? requestedTarget
      : definition.defaultTarget;

    output.push({
      id: candidate.id.slice(0, 120),
      type,
      target,
      enabled: candidate.enabled !== false,
      strength: numberInRange(candidate.strength, 0, 1, definition.defaultStrength),
      params: sanitizeParams(candidate.params, definition.defaultParams),
    });
    ids.add(candidate.id);
  }

  return output;
}

function sanitizeModulations(
  value: unknown,
  effects: readonly VisualEffectInstance[],
): EffectModulation[] {
  if (!Array.isArray(value)) return [];
  const effectById = new Map(effects.map((effect) => [effect.id, effect]));
  const ids = new Set<string>();
  const output: EffectModulation[] = [];

  for (const raw of value.slice(0, 16)) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const candidate = raw as Record<string, unknown>;
    if (typeof candidate.id !== 'string' || !candidate.id || ids.has(candidate.id)) continue;
    if (typeof candidate.effectId !== 'string') continue;
    const effect = effectById.get(candidate.effectId);
    if (!effect) continue;
    if (candidate.parameter !== 'strength') continue;
    if (typeof candidate.driver !== 'string' || !drivers.has(candidate.driver as ModulationDriver)) continue;

    const driver = candidate.driver as ModulationDriver;
    if (!effectDefinition(effect.type).drivers.includes(driver)) continue;

    output.push({
      id: candidate.id.slice(0, 120),
      effectId: effect.id,
      parameter: 'strength',
      driver,
      amount: numberInRange(candidate.amount, 0, 1, 1),
      enabled: candidate.enabled !== false,
    });
    ids.add(candidate.id);
  }

  return output;
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
    const effects = sanitizeEffects(parsed.effects);

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
      effects,
      modulations: sanitizeModulations(parsed.modulations, effects),
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
