export type AnalysisConfidence = 'high' | 'medium' | 'low';

export type BeatGridAnalysis = {
  bpm: number | null;
  beatOffset: number | null;
  barOffset: number | null;
  barConfidence: number;
  confidence: AnalysisConfidence;
  detector: 'web-audio-beat-detector';
  segmentBpms: number[];
  notes: string[];
};

export type VerifiedGrid = {
  bpm: number;
  beatOffset: number;
  barOffset: number | null;
  source: 'auto' | 'manual';
};
