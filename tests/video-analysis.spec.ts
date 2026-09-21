import { expect, test } from '@playwright/test';
import {
  TRANSNET_V2_RGB_BYTES,
  TransNetWindowAssembler,
  rgbaToDetectorRgb,
} from '../src/features/auto-edit/transnetWindowing';
import {
  transNetRuntimeInternals,
} from '../src/features/auto-edit/transnetRuntime';

function frame(value: number, timestamp: number) {
  return {
    rgb: new Uint8Array(TRANSNET_V2_RGB_BYTES).fill(value),
    timestamp,
  };
}

function windowPixel(window: Uint8Array, frameIndex: number) {
  return window[frameIndex * TRANSNET_V2_RGB_BYTES];
}

test('TransNetV2 streaming windows match upstream 25/50/25 padding', () => {
  const assembler = new TransNetWindowAssembler();
  const windows = [];

  for (let index = 0; index < 75; index += 1) {
    windows.push(...assembler.push(frame(index, index / 25)));
  }
  windows.push(...assembler.finish());

  expect(windows).toHaveLength(2);
  expect(windows[0]?.outputStartFrame).toBe(0);
  expect(windows[0]?.outputFrameCount).toBe(50);
  expect(windows[1]?.outputStartFrame).toBe(50);
  expect(windows[1]?.outputFrameCount).toBe(25);

  const first = windows[0]!.rgb;
  expect(windowPixel(first, 0)).toBe(0);
  expect(windowPixel(first, 24)).toBe(0);
  expect(windowPixel(first, 25)).toBe(0);
  expect(windowPixel(first, 74)).toBe(49);
  expect(windowPixel(first, 99)).toBe(74);

  const second = windows[1]!.rgb;
  expect(windowPixel(second, 0)).toBe(25);
  expect(windowPixel(second, 24)).toBe(49);
  expect(windowPixel(second, 25)).toBe(50);
  expect(windowPixel(second, 49)).toBe(74);
  expect(windowPixel(second, 50)).toBe(74);
  expect(windowPixel(second, 99)).toBe(74);
});

test('short videos still produce one correctly padded detector window', () => {
  const assembler = new TransNetWindowAssembler();
  const windows = [];

  for (let index = 0; index < 10; index += 1) {
    windows.push(...assembler.push(frame(index + 1, index / 25)));
  }
  windows.push(...assembler.finish());

  expect(windows).toHaveLength(1);
  expect(windows[0]?.outputFrameCount).toBe(10);
  expect(windowPixel(windows[0]!.rgb, 0)).toBe(1);
  expect(windowPixel(windows[0]!.rgb, 24)).toBe(1);
  expect(windowPixel(windows[0]!.rgb, 25)).toBe(1);
  expect(windowPixel(windows[0]!.rgb, 34)).toBe(10);
  expect(windowPixel(windows[0]!.rgb, 99)).toBe(10);
});

test('RGBA detector frames are packed into RGB without alpha', () => {
  const pixels = new Uint8ClampedArray(48 * 27 * 4);
  pixels.set([12, 34, 56, 78, 90, 123, 145, 167]);

  const rgb = rgbaToDetectorRgb(pixels);
  expect(rgb).toHaveLength(TRANSNET_V2_RGB_BYTES);
  expect(Array.from(rgb.slice(0, 6))).toEqual([12, 34, 56, 90, 123, 145]);
});

test('runtime validates model metadata and extracts only center logits', () => {
  const input = transNetRuntimeInternals.validateInput({
    inputNames: ['input'],
    outputNames: ['534', '535'],
    inputMetadata: [{
      isTensor: true,
      name: 'input',
      shape: [1, 100, 27, 48, 3],
      type: 'float32',
    }],
    outputMetadata: [
      { isTensor: true, name: '534', shape: [1, 100, 1], type: 'float32' },
      { isTensor: true, name: '535', shape: [1, 100, 1], type: 'float32' },
    ],
    run: async () => ({}),
  });

  expect(input).toEqual({
    name: 'input',
    type: 'float32',
    dimensions: [1, 100, 27, 48, 3],
  });

  const logits = new Float32Array(100);
  logits[25] = 0;
  logits[26] = Math.log(3);
  const center = transNetRuntimeInternals.centerPredictions(logits, 2);
  expect(center[0]).toBeCloseTo(0.5, 5);
  expect(center[1]).toBeCloseTo(0.75, 5);
});

test('runtime rejects an incompatible detector model instead of guessing', () => {
  expect(() => transNetRuntimeInternals.validateInput({
    inputNames: ['images'],
    outputNames: ['result'],
    inputMetadata: [{
      isTensor: true,
      name: 'images',
      shape: [1, 50, 27, 48, 3],
      type: 'float32',
    }],
    outputMetadata: [],
    run: async () => ({}),
  })).toThrow(/input shape/i);
});

test('real browser frame pipeline produces ClipSource shots through runtime contract', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-normal', 'Video analysis contract is viewport-independent.');
  await page.goto('/');

  const result = await page.evaluate(async () => {
    const modulePath = '/src/features/auto-edit/analyzeVideoSource.ts';
    const analyzer = await import(modulePath);

    async function* frames() {
      for (let index = 0; index < 12; index += 1) {
        const canvas = new OffscreenCanvas(48, 27);
        const context = canvas.getContext('2d')!;
        context.fillStyle = index < 6 ? '#111111' : '#eeeeee';
        context.fillRect(0, 0, 48, 27);
        yield {
          canvas,
          timestamp: index * 0.1,
          duration: 0.1,
        };
      }
    }

    const session = {
      metadata: {
        id: 'video-1',
        name: 'fixture.webm',
        duration: 1.2,
        width: 48,
        height: 27,
        codec: 'vp8',
        firstTimestamp: 0,
      },
      frameAt: async () => null,
      frames,
      dispose: () => undefined,
    };

    const progress: string[] = [];
    const runtime = {
      runWindow: async (window: { outputFrameCount: number }) => {
        const predictions = new Float32Array(window.outputFrameCount);
        if (predictions.length > 6) {
          predictions[5] = 0.95;
          predictions[6] = 0.9;
        }
        return predictions;
      },
      dispose: async () => undefined,
    };

    const source = await analyzer.analyzeVideoSource(session, runtime, {
      onProgress: (entry: { phase: string }) => progress.push(entry.phase),
    });

    return {
      source,
      phases: Array.from(new Set(progress)),
    };
  });

  expect(result.source.id).toBe('video-1');
  expect(result.source.role).toBe('footage');
  expect(result.source.shots.length).toBeGreaterThanOrEqual(2);
  expect(result.source.shots[0]?.boundaryKind).toBe('source-start');
  expect(result.source.shots[1]?.boundaryKind).toBe('unknown');
  expect(result.source.shots[1]?.boundaryConfidence).toBeGreaterThan(0.8);
  expect(result.source.shots.every((shot: { motionEvidence?: string }) =>
    shot.motionEvidence === 'unavailable'
  )).toBeTruthy();
  expect(result.phases).toContain('decode');
  expect(result.phases).toContain('infer');
});

test('analysis cancellation aborts before additional inference', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-normal', 'Cancellation contract is viewport-independent.');
  await page.goto('/');

  const result = await page.evaluate(async () => {
    const modulePath = '/src/features/auto-edit/analyzeVideoSource.ts';
    const analyzer = await import(modulePath);
    const controller = new AbortController();

    async function* frames() {
      for (let index = 0; index < 100; index += 1) {
        if (index === 3) controller.abort();
        const canvas = new OffscreenCanvas(48, 27);
        yield { canvas, timestamp: index * 0.04, duration: 0.04 };
      }
    }

    let runs = 0;
    try {
      await analyzer.analyzeVideoSource({
        metadata: {
          id: 'cancel',
          name: 'cancel.webm',
          duration: 4,
          width: 48,
          height: 27,
          codec: 'vp8',
          firstTimestamp: 0,
        },
        frameAt: async () => null,
        frames,
        dispose: () => undefined,
      }, {
        runWindow: async () => {
          runs += 1;
          return new Float32Array(50);
        },
        dispose: async () => undefined,
      }, {
        signal: controller.signal,
      });
      return { name: 'none', runs };
    } catch (error) {
      return {
        name: error instanceof DOMException ? error.name : 'other',
        runs,
      };
    }
  });

  expect(result.name).toBe('AbortError');
  expect(result.runs).toBe(0);
});
