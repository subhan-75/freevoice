
/**
 * FreeVoice Pro | Neural Licensing Gateway
 * Backend Authority: Hugging Face (subhan-75/freevoice)
 */

const HF_SPACE_URL = "https://subhan-75-freevoice.hf.space"; 
const HF_TOKEN = "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";

export interface UserStatus {
  isPro: boolean;
  proExpiry: number | null;
  userId: string;
  serverTime: number; 
  email: string;
}

/**
 * Synchronizes local Firebase user with Hugging Face Database.
 */
export const syncUserWithHF = async (userId: string, email: string): Promise<UserStatus> => {
  try {
    const response = await fetch(`${HF_SPACE_URL}/sync-identity`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${HF_TOKEN}`
      },
      body: JSON.stringify({ userId, email }),
    });

    if (!response.ok) throw new Error(`Neural Link Error: ${response.status}`);
    
    const data = await response.json() as { 
      is_pro: boolean, 
      expiry_timestamp: number, 
      server_time: number 
    };
    
    // Safety check for data existence
    const serverTime = data?.server_time || Date.now();
    const isActuallyPro = (data?.is_pro || false) && (data?.expiry_timestamp || 0) > serverTime;

    return {
      isPro: isActuallyPro,
      proExpiry: data?.expiry_timestamp || null,
      userId: userId,
      serverTime: serverTime,
      email: email
    };
  } catch (error) {
    console.error("Hugging Face Sync Failure:", error);
    // Silent fallback to basic plan on network error to keep UI alive
    return { isPro: false, proExpiry: null, userId, serverTime: Date.now(), email };
  }
};

export const keepWarmPulse = async (): Promise<void> => {
  try {
    await fetch(`${HF_SPACE_URL}/ping`, {
      headers: { 'Authorization': `Bearer ${HF_TOKEN}` }
    });
  } catch (e) {}
};

export const logPurchaseToHF = async (userId: string, plan: string): Promise<boolean> => {
  try {
    const response = await fetch(`${HF_SPACE_URL}/record-purchase`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${HF_TOKEN}`
      },
      body: JSON.stringify({ userId, plan }),
    });
    return response.ok;
  } catch (error) {
    console.error("Purchase logging failed:", error);
    return false;
  }
};
