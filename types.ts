export type WaveformType = 'sine' | 'square' | 'sawtooth' | 'triangle';
export type GatingMode = 'none' | 'fractal';

export interface HarmonicLayer {
  id: string;
  label: string;
  ratio: number;
  waveform: WaveformType;
  gain: number;
  gatingMode: GatingMode;
  fractalPattern: number[];
}

export interface StepSettings {
  enabled: boolean;
  baseFrequency: number;
  stepGain: number;
  phaseOffsets: Record<string, number>; // layerId -> offset (0.0 to 1.0)
}

export interface SceneMeta {
  name: string;
  description: string;
  source: string;
}

export interface OrpheusState {
  harmonicLayers: HarmonicLayer[];
  steps: StepSettings[];
  tempo: number;
  masterGain: number;
  globalSchumannDepth: number; // Keeping this for the "Orpheus" vibe
  sceneMeta: SceneMeta;
}

export interface PlaybackState {
  isPlaying: boolean;
  currentStep: number;
}

export interface ChannelData {
  id: number;
  isActive: boolean;
  freq: number;
  noteName: string;
  octaveBand: 'low' | 'high';
}

export interface OracleResponse {
  interpretation: string;
  mood: string;
}

export interface FractalPreset {
  id: string;
  label: string;
  pattern: number[];
}

export interface ScenePreset {
  id: string;
  label: string;
  build: (rootFreq: number) => { steps: StepSettings[], harmonics: HarmonicLayer[] };
}

// Orchestrator Types
export type OrchestratorCommandType = 
  | 'start' 
  | 'stop' 
  | 'set_tempo' 
  | 'set_root_frequency' 
  | 'set_master_gain' 
  | 'load_preset'
  | 'set_step_gain'
  | 'set_step_enabled';

export interface OrchestratorCommand {
  type: OrchestratorCommandType;
  bpm?: number;
  hz?: number;
  value?: number;
  presetId?: string;
  stepIndex?: number;
  gain?: number;
  enabled?: boolean;
}

export interface OrchestratorResponse {
  reply_text: string;
  command: OrchestratorCommand | null;
}

// Library Types
export type GuidanceType = "text" | "pdf" | "image";

export type TempoBias = "slow" | "medium" | "fast";
export type DensityBias = "sparse" | "steady" | "dense";
export type FractalBias = "simple" | "recursive" | "chaotic";

export interface GuidanceMotif {
  title?: string;
  summary: string;           // plain English summary
  controlHints: {
    favoredRootHz?: number;  // e.g. 16, 32, 64
    tempoBias?: TempoBias;
    densityBias?: DensityBias;
    fractalBias?: FractalBias;
    patternKeywords?: string[]; // "charge-spin-lift", "heartbeat", "mars-scar"
  };
}

export interface GuidanceDoc {
  id: string;
  title: string;
  type: GuidanceType;
  originalFilename: string;
  content?: string; // For text files
  imageBase64?: string; // For image files
  tags: string[];
  active: boolean;          // “use for orchestration”
  motif?: GuidanceMotif;
  isAnalyzing?: boolean;
}

export interface MotifAggregate {
  hasActiveMotifs: boolean;
  favoredRootHz?: number;
  tempoBias?: TempoBias;
  densityBias?: DensityBias;
  fractalBias?: FractalBias;
  patternKeywords: string[];
  contributingMotifs: GuidanceMotif[];
}
