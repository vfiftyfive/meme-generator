import { connect, NatsConnection, Subscription, JSONCodec } from 'nats.ws';
import { v4 as uuidv4 } from 'uuid';

// Define types for our messages
export interface MemeRequest {
  id: string;
  prompt: string;
  fast_mode: boolean;
  small_image: boolean;
}

export interface MemeResponse {
  request_id: string;
  image_data: string;
  prompt: string;
  timestamp: number;
}

export interface MemeError {
  request_id: string;
  error: string;
  timestamp: number;
}

class NatsService {
  private connection: NatsConnection | null = null;
  private codec = JSONCodec();
  private responseSubscription: Subscription | null = null;
  private errorSubscription: Subscription | null = null;
  private responseCallbacks: Map<string, (response: MemeResponse) => void> = new Map();
  private errorCallbacks: Map<string, (error: MemeError) => void> = new Map();

  // Configure these based on your environment
  private serverUrl = import.meta.env.VITE_NATS_URL || 'ws://localhost:8080';
  private requestSubject = import.meta.env.VITE_REQUEST_SUBJECT || 'meme.request';
  private responseSubject = import.meta.env.VITE_RESPONSE_SUBJECT || 'meme.response';
  private errorSubject = `${this.responseSubject}.error`;

  async connect(): Promise<boolean> {
    try {
      if (this.connection) {
        return true;
      }

      console.log(`Connecting to NATS server at ${this.serverUrl}...`);
      this.connection = await connect({ servers: this.serverUrl });
      console.log('Connected to NATS server');

      // Subscribe to responses
      this.responseSubscription = this.connection.subscribe(this.responseSubject);
      this.processResponses();

      // Subscribe to errors
      this.errorSubscription = this.connection.subscribe(this.errorSubject);
      this.processErrors();

      return true;
    } catch (error) {
      console.error('Failed to connect to NATS server:', error);
      return false;
    }
  }

  async disconnect(): Promise<void> {
    if (this.responseSubscription) {
      this.responseSubscription.unsubscribe();
    }
    
    if (this.errorSubscription) {
      this.errorSubscription.unsubscribe();
    }
    
    if (this.connection) {
      await this.connection.drain();
      this.connection = null;
    }
  }

  private processResponses(): void {
    if (!this.responseSubscription) return;

    (async () => {
      // Non-null assertion is safe here because we check this.responseSubscription above
      // and return if it's null
      for await (const msg of this.responseSubscription!) {
        try {
          const response = this.codec.decode(msg.data) as MemeResponse;
          const callback = this.responseCallbacks.get(response.request_id);
          
          if (callback) {
            callback(response);
            this.responseCallbacks.delete(response.request_id);
            this.errorCallbacks.delete(response.request_id); // Clean up error callback too
          }
        } catch (error) {
          console.error('Error processing response:', error);
        }
      }
    })();
  }

  private processErrors(): void {
    if (!this.errorSubscription) return;

    (async () => {
      // Non-null assertion is safe here because we check this.errorSubscription above
      // and return if it's null
      for await (const msg of this.errorSubscription!) {
        try {
          const error = this.codec.decode(msg.data) as MemeError;
          const callback = this.errorCallbacks.get(error.request_id);
          
          if (callback) {
            callback(error);
            this.errorCallbacks.delete(error.request_id);
            this.responseCallbacks.delete(error.request_id); // Clean up response callback too
          }
        } catch (error) {
          console.error('Error processing error message:', error);
        }
      }
    })();
  }

  async requestMeme(
    prompt: string, 
    fastMode: boolean = false, 
    smallImage: boolean = false,
    onResponse: (response: MemeResponse) => void,
    onError: (error: MemeError) => void
  ): Promise<string> {
    if (!this.connection) {
      const connected = await this.connect();
      if (!connected) {
        throw new Error('Not connected to NATS server');
      }
    }

    const id = uuidv4();
    const request: MemeRequest = {
      id,
      prompt,
      fast_mode: fastMode,
      small_image: smallImage
    };

    // Register callbacks
    this.responseCallbacks.set(id, onResponse);
    this.errorCallbacks.set(id, onError);

    // Publish request
    if (this.connection) {
      this.connection.publish(this.requestSubject, this.codec.encode(request));
      console.log(`Sent meme request: ${id} - ${prompt}`);
    } else {
      throw new Error('No NATS connection available');
    }
    
    return id;
  }

  isConnected(): boolean {
    return this.connection !== null;
  }
}

// Export as singleton
export default new NatsService();
