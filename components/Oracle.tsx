import React, { useState } from 'react';
import { Sparkles, MessageSquare } from 'lucide-react';
import { ChannelData, OracleResponse } from '../types';
import { consultOracle } from '../services/geminiService';

interface Props {
  activeChannels: ChannelData[];
  schumannDepth: number;
}

export const Oracle: React.FC<Props> = ({ activeChannels, schumannDepth }) => {
  const [response, setResponse] = useState<OracleResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const handleConsult = async () => {
    setLoading(true);
    const result = await consultOracle(activeChannels, schumannDepth);
    setResponse(result);
    setLoading(false);
  };

  return (
    <div className="bg-slate-900 border border-indigo-900/50 rounded-xl p-6 mt-6 relative overflow-hidden">
      <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
        <Sparkles size={100} />
      </div>

      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-indigo-500/20 rounded-lg text-indigo-400">
           <Sparkles size={24} />
        </div>
        <h2 className="text-xl font-bold text-indigo-100 font-mono tracking-widest">SONIC ORACLE</h2>
      </div>

      <p className="text-slate-400 text-sm mb-6 max-w-lg">
        Consult the machine intelligence. It will analyze the current harmonic stack, gating fractals, and Schumann interference to reveal the hidden nature of the sound.
      </p>

      {!response && !loading && (
        <button 
          onClick={handleConsult}
          className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-all shadow-lg shadow-indigo-900/20 font-mono text-sm uppercase tracking-wider"
        >
          <MessageSquare size={16} />
          Interpret Signal
        </button>
      )}

      {loading && (
        <div className="flex items-center gap-3 text-indigo-300 animate-pulse font-mono text-sm">
           <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{animationDelay: '0s'}}></div>
           <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
           <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
           <span>COMMUNING WITH THE ETHER...</span>
        </div>
      )}

      {response && (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="mb-4">
            <span className="text-xs text-indigo-400 uppercase tracking-widest border border-indigo-500/30 px-2 py-1 rounded">Vibe Detected</span>
            <p className="text-xl text-white mt-2 font-light">{response.mood}</p>
          </div>
          <div className="bg-indigo-950/30 p-4 rounded-lg border-l-2 border-indigo-500">
             <p className="text-indigo-100 italic font-serif text-lg leading-relaxed">"{response.interpretation}"</p>
          </div>
          <button 
            onClick={handleConsult}
            className="mt-4 text-xs text-slate-500 hover:text-indigo-400 transition-colors uppercase tracking-wider"
          >
            Refresh Prophecy
          </button>
        </div>
      )}
    </div>
  );
};
