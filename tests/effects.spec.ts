import { expect, test } from '@playwright/test';
import { createDefaultModulation, createEffectInstance, effectDefinition } from '../src/features/effects/registry';
import { effectStrength, evaluateEffectStack, pulseEnvelope } from '../src/features/effects/evaluate';
import type { VerifiedGrid } from '../src/features/analysis/types';

const grid: VerifiedGrid = {
  bpm: 120,
  beatOffset: 0,
  barOffset: 0,
  source: 'manual',
};

test('curated effect registry keeps targets intentionally narrow', () => {
  expect(effectDefinition('zoom-punch').targets).toEqual(['foreground']);
  expect(effectDefinition('background-drift').targets).toEqual(['background']);
  expect(effectDefinition('glow').targets).toEqual(['composite']);
  expect(effectDefinition('blur').targets).toEqual(['background', 'composite']);
});

test('three effects can be evaluated together without replacing each other', () => {
  const zoom = createEffectInstance('zoom-punch', { id: 'zoom' });
  const shake = createEffectInstance('shake', { id: 'shake' });
  const glow = createEffectInstance('glow', { id: 'glow' });
  const mods = [zoom, shake, glow]
    .map((effect) => createDefaultModulation(effect, 'mod-' + effect.id))
    .filter((value) => value !== null);

  const evaluated = evaluateEffectStack(
    [zoom, shake, glow],
    mods,
    { time: 0.075, grid, audioLevel: 0.7 },
  );

  expect(evaluated.map((effect) => effect.type)).toEqual([
    'zoom-punch',
    'shake',
    'glow',
  ]);
  expect(evaluated.every((effect) => effectStrength(effect) > 0)).toBe(true);
});

test('beat pulse is analytic and frame-rate independent', () => {
  expect(pulseEnvelope(0)).toBe(0);
  expect(pulseEnvelope(0.15)).toBeCloseTo(1, 6);
  expect(pulseEnvelope(0.99)).toBeGreaterThanOrEqual(0);
  expect(pulseEnvelope(1)).toBe(0);

  const effect = createEffectInstance('zoom-punch', { id: 'zoom' });
  const modulation = createDefaultModulation(effect, 'mod')!;

  const early = evaluateEffectStack([effect], [modulation], {
    time: 0.075,
    grid,
  })[0];
  const late = evaluateEffectStack([effect], [modulation], {
    time: 0.45,
    grid,
  })[0];

  expect(effectStrength(early)).toBeGreaterThan(effectStrength(late));
});

test('phrase modulation is signed so drift can travel in both directions', () => {
  const drift = createEffectInstance('background-drift', { id: 'drift' });
  const modulation = createDefaultModulation(drift, 'mod')!;

  const positive = evaluateEffectStack([drift], [modulation], {
    time: 2,
    grid,
  })[0];
  const negative = evaluateEffectStack([drift], [modulation], {
    time: 6,
    grid,
  })[0];

  expect(positive.signal).toBeGreaterThan(0);
  expect(negative.signal).toBeLessThan(0);
});
