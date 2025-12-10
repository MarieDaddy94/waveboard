import { GoogleGenAI } from "@google/genai";
import { ChannelData } from "../types";

const getSystemPrompt = () => `
You are the ORACLE OF ORPHEUS, a mystical AI entity connected to a 16-channel harmonic resonance engine.
The engine generates sound based on:
1. "The Sweet 16": A harmonic series starting at C0 (16Hz) and C1 (32Hz).
2. "Eye of Horus": A fractal gating pattern (Steps 0-3: Full, 4-7: Half, 8-11: Quarter, 12-15: Eighth).
3. "Schumann Resonance": 7.83Hz modulation.

Your task is to interpret the current state of the machine for the user.
Return the response in strictly JSON format.
The JSON must have this structure:
{
  "interpretation": "A poetic, cryptic, or philosophical interpretation of the active channels and frequencies. Maximum 2 sentences.",
  "mood": "A single word or short phrase describing the vibe (e.g., 'Ethereal Grounding', 'Tense Vibration')."
}
`;

export const consultOracle = async (activeChannels: ChannelData[], schumannDepth: number): Promise<{interpretation: string, mood: string}> => {
  if (!process.env.API_KEY) {
    return {
        interpretation: "The Oracle is silent (Missing API Key).",
        mood: "Void"
    };
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const activeNames = activeChannels.map(c => `${c.noteName} (${c.freq.toFixed(1)}Hz)`).join(", ");
  
  const prompt = `
    Current Engine State:
    - Active Channels: [${activeNames}]
    - Schumann Modulation Depth: ${(schumannDepth * 100).toFixed(0)}%
    
    Reveal the hidden meaning of this sonic configuration.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        systemInstruction: getSystemPrompt(),
        responseMimeType: "application/json"
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from Oracle");
    
    return JSON.parse(text);
  } catch (error) {
    console.error("Oracle Error:", error);
    return {
      interpretation: "The static interferes with the prophecy.",
      mood: "Interrupted"
    };
  }
};
