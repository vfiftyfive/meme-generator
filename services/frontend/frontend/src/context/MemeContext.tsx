import { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import NatsService, { MemeResponse } from '../services/NatsService';

interface MemeContextType {
  memes: MemeResponse[];
  loading: boolean;
  currentRequestId: string | null;
  error: string | null;
  generateMeme: (prompt: string, fastMode: boolean, smallImage: boolean) => Promise<void>;
  clearError: () => void;
  clearGallery: () => void;
}

const MemeContext = createContext<MemeContextType | undefined>(undefined);

export function MemeProvider({ children }: { children: ReactNode }) {
  const [memes, setMemes] = useState<MemeResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentRequestId, setCurrentRequestId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Connect to NATS on component mount
  useEffect(() => {
    const connectToNats = async () => {
      try {
        await NatsService.connect();
      } catch (error) {
        console.error('Failed to connect to NATS:', error);
        setError('Failed to connect to NATS server. Please try again later.');
      }
    };

    connectToNats();

    // Disconnect when component unmounts
    return () => {
      NatsService.disconnect().catch(console.error);
    };
  }, []);

  const generateMeme = async (prompt: string, fastMode: boolean, smallImage: boolean) => {
    try {
      setLoading(true);
      setError(null);

      const requestId = await NatsService.requestMeme(
        prompt,
        fastMode,
        smallImage,
        // Success callback
        (response) => {
          setMemes((prevMemes) => [response, ...prevMemes]);
          setLoading(false);
          setCurrentRequestId(null);
        },
        // Error callback
        (errorResponse) => {
          setError(errorResponse.error);
          setLoading(false);
          setCurrentRequestId(null);
        }
      );

      setCurrentRequestId(requestId);
    } catch (error) {
      setError((error as Error).message);
      setLoading(false);
    }
  };

  const clearError = () => setError(null);
  
  const clearGallery = () => setMemes([]);

  const value = {
    memes,
    loading,
    currentRequestId,
    error,
    generateMeme,
    clearError,
    clearGallery
  };

  return <MemeContext.Provider value={value}>{children}</MemeContext.Provider>;
}

export function useMeme() {
  const context = useContext(MemeContext);
  if (context === undefined) {
    throw new Error('useMeme must be used within a MemeProvider');
  }
  return context;
}
