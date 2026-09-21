import type { VerifiedGrid } from '../analysis/types';
import type { EffectModulation, VisualEffectInstance } from '../effects/types';

export type BrandPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
export type BrandLayout = 'corner' | 'grid';
export type TitleAlign = 'left' | 'center' | 'right';
export type TitleFont = 'clean' | 'condensed' | 'serif' | 'mono';
export type VisualPreset = 'clean' | 'ambient' | 'reactive' | 'pulse' | 'visualizer';
export type MotionAmount = 'off' | 'low' | 'medium';
export type BackgroundFill = 'blur' | 'black';

export type CompositionSettings = {
  title: string;
  titleSize: number;
  titleX: number;
  titleY: number;
  titleAlign: TitleAlign;
  titleFont: TitleFont;
  titleTracking: number;
  brandText: string;
  brandGraphic: CanvasImageSource | null;
  brandLayout: BrandLayout;
  brandPosition: BrandPosition;
  brandOpacity: number;
  preset: VisualPreset;
  motion: MotionAmount;
  backgroundFill: BackgroundFill;
  effects?: VisualEffectInstance[];
  modulations?: EffectModulation[];
  showGuides: boolean;
  showGrid: boolean;
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
