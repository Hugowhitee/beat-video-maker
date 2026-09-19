import type { VideoCodec } from 'mediabunny';
import {
  AudioBufferSource,
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  Quality,
  canEncodeAudio,
  getFirstEncodableVideoCodec,
} from 'mediabunny';
import { renderComposition } from '../compositor/renderComposition';
import type { CompositionSettings } from '../compositor/types';

const WIDTH = 1920;
const HEIGHT = 1080;
const FPS = 30;

let aacFallbackRegistered = false;

async function ensureAacEncoder(audioBuffer?: AudioBuffer) {
  const config = {
    numberOfChannels: audioBuffer?.numberOfChannels || 2,
    sampleRate: audioBuffer?.sampleRate || 48_000,
    quality: new Quality({ bitrate: 192_000 }),
  };
  if (await canEncodeAudio('aac', config)) return true;

  if (!aacFallbackRegistered) {
    const extension = await import('@mediabunny/aac-encoder');
    extension.registerAacEncoder();
    aacFallbackRegistered = true;
  }
  return canEncodeAudio('aac', config);
}

async function pickVideoCodec(): Promise<VideoCodec | null> {
  return getFirstEncodableVideoCodec(['avc', 'vp9'], {
    width: WIDTH,
    height: HEIGHT,
    frameRate: FPS,
    quality: new Quality({ bitrate: 8_000_000 }),
  });
}

export type ExportCapability = {
  supported: boolean;
  videoCodec: VideoCodec | null;
  label: string;
};

export async function detectExportCapability(): Promise<ExportCapability> {
  if (typeof VideoEncoder === 'undefined') {
    return { supported: false, videoCodec: null, label: 'WebCodecs video encoding unavailable' };
  }

  const [videoCodec, audioReady] = await Promise.all([pickVideoCodec(), ensureAacEncoder()]);
  if (!videoCodec) return { supported: false, videoCodec: null, label: 'No MP4 video encoder available' };
  if (!audioReady) return { supported: false, videoCodec, label: 'AAC audio encoding unavailable' };

  return {
    supported: true,
    videoCodec,
    label: videoCodec === 'avc' ? 'MP4 · H.264 + AAC' : 'MP4 · VP9 + AAC fallback',
  };
}

type ExportOptions = {
  source: CanvasImageSource;
  audioBuffer: AudioBuffer;
  settings: CompositionSettings;
  videoCodec: VideoCodec;
  title: string;
  onProgress?: (progress: number) => void;
};

export async function exportMp4(options: ExportOptions): Promise<Blob> {
  const { source, audioBuffer, settings, videoCodec, title, onProgress } = options;
  if (!(await ensureAacEncoder(audioBuffer))) throw new Error('AAC encoding is unavailable in this browser.');

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Canvas 2D rendering is unavailable.');

  const target = new BufferTarget();
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
    target,
  });

  const videoSource = new CanvasSource(canvas, {
    codec: videoCodec,
    quality: new Quality({ bitrate: 8_000_000 }),
    keyFrameInterval: 2,
  });
  const audioSource = new AudioBufferSource({
    codec: 'aac',
    quality: new Quality({ bitrate: 192_000 }),
  });

  output.addVideoTrack(videoSource, { frameRate: FPS });
  output.addAudioTrack(audioSource);
  output.setMetadataTags({ title: title.trim() || 'Beat video' });
  await output.start();

  const frameCount = Math.max(1, Math.ceil(audioBuffer.duration * FPS));
  const exportSettings = { ...settings, showGuides: false };

  const feedVideo = async () => {
    for (let frame = 0; frame < frameCount; frame += 1) {
      const time = frame / FPS;
      renderComposition(ctx, {
        source,
        width: WIDTH,
        height: HEIGHT,
        time,
        settings: exportSettings,
      });
      await videoSource.add(time, 1 / FPS, frame % (FPS * 2) === 0 ? { keyFrame: true } : undefined);
      if (frame % 3 === 0 || frame === frameCount - 1) onProgress?.((frame + 1) / frameCount);
    }
    videoSource.close();
  };

  const feedAudio = async () => {
    await audioSource.add(audioBuffer);
    audioSource.close();
  };

  await Promise.all([feedVideo(), feedAudio()]);
  await output.finalize();

  if (!target.buffer || target.buffer.byteLength < 32) throw new Error('The encoder returned an empty MP4.');
  return new Blob([target.buffer], { type: 'video/mp4' });
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function safeExportName(title: string) {
  const cleaned = title
    .trim()
    .replace(/[^a-z0-9 _-]+/gi, '')
    .replace(/\s+/g, ' ')
    .slice(0, 80)
    .trim();
  return (cleaned || 'beat-video') + '.mp4';
}
