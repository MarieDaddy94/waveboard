import { GoogleGenAI } from "@google/genai";
import { GuidanceDoc, GuidanceMotif } from "../types";

class LibraryService {
  
  // Analyze a document to extract a control motif
  public async analyzeDocument(doc: GuidanceDoc): Promise<GuidanceMotif> {
    if (!process.env.API_KEY) {
      throw new Error("Missing API Key");
    }

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    // Truncate text content if too long to save context window (roughly 10k chars)
    const textContentTruncated = doc.content ? doc.content.substring(0, 15000) : "";

    const systemPrompt = `
      You are a scalar music theorist and control-scheme designer for the Orpheus Vacuum Harmonics Engine.
      The engine is a 16-step sequencer that plays layered tones at specific frequencies (harmonics of 16 Hz) to interact with a fluid vacuum medium.

      Your job: given a document or image the user uploads (VRP cosmology, technical notes, ancient glyphs, crop-circle geometries, etc.), you must extract a concise "Motif": a summary + a small set of control hints that tell Orpheus how it should “play” when this document is active as guidance.

      Think of each document as a “score” or “spell” that shapes:
        • which root frequency is favored (e.g. 16 Hz, 32 Hz, 64 Hz),
        • how fast or slow the sequence should run,
        • how dense the pattern should be,
        • how simple or recursive the fractal patterns should be,
        • what kind of pattern archetypes to favor (e.g. “charge–spin–lift”, “heartbeat”, “healing cave”).

      You must output a single JSON object with the key “motif”.
    `;

    const userPrompt = `
      You are analyzing one guidance document for the Orpheus Library.

      Document metadata:
      - title: "${doc.title}"
      - type: "${doc.type}"

      TEXT CONTENT (if available):
      ---------------------------
      ${textContentTruncated}
      ---------------------------

      If this is an image, you will see it as a separate input.

      TASK:
      1. Briefly explain in 1–2 sentences what this document or image is about, focusing on resonance, frequency, geometry, or ritual use.
      2. Infer CONTROL HINTS for the Orpheus sequencer:
         - favoredRootHz: pick one from [16, 32, 64, 128, 256] or omit. 
           (Strongly prefer 16 Hz if VRP/Schumann/Pyramids).
         - tempoBias: "slow" | "medium" | "fast"
         - densityBias: "sparse" | "steady" | "dense"
         - fractalBias: "simple" | "recursive" | "chaotic"
         - patternKeywords: array of strings (e.g. "charge-spin-lift", "heartbeat", "octave-lattice")
      
      3. Return your result strictly in this JSON shape:
      {
        "motif": {
          "title": "short descriptive title",
          "summary": "1–2 sentences explaining the score",
          "controlHints": {
            "favoredRootHz": 16,
            "tempoBias": "slow",
            "densityBias": "sparse",
            "fractalBias": "recursive",
            "patternKeywords": ["keyword1"]
          }
        }
      }
    `;

    const parts = [];
    
    // Add Image Part if exists
    if (doc.type === 'image' && doc.imageBase64) {
        const base64Data = doc.imageBase64.includes('base64,') 
            ? doc.imageBase64.split('base64,')[1] 
            : doc.imageBase64;
        
        parts.push({
            inlineData: {
                mimeType: "image/png", 
                data: base64Data
            }
        });
    }

    parts.push({ text: userPrompt });

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [
                {
                    role: 'user',
                    parts: parts
                }
            ],
            config: {
                systemInstruction: systemPrompt,
                responseMimeType: "application/json"
            }
        });

        const text = response.text;
        if (!text) throw new Error("Analysis failed: Empty response");
        
        const json = JSON.parse(text);
        return json.motif as GuidanceMotif;

    } catch (e) {
        console.error("Library Analysis Error", e);
        return {
            summary: "Analysis failed due to interference.",
            controlHints: { densityBias: "steady" }
        };
    }
  }

  // Helper to read file from input
  public async readFile(file: File): Promise<Partial<GuidanceDoc>> {
      return new Promise((resolve, reject) => {
          const reader = new FileReader();
          
          if (file.type.startsWith('image/')) {
              reader.onload = (e) => {
                  resolve({
                      title: file.name,
                      type: 'image',
                      originalFilename: file.name,
                      imageBase64: e.target?.result as string,
                      tags: ['image', 'visual']
                  });
              };
              reader.readAsDataURL(file);
          } else {
              // Assume text for everything else (txt, md, json)
              reader.onload = (e) => {
                  resolve({
                      title: file.name,
                      type: 'text', // treating PDF as text upload for now/placeholder or raw read
                      originalFilename: file.name,
                      content: e.target?.result as string,
                      tags: ['text']
                  });
              };
              reader.readAsText(file);
          }
          reader.onerror = reject;
      });
  }
}

export const libraryService = new LibraryService();