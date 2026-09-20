import { expect, test } from '@playwright/test';
import {
  createTemplate,
  parseTemplate,
  safeTemplateName,
  serializeTemplate,
  settingsFromTemplate,
} from '../src/features/project/template';
import { DEFAULT_USER_SETTINGS } from '../src/features/project/settings';

test('editable template round-trips authoring settings without media', () => {
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
