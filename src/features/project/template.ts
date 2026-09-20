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
  effectParamRange,
  supportsTarget,
} from '../effects/registry';
import type {
  EffectModulation,
  EffectType,
  ModulationDriver,
  VisualEffectInstance,
  VisualTarget,
} from '../effects/types';
import type { UserSettings } from './settings';

const FORMAT = 'beatvideo-template';
const VERSION = 2;

type TemplateTitle = {
  text: string;
  size: number;
  x: number;
  y: number;
  align: TitleAlign;
  font: TitleFont;
  tracking: number;
};

type TemplateBrand = {
  text: string;
  layout: BrandLayout;
  position: BrandPosition;
  opacity: number;
};

export type BeatvideoTemplateV2 = {
  format: typeof FORMAT;
  version: typeof VERSION;
  title: TemplateTitle;
  brand: TemplateBrand;
  visual: {
    preset: VisualPreset;
    motion: MotionAmount;
    effects: VisualEffectInstance[];
    modulations: EffectModulation[];
  };
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

function requireObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(label + ' must be an object.');
  }
  return value as Record<string, unknown>;
}

function requireArray(value: unknown, label: string) {
  if (!Array.isArray(value)) throw new Error(label + ' must be a list.');
  return value;
}

function requireNumber(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(label + ' is outside the supported range.');
  }
  return value;
}

function requireBoolean(value: unknown, label: string) {
  if (typeof value !== 'boolean') throw new Error(label + ' must be true or false.');
  return value;
}

function requireString(value: unknown, label: string, maximum: number) {
  if (typeof value !== 'string') throw new Error(label + ' must be text.');
  if (value.length > maximum) throw new Error(label + ' is too long.');
  return value;
}

function requireEnum<T extends string>(
  value: unknown,
  label: string,
  values: Set<T>,
): T {
  if (typeof value !== 'string' || !values.has(value as T)) {
    throw new Error(label + ' is not supported.');
  }
  return value as T;
}

function parseTitle(value: unknown): TemplateTitle {
  const title = requireObject(value, 'Title');
  return {
    text: requireString(title.text, 'Title text', 80),
    size: requireNumber(title.size, 'Title size', 36, 86),
    x: requireNumber(title.x, 'Title X', 0.02, 0.98),
    y: requireNumber(title.y, 'Title Y', 0.06, 0.94),
    align: requireEnum(title.align, 'Title alignment', titleAligns),
    font: requireEnum(title.font, 'Title font', titleFonts),
    tracking: requireNumber(title.tracking, 'Title tracking', -2, 8),
  };
}

function parseBrand(value: unknown): TemplateBrand {
  const brand = requireObject(value, 'Brand');
  return {
    text: requireString(brand.text, 'Brand text', 60),
    layout: requireEnum(brand.layout, 'Brand layout', brandLayouts),
    position: requireEnum(brand.position, 'Brand position', brandPositions),
    opacity: requireNumber(brand.opacity, 'Brand opacity', 0.2, 1),
  };
}

function parseEffects(value: unknown): VisualEffectInstance[] {
  const input = requireArray(value, 'Effects');
  if (input.length > 16) throw new Error('Effects contains too many entries.');

  const ids = new Set<string>();
  return input.map((raw, index) => {
    const effect = requireObject(raw, 'Effect ' + (index + 1));
    const id = requireString(effect.id, 'Effect id', 120);
    if (!id || ids.has(id)) throw new Error('Effect ids must be unique.');
    ids.add(id);

    const type = requireEnum(effect.type, 'Effect type', effectTypes);
    const target = requireEnum(effect.target, 'Effect target', targets);
    if (!supportsTarget(type, target)) {
      throw new Error(effectDefinition(type).name + ' does not support that target.');
    }

    const params = requireObject(effect.params, 'Effect params');
    const defaults = effectDefinition(type).defaultParams;
    const parsedParams = Object.fromEntries(
      Object.keys(defaults).map((key) => {
        const range = effectParamRange(type, key);
        if (!range) throw new Error('Effect parameter ' + key + ' has no registry range.');
        return [
          key,
          requireNumber(params[key], 'Effect parameter ' + key, range.min, range.max),
        ];
      }),
    );

    return {
      id,
      type,
      target,
      enabled: requireBoolean(effect.enabled, 'Effect enabled'),
      strength: requireNumber(effect.strength, 'Effect strength', 0, 1),
      params: parsedParams,
    };
  });
}

function parseModulations(
  value: unknown,
  effects: readonly VisualEffectInstance[],
): EffectModulation[] {
  const input = requireArray(value, 'Modulations');
  if (input.length > 16) throw new Error('Modulations contains too many entries.');

  const effectById = new Map(effects.map((effect) => [effect.id, effect]));
  const ids = new Set<string>();

  return input.map((raw, index) => {
    const modulation = requireObject(raw, 'Modulation ' + (index + 1));
    const id = requireString(modulation.id, 'Modulation id', 120);
    if (!id || ids.has(id)) throw new Error('Modulation ids must be unique.');
    ids.add(id);

    const effectId = requireString(modulation.effectId, 'Modulation effect id', 120);
    const effect = effectById.get(effectId);
    if (!effect) throw new Error('Modulation references an unknown effect.');

    if (modulation.parameter !== 'strength') {
      throw new Error('Modulation parameter is not supported.');
    }

    const driver = requireEnum(modulation.driver, 'Modulation driver', drivers);
    if (!effectDefinition(effect.type).drivers.includes(driver)) {
      throw new Error(effectDefinition(effect.type).name + ' does not support that modulation.');
    }

    return {
      id,
      effectId,
      parameter: 'strength',
      driver,
      amount: requireNumber(modulation.amount, 'Modulation amount', 0, 1),
      enabled: requireBoolean(modulation.enabled, 'Modulation enabled'),
    };
  });
}

function parseVisual(
  value: unknown,
  version: 1 | 2,
): BeatvideoTemplateV2['visual'] {
  const visual = requireObject(value, 'Visual');
  const base = {
    preset: requireEnum(visual.preset, 'Visual preset', presets),
    motion: requireEnum(visual.motion, 'Motion amount', motions),
  };

  if (version === 1) {
    return { ...base, effects: [], modulations: [] };
  }

  const effects = parseEffects(visual.effects);
  return {
    ...base,
    effects,
    modulations: parseModulations(visual.modulations, effects),
  };
}

export function createTemplate(
  title: string,
  settings: UserSettings,
): BeatvideoTemplateV2 {
  return {
    format: FORMAT,
    version: VERSION,
    title: {
      text: title.slice(0, 80),
      size: settings.titleSize,
      x: settings.titleX,
      y: settings.titleY,
      align: settings.titleAlign,
      font: settings.titleFont,
      tracking: settings.titleTracking,
    },
    brand: {
      text: settings.brandText.slice(0, 60),
      layout: settings.brandLayout,
      position: settings.brandPosition,
      opacity: settings.brandOpacity,
    },
    visual: {
      preset: settings.preset,
      motion: settings.motion,
      effects: settings.effects.map((effect) => ({
        ...effect,
        params: { ...effect.params },
      })),
      modulations: settings.modulations.map((modulation) => ({ ...modulation })),
    },
  };
}

export function parseTemplate(text: string): BeatvideoTemplateV2 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Template is not valid JSON.');
  }

  const root = requireObject(parsed, 'Template');
  if (root.format !== FORMAT) {
    throw new Error('This is not a Beatvideo Maker template.');
  }
  if (root.version !== 1 && root.version !== VERSION) {
    throw new Error('This template version is not supported.');
  }

  const version = root.version as 1 | 2;
  return {
    format: FORMAT,
    version: VERSION,
    title: parseTitle(root.title),
    brand: parseBrand(root.brand),
    visual: parseVisual(root.visual, version),
  };
}

export function serializeTemplate(template: BeatvideoTemplateV2) {
  return JSON.stringify(template, null, 2) + '\n';
}

export function settingsFromTemplate(template: BeatvideoTemplateV2): UserSettings {
  return {
    titleSize: template.title.size,
    titleX: template.title.x,
    titleY: template.title.y,
    titleAlign: template.title.align,
    titleFont: template.title.font,
    titleTracking: template.title.tracking,
    brandText: template.brand.text,
    brandLayout: template.brand.layout,
    brandPosition: template.brand.position,
    brandOpacity: template.brand.opacity,
    preset: template.visual.preset,
    motion: template.visual.motion,
    effects: template.visual.effects.map((effect) => ({
      ...effect,
      params: { ...effect.params },
    })),
    modulations: template.visual.modulations.map((modulation) => ({ ...modulation })),
  };
}

export function safeTemplateName(title: string) {
  const cleaned = title
    .trim()
    .replace(/[^a-z0-9 _-]+/gi, '')
    .replace(/\s+/g, ' ')
    .slice(0, 64)
    .trim();
  return (cleaned || 'beatvideo') + '.beatvideo-template.json';
}
