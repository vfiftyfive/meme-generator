use anyhow::{Context, Result};
use async_nats::{self, jetstream};
use base64::{Engine, engine::general_purpose::STANDARD};
use clap::Parser;
use futures::stream::StreamExt;
use uuid::Uuid;
use metrics_exporter_prometheus::PrometheusBuilder;
use redis::{aio::ConnectionManager, AsyncCommands};
use serde::{Deserialize, Serialize};
use std::{sync::Arc, time::Duration};
use tokio::sync::Mutex;
use tracing::{debug, error, info, instrument, warn};
use tracing_subscriber::{filter::EnvFilter, layer::SubscriberExt, util::SubscriberInitExt};

#[derive(Parser, Debug, Clone)]
#[clap(name = "meme-generator", about = "Meme Battle Royale generator service")]
struct Config {
    /// NATS server URL
    #[clap(long, env = "NATS_URL", default_value = "nats://nats.messaging.svc.cluster.local:4222")]
    nats_url: String,

    /// NATS stream name
    #[clap(long, env = "NATS_STREAM", default_value = "MEMES")]
    nats_stream: String,

    /// NATS consumer name
    #[clap(long, env = "NATS_CONSUMER", default_value = "meme-generator")]
    nats_consumer: String,

    /// NATS request subject
    #[clap(long, env = "NATS_REQUEST_SUBJECT", default_value = "meme.request")]
    request_subject: String,

    /// NATS response subject
    #[clap(long, env = "NATS_RESPONSE_SUBJECT", default_value = "meme.response")]
    response_subject: String,

    /// Redis URL
    #[clap(long, env = "REDIS_URL", default_value = "redis://redis.cache.svc.cluster.local:6379")]
    redis_url: String,

    /// Hugging Face API Token
    #[clap(long, env = "HF_API_TOKEN")]
    hf_api_token: String,

    /// Redis cache TTL in seconds
    #[clap(long, env = "CACHE_TTL", default_value = "3600")]
    cache_ttl: u64,

    /// Metrics listen address
    #[clap(long, env = "METRICS_ADDR", default_value = "0.0.0.0:9090")]
    metrics_addr: String,
}

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

fn generate_uuid() -> String {
    Uuid::new_v4().to_string()
}

fn default_fast_mode() -> bool {
    false
}

fn default_small_image() -> bool {
    false
}

#[derive(Debug, Serialize, Deserialize)]
struct MemeResponse {
    request_id: String,
    image_data: String, // Base64 encoded image
    prompt: String,
    timestamp: u64,
}

#[derive(Debug, Serialize, Deserialize)]
struct MemeError {
    request_id: String,
    error: String,
    timestamp: u64,
}

#[derive(Debug, Serialize)]
struct HuggingFaceRequest {
    inputs: String,
    parameters: Option<serde_json::Value>,
}

struct AppState {
    redis: ConnectionManager,
    js: jetstream::Context,
    config: Config,
    http_client: reqwest::Client,
}

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize configuration
    let config = Config::parse();

    // Set up logging
    tracing_subscriber::registry()
        .with(tracing_subscriber::fmt::layer())
        .with(EnvFilter::from_default_env().add_directive("meme_generator=info".parse()?))
        .init();

    info!("Starting Meme Generator Service");

    // Set up metrics
    let builder = PrometheusBuilder::new()
        .add_global_label("service", "meme_generator")
        .set_buckets(&[0.1, 0.5, 1.0, 2.0, 5.0, 10.0, 30.0, 60.0, 120.0])?;

    let handle = builder.install_recorder()?;
    
    // Start the metrics server
    let metrics_addr = config.metrics_addr.clone();
    tokio::spawn(async move {
        let server = axum::Router::new()
            .route("/metrics", axum::routing::get(move || async move { handle.render() }))
            .into_make_service();
            
        let addr = metrics_addr.parse().unwrap();
        axum::Server::bind(&addr)
            .serve(server)
            .await
            .unwrap();
    });
    info!("Metrics server started on {}", config.metrics_addr);

    // Connect to NATS
    info!("Connecting to NATS at {}", config.nats_url);
    let nats = async_nats::connect(&config.nats_url).await?;
    let js = jetstream::new(nats);

    // Ensure stream exists
    let stream_config = jetstream::stream::Config {
        name: config.nats_stream.clone(),
        subjects: vec![format!("{}.>", config.request_subject)],
        storage: jetstream::stream::StorageType::File,
        retention: jetstream::stream::RetentionPolicy::WorkQueue,
        ..Default::default()
    };

    let mut stream = match js.get_stream(&config.nats_stream).await {
        Ok(stream) => stream,
        Err(_) => js.create_stream(stream_config).await?,
    };

    info!("Connected to NATS stream {}", stream.info().await?.config.name);

    // Connect to Redis
    info!("Connecting to Redis at {}", config.redis_url);
    let redis_client = redis::Client::open(config.redis_url.clone())?;
    let redis = ConnectionManager::new(redis_client).await?;

    // Create HTTP client for Hugging Face API
    let mut headers = reqwest::header::HeaderMap::new();
    headers.insert(
        "Authorization",
        format!("Bearer {}", config.hf_api_token)
            .parse()
            .context("Failed to parse authorization header")?,
    );

    let http_client = reqwest::Client::builder()
        .timeout(Duration::from_secs(300))
        .default_headers(headers)
        .build()?;

    // Initialize application state
    let state = Arc::new(Mutex::new(AppState {
        redis,
        js,
        config: config.clone(),
        http_client,
    }));

    // Set up consumer
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

    let consumer = match stream.get_consumer(&config.nats_consumer).await {
        Ok(consumer) => consumer,
        Err(_) => stream.create_consumer(consumer_config).await?,
    };

    info!("NATS consumer ready");

    // Start processing messages
    process_messages(state, consumer).await?;

    Ok(())
}

#[instrument(skip_all)]
async fn process_messages(
    state: Arc<Mutex<AppState>>,
    consumer: async_nats::jetstream::consumer::Consumer<jetstream::consumer::pull::Config>,
) -> Result<()> {
    let mut messages = consumer.messages().await?;

    info!("Started processing messages");

    while let Some(message) = messages.next().await {
        let message = match message {
            Ok(msg) => msg,
            Err(e) => {
                error!("Error receiving message: {}", e);
                continue;
            }
        };

        let request: MemeRequest = match serde_json::from_slice(&message.payload) {
            Ok(req) => req,
            Err(e) => {
                error!("Failed to parse message: {}", e);
                if let Err(e) = message.ack().await {
                    error!("Failed to ack message: {}", e);
                }
                continue;
            }
        };

        info!(
            request_id = %request.id,
            prompt = %request.prompt,
            "Received meme generation request"
        );

        let req_id = request.id.clone();
        let state_clone = state.clone();

        // Process the message in a separate task
        tokio::spawn(async move {
            metrics::counter!("meme_generator_requests_total", 1);
            let start = std::time::Instant::now();

            let result = process_request(&state_clone, request.clone()).await;

            // Record processing time
            let duration = start.elapsed().as_secs_f64();
            metrics::histogram!("meme_generator_processing_duration_seconds", duration);

            match result {
                Ok(_) => {
                    info!(request_id = %req_id, "Successfully processed request");
                    metrics::counter!("meme_generator_success_total", 1);
                }
                Err(e) => {
                    error!(request_id = %req_id, error = %e, "Failed to process request");
                    metrics::counter!("meme_generator_errors_total", 1);

                    // Send error response
                    if let Err(e) = send_error_response(&state_clone, &req_id, e.to_string()).await {
                        error!(request_id = %req_id, "Failed to send error response: {}", e);
                    }
                }
            }

            // Ack the message after processing
            if let Err(e) = message.ack().await {
                error!(request_id = %req_id, "Failed to ack message: {}", e);
            }
        });
    }

    Ok(())
}

#[instrument(skip(state), fields(request_id = %request.id))]
async fn process_request(
    state: &Arc<Mutex<AppState>>,
    request: MemeRequest,
) -> Result<()> {
    debug!(
        prompt = %request.prompt,
        "Processing meme request"
    );

    // Try to fetch from cache first
    let state_guard = state.lock().await;
    let cache_key = format!("meme:{}:{}:{}", request.prompt, request.fast_mode, request.small_image);
    
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
    
    // Select the model based on fast_mode parameter
    let api_url = if request.fast_mode {
        // Use the faster FLUX model
        "https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell"
    } else {
        // Use the higher quality model
        "https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-dev"
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
    
    // Make the request to the Hugging Face API with a timeout
    let response = client
        .post(api_url)
        .timeout(Duration::from_secs(60))
        .header("Authorization", format!("Bearer {}", hf_api_token))
        .json(&hf_request)
        .send()
        .await
        .context("Failed to send request to Hugging Face API")?;
    
    let status = response.status();
    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
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
    metrics::histogram!("meme_generator_generation_duration_seconds", generation_time);
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

#[instrument(skip(state), fields(request_id = %response.request_id))]
async fn send_response(
    state: &Arc<Mutex<AppState>>,
    response: MemeResponse,
) -> Result<()> {
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
