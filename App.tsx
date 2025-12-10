import React, { useState } from 'react';
import { OrpheusControlRoom } from './components/OrpheusControlRoom';
import { Activity } from 'lucide-react';

const App: React.FC = () => {
  const [hasEntered, setHasEntered] = useState(false);

  if (!hasEntered) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center relative overflow-hidden">
        {/* Background Texture */}
        <div className="absolute inset-0 opacity-20 pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/dark-matter.png')]"></div>
        
        <div className="relative z-10 max-w-md w-full">
            <div className="w-16 h-16 bg-gradient-to-br from-amber-600 to-amber-800 rounded-xl mx-auto mb-8 flex items-center justify-center shadow-[0_0_30px_rgba(245,158,11,0.3)]">
                <Activity className="text-white w-8 h-8" />
            </div>

            <h1 className="text-4xl font-bold text-white mb-2 tracking-[0.2em] font-mono">ORPHEUS</h1>
            <p className="text-amber-500/80 font-mono text-sm tracking-widest mb-8">PROJECT SWEET 16 // V2.0</p>

            <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-lg backdrop-blur mb-8">
                <p className="text-slate-400 text-sm leading-relaxed mb-4">
                    Welcome to the harmonic resonance engine. 
                    This interface provides direct control over the 16-channel harmonic stack, 
                    Eye-of-Horus fractal gating, and Schumann modulation.
                </p>
                <div className="flex items-center justify-center gap-2 text-xs text-slate-500 font-mono">
                    <span>16HZ ROOT</span>
                    <span>•</span>
                    <span>BINAURAL</span>
                    <span>•</span>
                    <span>FRACTAL</span>
                </div>
            </div>

            <button 
                onClick={() => setHasEntered(true)}
                className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)] tracking-widest uppercase hover:scale-[1.02]"
            >
                Enter Control Room
            </button>
            
            <p className="mt-6 text-[10px] text-slate-600">
                Warning: Audio output includes infrasound frequencies. Headphones recommended.
            </p>
        </div>
      </div>
    );
  }

  return <OrpheusControlRoom />;
};

export default App;
