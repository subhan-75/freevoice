
import { GoogleGenAI } from "@google/genai";

/**
 * FreeVoice Pro | Proprietary Neural Configuration
 */

// Core-3 Engine for advanced audio-to-text and emotive analysis
export const NEURAL_CORE_STUDIO = 'gemini-3-flash-preview';

// Dedicated Synthesis model for high-fidelity voice reconstruction
export const NEURAL_CORE_SYNTHESIS = 'gemini-2.5-flash-preview-tts';

// Designated model for real-time low-latency biometric synchronization
export const NEURAL_CORE_LIVE = 'gemini-2.5-flash-native-audio-preview-09-2025';

/**
 * Custom Neural client initialization.
 */
export const getNeuralClient = () => {
  return new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
};
