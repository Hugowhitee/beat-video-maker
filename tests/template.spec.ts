import { expect, test } from '@playwright/test';
import {
  createTemplate,
  parseTemplate,
  safeTemplateName,
  serializeTemplate,
  settingsFromTemplate,
} from '../src/features/project/template';
import { DEFAULT_USER_SETTINGS } from '../src/features/project/settings';
import {
  createDefaultModulation,
  createEffectInstance,
} from '../src/features/effects/registry';

test('editable template round-trips authoring settings without media', () => {
  const zoom = createEffectInstance('zoom-punch', { id: 'zoom-template' });
  const zoomModulation = createDefaultModulation(zoom, 'mod-template')!;

  const settings = {
    ...DEFAULT_USER_SETTINGS,
    titleSize: 72,
    titleX: 0.5,
    titleY: 0.5,
    titleAlign: 'center' as const,
    titleFont: 'mono' as const,
    titleTracking: 3,
    brandText: 'prod. usolido',
    brandLayout: 'grid' as const,
    brandOpacity: 0.45,
    preset: 'reactive' as const,
    motion: 'medium' as const,
    effects: [zoom],
    modulations: [zoomModulation],
  };

  const template = createTemplate('CENTERED TITLE', settings);
  const serialized = serializeTemplate(template);
  const parsed = parseTemplate(serialized);

  expect(parsed).toEqual(template);
  expect(settingsFromTemplate(parsed)).toEqual(settings);
  expect(serialized).not.toContain('audio');
  expect(serialized).not.toContain('image');
  expect(serialized).not.toContain('blob');
});

test('template parser fails closed before unsupported data can mutate editor state', () => {
  expect(() => parseTemplate('{ definitely not json')).toThrow(/valid JSON/i);
  expect(() => parseTemplate(JSON.stringify({
    format: 'other-app',
    version: 1,
  }))).toThrow(/not a Beatvideo Maker template/i);

  const valid = createTemplate('TITLE', DEFAULT_USER_SETTINGS);
  expect(() => parseTemplate(JSON.stringify({
    ...valid,
    version: 99,
  }))).toThrow(/version is not supported/i);

  expect(() => parseTemplate(JSON.stringify({
    ...valid,
    title: {
      ...valid.title,
      x: 4,
    },
  }))).toThrow(/Title X/i);
});

test('template filenames remain local-file friendly', () => {
  expect(safeTemplateName('  Night / Drive: 01  '))
    .toBe('Night Drive 01.beatvideo-template.json');
  expect(safeTemplateName('')).toBe('beatvideo.beatvideo-template.json');
});


test('version 1 templates migrate into the version 2 effect contract', () => {
  const current = createTemplate('LEGACY', DEFAULT_USER_SETTINGS);
  const legacy = {
    ...current,
    version: 1,
    visual: {
      preset: current.visual.preset,
      motion: current.visual.motion,
    },
  };

  const parsed = parseTemplate(JSON.stringify(legacy));
  expect(parsed.version).toBe(2);
  expect(parsed.visual.effects).toEqual([]);
  expect(parsed.visual.modulations).toEqual([]);
});


test('effect parameters outside registry ranges fail closed', () => {
  const zoom = createEffectInstance('zoom-punch', { id: 'zoom-bounds' });
  const template = createTemplate('BOUNDS', {
    ...DEFAULT_USER_SETTINGS,
    effects: [zoom],
    modulations: [],
  });

  expect(() => parseTemplate(JSON.stringify({
    ...template,
    visual: {
      ...template.visual,
      effects: template.visual.effects.map((effect) => (
        effect.id === 'zoom-bounds'
          ? { ...effect, params: { ...effect.params, scale: 9 } }
          : effect
      )),
    },
  }))).toThrow(/Effect parameter scale/i);
});


test('template parser rejects duplicate strength modulation for one effect', () => {
  const effect = createEffectInstance('zoom-punch', { id: 'zoom-duplicate-mod' });
  const first = createDefaultModulation(effect, 'mod-a')!;
  const second = { ...first, id: 'mod-b', driver: 'amplitude' as const };
  const template = createTemplate('DUPLICATE MOD', {
    ...DEFAULT_USER_SETTINGS,
    effects: [effect],
    modulations: [first, second],
  });

  expect(() => parseTemplate(JSON.stringify(template)))
    .toThrow(/one strength modulation/i);
});
