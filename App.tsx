
import React, { useState, useEffect } from 'react';
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signOut, Auth } from 'firebase/auth';
import { VoiceConfig, User, PageType } from './types';
import { VOICE_PRESETS } from './constants';
import { syncUserWithHF, keepWarmPulse } from './services/huggingFaceApi';

import Navbar from './components/Navbar';
import Footer from './components/Footer';
import VoiceMatrix from './components/VoiceMatrix';
import StudioSection from './components/StudioSection';
import RealTimeSection from './components/RealTimeSection';
import ProfilePage from './components/ProfilePage';
import AboutPage from './components/AboutPage';
import PrivacyPage from './components/PrivacyPage';
import TermsPage from './components/TermsPage';
import ProtocolPage from './components/ProtocolPage';
import LegalModal from './components/LegalModal';
import UpgradeModal from './components/UpgradeModal';
import AuthModal from './components/AuthModal';
import ContactPage from './components/ContactPage';

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyD77DoIkL1-HuyH3k1HHa6v1qsmIgre4PQ",
  authDomain: "free-voice-208cd.firebaseapp.com",
  projectId: "free-voice-208cd",
  storageBucket: "free-voice-208cd.firebasestorage.app",
  messagingSenderId: "933234924090",
  appId: "1:933234924090:web:2dc81d94b091acee843303",
  measurementId: "G-7Y77XH3NEK"
};

// Initialize Firebase once and register Auth immediately
let firebaseApp: FirebaseApp;
let auth: Auth;

try {
  firebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
  auth = getAuth(firebaseApp); // This registers the auth component immediately
} catch (e) {
  console.error("Critical: Firebase initialization failed", e);
}

const STORAGE_KEY = 'free_voice_selected_id';
const LEGAL_ACCEPTED_KEY = 'free_voice_legal_protocol_accepted';

const App: React.FC = () => {
  const [activePage, setActivePage] = useState<PageType>('HOME');
  const [user, setUser] = useState<User | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [isPro, setIsPro] = useState<boolean>(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState<boolean>(false);
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [syncStatus, setSyncStatus] = useState<'IDLE' | 'SYNCING' | 'ERROR'>('IDLE');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [legalAccepted, setLegalAccepted] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(LEGAL_ACCEPTED_KEY) === 'true';
    }
    return false;
  });

  const [selectedVoice, setSelectedVoice] = useState<VoiceConfig>(() => {
    if (typeof window !== 'undefined') {
      const savedId = localStorage.getItem(STORAGE_KEY);
      return VOICE_PRESETS.find(v => v.id === savedId) || VOICE_PRESETS[0];
    }
    return VOICE_PRESETS[0];
  });

  const syncWithNeuralBrain = async (userId: string, email: string) => {
    setSyncStatus('SYNCING');
    try {
      const hfData = await syncUserWithHF(userId, email);
      
      if (isPro && !hfData.isPro) {
        setErrorMessage("Neural Access Revoked: Identity Expired.");
        if (selectedVoice.isPremium) {
          setSelectedVoice(VOICE_PRESETS[0]);
        }
      }
      
      setIsPro(hfData.isPro);
      setUser(prev => prev ? { 
        ...prev, 
        proExpiry: hfData.proExpiry || undefined 
      } : null);
      
      setSyncStatus('IDLE');
    } catch (err) {
      console.error("Neural Sync Error:", err);
      setSyncStatus('ERROR');
    }
  };

  useEffect(() => {
    const pulseTimer = setInterval(() => {
      if (user) syncWithNeuralBrain(user.id, user.email);
      else keepWarmPulse();
    }, 15000); 
    return () => clearInterval(pulseTimer);
  }, [user?.id, isPro, selectedVoice.id]);

  useEffect(() => {
    if (!auth) {
      setLoadingAuth(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const currentUser: User = {
          id: firebaseUser.uid,
          name: firebaseUser.displayName || 'Neural Agent',
          email: firebaseUser.email || '',
          picture: firebaseUser.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(firebaseUser.displayName || 'User')}&background=6366f1&color=fff`,
          signupDate: firebaseUser.metadata.creationTime ? new Date(firebaseUser.metadata.creationTime).getTime() : Date.now()
        };
        setUser(currentUser);
        await syncWithNeuralBrain(firebaseUser.uid, firebaseUser.email || '');
      } else {
        setUser(null);
        setIsPro(false);
      }
      setLoadingAuth(false);
    });

    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    if (!auth) return;
    try {
      await signOut(auth);
      setActivePage('HOME');
    } catch (e: any) {
      setErrorMessage(e.message);
    }
  };

  const onSelectVoice = (voice: VoiceConfig) => {
    if (voice.isPremium && !isPro) { 
      setShowUpgradeModal(true); 
      return; 
    }
    setSelectedVoice(voice);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, voice.id);
    }
  };

  if (loadingAuth) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin mx-auto mb-4 shadow-xl"></div>
          <p className="text-[9px] font-black uppercase tracking-[0.4em] text-slate-400">Syncing Identity Matrix...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col pt-20 bg-slate-50 text-slate-900">
      {!legalAccepted && (
        <LegalModal onAccept={() => { 
          localStorage.setItem(LEGAL_ACCEPTED_KEY, 'true'); 
          setLegalAccepted(true); 
        }} />
      )}
      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} auth={auth} setErrorMessage={setErrorMessage} />
      <UpgradeModal isOpen={showUpgradeModal} onClose={() => setShowUpgradeModal(false)} userId={user?.id} />

      <Navbar 
        user={user} 
        activePage={activePage} 
        isPro={isPro} 
        setActivePage={(p) => setActivePage(p as PageType)} 
        setShowUpgradeModal={setShowUpgradeModal} 
        handleLogout={handleLogout}
        handleLogin={() => setShowAuthModal(true)}
      />

      {user && (
        <div className="fixed bottom-6 right-6 z-[100] flex items-center space-x-3 px-5 py-2.5 bg-white/90 backdrop-blur-md border border-slate-200 rounded-full shadow-2xl hover:scale-105 transition-all">
          <div className={`w-2 h-2 rounded-full ${syncStatus === 'SYNCING' ? 'bg-amber-500 animate-pulse' : syncStatus === 'ERROR' ? 'bg-rose-500' : 'bg-emerald-500 shadow-[0_0_8px_#10b981]'}`}></div>
          <span className="text-[8px] font-black uppercase tracking-widest text-slate-500">
            {syncStatus === 'SYNCING' ? 'Identity Syncing' : syncStatus === 'ERROR' ? 'Link Compromised' : 'Neural Link Active'}
          </span>
        </div>
      )}

      <main className="flex-1 w-full max-w-7xl mx-auto px-6 py-12">
        {activePage === 'HOME' && (
          <div className="animate-in fade-in slide-in-from-bottom-6 duration-1000">
            <div className="text-center mb-16">
              <h2 className="text-6xl md:text-8xl font-black text-slate-900 mb-4 tracking-tighter uppercase italic leading-none">Neural Studio</h2>
              <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400">High-Latency Biometric Synthesis</p>
            </div>
            <div className="max-w-4xl mx-auto mb-24">
              <StudioSection selectedVoice={selectedVoice} setErrorMessage={setErrorMessage} isPro={isPro} user={user} handleLogin={() => setShowAuthModal(true)} />
            </div>
            <VoiceMatrix selectedVoice={selectedVoice} onSelect={onSelectVoice} isPro={isPro} />
          </div>
        )}

        {activePage === 'LIVE_VOICE_CHANGER' && (
          <div className="animate-in fade-in slide-in-from-bottom-6 duration-1000">
            <div className="text-center mb-16">
              <h2 className="text-6xl md:text-8xl font-black text-slate-900 mb-4 tracking-tighter uppercase italic leading-none">Live Sync</h2>
              <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400">Zero-Latency Real-Time Transformation</p>
            </div>
            <div className="max-w-4xl mx-auto mb-24">
              <RealTimeSection 
                selectedVoice={selectedVoice} 
                setErrorMessage={setErrorMessage} 
                isPro={isPro} 
                user={user} 
                handleLogin={() => setShowAuthModal(true)} 
                setShowUpgradeModal={setShowUpgradeModal} 
              />
            </div>
            <VoiceMatrix selectedVoice={selectedVoice} onSelect={onSelectVoice} isPro={isPro} />
          </div>
        )}

        {activePage === 'PROFILE' && user && <ProfilePage user={user} isPro={isPro} setShowUpgradeModal={setShowUpgradeModal} />}
        {activePage === 'ABOUT' && <AboutPage />}
        {activePage === 'PRIVACY' && <PrivacyPage />}
        {activePage === 'TERMS' && <TermsPage />}
        {activePage === 'PROTOCOL' && <ProtocolPage />}
        {activePage === 'CONTACT' && <ContactPage />}
      </main>

      <Footer setActivePage={(p) => setActivePage(p as PageType)} />
      
      {errorMessage && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 px-10 py-5 bg-white border border-rose-100 rounded-3xl text-rose-600 text-[10px] font-black uppercase tracking-[0.2em] z-[500] shadow-2xl animate-in slide-in-from-bottom-4">
          <div className="flex items-center space-x-8">
            <div className="w-2.5 h-2.5 bg-rose-500 rounded-full animate-ping shadow-[0_0_8px_#f43f5e]"></div>
            <span>{errorMessage}</span>
            <button 
              onClick={() => setErrorMessage(null)}
              className="bg-slate-50 hover:bg-slate-100 p-2.5 rounded-full transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
