import { F_ROOT, DIATONIC_RATIOS, STEP_DURATION, NUM_STEPS, F_SCHUMANN } from '../constants';
import { OrpheusState, StepSettings, HarmonicLayer, WaveformType } from '../types';

class AudioService {
  private ctx: AudioContext | null = null;
  private masterGainNode: GainNode | null = null;
  private schumannGainNode: GainNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  
  // Active oscillators (for cleanup)
  private activeOscillators: Set<OscillatorNode> = new Set();

  private isPlaying: boolean = false;
  private stepCallback: ((step: number) => void) | null = null;
  
  // Scheduling
  private nextNoteTime: number = 0;
  private currentStep: number = 0;
  private timerID: number | undefined;
  private lookahead: number = 25.0; // ms
  private scheduleAheadTime: number = 0.1; // s

  // State
  private state: OrpheusState;

  constructor() {
    this.state = this.getInitialState();
  }

  private getInitialState(): OrpheusState {
    // 1. Define Harmonic Layers with custom Fractal Patterns
    const harmonicLayers: HarmonicLayer[] = [
      { 
        id: "root", 
        label: "C₀ Root", 
        ratio: 1.0, 
        waveform: "sine", 
        gain: 1.0, 
        gatingMode: "none",
        fractalPattern: [1.0] 
      },
      { 
        id: "fifth", 
        label: "H₁ Fifth", 
        ratio: 1.5, 
        waveform: "square", 
        gain: 0.6, 
        gatingMode: "fractal",
        fractalPattern: [1.0, 0.5, 0.25, 0.125] 
      },
      { 
        id: "octave", 
        label: "H₂ Octave", 
        ratio: 2.0, 
        waveform: "triangle", 
        gain: 0.4, 
        gatingMode: "fractal",
        fractalPattern: [1.0, 0.5, 0.25, 0.125] 
      }
    ];

    // 2. Define Steps (Initialize with Sweet-16 Scale Frequencies)
    const steps: StepSettings[] = Array.from({ length: NUM_STEPS }, (_, i) => {
       const octave = i < 8 ? 1 : 2;
       const ratioIndex = i % 8;
       const ratio = DIATONIC_RATIOS[ratioIndex];
       const freq = F_ROOT * ratio * octave;
       
       // Initialize phase offsets for all layers to 0
       const phaseOffsets: Record<string, number> = {};
       harmonicLayers.forEach(l => phaseOffsets[l.id] = 0);
       
       return {
         enabled: true, // Enable all for a sequence
         baseFrequency: freq,
         stepGain: 0.4,
         phaseOffsets
       };
    });

    return {
      harmonicLayers,
      steps,
      tempo: 120, // BPM
      masterGain: 0.5,
      globalSchumannDepth: 0.4,
      sceneMeta: {
        name: "Untitled Scene",
        description: "Custom pattern",
        source: "Custom"
      }
    };
  }

  // --- Core API ---

  public getState(): OrpheusState {
      return this.state;
  }

  public setState(newState: OrpheusState) {
      this.state = newState;
      this.applyGlobalSettings();
  }

  public async start(onStep?: (step: number) => void) {
    if (!this.ctx) await this.initialize();
    if (this.isPlaying) return;

    if (this.ctx?.state === 'suspended') {
      await this.ctx.resume();
    }

    this.stepCallback = onStep || null;
    this.isPlaying = true;
    this.currentStep = 0;
    this.nextNoteTime = this.ctx!.currentTime + 0.05;
    this.scheduler();
  }

  public stop() {
    this.isPlaying = false;
    if (this.timerID) clearTimeout(this.timerID);
    this.stopAllVoices();
  }

  public getAnalyser() {
      return this.analyserNode;
  }

  // --- Internal Audio Logic ---

  public async initialize() {
    if (this.ctx) return;
    
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    this.ctx = new AudioContextClass();
    
    // Master Gain
    this.masterGainNode = this.ctx.createGain();
    this.masterGainNode.gain.value = this.state.masterGain;

    // Schumann Modulation Node (Applied globally to master)
    this.schumannGainNode = this.ctx.createGain();
    this.schumannGainNode.gain.value = 1.0;
    
    // LFO for Schumann
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = F_SCHUMANN;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 0; // Starts 0, updated in applyGlobalSettings
    lfo.connect(lfoGain);
    lfoGain.connect(this.schumannGainNode.gain);
    lfo.start();

    // Analyser
    this.analyserNode = this.ctx.createAnalyser();
    this.analyserNode.fftSize = 2048;
    this.analyserNode.smoothingTimeConstant = 0.8;

    // Chain: Voices -> SchumannNode -> MasterNode -> Analyser -> Dest
    this.schumannGainNode.connect(this.masterGainNode);
    this.masterGainNode.connect(this.analyserNode);
    this.analyserNode.connect(this.ctx.destination);
    
    this.applyGlobalSettings();
  }

  private applyGlobalSettings() {
    if (!this.ctx || !this.masterGainNode || !this.schumannGainNode) return;
    
    const now = this.ctx.currentTime;
    this.masterGainNode.gain.setTargetAtTime(this.state.masterGain, now, 0.1);
  }

  private stopAllVoices() {
      this.activeOscillators.forEach(osc => {
          try { osc.stop(); osc.disconnect(); } catch(e){}
      });
      this.activeOscillators.clear();
  }

  private scheduleNote(stepNumber: number, time: number) {
    if (!this.ctx || !this.schumannGainNode) return;

    if (this.stepCallback) {
        const delay = (time - this.ctx.currentTime) * 1000;
        setTimeout(() => {
             if (this.stepCallback) this.stepCallback(stepNumber);
        }, Math.max(0, delay));
    }

    const step = this.state.steps[stepNumber];
    if (!step || !step.enabled || step.stepGain <= 0) return;

    const stepDurationSec = (60 / this.state.tempo) / 4; // 16th note duration
    const attack = 0.01;
    const decay = stepDurationSec * 0.8; 

    // Trigger one voice per harmonic layer
    this.state.harmonicLayers.forEach(layer => {
        if (layer.gain <= 0) return;

        // 1. Fractal Gating F(t) logic
        let gating = 1.0;
        if (layer.gatingMode === 'fractal') {
             // Use the specific fractal pattern defined for this layer
             const pattern = (layer.fractalPattern && layer.fractalPattern.length > 0) 
                ? layer.fractalPattern 
                : [1.0];
             gating = pattern[stepNumber % pattern.length];
             
             // Ensure valid number
             if (!Number.isFinite(gating) || gating < 0) gating = 0;
        }

        const peakGain = step.stepGain * layer.gain * gating;
        if (peakGain <= 0.001) return; // Optimization: skip near-silent voices

        // 2. Phase Offset Logic
        const phaseFrac = step.phaseOffsets[layer.id] || 0;
        const offsetSec = Math.max(0, Math.min(0.9, phaseFrac)) * stepDurationSec;
        const layerStartTime = time + offsetSec;

        const osc = this.ctx!.createOscillator();
        const voiceGain = this.ctx!.createGain();

        osc.type = layer.waveform;
        osc.frequency.value = step.baseFrequency * layer.ratio;

        // Envelope relative to layerStartTime
        voiceGain.gain.setValueAtTime(0, layerStartTime);
        voiceGain.gain.linearRampToValueAtTime(peakGain, layerStartTime + attack);
        voiceGain.gain.exponentialRampToValueAtTime(0.001, layerStartTime + attack + decay);

        osc.connect(voiceGain);
        voiceGain.connect(this.schumannGainNode!); // Connect to global bus

        osc.start(layerStartTime);
        osc.stop(layerStartTime + attack + decay + 0.1);

        this.activeOscillators.add(osc);
        osc.onended = () => this.activeOscillators.delete(osc);
    });
  }

  private scheduler() {
    if (!this.ctx) return;
    
    const stepDurationSec = (60 / this.state.tempo) / 4;

    while (this.nextNoteTime < this.ctx.currentTime + this.scheduleAheadTime) {
        this.scheduleNote(this.currentStep, this.nextNoteTime);
        this.nextNoteTime += stepDurationSec;
        this.currentStep++;
        if (this.currentStep === NUM_STEPS) {
            this.currentStep = 0;
        }
    }
    
    if (this.isPlaying) {
        this.timerID = window.setTimeout(this.scheduler.bind(this), this.lookahead);
    }
  }
}

export const audioService = new AudioService();
