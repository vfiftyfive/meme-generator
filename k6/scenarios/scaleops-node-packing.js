import http from 'k6/http';
import { check, sleep } from 'k6';
import exec from 'k6/execution';

export const options = {
  scenarios: {
    // Create pods with different resource requirements to test bin-packing
    small_pods: {
      executor: 'constant-vus',
      vus: 5,
      duration: '5m',
      startTime: '0s',
      env: { POD_SIZE: 'small' },
    },
    medium_pods: {
      executor: 'constant-vus',
      vus: 3,
      duration: '5m',
      startTime: '2m',
      env: { POD_SIZE: 'medium' },
    },
    large_pods: {
      executor: 'constant-vus',
      vus: 2,
      duration: '5m',
      startTime: '4m',
      env: { POD_SIZE: 'large' },
    },
    // Then reduce load to test node scale-down
    scale_down: {
      executor: 'constant-vus',
      vus: 1,
      duration: '10m',
      startTime: '10m',
      env: { POD_SIZE: 'minimal' },
    },
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://meme-generator.scaleops-labs.dev';

export default function () {
  const podSize = __ENV.POD_SIZE || 'small';
  const scenario = exec.scenario.name;
  
  console.log(`Running ${scenario} with pod size: ${podSize}`);
  
  switch (podSize) {
    case 'small':
      // Light requests - should pack many per pod
      lightweightRequests();
      break;
    case 'medium':
      // Moderate load - normal pod sizing
      moderateRequests();
      break;
    case 'large':
      // Heavy load - fewer pods per node
      heavyRequests();
      break;
    case 'minimal':
      // Minimal load for scale-down testing
      minimalRequests();
      break;
  }
}

function lightweightRequests() {
  // Small, quick requests that use minimal resources
  for (let i = 0; i < 5; i++) {
    const res = http.get(`${BASE_URL}/health`);
    check(res, { 'Health check OK': (r) => r.status === 200 });
    sleep(0.2);
  }
  
  // Small memory footprint
  http.post(`${BASE_URL}/api/cache`, JSON.stringify({
    key: `test_${exec.vu.idInTest}_${exec.scenario.iterationInTest}`,
    value: 'small_data',
    ttl: 60
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
  
  sleep(1);
}

function moderateRequests() {
  // Standard user requests
  const res = http.get(BASE_URL);
  check(res, { 'Homepage loads': (r) => r.status === 200 });
  
  // Moderate processing
  http.post(`${BASE_URL}/api/process`, JSON.stringify({
    data: 'x'.repeat(1000), // 1KB payload
    complexity: 'medium'
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
  
  sleep(2);
}

function heavyRequests() {
  // Resource-intensive requests
  const batch = [];
  
  // Simulate heavy processing that requires more CPU/memory
  for (let i = 0; i < 3; i++) {
    batch.push({
      method: 'POST',
      url: `${BASE_URL}/api/generate`,
      body: JSON.stringify({
        prompt: 'complex detailed prompt that requires significant processing',
        options: {
          quality: 'maximum',
          size: 'large',
          effects: ['blur', 'sharpen', 'colorize']
        }
      }),
      params: {
        headers: { 'Content-Type': 'application/json' },
      }
    });
  }
  
  const responses = http.batch(batch);
  responses.forEach(res => {
    check(res, { 'Heavy request processed': (r) => r.status === 200 || r.status === 202 });
  });
  
  sleep(5);
}

function minimalRequests() {
  // Very light load to encourage scale-down
  const res = http.get(`${BASE_URL}/health`);
  check(res, { 'Minimal request OK': (r) => r.status === 200 });
  
  // Long sleep to simulate idle periods
  sleep(10 + Math.random() * 10);
}

export function handleSummary(data) {
  console.log(`
=== Node Packing Test Summary ===

This test creates different pod sizes to validate:
1. ScaleOps bin-packing efficiency
2. Node utilization optimization
3. Scale-down aggressiveness with optimize-utilization

Expected behavior:
- Small pods: Should pack densely on nodes
- Medium pods: Standard distribution
- Large pods: May trigger new node creation
- Scale-down phase: Nodes should be reclaimed aggressively

Monitor with:
kubectl get nodes -o custom-columns=NAME:.metadata.name,PODS:.status.allocatable.pods,CPU:.status.allocatable.cpu,MEMORY:.status.allocatable.memory
`);
  
  return {
    'node-packing-results.json': JSON.stringify(data),
  };
}