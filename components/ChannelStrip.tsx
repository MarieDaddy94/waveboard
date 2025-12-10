import React from 'react';
import { ChannelData } from '../types';
import { Activity, Power } from 'lucide-react';

interface Props {
  data: ChannelData;
  isActiveStep: boolean; // Is the sequencer currently triggering this channel's gate?
  onToggle: (id: number, active: boolean) => void;
  gateFraction: number; // The visual width of the pulse based on Eye of Horus
}

export const ChannelStrip: React.FC<Props> = ({ data, isActiveStep, onToggle, gateFraction }) => {
  
  return (
    <div className={`flex items-center gap-2 p-2 rounded-md transition-all duration-300 ${data.isActive ? 'bg-slate-900/50 border border-slate-700' : 'bg-slate-950 opacity-50 border border-transparent'}`}>
      {/* Toggle */}
      <button 
        onClick={() => onToggle(data.id, !data.isActive)}
        className={`p-2 rounded-full transition-colors ${data.isActive ? 'text-cyan-400 bg-cyan-950/30 hover:bg-cyan-900/50' : 'text-slate-600 hover:text-slate-400'}`}
      >
        <Power size={16} />
      </button>

      {/* Info */}
      <div className="w-24 text-xs font-mono">
        <div className="text-slate-300 font-bold">CH {data.id.toString().padStart(2, '0')}</div>
        <div className="text-slate-500">{data.freq.toFixed(1)} Hz</div>
      </div>

      {/* Visualization Bar */}
      <div className="flex-1 h-8 bg-slate-900 rounded overflow-hidden relative flex items-center px-2">
         {/* Background Grid */}
         <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/dark-matter.png')] opacity-20"></div>
         
         {/* Active Note Pulse */}
         <div 
            className={`absolute left-0 top-0 bottom-0 bg-gradient-to-r from-amber-500/80 to-cyan-500/80 transition-all duration-75 ease-out`}
            style={{ 
                width: isActiveStep && data.isActive ? `${gateFraction * 100}%` : '0%',
                opacity: isActiveStep && data.isActive ? 1 : 0
            }}
         />

         {/* Base waveform representation (static) */}
         <svg className="absolute inset-0 w-full h-full opacity-30" preserveAspectRatio="none">
             <path 
                d={`M0 16 Q 10 0, 20 16 T 40 16 T 60 16 T 80 16 T 100 16`} 
                fill="none" 
                stroke={data.octaveBand === 'low' ? '#f59e0b' : '#06b6d4'} 
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
             />
         </svg>
      </div>
    </div>
  );
};
