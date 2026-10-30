// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  b64urlDecode,
  b64urlEncode,
  buildPushRequest,
  encryptPayload,
  isAllowedPushEndpoint,
  vapidAuthorization,
} from '../../supabase/functions/_shared/webpush'

const enc = new TextEncoder()
const dec = new TextDecoder()

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8))
}

/** Browser-side RFC 8291 decryption, written independently of the sender code. */
async function decrypt(body: Uint8Array, receiver: CryptoKeyPair, authSecret: Uint8Array): Promise<string> {
  const salt = body.slice(0, 16)
  const rs = new DataView(body.buffer, body.byteOffset).getUint32(16)
  const idlen = body[20]
  const senderPublic = body.slice(21, 21 + idlen)
  const ciphertext = body.slice(21 + idlen)
  expect(rs).toBe(4096)

  const uaPublic = new Uint8Array(await crypto.subtle.exportKey('raw', receiver.publicKey))
  const senderKey = await crypto.subtle.importKey('raw', senderPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: senderKey }, receiver.privateKey, 256))
  const info = new Uint8Array([...enc.encode('WebPush: info\0'), ...uaPublic, ...senderPublic])
  const ikm = await hkdf(authSecret, shared, info, 32)
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12)
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt'])
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, ciphertext))
  expect(plain[plain.length - 1]).toBe(2) // last-record delimiter
  return dec.decode(plain.slice(0, -1))
}

async function browserSubscription() {
  const receiver = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair
  const authSecret = crypto.getRandomValues(new Uint8Array(16))
  const p256dh = b64urlEncode(new Uint8Array(await crypto.subtle.exportKey('raw', receiver.publicKey)))
  return {
    receiver,
    authSecret,
    sub: { endpoint: 'https://fcm.googleapis.com/fcm/send/abc123', p256dh, auth: b64urlEncode(authSecret) },
  }
}

async function vapidKeys() {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey)
  const publicKey = b64urlEncode(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)))
  return { pair, config: { publicKey, privateKey: jwk.d!, subject: 'mailto:ops@pelikat.test' } }
}

describe('web push encryption (RFC 8291)', () => {
  it('round-trips through an independent receiver-side decrypt', async () => {
    const { receiver, authSecret, sub } = await browserSubscription()
    const message = JSON.stringify({ title: 'Results are out ✓', body: 'You placed #3' })
    const body = await encryptPayload(sub, enc.encode(message))
    expect(await decrypt(body, receiver, authSecret)).toBe(message)
  })

  it('uses a fresh salt and sender key per message', async () => {
    const { sub } = await browserSubscription()
    const a = await encryptPayload(sub, enc.encode('same'))
    const b = await encryptPayload(sub, enc.encode('same'))
    expect(b64urlEncode(a.slice(0, 86))).not.toBe(b64urlEncode(b.slice(0, 86)))
  })

  it('rejects oversized payloads and malformed keys', async () => {
    const { sub } = await browserSubscription()
    await expect(encryptPayload(sub, new Uint8Array(4000))).rejects.toThrow('too large')
    await expect(encryptPayload({ ...sub, p256dh: b64urlEncode(new Uint8Array(10)) }, enc.encode('x'))).rejects.toThrow(
      'p256dh'
    )
    await expect(encryptPayload({ ...sub, auth: b64urlEncode(new Uint8Array(8)) }, enc.encode('x'))).rejects.toThrow('auth')
  })
})

describe('VAPID (RFC 8292)', () => {
  it('signs an ES256 JWT for the push service origin', async () => {
    const { pair, config } = await vapidKeys()
    const header = await vapidAuthorization('https://web.push.apple.com/QGx1/abc', config, 1_800_000_000)
    const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header)
    expect(m).not.toBeNull()
    const [, h, c, sig, k] = m!
    expect(k).toBe(config.publicKey)
    expect(JSON.parse(dec.decode(b64urlDecode(h)))).toEqual({ typ: 'JWT', alg: 'ES256' })
    expect(JSON.parse(dec.decode(b64urlDecode(c)))).toEqual({
      aud: 'https://web.push.apple.com',
      exp: 1_800_000_000 + 12 * 3600,
      sub: 'mailto:ops@pelikat.test',
    })
    const valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      pair.publicKey,
      b64urlDecode(sig),
      enc.encode(`${h}.${c}`)
    )
    expect(valid).toBe(true)
  })

  it('builds the full request with aes128gcm headers', async () => {
    const { config } = await vapidKeys()
    const { sub } = await browserSubscription()
    const req = await buildPushRequest(sub, '{"title":"x"}', config)
    expect(req.endpoint).toBe(sub.endpoint)
    expect(req.headers['Content-Encoding']).toBe('aes128gcm')
    expect(req.headers.TTL).toBe('86400')
    expect(req.headers.Authorization).toMatch(/^vapid t=/)
  })
})

describe('push endpoint allowlist', () => {
  it.each([
    ['https://fcm.googleapis.com/fcm/send/x', true],
    ['https://web.push.apple.com/abc', true],
    ['https://updates.push.services.mozilla.com/wpush/v2/x', true],
    ['https://wns2-par02p.notify.windows.com/w/?token=x', true],
    ['http://fcm.googleapis.com/fcm/send/x', false],
    ['https://fcm.googleapis.com.evil.com/x', false],
    ['https://169.254.169.254/latest', false],
    ['not a url', false],
  ])('%s → %s', (endpoint, allowed) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(allowed)
  })
})
