import type {
  BrandLayout,
  BrandPosition,
  MotionAmount,
  TitleAlign,
  TitleFont,
  VisualPreset,
} from '../compositor/types';
import type { UserSettings } from './settings';

const FORMAT = 'beatvideo-template';
const VERSION = 1;

export type BeatvideoTemplateV1 = {
  format: typeof FORMAT;
  version: typeof VERSION;
  title: {
    text: string;
    size: number;
    x: number;
    y: number;
    align: TitleAlign;
    font: TitleFont;
    tracking: number;
  };
  brand: {
    text: string;
    layout: BrandLayout;
    position: BrandPosition;
    opacity: number;
  };
  visual: {
    preset: VisualPreset;
    motion: MotionAmount;
  };
};

const titleAligns = new Set<TitleAlign>(['left', 'center', 'right']);
const titleFonts = new Set<TitleFont>(['clean', 'condensed', 'serif', 'mono']);
const brandLayouts = new Set<BrandLayout>(['corner', 'grid']);
const brandPositions = new Set<BrandPosition>(['top-left', 'top-right', 'bottom-left', 'bottom-right']);
const presets = new Set<VisualPreset>(['clean', 'ambient', 'reactive', 'pulse', 'visualizer']);
const motions = new Set<MotionAmount>(['off', 'low', 'medium']);

function requireObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(label + ' must be an object.');
  }
  return value as Record<string, unknown>;
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

export function createTemplate(
  title: string,
  settings: UserSettings,
): BeatvideoTemplateV1 {
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
    },
  };
}

export function parseTemplate(text: string): BeatvideoTemplateV1 {
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
  if (root.version !== VERSION) {
    throw new Error('This template version is not supported.');
  }

  const title = requireObject(root.title, 'Title');
  const brand = requireObject(root.brand, 'Brand');
  const visual = requireObject(root.visual, 'Visual');

  return {
    format: FORMAT,
    version: VERSION,
    title: {
      text: requireString(title.text, 'Title text', 80),
      size: requireNumber(title.size, 'Title size', 36, 86),
      x: requireNumber(title.x, 'Title X', 0.02, 0.98),
      y: requireNumber(title.y, 'Title Y', 0.06, 0.94),
      align: requireEnum(title.align, 'Title alignment', titleAligns),
      font: requireEnum(title.font, 'Title font', titleFonts),
      tracking: requireNumber(title.tracking, 'Title tracking', -2, 8),
    },
    brand: {
      text: requireString(brand.text, 'Brand text', 60),
      layout: requireEnum(brand.layout, 'Brand layout', brandLayouts),
      position: requireEnum(brand.position, 'Brand position', brandPositions),
      opacity: requireNumber(brand.opacity, 'Brand opacity', 0.2, 1),
    },
    visual: {
      preset: requireEnum(visual.preset, 'Visual preset', presets),
      motion: requireEnum(visual.motion, 'Motion amount', motions),
    },
  };
}

export function serializeTemplate(template: BeatvideoTemplateV1) {
  return JSON.stringify(template, null, 2) + '\n';
}

export function settingsFromTemplate(template: BeatvideoTemplateV1): UserSettings {
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
