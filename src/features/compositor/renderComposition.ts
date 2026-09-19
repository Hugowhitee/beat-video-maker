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

function drawFitted(
  ctx: Context2D,
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
  ctx.drawImage(
    source,
    (width - drawWidth) / 2,
    (height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );
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

  ctx.save();
  ctx.font = titleFont(frame.settings.titleFont, size);
  ctx.fillStyle = '#f5f4ef';
  ctx.textBaseline = 'alphabetic';
  ctx.shadowColor = 'rgba(0,0,0,0.72)';
  ctx.shadowBlur = size * 0.17;
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

function drawBrand(ctx: Context2D, frame: CompositionFrame) {
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
    ctx.save();
    ctx.filter = 'blur(' + Math.max(18, width * 0.022) + 'px) brightness(0.42) saturate(0.76)';
    ctx.globalAlpha = 0.92;
    ctx.translate(-width * 0.025, -height * 0.045);
    drawFitted(ctx, source, width * 1.05, height * 1.09, 'cover');
    ctx.restore();

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

  const vignette = ctx.createRadialGradient(
    width / 2,
    height / 2,
    Math.min(width, height) * 0.2,
    width / 2,
    height / 2,
    Math.max(width, height) * 0.72,
  );
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.34)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);

  drawTitle(ctx, frame);
  drawBrand(ctx, frame);
  if (frame.settings.showGuides) drawGuides(ctx, width, height);
}
