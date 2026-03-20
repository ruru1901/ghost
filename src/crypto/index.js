/**
 * Ghost – Crypto (tweetnacl, pure JS, zero native deps)
 * Ed25519 identity + X25519 DH + XSalsa20-Poly1305 encryption
 */
import nacl from 'tweetnacl';
import {encodeBase64, decodeBase64, encodeUTF8, decodeUTF8} from 'tweetnacl-util';
import EncryptedStorage from 'react-native-encrypted-storage';

// ── Identity ─────────────────────────────────────────────────────

export async function loadOrCreateIdentity() {
  try {
    const raw = await EncryptedStorage.getItem('ghost_identity');
    if (raw) return JSON.parse(raw);
  } catch (_) {}

  // Generate permanent keypairs
  const signPair = nacl.sign.keyPair();            // Ed25519
  const boxPair  = nacl.box.keyPair();             // X25519

  const identity = {
    // Signing (Ed25519) — public key used as PeerID
    signPublicKey:  encodeBase64(signPair.publicKey),
    signSecretKey:  encodeBase64(signPair.secretKey),
    // Encryption (X25519) — for DH key exchange
    boxPublicKey:   encodeBase64(boxPair.publicKey),
    boxSecretKey:   encodeBase64(boxPair.secretKey),
    // Short peer ID derived from public key
    peerId: encodeBase64(signPair.publicKey).slice(0, 32).replace(/[+/=]/g, 'X'),
    createdAt: Date.now(),
  };

  await EncryptedStorage.setItem('ghost_identity', JSON.stringify(identity));
  return identity;
}

export async function getIdentity() {
  const raw = await EncryptedStorage.getItem('ghost_identity');
  if (!raw) throw new Error('Identity not found');
  return JSON.parse(raw);
}

// ── Key Exchange ──────────────────────────────────────────────────

/**
 * Derive a 32-byte shared secret from our X25519 secret key
 * and peer's X25519 public key.
 */
export function deriveSharedSecret(ourBoxSecretKeyB64, theirBoxPublicKeyB64) {
  const ourSK    = decodeBase64(ourBoxSecretKeyB64);
  const theirPK  = decodeBase64(theirBoxPublicKeyB64);
  const shared   = nacl.scalarMult(ourSK, theirPK);
  // Hash shared secret for domain separation
  return nacl.hash(shared).slice(0, 32);
}

// ── Message Encryption ────────────────────────────────────────────

export function encryptMessage(plaintext, sharedKey) {
  const nonce      = nacl.randomBytes(nacl.box.nonceLength);
  const msgBytes   = encodeUTF8(typeof plaintext === 'string' ? plaintext : JSON.stringify(plaintext));
  const ciphertext = nacl.secretbox(msgBytes, nonce, sharedKey);
  return {
    nonce: encodeBase64(nonce),
    ct:    encodeBase64(ciphertext),
  };
}

export function decryptMessage(nonceB64, ctB64, sharedKey) {
  const nonce      = decodeBase64(nonceB64);
  const ciphertext = decodeBase64(ctB64);
  const plain      = nacl.secretbox.open(ciphertext, nonce, sharedKey);
  if (!plain) throw new Error('Decryption failed — message tampered or wrong key');
  return decodeUTF8(plain);
}

// ── File Encryption ───────────────────────────────────────────────

export function encryptBlob(uint8Array) {
  const key        = nacl.randomBytes(32);
  const nonce      = nacl.randomBytes(nacl.secretbox.nonceLength);
  const ciphertext = nacl.secretbox(uint8Array, nonce, key);
  return {
    key:   encodeBase64(key),
    nonce: encodeBase64(nonce),
    ct:    encodeBase64(ciphertext),
  };
}

export function decryptBlob(keyB64, nonceB64, ctB64) {
  const key  = decodeBase64(keyB64);
  const n    = decodeBase64(nonceB64);
  const ct   = decodeBase64(ctB64);
  const data = nacl.secretbox.open(ct, n, key);
  if (!data) throw new Error('Blob decryption failed');
  return data;
}

// ── Signing ───────────────────────────────────────────────────────

export function sign(message, secretKeyB64) {
  const sk  = decodeBase64(secretKeyB64);
  const msg = typeof message === 'string' ? encodeUTF8(message) : message;
  return encodeBase64(nacl.sign.detached(msg, sk));
}

export function verify(message, sigB64, publicKeyB64) {
  const pk  = decodeBase64(publicKeyB64);
  const sig = decodeBase64(sigB64);
  const msg = typeof message === 'string' ? encodeUTF8(message) : message;
  return nacl.sign.detached.verify(msg, sig, pk);
}

// ── Backup password (daily rotating, dual-key) ────────────────────

export async function getMyBackupHalf() {
  const identity = await getIdentity();
  const today    = new Date().toISOString().slice(0, 10);
  const input    = encodeUTF8(identity.signSecretKey + today);
  const hash     = nacl.hash(input);
  return Array.from(hash.slice(0, 3))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

export function combineBackupPassword(halfA, halfB) {
  return (halfA + halfB).toUpperCase();
}

// ── Session watermark ─────────────────────────────────────────────

export function deriveWatermark(sessionId, peerId) {
  const input = encodeUTF8(sessionId + peerId);
  const hash  = nacl.hash(input);
  return Array.from(hash.slice(0, 4))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}
