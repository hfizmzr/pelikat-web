import http from 'k6/http';
import { check, sleep } from 'k6';

/**
 * Performance Load Test: pelikat-web (Next.js)
 *
 * NFR: All CRUD API responses shall complete within 500ms under normal load
 *      of up to 500 concurrent users.
 *
 * Usage:
 *   k6 run k6/load-test.js                              # 500 VUs (staging/prod)
 *   k6 run k6/load-test.local.js                        # 20 VUs (local smoke)
 *   K6_VUS=100 k6 run k6/load-test.js                   # override VU count
 *
 * Environment variables:
 *   WEB_BASE_URL  — Base URL (default: http://localhost:3000)
 *   K6_VUS        — Max VU count (default: 500)
 */

const BASE_URL = __ENV.WEB_BASE_URL || 'http://localhost:3000';

const MAX_VUS = parseInt(__ENV.K6_VUS) || 500;

export const options = {
  stages: [
    { duration: '30s', target: Math.min(MAX_VUS * 0.2, 100) },
    { duration: '30s', target: Math.min(MAX_VUS, 500) },
    { duration: '1m', target: MAX_VUS },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  const res1 = http.get(`${BASE_URL}/`);
  check(res1, {
    'Landing page 200': (r) => r.status === 200,
    'Landing page < 500ms': (r) => r.timings.duration < 500,
  });

  const res2 = http.get(`${BASE_URL}/login`);
  check(res2, {
    'Login page 200': (r) => r.status === 200,
    'Login page < 500ms': (r) => r.timings.duration < 500,
  });

  const res3 = http.get(`${BASE_URL}/register`);
  check(res3, {
    'Register page 200': (r) => r.status === 200,
    'Register page < 500ms': (r) => r.timings.duration < 500,
  });

  const res4 = http.get(`${BASE_URL}/organizer/apply`);
  check(res4, {
    'Organizer apply 200': (r) => r.status === 200,
    'Organizer apply < 500ms': (r) => r.timings.duration < 500,
  });

  const res5 = http.get(`${BASE_URL}/api/admin/health`);
  check(res5, {
    'API health 200 or 404': (r) => r.status === 200 || r.status === 404,
    'API health < 500ms': (r) => r.timings.duration < 500,
  });

  const res6 = http.get(`${BASE_URL}/manifest.json`);
  check(res6, {
    'Manifest 200': (r) => r.status === 200,
    'Manifest < 500ms': (r) => r.timings.duration < 500,
  });

  sleep(Math.random() * 1.5 + 0.5);
}
