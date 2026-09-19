export type AnalysisConfidence = 'high' | 'medium' | 'low';

export type PrimaryBeatEstimate = {
  bpm: number | null;
  beatOffset: number | null;
  barOffset: number | null;
  tempoConfidence: number;
  phaseConfidence: number;
  barConfidence: number;
  onsetCount: number;
};

export type BeatGridAnalysis = PrimaryBeatEstimate & {
  confidence: AnalysisConfidence;
  crossCheckBpm: number | null;
  crossCheckOffset: number | null;
  agreement: 'agree' | 'half-double' | 'disagree' | 'unavailable';
  notes: string[];
};

export type VerifiedGrid = {
  bpm: number;
  beatOffset: number;
  barOffset: number | null;
  source: 'auto' | 'manual';
};
