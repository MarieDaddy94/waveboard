import React, { useState, useEffect, useRef, useMemo } from "react";
import { audioService } from "../services/audioService";
import { orchestratorService } from "../services/orchestratorService";
import { aggregateMotifs, applyGuidanceToState } from "../services/guidanceLogic";
import { StepSettings, HarmonicLayer, OrpheusState, WaveformType, GatingMode, SceneMeta, OrchestratorCommand, GuidanceDoc } from "../types";
import { FRACTAL_PRESETS, SCENE_PRESETS } from "../constants";
import { VacuumScope } from "./VacuumScope";
import { LibraryPanel } from "./LibraryPanel";
import { Play, Square, Activity, Layers, Wifi, Zap, Clock, Hash, ChevronDown, Disc, Download, Upload, Tag, Mic, MicOff, Bot, Book } from 'lucide-react';

export const OrpheusControlRoom: React.FC = () => {
  // Sync state with audio service
  const initialState = audioService.getState();
  const [harmonicLayers, setHarmonicLayers] = useState<HarmonicLayer[]>(initialState.harmonicLayers);
  const [steps, setSteps] = useState<StepSettings[]>(initialState.steps);
  const [tempo, setTempo] = useState(initialState.tempo);
  const [masterGain, setMasterGain] = useState(initialState.masterGain);
  const [sceneMeta, setSceneMeta] = useState<SceneMeta>(initialState.sceneMeta);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const [activeView, setActiveView] = useState<'waveform' | 'spectrum' | 'nodemap'>('waveform');
  const [wsConnected, setWsConnected] = useState(false);
  
  // Orchestrator State
  const [isOrchestratorListening, setIsOrchestratorListening] = useState(false);
  const [isOrchestratorProcessing, setIsOrchestratorProcessing] = useState(false);

  // Library State
  const [libraryDocs, setLibraryDocs] = useState<GuidanceDoc[]>([]);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  
  const wsRef = useRef<WebSocket | null>(null);

  const currentState: OrpheusState = useMemo(() => ({
    harmonicLayers,
    steps,
    tempo,
    masterGain,
    globalSchumannDepth: 0.4,
    stepDuration: 0.5,
    sceneMeta
  }), [harmonicLayers, steps, tempo, masterGain, sceneMeta]);

  // WebSocket Connection
  useEffect(() => {
    const ws = new WebSocket("ws://localhost:8788/orpheus");
    ws.onopen = () => setWsConnected(true);
    ws.onclose = () => setWsConnected(false);
    ws.onerror = () => setWsConnected(false);
    ws.onmessage = (msg) => {
        try {
            const data = JSON.parse(msg.data);
            if (data.type === 'update_pattern') {
                if (data.steps) setSteps(data.steps);
                if (data.harmonics) setHarmonicLayers(data.harmonics);
                if (data.sceneMeta) setSceneMeta(data.sceneMeta);
            }
        } catch(e) {}
    };
    wsRef.current = ws;
    return () => ws.close();
  }, []);

  // Update Audio Engine & WS
  useEffect(() => {
      audioService.setState(currentState);
      if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
              type: 'state_update',
              payload: currentState
          }));
      }
  }, [currentState]);

  // --- SCALAR CONDUCTOR (Automatic Library Orchestration) ---
  useEffect(() => {
      // 1. Aggregate
      const aggregate = aggregateMotifs(libraryDocs);
      
      if (aggregate.hasActiveMotifs) {
          // 2. Apply to current state (non-destructively effectively, as we spread state)
          // We use 'currentState' which is built from state vars. 
          // NOTE: This will overwrite manual changes if a doc is active and parameters conflict.
          // This is intended behavior for a "Conductor" - the score dictates the play.
          
          const newState = applyGuidanceToState(currentState, aggregate);
          
          // Only update state if meaningful changes occurred to avoid loops/jitters
          // (Simple check for now, could be deeper)
          if (newState.tempo !== tempo || newState.steps[0]?.baseFrequency !== steps[0]?.baseFrequency || newState.sceneMeta.source === "Scalar Conductor") {
             if (newState.tempo !== tempo) setTempo(newState.tempo);
             if (newState.steps[0].baseFrequency !== steps[0].baseFrequency) setSteps(newState.steps);
             
             // Check if harmonics changed enough to warrant update (simple length/mode check)
             if (JSON.stringify(newState.harmonicLayers) !== JSON.stringify(harmonicLayers)) {
                 setHarmonicLayers(newState.harmonicLayers);
             }
             
             // Update meta to reflect orchestration
             setSceneMeta(newState.sceneMeta);
          }
      }
  }, [libraryDocs]); // Only re-run when library docs change (added, removed, toggled)

  // --- Orchestrator Integration (Voice/Gemini) ---
  useEffect(() => {
      orchestratorService.setCallbacks(
          handleOrchestratorResult,
          (listening) => setIsOrchestratorListening(listening)
      );
  }, [currentState, libraryDocs]); // Need to update callbacks if library changes so closure captures new docs

  const handleOrchestratorResult = async (text: string) => {
      setIsOrchestratorProcessing(true);
      
      // Get active guidance motifs
      const activeMotifs = libraryDocs
          .filter(d => d.active && d.motif)
          .map(d => d.motif!);

      const response = await orchestratorService.consultGemini(text, currentState, activeMotifs);
      
      orchestratorService.speak(response.reply_text);
      
      if (response.command) {
          executeCommand(response.command);
      }
      setIsOrchestratorProcessing(false);
  };

  const executeCommand = (cmd: OrchestratorCommand) => {
      console.log("Executing Command:", cmd);
      switch(cmd.type) {
          case 'start':
              if (!isPlaying) togglePlay();
              break;
          case 'stop':
              if (isPlaying) togglePlay();
              break;
          case 'set_tempo':
              if (cmd.bpm) setTempo(Math.max(20, Math.min(300, cmd.bpm)));
              break;
          case 'set_master_gain':
              if (cmd.value !== undefined) setMasterGain(Math.max(0, Math.min(1, cmd.value)));
              break;
          case 'set_root_frequency':
              if (cmd.hz) {
                  const newSteps = steps.map(s => ({ ...s, baseFrequency: cmd.hz! }));
                  setSteps(newSteps);
                  setSceneMeta(prev => ({ ...prev, source: 'AI Modified' }));
              }
              break;
          case 'load_preset':
              if (cmd.presetId) handleScenePresetChange(cmd.presetId);
              break;
      }
  };

  const toggleOrchestrator = () => {
      if (isOrchestratorListening) {
          orchestratorService.stopListening();
      } else {
          orchestratorService.startListening();
      }
  };

  // --- Helpers ---
  const findMatchingPresetId = (pattern: number[]) => {
      if (!Array.isArray(pattern)) return "";
      for (const preset of FRACTAL_PRESETS) {
          if (preset.pattern.length !== pattern.length) continue;
          let match = true;
          for (let i = 0; i < pattern.length; i++) {
              if (Math.abs(preset.pattern[i] - pattern[i]) > 0.00001) {
                  match = false;
                  break;
              }
          }
          if (match) return preset.id;
      }
      return "";
  };

  // --- Save / Load Handlers ---

  const handleSaveScene = () => {
    const sceneData = {
        version: 1,
        kind: "orpheus_scene",
        meta: {
            createdAt: new Date().toISOString(),
            name: sceneMeta.name,
            description: sceneMeta.description,
            source: sceneMeta.source,
            note: "ORPHEUS 16-step scene export"
        },
        tempoBpm: tempo,
        masterGain: masterGain,
        rootFrequency: steps[0]?.baseFrequency || 16.0,
        harmonicLayers,
        steps
    };
    
    const blob = new Blob([JSON.stringify(sceneData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = (sceneMeta.name || "scene").toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    a.download = `orpheus_${safeName}_${ts}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleLoadScene = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      
      const reader = new FileReader();
      reader.onload = (event) => {
          try {
              const json = JSON.parse(event.target?.result as string);
              if (json.kind === 'orpheus_scene' || Array.isArray(json.harmonicLayers) || Array.isArray(json.harmonics)) {
                  const newLayers = json.harmonicLayers || json.harmonics;
                  if (Array.isArray(newLayers)) setHarmonicLayers(newLayers);
                  if (Array.isArray(json.steps)) setSteps(json.steps.slice(0, 16));
                  if (Number.isFinite(json.tempoBpm)) setTempo(json.tempoBpm);
                  if (Number.isFinite(json.masterGain)) setMasterGain(json.masterGain);

                  if (json.meta) {
                      setSceneMeta({
                          name: json.meta.name || "Imported Scene",
                          description: json.meta.description || "",
                          source: json.meta.source || "Imported JSON"
                      });
                  } else {
                      setSceneMeta({ name: file.name.replace(/\.json$/i, ''), description: "", source: "Imported File" });
                  }
              } else {
                  alert("Invalid scene file format.");
              }
          } catch (err) {
              console.error(err);
              alert("Failed to parse scene file.");
          }
      };
      reader.readAsText(file);
      e.target.value = ""; 
  };

  // --- Handlers ---
  
  const handleScenePresetChange = (presetId: string) => {
    const preset = SCENE_PRESETS.find(p => p.id === presetId);
    if (!preset) return;

    const currentRoot = steps[0]?.baseFrequency || 16.0;
    const { steps: newSteps, harmonics: newHarmonics } = preset.build(currentRoot);
    
    setSteps(newSteps);
    setHarmonicLayers(newHarmonics);
    setSceneMeta({
        name: preset.label,
        description: `Preset scene: ${preset.label}`,
        source: `Preset: ${preset.id}`
    });
  };

  const handleLayerChange = (index: number, field: keyof HarmonicLayer, value: any) => {
      const newLayers = [...harmonicLayers];
      newLayers[index] = { ...newLayers[index], [field]: value };
      setHarmonicLayers(newLayers);
      setSceneMeta(prev => ({ ...prev, source: 'Custom (Edited)' }));
  };

  const handleFractalPatternChange = (index: number, text: string) => {
      const parts = text.split(/[, ]+/).filter(Boolean);
      const nums = parts.map(p => parseFloat(p)).filter(v => Number.isFinite(v) && v >= 0);
      const pattern = nums.length > 0 ? nums : [1.0];
      
      const newLayers = [...harmonicLayers];
      newLayers[index] = { ...newLayers[index], fractalPattern: pattern };
      setHarmonicLayers(newLayers);
      setSceneMeta(prev => ({ ...prev, source: 'Custom (Edited)' }));
  };

  const handlePresetChange = (index: number, presetId: string) => {
      const preset = FRACTAL_PRESETS.find(p => p.id === presetId);
      if (preset) {
          const newLayers = [...harmonicLayers];
          newLayers[index] = { ...newLayers[index], fractalPattern: [...preset.pattern] };
          setHarmonicLayers(newLayers);
          setSceneMeta(prev => ({ ...prev, source: 'Custom (Edited)' }));
      }
  };

  const handleStepChange = (index: number, field: keyof StepSettings, value: any) => {
      const newSteps = [...steps];
      newSteps[index] = { ...newSteps[index], [field]: value };
      setSteps(newSteps);
      setSceneMeta(prev => ({ ...prev, source: 'Custom (Edited)' }));
  };

  const handlePhaseChange = (stepIndex: number, layerId: string, value: number) => {
      const newSteps = [...steps];
      const currentStep = newSteps[stepIndex];
      newSteps[stepIndex] = {
          ...currentStep,
          phaseOffsets: {
              ...currentStep.phaseOffsets,
              [layerId]: value
          }
      };
      setSteps(newSteps);
      setSceneMeta(prev => ({ ...prev, source: 'Custom (Edited)' }));
  };

  const togglePlay = async () => {
    if (isPlaying) {
      audioService.stop();
      setIsPlaying(false);
      setCurrentStep(-1);
      wsRef.current?.send(JSON.stringify({ type: 'transport', action: 'STOP' }));
    } else {
      await audioService.start((step) => setCurrentStep(step));
      setIsPlaying(true);
      wsRef.current?.send(JSON.stringify({ type: 'transport', action: 'PLAY' }));
    }
  };

  return (
    <div className="h-screen w-full bg-slate-950 text-slate-100 flex flex-col overflow-hidden font-sans selection:bg-emerald-500/30 relative">
      
      <LibraryPanel 
          docs={libraryDocs} 
          setDocs={setLibraryDocs} 
          isOpen={isLibraryOpen} 
          onClose={() => setIsLibraryOpen(false)} 
      />

      {/* Top Bar */}
      <div className="flex-none flex items-center justify-between px-6 py-3 border-b border-slate-800/70 bg-slate-900/60 backdrop-blur-md z-10">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
             <Activity className="text-emerald-500 w-5 h-5" />
             <div className="text-lg font-semibold tracking-wide text-slate-100">
               ORPHEUS <span className="opacity-50">STACKED</span>
             </div>
          </div>
        </div>

        <div className="flex items-center gap-6 text-xs">
          
          {/* Library Button */}
          <button 
              onClick={() => setIsLibraryOpen(!isLibraryOpen)}
              className={`flex items-center gap-2 px-3 py-1 rounded-full border transition-all ${isLibraryOpen ? 'bg-indigo-900/50 border-indigo-500 text-indigo-300' : 'bg-slate-800/50 border-slate-700/50 text-slate-400 hover:text-indigo-400'}`}
          >
              <Book size={14} />
              <span className="font-mono uppercase tracking-wider">Library</span>
              {libraryDocs.filter(d => d.active).length > 0 && (
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
              )}
          </button>

          {/* Scalar Orchestrator Control */}
          <div className={`flex items-center gap-2 rounded-full px-3 py-1 border transition-all ${isOrchestratorListening ? 'bg-indigo-900/50 border-indigo-500' : 'bg-slate-800/50 border-slate-700/50'}`}>
              <button 
                  onClick={toggleOrchestrator}
                  disabled={isOrchestratorProcessing}
                  className={`flex items-center gap-2 font-mono uppercase tracking-wider transition-colors ${isOrchestratorListening ? 'text-indigo-300 animate-pulse' : 'text-slate-400 hover:text-indigo-400'}`}
              >
                  {isOrchestratorListening ? <Mic size={14} /> : <MicOff size={14} />}
                  <span>{isOrchestratorProcessing ? 'Thinking...' : 'Orchestrator'}</span>
              </button>
              {isOrchestratorListening && (
                  <div className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
              )}
          </div>

          <div className="flex items-center gap-2 bg-slate-800/50 rounded-lg p-1 pr-3 border border-slate-700/50">
             <div className="px-2 text-slate-500 font-mono uppercase">Master Gain</div>
             <input
              type="range" min={0} max={1} step={0.05}
              value={masterGain}
              onChange={e => setMasterGain(parseFloat(e.target.value))}
              className="w-24 h-1 bg-slate-600 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-emerald-400 [&::-webkit-slider-thumb]:rounded-full"
            />
          </div>
          
          <div className="flex items-center gap-2 bg-slate-800/50 rounded-lg p-1 pr-3 border border-slate-700/50">
             <div className="px-2 text-slate-500 font-mono uppercase">Tempo (BPM)</div>
             <input
              type="number" min={20} max={300}
              value={tempo}
              onChange={e => setTempo(parseFloat(e.target.value))}
              className="w-12 bg-transparent text-right font-mono text-emerald-400 outline-none"
            />
          </div>

          <div className={`flex items-center gap-2 ${wsConnected ? 'text-emerald-400' : 'text-slate-600'}`}>
            <Wifi size={14} />
            <span className="font-mono">{wsConnected ? 'LINKED' : 'OFFLINE'}</span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-0 overflow-hidden">
        
        {/* Left: Harmonic Layers Panel */}
        <div className="bg-slate-900/40 border-r border-slate-800/50 flex flex-col p-4 gap-4 overflow-y-auto">
            
            {/* Scene Selector & Save/Load */}
            <div className="bg-slate-900 border border-slate-700/50 rounded-lg p-3 shadow-lg mb-2">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 text-[10px] uppercase text-emerald-500 font-bold">
                        <Disc size={12} /> Scene Presets
                    </div>
                    <div className="flex gap-1">
                         <button 
                            onClick={handleSaveScene}
                            title="Save Scene to JSON"
                            className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-emerald-400 transition-colors"
                         >
                            <Download size={14} />
                         </button>
                         <label 
                            title="Load Scene from JSON"
                            className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-emerald-400 transition-colors cursor-pointer"
                         >
                            <Upload size={14} />
                            <input type="file" accept=".json" onChange={handleLoadScene} className="hidden" />
                         </label>
                    </div>
                </div>
                <div className="relative mb-3">
                    <select 
                        onChange={(e) => handleScenePresetChange(e.target.value)}
                        value=""
                        className="w-full bg-slate-950 border border-emerald-900/50 rounded px-2 py-2 text-xs font-mono text-white focus:outline-none focus:border-emerald-500 appearance-none"
                    >
                        <option value="" disabled>-- Load Preset --</option>
                        {SCENE_PRESETS.map(p => (
                            <option key={p.id} value={p.id}>{p.label}</option>
                        ))}
                    </select>
                     <ChevronDown size={14} className="absolute right-2 top-2.5 text-slate-500 pointer-events-none" />
                </div>

                {/* Scene Browser Details Panel */}
                <div className="bg-slate-950/50 rounded p-2 border border-slate-800/50">
                    <div className="flex justify-between items-center mb-2">
                         <span className="text-[9px] text-slate-500 uppercase font-bold flex items-center gap-1">
                             <Tag size={10} /> Scene Meta
                         </span>
                         <span className="text-[9px] font-mono text-emerald-500/80 truncate max-w-[120px]">
                            {sceneMeta.source}
                         </span>
                    </div>
                    <div className="space-y-2">
                        <input 
                            type="text"
                            value={sceneMeta.name}
                            onChange={(e) => setSceneMeta(prev => ({ ...prev, name: e.target.value }))}
                            placeholder="Scene Name"
                            className="w-full bg-transparent border-b border-slate-700 text-xs font-bold text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500 transition-colors pb-1"
                        />
                        <input 
                            type="text"
                            value={sceneMeta.description}
                            onChange={(e) => setSceneMeta(prev => ({ ...prev, description: e.target.value }))}
                            placeholder="Add description or tags..."
                            className="w-full bg-transparent border-b border-slate-700 text-[10px] text-slate-400 placeholder-slate-700 focus:outline-none focus:border-emerald-500 transition-colors pb-1"
                        />
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-slate-400 font-bold mb-2 mt-2">
                <Layers size={14} /> Harmonic Layers
            </div>
            
            {harmonicLayers.map((layer, idx) => {
                const currentPresetId = findMatchingPresetId(layer.fractalPattern);
                
                return (
                <div key={layer.id} className="bg-slate-900 border border-slate-700/50 rounded-lg p-3 shadow-lg">
                    <div className="flex justify-between items-center mb-3">
                        <span className="font-mono text-xs font-bold text-indigo-300">{layer.label}</span>
                        <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded text-slate-400">x{layer.ratio}</span>
                    </div>

                    {/* Waveform */}
                    <div className="mb-3">
                        <label className="block text-[10px] text-slate-500 mb-1">WAVEFORM</label>
                        <div className="grid grid-cols-4 gap-1">
                            {['sine', 'square', 'saw', 'tri'].map(w => {
                                const fullWave = w === 'saw' ? 'sawtooth' : w === 'tri' ? 'triangle' : w;
                                return (
                                    <button
                                        key={w}
                                        onClick={() => handleLayerChange(idx, 'waveform', fullWave)}
                                        className={`text-[9px] uppercase py-1 rounded border ${layer.waveform === fullWave ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-500 hover:text-indigo-400'}`}
                                    >
                                        {w}
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    {/* Ratio & Gain */}
                    <div className="grid grid-cols-2 gap-2 mb-3">
                        <div>
                            <label className="block text-[10px] text-slate-500 mb-1">RATIO</label>
                            <input 
                                type="number" step="0.1" value={layer.ratio}
                                onChange={(e) => handleLayerChange(idx, 'ratio', parseFloat(e.target.value))}
                                className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-right font-mono"
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] text-slate-500 mb-1">GAIN</label>
                            <input 
                                type="number" min="0" max="1" step="0.1" value={layer.gain}
                                onChange={(e) => handleLayerChange(idx, 'gain', parseFloat(e.target.value))}
                                className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-right font-mono"
                            />
                        </div>
                    </div>

                     {/* Gating Mode & Fractal Pattern */}
                     <div className="space-y-2">
                        <div>
                            <label className="block text-[10px] text-slate-500 mb-1 flex items-center gap-1">
                                <Zap size={10} /> GATING F(t)
                            </label>
                            <select 
                                value={layer.gatingMode}
                                onChange={(e) => handleLayerChange(idx, 'gatingMode', e.target.value as GatingMode)}
                                className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs font-mono uppercase text-indigo-400"
                            >
                                <option value="none">Standard (1.0)</option>
                                <option value="fractal">Fractal Pattern</option>
                            </select>
                        </div>
                        
                        {layer.gatingMode === 'fractal' && (
                            <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                                <div>
                                    <label className="block text-[10px] text-slate-500 mb-1 flex items-center gap-1">
                                        <Hash size={10} /> PRESET
                                    </label>
                                    <div className="relative">
                                        <select 
                                            value={currentPresetId}
                                            onChange={(e) => handlePresetChange(idx, e.target.value)}
                                            className="w-full bg-slate-950 border border-indigo-900/50 rounded px-2 py-1 text-xs font-mono text-emerald-400 focus:outline-none focus:border-indigo-500 appearance-none"
                                        >
                                            <option value="">Custom</option>
                                            {FRACTAL_PRESETS.map(p => (
                                                <option key={p.id} value={p.id}>{p.label}</option>
                                            ))}
                                        </select>
                                        <ChevronDown size={12} className="absolute right-2 top-1.5 text-slate-500 pointer-events-none" />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-[10px] text-slate-500 mb-1">
                                        PATTERN (CSV)
                                    </label>
                                    <input 
                                        type="text" 
                                        value={layer.fractalPattern.join(', ')}
                                        onChange={(e) => handleFractalPatternChange(idx, e.target.value)}
                                        placeholder="1, 0.5, 0.25..."
                                        className="w-full bg-slate-950 border border-indigo-900/50 rounded px-2 py-1 text-xs font-mono text-slate-300 focus:outline-none focus:border-indigo-500"
                                    />
                                    <div className="text-[9px] text-slate-600 mt-1 truncate">
                                        Size: {layer.fractalPattern.length} | Next: {layer.fractalPattern[currentStep % layer.fractalPattern.length]?.toFixed(2) ?? '-'}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )})}

            <div className="flex-1 min-h-[200px] mt-4 rounded-xl border border-slate-800 bg-slate-900 relative overflow-hidden">
                <div className="absolute top-2 left-2 text-[10px] text-slate-500 font-mono z-10">SCOPE</div>
                <VacuumScope activeView={activeView} />
                <div className="absolute bottom-2 right-2 flex gap-1">
                     {(['waveform', 'spectrum'] as const).map(view => (
                         <button 
                            key={view} 
                            onClick={() => setActiveView(view)}
                            className={`px-2 py-0.5 text-[8px] uppercase rounded ${activeView === view ? 'bg-emerald-500 text-slate-900' : 'bg-slate-800 text-slate-400'}`}
                         >
                            {view}
                         </button>
                     ))}
                </div>
            </div>
        </div>

        {/* Right: Steps Grid */}
        <div className="flex flex-col h-full bg-slate-950/50 relative overflow-hidden">
            <div className="flex-none p-4 flex justify-between items-end border-b border-slate-800/50">
                <div className="text-xs uppercase tracking-widest text-slate-400 font-bold">
                    Sweet-16 Step Sequencer
                </div>
                <div className="font-mono text-xs text-emerald-500">
                    {isPlaying ? `STEP ${currentStep + 1} / 16` : 'READY'}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
                <div className="grid grid-cols-4 gap-3">
                    {steps.map((step, i) => {
                        const active = isPlaying && currentStep === i;
                        return (
                            <div key={i} className={`relative p-3 rounded-lg border transition-all duration-100 ${active ? 'bg-slate-800 border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.2)]' : 'bg-slate-900/40 border-slate-800 hover:border-slate-700'}`}>
                                <div className="flex justify-between items-center mb-3">
                                    <span className={`text-xs font-mono font-bold ${active ? 'text-emerald-400' : 'text-slate-500'}`}>
                                        {i.toString().padStart(2, '0')}
                                    </span>
                                    <div className="flex items-center gap-2">
                                        <input 
                                            type="checkbox" 
                                            checked={step.enabled}
                                            onChange={(e) => handleStepChange(i, 'enabled', e.target.checked)}
                                            className="accent-emerald-500 w-3 h-3 cursor-pointer"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-3 mb-3 border-b border-slate-800/50 pb-3">
                                    <div>
                                        <div className="flex justify-between text-[9px] text-slate-500 mb-1">
                                            <span>FREQ (Hz)</span>
                                            <span className="text-slate-300">{step.baseFrequency.toFixed(1)}</span>
                                        </div>
                                        <input 
                                            type="range" min="16" max="256" step="1"
                                            value={step.baseFrequency}
                                            onChange={(e) => handleStepChange(i, 'baseFrequency', parseFloat(e.target.value))}
                                            className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:bg-amber-500 [&::-webkit-slider-thumb]:rounded-full"
                                        />
                                    </div>
                                    <div>
                                        <div className="flex justify-between text-[9px] text-slate-500 mb-1">
                                            <span>GAIN</span>
                                            <span className="text-slate-300">{Math.round(step.stepGain * 100)}%</span>
                                        </div>
                                        <input 
                                            type="range" min="0" max="1" step="0.05"
                                            value={step.stepGain}
                                            onChange={(e) => handleStepChange(i, 'stepGain', parseFloat(e.target.value))}
                                            className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:bg-sky-500 [&::-webkit-slider-thumb]:rounded-full"
                                        />
                                    </div>
                                </div>

                                {/* Phase Offsets */}
                                <div>
                                    <div className="text-[9px] text-slate-500 uppercase tracking-widest mb-1 flex items-center gap-1 opacity-70">
                                        <Clock size={8} /> Phase (0-1)
                                    </div>
                                    <div className="flex gap-1 flex-col">
                                        {harmonicLayers.map(layer => (
                                            <div key={layer.id} className="flex items-center gap-1">
                                                <div className="w-8 text-[8px] font-mono text-slate-600 truncate">{layer.label.split(' ')[0]}</div>
                                                <input 
                                                    type="range" min="0" max="0.9" step="0.05"
                                                    value={step.phaseOffsets[layer.id] || 0}
                                                    onChange={(e) => handlePhaseChange(i, layer.id, parseFloat(e.target.value))}
                                                    title={`${layer.label} Phase`}
                                                    className="flex-1 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-1.5 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-indigo-400 [&::-webkit-slider-thumb]:rounded-sm"
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                
                                {active && (
                                    <div className="absolute inset-0 bg-emerald-500/5 pointer-events-none rounded-lg"></div>
                                )}
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* Transport Footer */}
            <div className="flex-none p-4 bg-slate-900 border-t border-slate-800 flex justify-center gap-4">
                <button 
                    onClick={togglePlay}
                    className={`flex items-center gap-2 px-8 py-3 rounded-full font-bold text-sm tracking-widest transition-all ${isPlaying ? 'bg-red-900/50 text-red-200 hover:bg-red-900' : 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-lg shadow-emerald-900/20'}`}
                >
                    {isPlaying ? <><Square size={14} fill="currentColor"/> STOP SEQ</> : <><Play size={14} fill="currentColor"/> START SEQUENCE</>}
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};
