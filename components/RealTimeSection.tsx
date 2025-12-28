
import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, Modality, LiveServerMessage } from '@google/genai';
import { VoiceConfig, ConnectionStatus, User } from '../types';
import Visualizer from './Visualizer';
import { encodeBase64, decodeBase64 } from '../services/audioUtils';
import { NEURAL_CORE_LIVE } from '../services/geminiConfig';
import { MASTER_EMAILS } from '../constants';

interface RealTimeSectionProps {
  selectedVoice: VoiceConfig;
  setErrorMessage: (msg: string | null) => void;
  isPro: boolean;
  user: User | null;
  handleLogin: () => void;
  setShowUpgradeModal: (show: boolean) => void;
}

const RealTimeSection: React.FC<RealTimeSectionProps> = ({ 
  selectedVoice, 
  setErrorMessage, 
  isPro,
  user, 
  handleLogin,
  setShowUpgradeModal
}) => {
  const [status, setStatus] = useState<ConnectionStatus>(ConnectionStatus.DISCONNECTED);
  const [isMuted, setIsMuted] = useState(false);
  const [monitorSelf, setMonitorSelf] = useState(true);
  const [isBackgroundActive, setIsBackgroundActive] = useState(false);
  
  const [inputDevices, setInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedInputId, setSelectedInputId] = useState<string>('');

  const audioContextInRef = useRef<AudioContext | null>(null);
  const audioContextOutRef = useRef<AudioContext | null>(null);
  const inputAnalyserRef = useRef<AnalyserNode | null>(null);
  const outputAnalyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const wakeLockRef = useRef<any>(null);

  const isMaster = user?.email && MASTER_EMAILS.includes(user.email.toLowerCase());
  const hasProPrivileges = isPro || isMaster;

  useEffect(() => {
    refreshDevices();
    return () => stopSession();
  }, []);

  const refreshDevices = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setInputDevices(devices.filter(d => d.kind === 'audioinput'));
    } catch (e) {}
  };

  const requestWakeLock = async () => {
    if ('wakeLock' in navigator) {
      try {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        setIsBackgroundActive(true);
      } catch (err) {
        console.warn("Background lock failed.");
      }
    }
  };

  const createAudioBlob = (data: Float32Array) => {
    const l = data.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) {
      int16[i] = data[i] * 32768;
    }
    return {
      data: encodeBase64(new Uint8Array(int16.buffer)),
      mimeType: 'audio/pcm;rate=16000',
    };
  };

  async function decodeAudioData(data: Uint8Array, ctx: AudioContext): Promise<AudioBuffer> {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length;
    const buffer = ctx.createBuffer(1, frameCount, 24000);
    const channelData = buffer.getChannelData(0);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i] / 32768.0;
    }
    return buffer;
  }

  const startSession = async () => {
    if (!user) {
      setErrorMessage("Identity Required: Please sign in.");
      handleLogin();
      return;
    }
    if (!hasProPrivileges) {
      setShowUpgradeModal(true);
      return;
    }

    const apiKey = process.env.API_KEY;
    if (!apiKey) return setErrorMessage("Neural Core Error: API Key Missing.");

    setStatus(ConnectionStatus.CONNECTING);
    try {
      await requestWakeLock();
      const ai = new GoogleGenAI({ apiKey });
      audioContextInRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      audioContextOutRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      const inputAn = audioContextInRef.current.createAnalyser();
      inputAnalyserRef.current = inputAn;
      const outputAn = audioContextOutRef.current.createAnalyser();
      outputAnalyserRef.current = outputAn;

      const gainNode = audioContextOutRef.current.createGain();
      gainNode.gain.value = monitorSelf ? 1.0 : 0;
      outputAn.connect(gainNode);
      gainNode.connect(audioContextOutRef.current.destination);

      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { deviceId: selectedInputId ? { exact: selectedInputId } : undefined } 
      });
      streamRef.current = stream;

      sessionPromiseRef.current = ai.live.connect({
        model: NEURAL_CORE_LIVE,
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: selectedVoice.geminiVoice } } },
          systemInstruction: `VOCAL CORD PROXY PROTOCOL: You are an invisible digital vocal cord for ${selectedVoice.name}.
          - Do not talk on your own.
          - Transform user's voice into the selected persona with 100% human realism.
          - Target: ${selectedVoice.instruction}`,
        },
        callbacks: {
          onopen: () => {
            setStatus(ConnectionStatus.CONNECTED);
            const source = audioContextInRef.current!.createMediaStreamSource(streamRef.current!);
            const processor = audioContextInRef.current!.createScriptProcessor(4096, 1, 1);
            processor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const pcmBlob = createAudioBlob(inputData);
              sessionPromiseRef.current?.then(session => {
                if (!isMuted) session.sendRealtimeInput({ media: pcmBlob });
              });
            };
            source.connect(inputAn);
            inputAn.connect(processor);
            processor.connect(audioContextInRef.current!.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio && audioContextOutRef.current) {
              const buffer = await decodeAudioData(decodeBase64(base64Audio), audioContextOutRef.current);
              const source = audioContextOutRef.current.createBufferSource();
              source.buffer = buffer;
              source.connect(outputAnalyserRef.current!);
              const now = audioContextOutRef.current.currentTime;
              const startTime = Math.max(now, nextStartTimeRef.current);
              source.start(startTime);
              nextStartTimeRef.current = startTime + buffer.duration;
              activeSourcesRef.current.add(source);
              source.onended = () => activeSourcesRef.current.delete(source);
            }
          },
          onerror: () => setStatus(ConnectionStatus.ERROR),
          onclose: () => setStatus(ConnectionStatus.DISCONNECTED),
        }
      });
    } catch (err: any) {
      setErrorMessage(err.message || "Neural Initialization Failed.");
      setStatus(ConnectionStatus.ERROR);
    }
  };

  const stopSession = () => {
    setStatus(ConnectionStatus.DISCONNECTED);
    setIsBackgroundActive(false);
    if (wakeLockRef.current) wakeLockRef.current.release();
    streamRef.current?.getTracks().forEach(t => t.stop());
    audioContextInRef.current?.close();
    audioContextOutRef.current?.close();
    activeSourcesRef.current.forEach(s => { try { s.stop(); } catch(e){} });
    activeSourcesRef.current.clear();
    nextStartTimeRef.current = 0;
  };

  return (
    <div className="bg-white/95 backdrop-blur-3xl rounded-[3rem] border border-white p-12 shadow-2xl relative overflow-hidden">
      
      {/* PRO MEMBERSHIP GATE */}
      {!hasProPrivileges && (
        <div className="absolute inset-0 z-[60] bg-slate-900/10 backdrop-blur-md flex items-center justify-center p-8">
           <div className="bg-white p-12 rounded-[3.5rem] shadow-2xl border border-slate-100 max-w-sm text-center animate-in zoom-in-95 duration-500">
             <div className="w-20 h-20 bg-amber-500 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-xl shadow-amber-100">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M5 16L3 5L8.5 10L12 4L15.5 10L21 5L19 16H5ZM19 19C19 19.5523 18.5523 20 18 20H6C5.44772 20 5 19.5523 5 19V18H19V19Z" />
                </svg>
             </div>
             <h4 className="text-2xl font-black uppercase italic tracking-tighter mb-4 text-slate-900">Neural Sync Locked</h4>
             <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-10 leading-relaxed italic">Pro Membership is required for real-time human biometric mirroring.</p>
             <button onClick={() => setShowUpgradeModal(true)} className="w-full py-5 bg-indigo-600 text-white rounded-3xl font-black uppercase tracking-widest text-[10px] shadow-xl shadow-indigo-200 hover:bg-indigo-700 transition-all">Upgrade to Access</button>
           </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-12">
        <div className="flex items-center space-x-5">
          <div className={`w-4 h-4 rounded-full ${status === ConnectionStatus.CONNECTED ? 'bg-emerald-500 animate-pulse shadow-[0_0_15px_#10b981]' : 'bg-slate-300'}`}></div>
          <div>
            <h3 className="text-2xl font-black uppercase italic tracking-tighter leading-none">Free Studio Live</h3>
            <div className="flex items-center space-x-3 mt-2">
               <span className="text-[8px] font-black uppercase tracking-widest text-slate-400 block italic">Target: {selectedVoice.name}</span>
               {isBackgroundActive && <span className="bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded text-[7px] font-black uppercase">Background Active</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-4">
           <button onClick={() => setIsMuted(!isMuted)} className={`p-4 rounded-2xl transition-all ${isMuted ? 'bg-rose-100 text-rose-600' : 'bg-slate-50 text-slate-400'}`}>
            {isMuted ? <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" /></svg> : <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>}
          </button>
          <button onClick={() => setMonitorSelf(!monitorSelf)} className={`px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${monitorSelf ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-100 text-slate-400'}`}>
            {monitorSelf ? 'System Audio: ON' : 'System Audio: MUTED'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-10 mb-12">
        <div className="space-y-4">
          <span className="text-[8px] font-black uppercase tracking-widest text-slate-400 ml-6">Mic Input</span>
          <Visualizer analyser={inputAnalyserRef.current} isActive={status === ConnectionStatus.CONNECTED} color="#6366f1" />
        </div>
        <div className="space-y-4">
          <span className="text-[8px] font-black uppercase tracking-widest text-slate-400 ml-6">Morphed Output</span>
          <Visualizer analyser={outputAnalyserRef.current} isActive={status === ConnectionStatus.CONNECTED} color="#10b981" />
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        <select value={selectedInputId} onChange={(e) => setSelectedInputId(e.target.value)} className="flex-1 bg-slate-50 border border-slate-100 rounded-3xl px-8 py-5 text-[10px] font-black uppercase tracking-widest outline-none">
          <option value="">Auto-Detect Mic Node</option>
          {inputDevices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Node'}</option>)}
        </select>
        <button onClick={status === ConnectionStatus.CONNECTED ? stopSession : startSession} disabled={status === ConnectionStatus.CONNECTING} className={`flex-[2] py-6 rounded-[2.5rem] font-black text-[11px] uppercase tracking-widest transition-all shadow-xl ${status === ConnectionStatus.CONNECTED ? 'bg-rose-500 text-white shadow-rose-100' : 'bg-indigo-600 text-white shadow-indigo-100 hover:scale-[1.02]'}`}>
          {status === ConnectionStatus.CONNECTING ? 'Latching Signal...' : status === ConnectionStatus.CONNECTED ? 'STOP MIRROR' : 'Change Now'}
        </button>
      </div>

      <div className="mt-8 p-6 bg-slate-50 rounded-3xl border border-slate-100">
         <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest leading-relaxed">
           <span className="text-indigo-600">Pro Tip:</span> For background use, ensure the tab stays open. To route audio to Discord/WhatsApp, use a virtual cable and set input to 'System Output'.
         </p>
      </div>
    </div>
  );
};

export default RealTimeSection;
