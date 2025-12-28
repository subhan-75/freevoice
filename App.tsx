
import React, { useState, useEffect, useMemo, Suspense, lazy } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signOut } from 'firebase/auth';
import { VoiceConfig, User, PageType } from './types';
import { VOICE_PRESETS, MASTER_EMAILS } from './constants';
import { syncUserWithHF } from './services/huggingFaceApi';

import Navbar from './components/Navbar';
import Footer from './components/Footer';
import VoiceMatrix from './components/VoiceMatrix';
import StudioSection from './components/StudioSection';
import RealTimeSection from './components/RealTimeSection';
import LegalModal from './components/LegalModal';
import UpgradeModal from './components/UpgradeModal';
import AuthModal from './components/AuthModal';

// Lazy load heavy sub-pages for faster initial paint
const ProfilePage = lazy(() => import('./components/ProfilePage'));
const AboutPage = lazy(() => import('./components/AboutPage'));
const PrivacyPage = lazy(() => import('./components/PrivacyPage'));
const TermsPage = lazy(() => import('./components/TermsPage'));
const ProtocolPage = lazy(() => import('./components/ProtocolPage'));
const ContactPage = lazy(() => import('./components/ContactPage'));

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

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

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

  const auth = useMemo(() => {
    try { return getAuth(app); } catch (e) { return null; }
  }, []);

  const [legalAccepted, setLegalAccepted] = useState<boolean>(() => {
    if (typeof window !== 'undefined') return localStorage.getItem(LEGAL_ACCEPTED_KEY) === 'true';
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
    const isMaster = MASTER_EMAILS.includes(email.toLowerCase());
    if (isMaster) {
      setIsPro(true);
      setUser(prev => prev ? { ...prev, proExpiry: 253370764800000 } : null);
      setSyncStatus('IDLE');
      return;
    }

    setSyncStatus('SYNCING');
    try {
      const hfData = await syncUserWithHF(userId, email);
      setIsPro(hfData.isPro);
      setUser(prev => prev ? { ...prev, proExpiry: hfData.proExpiry || undefined } : null);
      setSyncStatus('IDLE');
    } catch (err) {
      setSyncStatus('ERROR');
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if (loadingAuth) {
        console.warn("Firebase Auth timed out. Proceeding as Guest.");
        setLoadingAuth(false);
      }
    }, 5000);

    if (!auth) {
      setLoadingAuth(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      clearTimeout(timer);
      if (firebaseUser) {
        const currentUser: User = {
          id: firebaseUser.uid,
          name: firebaseUser.displayName || 'Neural Agent',
          email: firebaseUser.email || '',
          picture: firebaseUser.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(firebaseUser.displayName || 'User')}&background=6366f1&color=fff`,
          signupDate: firebaseUser.metadata.creationTime ? new Date(firebaseUser.metadata.creationTime).getTime() : Date.now()
        };
        setUser(currentUser);
        syncWithNeuralBrain(firebaseUser.uid, firebaseUser.email || '');
      } else {
        setUser(null);
        setIsPro(false);
      }
      setLoadingAuth(false);
    }, (error) => {
      console.error("Auth Listener Error:", error);
      setLoadingAuth(false);
    });

    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, [auth]);

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
    const isMaster = user?.email && MASTER_EMAILS.includes(user.email.toLowerCase());
    const hasProPrivileges = isPro || isMaster;
    if (voice.isPremium && !hasProPrivileges) { 
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
          <div className="w-10 h-10 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-[9px] font-black uppercase tracking-[0.4em] text-slate-400 animate-pulse">Latching Nodes...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col pt-20 bg-slate-50 text-slate-900 selection:bg-indigo-100 selection:text-indigo-600">
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

      <main className="flex-1 w-full max-w-7xl mx-auto px-6 py-12 relative">
        <Suspense fallback={
          <div className="flex items-center justify-center py-32">
             <div className="w-8 h-8 border-4 border-slate-100 border-t-indigo-600 rounded-full animate-spin"></div>
          </div>
        }>
          {activePage === 'HOME' && (
            <div className="animate-in fade-in slide-in-from-bottom-6 duration-1000">
              <div className="text-center mb-16">
                <h2 className="text-6xl md:text-8xl font-black text-slate-900 mb-4 tracking-tighter uppercase italic leading-none">Free Studio</h2>
                <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400">Verbatim Biometric Transformation</p>
              </div>
              <div className="max-w-4xl mx-auto mb-24">
                <StudioSection 
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

          {activePage === 'LIVE_VOICE_CHANGER' && (
            <div className="animate-in fade-in slide-in-from-bottom-6 duration-1000">
              <div className="text-center mb-16">
                <h2 className="text-6xl md:text-8xl font-black text-slate-900 mb-4 tracking-tighter uppercase italic leading-none">Free Studio Live</h2>
                <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400">Zero-Latency Real-Time Mirroring</p>
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
        </Suspense>
      </main>

      <Footer setActivePage={(p) => setActivePage(p as PageType)} />
      
      {errorMessage && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 px-10 py-5 bg-white border border-rose-100 rounded-3xl text-rose-600 text-[10px] font-black uppercase tracking-[0.2em] z-[500] shadow-2xl animate-in slide-in-from-bottom-4">
          <div className="flex items-center space-x-8">
            <div className="w-2.5 h-2.5 bg-rose-500 rounded-full animate-ping"></div>
            <span>{errorMessage}</span>
            <button onClick={() => setErrorMessage(null)} className="bg-slate-50 hover:bg-slate-100 p-2.5 rounded-full transition-colors">
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
