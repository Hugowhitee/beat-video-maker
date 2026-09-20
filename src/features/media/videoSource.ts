import {
  ALL_FORMATS,
  BlobSource,
  CanvasSink,
  Input,
} from 'mediabunny';

export type VideoSourceMetadata = {
  id: string;
  name: string;
  duration: number;
  width: number;
  height: number;
  codec: string | null;
  firstTimestamp: number;
};

export type VideoCanvasOptions = {
  width?: number;
  height?: number;
  fit?: 'fill' | 'contain' | 'cover';
};

export type VideoCanvasFrame = {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  timestamp: number;
  duration: number;
};

export type VideoSourceSession = {
  metadata: VideoSourceMetadata;
  frameAt: (
    timestamp: number,
    options?: VideoCanvasOptions,
  ) => Promise<VideoCanvasFrame | null>;
  frames: (
    options?: VideoCanvasOptions,
  ) => AsyncGenerator<VideoCanvasFrame, void, unknown>;
  dispose: () => void;
};

function normalizeTimestamp(timestamp: number, firstTimestamp: number) {
  return Math.max(0, timestamp - firstTimestamp);
}

function clampToDuration(timestamp: number, duration: number) {
  if (!Number.isFinite(timestamp)) return 0;
  return Math.max(0, Math.min(duration, timestamp));
}

export async function openVideoSource(
  file: File,
  id: string,
): Promise<VideoSourceSession> {
  const input = new Input({
    source: new BlobSource(file),
    formats: ALL_FORMATS,
  });

  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) {
      throw new Error('The selected file does not contain a video track.');
    }
    if (!(await track.canDecode())) {
      throw new Error('The selected video codec is not decodable in this browser.');
    }

    const [
      firstTimestamp,
      endTimestamp,
      width,
      height,
      codec,
    ] = await Promise.all([
      track.getFirstTimestamp(),
      track.computeDuration(),
      track.getDisplayWidth(),
      track.getDisplayHeight(),
      track.getCodec(),
    ]);

    const duration = Math.max(0, endTimestamp - firstTimestamp);
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error('The selected video has no usable duration.');
    }

    const metadata: VideoSourceMetadata = {
      id,
      name: file.name,
      duration,
      width,
      height,
      codec,
      firstTimestamp,
    };

    const createSink = (options: VideoCanvasOptions = {}) => (
      new CanvasSink(track, {
        width: options.width,
        height: options.height,
        fit: options.fit ?? 'contain',
      })
    );

    const frameAt: VideoSourceSession['frameAt'] = async (
      timestamp,
      options = {},
    ) => {
      const sink = createSink(options);
      const requested = firstTimestamp + clampToDuration(timestamp, duration);
      const frame = await sink.getCanvas(requested);
      if (!frame) return null;

      return {
        canvas: frame.canvas,
        timestamp: normalizeTimestamp(frame.timestamp, firstTimestamp),
        duration: frame.duration,
      };
    };

    const frames: VideoSourceSession['frames'] = async function* (
      options = {},
    ) {
      const sink = createSink(options);
      for await (const frame of sink.canvases(firstTimestamp, endTimestamp)) {
        yield {
          canvas: frame.canvas,
          timestamp: normalizeTimestamp(frame.timestamp, firstTimestamp),
          duration: frame.duration,
        };
      }
    };

    return {
      metadata,
      frameAt,
      frames,
      dispose: () => input.dispose(),
    };
  } catch (error) {
    input.dispose();
    throw error;
  }
}
