import { check } from 'k6';
import http from 'k6/http';
import { randomItem } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';
import { Counter, Trend } from 'k6/metrics';

// Test configuration
export const BASE_URL = __ENV.BASE_URL || 'http://meme-generator.scaleops-labs.dev';
export const WS_URL = __ENV.WS_URL || 'ws://meme-generator.scaleops-labs.dev/ws';

// Meme prompts for variety
export const PROMPTS = [
  'cat wearing sunglasses coding on laptop',
  'dog eating pizza in space',
  'programmer debugging code at 3am',
  'coffee mug with superhero cape',
  'rubber duck explaining algorithms',
  'server room on fire this is fine',
  'git merge conflict nightmare',
  'production deployment on Friday',
  'kubernetes pod eviction party',
  'load balancer having existential crisis'
];

// Helper to simulate meme generation via HTTP
export function generateMeme(promptText = null) {
  const prompt = promptText || randomItem(PROMPTS);
  const startTime = Date.now();
  
  // Since the actual app doesn't have a meme generation API,
  // we'll simulate it with multiple requests to create load
  const requests = [];
  
  // Simulate frontend load
  requests.push({ 
    method: 'GET', 
    url: BASE_URL,
    params: { tags: { name: 'homepage' } }
  });
  
  // Simulate API calls that would happen during meme generation
  requests.push({ 
    method: 'GET', 
    url: `${BASE_URL}/api/health`,
    params: { tags: { name: 'health-check' } }
  });
  
  // Simulate static asset loading
  requests.push({ 
    method: 'GET', 
    url: `${BASE_URL}/static/css/main.css`,
    params: { tags: { name: 'static-asset' } }
  });
  
  const responses = http.batch(requests);
  const duration = Date.now() - startTime;
  
  // Check responses
  let allSuccess = true;
  responses.forEach(res => {
    if (res.status !== 200 && res.status !== 404) {
      allSuccess = false;
    }
  });
  
  check(responses[0], {
    'Homepage loads successfully': (r) => r.status === 200,
    'Response time < 2s': (r) => r.timings.duration < 2000
  });
  
  // Record metrics
  metrics.meme_generation_duration.add(duration);
  if (allSuccess) {
    metrics.memes_generated_total.add(1);
  } else {
    metrics.meme_generation_errors.add(1);
  }
  
  return responses[0];
}

// Helper to check system health
export function checkHealth() {
  const response = http.get(`${BASE_URL}/health`);
  
  check(response, {
    'Health check status is 200': (r) => r.status === 200,
    'Health check response time < 500ms': (r) => r.timings.duration < 500
  });
  
  return response;
}

// Custom metrics for business KPIs
export const metrics = {
  meme_generation_duration: new Trend('meme_generation_duration', true),
  websocket_connection_time: new Trend('websocket_connection_time', true),
  memes_generated_total: new Counter('memes_generated_total'),
  meme_generation_errors: new Counter('meme_generation_errors')
};