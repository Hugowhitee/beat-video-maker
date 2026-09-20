import { expect, test } from '@playwright/test';
import {
  frameScenesToTimedScenes,
  predictionsToFrameScenes,
} from '../src/features/auto-edit/transnetv2';

test('TransNetV2 post-process follows the upstream boundary-run semantics', () => {
  const predictions = [
    0.01, 0.02, 0.04,
    0.9, 0.92,
    0.03, 0.02, 0.02,
    0.8,
    0.01, 0.01,
  ];

  expect(predictionsToFrameScenes(predictions)).toEqual([
    { startFrame: 0, endFrame: 3 },
    { startFrame: 5, endFrame: 8 },
    { startFrame: 9, endFrame: 10 },
  ]);
});

test('TransNetV2 post-process keeps an all-boundary signal as one safe scene', () => {
  expect(predictionsToFrameScenes([0.9, 0.95, 0.8])).toEqual([
    { startFrame: 0, endFrame: 2 },
  ]);
});

test('frame scenes convert to normalized source time without overshooting duration', () => {
  const scenes = [
    { startFrame: 0, endFrame: 2 },
    { startFrame: 3, endFrame: 5 },
  ];
  const timestamps = [0, 0.04, 0.08, 0.12, 0.16, 0.2];

  expect(frameScenesToTimedScenes(scenes, timestamps, 0.24)).toEqual([
    {
      startFrame: 0,
      endFrame: 2,
      start: 0,
      end: 0.12,
    },
    {
      startFrame: 3,
      endFrame: 5,
      start: 0.12,
      end: 0.24,
    },
  ]);
});
