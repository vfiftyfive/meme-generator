import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter } from 'k6/metrics';

// Custom metrics for ScaleOps behavior
const podScalingTime = new Trend('pod_scaling_time');
const cpuUtilization = new Trend('cpu_utilization_estimate');
const memoryUtilization = new Trend('memory_utilization_estimate');

export const options = {
  scenarios: {
    // Scenario 1: Gradual load to test ScaleOps HPA decisions
    gradual_load: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '2m', target: 10 },  // Warm up slowly
        { duration: '3m', target: 20 },  // Should trigger first scale
        { duration: '5m', target: 30 },  // Sustained moderate load
        { duration: '3m', target: 50 },  // Push to multiple replicas
        { duration: '2m', target: 10 },  // Scale down test
      ],
      gracefulRampDown: '1m',
    },
    
    // Scenario 2: Burst pattern to test ScaleOps predictive scaling
    burst_pattern: {
      executor: 'ramping-arrival-rate',
      startRate: 5,
      timeUnit: '1m',
      preAllocatedVUs: 50,
      stages: [
        { duration: '1m', target: 5 },   // Baseline
        { duration: '30s', target: 100 }, // Sudden burst
        { duration: '2m', target: 100 },  // Sustained high
        { duration: '30s', target: 5 },   // Drop
        { duration: '2m', target: 5 },    // Quiet period
        { duration: '30s', target: 80 },  // Another burst
        { duration: '1m', target: 80 },   // Sustained
        { duration: '30s', target: 5 },   // Final drop
      ],
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<3000', 'p(99)<5000'],
    http_req_failed: ['rate<0.05'],
  },
};

// Simulate different workload types that ScaleOps needs to optimize
export default function () {
  const scenario = __ENV.SCENARIO || 'mixed';
  
  if (scenario === 'cpu_intensive') {
    // CPU-intensive operations (image processing simulation)
    cpuIntensiveWorkload();
  } else if (scenario === 'memory_intensive') {
    // Memory-intensive operations (large data handling)
    memoryIntensiveWorkload();
  } else {
    // Mixed realistic workload
    mixedWorkload();
  }
}

function cpuIntensiveWorkload() {
  // Frontend: Request complex rendering
  const headers = { 'X-Render-Quality': 'high' };
  const res = http.get(`${__ENV.BASE_URL || 'http://meme-generator.scaleops-labs.dev'}/?complex=true`, { headers });
  
  check(res, {
    'CPU intensive request successful': (r) => r.status === 200,
  });
  
  // Simulate CPU load
  cpuUtilization.add(70 + Math.random() * 20);
  
  sleep(0.5);
}

function memoryIntensiveWorkload() {
  // Backend: Generate multiple memes in parallel (memory pressure)
  const batch = [];
  for (let i = 0; i < 3; i++) {
    batch.push({
      method: 'GET',
      url: `${__ENV.BASE_URL || 'http://meme-generator.scaleops-labs.dev'}/api/generate?size=large`,
    });
  }
  
  const responses = http.batch(batch);
  responses.forEach(res => {
    check(res, {
      'Memory intensive request successful': (r) => r.status === 200 || r.status === 202,
    });
  });
  
  // Simulate memory load
  memoryUtilization.add(60 + Math.random() * 30);
  
  sleep(1);
}

function mixedWorkload() {
  const workloadType = Math.random();
  
  if (workloadType < 0.6) {
    // 60% - Normal user behavior
    const res = http.get(`${__ENV.BASE_URL || 'http://meme-generator.scaleops-labs.dev'}`);
    check(res, { 'Normal request successful': (r) => r.status === 200 });
    cpuUtilization.add(20 + Math.random() * 20);
    memoryUtilization.add(30 + Math.random() * 20);
    sleep(2 + Math.random() * 3);
    
  } else if (workloadType < 0.85) {
    // 25% - Moderate load
    cpuIntensiveWorkload();
    
  } else {
    // 15% - Heavy load
    memoryIntensiveWorkload();
  }
}

export function handleSummary(data) {
  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    'scaleops-test-results.json': JSON.stringify(data),
  };
}

function textSummary(data, options) {
  // Custom summary for ScaleOps-relevant metrics
  return `
=== ScaleOps Test Summary ===

Load Pattern: ${__ENV.SCENARIO || 'mixed'}
Duration: ${data.state.testRunDurationMs / 1000}s

Key Metrics for ScaleOps:
- Avg CPU Utilization (estimated): ${data.metrics.cpu_utilization_estimate?.values.avg?.toFixed(1)}%
- Avg Memory Utilization (estimated): ${data.metrics.memory_utilization_estimate?.values.avg?.toFixed(1)}%
- Request Rate: ${data.metrics.http_reqs?.values.rate?.toFixed(1)} req/s
- 95th percentile response time: ${data.metrics.http_req_duration?.values['p(95)']?.toFixed(0)}ms

ScaleOps should optimize:
1. HPA trigger points based on these patterns
2. Pod placement for optimal bin-packing
3. Predictive scaling for the burst scenarios
4. Resource recommendations based on actual usage
`;
}