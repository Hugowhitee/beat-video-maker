import type { VerifiedGrid } from '../analysis/types';

export type BrandPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
export type TitlePosition = 'top-left' | 'bottom-left' | 'bottom-center';
export type TitleFont = 'clean' | 'condensed' | 'serif' | 'mono';
export type VisualPreset = 'clean' | 'ambient' | 'reactive' | 'pulse' | 'visualizer';
export type MotionAmount = 'off' | 'low' | 'medium';

export type CompositionSettings = {
  title: string;
  titleSize: number;
  titlePosition: TitlePosition;
  titleFont: TitleFont;
  titleTracking: number;
  brandText: string;
  brandGraphic: CanvasImageSource | null;
  brandPosition: BrandPosition;
  brandOpacity: number;
  preset: VisualPreset;
  motion: MotionAmount;
  showGuides: boolean;
};

export type CompositionFrame = {
  source: CanvasImageSource | null;
  width: number;
  height: number;
  time: number;
  settings: CompositionSettings;
  grid?: VerifiedGrid | null;
  audioLevel?: number;
};
