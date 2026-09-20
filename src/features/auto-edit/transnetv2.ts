/**
 * Thin browser contract for the upstream TransNetV2 shot-boundary model.
 *
 * Model/source provenance:
 * https://github.com/soCzech/TransNetV2
 * MIT License, Copyright (c) 2020 Tomáš Souček.
 *
 * This file intentionally contains only the model contract and the small
 * prediction-to-scene post-process adapted from upstream. Neural inference is
 * supplied by the upstream model through an ONNX runtime adapter.
 */

export const TRANSNET_V2_FRAME_WIDTH = 48;
export const TRANSNET_V2_FRAME_HEIGHT = 27;
export const TRANSNET_V2_WINDOW_FRAMES = 100;
export const TRANSNET_V2_CONTEXT_FRAMES = 25;
export const TRANSNET_V2_OUTPUT_FRAMES = 50;
export const TRANSNET_V2_THRESHOLD = 0.5;

export type FrameScene = {
  startFrame: number;
  endFrame: number;
};

export type TimedScene = FrameScene & {
  start: number;
  end: number;
};

export function predictionsToFrameScenes(
  predictions: ArrayLike<number>,
  threshold = TRANSNET_V2_THRESHOLD,
): FrameScene[] {
  if (predictions.length === 0) return [];

  const scenes: FrameScene[] = [];
  let previous = 0;
  let start = 0;
  let current = 0;

  for (let index = 0; index < predictions.length; index += 1) {
    current = Number(predictions[index] ?? 0) > threshold ? 1 : 0;

    if (previous === 1 && current === 0) {
      start = index;
    }

    if (previous === 0 && current === 1 && index !== 0) {
      scenes.push({
        startFrame: start,
        endFrame: index,
      });
    }

    previous = current;
  }

  if (current === 0) {
    scenes.push({
      startFrame: start,
      endFrame: predictions.length - 1,
    });
  }

  if (scenes.length === 0) {
    return [{
      startFrame: 0,
      endFrame: predictions.length - 1,
    }];
  }

  return scenes;
}

export function frameScenesToTimedScenes(
  scenes: FrameScene[],
  frameTimestamps: ArrayLike<number>,
  sourceDuration: number,
): TimedScene[] {
  if (scenes.length === 0) return [];

  return scenes.map((scene) => {
    const start = Number(frameTimestamps[scene.startFrame] ?? 0);
    const nextFrameTimestamp = Number(frameTimestamps[scene.endFrame + 1]);
    const end = Number.isFinite(nextFrameTimestamp)
      ? nextFrameTimestamp
      : sourceDuration;

    return {
      ...scene,
      start: Math.max(0, Math.min(sourceDuration, start)),
      end: Math.max(start, Math.min(sourceDuration, end)),
    };
  });
}
