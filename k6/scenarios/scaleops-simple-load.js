import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';

// Custom metrics
const podCPUTrend = new Trend('estimated_pod_cpu_usage');
const podMemoryTrend = new Trend('estimated_pod_memory_usage');

export const options = {
  stages: [
    { duration: '1m', target: 10 },   // Warm up
    { duration: '3m', target: 30 },   // Trigger frontend HPA (>30% CPU)
    { duration: '5m', target: 60 },   // Sustained load - should scale more
    { duration: '3m', target: 100 },  // Push to test limits
    { duration: '2m', target: 10 },   // Cool down
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000', 'p(99)<3000'],
    http_req_failed: ['rate<0.1'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://meme-generator.scaleops-labs.dev';

export default function () {
  // Simple HTTP requests that will generate CPU load on frontend
  const responses = http.batch([
    { method: 'GET', url: BASE_URL },
    { method: 'GET', url: `${BASE_URL}/` },
    { method: 'GET', url: `${BASE_URL}/index.html` },
  ]);
  
  responses.forEach(res => {
    check(res, {
      'status is 200': (r) => r.status === 200,
      'response time < 1s': (r) => r.timings.duration < 1000,
    });
  });
  
  // Estimate pod resource usage based on VU count and response times
  const currentVUs = __VU;
  const avgResponseTime = responses.reduce((sum, r) => sum + r.timings.duration, 0) / responses.length;
  
  // Rough estimation: more VUs and slower responses = higher resource usage
  const estimatedCPU = Math.min(100, (currentVUs * 2) + (avgResponseTime / 50));
  const estimatedMemory = Math.min(100, (currentVUs * 1.5) + (avgResponseTime / 100));
  
  podCPUTrend.add(estimatedCPU);
  podMemoryTrend.add(estimatedMemory);
  
  // Vary think time based on load
  const thinkTime = currentVUs > 50 ? 0.5 : 1 + Math.random();
  sleep(thinkTime);
}

export function handleSummary(data) {
  const avgCPU = data.metrics.estimated_pod_cpu_usage?.values?.avg || 0;
  const maxCPU = data.metrics.estimated_pod_cpu_usage?.values?.max || 0;
  
  console.log(`
=== ScaleOps HPA Validation Summary ===

Test Duration: ${Math.round(data.state.testRunDurationMs / 1000)}s
Total Requests: ${data.metrics.http_reqs?.values?.count || 0}
Request Rate: ${data.metrics.http_reqs?.values?.rate?.toFixed(1)} req/s

Performance:
- 95th percentile: ${data.metrics.http_req_duration?.values['p(95)']?.toFixed(0)}ms
- 99th percentile: ${data.metrics.http_req_duration?.values['p(99)']?.toFixed(0)}ms
- Error Rate: ${(data.metrics.http_req_failed?.values?.rate * 100 || 0).toFixed(2)}%

Estimated Load (for HPA triggers):
- Avg CPU Usage: ${avgCPU.toFixed(1)}%
- Max CPU Usage: ${maxCPU.toFixed(1)}%

Expected ScaleOps Behavior:
1. Frontend should scale when CPU > 30% (likely around 20-30 VUs)
2. Backend might scale if processing gets backed up
3. With optimize-utilization, pods should pack tightly on nodes
4. Scale-down should happen aggressively after load drops

Check actual scaling with:
kubectl get hpa -n meme-generator --watch
`);

  return {
    'stdout': '', // Summary already printed above
    'scaleops-simple-load-results.json': JSON.stringify(data),
  };
}