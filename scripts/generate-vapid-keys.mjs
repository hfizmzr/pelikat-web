// Generates a VAPID key pair for Web Push (FR-31).
//   node scripts/generate-vapid-keys.mjs
// Public key  → NEXT_PUBLIC_VAPID_PUBLIC_KEY (web env) and VAPID_PUBLIC_KEY (edge secret)
// Private key → VAPID_PRIVATE_KEY (edge secret only — never ship it to the browser)
import { createECDH } from 'node:crypto'

const ecdh = createECDH('prime256v1')
ecdh.generateKeys()

console.log(`VAPID_PUBLIC_KEY=${ecdh.getPublicKey().toString('base64url')}`)
console.log(`VAPID_PRIVATE_KEY=${ecdh.getPrivateKey().toString('base64url')}`)
