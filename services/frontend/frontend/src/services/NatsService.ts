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
    // Always use the config value if provided, even in local development
    this.serverUrl = config.NATS_URL || (isLocalDevelopment ? 'ws://localhost:8081' : 'ws://nats.messaging.svc.cluster.local:8080');
    
    if (isLocalDevelopment && !config.NATS_URL) {
      console.log('💻 DEVELOPMENT MODE: Using localhost:8081 for NATS (override with RUNTIME_CONFIG.NATS_URL)');
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
   * Test WebSocket connectivity before NATS connection
   */
  async testWebSocketConnection(): Promise<boolean> {
    return new Promise((resolve) => {
      console.log('🧪 Testing raw WebSocket connection to:', this.serverUrl);
      
      const ws = new WebSocket(this.serverUrl);
      const timeout = setTimeout(() => {
        console.error('❌ WebSocket connection timeout');
        ws.close();
        resolve(false);
      }, 5000);

      ws.onopen = () => {
        console.log('✅ Raw WebSocket connection successful');
        clearTimeout(timeout);
        ws.close();
        resolve(true);
      };

      ws.onerror = (error) => {
        console.error('❌ Raw WebSocket connection error:', error);
        clearTimeout(timeout);
        resolve(false);
      };
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

      // First test raw WebSocket
      const wsTest = await this.testWebSocketConnection();
      if (!wsTest) {
        console.error('❌ Raw WebSocket test failed, NATS connection will likely fail');
      }

      // Add debug logging for connection attempt
      console.log('📡 Connection config:', {
        servers: this.serverUrl,
        timeout: 30000,
        headers: window.location.hostname,
        protocol: window.location.protocol
      });

      this.connection = await connect({
        servers: this.serverUrl,
        timeout: 30000,  // 30 second timeout for slower network conditions
        debug: true,  // Enable debug mode
        verbose: true  // Enable verbose logging
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
      console.error('%c❌ NATS CONNECTION ERROR:', 'color: red; font-weight: bold; font-size: 16px;');
      console.error(error);

      console.error(`Failed to connect to NATS at ${this.serverUrl}`);

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

}

// Export as singleton
export default new NatsService();
