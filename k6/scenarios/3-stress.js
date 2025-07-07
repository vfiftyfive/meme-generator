import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, generateMeme, PROMPTS } from '../lib/helpers.js';
import { randomItem } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

export const options = {
  stages: [
    { duration: '2m', target: 50 },   // Warm up
    { duration: '5m', target: 100 },  // Ramp to 100 users
    { duration: '5m', target: 150 },  // Ramp to 150 users
    { duration: '5m', target: 200 },  // Ramp to 200 users (stress)
    { duration: '3m', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<5000'], // Relaxed for stress test
    http_req_failed: ['rate<0.10'],    // Allow up to 10% errors
  },
};

export default function () {
  // Aggressive testing pattern
  const testType = Math.random();
  
  if (testType < 0.4) {
    // 40% - Rapid fire meme generation
    for (let i = 0; i < 5; i++) {
      generateMeme(randomItem(PROMPTS));
      sleep(0.5); // Minimal delay
    }
    
  } else if (testType < 0.7) {
    // 30% - Concurrent connections test
    const responses = [];
    for (let i = 0; i < 3; i++) {
      responses.push(http.get(BASE_URL, { tags: { name: 'concurrent' } }));
    }
    responses.forEach(r => {
      check(r, { 'Concurrent request success': (r) => r.status === 200 });
    });
    
  } else if (testType < 0.9) {
    // 20% - Large prompt stress test
    const largePrompt = PROMPTS[0].repeat(10); // Extra long prompt
    generateMeme(largePrompt);
    
  } else {
    // 10% - Cache buster requests
    const bustCache = `${BASE_URL}/?cb=${Date.now()}`;
    const res = http.get(bustCache);
    check(res, { 'Cache buster request': (r) => r.status === 200 });
  }
  
  sleep(Math.random() * 2); // Random think time
}

export function teardown(data) {
  console.log('Stress test completed. Review system limits and bottlenecks.');
}