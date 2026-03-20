/**
 * Ghost – Connection Manager
 *
 * Orchestrates:
 *   1. Heartbeat — 15s ping, marks peer offline after 2 misses
 *   2. Retry loop — flushes MessageQueue every 5s, sends due messages
 *   3. Wakeup ping — on app open, tries to reconnect all contacts
 *   4. Reconnection — generates fresh offers, tries stored ICE addresses
 *   5. Dedup — never delivers the same message ID twice
 *
 * Reconnection strategy (in order of preference):
 *   A. Peer still connected → send directly (data channel open)
 *   B. Same WiFi (mDNS stub) → will auto-discover and connect
 *   C. Stored ICE addresses → attempt direct WebRTC to last known IPs
 *   D. Fresh offer queued → waits for peer's wakeup to pick it up
 */
import {AppState} from 'react-native';
import {EventEmitter} from 'events';
import rtcManager from './WebRTCManager';
import {enqueue, ack, markAttempted, getDue, hasAcked} from './MessageQueue';
import {saveAddresses, getAddresses, touchSeen, getAllPeerIds} from './AddressBook';

// How often the retry loop ticks
const RETRY_INTERVAL_MS  = 5_000;
// How often we send a heartbeat ping to connected peers
const HEARTBEAT_MS       = 15_000;
// Miss this many heartbeats → declare offline
const HEARTBEAT_MAX_MISS = 2;

class ConnectionManager extends EventEmitter {
  constructor() {
    super();
    this._retryTimer     = null;
    this._heartbeatTimer = null;
    this._missedBeats    = new Map(); // peerId → missed count
    this._appStateSub    = null;
    this._knownPeers     = new Set(); // all peer IDs we have contacts for
  }

  // ── Boot ────────────────────────────────────────────────────────

  start(contactPeerIds = []) {
    contactPeerIds.forEach(id => this._knownPeers.add(id));

    // Wire WebRTC events
    rtcManager.on('connected',    peerId => this._onConnected(peerId));
    rtcManager.on('disconnected', peerId => this._onDisconnected(peerId));
    rtcManager.on('message',      msg    => this._onMessage(msg));

    // Retry loop — runs every 5s, flushes due queue entries
    this._retryTimer = setInterval(() => this._flushDueMessages(), RETRY_INTERVAL_MS);

    // Heartbeat loop
    this._heartbeatTimer = setInterval(() => this._sendHeartbeats(), HEARTBEAT_MS);

    // App state — wakeup ping when app comes to foreground
    this._appStateSub = AppState.addEventListener('change', state => {
      if (state === 'active') this._wakeupPing();
    });

    // Initial wakeup on first start
    setTimeout(() => this._wakeupPing(), 2000);
  }

  stop() {
    clearInterval(this._retryTimer);
    clearInterval(this._heartbeatTimer);
    this._appStateSub?.remove();
  }

  addKnownPeer(peerId) {
    this._knownPeers.add(peerId);
  }

  // ── Send a message (with queue fallback) ───────────────────────

  async send(toPeerId, payload) {
    const {id} = payload;

    // Already ACKed (duplicate send guard)
    if (hasAcked(id)) return 'already_delivered';

    // Always enqueue first — guarantees persistence
    enqueue(id, toPeerId, payload);

    // Try immediately if connected
    if (rtcManager.isConnected(toPeerId)) {
      const sent = rtcManager.send(toPeerId, payload);
      if (sent) {
        markAttempted(id);
        return 'sent';
      }
    }

    return 'queued';
  }

  confirmAck(messageId) {
    ack(messageId);
    this.emit('ack', messageId);
  }

  // ── Wakeup ping ─────────────────────────────────────────────────
  // Called on: app foreground, app start.
  // For every known contact that isn't currently connected, try to reconnect.

  async _wakeupPing() {
    const peerIds = [...this._knownPeers, ...getAllPeerIds()];
    const unique  = [...new Set(peerIds)];

    for (const peerId of unique) {
      if (rtcManager.isConnected(peerId)) {
        // Already connected — just send any pending messages
        this._flushPeer(peerId);
        continue;
      }
      // Attempt reconnection (non-blocking)
      this._reconnect(peerId).catch(() => {});
    }
  }

  // ── Reconnection ────────────────────────────────────────────────
  // Strategy A: Try stored ICE addresses directly
  // Strategy B: Queue a fresh offer and wait for peer wakeup

  async _reconnect(peerId) {
    const addrInfo = getAddresses(peerId);

    if (addrInfo?.iceAddresses?.length) {
      for (const addr of addrInfo.iceAddresses) {
        try {
          await this._tryDirectConnect(peerId, addr, addrInfo.boxPublicKey);
          return; // Connected
        } catch (_) {}
      }
    }

    // No stored addresses or all failed — emit event so UI can prompt re-handshake
    this.emit('reconnect:needOffer', {peerId, addrInfo});
  }

  async _tryDirectConnect(peerId, addr, boxPublicKey) {
    // Attempt a fresh WebRTC offer targeting the stored IP.
    // If the peer is actually reachable at that address they'll respond.
    // Timeout after 10s.
    return new Promise(async (resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), 10_000);

      const cleanup = () => clearTimeout(timer);

      rtcManager.once('connected', id => {
        if (id === peerId) { cleanup(); resolve(); }
      });

      try {
        // Create a targeted offer with the hint address
        await rtcManager.createOffer(peerId, {hintAddress: addr, boxPublicKey});
      } catch (e) {
        cleanup();
        reject(e);
      }
    });
  }

  // ── Flush due messages for a specific peer ─────────────────────

  _flushPeer(peerId) {
    if (!rtcManager.isConnected(peerId)) return;
    const due = getDue(peerId);
    for (const entry of due) {
      const sent = rtcManager.send(peerId, entry.payload);
      if (sent) markAttempted(entry.id);
    }
  }

  // ── Flush ALL due messages (retry loop tick) ───────────────────

  _flushDueMessages() {
    const due = getDue(); // all peers, all due entries
    if (!due.length) return;

    // Group by peer
    const byPeer = {};
    for (const entry of due) {
      (byPeer[entry.toPeerId] = byPeer[entry.toPeerId] ?? []).push(entry);
    }

    for (const [peerId, entries] of Object.entries(byPeer)) {
      if (!rtcManager.isConnected(peerId)) {
        // Not connected — kick off a reconnect attempt
        this._reconnect(peerId).catch(() => {});
        continue;
      }
      for (const entry of entries) {
        const sent = rtcManager.send(peerId, entry.payload);
        if (sent) markAttempted(entry.id);
      }
    }
  }

  // ── Heartbeat ───────────────────────────────────────────────────

  _sendHeartbeats() {
    for (const peerId of this._knownPeers) {
      if (!rtcManager.isConnected(peerId)) continue;

      const sent = rtcManager.send(peerId, {
        type: 'heartbeat',
        id:   `hb_${Date.now()}`,
        ts:   Date.now(),
      });

      if (!sent) {
        // Channel open but send failed — count as a miss
        this._recordMiss(peerId);
      } else {
        this._missedBeats.set(peerId, 0);
      }
    }
  }

  _recordMiss(peerId) {
    const misses = (this._missedBeats.get(peerId) ?? 0) + 1;
    this._missedBeats.set(peerId, misses);
    if (misses >= HEARTBEAT_MAX_MISS) {
      rtcManager.emit('disconnected', peerId); // treat as disconnected
      this._missedBeats.set(peerId, 0);
    }
  }

  // ── WebRTC event handlers ───────────────────────────────────────

  _onConnected(peerId) {
    this._missedBeats.set(peerId, 0);
    touchSeen(peerId);
    this.emit('peer:online', peerId);

    // Flush any messages waiting for this peer
    // Small delay to let data channel fully stabilise
    setTimeout(() => this._flushPeer(peerId), 300);
  }

  _onDisconnected(peerId) {
    this.emit('peer:offline', peerId);
  }

  _onMessage({peerId, type, id: msgId, ts}) {
    if (type === 'heartbeat') {
      // Peer is alive — update address book and reset miss counter
      touchSeen(peerId);
      this._missedBeats.set(peerId, 0);
      // Pong back so the other side also knows we're alive
      rtcManager.send(peerId, {type: 'heartbeat_ack', id: `hba_${Date.now()}`, ts: Date.now()});
      return;
    }

    if (type === 'heartbeat_ack') {
      touchSeen(peerId);
      this._missedBeats.set(peerId, 0);
      return;
    }

    if (type === 'ack' && msgId) {
      this.confirmAck(msgId);
      return;
    }

    // Any other message means peer is alive
    touchSeen(peerId);
  }
}

export const connManager = new ConnectionManager();
export default connManager;
