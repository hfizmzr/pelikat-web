import http from 'k6/http';
import { check, sleep } from 'k6';

/**
 * Smoke Test: pelikat-web (Next.js) — local development
 *
 * Usage:
 *   k6 run k6/load-test.local.js
 *   K6_VUS=5 k6 run k6/load-test.local.js    # override VU count
 */

const BASE_URL = __ENV.WEB_BASE_URL || 'http://localhost:3000';

const MAX_VUS = parseInt(__ENV.K6_VUS) || 20;

export const options = {
  stages: [
    { duration: '5s', target: MAX_VUS },
    { duration: '20s', target: MAX_VUS },
    { duration: '5s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'],    // relaxed: < 2s for dev server
    http_req_failed: ['rate<0.05'],        // relaxed: 5% error rate
  },
};

export default function () {
  const res1 = http.get(`${BASE_URL}/`);
  check(res1, {
    'Landing page 200': (r) => r.status === 200,
    'Landing page < 2s': (r) => r.timings.duration < 2000,
  });

  const res2 = http.get(`${BASE_URL}/login`);
  check(res2, {
    'Login page 200': (r) => r.status === 200,
    'Login page < 2s': (r) => r.timings.duration < 2000,
  });

  const res3 = http.get(`${BASE_URL}/manifest.json`);
  check(res3, {
    'Manifest 200': (r) => r.status === 200,
    'Manifest < 2s': (r) => r.timings.duration < 2000,
  });

  sleep(Math.random() * 1 + 0.5);
}
