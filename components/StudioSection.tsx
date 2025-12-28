
import { GoogleGenAI, Modality } from "@google/genai";
import React, { useState, useRef } from 'react';
import { VoiceConfig, User } from '../types';
import { AUDIO_SAMPLE_RATE_OUTPUT, MASTER_EMAILS } from '../constants';
import { blobToBase64, decodeBase64, createWavBlob } from '../services/audioUtils';
import { NEURAL_CORE_STUDIO, NEURAL_CORE_SYNTHESIS } from '../services/geminiConfig';

interface StudioSectionProps {
  selectedVoice: VoiceConfig;
  setErrorMessage: (msg: string | null) => void;
  isPro: boolean;
  user: User | null;
  handleLogin: () => void;
  setShowUpgradeModal: (show: boolean) => void;
}

type StudioStage = 'IDLE' | 'RECORDING' | 'REVIEW' | 'PROCESSING' | 'DONE';

const StudioSection: React.FC<StudioSectionProps> = ({ selectedVoice, setErrorMessage, isPro, user, handleLogin, setShowUpgradeModal }) => {
  const [stage, setStage] = useState<StudioStage>('IDLE');
  const [recordTime, setRecordTime] = useState(0);
  const [originalBlob, setOriginalBlob] = useState<Blob | null>(null);
  const [processedUrl, setProcessedUrl] = useState<string | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  const isMaster = user?.email && MASTER_EMAILS.includes(user.email.toLowerCase());
  const hasProPrivileges = isPro || isMaster;

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        setOriginalBlob(new Blob(chunksRef.current, { type: 'audio/webm' }));
        setStage('REVIEW');
        stream.getTracks().forEach(t => t.stop());
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setStage('RECORDING');
      setRecordTime(0);
      timerRef.current = window.setInterval(() => setRecordTime(p => p + 1), 1000);
    } catch (err) { 
      setErrorMessage("Neural capture failed: Microphone access denied."); 
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('audio/')) {
        setErrorMessage("Invalid Signal: Please upload a valid audio file.");
        return;
      }
      setOriginalBlob(file);
      setStage('REVIEW');
    }
  };

  const transformVoice = async () => {
    if (!originalBlob) return;
    
    // STRICT MEMBERSHIP CHECK
    if (selectedVoice.isPremium && !hasProPrivileges) {
      setShowUpgradeModal(true);
      return;
    }

    setStage('PROCESSING');
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
      const base64Audio = await blobToBase64(originalBlob);
      
      const transResponse = await ai.models.generateContent({
        model: NEURAL_CORE_STUDIO,
        contents: [
          {
            parts: [
              { inlineData: { data: base64Audio, mimeType: originalBlob.type || 'audio/webm' } },
              { text: "TRANSCRIPTION PROTOCOL: Extract words EXACTLY. Also, analyze the human emotional tone. Output raw text followed by the tone in brackets." }
            ]
          }
        ]
      });

      const rawResult = transResponse.text?.trim();
      if (!rawResult || rawResult === '[NONE]') throw new Error("No valid speech detected.");

      const synthesisResponse = await ai.models.generateContent({
        model: NEURAL_CORE_SYNTHESIS,
        contents: [{ 
          parts: [{ 
            text: `HUMAN REALISM PROTOCOL: Persona: ${selectedVoice.instruction}. TEXT: "${rawResult}"` 
          }] 
        }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { 
            voiceConfig: { 
              prebuiltVoiceConfig: { voiceName: selectedVoice.geminiVoice } 
            } 
          }
        }
      });

      const audioPart = synthesisResponse.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
      if (audioPart && audioPart.inlineData) {
        const pcmData = decodeBase64(audioPart.inlineData.data);
        const wavBlob = createWavBlob(pcmData, AUDIO_SAMPLE_RATE_OUTPUT);
        setProcessedUrl(URL.createObjectURL(wavBlob));
        setStage('DONE');
      } else {
        throw new Error("Wave synthesis failure.");
      }
    } catch (err: any) { 
      setErrorMessage(`Error: ${err.message}`); 
      setStage('REVIEW'); 
    }
  };

  return (
    <div className="bg-white/90 backdrop-blur-2xl rounded-[3rem] border border-white shadow-2xl p-12 min-h-[480px] flex flex-col justify-center transition-all relative">
      <div className="mb-12 text-center">
        <h3 className="text-xl font-black uppercase tracking-tighter text-slate-900 italic">Free Studio V4.2</h3>
        <p className={`text-[9px] font-black uppercase tracking-[0.4em] mt-2 ${selectedVoice.isPremium ? 'text-amber-500' : 'text-slate-400'}`}>
          {selectedVoice.isPremium ? 'Premium Mask Latching' : 'Standard Core Initialized'}
        </p>
      </div>

      {stage === 'IDLE' && (
        <div className="text-center">
          <div className="flex flex-col items-center space-y-8">
            <button onClick={startRecording} className="w-40 h-40 bg-indigo-600 hover:scale-105 rounded-[3.5rem] flex items-center justify-center mx-auto transition-all active:scale-95 shadow-2xl shadow-indigo-100 group relative">
              <div className="absolute inset-0 bg-indigo-600 rounded-[3.5rem] animate-ping opacity-10"></div>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-14 w-14 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
            </button>
            <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="audio/*" className="hidden" />
            <button onClick={() => fileInputRef.current?.click()} className="px-10 py-5 bg-white border border-slate-200 rounded-2xl flex items-center space-x-3 text-slate-500 hover:text-indigo-600 transition-all active:scale-95 shadow-sm">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
              <span className="text-[10px] font-black uppercase tracking-widest">Upload Master Signal</span>
            </button>
          </div>
        </div>
      )}

      {stage === 'RECORDING' && (
        <div className="text-center animate-in fade-in duration-300">
          <div className="text-9xl font-black text-slate-900 mb-12 tracking-tighter flex items-center justify-center space-x-8">
            <div className="w-6 h-6 bg-rose-500 rounded-full animate-pulse"></div>
            <span>{recordTime}s</span>
          </div>
          <button onClick={stopRecording} className="px-20 py-6 bg-slate-900 text-white rounded-3xl font-black uppercase text-[10px] tracking-widest shadow-2xl transition-all hover:bg-black active:scale-95">Disconnect Link</button>
        </div>
      )}

      {stage === 'REVIEW' && (
        <div className="space-y-10 w-full animate-in zoom-in-95 duration-300">
          <div className="p-10 bg-slate-50 rounded-[3rem] border border-slate-100 shadow-inner">
            <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-6 text-center italic">Original Signal Signature</p>
            <audio src={originalBlob ? URL.createObjectURL(originalBlob) : ''} controls className="w-full h-12" />
          </div>
          <div className="flex space-x-6">
            <button onClick={() => setStage('IDLE')} className="flex-1 py-6 bg-white border border-slate-200 rounded-2xl font-black text-[10px] uppercase text-slate-400 hover:text-slate-900">Discard</button>
            <button onClick={transformVoice} className="flex-[2] py-6 bg-indigo-600 text-white rounded-3xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-indigo-100 hover:scale-[1.02] transition-all">Change Now</button>
          </div>
        </div>
      )}

      {stage === 'PROCESSING' && (
        <div className="text-center py-20">
          <div className="relative w-24 h-24 mx-auto mb-10">
             <div className="absolute inset-0 border-[4px] border-indigo-50 rounded-full"></div>
             <div className="absolute inset-0 border-[4px] border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
          <h4 className="text-2xl font-black uppercase italic text-slate-900 tracking-tighter">Humanizing Waveform</h4>
        </div>
      )}

      {stage === 'DONE' && (
        <div className="w-full space-y-10 animate-in zoom-in-95 duration-500">
          <div className="p-10 bg-indigo-50/50 rounded-[4rem] border border-indigo-100 text-center relative">
            <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600 mb-8 italic">Neural Master (Realism Active)</p>
            <audio src={processedUrl!} controls autoPlay className="w-full mb-10 rounded-full h-12" />
            <div className="flex space-x-6">
              <button 
                onClick={() => { const a = document.createElement('a'); a.href = processedUrl!; a.download = `morphed_voice.wav`; a.click(); }} 
                className="flex-1 bg-indigo-600 text-white py-6 rounded-3xl font-black text-[10px] uppercase tracking-widest"
              >
                Export Master
              </button>
              <button onClick={() => setStage('IDLE')} className="px-10 bg-white border border-slate-200 text-slate-400 py-6 rounded-3xl font-black text-[10px] uppercase">Clear</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudioSection;
