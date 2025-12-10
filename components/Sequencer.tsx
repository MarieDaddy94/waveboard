import React from 'react';
import { NUM_STEPS, getGateFraction } from '../constants';

interface Props {
  currentStep: number;
}

export const Sequencer: React.FC<Props> = ({ currentStep }) => {
  return (
    <div className="w-full mb-8">
      <div className="flex justify-between items-end h-16 gap-1">
        {Array.from({ length: NUM_STEPS }).map((_, i) => {
          const isCurrent = currentStep === i;
          const gateHeight = getGateFraction(i) * 100; // 100%, 50%, 25%, 12.5%
          
          return (
            <div key={i} className="flex-1 flex flex-col justify-end items-center h-full group relative">
              {/* Tooltip for Gate Length */}
              <div className="absolute -top-8 opacity-0 group-hover:opacity-100 text-[10px] bg-slate-800 px-2 py-1 rounded transition-opacity pointer-events-none whitespace-nowrap z-10">
                Step {i}: {gateHeight}% Gate
              </div>

              {/* Step Indicator */}
              <div 
                className={`w-full rounded-t-sm transition-all duration-100 ${
                  isCurrent 
                    ? 'bg-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.6)]' 
                    : 'bg-slate-800'
                }`}
                style={{ height: `${Math.max(gateHeight, 10)}%` }} // Min height for visibility
              />
              
              {/* Base Line */}
              <div className={`w-full h-1 mt-1 rounded-full ${isCurrent ? 'bg-amber-600' : 'bg-slate-900'}`} />
            </div>
          );
        })}
      </div>
      <div className="flex justify-between px-1 mt-2 text-[10px] text-slate-600 font-mono uppercase tracking-widest">
         <span>Charge (100%)</span>
         <span>Nucleate (50%)</span>
         <span>Spin (25%)</span>
         <span>Lift (12.5%)</span>
      </div>
    </div>
  );
};
