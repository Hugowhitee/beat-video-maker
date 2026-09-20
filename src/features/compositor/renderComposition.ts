import { phrasePhaseAt } from '../analysis/musicalClock';
import type { CompositionFrame, TitleFont } from './types';

type Context2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const SAFE_X = 0.055;
const SAFE_Y = 0.075;

const TITLE_FONTS: Record<TitleFont, string> = {
  clean: 'Inter, Arial, "Liberation Sans", ui-sans-serif, system-ui, sans-serif',
  condensed: '"Arial Narrow", "Liberation Sans Narrow", "Roboto Condensed", sans-serif',
  serif: 'Georgia, "Times New Roman", "Liberation Serif", serif',
  mono: '"IBM Plex Mono", "Cascadia Mono", Consolas, "Liberation Mono", monospace',
};

function sourceSize(source: CanvasImageSource) {
  const candidate = source as {
    naturalWidth?: number;
    naturalHeight?: number;
    videoWidth?: number;
    videoHeight?: number;
    width?: number;
    height?: number;
  };
  return {
    width: candidate.naturalWidth || candidate.videoWidth || candidate.width || 1,
    height: candidate.naturalHeight || candidate.videoHeight || candidate.height || 1,
  };
}

function fittedRect(
  source: CanvasImageSource,
  width: number,
  height: number,
  mode: 'contain' | 'cover',
) {
  const size = sourceSize(source);
  const scale = mode === 'cover'
    ? Math.max(width / size.width, height / size.height)
    : Math.min(width / size.width, height / size.height);
  const drawWidth = size.width * scale;
  const drawHeight = size.height * scale;
  return {
    x: (width - drawWidth) / 2,
    y: (height - drawHeight) / 2,
    width: drawWidth,
    height: drawHeight,
  };
}

function drawFitted(
  ctx: Context2D,
  source: CanvasImageSource,
  width: number,
  height: number,
  mode: 'contain' | 'cover',
) {
  const rect = fittedRect(source, width, height, mode);
  ctx.drawImage(source, rect.x, rect.y, rect.width, rect.height);
}

function drawPlaceholder(ctx: Context2D, width: number, height: number) {
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#202429');
  gradient.addColorStop(0.48, '#121416');
  gradient.addColorStop(1, '#090a0b');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.strokeStyle = '#bac2c8';
  ctx.lineWidth = Math.max(1, width / 900);
  const step = width / 14;
  for (let x = -height; x < width + height; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + height, height);
    ctx.stroke();
  }
  ctx.restore();
}

function motionStrength(frame: CompositionFrame) {
  if (frame.settings.motion === 'off') return 0;
  return frame.settings.motion === 'medium' ? 1 : 0.55;
}

function phraseMotion(frame: CompositionFrame) {
  if (frame.grid?.barOffset == null) return 0;
  const phase = phrasePhaseAt(frame.time, frame.grid, 8);
  return Math.sin(phase * Math.PI * 2);
}

function drawBackground(ctx: Context2D, frame: CompositionFrame) {
  if (!frame.source) return;

  const { width, height, source, settings } = frame;
  const strength = motionStrength(frame);
  const musicalMotion = phraseMotion(frame);
  const presetAmount =
    settings.preset === 'clean' ? 0.35
      : settings.preset === 'ambient' || settings.preset === 'reactive' ? 1
        : settings.preset === 'pulse' ? 0.6
          : 0.35;

  const panX = width * 0.009 * strength * presetAmount * musicalMotion;
  const panY = height * 0.005 * strength * presetAmount * Math.cos(frame.time * 0.15 + musicalMotion);
  const scale = 1 + 0.012 * strength * presetAmount * (0.5 + 0.5 * musicalMotion);

  ctx.save();
  ctx.filter =
    'blur(' + Math.max(18, width * 0.022) + 'px) '
    + 'brightness(' + (settings.preset === 'ambient' ? 0.46 : 0.42) + ') '
    + 'saturate(' + (settings.preset === 'reactive' ? 0.9 : 0.76) + ')';
  ctx.globalAlpha = 0.92;
  ctx.translate(width / 2 + panX, height / 2 + panY);
  ctx.scale(scale, scale);
  ctx.translate(-width / 2, -height / 2);
  ctx.translate(-width * 0.025, -height * 0.045);
  drawFitted(ctx, source, width * 1.05, height * 1.09, 'cover');
  ctx.restore();
}

function titleFont(font: TitleFont, size: number) {
  return '700 ' + size + 'px ' + TITLE_FONTS[font];
}

function measureTrackedText(ctx: Context2D, text: string, tracking: number) {
  if (!text) return 0;
  let width = 0;
  const glyphs = Array.from(text);
  for (let index = 0; index < glyphs.length; index += 1) {
    width += ctx.measureText(glyphs[index]).width;
    if (index < glyphs.length - 1) width += tracking;
  }
  return width;
}

function drawTrackedText(
  ctx: Context2D,
  text: string,
  x: number,
  y: number,
  tracking: number,
  align: CanvasTextAlign,
) {
  const glyphs = Array.from(text);
  const totalWidth = measureTrackedText(ctx, text, tracking);
  let cursor = x;
  if (align === 'center') cursor -= totalWidth / 2;
  if (align === 'right' || align === 'end') cursor -= totalWidth;

  ctx.textAlign = 'left';
  for (let index = 0; index < glyphs.length; index += 1) {
    const glyph = glyphs[index];
    ctx.fillText(glyph, cursor, y);
    cursor += ctx.measureText(glyph).width;
    if (index < glyphs.length - 1) cursor += tracking;
  }
}

function fitText(
  ctx: Context2D,
  text: string,
  maxWidth: number,
  preferred: number,
  minimum: number,
  font: TitleFont,
  tracking: number,
) {
  let size = preferred;
  while (size > minimum) {
    ctx.font = titleFont(font, size);
    if (measureTrackedText(ctx, text, tracking) <= maxWidth) break;
    size -= 2;
  }
  return size;
}

function drawTitle(ctx: Context2D, frame: CompositionFrame) {
  const text = frame.settings.title.trim();
  if (!text) return;

  const { width, height } = frame;
  const safeX = width * SAFE_X;
  const safeY = height * SAFE_Y;
  const preferred = frame.settings.titleSize * (height / 720);
  const tracking = frame.settings.titleTracking * (height / 720);
  const size = fitText(
    ctx,
    text,
    width * 0.76,
    preferred,
    26 * (height / 720),
    frame.settings.titleFont,
    tracking,
  );

  let phraseAccent = 0;
  if (frame.settings.preset === 'pulse' && frame.grid?.barOffset != null && frame.settings.motion !== 'off') {
    const phase = phrasePhaseAt(frame.time, frame.grid, 8);
    const distance = Math.min(phase, 1 - phase);
    phraseAccent = Math.max(0, 1 - distance / 0.035);
  }

  ctx.save();
  ctx.font = titleFont(frame.settings.titleFont, size);
  ctx.fillStyle = '#f5f4ef';
  ctx.globalAlpha = 0.94 + phraseAccent * 0.06;
  ctx.textBaseline = 'alphabetic';
  ctx.shadowColor = 'rgba(0,0,0,0.72)';
  ctx.shadowBlur = size * (0.17 + phraseAccent * 0.06);
  ctx.shadowOffsetY = size * 0.04;

  if (frame.settings.titlePosition === 'top-left') {
    drawTrackedText(ctx, text, safeX, safeY + size, tracking, 'left');
  } else if (frame.settings.titlePosition === 'bottom-center') {
    drawTrackedText(ctx, text, width / 2, height - safeY, tracking, 'center');
  } else {
    drawTrackedText(ctx, text, safeX, height - safeY, tracking, 'left');
  }
  ctx.restore();
}

function brandAnchor(position: CompositionFrame['settings']['brandPosition'], width: number, height: number) {
  const x = width * SAFE_X;
  const y = height * SAFE_Y;
  return {
    left: position.endsWith('left'),
    top: position.startsWith('top'),
    x: position.endsWith('left') ? x : width - x,
    y: position.startsWith('top') ? y : height - y,
  };
}

function drawWatermarkGrid(ctx: Context2D, frame: CompositionFrame) {
  if (frame.settings.brandLayout !== 'grid' || !frame.source) return;
  const text = frame.settings.brandText.trim();
  if (!text) return;

  const { width, height, source } = frame;
  const cover = fittedRect(source, width, height, 'contain');
  const fontSize = Math.max(14, height * 0.022);
  const angle = -Math.PI / 7;
  const alpha = Math.min(0.13, 0.035 + frame.settings.brandOpacity * 0.095);

  ctx.save();
  ctx.beginPath();
  ctx.rect(cover.x, cover.y, cover.width, cover.height);
  ctx.clip();

  const centerX = cover.x + cover.width / 2;
  const centerY = cover.y + cover.height / 2;
  ctx.translate(centerX, centerY);
  ctx.rotate(angle);
  ctx.translate(-centerX, -centerY);

  ctx.font = '650 ' + fontSize + 'px Inter, Arial, "Liberation Sans", ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = 'rgba(0,0,0,0.72)';
  ctx.lineWidth = Math.max(1, fontSize * 0.055);
  ctx.globalAlpha = alpha;

  const textWidth = Math.max(ctx.measureText(text).width, fontSize * 4);
  const stepX = Math.max(textWidth + width * 0.07, width * 0.17);
  const stepY = Math.max(fontSize * 3.4, height * 0.105);
  const extent = Math.hypot(cover.width, cover.height) / 2 + Math.max(stepX, stepY);
  let row = 0;

  for (let y = centerY - extent; y <= centerY + extent; y += stepY) {
    const offset = row % 2 === 0 ? 0 : stepX / 2;
    for (let x = centerX - extent - stepX; x <= centerX + extent; x += stepX) {
      ctx.strokeText(text, x + offset, y);
      ctx.fillText(text, x + offset, y);
    }
    row += 1;
  }

  ctx.restore();
}

function drawBrand(ctx: Context2D, frame: CompositionFrame) {
  if (frame.settings.brandLayout !== 'corner') return;
  const { brandGraphic, brandText, brandOpacity, brandPosition } = frame.settings;
  if (!brandGraphic && !brandText.trim()) return;

  const { width, height } = frame;
  const anchor = brandAnchor(brandPosition, width, height);
  ctx.save();
  ctx.globalAlpha = brandOpacity;

  if (brandGraphic) {
    const size = sourceSize(brandGraphic);
    const maxWidth = width * 0.17;
    const maxHeight = height * 0.09;
    const scale = Math.min(maxWidth / size.width, maxHeight / size.height, 1);
    const drawWidth = size.width * scale;
    const drawHeight = size.height * scale;
    const x = anchor.left ? anchor.x : anchor.x - drawWidth;
    const y = anchor.top ? anchor.y : anchor.y - drawHeight;
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = height * 0.012;
    ctx.drawImage(brandGraphic, x, y, drawWidth, drawHeight);
  } else {
    const fontSize = Math.max(16, height * 0.029);
    ctx.font = '650 ' + fontSize + 'px Inter, Arial, "Liberation Sans", ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = anchor.left ? 'left' : 'right';
    ctx.textBaseline = anchor.top ? 'top' : 'bottom';
    ctx.shadowColor = 'rgba(0,0,0,0.65)';
    ctx.shadowBlur = fontSize * 0.18;
    ctx.fillText(brandText.trim(), anchor.x, anchor.y);
  }
  ctx.restore();
}

function drawReactiveAccent(ctx: Context2D, frame: CompositionFrame) {
  if (frame.settings.preset !== 'reactive' || frame.settings.motion === 'off') return;
  const amount = Math.max(0, Math.min(1, frame.audioLevel ?? 0)) * motionStrength(frame);
  if (amount <= 0.01) return;

  const { width, height } = frame;
  const gradient = ctx.createRadialGradient(
    width * 0.78,
    height * 0.2,
    0,
    width * 0.78,
    height * 0.2,
    width * 0.62,
  );
  gradient.addColorStop(0, 'rgba(210,226,255,' + (0.08 * amount) + ')');
  gradient.addColorStop(1, 'rgba(210,226,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

function drawPulseAccent(ctx: Context2D, frame: CompositionFrame) {
  if (frame.settings.preset !== 'pulse' || frame.grid?.barOffset == null || frame.settings.motion === 'off') return;
  const phase = phrasePhaseAt(frame.time, frame.grid, 8);
  const curve = 0.5 - 0.5 * Math.cos(phase * Math.PI * 2);
  const alpha = curve * 0.045 * motionStrength(frame);
  ctx.fillStyle = 'rgba(255,248,228,' + alpha + ')';
  ctx.fillRect(0, 0, frame.width, frame.height);
}

function drawMinimalVisualizer(ctx: Context2D, frame: CompositionFrame) {
  if (frame.settings.preset !== 'visualizer') return;

  const level = Math.max(0, Math.min(1, frame.audioLevel ?? 0));
  const { width, height } = frame;
  const lineWidth = width * 0.18;
  const x = width * (1 - SAFE_X) - lineWidth;
  const y = height * (1 - SAFE_Y);
  const activeWidth = Math.max(width * 0.012, lineWidth * level);

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(2, height * 0.003);
  ctx.strokeStyle = 'rgba(255,255,255,0.24)';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + lineWidth, y);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(245,244,239,0.8)';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + activeWidth, y);
  ctx.stroke();
  ctx.restore();
}

function drawGuides(ctx: Context2D, width: number, height: number) {
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.26)';
  ctx.lineWidth = Math.max(1, width / 1100);
  ctx.setLineDash([width / 160, width / 240]);
  ctx.strokeRect(
    width * SAFE_X,
    height * SAFE_Y,
    width * (1 - SAFE_X * 2),
    height * (1 - SAFE_Y * 2),
  );
  ctx.restore();
}

export function renderComposition(ctx: Context2D, frame: CompositionFrame) {
  const { width, height, source } = frame;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#08090a';
  ctx.fillRect(0, 0, width, height);

  if (source) {
    drawBackground(ctx, frame);

    const veil = ctx.createLinearGradient(0, 0, 0, height);
    veil.addColorStop(0, 'rgba(4,5,6,0.18)');
    veil.addColorStop(1, 'rgba(4,5,6,0.42)');
    ctx.fillStyle = veil;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.48)';
    ctx.shadowBlur = width * 0.018;
    drawFitted(ctx, source, width, height, 'contain');
    ctx.restore();
  } else {
    drawPlaceholder(ctx, width, height);
  }

  drawReactiveAccent(ctx, frame);
  drawPulseAccent(ctx, frame);

  const vignette = ctx.createRadialGradient(
    width / 2,
    height / 2,
    Math.min(width, height) * 0.2,
    width / 2,
    height / 2,
    Math.max(width, height) * 0.72,
  );
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, frame.settings.preset === 'ambient' ? 'rgba(0,0,0,0.27)' : 'rgba(0,0,0,0.34)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);

  drawWatermarkGrid(ctx, frame);
  drawTitle(ctx, frame);
  drawBrand(ctx, frame);
  drawMinimalVisualizer(ctx, frame);
  if (frame.settings.showGuides) drawGuides(ctx, width, height);
}
