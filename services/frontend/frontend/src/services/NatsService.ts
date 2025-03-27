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

  // Configuration properties from runtime config
  private serverUrl: string;
  private requestSubject: string;
  private responseSubject: string;
  private errorSubject: string;

  constructor() {
    // Access the runtime config (defined in window.RUNTIME_CONFIG)
    const config = (window as any).RUNTIME_CONFIG || {};
    
    // Detect if we're running in local development mode (using port-forwarding)
    const isLocalDevelopment = window.location.hostname === 'localhost' || 
                               window.location.hostname === '127.0.0.1';
    
    // Use values from runtime config with fallbacks
    // If in local development, use localhost for NATS
    if (isLocalDevelopment) {
      this.serverUrl = 'ws://localhost:8081';
      console.log('💻 DEVELOPMENT MODE: Using localhost:8081 for NATS');
    } else {
      this.serverUrl = config.NATS_URL || 'ws://nats.messaging.svc.cluster.local:8080';
    }
    
    this.requestSubject = config.REQUEST_SUBJECT || 'meme.request';
    this.responseSubject = config.RESPONSE_SUBJECT || 'meme.response';
    this.errorSubject = `${this.responseSubject}.error`;
    
    console.log('🔌 Connecting to NATS server at ' + this.serverUrl + '...');
    console.log('💻 Environment details: ', {
      url: this.serverUrl,
      requestSubject: this.requestSubject,
      responseSubject: this.responseSubject,
      errorSubject: this.errorSubject
    });
  }

  /**
   * Connect to the NATS server
   * @returns Promise that resolves to true if connected successfully
   */
  async connect(): Promise<boolean> {
    try {
      // If already connected, return true
      if (this.connection) {
        return true;
      }

      console.log('🔄 Attempting to connect to NATS server:', this.serverUrl);
      
      // Use the absolute minimum options for WebSocket connectivity
      // When dealing with browsers, simpler is often better
      this.connection = await connect({
        servers: this.serverUrl,
        timeout: 30000  // 30 second timeout for slower network conditions
      });
      
      console.log('✅ NATS connection successful');
      
      // Log connection status
      const status = this.connection.status();
      console.log('📊 NATS connection status:', status);

      // Subscribe to responses
      console.log('📨 Subscribing to response subject:', this.responseSubject);
      this.responseSubscription = this.connection.subscribe(this.responseSubject);
      this.processResponses();

      // Subscribe to errors
      console.log('⚠️ Subscribing to error subject:', this.errorSubject);
      this.errorSubscription = this.connection.subscribe(this.errorSubject);
      this.processErrors();

      return true; // Successfully connected
    } catch (error: unknown) {
      // Create highly visible error log
      console.error('%c❌ NATS CONNECTION ERROR:', 'color: red; font-weight: bold; font-size: 16px;');
      console.error(error);
      
      // Additional log for troubleshooting
      console.error(`Failed to connect to NATS at ${this.serverUrl}`);
      
      // Add a DOM element to show the error for debugging (will be visible in UI)
      if (typeof document !== 'undefined') {
        const errorDiv = document.createElement('div');
        errorDiv.style.position = 'fixed';
        errorDiv.style.bottom = '0';
        errorDiv.style.left = '0';
        errorDiv.style.right = '0';
        errorDiv.style.backgroundColor = 'rgba(255, 0, 0, 0.8)';
        errorDiv.style.color = 'white';
        errorDiv.style.padding = '10px';
        errorDiv.style.zIndex = '9999';
        errorDiv.style.fontFamily = 'monospace';
        errorDiv.style.fontSize = '12px';
        errorDiv.innerHTML = `NATS Connection Error: ${error instanceof Error ? error.message : String(error)}<br>URL: ${this.serverUrl}`;
        document.body.appendChild(errorDiv);
      }
      
      return false;
    }
  }
  
  /**
   * Disconnect from the NATS server and clean up subscriptions
   */
  async disconnect(): Promise<void> {
    if (this.responseSubscription) {
      this.responseSubscription.unsubscribe();
      this.responseSubscription = null;
    }
    
    if (this.errorSubscription) {
      this.errorSubscription.unsubscribe();
      this.errorSubscription = null;
    }
    
    if (this.connection) {
      await this.connection.drain();
      this.connection = null;
    }
  }
  
  /**
   * Check if the NATS connection is currently established
   * @returns True if connected, false otherwise
   */
  isConnected(): boolean {
    return this.connection !== null && !this.connection.isClosed();
  }
  
  /**
   * Get the NATS server URL this service is configured to use
   * @returns The WebSocket URL for the NATS server
   */
  getServerUrl(): string {
    return this.serverUrl;
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
      try {
        // Publish to the exact subject 'meme.request' to match JetStream consumer filter
        this.connection.publish(this.requestSubject, this.codec.encode(request));
        console.log(`✅ Sent meme request: ${id} - ${prompt}`, {
          subject: this.requestSubject,
          requestId: id,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('❌ Failed to publish message:', error);
        throw new Error(`Failed to publish message: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else {
      throw new Error('No NATS connection available');
    }
    
    return id;
  }

  // No duplicate method needed - already defined above
}

// Export as singleton
export default new NatsService();
