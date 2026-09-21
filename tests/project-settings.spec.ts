import { expect, test } from '@playwright/test';
import {
  DEFAULT_PROJECT_OUTPUT,
  previewCanvasSize,
  resolveProjectOutput,
} from '../src/features/project/projectSettings';

test('resolves common publishing formats to real dimensions', () => {
  expect(resolveProjectOutput(DEFAULT_PROJECT_OUTPUT)).toMatchObject({
    width: 1920,
    height: 1080,
    fps: 30,
    aspectLabel: '16:9',
  });

  expect(resolveProjectOutput({
    ...DEFAULT_PROJECT_OUTPUT,
    format: 'shorts',
    resolution: '1440p',
    fps: 60,
  })).toMatchObject({
    width: 1440,
    height: 2560,
    fps: 60,
    aspectLabel: '9:16',
  });

  expect(resolveProjectOutput({
    ...DEFAULT_PROJECT_OUTPUT,
    format: 'square',
  })).toMatchObject({
    width: 1080,
    height: 1080,
    aspectLabel: '1:1',
  });
});

test('custom output is bounded and preview keeps the same aspect', () => {
  const output = resolveProjectOutput({
    ...DEFAULT_PROJECT_OUTPUT,
    format: 'custom',
    customWidth: 3000,
    customHeight: 1200,
  });
  expect(output.width).toBe(3000);
  expect(output.height).toBe(1200);

  const preview = previewCanvasSize(output);
  expect(preview.width / preview.height).toBeCloseTo(output.width / output.height, 2);
  expect(Math.max(preview.width, preview.height)).toBeLessThanOrEqual(1280);
});
