import { expect, test } from '@playwright/test';

test('opens and samples a real local video through Mediabunny', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-normal', 'Video source decoding is viewport-independent.');

  await page.goto('/');

  const result = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 36;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('2D canvas unavailable.');

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
      ? 'video/webm;codecs=vp8'
      : 'video/webm';
    const stream = canvas.captureStream(12);
    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks: Blob[] = [];

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };

    const stopped = new Promise<void>((resolve, reject) => {
      recorder.onstop = () => resolve();
      recorder.onerror = () => reject(new Error('MediaRecorder failed.'));
    });

    recorder.start(100);
    for (let frame = 0; frame < 15; frame += 1) {
      context.fillStyle = frame < 5 ? '#111111' : frame < 10 ? '#f0f0f0' : '#6c6c6c';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = '#ffffff';
      context.fillRect((frame * 4) % 56, 12, 8, 12);
      await new Promise((resolve) => setTimeout(resolve, 84));
    }
    recorder.stop();
    await stopped;
    stream.getTracks().forEach((track) => track.stop());

    const file = new File(chunks, 'source.webm', { type: mimeType });
    const modulePath = '/src/features/media/videoSource.ts';
    const module = await import(modulePath);
    const session = await module.openVideoSource(file, 'source-1');

    try {
      const sample = await session.frameAt(session.metadata.duration / 2, {
        width: 48,
        height: 27,
        fit: 'fill',
      });

      let streamedFrames = 0;
      for await (const frame of session.frames({
        width: 48,
        height: 27,
        fit: 'fill',
      })) {
        if (frame.timestamp < -0.001) throw new Error('Frame time was not normalized.');
        streamedFrames += 1;
        if (streamedFrames >= 3) break;
      }

      return {
        metadata: session.metadata,
        sample: sample
          ? {
              width: sample.canvas.width,
              height: sample.canvas.height,
              timestamp: sample.timestamp,
            }
          : null,
        streamedFrames,
      };
    } finally {
      session.dispose();
    }
  });

  expect(result.metadata.name).toBe('source.webm');
  expect(result.metadata.duration).toBeGreaterThan(0.5);
  expect(result.metadata.width).toBe(64);
  expect(result.metadata.height).toBe(36);
  expect(result.sample).not.toBeNull();
  expect(result.sample?.width).toBe(48);
  expect(result.sample?.height).toBe(27);
  expect(result.sample?.timestamp).toBeGreaterThanOrEqual(0);
  expect(result.sample?.timestamp).toBeLessThanOrEqual(result.metadata.duration + 0.05);
  expect(result.streamedFrames).toBeGreaterThanOrEqual(1);
});
