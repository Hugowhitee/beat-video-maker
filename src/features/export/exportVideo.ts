import type { AudioCodec, VideoCodec } from 'mediabunny';
import {
  AudioBufferSource,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  Quality,
  WebMOutputFormat,
  canEncodeAudio,
  getFirstEncodableVideoCodec,
} from 'mediabunny';
import { renderComposition } from '../compositor/renderComposition';
import type { CompositionSettings } from '../compositor/types';
import { amplitudeAt } from '../analysis/audioFeatures';
import type { AmplitudeEnvelope } from '../analysis/audioFeatures';
import type { VerifiedGrid } from '../analysis/types';
import { createExportTarget } from './outputTarget';
import {
  DEFAULT_PROJECT_OUTPUT,
  resolveProjectOutput,
} from '../project/projectSettings';
import type { ResolvedOutputSettings } from '../project/projectSettings';

const DEFAULT_OUTPUT = resolveProjectOutput(DEFAULT_PROJECT_OUTPUT);

let aacFallbackRegistered = false;

const videoQuality = (output: ResolvedOutputSettings = DEFAULT_OUTPUT) => {
  const baselinePixelsPerSecond = 1920 * 1080 * 30;
  const pixelsPerSecond = output.width * output.height * output.fps;
  const bitrate = Math.round(
    Math.max(6_000_000, Math.min(35_000_000, 8_000_000 * (pixelsPerSecond / baselinePixelsPerSecond))),
  );
  return new Quality({ bitrate });
};
const audioQuality = () => new Quality({ bitrate: 192_000 });

async function canUseAudioCodec(codec: AudioCodec, audioBuffer?: AudioBuffer) {
  return canEncodeAudio(codec, {
    numberOfChannels: audioBuffer?.numberOfChannels || 2,
    sampleRate: audioBuffer?.sampleRate || 48_000,
    quality: audioQuality(),
  });
}

async function ensureAacEncoder(audioBuffer?: AudioBuffer) {
  if (await canUseAudioCodec('aac', audioBuffer)) return true;

  if (!aacFallbackRegistered) {
    const extension = await import('@mediabunny/aac-encoder');
    extension.registerAacEncoder();
    aacFallbackRegistered = true;
  }

  return canUseAudioCodec('aac', audioBuffer);
}

async function pickVideoCodec(
  codecs: VideoCodec[],
  output: ResolvedOutputSettings = DEFAULT_OUTPUT,
): Promise<VideoCodec | null> {
  return getFirstEncodableVideoCodec(codecs, {
    width: output.width,
    height: output.height,
    frameRate: output.fps,
    quality: videoQuality(output),
  });
}

export type ExportCapability = {
  supported: boolean;
  container: 'mp4' | 'webm' | null;
  extension: 'mp4' | 'webm' | null;
  mimeType: 'video/mp4' | 'video/webm' | null;
  videoCodec: VideoCodec | null;
  audioCodec: AudioCodec | null;
  label: string;
};

export async function detectExportCapability(
  output: ResolvedOutputSettings = DEFAULT_OUTPUT,
): Promise<ExportCapability> {
  if (typeof VideoEncoder === 'undefined') {
    return {
      supported: false,
      container: null,
      extension: null,
      mimeType: null,
      videoCodec: null,
      audioCodec: null,
      label: 'WebCodecs video encoding unavailable',
    };
  }

  const avc = await pickVideoCodec(['avc'], output);
  if (avc && await ensureAacEncoder()) {
    return {
      supported: true,
      container: 'mp4',
      extension: 'mp4',
      mimeType: 'video/mp4',
      videoCodec: avc,
      audioCodec: 'aac',
      label: 'MP4 · H.264 + AAC',
    };
  }

  const vp9 = await pickVideoCodec(['vp9'], output);
  if (vp9 && await canUseAudioCodec('opus')) {
    return {
      supported: true,
      container: 'webm',
      extension: 'webm',
      mimeType: 'video/webm',
      videoCodec: vp9,
      audioCodec: 'opus',
      label: 'WebM fallback · VP9 + Opus',
    };
  }

  return {
    supported: false,
    container: null,
    extension: null,
    mimeType: null,
    videoCodec: null,
    audioCodec: null,
    label: 'No supported H.264/AAC or VP9/Opus export path',
  };
}

type ExportOptions = {
  source: CanvasImageSource;
  audioBuffer: AudioBuffer;
  settings: CompositionSettings;
  capability: ExportCapability;
  title: string;
  grid: VerifiedGrid | null;
  amplitudeEnvelope: AmplitudeEnvelope | null;
  output: ResolvedOutputSettings;
  signal?: AbortSignal;
  onProgress?: (progress: number) => void;
};

export type EncodedVideo = {
  blob: Blob;
  extension: 'mp4' | 'webm';
  targetKind: 'memory' | 'opfs';
  release: () => Promise<void>;
};

function abortError() {
  return new DOMException('Export cancelled.', 'AbortError');
}

export async function exportVideo(options: ExportOptions): Promise<EncodedVideo> {
  const {
    source,
    audioBuffer,
    settings,
    capability,
    title,
    grid,
    amplitudeEnvelope,
    output: exportOutput,
    signal,
    onProgress,
  } = options;

  if (
    !capability.supported ||
    !capability.container ||
    !capability.extension ||
    !capability.mimeType ||
    !capability.videoCodec ||
    !capability.audioCodec
  ) {
    throw new Error('No supported export path is available.');
  }

  if (signal?.aborted) throw abortError();

  if (capability.audioCodec === 'aac' && !(await ensureAacEncoder(audioBuffer))) {
    throw new Error('AAC encoding is unavailable in this browser.');
  }
  if (capability.audioCodec === 'opus' && !(await canUseAudioCodec('opus', audioBuffer))) {
    throw new Error('Opus encoding is unavailable in this browser.');
  }

  const canvas = document.createElement('canvas');
  canvas.width = exportOutput.width;
  canvas.height = exportOutput.height;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Canvas 2D rendering is unavailable.');

  const outputTarget = await createExportTarget(capability.extension, capability.mimeType);
  const format = capability.container === 'mp4'
    ? new Mp4OutputFormat({ fastStart: outputTarget.kind === 'memory' ? 'in-memory' : false })
    : new WebMOutputFormat();

  const output = new Output({
    format,
    target: outputTarget.target,
  });

  const videoSource = new CanvasSource(canvas, {
    codec: capability.videoCodec,
    quality: videoQuality(exportOutput),
    keyFrameInterval: 2,
  });
  const audioSource = new AudioBufferSource({
    codec: capability.audioCodec,
    quality: audioQuality(),
  });

  output.addVideoTrack(videoSource, { frameRate: exportOutput.fps });
  output.addAudioTrack(audioSource);
  output.setMetadataTags({ title: title.trim() || 'Beat video' });

  try {
    await output.start();

    const frameCount = Math.max(1, Math.ceil(audioBuffer.duration * exportOutput.fps));
    const exportSettings = { ...settings, showGuides: false, showGrid: false };

    const feedVideo = async () => {
      for (let frame = 0; frame < frameCount; frame += 1) {
        if (signal?.aborted) throw abortError();

        const time = frame / exportOutput.fps;
        renderComposition(ctx, {
          source,
          width: exportOutput.width,
          height: exportOutput.height,
          time,
          settings: exportSettings,
          grid,
          audioLevel: amplitudeAt(amplitudeEnvelope, time),
        });
        await videoSource.add(
          time,
          1 / exportOutput.fps,
          frame % (exportOutput.fps * 2) === 0 ? { keyFrame: true } : undefined,
        );

        if (frame % 3 === 0 || frame === frameCount - 1) {
          onProgress?.((frame + 1) / frameCount);
        }
      }
      videoSource.close();
    };

    const feedAudio = async () => {
      if (signal?.aborted) throw abortError();
      await audioSource.add(audioBuffer);
      audioSource.close();
    };

    await Promise.all([feedVideo(), feedAudio()]);
    if (signal?.aborted) throw abortError();

    await output.finalize();
    const blob = await outputTarget.complete();

    return {
      blob,
      extension: capability.extension,
      targetKind: outputTarget.kind,
      release: outputTarget.discard,
    };
  } catch (error) {
    if (output.state !== 'canceled' && output.state !== 'finalized') {
      await output.cancel().catch(() => undefined);
    }
    await outputTarget.discard();

    if (signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
      throw abortError();
    }
    throw error;
  }
}

export function downloadBlob(
  blob: Blob,
  fileName: string,
  release?: () => Promise<void>,
) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
    void release?.();
  }, 30_000);
}

export function safeExportName(title: string, extension: 'mp4' | 'webm') {
  const cleaned = title
    .trim()
    .replace(/[^a-z0-9 _-]+/gi, '')
    .replace(/\s+/g, ' ')
    .slice(0, 80)
    .trim();
  return (cleaned || 'beat-video') + '.' + extension;
}
