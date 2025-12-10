import React, { useRef, useState } from 'react';
import { GuidanceDoc, GuidanceType } from '../types';
import { libraryService } from '../services/libraryService';
import { Book, Plus, Loader2, CheckCircle, Circle, FileText, Image as ImageIcon, Trash2, Zap, FileUp, X } from 'lucide-react';

interface Props {
  docs: GuidanceDoc[];
  setDocs: React.Dispatch<React.SetStateAction<GuidanceDoc[]>>;
  isOpen: boolean;
  onClose: () => void;
}

export const LibraryPanel: React.FC<Props> = ({ docs, setDocs, isOpen, onClose }) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  
  // Upload Form State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadType, setUploadType] = useState<GuidanceType>('text');
  const [uploadTags, setUploadTags] = useState('');

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const id = crypto.randomUUID();
      setUploading(true);

      const newDocBase: GuidanceDoc = {
          id,
          title: file.name,
          type: file.type.startsWith('image/') ? 'image' : 'text',
          originalFilename: file.name,
          tags: uploadTags.split(',').map(t => t.trim()).filter(Boolean),
          active: false,
          isAnalyzing: false 
      };

      try {
          const fileData = await libraryService.readFile(file);
          const newDoc = { ...newDocBase, ...fileData };
          
          setDocs(prev => [newDoc, ...prev]);
          setSelectedId(id);
          setUploadTags('');
          
          // Auto-analyze on upload? Let's make it manual to save tokens/control
      } catch (err) {
          console.error(err);
          alert("Failed to read file.");
      } finally {
          setUploading(false);
          if (fileInputRef.current) fileInputRef.current.value = "";
      }
  };

  const analyzeDoc = async (doc: GuidanceDoc) => {
      setDocs(prev => prev.map(d => d.id === doc.id ? { ...d, isAnalyzing: true } : d));
      try {
          const motif = await libraryService.analyzeDocument(doc);
          setDocs(prev => prev.map(d => d.id === doc.id ? { ...d, motif, isAnalyzing: false, active: true } : d));
      } catch (e) {
          setDocs(prev => prev.map(d => d.id === doc.id ? { ...d, isAnalyzing: false } : d));
      }
  };

  const toggleActive = (id: string) => {
      setDocs(prev => prev.map(d => d.id === id ? { ...d, active: !d.active } : d));
  };

  const deleteDoc = (id: string) => {
      setDocs(prev => prev.filter(d => d.id !== id));
      if (selectedId === id) setSelectedId(null);
  };

  const selectedDoc = docs.find(d => d.id === selectedId);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 md:p-12">
      <div className="w-full max-w-5xl h-[80vh] bg-slate-900 border border-slate-700 rounded-xl shadow-2xl flex overflow-hidden flex-col md:flex-row">
          
          {/* LEFT: List & Upload */}
          <div className="w-full md:w-1/3 border-r border-slate-800 flex flex-col bg-slate-950/50">
              <div className="p-4 border-b border-slate-800 flex justify-between items-center">
                  <div className="flex items-center gap-2 text-indigo-400 font-mono uppercase tracking-widest font-bold">
                      <Book size={18} /> Orpheus Library
                  </div>
              </div>
              
              {/* Upload Area */}
              <div className="p-4 bg-slate-900/50 border-b border-slate-800">
                   <div className="flex gap-2 mb-2">
                       <input 
                         type="text" 
                         placeholder="Tags (e.g. cosmology, healing)" 
                         value={uploadTags}
                         onChange={e => setUploadTags(e.target.value)}
                         className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-300 focus:border-indigo-500 outline-none"
                       />
                   </div>
                   <label className={`flex items-center justify-center gap-2 w-full py-2 border border-dashed border-slate-700 rounded hover:bg-slate-800 cursor-pointer transition-colors ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
                       {uploading ? <Loader2 size={16} className="animate-spin text-indigo-500" /> : <FileUp size={16} className="text-slate-500" />}
                       <span className="text-xs font-bold text-slate-400 uppercase">Upload Guidance</span>
                       <input ref={fileInputRef} type="file" onChange={handleFileUpload} className="hidden" />
                   </label>
              </div>

              {/* List */}
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                  {docs.length === 0 && (
                      <div className="text-center p-8 text-slate-600 text-xs italic">
                          No scrolls in the library.
                      </div>
                  )}
                  {docs.map(doc => (
                      <div 
                        key={doc.id}
                        onClick={() => setSelectedId(doc.id)}
                        className={`p-3 rounded-lg cursor-pointer transition-all border ${selectedId === doc.id ? 'bg-indigo-900/20 border-indigo-500/50' : 'hover:bg-slate-800 border-transparent'}`}
                      >
                          <div className="flex justify-between items-start">
                             <div className="flex items-center gap-2 overflow-hidden">
                                {doc.type === 'image' ? <ImageIcon size={14} className="text-pink-400 flex-shrink-0" /> : <FileText size={14} className="text-blue-400 flex-shrink-0" />}
                                <div className="flex flex-col truncate">
                                    <span className={`text-xs font-bold truncate ${doc.active ? 'text-emerald-400' : 'text-slate-300'}`}>{doc.title}</span>
                                    <span className="text-[10px] text-slate-500">{doc.tags.join(', ')}</span>
                                </div>
                             </div>
                             {doc.active && <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />}
                          </div>
                      </div>
                  ))}
              </div>
          </div>

          {/* RIGHT: Detail View */}
          <div className="flex-1 flex flex-col bg-slate-900 relative">
               <button onClick={onClose} className="absolute top-4 right-4 text-slate-500 hover:text-white z-10">
                   <X size={20} />
               </button>

               {selectedDoc ? (
                   <div className="flex-1 flex flex-col p-6 overflow-y-auto">
                       {/* Header */}
                       <div className="mb-6">
                           <h2 className="text-2xl font-bold text-slate-100 mb-2">{selectedDoc.title}</h2>
                           <div className="flex items-center gap-2 text-xs text-slate-400">
                               <span className="uppercase tracking-wider px-2 py-0.5 rounded bg-slate-800">{selectedDoc.type}</span>
                               <span>{selectedDoc.originalFilename}</span>
                           </div>
                       </div>

                       {/* Actions */}
                       <div className="flex gap-3 mb-8 border-b border-slate-800 pb-6">
                           <button 
                               onClick={() => toggleActive(selectedDoc.id)}
                               className={`flex items-center gap-2 px-4 py-2 rounded-md font-bold text-xs uppercase tracking-wider transition-all ${selectedDoc.active ? 'bg-emerald-600 text-white hover:bg-emerald-500' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                           >
                               {selectedDoc.active ? <><CheckCircle size={14} /> Active Guidance</> : <><Circle size={14} /> Set Inactive</>}
                           </button>

                           <button 
                               onClick={() => analyzeDoc(selectedDoc)}
                               disabled={selectedDoc.isAnalyzing}
                               className="flex items-center gap-2 px-4 py-2 rounded-md font-bold text-xs uppercase tracking-wider bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                           >
                               {selectedDoc.isAnalyzing ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                               {selectedDoc.motif ? 'Regenerate Motif' : 'Analyze / Generate Motif'}
                           </button>

                           <button 
                               onClick={() => deleteDoc(selectedDoc.id)}
                               className="ml-auto p-2 text-slate-600 hover:text-red-400 transition-colors"
                           >
                               <Trash2 size={16} />
                           </button>
                       </div>

                       {/* Motif Display */}
                       <div className="flex-1">
                           <h3 className="text-sm font-mono text-indigo-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                               <Zap size={14} /> Extracted Control Motif
                           </h3>
                           
                           {selectedDoc.isAnalyzing ? (
                               <div className="h-40 flex flex-col items-center justify-center text-indigo-300 animate-pulse gap-3">
                                   <Loader2 size={32} className="animate-spin" />
                                   <span className="text-xs font-mono uppercase">Consulting Gemini Scalar Theorist...</span>
                               </div>
                           ) : selectedDoc.motif ? (
                               <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                   <div className="bg-slate-950/50 p-4 rounded-lg border border-indigo-500/30">
                                       <p className="text-lg text-slate-200 italic font-serif leading-relaxed">
                                           "{selectedDoc.motif.summary}"
                                       </p>
                                   </div>

                                   <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                       <div className="bg-slate-800/50 p-3 rounded border border-slate-700">
                                           <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Root Frequency</div>
                                           <div className="text-emerald-400 font-mono text-sm">
                                               {selectedDoc.motif.controlHints.favoredRootHz ? `${selectedDoc.motif.controlHints.favoredRootHz} Hz` : 'Any'}
                                           </div>
                                       </div>
                                       <div className="bg-slate-800/50 p-3 rounded border border-slate-700">
                                           <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Tempo Bias</div>
                                           <div className="text-amber-400 font-mono text-sm capitalize">
                                               {selectedDoc.motif.controlHints.tempoBias || '-'}
                                           </div>
                                       </div>
                                       <div className="bg-slate-800/50 p-3 rounded border border-slate-700">
                                           <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Density</div>
                                           <div className="text-sky-400 font-mono text-sm capitalize">
                                               {selectedDoc.motif.controlHints.densityBias || '-'}
                                           </div>
                                       </div>
                                       <div className="bg-slate-800/50 p-3 rounded border border-slate-700">
                                           <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Fractal</div>
                                           <div className="text-purple-400 font-mono text-sm capitalize">
                                               {selectedDoc.motif.controlHints.fractalBias || '-'}
                                           </div>
                                       </div>
                                   </div>

                                   <div>
                                       <div className="text-[10px] text-slate-500 uppercase font-bold mb-2">Pattern Archetypes</div>
                                       <div className="flex flex-wrap gap-2">
                                           {selectedDoc.motif.controlHints.patternKeywords?.map((k, i) => (
                                               <span key={i} className="px-2 py-1 bg-indigo-900/30 text-indigo-300 border border-indigo-500/30 rounded text-xs font-mono">
                                                   {k}
                                               </span>
                                           ))}
                                       </div>
                                   </div>
                               </div>
                           ) : (
                               <div className="h-40 flex items-center justify-center border border-dashed border-slate-800 rounded-lg text-slate-600 text-sm">
                                   Click "Analyze" to extract harmonic instructions from this document.
                               </div>
                           )}
                       </div>
                   </div>
               ) : (
                   <div className="flex-1 flex flex-col items-center justify-center text-slate-600 gap-4">
                       <Book size={48} className="opacity-20" />
                       <p className="text-sm">Select a document or upload a new one to begin.</p>
                   </div>
               )}
          </div>
      </div>
    </div>
  );
};