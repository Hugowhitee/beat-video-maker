import type { ClipShot, ClipSource } from './types';
import {
  frameScenesToTimedScenes,
  predictionsToFrameScenes,
} from './shotBoundary';
import type { VideoSourceSession } from '../media/videoSource';
import {
  rgbaToDetectorRgb,
  TransNetWindowAssembler,
} from './transnetWindowing';
import type { DetectorWindow } from './transnetWindowing';
import type { TransNetRuntime } from './transnetRuntime';

export type VideoAnalysisProgress = {
  sourceId: string;
  phase: 'decode' | 'infer';
  processedFrames: number;
  currentTime: number;
  duration: number;
};

function abortError() {
  return new DOMException('Video analysis was cancelled.', 'AbortError');
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw abortError();
}

function canvasContext(
  canvas: HTMLCanvasElement | OffscreenCanvas,
) {
  const context = canvas.getContext('2d', {
    willReadFrequently: true,
  }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!context) throw new Error('Could not read decoded video frame pixels.');
  return context;
}

function boundaryConfidence(
  predictions: Float32Array,
  frameIndex: number,
) {
  let confidence = 0;
  for (
    let index = Math.max(0, frameIndex - 2);
    index <= Math.min(predictions.length - 1, frameIndex + 2);
    index += 1
  ) {
    confidence = Math.max(confidence, predictions[index] ?? 0);
  }
  return confidence;
}

function scenesToShots(
  session: VideoSourceSession,
  predictions: Float32Array,
  timestamps: number[],
) {
  const frameScenes = predictionsToFrameScenes(predictions);
  const timed = frameScenesToTimedScenes(
    frameScenes,
    timestamps,
    session.metadata.duration,
  );

  return timed
    .filter((scene) => scene.end > scene.start)
    .map<ClipShot>((scene, index) => ({
      id: `${session.metadata.id}-shot-${index + 1}`,
      sourceId: session.metadata.id,
      start: scene.start,
      end: scene.end,
      motion: 0.5,
      quality: 0.5,
      motionEvidence: 'unavailable',
      qualityEvidence: 'unavailable',
      boundaryKind: index === 0 ? 'source-start' : 'unknown',
      boundaryConfidence: index === 0
        ? 1
        : boundaryConfidence(predictions, scene.startFrame),
    }));
}

async function inferWindows(
  windows: DetectorWindow[],
  runtime: TransNetRuntime,
  output: number[],
  options: {
    sourceId: string;
    timestamps: number[];
    duration: number;
    signal?: AbortSignal;
    onProgress?: (progress: VideoAnalysisProgress) => void;
  },
) {
  for (const window of windows) {
    throwIfAborted(options.signal);
    const values = await runtime.runWindow(window);
    for (const value of values) output.push(value);
    const lastFrame = Math.min(
      options.timestamps.length - 1,
      window.outputStartFrame + window.outputFrameCount - 1,
    );
    options.onProgress?.({
      sourceId: options.sourceId,
      phase: 'infer',
      processedFrames: output.length,
      currentTime: options.timestamps[lastFrame] ?? 0,
      duration: options.duration,
    });
  }
}

export async function analyzeVideoSource(
  session: VideoSourceSession,
  runtime: TransNetRuntime,
  options: {
    signal?: AbortSignal;
    onProgress?: (progress: VideoAnalysisProgress) => void;
  } = {},
): Promise<ClipSource> {
  const assembler = new TransNetWindowAssembler();
  const timestamps: number[] = [];
  const predictions: number[] = [];

  try {
    for await (const frame of session.frames({
      width: 48,
      height: 27,
      fit: 'fill',
    })) {
      throwIfAborted(options.signal);
      const context = canvasContext(frame.canvas);
      const imageData = context.getImageData(0, 0, 48, 27);
      timestamps.push(frame.timestamp);

      const windows = assembler.push({
        rgb: rgbaToDetectorRgb(imageData.data),
        timestamp: frame.timestamp,
      });

      options.onProgress?.({
        sourceId: session.metadata.id,
        phase: 'decode',
        processedFrames: assembler.totalFrames,
        currentTime: frame.timestamp,
        duration: session.metadata.duration,
      });

      await inferWindows(windows, runtime, predictions, {
        sourceId: session.metadata.id,
        timestamps,
        duration: session.metadata.duration,
        signal: options.signal,
        onProgress: options.onProgress,
      });
    }

    if (timestamps.length === 0) {
      throw new Error('The selected video produced no decodable frames.');
    }

    await inferWindows(assembler.finish(), runtime, predictions, {
      sourceId: session.metadata.id,
      timestamps,
      duration: session.metadata.duration,
      signal: options.signal,
      onProgress: options.onProgress,
    });
    throwIfAborted(options.signal);

    const trimmed = new Float32Array(
      predictions.slice(0, timestamps.length),
    );

    return {
      id: session.metadata.id,
      name: session.metadata.name,
      duration: session.metadata.duration,
      role: 'footage',
      shots: scenesToShots(session, trimmed, timestamps),
    };
  } catch (error) {
    throw error;
  }
}
