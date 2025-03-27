// This file will be replaced at runtime in the container
// but provides sensible defaults for local development
window.RUNTIME_CONFIG = {
  // Default values for local development
  NATS_URL: "ws://localhost:8080",
  REQUEST_SUBJECT: "meme.request",
  RESPONSE_SUBJECT: "meme.response",
  // Override with values from the environment if available
  ...window.RUNTIME_CONFIG
};
