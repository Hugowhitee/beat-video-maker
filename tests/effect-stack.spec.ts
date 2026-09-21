import { expect, test } from '@playwright/test';
import { createEffectInstance } from '../src/features/effects/registry';
import {
  canMoveEffectWithinTarget,
  moveEffect,
  moveEffectWithinTarget,
  removeEffect,
  setEffectEnabled,
  setEffectStrength,
  setEffectTarget,
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


test('effect target edits preserve order and reject unsupported targets', () => {
  const blur = createEffectInstance('blur', { id: 'blur' });
  const original = [...effects(), blur];

  const movedBlur = setEffectTarget(original, 'blur', 'composite');
  expect(movedBlur.map((effect) => effect.id)).toEqual(['zoom', 'shake', 'glow', 'blur']);
  expect(movedBlur[3]?.target).toBe('composite');
  expect(original[3]?.target).toBe('background');

  const invalidGlow = setEffectTarget(original, 'glow', 'background');
  expect(invalidGlow[2]?.target).toBe('composite');
});


test('target-local reordering skips unrelated target rows', () => {
  const foregroundA = createEffectInstance('zoom-punch', { id: 'fg-a' });
  const composite = createEffectInstance('glow', { id: 'composite' });
  const foregroundB = createEffectInstance('shake', { id: 'fg-b' });
  const original = [foregroundA, composite, foregroundB];

  expect(canMoveEffectWithinTarget(original, 'fg-b', -1)).toBe(true);
  expect(canMoveEffectWithinTarget(original, 'fg-a', -1)).toBe(false);
  expect(canMoveEffectWithinTarget(original, 'composite', -1)).toBe(false);

  const next = moveEffectWithinTarget(original, 'fg-b', -1);
  expect(next.map((effect) => effect.id)).toEqual(['fg-b', 'fg-a', 'composite']);
  expect(original.map((effect) => effect.id)).toEqual(['fg-a', 'composite', 'fg-b']);
});
