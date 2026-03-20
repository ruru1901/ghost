/**
 * Ghost – Peer Address Book
 *
 * Stores every peer's last known connection info so we can
 * attempt reconnection without a full QR re-exchange.
 *
 * Per peer we store:
 *   - lastOffer / lastAnswer SDP  (most recent session)
 *   - iceAddresses               (all ICE candidates from last session)
 *   - lastSeenAt                 (epoch ms)
 *   - boxPublicKey               (for key re-derivation)
 *
 * On reconnect we try each stored ICE address directly before
 * falling back to a fresh offer/answer cycle.
 */
import {MMKV} from 'react-native-mmkv';

const store = new MMKV({id: 'ghost_addrbook'});

export function saveAddresses(peerId, info) {
  // info: { iceAddresses, boxPublicKey, lastSeenAt }
  const existing = getAddresses(peerId) ?? {};
  store.set(peerId, JSON.stringify({
    ...existing,
    ...info,
    lastSeenAt: Date.now(),
  }));
}

export function getAddresses(peerId) {
  const raw = store.getString(peerId);
  return raw ? JSON.parse(raw) : null;
}

export function touchSeen(peerId) {
  const existing = getAddresses(peerId);
  if (existing) {
    existing.lastSeenAt = Date.now();
    store.set(peerId, JSON.stringify(existing));
  }
}

export function getAllPeerIds() {
  return store.getAllKeys();
}

export function getOfflinePeers(thresholdMs = 60_000) {
  const cutoff = Date.now() - thresholdMs;
  return getAllPeerIds().filter(id => {
    const info = getAddresses(id);
    return info && info.lastSeenAt < cutoff;
  });
}
