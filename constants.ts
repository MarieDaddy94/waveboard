import { FractalPreset, HarmonicLayer, StepSettings, ScenePreset } from './types';

export const F_ROOT = 16.0; // Hz
export const STEP_DURATION = 0.5; // Seconds
export const NUM_STEPS = 16;
export const F_SCHUMANN = 7.83; // Hz

export const NOTE_NAMES = ["C", "D", "E", "F", "G", "A", "B", "C"];

export const DIATONIC_RATIOS = [
  1.0,      // C
  9.0/8.0,  // D
  5.0/4.0,  // E
  4.0/3.0,  // F
  3.0/2.0,  // G
  5.0/3.0,  // A
  15.0/8.0, // B
  2.0       // C (octave)
];

// Eye-of-Horus fractal gating logic (Legacy/Reference)
export const getGateFraction = (stepIndex: number): number => {
  if (stepIndex < 4) return 1.0;
  if (stepIndex < 8) return 0.5;
  if (stepIndex < 12) return 0.25;
  return 0.125;
};

export const FRACTAL_PRESETS: FractalPreset[] = [
  {
    id: "flat1",
    label: "Flat 1.0",
    pattern: [1.0]
  },
  {
    id: "halfDecay4",
    label: "Halving (1, 0.5, 0.25, 0.125)",
    pattern: [1.0, 0.5, 0.25, 0.125]
  },
  {
    id: "eyeHorus8",
    label: "Eye-of-Horus 8-step (1 → 1/128)",
    pattern: [1.0, 0.5, 0.25, 0.125, 0.0625, 0.03125, 0.015625, 0.0078125]
  },
  {
    id: "sweet16Pulse",
    label: "Sweet-16 Pulse (ON/OFF)",
    pattern: [1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0]
  },
  {
    id: "triLift",
    label: "Tri-Lift (0, 1, 0.5)",
    pattern: [0, 1, 0.5]
  },
  {
    id: "offbeat",
    label: "Offbeat (0, 1, 0, 1)",
    pattern: [0, 1, 0, 1]
  }
];

// --- Scene Factory Helpers ---

const createDefaultHarmonicLayers = (): HarmonicLayer[] => [
    { id: "root", label: "C₀ Root", ratio: 1.0, waveform: "sine", gain: 1.0, gatingMode: "none", fractalPattern: [1.0] },
    { id: "fifth", label: "H₁ Fifth", ratio: 1.5, waveform: "square", gain: 0.7, gatingMode: "fractal", fractalPattern: [1.0, 0.5, 0.25, 0.125] },
    { id: "octave", label: "H₂ Octave", ratio: 2.0, waveform: "triangle", gain: 0.5, gatingMode: "fractal", fractalPattern: [1.0, 0.5, 0.25, 0.125] }
];

const createPhaseOffsets = (layers: HarmonicLayer[]) => {
    const p: Record<string, number> = {};
    layers.forEach(l => p[l.id] = 0);
    return p;
};

export const SCENE_PRESETS: ScenePreset[] = [
    {
        id: "basic_4on",
        label: "Basic: 4-on-Grid Pulses",
        build: (rootFreq: number) => {
            const harmonics = createDefaultHarmonicLayers();
            const steps: StepSettings[] = Array.from({ length: 16 }, (_, i) => ({
                enabled: i % 4 === 0,
                baseFrequency: rootFreq,
                stepGain: 0.4,
                phaseOffsets: createPhaseOffsets(harmonics)
            }));
            return { steps, harmonics };
        }
    },
    {
        id: "zep_charge_spin_lift",
        label: "Zep Tepi: Charge → Nucleate → Spin → Lift",
        build: (rootFreq: number) => {
            const harmonics = createDefaultHarmonicLayers();
            
            // Customize harmonics for Zep Tepi
            const eyePreset = FRACTAL_PRESETS.find(p => p.id === "eyeHorus8");
            harmonics.forEach(l => {
                if(l.id === 'root') {
                    l.gatingMode = 'none';
                    l.fractalPattern = [1.0];
                } else {
                    l.gatingMode = 'fractal';
                    if(eyePreset) l.fractalPattern = [...eyePreset.pattern];
                }
            });

            const steps: StepSettings[] = Array.from({ length: 16 }, (_, i) => {
                let enabled = true;
                let gain = 0.0;
                
                if (i < 4) gain = 0.75; // Charge
                else if (i < 8) gain = 0.55; // Nucleate
                else if (i < 12) gain = 0.45; // Spin
                else {
                    // Lift
                    enabled = i % 2 === 0;
                    gain = enabled ? 0.9 : 0.0;
                }

                return {
                    enabled,
                    baseFrequency: rootFreq,
                    stepGain: gain,
                    phaseOffsets: createPhaseOffsets(harmonics)
                };
            });

            return { steps, harmonics };
        }
    },
    {
        id: "scalar_heartbeat",
        label: "Scalar Heartbeat (Offbeat Pulses)",
        build: (rootFreq: number) => {
            const harmonics = createDefaultHarmonicLayers();
            
            // Smoother texture
            harmonics.forEach(l => {
                l.waveform = 'sine';
                l.gain = l.id === 'root' ? 0.9 : 0.6;
            });

            const steps: StepSettings[] = Array.from({ length: 16 }, (_, i) => {
                const enabled = i % 4 === 2; // Hit on the "2"
                return {
                    enabled,
                    baseFrequency: rootFreq,
                    stepGain: enabled ? 0.6 : 0.0,
                    phaseOffsets: createPhaseOffsets(harmonics)
                };
            });

            return { steps, harmonics };
        }
    }
];
