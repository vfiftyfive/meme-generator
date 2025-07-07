import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, generateMeme } from '../lib/helpers.js';

export const options = {
  vus: 3,
  duration: '5m',
  thresholds: {
    http_req_duration: ['p(95)<1000'], // 95% of requests must complete below 1s
    http_req_failed: ['rate<0.01'],    // Error rate must be below 1%
  },
};

export default function () {
  // 1. Load homepage
  const homepageRes = http.get(BASE_URL);
  check(homepageRes, {
    'Homepage loads successfully': (r) => r.status === 200,
    'Homepage loads quickly': (r) => r.timings.duration < 500,
  });

  sleep(1);

  // 2. Simulate meme generation with HTTP requests
  generateMeme();

  // 3. Simulate user thinking time
  sleep(3 + Math.random() * 2);
}

export function teardown(data) {
  console.log('Smoke test completed. System is operational.');
}