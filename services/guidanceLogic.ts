import { GuidanceDoc, GuidanceMotif, MotifAggregate, OrpheusState, TempoBias, DensityBias, FractalBias, StepSettings, HarmonicLayer, WaveformType } from "../types";
import { F_ROOT } from "../constants";

// --- Aggregation Logic ---

const ROOT_CANDIDATES = [16, 32, 64, 128, 256];

function modeOf<T extends string>(values: T[]): T | undefined {
  if (!values.length) return undefined;
  const counts = new Map<T, number>();
  for (const v of values) {
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  let best: T | undefined;
  let bestCount = 0;
  for (const [v, c] of counts) {
    if (c > bestCount) {
      best = v;
      bestCount = c;
    }
  }
  return best;
}

export function aggregateMotifs(docs: GuidanceDoc[]): MotifAggregate {
  const active = docs.filter((d) => d.active && d.motif);
  if (!active.length) {
    return {
      hasActiveMotifs: false,
      patternKeywords: [],
      contributingMotifs: [],
    };
  }

  const motifs = active.map((d) => d.motif!) as GuidanceMotif[];

  const rootVotes: number[] = [];
  const tempoVotes: TempoBias[] = [];
  const densityVotes: DensityBias[] = [];
  const fractalVotes: FractalBias[] = [];
  const keywordSet = new Set<string>();

  for (const m of motifs) {
    const hints = m.controlHints || {};
    if (hints.favoredRootHz && ROOT_CANDIDATES.includes(hints.favoredRootHz)) {
      rootVotes.push(hints.favoredRootHz);
    }
    if (hints.tempoBias) tempoVotes.push(hints.tempoBias);
    if (hints.densityBias) densityVotes.push(hints.densityBias);
    if (hints.fractalBias) fractalVotes.push(hints.fractalBias);
    if (Array.isArray(hints.patternKeywords)) {
      for (const kw of hints.patternKeywords) {
        if (kw && kw.trim()) keywordSet.add(kw.trim());
      }
    }
  }

  // Favored root: weighted by “VRP-core” docs that explicitly like 16 Hz
  let favoredRootHz: number | undefined;
  if (rootVotes.length) {
    const counts = new Map<number, number>();
    for (const r of rootVotes) {
      counts.set(r, (counts.get(r) ?? 0) + 1);
    }
    // Bonus for 16Hz (Master Key)
    if (counts.has(16)) {
      counts.set(16, (counts.get(16) ?? 0) + 1.5);
    }
    let bestRoot: number | undefined;
    let bestCount = -Infinity;
    for (const [r, c] of counts) {
      if (c > bestCount) {
        bestRoot = r;
        bestCount = c;
      }
    }
    favoredRootHz = bestRoot;
  }

  return {
    hasActiveMotifs: true,
    favoredRootHz,
    tempoBias: modeOf(tempoVotes),
    densityBias: modeOf(densityVotes),
    fractalBias: modeOf(fractalVotes),
    patternKeywords: [...keywordSet],
    contributingMotifs: motifs,
  };
}

// --- Mapper Logic ---

const MIN_BPM = 40;
const MAX_BPM = 160;
const BASE_BPM = 120;

function tempoFromBias(bias?: TempoBias): number {
  switch (bias) {
    case "slow": return 60;
    case "fast": return 140;
    case "medium": default: return BASE_BPM;
  }
}

function densityToStepSettings(bias: DensityBias | undefined, index: number, totalSteps: number, currentSettings: StepSettings): Partial<StepSettings> {
    const isAnchor = index % 4 === 0;
    
    // Default Steady
    let prob = 0.5;
    let gain = isAnchor ? 0.8 : 0.0;
    let enabled = isAnchor;

    if (bias === 'sparse') {
        // Only anchors, maybe occasional ghost note
        prob = 0.2;
        if (isAnchor) {
            enabled = true;
            gain = 0.7;
        } else {
            enabled = Math.random() < 0.1; // Very rare
            gain = enabled ? 0.3 : 0.0;
        }
    } else if (bias === 'dense') {
        // High activity
        enabled = true;
        gain = isAnchor ? 0.9 : 0.5 + (Math.random() * 0.2);
    } else {
        // Steady (Default)
        // 4 on floor + some 8ths
        const isEighth = index % 2 === 0;
        if (isAnchor) {
            enabled = true;
            gain = 0.8;
        } else if (isEighth) {
            enabled = true;
            gain = 0.4;
        } else {
            enabled = false;
            gain = 0.0;
        }
    }

    return { enabled, stepGain: gain };
}

function getFractalPattern(bias: FractalBias | undefined, keyword: string): number[] {
    // 1. Check Keywords first for specific archetypes
    if (keyword.includes('eye') || keyword.includes('horus')) {
        return [1.0, 0.5, 0.25, 0.125, 0.0625, 0.03125, 0.015625, 0.0078125];
    }
    if (keyword.includes('pulse') || keyword.includes('heart')) {
        return [1, 0, 1, 0];
    }
    if (keyword.includes('lift')) {
        return [0, 0.2, 0.5, 0.8, 1.0];
    }

    // 2. Fallback to Bias
    switch (bias) {
        case "simple":
            return [1.0];
        case "chaotic":
            // A deterministic chaotic sequence
            return [0.9, 0.1, 0.8, 0.2, 0.7, 0.3, 0.6, 0.4];
        case "recursive":
        default:
            return [1.0, 0.5, 0.25, 0.125];
    }
}

function determinePatternBank(keywords: string[]): string {
    const lc = keywords.map(k => k.toLowerCase());
    if (lc.some(k => k.includes("mars") || k.includes("scar"))) return "martian_scar";
    if (lc.some(k => k.includes("shell") || k.includes("healing"))) return "healing_shell";
    if (lc.some(k => k.includes("web") || k.includes("lattice"))) return "cosmic_web";
    if (lc.some(k => k.includes("charge"))) return "charge_spin";
    return "default";
}

export function applyGuidanceToState(baseState: OrpheusState, aggregate: MotifAggregate): OrpheusState {
    if (!aggregate.hasActiveMotifs) return baseState;

    const newState = { ...baseState };

    // 1. Root Frequency
    const targetRoot = aggregate.favoredRootHz ?? baseState.steps[0]?.baseFrequency ?? F_ROOT;
    
    // 2. Tempo
    const targetTempo = aggregate.tempoBias ? tempoFromBias(aggregate.tempoBias) : baseState.tempo;
    newState.tempo = targetTempo;

    // 3. Harmonics & Fractal Patterns
    // Determine a dominant keyword for pattern generation
    const primaryKeyword = determinePatternBank(aggregate.patternKeywords);
    
    newState.harmonicLayers = baseState.harmonicLayers.map((layer, i) => {
        // Adjust fractal patterns based on bias
        // Keep existing gating mode if possible, but force fractal if bias is strong
        let gatingMode = layer.gatingMode;
        if (aggregate.fractalBias === 'chaotic' || aggregate.fractalBias === 'recursive') {
            gatingMode = 'fractal';
        }

        const pattern = getFractalPattern(aggregate.fractalBias, primaryKeyword);
        
        // Slight waveform tweaks based on primary keyword
        let waveform = layer.waveform;
        if (primaryKeyword === 'healing_shell') waveform = 'sine';
        if (primaryKeyword === 'martian_scar') waveform = i % 2 === 0 ? 'sawtooth' : 'square';

        return {
            ...layer,
            gatingMode,
            fractalPattern: pattern,
            waveform
        };
    });

    // 4. Steps (Density & Root)
    newState.steps = baseState.steps.map((step, i) => {
        const densitySettings = densityToStepSettings(aggregate.densityBias, i, baseState.steps.length, step);
        
        return {
            ...step,
            baseFrequency: targetRoot, // Apply root to all (assuming unison base for harmonic stack)
            enabled: densitySettings.enabled ?? step.enabled,
            stepGain: densitySettings.stepGain ?? step.stepGain,
        };
    });

    // 5. Meta
    const biasDesc = `${aggregate.tempoBias || 'norm'}/${aggregate.densityBias || 'norm'}`;
    newState.sceneMeta = {
        name: `Conducted: ${aggregate.patternKeywords[0] || 'Mixed'}`,
        description: `Orchestrated by library motifs (${biasDesc})`,
        source: "Scalar Conductor"
    };

    return newState;
}
