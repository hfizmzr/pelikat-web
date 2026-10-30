// supabase/functions/_shared/webpush.ts
//
// Web Push (FR-31) on plain WebCrypto, so the same code runs in the Deno
// edge runtime and in Node (vitest) with no npm/jsr dependency:
//   - payload encryption: RFC 8291 (aes128gcm content coding, RFC 8188)
//   - sender auth:        RFC 8292 VAPID (ES256 JWT)
// This is what iOS 16.4+ (web.push.apple.com), Chrome/Android (FCM),
// Firefox and Edge all accept.

export interface PushSubscriptionKeys {
  endpoint: string
  p256dh: string // base64url, 65-byte uncompressed P-256 point
  auth: string // base64url, 16-byte auth secret
}

export interface VapidConfig {
  publicKey: string // base64url, 65-byte uncompressed P-256 point
  privateKey: string // base64url, 32-byte private scalar
  subject: string // mailto: or https: contact
}

export interface PushRequest {
  endpoint: string
  headers: Record<string, string>
  body: Uint8Array
}

const enc = new TextEncoder()
// Apple rejects payloads above 4096 bytes; leave room for the 86-byte
// header, the padding delimiter and the 16-byte GCM tag.
export const MAX_PAYLOAD_BYTES = 3900

export function b64urlEncode(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function b64urlDecode(value: string): Uint8Array {
  const b64 = value.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '')
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let offset = 0
  for (const p of parts) {
    out.set(p, offset)
    offset += p.length
  }
  return out
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8)
  return new Uint8Array(bits)
}

/** RFC 8291 §3.4 + RFC 8188: encrypt one record for the subscription. */
export async function encryptPayload(
  sub: Pick<PushSubscriptionKeys, 'p256dh' | 'auth'>,
  payload: Uint8Array,
  // injectable for tests only
  opts: { salt?: Uint8Array; senderKeys?: CryptoKeyPair } = {},
): Promise<Uint8Array> {
  if (payload.length > MAX_PAYLOAD_BYTES) throw new Error('Push payload too large')

  const uaPublic = b64urlDecode(sub.p256dh)
  const authSecret = b64urlDecode(sub.auth)
  if (uaPublic.length !== 65 || uaPublic[0] !== 4) throw new Error('Invalid p256dh key')
  if (authSecret.length !== 16) throw new Error('Invalid auth secret')

  const senderKeys =
    opts.senderKeys ??
    ((await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair)
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', senderKeys.publicKey))
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, senderKeys.privateKey, 256),
  )

  const keyInfo = concat(enc.encode('WebPush: info\0'), uaPublic, asPublic)
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32)

  const salt = opts.salt ?? crypto.getRandomValues(new Uint8Array(16))
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12)

  // single record: payload followed by the 0x02 last-record delimiter
  const plaintext = concat(payload, new Uint8Array([2]))
  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, plaintext))

  // header: salt(16) | rs(4, big-endian) | idlen(1) | keyid = sender public key
  const header = new Uint8Array(16 + 4 + 1 + asPublic.length)
  header.set(salt, 0)
  new DataView(header.buffer).setUint32(16, 4096)
  header[20] = asPublic.length
  header.set(asPublic, 21)

  return concat(header, ciphertext)
}

async function importVapidPrivateKey(vapid: VapidConfig): Promise<CryptoKey> {
  const pub = b64urlDecode(vapid.publicKey)
  if (pub.length !== 65 || pub[0] !== 4) throw new Error('Invalid VAPID public key')
  return crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      x: b64urlEncode(pub.slice(1, 33)),
      y: b64urlEncode(pub.slice(33, 65)),
      d: vapid.privateKey.replace(/=+$/, ''),
      ext: true,
    },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )
}

/** RFC 8292 `Authorization: vapid t=<jwt>, k=<public key>` header value. */
export async function vapidAuthorization(
  endpoint: string,
  vapid: VapidConfig,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<string> {
  const header = b64urlEncode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claims = b64urlEncode(
    enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: nowSeconds + 12 * 3600, sub: vapid.subject })),
  )
  const signingInput = `${header}.${claims}`
  const key = await importVapidPrivateKey(vapid)
  // WebCrypto ECDSA already returns the raw r||s (P1363) form JWS wants.
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(signingInput)),
  )
  return `vapid t=${signingInput}.${b64urlEncode(signature)}, k=${vapid.publicKey.replace(/=+$/, '')}`
}

export async function buildPushRequest(
  sub: PushSubscriptionKeys,
  payload: string,
  vapid: VapidConfig,
  options: { ttlSeconds?: number; urgency?: 'very-low' | 'low' | 'normal' | 'high'; topic?: string } = {},
): Promise<PushRequest> {
  const body = await encryptPayload(sub, enc.encode(payload))
  const headers: Record<string, string> = {
    Authorization: await vapidAuthorization(sub.endpoint, vapid),
    'Content-Encoding': 'aes128gcm',
    'Content-Type': 'application/octet-stream',
    TTL: String(options.ttlSeconds ?? 24 * 3600),
    Urgency: options.urgency ?? 'normal',
  }
  // Topic replaces an undelivered message with the same topic (≤32 url-safe chars)
  if (options.topic) headers.Topic = options.topic.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32)
  return { endpoint: sub.endpoint, headers, body }
}

export type PushResult = { ok: true } | { ok: false; gone: boolean; status: number; error: string }

export async function sendPush(
  sub: PushSubscriptionKeys,
  payload: string,
  vapid: VapidConfig,
  options: Parameters<typeof buildPushRequest>[3] & { timeoutMs?: number } = {},
): Promise<PushResult> {
  const { timeoutMs = 10_000, ...requestOptions } = options
  const req = await buildPushRequest(sub, payload, vapid, requestOptions)
  // throws on timeout; the dispatcher records it as a retriable failure
  const res = await fetch(req.endpoint, {
    method: 'POST',
    headers: req.headers,
    body: req.body,
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (res.ok) return { ok: true }
  const text = (await res.text().catch(() => '')).slice(0, 300)
  // 404/410: the browser dropped the subscription — delete it
  return { ok: false, gone: res.status === 404 || res.status === 410, status: res.status, error: text || res.statusText }
}

/** Only POST to real browser push services (the DB enforces the same list). */
export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    return false
  }
  if (url.protocol !== 'https:') return false
  const host = url.hostname
  return (
    host === 'fcm.googleapis.com' ||
    host === 'updates.push.services.mozilla.com' ||
    host === 'web.push.apple.com' ||
    host.endsWith('.notify.windows.com')
  )
}
