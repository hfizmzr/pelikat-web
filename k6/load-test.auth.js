import http from 'k6/http';
import httpEnc from 'k6/encoding';
import { check, sleep } from 'k6';

/**
 * Authenticated Load Test: pelikat-web (Next.js) + Supabase
 *
 * Companion to k6/load-test.js (which stays unauthenticated and untouched).
 * One seeded runner logs in via the app's Supabase auth endpoint; every VU
 * then replays the browser's session cookie (`sb-<ref>-auth-token`, the same
 * base64 session JSON @supabase/ssr writes) so the Next.js middleware sees a
 * real authenticated request. Also exercises the Supabase REST API directly
 * with the access token.
 *
 * Usage:
 *   K6_SUPABASE_URL=https://<ref>.supabase.co \
 *   K6_SUPABASE_ANON_KEY=<public anon key> \
 *   k6 run k6/load-test.auth.js
 *
 * Environment variables:
 *   K6_SUPABASE_URL      — hosted Supabase project URL (required)
 *   K6_SUPABASE_ANON_KEY — public anon key (required, ships in the browser bundle)
 *   K6_TEST_EMAIL        — seeded login email  (default: runner1@pelikat.test)
 *   K6_PASSWORD          — seeded login password (default: Pelikat-Dev-2026!)
 *   WEB_BASE_URL         — Base URL (default: http://localhost:3000)
 *   K6_VUS               — Max VU count (default: 100)
 */

const SB_URL = (__ENV.K6_SUPABASE_URL || '').replace(/\/+$/, '');
const APIKEY = __ENV.K6_SUPABASE_ANON_KEY || '';
const BASE_URL = __ENV.WEB_BASE_URL || 'http://localhost:3000';
const MAX_VUS = parseInt(__ENV.K6_VUS) || 100;

// Constructed from the fixed seeded event id (md5 slug derivation from
// migrations 077/080): Cyberjaya Green Run.
const PUBLIC_SLUG = 'cyberjaya-green-run-8df2ee4b';

if (!SB_URL || !APIKEY) {
  throw new Error('Set K6_SUPABASE_URL and K6_SUPABASE_ANON_KEY (public values, not secrets).');
}

// Auth cookie name convention of @supabase/ssr: sb-<project-ref>-auth-token.
// (k6 has no URL global — plain string ops on https://<ref>.supabase.co)
const sessionRef = SB_URL.split('//')[1].split('.')[0];
const authCookieName = `sb-${sessionRef}-auth-token`;

function loginSessionCore() {
  const res = http.post(
    `${SB_URL}/auth/v1/token?grant_type=password`,
    JSON.stringify({ email: __ENV.K6_TEST_EMAIL || 'runner1@pelikat.test', password: __ENV.K6_PASSWORD || 'Pelikat-Dev-2026!' }),
    { headers: { 'Content-Type': 'application/json', apikey: APIKEY }, tags: { name: 'auth token' } },
  );
  check(res, { 'Login 200': (r) => r.status === 200 });
  return res.json();
}

export function setup() {
  const session = loginSessionCore();
  if (!session.access_token) {
    throw new Error('Password login failed — check K6_SUPABASE_URL/K6_SUPABASE_ANON_KEY/K6_TEST_EMAIL/K6_PASSWORD.');
  }
  const cookieValue = 'base64-' + httpEnc.b64encode(JSON.stringify(session));
  return { cookie: `${authCookieName}=${cookieValue}`, accessToken: session.access_token };
}

export const options = {
  stages: [
    { duration: '15s', target: Math.min(MAX_VUS * 0.3, 50) },
    { duration: '30s', target: MAX_VUS },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function (data) {
  const authHeaders = {
    headers: {
      Cookie: data.cookie,
      Authorization: `Bearer ${data.accessToken}`,
      apikey: APIKEY,
    },
  };

  // Authenticated app page (middleware session check + SSR).
  const runner = http.get(`${BASE_URL}/runner`, { ...authHeaders, tags: { name: 'runner home' } });
  check(runner, {
    'Runner home 200 (authed)': (r) => r.status === 200,
    'Runner home < 500ms': (r) => r.timings.duration < 500,
  });

  const exploring = http.get(`${BASE_URL}/runner/events`, { ...authHeaders, tags: { name: 'runner events' } });
  check(exploring, {
    'Explore events 200 (authed)': (r) => r.status === 200,
    'Explore events < 500ms': (r) => r.timings.duration < 500,
  });

  const board = http.get(`${BASE_URL}/runner/leaderboard?event_id=all`, { ...authHeaders, tags: { name: 'leaderboard' } });
  check(board, {
    'Leaderboard 200 (authed)': (r) => r.status === 200,
    'Leaderboard < 500ms': (r) => r.timings.duration < 500,
  });

  // Authenticated Supabase REST read (RLS as the runner) — the same call the
  // client bundle performs while hydrating the leaderboard.
  const rest = http.get(
    `${SB_URL}/rest/v1/leaderboard_virtual?select=full_name,total_km&limit=50`,
    { headers: { apikey: APIKEY, Authorization: `Bearer ${data.accessToken}` }, tags: { name: 'leaderboard rest' } },
  );
  check(rest, {
    'Leaderboard REST 200': (r) => r.status === 200,
    'Leaderboard REST < 500ms': (r) => r.timings.duration < 500,
  });

  // Public event page as a shared surface with load-test.js.
  const event = http.get(`${BASE_URL}/events/${PUBLIC_SLUG}`, { tags: { name: 'event page' } });
  check(event, {
    'Event page 200': (r) => r.status === 200,
    'Event page < 500ms': (r) => r.timings.duration < 500,
  });

  sleep(Math.random() * 1.5 + 0.5);
}
