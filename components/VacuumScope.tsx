import React, { useEffect, useRef } from 'react';
import { audioService } from '../services/audioService';

interface Props {
  activeView: 'waveform' | 'spectrum' | 'nodemap';
}

export const VacuumScope: React.FC<Props> = ({ activeView }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    const analyser = audioService.getAnalyser();

    // Buffers
    const bufferLength = analyser ? analyser.frequencyBinCount : 1024;
    const dataArray = new Uint8Array(bufferLength);

    const render = () => {
      animationId = requestAnimationFrame(render);
      if (!analyser) return;

      const width = canvas.width;
      const height = canvas.height;

      ctx.clearRect(0, 0, width, height);

      // --- WAVEFORM VIEW ---
      if (activeView === 'waveform') {
        analyser.getByteTimeDomainData(dataArray);
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#10b981'; // Emerald-500
        ctx.beginPath();

        const sliceWidth = width / bufferLength;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          const v = dataArray[i] / 128.0;
          const y = (v * height) / 2;

          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);

          x += sliceWidth;
        }
        ctx.lineTo(width, height / 2);
        ctx.stroke();
      } 
      
      // --- SPECTRUM VIEW ---
      else if (activeView === 'spectrum') {
        analyser.getByteFrequencyData(dataArray);
        const barWidth = (width / bufferLength) * 2.5;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          const barHeight = (dataArray[i] / 255) * height;
          const r = barHeight + 25 * (i / bufferLength);
          const g = 250 * (i / bufferLength);
          const b = 50;

          ctx.fillStyle = `rgb(${r},${g},${b})`;
          ctx.fillRect(x, height - barHeight, barWidth, barHeight);

          x += barWidth + 1;
          if (x > width) break;
        }
      }

      // --- NODE MAP VIEW ---
      else if (activeView === 'nodemap') {
          // This creates a 4x4 grid reacting to low frequencies
          // A bit hacky since we don't have individual channel analysis, 
          // but we map the FFT bins to the grid.
          analyser.getByteFrequencyData(dataArray);
          
          // Use low-mid frequencies
          const relevantData = dataArray.slice(0, 16); 
          
          const cols = 4;
          const rows = 4;
          const cellW = width / cols;
          const cellH = height / rows;

          for(let i=0; i<16; i++) {
              const r = Math.floor(i / cols);
              const c = i % cols;
              const val = relevantData[i] || 0;
              const brightness = val / 255;
              
              ctx.fillStyle = `rgba(16, 185, 129, ${brightness * 0.8})`;
              ctx.fillRect(c * cellW + 2, r * cellH + 2, cellW - 4, cellH - 4);
              
              // Text
              ctx.fillStyle = `rgba(255,255,255, ${brightness + 0.2})`;
              ctx.font = '10px monospace';
              ctx.fillText(`CH${i}`, c * cellW + 10, r * cellH + 20);
          }
      }
    };

    render();

    return () => cancelAnimationFrame(animationId);
  }, [activeView]);

  return (
    <canvas 
      id="orpheusScopeCanvas"
      ref={canvasRef} 
      width={600} 
      height={300} 
      className="w-full h-full"
    />
  );
};