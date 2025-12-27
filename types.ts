
export interface User {
  id: string;
  name: string;
  email: string;
  picture: string;
  signupDate?: number;
  proExpiry?: number;
}

export type PageType = 'HOME' | 'ABOUT' | 'CONTACT' | 'PROFILE' | 'PRIVACY' | 'TERMS' | 'PROTOCOL' | 'LIVE_VOICE_CHANGER';

export type VoiceCategory = 'Human' | 'Fantasy' | 'Animal' | 'Effects' | 'Mood' | 'Ultra';

// Added dspSettings to support local digital signal processing configurations
export interface VoiceConfig {
  id: string;
  name: string;
  description: string;
  instruction: string;
  geminiVoice: 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Zephyr';
  color: string;
  icon: string;
  category: VoiceCategory;
  isImageLogo?: boolean;
  isPremium?: boolean;
  dspSettings?: {
    pitch?: number;
    bass?: number;
    clarity?: number;
    isRobot?: boolean;
  };
}

export enum ConnectionStatus {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  ERROR = 'ERROR'
}