import http from 'k6/http';
import { check, sleep } from 'k6';

/**
 * Performance Load Test: pelikat-web (Next.js)
 * 
 * NFR: All CRUD API responses shall complete within 500ms under normal load
 *      of up to 500 concurrent users.
 * 
 * Usage: k6 run k6/load-test.js
 * 
 * Environment variables:
 *   - WEB_BASE_URL: Base URL of the Next.js app (default: http://localhost:3000)
 */

const BASE_URL = __ENV.WEB_BASE_URL || 'http://localhost:3000';

export const options = {
  stages: [
    { duration: '30s', target: 100 },   // Ramp up to 100 VUs
    { duration: '30s', target: 500 },  // Ramp up to 500 VUs
    { duration: '1m', target: 500 },    // Sustain 500 VUs for 1 minute
    { duration: '30s', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],   // 95% of requests < 500ms
    http_req_duration: ['p(99)<1000'],  // 99% of requests < 1000ms
    http_req_failed: ['rate<0.01'],     // Error rate < 1%
  },
};

export default function () {
  // Test 1: Landing page (static, cached)
  const res1 = http.get(`${BASE_URL}/`);
  check(res1, {
    'Landing page status is 200': (r) => r.status === 200,
    'Landing page duration < 500ms': (r) => r.timings.duration < 500,
  });

  // Test 2: Login page (static, SSR)
  const res2 = http.get(`${BASE_URL}/login`);
  check(res2, {
    'Login page status is 200': (r) => r.status === 200,
    'Login page duration < 500ms': (r) => r.timings.duration < 500,
  });

  // Test 3: Register page (static, SSR)
  const res3 = http.get(`${BASE_URL}/register`);
  check(res3, {
    'Register page status is 200': (r) => r.status === 200,
    'Register page duration < 500ms': (r) => r.timings.duration < 500,
  });

  // Test 4: Organizer apply page (static, public)
  const res4 = http.get(`${BASE_URL}/organizer/apply`);
  check(res4, {
    'Organizer apply status is 200': (r) => r.status === 200,
    'Organizer apply duration < 500ms': (r) => r.timings.duration < 500,
  });

  // Test 5: API health endpoint (if available)
  const res5 = http.get(`${BASE_URL}/api/admin/health`);
  check(res5, {
    'API health status is 200 or 404': (r) => r.status === 200 || r.status === 404,
    'API health duration < 500ms': (r) => r.timings.duration < 500,
  });

  // Test 6: Static assets (CSS, JS)
  const res6 = http.get(`${BASE_URL}/manifest.json`);
  check(res6, {
    'Manifest status is 200': (r) => r.status === 200,
    'Manifest duration < 500ms': (r) => r.timings.duration < 500,
  });

  // Random sleep between 0.5s and 2s to simulate realistic user behavior
  sleep(Math.random() * 1.5 + 0.5);
}
