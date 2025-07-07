import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, generateMeme } from '../lib/helpers.js';

export const options = {
  stages: [
    { duration: '2m', target: 10 },   // Baseline load
    { duration: '30s', target: 150 }, // Sudden spike!
    { duration: '3m', target: 150 },  // Sustained high load
    { duration: '30s', target: 10 },  // Quick drop
    { duration: '2m', target: 10 },   // Return to baseline
    { duration: '30s', target: 200 }, // Even bigger spike!
    { duration: '2m', target: 200 },  // Sustained peak
    { duration: '1m', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<4000'], // Some degradation acceptable
    http_req_failed: ['rate<0.15'],    // Higher error tolerance during spikes
    http_req_waiting: ['p(95)<2000'],   // Server processing may be slower
  },
};

export default function () {
  // Simulate viral traffic pattern
  const behavior = Math.random();
  
  if (behavior < 0.7) {
    // 70% - New users flooding in (viral moment)
    const res = http.get(BASE_URL);
    if (res.status === 200) {
      generateMeme();
    }
    sleep(1 + Math.random() * 2);
    
  } else if (behavior < 0.9) {
    // 20% - Sharing behavior (multiple quick requests)
    http.get(BASE_URL);
    generateMeme();
    sleep(0.5);
    http.get(`${BASE_URL}/share`); // Hypothetical share endpoint
    
  } else {
    // 10% - Impatient users (retries)
    for (let retry = 0; retry < 3; retry++) {
      const res = generateMeme();
      if (res.status === 200) break; // Success
      sleep(0.5);
    }
  }
}

export function teardown(data) {
  console.log('Spike test completed. Review HPA reaction time and recovery.');
}