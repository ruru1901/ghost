/**
 * Ghost – Persistent Message Queue
 *
 * Survives app restarts. Every outgoing message lives here until
 * it gets a confirmed ACK from the recipient.
 *
 * Retry schedule (exponential backoff, capped at 5 min):
 *   attempt 0 → immediate
 *   attempt 1 → 15s
 *   attempt 2 → 30s
 *   attempt 3 → 60s
 *   attempt 4 → 2 min
 *   attempt 5+ → 5 min
 */
import {MMKV} from 'react-native-mmkv';

const store = new MMKV({id: 'ghost_msgqueue'});

const RETRY_DELAYS_MS = [
  0,
  15_000,
  30_000,
  60_000,
  120_000,
  300_000, // 5 min — cap
];

function nextDelay(attempt) {
  const idx = Math.min(attempt, RETRY_DELAYS_MS.length - 1);
  return RETRY_DELAYS_MS[idx];
}

// ── Queue entry shape ────────────────────────────────────────────
// {
//   id:        string          — message ID (dedup key)
//   toPeerId:  string
//   payload:   object          — the encrypted {type,nonce,ct,...}
//   enqueuedAt: number
//   attempt:   number          — how many times we've tried
//   nextTryAt: number          — epoch ms when to try next
//   acked:     boolean
// }

function allIds() {
  const raw = store.getString('ids');
  return raw ? JSON.parse(raw) : [];
}

function saveIds(ids) {
  store.set('ids', JSON.stringify(ids));
}

// ── Public API ───────────────────────────────────────────────────

export function enqueue(id, toPeerId, payload) {
  // Idempotent — don't double-enqueue same message ID
  if (store.getString(`q:${id}`)) return;

  const entry = {
    id,
    toPeerId,
    payload,
    enqueuedAt: Date.now(),
    attempt:    0,
    nextTryAt:  Date.now(), // try immediately
    acked:      false,
  };

  store.set(`q:${id}`, JSON.stringify(entry));

  const ids = allIds();
  ids.push(id);
  saveIds(ids);
}

export function ack(id) {
  const raw = store.getString(`q:${id}`);
  if (!raw) return;
  const entry = JSON.parse(raw);
  entry.acked = true;
  store.set(`q:${id}`, JSON.stringify(entry));
  // Remove from active IDs list
  saveIds(allIds().filter(i => i !== id));
  // Keep tombstone for 24h to prevent re-delivery after reconnect
  setTimeout(() => store.delete(`q:${id}`), 86_400_000);
}

export function markAttempted(id) {
  const raw = store.getString(`q:${id}`);
  if (!raw) return;
  const entry = JSON.parse(raw);
  entry.attempt  += 1;
  entry.nextTryAt = Date.now() + nextDelay(entry.attempt);
  store.set(`q:${id}`, JSON.stringify(entry));
}

export function getDue(toPeerId = null) {
  const now = Date.now();
  return allIds()
    .map(id => {
      const raw = store.getString(`q:${id}`);
      return raw ? JSON.parse(raw) : null;
    })
    .filter(e =>
      e &&
      !e.acked &&
      e.nextTryAt <= now &&
      (toPeerId === null || e.toPeerId === toPeerId),
    );
}

export function getPending(toPeerId) {
  return allIds()
    .map(id => {
      const raw = store.getString(`q:${id}`);
      return raw ? JSON.parse(raw) : null;
    })
    .filter(e => e && !e.acked && e.toPeerId === toPeerId);
}

export function hasAcked(id) {
  const raw = store.getString(`q:${id}`);
  if (!raw) return true; // tombstone deleted = definitely acked long ago
  return JSON.parse(raw).acked === true;
}

export function queueSize() {
  return allIds().length;
}
