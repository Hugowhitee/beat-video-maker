export async function loadImageFile(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('The selected image could not be decoded.'));
      image.src = url;
    });
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function decodeWithMediabunny(file: File): Promise<AudioBuffer> {
  const {
    ALL_FORMATS,
    AudioSampleSink,
    BlobSource,
    Input,
  } = await import('mediabunny');

  const input = new Input({
    source: new BlobSource(file),
    formats: ALL_FORMATS,
  });

  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track) throw new Error('No audio track found.');
    if (!(await track.canDecode())) throw new Error('Audio codec is not decodable.');

    const sampleRate = await track.getSampleRate();
    const numberOfChannels = await track.getNumberOfChannels();
    const duration = await track.computeDuration();

    if (
      !Number.isFinite(sampleRate) || sampleRate <= 0
      || !Number.isInteger(numberOfChannels) || numberOfChannels <= 0
      || !Number.isFinite(duration) || duration <= 0
    ) {
      throw new Error('Invalid audio stream metadata.');
    }

    const length = Math.max(1, Math.ceil(duration * sampleRate));
    const output = new AudioBuffer({
      length,
      numberOfChannels,
      sampleRate,
    });
    const outputChannels = Array.from(
      { length: numberOfChannels },
      (_, channel) => output.getChannelData(channel),
    );

    let wroteSamples = false;
    let lastYield = performance.now();
    const sink = new AudioSampleSink(track);

    for await (const sample of sink.samples()) {
      try {
        const frameCount = sample.numberOfFrames;
        const sourceChannels = sample.numberOfChannels;
        const interleaved = new Float32Array(frameCount * sourceChannels);
        sample.copyTo(interleaved, { format: 'f32', planeIndex: 0 });

        let outputStart = Math.round(sample.timestamp * sampleRate);
        let sourceStart = 0;
        if (outputStart < 0) {
          sourceStart = Math.min(frameCount, -outputStart);
          outputStart = 0;
        }

        const writableFrames = Math.min(
          frameCount - sourceStart,
          Math.max(0, length - outputStart),
        );

        for (let channel = 0; channel < numberOfChannels; channel += 1) {
          const sourceChannel = Math.min(channel, sourceChannels - 1);
          const destination = outputChannels[channel];
          for (let frame = 0; frame < writableFrames; frame += 1) {
            destination[outputStart + frame] =
              interleaved[(sourceStart + frame) * sourceChannels + sourceChannel] || 0;
          }
        }

        wroteSamples ||= writableFrames > 0;
      } finally {
        sample.close();
      }

      if (performance.now() - lastYield >= 8) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        lastYield = performance.now();
      }
    }

    if (!wroteSamples) throw new Error('Audio stream contained no decodable samples.');
    return output;
  } finally {
    input.dispose();
  }
}

async function decodeWithWebAudio(file: File): Promise<AudioBuffer> {
  const bytes = await file.arrayBuffer();
  const context = new AudioContext();
  try {
    return await context.decodeAudioData(bytes.slice(0));
  } finally {
    await context.close();
  }
}

export async function decodeAudioFile(file: File): Promise<AudioBuffer> {
  try {
    return await decodeWithMediabunny(file);
  } catch {
    try {
      return await decodeWithWebAudio(file);
    } catch {
      throw new Error('The selected audio file is not supported by this browser.');
    }
  }
}

export function buildPeaks(buffer: AudioBuffer, count = 120) {
  const channel = buffer.getChannelData(0);
  const block = Math.max(1, Math.floor(channel.length / count));
  const peaks: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const start = index * block;
    const end = Math.min(channel.length, start + block);
    let max = 0;
    for (let sample = start; sample < end; sample += 1) {
      max = Math.max(max, Math.abs(channel[sample] || 0));
    }
    peaks.push(Math.max(0.03, max));
  }
  const ceiling = Math.max(...peaks, 0.01);
  return peaks.map((peak) => peak / ceiling);
}

function yieldToMainThread() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

export async function buildPeaksAsync(buffer: AudioBuffer, count = 120) {
  const channel = buffer.getChannelData(0);
  const block = Math.max(1, Math.floor(channel.length / count));
  const peaks: number[] = [];

  for (let index = 0; index < count; index += 1) {
    const start = index * block;
    const end = Math.min(channel.length, start + block);
    let max = 0;
    for (let sample = start; sample < end; sample += 1) {
      max = Math.max(max, Math.abs(channel[sample] || 0));
    }
    peaks.push(Math.max(0.03, max));

    if ((index + 1) % 8 === 0) await yieldToMainThread();
  }

  const ceiling = Math.max(...peaks, 0.01);
  return peaks.map((peak) => peak / ceiling);
}

export function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const rounded = Math.floor(seconds);
  return Math.floor(rounded / 60) + ':' + String(rounded % 60).padStart(2, '0');
}

export function makeFixtureCover(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 1500;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const gradient = ctx.createLinearGradient(0, 0, 1200, 1500);
  gradient.addColorStop(0, '#936c8e');
  gradient.addColorStop(0.45, '#47394d');
  gradient.addColorStop(1, '#18191d');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1200, 1500);

  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.beginPath();
  ctx.arc(760, 520, 330, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(12,13,16,0.55)';
  ctx.fillRect(120, 940, 960, 330);
  ctx.fillStyle = '#f1e9ed';
  ctx.font = '700 92px ui-sans-serif, system-ui';
  ctx.fillText('COVER', 180, 1095);
  ctx.font = '400 42px ui-sans-serif, system-ui';
  ctx.fillText('visual QA fixture', 186, 1165);
  return canvas;
}
