// supabase/functions/_shared/dispatch.ts
//
// Pure batch/retry logic for dispatch-notifications (EXT-5), extracted so
// vitest can exercise it in Node: no Deno-specific APIs live here — the
// HTTP transport (fetch, timeouts, body reads) and any env access are
// injected by the edge-function call site (see dispatch-notifications/index.ts).

// keep in sync with claim_notification_jobs
export const MAX_ATTEMPTS = 5;
export const RESEND_API = "https://api.resend.com/emails";
export const RESEND_BATCH_API = "https://api.resend.com/emails/batch";
export const RESEND_BATCH_SIZE = 100;
export const RESEND_SPACING_MS = 600; // Resend's default limit is 2 requests/second

export type SendResult = { ok: true } | { ok: false; retriable: boolean; error: string };

export interface EmailMessage {
  id: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}

/** One HTTP round-trip; the edge function wires this to fetch + timeout. */
export interface EmailTransport {
  post(url: string, body: unknown): Promise<{ status: number; text: string }>;
}

export function classifyStatus(status: number, detail: string): SendResult {
  if (status >= 200 && status < 300) return { ok: true };
  return { ok: false, retriable: status === 429 || status >= 500, error: `${status} ${detail}`.trim() };
}

// A failed attempt stays pending (the 5-minute lease is the backoff)
// until it runs out of attempts.
export function shouldMarkTerminal(attempts: number, maxAttempts: number = MAX_ATTEMPTS): boolean {
  return attempts >= maxAttempts;
}

export function computeRetryState(
  attempts: number,
  maxAttempts: number = MAX_ATTEMPTS,
): { canRetry: boolean; status: "pending" | "failed" } {
  const canRetry = !shouldMarkTerminal(attempts, maxAttempts);
  return { canRetry, status: canRetry ? "pending" : "failed" };
}

/** Slice the audience into batch-sized chunks ([] for an empty audience). */
export function chunkAudience<T>(list: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < list.length; i += size) chunks.push(list.slice(i, i + size));
  return chunks;
}

/**
 * Claim-loop decision for the run-budget guard: keep claiming full
 * batches while the 50s budget lasts, stop once a claim comes back
 * short (the queue is drained) or the budget is exhausted.
 */
export function shouldClaimNextBatch(input: {
  lastBatchSize: number | null; // null before the first claim
  elapsedMs: number;
  budgetMs: number;
  claimSize: number;
}): boolean {
  if (input.lastBatchSize !== null && input.lastBatchSize < input.claimSize) return false;
  return input.elapsedMs < input.budgetMs;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Batch delivery with injected transport. A 4xx rejects the whole Resend
 * batch (e.g. one bad address), so the batch is retried one by one so each
 * recipient gets its own outcome; a failed single send never drops the rest.
 */
export async function deliverEmails(
  messages: EmailMessage[],
  from: string,
  transport: EmailTransport,
  opts: { batchSize?: number; spacingMs?: number } = {},
): Promise<Map<string, SendResult>> {
  const batchSize = opts.batchSize ?? RESEND_BATCH_SIZE;
  const spacingMs = opts.spacingMs ?? RESEND_SPACING_MS;
  const results = new Map<string, SendResult>();
  const chunks = chunkAudience(messages, batchSize);
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (i > 0) await sleep(spacingMs);
    let batch: SendResult;
    try {
      const res = await transport.post(
        RESEND_BATCH_API,
        chunk.map(({ to, subject, html, text }) => ({ from, to, subject, html, text })),
      );
      batch = classifyStatus(res.status, res.text);
    } catch (err) {
      for (const e of chunk) results.set(e.id, { ok: false, retriable: true, error: String(err) });
      continue;
    }
    if (batch.ok || batch.retriable) {
      for (const e of chunk) results.set(e.id, batch);
      continue;
    }
    for (const e of chunk) {
      await sleep(spacingMs);
      try {
        const single = await transport.post(RESEND_API, { from, to: e.to, subject: e.subject, html: e.html, text: e.text });
        results.set(e.id, classifyStatus(single.status, single.text));
      } catch (err) {
        results.set(e.id, { ok: false, retriable: true, error: String(err) });
      }
    }
  }
  return results;
}
