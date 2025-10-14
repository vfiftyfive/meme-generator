import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, generateMeme } from '../lib/helpers.js';

export const options = {
  stages: [
    { duration: '1m', target: 20 },  // ramp quickly
    { duration: '4m', target: 40 },  // sustained load
    { duration: '1m', target: 0 },   // ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<3000'],
    http_req_failed: ['rate<0.05'],
  },
};

export default function () {
  const scenario = Math.random();

  if (scenario < 0.6) {
    const homepageRes = http.get(BASE_URL);
    check(homepageRes, {
      'Homepage accessible': (r) => r.status === 200,
    });
    sleep(1 + Math.random() * 2);
    generateMeme();
    sleep(3 + Math.random() * 3);
  } else {
    for (let i = 0; i < 2; i++) {
      generateMeme();
      sleep(1 + Math.random());
    }
  }
}

export function teardown() {
  console.log('Demo load test finished. Review HPA behaviour.');
}
