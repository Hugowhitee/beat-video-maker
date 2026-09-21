import {
  TRANSNET_V2_CONTEXT_FRAMES,
  TRANSNET_V2_FRAME_HEIGHT,
  TRANSNET_V2_FRAME_WIDTH,
  TRANSNET_V2_OUTPUT_FRAMES,
  TRANSNET_V2_WINDOW_FRAMES,
} from './shotBoundary';

export const TRANSNET_V2_RGB_BYTES =
  TRANSNET_V2_FRAME_WIDTH * TRANSNET_V2_FRAME_HEIGHT * 3;

export type DetectorFrame = {
  rgb: Uint8Array;
  timestamp: number;
};

export type DetectorWindow = {
  rgb: Uint8Array;
  outputStartFrame: number;
  outputFrameCount: number;
};

function assertFrame(frame: DetectorFrame) {
  if (frame.rgb.length !== TRANSNET_V2_RGB_BYTES) {
    throw new Error(
      `TransNetV2 frame must contain exactly ${TRANSNET_V2_RGB_BYTES} RGB bytes.`,
    );
  }
  if (!Number.isFinite(frame.timestamp) || frame.timestamp < 0) {
    throw new Error('TransNetV2 frame timestamp must be finite and non-negative.');
  }
}

function copyWindow(frames: readonly Uint8Array[]) {
  if (frames.length !== TRANSNET_V2_WINDOW_FRAMES) {
    throw new Error('TransNetV2 window must contain exactly 100 frames.');
  }

  const rgb = new Uint8Array(
    TRANSNET_V2_WINDOW_FRAMES * TRANSNET_V2_RGB_BYTES,
  );
  frames.forEach((frame, index) => {
    rgb.set(frame, index * TRANSNET_V2_RGB_BYTES);
  });
  return rgb;
}

/**
 * Streaming equivalent of the upstream TransNetV2 25 / 50 / 25 window iterator.
 * Only the center 50 predictions of every 100-frame window belong to the video.
 */
export class TransNetWindowAssembler {
  private buffer: Uint8Array[] = [];
  private firstFrame: Uint8Array | null = null;
  private lastFrame: Uint8Array | null = null;
  private frameCount = 0;
  private windowsEmitted = 0;
  private finished = false;

  push(frame: DetectorFrame): DetectorWindow[] {
    if (this.finished) throw new Error('Cannot push frames after finish().');
    assertFrame(frame);

    if (!this.firstFrame) {
      this.firstFrame = frame.rgb.slice();
      for (let index = 0; index < TRANSNET_V2_CONTEXT_FRAMES; index += 1) {
        this.buffer.push(this.firstFrame);
      }
    }

    const owned = frame.rgb.slice();
    this.buffer.push(owned);
    this.lastFrame = owned;
    this.frameCount += 1;

    return this.drain(false);
  }

  finish(): DetectorWindow[] {
    if (this.finished) return [];
    this.finished = true;
    if (!this.lastFrame || this.frameCount === 0) return [];

    const remainder = this.frameCount % TRANSNET_V2_OUTPUT_FRAMES;
    const trailing =
      TRANSNET_V2_CONTEXT_FRAMES
      + TRANSNET_V2_OUTPUT_FRAMES
      - (remainder === 0 ? TRANSNET_V2_OUTPUT_FRAMES : remainder);

    for (let index = 0; index < trailing; index += 1) {
      this.buffer.push(this.lastFrame);
    }

    return this.drain(true);
  }

  get totalFrames() {
    return this.frameCount;
  }

  private drain(final: boolean) {
    const windows: DetectorWindow[] = [];

    while (this.buffer.length >= TRANSNET_V2_WINDOW_FRAMES) {
      const outputStartFrame = this.windowsEmitted * TRANSNET_V2_OUTPUT_FRAMES;
      const remaining = Math.max(0, this.frameCount - outputStartFrame);
      const outputFrameCount = final
        ? Math.min(TRANSNET_V2_OUTPUT_FRAMES, remaining)
        : TRANSNET_V2_OUTPUT_FRAMES;

      windows.push({
        rgb: copyWindow(this.buffer.slice(0, TRANSNET_V2_WINDOW_FRAMES)),
        outputStartFrame,
        outputFrameCount,
      });
      this.windowsEmitted += 1;
      this.buffer.splice(0, TRANSNET_V2_OUTPUT_FRAMES);
    }

    return windows;
  }
}

export function rgbaToDetectorRgb(rgba: Uint8ClampedArray) {
  const expectedPixels = TRANSNET_V2_FRAME_WIDTH * TRANSNET_V2_FRAME_HEIGHT;
  if (rgba.length !== expectedPixels * 4) {
    throw new Error('Detector RGBA frame has unexpected dimensions.');
  }

  const rgb = new Uint8Array(expectedPixels * 3);
  let target = 0;
  for (let source = 0; source < rgba.length; source += 4) {
    rgb[target] = rgba[source] ?? 0;
    rgb[target + 1] = rgba[source + 1] ?? 0;
    rgb[target + 2] = rgba[source + 2] ?? 0;
    target += 3;
  }
  return rgb;
}
