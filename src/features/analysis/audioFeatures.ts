export type AmplitudeEnvelope = {
  values: Float32Array;
  rate: number;
};

function channelData(buffer: AudioBuffer) {
  return Array.from(
    { length: buffer.numberOfChannels },
    (_, channel) => buffer.getChannelData(channel),
  );
}

function envelopeFrame(
  channels: Float32Array[],
  buffer: AudioBuffer,
  frame: number,
  rate: number,
  halfWindow: number,
) {
  const center = Math.floor(frame / rate * buffer.sampleRate);
  const start = Math.max(0, center - halfWindow);
  const end = Math.min(buffer.length, center + halfWindow);
  let sumSquares = 0;
  let count = 0;

  for (let sample = start; sample < end; sample += 2) {
    let mono = 0;
    for (const channel of channels) mono += (channel[sample] || 0) / channels.length;
    sumSquares += mono * mono;
    count += 1;
  }

  return count ? Math.sqrt(sumSquares / count) : 0;
}

function normalizeEnvelope(values: Float32Array, peak: number) {
  const floor = peak * 0.08;
  const range = Math.max(1e-6, peak - floor);
  let previous = 0;

  for (let frame = 0; frame < values.length; frame += 1) {
    const normalized = Math.max(0, Math.min(1, (values[frame] - floor) / range));
    const smoothed = previous * 0.7 + normalized * 0.3;
    values[frame] = smoothed;
    previous = smoothed;
  }
}

export function buildAmplitudeEnvelope(
  buffer: AudioBuffer,
  rate = 60,
  windowSeconds = 0.05,
): AmplitudeEnvelope {
  const frameCount = Math.max(1, Math.ceil(buffer.duration * rate));
  const values = new Float32Array(frameCount);
  const halfWindow = Math.max(1, Math.floor(buffer.sampleRate * windowSeconds / 2));
  const channels = channelData(buffer);

  let peak = 0;
  for (let frame = 0; frame < frameCount; frame += 1) {
    const rms = envelopeFrame(channels, buffer, frame, rate, halfWindow);
    values[frame] = rms;
    peak = Math.max(peak, rms);
  }

  normalizeEnvelope(values, peak);
  return { values, rate };
}

function yieldToMainThread() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

export async function buildAmplitudeEnvelopeAsync(
  buffer: AudioBuffer,
  rate = 60,
  windowSeconds = 0.05,
): Promise<AmplitudeEnvelope> {
  const frameCount = Math.max(1, Math.ceil(buffer.duration * rate));
  const values = new Float32Array(frameCount);
  const halfWindow = Math.max(1, Math.floor(buffer.sampleRate * windowSeconds / 2));
  const channels = channelData(buffer);

  let peak = 0;
  for (let frame = 0; frame < frameCount; frame += 1) {
    const rms = envelopeFrame(channels, buffer, frame, rate, halfWindow);
    values[frame] = rms;
    peak = Math.max(peak, rms);

    if ((frame + 1) % 120 === 0) await yieldToMainThread();
  }

  normalizeEnvelope(values, peak);
  return { values, rate };
}

export function amplitudeAt(envelope: AmplitudeEnvelope | null, time: number) {
  if (!envelope || envelope.values.length === 0 || !Number.isFinite(time)) return 0;
  const position = Math.max(0, Math.min(envelope.values.length - 1, time * envelope.rate));
  const left = Math.floor(position);
  const right = Math.min(envelope.values.length - 1, left + 1);
  const mix = position - left;
  return envelope.values[left] * (1 - mix) + envelope.values[right] * mix;
}
