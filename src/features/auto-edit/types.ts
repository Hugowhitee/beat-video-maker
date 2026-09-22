export type EditMode = 'loop' | 'guided' | 'auto';
export type TransitionProfile = 'clean' | 'mixed';
export type EditTransitionKind = 'film-burn';

export type MusicSectionKind =
  | 'intro'
  | 'verse'
  | 'chorus'
  | 'break'
  | 'build'
  | 'drop'
  | 'outro'
  | 'unknown';

export type MusicBeat = {
  time: number;
  index: number;
  downbeat: boolean;
  strength: number;
};

export type MusicSection = {
  id: string;
  start: number;
  end: number;
  kind: MusicSectionKind;
  energy: number;
  confidence: number;
};

export type MusicMap = {
  duration: number;
  bpm: number | null;
  beatsPerBar: number;
  beats: MusicBeat[];
  sections: MusicSection[];
};

export type ShotBoundaryKind = 'source-start' | 'hard-cut' | 'transition' | 'unknown';

export type ClipShot = {
  id: string;
  sourceId: string;
  start: number;
  end: number;
  motion: number;
  quality: number;
  motionEvidence?: 'measured' | 'unavailable';
  qualityEvidence?: 'measured' | 'unavailable';
  boundaryKind: ShotBoundaryKind;
  boundaryConfidence: number;
};

export type ClipSource = {
  id: string;
  name: string;
  duration: number;
  role?: 'footage' | 'intro' | 'outro';
  shots: ClipShot[];
};

export type ClipMap = {
  sources: ClipSource[];
};

export type EditSegment = {
  id: string;
  timelineStart: number;
  timelineEnd: number;
  sourceId: string;
  shotId: string;
  sourceStart: number;
  sourceEnd: number;
  reason: string;
  motifId?: string;
  motifSlot?: string;
  manualOverride?: boolean;
  locked?: boolean;
};

export type EditTransition = {
  id: string;
  kind: EditTransitionKind;
  leftSegmentId: string;
  rightSegmentId: string;
  cutTime: number;
  duration: number;
  alignment: number;
  reason: string;
  motifId?: string;
};

export type EditMotif = {
  id: string;
  start: number;
  duration: number;
  bars: number;
  segmentIds: string[];
  transitionIds: string[];
};

export type EditPlan = {
  mode: EditMode;
  duration: number;
  segments: EditSegment[];
  transitions: EditTransition[];
  motifs: EditMotif[];
  warnings: string[];
};

export type EditPlannerOptions = {
  mode: EditMode;
  loopBars?: number;
  transitionProfile?: TransitionProfile;
  seed?: number;
};
