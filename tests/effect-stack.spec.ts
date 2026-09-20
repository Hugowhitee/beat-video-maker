import { expect, test } from '@playwright/test';
import { createEffectInstance } from '../src/features/effects/registry';
import {
  moveEffect,
  removeEffect,
  setEffectEnabled,
  setEffectStrength,
} from '../src/features/effects/stack';

function effects() {
  return [
    createEffectInstance('zoom-punch', { id: 'zoom' }),
    createEffectInstance('shake', { id: 'shake' }),
    createEffectInstance('glow', { id: 'glow' }),
  ];
}

test('effect stack order is explicit and reorderable', () => {
  const original = effects();
  const moved = moveEffect(original, 'glow', 0);

  expect(original.map((effect) => effect.id)).toEqual(['zoom', 'shake', 'glow']);
  expect(moved.map((effect) => effect.id)).toEqual(['glow', 'zoom', 'shake']);
});

test('effect enable and strength edits are immutable and bounded', () => {
  const original = effects();
  const disabled = setEffectEnabled(original, 'shake', false);
  const stronger = setEffectStrength(disabled, 'zoom', 4);

  expect(original[1]?.enabled).toBe(true);
  expect(disabled[1]?.enabled).toBe(false);
  expect(stronger[0]?.strength).toBe(1);
});

test('effect removal leaves unrelated instances untouched', () => {
  const original = effects();
  const next = removeEffect(original, 'shake');

  expect(next.map((effect) => effect.id)).toEqual(['zoom', 'glow']);
  expect(next[0]).toBe(original[0]);
  expect(next[1]).toBe(original[2]);
});
