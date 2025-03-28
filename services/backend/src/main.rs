// ===== DEPENDENCIES =====
// This service uses several key crates to handle different aspects of the application:
// - anyhow: For flexible error handling with context
// - async_nats: For message queue communication using NATS JetStream
// - base64: For encoding/decoding images for transmission
// - clap: For command-line argument and environment variable configuration
// - futures: For asynchronous stream handling
// - metrics: For application telemetry and monitoring
// - redis: For caching generated images to improve performance
// - tracing: For structured logging with request context tracking

use anyhow::{Context, Result};
use async_nats::{self, jetstream};
use base64::{engine::general_purpose::STANDARD, Engine};
use clap::Parser;
use futures::stream::StreamExt;
use metrics_exporter_prometheus::PrometheusBuilder;
use redis::{aio::ConnectionManager, AsyncCommands};
use serde::{Deserialize, Serialize};
use std::{sync::Arc, time::Duration};
use tokio::sync::Mutex;
use tracing::{debug, error, info, instrument, warn};
use tracing_subscriber::{filter::EnvFilter, layer::SubscriberExt, util::SubscriberInitExt};
use uuid::Uuid;

// ===== CONFIGURATION =====
// This struct defines our service configuration with sensible defaults for Kubernetes.
// We use clap's derive feature to automatically parse environment variables, making the
// service cloud-native and easily configurable in different environments without code changes.
//

#[derive(Parser, Debug, Clone)]
#[clap(
    name = "meme-generator",
    about = "Meme Battle Royale generator service"
)]
struct Config {
    /// NATS server URL - Uses Kubernetes DNS for service discovery
    #[clap(
        long,
        env = "NATS_URL",
        default_value = "nats://nats.messaging.svc.cluster.local:4222"
    )]
    nats_url: String,

    /// NATS stream name - Persistent storage for our message queue
    #[clap(long, env = "NATS_STREAM", default_value = "MEMES")]
    nats_stream: String,

    /// NATS consumer name - Identifies this service as a consumer group
    #[clap(long, env = "NATS_CONSUMER", default_value = "meme-generator")]
    nats_consumer: String,

    /// NATS request subject - Channel for receiving meme generation requests
    #[clap(long, env = "NATS_REQUEST_SUBJECT", default_value = "meme.request")]
    request_subject: String,

    /// NATS response subject - Channel for sending generated memes back to clients
    #[clap(long, env = "NATS_RESPONSE_SUBJECT", default_value = "meme.response")]
    response_subject: String,

    /// Redis URL - Used for caching generated images to improve performance
    #[clap(
        long,
        env = "REDIS_URL",
        default_value = "redis://redis.cache.svc.cluster.local:6379"
    )]
    redis_url: String,

    /// Hugging Face API Token - Required for accessing the image generation API
    /// This is deliberately not given a default value to force explicit configuration
    #[clap(long, env = "HF_API_TOKEN")]
    hf_api_token: String,

    /// Hugging Face API URL - Model endpoint for image generation
    /// Default is stable-diffusion-v1-5, but code will use FLUX model for fast_mode
    #[clap(
        long,
        env = "HF_API_URL",
        default_value = "https://api-inference.huggingface.co/models/runwayml/stable-diffusion-v1-5"
    )]
    hf_api_url: String,

    /// Redis cache TTL in seconds - How long to keep generated images cached
    /// Default of 1 hour balances storage efficiency with avoiding regeneration
    #[clap(long, env = "CACHE_TTL", default_value = "3600")]
    cache_ttl: u64,

    /// Metrics listen address - Port for exposing Prometheus metrics
    #[clap(long, env = "METRICS_ADDR", default_value = "0.0.0.0:9090")]
    metrics_addr: String,
}

// ===== MESSAGE TYPES =====
// These structs define the format of messages passed through the system.
// We use serde for serialization/deserialization to JSON for NATS messaging.
// Each message type serves a specific purpose in the request/response flow.

/// Request for meme generation sent by clients
///
/// This type includes optional parameters for controlling the generation process:
/// - fast_mode: Uses a faster but potentially lower quality model
/// - small_image: Generates a smaller 512x512 image instead of 1024x1024
///
/// Default values ensure backward compatibility if clients don't specify options.
/// The ID is auto-generated if not provided for tracing through the system.
#[derive(Debug, Serialize, Deserialize, Clone)]
struct MemeRequest {
    #[serde(default = "generate_uuid")]
    id: String,
    prompt: String,
    #[serde(default = "default_fast_mode")]
    fast_mode: bool,
    #[serde(default = "default_small_image")]
    small_image: bool,
}

// Helper functions for default values in MemeRequest
// Using functions rather than const values allows for dynamic generation

/// Generates a unique UUID for request tracking if not provided
/// This ensures every request can be uniquely identified throughout processing
fn generate_uuid() -> String {
    Uuid::new_v4().to_string()
}

/// Default is normal quality mode (not fast)
/// Fast mode can be enabled explicitly by clients needing quicker responses
fn default_fast_mode() -> bool {
    false
}

/// Default is regular size (1024x1024 pixels)
/// Small images can be requested to save bandwidth and processing time
fn default_small_image() -> bool {
    false
}

/// Response containing a generated meme image
///
/// The image_data field contains the base64-encoded image to avoid
/// binary transmission issues and enable direct embedding in web pages.
#[derive(Debug, Serialize, Deserialize)]
struct MemeResponse {
    request_id: String,
    image_data: String, // Base64 encoded image
    prompt: String,
    timestamp: u64,
}

/// Error response for failed meme generation
///
/// Sent when image generation fails for any reason.
/// The error string provides details about what went wrong.
#[derive(Debug, Serialize, Deserialize)]
struct MemeError {
    request_id: String,
    error: String,
    timestamp: u64,
}

/// Request format for the Hugging Face API
///
/// Structured according to the Hugging Face inference API requirements.
/// The inputs field contains the prompt text, while parameters can specify
/// additional generation options like image dimensions.
#[derive(Debug, Serialize)]
struct HuggingFaceRequest {
    inputs: String,
    parameters: Option<serde_json::Value>,
}

// ===== APPLICATION STATE =====
// This struct holds all shared resources needed by the application.
// We use Arc<Mutex<>> around this to safely share state between async tasks.

/// Application state containing all resources needed for request processing
///
/// This centralized state management approach allows us to:
/// 1. Share connections efficiently between requests
/// 2. Avoid resource leaks by properly managing lifetimes
/// 3. Simplify dependency passing through the application
struct AppState {
    /// Redis connection manager for caching generated images
    /// ConnectionManager handles automatic reconnection if Redis connection is lost
    redis: ConnectionManager,

    /// NATS JetStream context for publishing messages
    /// Used for responding to clients with generated images or errors
    js: jetstream::Context,

    /// Application configuration derived from environment variables
    /// Stored here to avoid passing it around to every function
    config: Config,

    /// HTTP client for Hugging Face API requests
    /// Pre-configured with timeout and authorization headers
    http_client: reqwest::Client,
}

// ===== APPLICATION ENTRY POINT =====
// The main function initializes all components and starts the service.
// We use a structured approach to initialization to ensure proper error handling.

/// Main application entry point
///
/// Initialization sequence:
/// 1. Parse configuration from environment variables
/// 2. Set up logging with structured contexts
/// 3. Configure metrics for observability
/// 4. Connect to message broker (NATS)
/// 5. Connect to cache (Redis)
/// 6. Set up API client (Hugging Face)
/// 7. Start processing message queue
#[tokio::main]
async fn main() -> Result<()> {
    // Initialize configuration - Using clap to parse env vars
    let config = Config::parse();

    // Set up structured logging - Enables request tracing through the system
    // We use the tracing ecosystem for context-aware logs with request IDs
    tracing_subscriber::registry()
        .with(tracing_subscriber::fmt::layer())
        .with(EnvFilter::from_default_env().add_directive("meme_generator=info".parse()?))
        .init();

    info!("Starting Meme Generator Service");

    // Set up metrics - Using Prometheus format for compatibility with monitoring tools
    // The buckets are selected to accurately represent our expected latency distribution
    let builder = PrometheusBuilder::new()
        .add_global_label("service", "meme_generator")
        .set_buckets(&[0.1, 0.5, 1.0, 2.0, 5.0, 10.0, 30.0, 60.0, 120.0])?;

    let handle = builder.install_recorder()?;

    // Start the metrics server - Using axum for a lightweight HTTP server
    // This runs in a separate task to avoid blocking the main application flow
    let metrics_addr = config.metrics_addr.clone();
    tokio::spawn(async move {
        let server = axum::Router::new()
            .route(
                "/metrics",
                axum::routing::get(move || async move { handle.render() }),
            )
            .into_make_service();

        let addr = metrics_addr.parse().unwrap();
        axum::Server::bind(&addr).serve(server).await.unwrap();
    });
    info!("Metrics server started on {}", config.metrics_addr);

    // Connect to NATS - Our message broker for request/response handling
    // We use NATS for its simplicity, performance, and reliability
    info!("Connecting to NATS at {}", config.nats_url);
    let nats = async_nats::connect(&config.nats_url).await?;
    let js = jetstream::new(nats);

    // Ensure stream exists - Creating it if needed
    // The stream configuration uses:
    // - File storage for durability across restarts
    // - WorkQueue retention to process each message once
    let stream_config = jetstream::stream::Config {
        name: config.nats_stream.clone(),
        subjects: vec![format!("{}.>", config.request_subject)],
        storage: jetstream::stream::StorageType::File,
        retention: jetstream::stream::RetentionPolicy::WorkQueue,
        ..Default::default()
    };

    // Get or create stream - This approach ensures the service is self-provisioning
    // and doesn't require external setup beyond infrastructure deployment
    let mut stream = match js.get_stream(&config.nats_stream).await {
        Ok(stream) => stream,
        Err(_) => js.create_stream(stream_config).await?,
    };

    info!(
        "Connected to NATS stream {}",
        stream.info().await?.config.name
    );

    // Connect to Redis - Used for caching generated images
    // This improves response times and reduces API costs for repeated requests
    info!("Connecting to Redis at {}", config.redis_url);
    let redis_client = redis::Client::open(config.redis_url.clone())?;
    let redis = ConnectionManager::new(redis_client).await?;
    info!("Successfully connected to Redis");

    // Create HTTP client for Hugging Face API - Pre-configured with authentication
    // We use a single client for connection pooling and efficient resource usage
    let mut headers = reqwest::header::HeaderMap::new();
    headers.insert(
        "Authorization",
        format!("Bearer {}", config.hf_api_token)
            .parse()
            .context("Failed to parse authorization header")?,
    );

    // Configure with a long timeout since image generation can take time
    let http_client = reqwest::Client::builder()
        .timeout(Duration::from_secs(300))
        .default_headers(headers)
        .build()?;

    // Initialize application state - Shared between all request handlers
    // We use Arc<Mutex<>> for thread-safe access from multiple async tasks
    let state = Arc::new(Mutex::new(AppState {
        redis,
        js,
        config: config.clone(),
        http_client,
    }));

    // Set up consumer - Our subscription to the message queue
    // The configuration ensures:
    // - Durable subscription (remembers position across restarts)
    // - Explicit acknowledgment (ensures processing completion)
    // - Limited retries (prevents infinite processing of bad messages)
    info!("Setting up NATS consumer");
    let consumer_config = jetstream::consumer::pull::Config {
        durable_name: Some(config.nats_consumer.clone()),
        deliver_policy: jetstream::consumer::DeliverPolicy::All,
        ack_policy: jetstream::consumer::AckPolicy::Explicit,
        filter_subjects: vec![format!("{}.>", config.request_subject)],
        max_deliver: 3,
        ack_wait: Duration::from_secs(60),
        ..Default::default()
    };

    // Get or create consumer - Self-provisioning approach like with streams
    let consumer = match stream.get_consumer(&config.nats_consumer).await {
        Ok(consumer) => consumer,
        Err(_) => stream.create_consumer(consumer_config).await?,
    };

    info!("NATS consumer ready");

    // Start processing messages - This will run until the service is terminated
    // All request handling happens inside this function
    process_messages(state, consumer).await?;

    Ok(())
}

#[instrument(skip_all)]
/// Main message processing loop that handles the entire lifecycle of meme requests
///
/// This function is the core of our service and implements the consumer pattern:
/// 1. Continuously pulls messages from the NATS JetStream queue
/// 2. Deserializes JSON messages into strongly-typed MemeRequest objects
/// 3. Processes each request in a separate async task for concurrent handling
/// 4. Tracks metrics for monitoring and reliability analysis
/// 5. Provides error handling and recovery at multiple levels
async fn process_messages(
    state: Arc<Mutex<AppState>>,
    consumer: async_nats::jetstream::consumer::Consumer<jetstream::consumer::pull::Config>,
) -> Result<()> {
    // Get a stream of messages from the NATS consumer
    // This is a potentially infinite stream that will continue until the service stops
    let mut messages = consumer.messages().await?;

    info!("Started processing messages");

    // Main message processing loop - runs indefinitely until the service is stopped
    // Using a while-let pattern with async iterator is idiomatic for stream processing
    while let Some(message) = messages.next().await {
        // Handle NATS message retrieval errors gracefully
        // This prevents network issues from crashing the entire service
        let message = match message {
            Ok(msg) => msg,
            Err(e) => {
                error!("Error receiving message: {}", e);
                continue; // Skip to the next message
            }
        };

        // Parse the message payload into a strongly-typed MemeRequest
        // We acknowledge malformed messages to remove them from the queue
        // to prevent infinite redelivery of unparseable messages
        let request: MemeRequest = match serde_json::from_slice(&message.payload) {
            Ok(req) => req,
            Err(e) => {
                error!("Failed to parse message: {}", e);
                if let Err(e) = message.ack().await {
                    error!("Failed to ack message: {}", e);
                }
                continue; // Skip to the next message
            }
        };

        // Log each request with structured metadata for request tracing
        // This enables correlation of logs across the entire request lifecycle
        // and makes debugging easier in a distributed system
        info!(
            request_id = %request.id,
            prompt = %request.prompt,
            "Received meme generation request"
        );

        let req_id = request.id.clone();
        let state_clone = state.clone();

        // Process each message in a separate task to enable concurrent processing
        // This is critical for throughput as it allows multiple requests to be
        // processed simultaneously, especially important since image generation
        // can take several seconds per request
        tokio::spawn(async move {
            // Track total request count for capacity planning and monitoring
            metrics::counter!("meme_generator_requests_total", 1);
            let start = std::time::Instant::now();

            // Call the main request processing function that handles image generation
            let result = process_request(&state_clone, request.clone()).await;

            // Record processing time for performance monitoring and SLA tracking
            // This helps identify slow requests and performance degradation
            let duration = start.elapsed().as_secs_f64();
            metrics::histogram!("meme_generator_processing_duration_seconds", duration);

            match result {
                Ok(_) => {
                    // Success case - log and track for monitoring
                    info!(request_id = %req_id, "Successfully processed request");
                    metrics::counter!("meme_generator_success_total", 1);
                }
                Err(e) => {
                    // Error case - provide detailed error context and track failures
                    // Including the error details in logs helps with troubleshooting
                    error!(request_id = %req_id, error = %e, "Failed to process request");
                    metrics::counter!("meme_generator_errors_total", 1);

                    // Send explicit error response to the client
                    // This provides clear feedback rather than silent failures
                    // and enables better UX with appropriate error handling
                    if let Err(e) = send_error_response(&state_clone, &req_id, e.to_string()).await
                    {
                        error!(request_id = %req_id, "Failed to send error response: {}", e);
                    }
                }
            }

            // Acknowledge message only after all processing is complete
            // This ensures at-least-once delivery semantics and prevents
            // message loss in case of failures during processing
            if let Err(e) = message.ack().await {
                error!(request_id = %req_id, "Failed to ack message: {}", e);
            }
        });
    }

    Ok(())
}

#[instrument(skip(state), fields(request_id = %request.id))]
/// Core image generation function that handles the entire meme creation pipeline
///
/// This function implements a multi-stage process:
/// 1. Check Redis cache first to avoid regenerating identical images
/// 2. If not in cache, select the appropriate model based on request parameters
/// 3. Format the prompt with specific instructions for better meme generation
/// 4. Make the API request to Hugging Face with proper error handling
/// 5. Cache the successful result to improve future response times
/// 6. Deliver the response back to the client via NATS
///
async fn process_request(state: &Arc<Mutex<AppState>>, request: MemeRequest) -> Result<()> {
    debug!(
        prompt = %request.prompt,
        "Processing meme request"
    );

    // Try to fetch from cache first
    let state_guard = state.lock().await;
    let cache_key = format!(
        "meme:{}:{}:{}",
        request.prompt, request.fast_mode, request.small_image
    );

    let mut redis = state_guard.redis.clone();
    drop(state_guard);

    // Check cache
    match redis.get::<_, Option<String>>(&cache_key).await {
        Ok(Some(cached_data)) => {
            info!(
                request_id = %request.id,
                "Cache hit for prompt: {}",
                request.prompt
            );
            metrics::counter!("meme_generator_cache_hits_total", 1);

            // Send cached response
            let response = MemeResponse {
                request_id: request.id.clone(),
                image_data: cached_data,
                prompt: request.prompt.clone(),
                timestamp: std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)?
                    .as_secs(),
            };

            return send_response(state, response).await;
        }
        Ok(None) => {
            debug!(
                request_id = %request.id,
                "Cache miss for prompt: {}",
                request.prompt
            );
            metrics::counter!("meme_generator_cache_misses_total", 1);
        }
        Err(e) => {
            warn!(
                request_id = %request.id,
                "Redis error when checking cache: {}",
                e
            );
            metrics::counter!("meme_generator_cache_errors_total", 1);
        }
    }

    // Generate image
    info!(
        request_id = %request.id,
        "Generating image for prompt: {}",
        request.prompt
    );

    let state_guard = state.lock().await;
    let client = state_guard.http_client.clone();
    let hf_api_token = state_guard.config.hf_api_token.clone();
    let cache_ttl = state_guard.config.cache_ttl;
    drop(state_guard);

    let start = std::time::Instant::now();

    // Format the prompt for better meme generation with clearer text instructions
    let full_prompt = format!(
        "Funny meme image with cartoon style, vibrant colors. The image should have medium-sized, white text with black outline in impact font. \
        The meme should be about: {}. \
        The text should be short, funny, and placed at the top and bottom of the image in classic meme style. Make sure the text is not too large.", 
        request.prompt
    );

    // Select the model based on parameters
    let api_url = if request.fast_mode || request.small_image {
        // Use the faster FLUX model when either fast_mode or small_image is selected
        "https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell"
            .to_string()
    } else {
        // If neither fast_mode nor small_image is selected, check if env var is set
        let state_guard = state.lock().await;
        let env_url = state_guard.config.hf_api_url.clone();
        drop(state_guard);

        if env_url.is_empty() {
            // Default to stable-diffusion-v1-5 if env var is empty
            "https://api-inference.huggingface.co/models/runwayml/stable-diffusion-v1-5".to_string()
        } else {
            env_url
        }
    };

    // Create the request with parameters including image size
    let image_size = if request.small_image { 512 } else { 1024 };
    let parameters = serde_json::json!({
        "width": image_size,
        "height": image_size
    });

    let hf_request = HuggingFaceRequest {
        inputs: full_prompt,
        parameters: Some(parameters),
    };

    debug!(
        request_id = %request.id,
        "Full prompt sent to API: {}",
        hf_request.inputs
    );

    // Add authorization header with the token
    debug!(
        request_id = %request.id,
        "Sending request to Hugging Face API: {}",
        api_url
    );

    // Make the API request
    let response = client
        .post(&api_url)
        .timeout(Duration::from_secs(60))
        .header("Authorization", format!("Bearer {}", hf_api_token.trim()))
        .json(&hf_request)
        .send()
        .await
        .context("Failed to send request to Hugging Face API")?;

    let status = response.status();
    if !status.is_success() {
        let error_text = response
            .text()
            .await
            .unwrap_or_else(|_| "Unknown error".to_string());
        error!(
            request_id = %request.id,
            status_code = %status.as_u16(),
            "Hugging Face API error: {}",
            error_text
        );
        return Err(anyhow::anyhow!(
            "Hugging Face API error ({}): {}",
            status,
            error_text
        ));
    }

    let image_bytes = response
        .bytes()
        .await
        .context("Failed to get image bytes from response")?;

    let generation_time = start.elapsed().as_secs_f64();
    metrics::histogram!(
        "meme_generator_generation_duration_seconds",
        generation_time
    );
    info!(
        request_id = %request.id,
        duration_secs = generation_time,
        model = if request.fast_mode { "fast" } else { "quality" },
        image_size = image_bytes.len(),
        resolution = image_size,
        "Generated image in {} seconds ({} bytes, {}x{})",
        generation_time,
        image_bytes.len(),
        image_size,
        image_size
    );

    // Encode image to base64
    let image_data = STANDARD.encode(&image_bytes);

    // Cache the result
    if let Err(e) = redis
        .set_ex::<_, _, ()>(&cache_key, &image_data, cache_ttl)
        .await
    {
        warn!(
            request_id = %request.id,
            "Failed to cache image: {}",
            e
        );
    } else {
        debug!(
            request_id = %request.id,
            "Cached image for prompt: {}",
            request.prompt
        );
    }

    // Send response
    let meme_response = MemeResponse {
        request_id: request.id,
        image_data,
        prompt: request.prompt,
        timestamp: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)?
            .as_secs(),
    };

    send_response(state, meme_response).await
}

/// Publishes a successful meme generation response to the NATS message queue
///
/// This function delivers the generated meme back to the client via NATS:
/// 1. Acquires necessary configuration from shared state without holding the lock
/// 2. Serializes the response to JSON format for transport
/// 3. Publishes the message to the configured response subject
/// 4. Logs successful delivery for observability
#[instrument(skip(state), fields(request_id = %response.request_id))]
async fn send_response(state: &Arc<Mutex<AppState>>, response: MemeResponse) -> Result<()> {
    let state_guard = state.lock().await;
    let js = state_guard.js.clone();
    let subject = state_guard.config.response_subject.clone();
    drop(state_guard);

    let response_data = serde_json::to_vec(&response)?;

    js.publish(subject, response_data.into())
        .await
        .context("Failed to publish response")?;

    info!(
        request_id = %response.request_id,
        "Sent response for prompt: {}",
        response.prompt
    );

    Ok(())
}

/// Delivers error information back to the client when meme generation fails
///
/// This function handles the error path in our messaging architecture:
/// 1. Creates a dedicated error subject by appending `.error` to the response subject
/// 2. Constructs a structured error response with timestamp and request ID
/// 3. Publishes the error details to NATS so clients can display appropriate feedback
/// 4. Logs the error response for later troubleshooting
#[instrument(skip(state))]
async fn send_error_response(
    state: &Arc<Mutex<AppState>>,
    request_id: &str,
    error: String,
) -> Result<()> {
    let state_guard = state.lock().await;
    let js = state_guard.js.clone();
    let subject = format!("{}.error", state_guard.config.response_subject);
    drop(state_guard);

    let error_response = MemeError {
        request_id: request_id.to_string(),
        error,
        timestamp: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)?
            .as_secs(),
    };

    let error_data = serde_json::to_vec(&error_response)?;

    js.publish(subject, error_data.into())
        .await
        .context("Failed to publish error response")?;

    info!(
        request_id = %request_id,
        "Sent error response"
    );

    Ok(())
}
