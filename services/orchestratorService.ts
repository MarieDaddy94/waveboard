import { GoogleGenAI, Schema, Part } from "@google/genai";
import { OrpheusState, OrchestratorResponse, GuidanceMotif } from "../types";
import { SCENE_PRESETS } from "../constants";

// --- Speech Recognition Types ---
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}
interface SpeechRecognitionResultList {
  [index: number]: SpeechRecognitionResult;
  length: number;
}
interface SpeechRecognitionResult {
  [index: number]: SpeechRecognitionAlternative;
  isFinal: boolean;
}
interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}
interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: (event: SpeechRecognitionEvent) => void;
  onerror: (event: Event) => void;
  onend: (event: Event) => void;
  onstart: (event: Event) => void;
}
declare global {
  interface Window {
    SpeechRecognition: { new(): SpeechRecognition };
    webkitSpeechRecognition: { new(): SpeechRecognition };
    html2canvas: any;
  }
}

class OrchestratorService {
  private recognition: SpeechRecognition | null = null;
  private isListening: boolean = false;
  private onResultCallback: ((text: string) => void) | null = null;
  private onListeningStateChange: ((isListening: boolean) => void) | null = null;

  constructor() {
    this.initSpeech();
  }

  private initSpeech() {
    const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (Rec) {
      this.recognition = new Rec();
      this.recognition.continuous = false;
      this.recognition.interimResults = false;
      this.recognition.lang = 'en-US';

      this.recognition.onstart = () => {
        this.isListening = true;
        this.onListeningStateChange?.(true);
      };

      this.recognition.onend = () => {
        this.isListening = false;
        this.onListeningStateChange?.(false);
      };

      this.recognition.onerror = (e) => {
        console.warn("Speech error", e);
        this.isListening = false;
        this.onListeningStateChange?.(false);
      };

      this.recognition.onresult = (e) => {
        const transcript = e.results[0]?.[0]?.transcript;
        if (transcript && this.onResultCallback) {
          this.onResultCallback(transcript);
        }
      };
    }
  }

  public setCallbacks(
    onResult: (text: string) => void,
    onStateChange: (isListening: boolean) => void
  ) {
    this.onResultCallback = onResult;
    this.onListeningStateChange = onStateChange;
  }

  public startListening() {
    if (this.recognition && !this.isListening) {
      try {
        this.recognition.start();
      } catch(e) { console.error(e); }
    }
  }

  public stopListening() {
    if (this.recognition && this.isListening) {
      this.recognition.stop();
    }
  }

  public speak(text: string) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    // Try to find a nice voice
    const voices = window.speechSynthesis.getVoices();
    const niceVoice = voices.find(v => v.name.includes('Google US English') || v.name.includes('Samantha'));
    if (niceVoice) utter.voice = niceVoice;
    utter.rate = 1.05;
    utter.pitch = 1.0;
    window.speechSynthesis.speak(utter);
  }

  // --- Screenshot Helpers ---
  private extractBase64FromDataURL(dataURL: string): string | null {
      if (!dataURL || typeof dataURL !== "string") return null;
      const parts = dataURL.split(",");
      if (parts.length !== 2) return null;
      return parts[1];
  }

  public async captureScreenshot(): Promise<string | null> {
      try {
          // 1. Preferred: Direct Scope Canvas Capture (Fastest)
          const scopeCanvas = document.getElementById("orpheusScopeCanvas") as HTMLCanvasElement;
          if (scopeCanvas) {
              const dataURL = scopeCanvas.toDataURL("image/png");
              return this.extractBase64FromDataURL(dataURL);
          }

          // 2. Fallback: Full DOM Capture via html2canvas
          if (window.html2canvas) {
              const root = document.getElementById("root") || document.body;
              const canvas = await window.html2canvas(root, {
                  useCORS: true,
                  logging: false,
                  backgroundColor: "#020617" // match slate-950
              });
              const dataURL = canvas.toDataURL("image/png");
              return this.extractBase64FromDataURL(dataURL);
          }

          return null;
      } catch (err) {
          console.warn("Screenshot capture failed:", err);
          return null;
      }
  }

  public async consultGemini(userText: string, currentState: OrpheusState, activeMotifs: GuidanceMotif[] = []): Promise<OrchestratorResponse> {
    if (!process.env.API_KEY) {
      return { reply_text: "I need an API key to function.", command: null };
    }

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    // Capture visual context
    const screenshotBase64 = await this.captureScreenshot();

    const presetIds = SCENE_PRESETS.map(p => p.id).join(" | ");
    
    // Convert motifs to a string representation for the prompt
    const motifContext = activeMotifs.length > 0 
        ? JSON.stringify(activeMotifs, null, 2) 
        : "None";

    const systemPrompt = `
      You are the SCALAR ORCHESTRATOR for the Orpheus 16-step vacuum harmonics engine.

      INPUTS YOU RECEIVE
      - user_text: what the human just said
      - scene: JSON snapshot of the current sequencer state
      - screenshot: PNG image of the current UI
      - guidance_motifs: an array of "motif" objects derived from uploaded texts/images (The Scores).

      Each guidance_motif has:
       - summary: description of document
       - controlHints: { favoredRootHz, tempoBias, densityBias, fractalBias, patternKeywords }

      Think of guidance_motifs as the SCORES the user wants you to follow. They are the "spells" or "instructions" on how to play.

      CONTEXT - CURRENT ENGINE STATE:
      - Tempo: ${currentState.tempo} BPM
      - Master Gain: ${currentState.masterGain}
      - Root Freq: ${currentState.steps[0]?.baseFrequency} Hz
      - Scene Name: "${currentState.sceneMeta.name}"
      - Available Presets: ${presetIds}

      CONTEXT - ACTIVE GUIDANCE MOTIFS:
      ${motifContext}

      YOUR JOB (EVERY RESPONSE)

      1. VISUAL / STATE DESCRIPTION
         - Briefly describe what you see in the scene + screenshot.
         - Mention visual cues like active steps, waveform shapes, or overall energy.

      2. GUIDANCE INTERPRETATION
         - Briefly mention any active motifs that seem relevant.
         - Example: "You have the 'Vacuum Resonance Cosmology' motif active, so I'll favor 16 Hz and a sparse texture."
         - Use the controlHints (favoredRootHz, tempoBias, densityBias, fractalBias, patternKeywords) to shape your decisions. 
         - If multiple motifs conflict, blend them and say so.

      3. ACTION PLAN
         - Interpret the user_text request in light of the scene AND guidance_motifs.
         - Decide if you need to change tempo, root frequency, step pattern, or presets.
         - Explain in 1–2 sentences what you’re going to do.

      4. COMMAND OBJECT
         - Return AT MOST ONE command object for the frontend to apply.
         - If no change is needed, set command to null.

      VALID COMMAND SHAPES (PICK EXACTLY ONE OR null):
      { "type": "start" }
      { "type": "stop" }
      { "type": "restart" }
      { "type": "set_tempo", "bpm": <number 20–240> }
      { "type": "set_root_frequency", "hz": <number> }
      { "type": "set_master_gain", "value": <0–1> }
      { "type": "load_preset", "presetId": "${presetIds}" }
      { "type": "set_step_gain", "stepIndex": <0–15>, "gain": <0–1> }
      { "type": "set_step_enabled", "stepIndex": <0–15>, "enabled": true | false }

      RESPONSE FORMAT (STRICT)
      Always respond with a SINGLE JSON object in plain text, no markdown, no backticks:

      {
        "reply_text": "string – this will be spoken out loud to the user",
        "command": { ...one of the above... } OR null
      }

      - reply_text MUST:
          1) Describe what you see now.
          2) Mention active guidance motifs.
          3) Describe what you’re doing.
      - Keep reply_text concise but vivid (2–5 sentences total).
    `;

    try {
      // Build content parts (multimodal)
      const parts: Part[] = [{ text: userText }];
      
      if (screenshotBase64) {
          parts.push({
              inlineData: {
                  mimeType: "image/png",
                  data: screenshotBase64
              }
          });
      }

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
      if (!text) throw new Error("Empty response");
      return JSON.parse(text) as OrchestratorResponse;

    } catch (e) {
      console.error("Gemini Orchestrator Error", e);
      return { reply_text: "Interference detected. Command failed.", command: null };
    }
  }
}

export const orchestratorService = new OrchestratorService();