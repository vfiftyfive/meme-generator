import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, generateMeme } from '../lib/helpers.js';

export const options = {
  stages: [
    { duration: '5m', target: 20 },  // Ramp up to 20 users
    { duration: '20m', target: 50 }, // Ramp up to 50 users
    { duration: '5m', target: 0 },   // Ramp down to 0 users
  ],
  thresholds: {
    http_req_duration: ['p(95)<3000'], // 95% of requests must complete below 3s
    http_req_failed: ['rate<0.05'],    // Error rate must be below 5%
    // Custom thresholds for business metrics
    http_req_waiting: ['p(95)<1000'],   // Server processing time
    http_reqs: ['rate>10'],             // At least 10 requests per second
  },
};

export default function () {
  // Simulate different user behaviors
  const scenario = Math.random();
  
  if (scenario < 0.6) {
    // 60% - Regular user: browse and generate meme
    const homepageRes = http.get(BASE_URL);
    check(homepageRes, {
      'Homepage accessible': (r) => r.status === 200,
    });
    
    sleep(2 + Math.random() * 3);
    generateMeme();
    sleep(5 + Math.random() * 5);
    
  } else if (scenario < 0.9) {
    // 30% - Power user: multiple meme generations
    for (let i = 0; i < 3; i++) {
      generateMeme();
      sleep(2 + Math.random() * 2);
    }
    
  } else {
    // 10% - API user: direct API calls (if available)
    const apiRes = http.get(`${BASE_URL}/api/health`);
    check(apiRes, {
      'API health check': (r) => r.status === 200 || r.status === 404,
    });
    sleep(1);
  }
}

export function teardown(data) {
  console.log('Load test completed. Check HPA scaling metrics.');
}