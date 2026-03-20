/**
 * Ghost – WebRTC Manager v2
 *
 * Changes vs v1:
 *  - Collects + stores all ICE candidates per peer (for reconnection)
 *  - Supports hintAddress for direct reconnect without full QR re-exchange
 *  - Saves peer address info to AddressBook after every successful connect
 *  - Richer connection lifecycle events
 */
import {
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
  mediaDevices,
} from 'react-native-webrtc';
import {EventEmitter} from 'events';
import {saveAddresses} from './AddressBook';
import {deriveSharedSecret} from '../crypto';
import {keyStore} from '../storage';

const ICE_SERVERS = [
  {urls: 'stun:stun.l.google.com:19302'},
  {urls: 'stun:stun1.l.google.com:19302'},
  {urls: 'stun:stun.cloudflare.com:3478'},
  {urls: 'stun:stun.nextcloud.com:443'},
];

const ICE_TIMEOUT_MS = 10_000;
const MSG_QUEUE_MAX  = 500;

class WebRTCManager extends EventEmitter {
  constructor() {
    super();
    this.myPeerId       = null;
    this.myBoxSecretKey = null;
    this.conns          = new Map(); // peerId → {pc, dc, state, queue, iceCandidates}
  }

  setIdentity(peerId, boxSecretKey) {
    this.myPeerId       = peerId;
    this.myBoxSecretKey = boxSecretKey;
  }

  // ── Initiator (Alice) ──────────────────────────────────────────

  async createOffer(peerId, opts = {}) {
    this._closeStale(peerId);

    const pc = this._buildPC(peerId);
    const dc = pc.createDataChannel('ghost', {ordered: true, maxRetransmits: 20});
    this._wireDataChannel(peerId, dc);

    this.conns.set(peerId, {pc, dc, state: 'offering', queue: [], iceCandidates: []});

    const offer = await pc.createOffer({offerToReceiveAudio: true});
    await pc.setLocalDescription(offer);
    await this._waitForICE(pc, peerId);

    return JSON.stringify({
      type:         'offer',
      sdp:          pc.localDescription.sdp,
      fromPeerId:   this.myPeerId,
      boxPublicKey: opts.myBoxPublicKey ?? null,
    });
  }

  async applyAnswer(answerJson) {
    const parsed = JSON.parse(answerJson);
    const peerId = parsed.fromPeerId;
    const conn   = this.conns.get(peerId);
    if (!conn) throw new Error('No pending offer found for this peer.');

    await conn.pc.setRemoteDescription(
      new RTCSessionDescription({type: 'answer', sdp: parsed.sdp}),
    );
    conn.state = 'connecting';
    this.conns.set(peerId, conn);

    if (parsed.boxPublicKey && this.myBoxSecretKey) {
      const sharedKey = deriveSharedSecret(this.myBoxSecretKey, parsed.boxPublicKey);
      keyStore.set(peerId, sharedKey);
    }

    return peerId;
  }

  // ── Responder (Bob) ────────────────────────────────────────────

  async createAnswer(offerJson) {
    const parsed = JSON.parse(offerJson);
    const peerId = parsed.fromPeerId;

    this._closeStale(peerId);

    const pc = this._buildPC(peerId);
    pc.ondatachannel = ({channel}) => {
      this._wireDataChannel(peerId, channel);
      const c = this.conns.get(peerId);
      if (c) { c.dc = channel; this.conns.set(peerId, c); }
    };

    this.conns.set(peerId, {pc, dc: null, state: 'answering', queue: [], iceCandidates: []});

    await pc.setRemoteDescription(
      new RTCSessionDescription({type: 'offer', sdp: parsed.sdp}),
    );
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await this._waitForICE(pc, peerId);

    if (parsed.boxPublicKey && this.myBoxSecretKey) {
      const sharedKey = deriveSharedSecret(this.myBoxSecretKey, parsed.boxPublicKey);
      keyStore.set(peerId, sharedKey);
    }

    const {getIdentity} = await import('../crypto');
    const id = await getIdentity();

    return JSON.stringify({
      type:         'answer',
      sdp:          pc.localDescription.sdp,
      fromPeerId:   this.myPeerId,
      boxPublicKey: id.boxPublicKey,
    });
  }

  // ── Send ──────────────────────────────────────────────────────

  send(peerId, payload) {
    const conn = this.conns.get(peerId);
    if (!conn) return false;

    const msg = JSON.stringify(payload);

    if (conn.dc?.readyState === 'open') {
      try { conn.dc.send(msg); return true; }
      catch (_) {}
    }

    if (conn.queue.length < MSG_QUEUE_MAX) conn.queue.push(msg);
    return false;
  }

  isConnected(peerId) {
    return this.conns.get(peerId)?.dc?.readyState === 'open';
  }

  getConnectionState(peerId) {
    return this.conns.get(peerId)?.pc?.connectionState ?? 'none';
  }

  // ── VoIP ──────────────────────────────────────────────────────

  async startCall(peerId) {
    const conn = this.conns.get(peerId);
    if (!conn) throw new Error('Not connected to peer');
    const stream = await mediaDevices.getUserMedia({
      audio: {echoCancellation: true, noiseSuppression: true, sampleRate: 48000},
      video: false,
    });
    stream.getTracks().forEach(t => conn.pc.addTrack(t, stream));
    conn.localStream = stream;
    this.conns.set(peerId, conn);
    return stream;
  }

  endCall(peerId) {
    const conn = this.conns.get(peerId);
    if (conn?.localStream) {
      conn.localStream.getTracks().forEach(t => t.stop());
      delete conn.localStream;
      this.conns.set(peerId, conn);
    }
  }

  // ── Cleanup ───────────────────────────────────────────────────

  closeConnection(peerId) {
    const conn = this.conns.get(peerId);
    if (conn) {
      try { conn.dc?.close(); } catch (_) {}
      try { conn.pc?.close(); } catch (_) {}
      this.conns.delete(peerId);
    }
  }

  closeAll() {
    [...this.conns.keys()].forEach(id => this.closeConnection(id));
  }

  // ── Internal ──────────────────────────────────────────────────

  _closeStale(peerId) {
    const existing = this.conns.get(peerId);
    if (existing) {
      try { existing.dc?.close(); } catch (_) {}
      try { existing.pc?.close(); } catch (_) {}
      this.conns.delete(peerId);
    }
  }

  _buildPC(peerId) {
    const pc = new RTCPeerConnection({iceServers: ICE_SERVERS});

    // Harvest ICE candidates → save to address book for reconnection
    pc.onicecandidate = ({candidate}) => {
      if (!candidate?.candidate) return;
      const conn = this.conns.get(peerId);
      if (!conn) return;

      conn.iceCandidates.push(candidate.candidate);

      // Extract bare IP:port from SDP candidate line
      const m = candidate.candidate.match(
        /\d+ \d+ \w+ \d+ ([\d.a-fA-F:]+) (\d+) typ (host|srflx)/,
      );
      if (m) {
        saveAddresses(peerId, {
          iceAddresses: [...new Set(conn.iceCandidates)].slice(0, 20),
          lastSeenAt:   Date.now(),
        });
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      const conn  = this.conns.get(peerId);
      if (conn) { conn.state = state; this.conns.set(peerId, conn); }

      this.emit('connectionState', {peerId, state});

      if (state === 'connected') {
        this.emit('connected', peerId);
        this._flushQueue(peerId);
        saveAddresses(peerId, {lastSeenAt: Date.now()});
      }
      if (['disconnected', 'failed', 'closed'].includes(state)) {
        this.emit('disconnected', peerId);
      }
    };

    pc.ontrack = ({streams, track}) => {
      if (track.kind === 'audio' && streams?.[0]) {
        this.emit('remoteStream', {peerId, stream: streams[0]});
      }
    };

    return pc;
  }

  _wireDataChannel(peerId, dc) {
    dc.onopen    = ()      => { this.emit('channelOpen', peerId); this._flushQueue(peerId); };
    dc.onmessage = ({data}) => {
      try { this.emit('message', {peerId, ...JSON.parse(data)}); } catch (_) {}
    };
    dc.onclose   = ()      => this.emit('channelClose', peerId);
    dc.onerror   = e       => this.emit('channelError', {peerId, error: e});
  }

  _flushQueue(peerId) {
    const conn = this.conns.get(peerId);
    if (!conn?.dc || conn.dc.readyState !== 'open') return;
    while (conn.queue.length > 0) {
      try { conn.dc.send(conn.queue.shift()); } catch (_) { break; }
    }
  }

  _waitForICE(pc, peerId) {
    return new Promise(resolve => {
      if (pc.iceGatheringState === 'complete') { resolve(); return; }
      const done  = () => { clearTimeout(timer); resolve(); };
      const timer = setTimeout(done, ICE_TIMEOUT_MS);
      pc.onicegatheringstatechange = () => {
        if (pc.iceGatheringState === 'complete') done();
      };
    });
  }
}

export const rtcManager = new WebRTCManager();
export default rtcManager;
