// supabase/functions/dispatch-notifications/index.ts
//
// Drains public.notifications (migration 084): sends pending emails via
// Resend and pending pushes via Web Push/VAPID, then records the outcome
// per row. Invoked by pg_net — right after rows are inserted and from the
// every-minute pg_cron sweep — with the shared x-dispatch-secret header.
// Deploy with --no-verify-jwt (the caller is the database, not a user).
//
// Secrets: NOTIFY_DISPATCH_SECRET, RESEND_API_KEY, FROM_EMAIL, SITE_URL,
//          VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
//          (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are provided by the platform)

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildPushPayload,
  isDeliverableEmail,
  renderEmail,
  type NotificationJob,
} from "../_shared/notification-templates.ts";
import { isAllowedPushEndpoint, sendPush, type VapidConfig } from "../_shared/webpush.ts";
// Batch/retry logic extracted to _shared/dispatch.ts for Node unit tests
// (EXT-5); the transport (fetch + timeouts) stays wired here.
import {
  MAX_ATTEMPTS,
  computeRetryState,
  deliverEmails,
  shouldClaimNextBatch,
  type EmailTransport,
} from "../_shared/dispatch.ts";

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined;

const CLAIM_SIZE = 50;
const RUN_BUDGET_MS = 50_000;
const RESEND_TIMEOUT_MS = 15_000;
const PUSH_TIMEOUT_MS = 10_000;

type EmailStatus = "pending" | "sent" | "failed" | "skipped";
type PushStatus = EmailStatus | "no_device";

interface NotificationRow extends NotificationJob {
  user_id: string | null;
  email: string | null;
  email_status: EmailStatus;
  push_status: PushStatus;
  attempts: number;
}

interface Outcome {
  email_status?: EmailStatus;
  email_error?: string | null;
  push_status?: PushStatus;
  push_error?: string | null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function safeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

// A failed attempt stays pending (the 5-minute lease is the backoff)
// until it runs out of attempts.
function failure(row: NotificationRow, error: string): { status: "pending" | "failed"; error: string } {
  return { status: computeRetryState(row.attempts, MAX_ATTEMPTS).status, error: error.slice(0, 500) };
}

// ── email ────────────────────────────────────────────────────────

interface OutgoingEmail {
  id: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}

async function resendPost(url: string, key: string, body: unknown): Promise<Response> {
  return await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    // a stalled request must not hold up the whole batch; a timeout is a
    // retriable failure (deliverEmails catches it). The signal also covers the
    // body read, so callers must not let res.text() throw.
    signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
  });
}

async function dispatchEmails(rows: NotificationRow[], outcomes: Map<string, Outcome>, siteUrl: string) {
  const pending = rows.filter((r) => r.email_status === "pending");
  if (pending.length === 0) return;

  const key = Deno.env.get("RESEND_API_KEY");
  if (!key || Deno.env.get("EMAILS_DISABLED") === "true") {
    for (const r of pending) outcomes.set(r.id, { ...outcomes.get(r.id), email_status: "skipped", email_error: "email_disabled" });
    return;
  }

  const outgoing: OutgoingEmail[] = [];
  for (const r of pending) {
    const rendered = isDeliverableEmail(r.email) ? renderEmail(r, siteUrl) : null;
    if (!rendered) {
      outcomes.set(r.id, { ...outcomes.get(r.id), email_status: "skipped", email_error: "undeliverable_address_or_kind" });
      continue;
    }
    outgoing.push({ id: r.id, to: r.email!, ...rendered });
  }

  const from = `Pelikat <${Deno.env.get("FROM_EMAIL") || "notifications@pelikat.com"}>`;
  const transport: EmailTransport = {
    // fetch + timeout + body read stay at the call site; _shared/dispatch.ts
    // holds only the pure batch/retry logic.
    async post(url, body) {
      const res = await resendPost(url, key, body);
      return { status: res.status, text: res.ok ? "" : (await res.text().catch(() => "")).slice(0, 300) };
    },
  };
  const results = await deliverEmails(outgoing, from, transport);
  for (const r of pending) {
    const result = results.get(r.id);
    if (!result) continue;
    if (result.ok) {
      outcomes.set(r.id, { ...outcomes.get(r.id), email_status: "sent", email_error: null });
    } else {
      const f = result.retriable ? failure(r, result.error) : { status: "failed" as const, error: result.error };
      outcomes.set(r.id, { ...outcomes.get(r.id), email_status: f.status, email_error: f.error });
    }
  }
}

// ── push ─────────────────────────────────────────────────────────

interface SubscriptionRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

function vapidConfig(): VapidConfig | null {
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject: Deno.env.get("VAPID_SUBJECT") || "mailto:notifications@pelikat.com" };
}

async function deliverPushes(sb: SupabaseClient, rows: NotificationRow[], outcomes: Map<string, Outcome>) {
  const pending = rows.filter((r) => r.push_status === "pending");
  if (pending.length === 0) return;

  const vapid = vapidConfig();
  const userIds = [...new Set(pending.map((r) => r.user_id).filter((id): id is string => !!id))];
  if (!vapid || userIds.length === 0) {
    for (const r of pending) {
      outcomes.set(r.id, { ...outcomes.get(r.id), push_status: "skipped", push_error: vapid ? "no_account" : "push_disabled" });
    }
    return;
  }

  const { data: subs, error } = await sb
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth")
    .in("user_id", userIds);
  if (error) {
    for (const r of pending) {
      const f = failure(r, `subscriptions lookup: ${error.message}`);
      outcomes.set(r.id, { ...outcomes.get(r.id), push_status: f.status, push_error: f.error });
    }
    return;
  }

  const byUser = new Map<string, SubscriptionRow[]>();
  for (const s of (subs ?? []) as SubscriptionRow[]) {
    if (!isAllowedPushEndpoint(s.endpoint)) continue;
    byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s]);
  }

  const gone = new Set<string>();
  const used = new Set<string>();

  await Promise.all(
    pending.map(async (r) => {
      const devices = r.user_id ? byUser.get(r.user_id) ?? [] : [];
      if (devices.length === 0) {
        outcomes.set(r.id, { ...outcomes.get(r.id), push_status: "no_device", push_error: null });
        return;
      }
      const payload = buildPushPayload(r);
      const results = await Promise.all(
        devices.map(async (s) => {
          try {
            const res = await sendPush(s, payload, vapid, { timeoutMs: PUSH_TIMEOUT_MS });
            if (res.ok) used.add(s.id);
            else if (res.gone) gone.add(s.id);
            return res;
          } catch (err) {
            return { ok: false as const, gone: false, status: 0, error: String(err) };
          }
        }),
      );
      if (results.some((x) => x.ok)) {
        outcomes.set(r.id, { ...outcomes.get(r.id), push_status: "sent", push_error: null });
      } else if (results.every((x) => !x.ok && x.gone)) {
        outcomes.set(r.id, { ...outcomes.get(r.id), push_status: "no_device", push_error: "subscriptions expired" });
      } else {
        const firstError = results.find((x) => !x.ok && !x.gone);
        const f = failure(r, firstError && !firstError.ok ? `${firstError.status} ${firstError.error}` : "push failed");
        outcomes.set(r.id, { ...outcomes.get(r.id), push_status: f.status, push_error: f.error });
      }
    }),
  );

  if (gone.size > 0) await sb.from("push_subscriptions").delete().in("id", [...gone]);
  if (used.size > 0) {
    await sb.from("push_subscriptions").update({ last_used_at: new Date().toISOString() }).in("id", [...used]);
  }
}

// ── run ──────────────────────────────────────────────────────────

async function processBatch(sb: SupabaseClient, rows: NotificationRow[], siteUrl: string) {
  const outcomes = new Map<string, Outcome>();
  await Promise.all([dispatchEmails(rows, outcomes, siteUrl), deliverPushes(sb, rows, outcomes)]);

  const tally = { email_sent: 0, email_failed: 0, push_sent: 0, push_no_device: 0, retry: 0 };
  await Promise.all(
    rows.map(async (r) => {
      const o = outcomes.get(r.id) ?? {};
      const stillPending = o.email_status === "pending" || o.push_status === "pending";
      if (o.email_status === "sent") tally.email_sent++;
      if (o.email_status === "failed") tally.email_failed++;
      if (o.push_status === "sent") tally.push_sent++;
      if (o.push_status === "no_device") tally.push_no_device++;
      if (stillPending) tally.retry++;
      // Done rows release the lease; rows still pending keep it as backoff.
      const { error } = await sb
        .from("notifications")
        .update(stillPending ? o : { ...o, claimed_at: null })
        .eq("id", r.id);
      if (error) console.error("dispatch-notifications: outcome write failed", r.id, error.message);
    }),
  );
  return tally;
}

async function dispatch() {
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const siteUrl = Deno.env.get("SITE_URL") || "https://pelikat.com";
  const started = Date.now();
  let claimed = 0;
  let lastBatchSize: number | null = null;

  while (shouldClaimNextBatch({ lastBatchSize, elapsedMs: Date.now() - started, budgetMs: RUN_BUDGET_MS, claimSize: CLAIM_SIZE })) {
    const { data, error } = await sb.rpc("claim_notification_jobs", { p_limit: CLAIM_SIZE });
    if (error) {
      console.error("dispatch-notifications: claim failed", error.message);
      break;
    }
    const rows = (data ?? []) as NotificationRow[];
    if (rows.length === 0) break;
    claimed += rows.length;
    lastBatchSize = rows.length;
    const tally = await processBatch(sb, rows, siteUrl);
    console.log("dispatch-notifications batch", { claimed: rows.length, ...tally });
  }
  return claimed;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const secret = Deno.env.get("NOTIFY_DISPATCH_SECRET");
  if (!secret || !safeEqual(req.headers.get("x-dispatch-secret") ?? "", secret)) {
    return json({ error: "Unauthorized" }, 401);
  }

  const work = dispatch().catch((err) => {
    console.error("dispatch-notifications error:", err);
    return 0;
  });

  // Answer pg_net straight away; finish sending in the background.
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime) {
    EdgeRuntime.waitUntil(work);
    return json({ accepted: true }, 202);
  }
  return json({ claimed: await work });
});
