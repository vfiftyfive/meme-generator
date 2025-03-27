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
        console.log('%c🔄 Attempting to connect to NATS server...', 'color: blue; font-weight: bold;');
        setError('Connecting to NATS server...');
        
        // Log environment details for debugging
        console.log('%c🌐 NATS Connection Details:', 'color: purple;', {
          serverUrl: NatsService.getServerUrl(), // Using the getter method
          timestamp: new Date().toISOString()
        });
        
        const connected = await NatsService.connect();
        
        if (connected) {
          setError(null);
          console.log('%c✅ Successfully connected to NATS', 'color: green; font-weight: bold;');
          
          // Check if connection is still active
          if (NatsService.isConnected()) {
            console.log('%c🟢 NATS connection is active', 'color: green;');
          } else {
            console.warn('%c🟠 NATS connect() returned true but connection check failed', 'color: orange; font-weight: bold;');
            setError('NATS connection status is uncertain. Application may not function properly.');
          }
        } else {
          console.error('%c❌ Failed to connect to NATS server', 'color: red; font-weight: bold;');
          setError('Could not connect to NATS server. Please check your network connection and browser console for details.');
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('%c💥 Exception during NATS connection:', 'color: red; font-weight: bold;', {
          message: errorMessage,
          stack: error instanceof Error ? error.stack : 'No stack trace',
          timestamp: new Date().toISOString()
        });
        setError(`Failed to connect to NATS server: ${errorMessage}. Please check the browser console for detailed error information.`);
      }
    };

    connectToNats();

    // Set up reconnection attempts
    const reconnectInterval = setInterval(() => {
      if (!NatsService.isConnected()) {
        console.log('Attempting to reconnect to NATS...');
        connectToNats();
      }
    }, 10000); // Try to reconnect every 10 seconds if disconnected

    // Disconnect when component unmounts
    return () => {
      clearInterval(reconnectInterval);
      NatsService.disconnect().catch(console.error);
    };
  }, []);

  const generateMeme = async (prompt: string, fastMode: boolean, smallImage: boolean) => {
    try {
      // Check if NATS is connected first
      if (!NatsService.isConnected()) {
        console.log('NATS not connected, attempting to connect...');
        const connected = await NatsService.connect();
        if (!connected) {
          throw new Error('Failed to connect to NATS server. Please try again.');
        }
      }
      
      setLoading(true);
      setError(null);

      console.log(`Generating meme with prompt: "${prompt}"`, {
        fastMode,
        smallImage,
        timestamp: new Date().toISOString()
      });

      const requestId = await NatsService.requestMeme(
        prompt,
        fastMode,
        smallImage,
        // Success callback
        (response) => {
          console.log(`✅ Received meme response for request: ${response.request_id}`);
          setMemes((prevMemes) => [response, ...prevMemes]);
          setLoading(false);
          setCurrentRequestId(null);
        },
        // Error callback
        (errorResponse) => {
          console.error(`❌ Error for request ${errorResponse.request_id}:`, errorResponse.error);
          setError(errorResponse.error);
          setLoading(false);
          setCurrentRequestId(null);
        }
      );

      setCurrentRequestId(requestId);
      console.log(`🔄 Meme request sent with ID: ${requestId}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('❌ Failed to generate meme:', errorMessage);
      setError(errorMessage);
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
