import { expect, test } from '@playwright/test';
import { classifyMediaFiles } from '../src/features/media/classifyMediaFiles';

test('routes a mixed local drop to the right media owners', () => {
  const image = new File(['x'], 'cover.png', { type: 'image/png' });
  const audio = new File(['x'], 'beat.wav', { type: 'audio/wav' });
  const videoA = new File(['x'], 'a.mp4', { type: 'video/mp4' });
  const videoB = new File(['x'], 'b.mov', { type: '' });
  const text = new File(['x'], 'notes.txt', { type: 'text/plain' });

  const result = classifyMediaFiles([image, audio, videoA, videoB, text]);
  expect(result.image?.name).toBe('cover.png');
  expect(result.audio?.name).toBe('beat.wav');
  expect(result.videos.map((file) => file.name)).toEqual(['a.mp4', 'b.mov']);
  expect(result.unsupported.map((file) => file.name)).toEqual(['notes.txt']);
});
