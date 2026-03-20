/**
 * Ghost – Storage Layer
 * MMKV for fast encrypted K/V (messages, contacts)
 * react-native-fs for encrypted binary blobs (media)
 */
import {MMKV} from 'react-native-mmkv';
import RNFS from 'react-native-fs';
import nacl from 'tweetnacl';
import {encodeUTF8, decodeUTF8, encodeBase64, decodeBase64} from 'tweetnacl-util';
import {encryptMessage, decryptMessage, encryptBlob, decryptBlob} from '../crypto';
import {v4 as uuid} from 'uuid';

// One MMKV instance per chat
const stores = new Map();
function store(peerId) {
  if (!stores.has(peerId)) {
    stores.set(peerId, new MMKV({id: `chat_${peerId}`, encryptionKey: peerId}));
  }
  return stores.get(peerId);
}

const contactStore = new MMKV({id: 'ghost_contacts'});
const MEDIA_DIR    = `${RNFS.DocumentDirectoryPath}/.ghost_media`;
const BACKUP_DIR   = `${RNFS.DocumentDirectoryPath}/ghost_backups`;

// ── Messages ──────────────────────────────────────────────────────

export async function saveMessage(peerId, msg, sharedKey) {
  const s   = store(peerId);
  const enc = encryptMessage(JSON.stringify(msg), sharedKey);
  s.set(`m:${msg.id}`, JSON.stringify(enc));

  const idx = JSON.parse(s.getString('idx') ?? '[]');
  if (!idx.includes(msg.id)) {
    idx.push(msg.id);
    if (idx.length > 2000) idx.splice(0, idx.length - 2000);
    s.set('idx', JSON.stringify(idx));
  }
}

export async function loadMessages(peerId, sharedKey) {
  const s   = store(peerId);
  const idx = JSON.parse(s.getString('idx') ?? '[]');
  const out = [];
  for (const id of idx) {
    const raw = s.getString(`m:${id}`);
    if (!raw) continue;
    try {
      const {nonce, ct} = JSON.parse(raw);
      const plain = decryptMessage(nonce, ct, sharedKey);
      out.push(JSON.parse(plain));
    } catch (_) {}
  }
  return out;
}

export function markDelivered(peerId, msgId) {
  store(peerId).set(`ack:${msgId}`, '1');
}

export function isDelivered(peerId, msgId) {
  return store(peerId).getString(`ack:${msgId}`) === '1';
}

// ── Wipe ──────────────────────────────────────────────────────────

export async function wipeChat(peerId) {
  const s = store(peerId);
  s.clearAll();
  stores.delete(peerId);
  const dir = `${MEDIA_DIR}/${peerId}`;
  if (await RNFS.exists(dir)) await RNFS.unlink(dir);
}

// ── Contacts ──────────────────────────────────────────────────────

export function saveContact(peerId, info) {
  contactStore.set(`c:${peerId}`, JSON.stringify(info));
  const list = getContactIds();
  if (!list.includes(peerId)) {
    list.push(peerId);
    contactStore.set('list', JSON.stringify(list));
  }
}

export function getContactIds() {
  return JSON.parse(contactStore.getString('list') ?? '[]');
}

export function getContact(peerId) {
  const r = contactStore.getString(`c:${peerId}`);
  return r ? JSON.parse(r) : null;
}

export function setNickname(peerId, nick) {
  const c = getContact(peerId) ?? {peerId};
  c.nickname = nick.trim();
  contactStore.set(`c:${peerId}`, JSON.stringify(c));
}

// ── Media blobs ───────────────────────────────────────────────────

export async function saveMedia(peerId, data, mimeType) {
  await RNFS.mkdir(`${MEDIA_DIR}/${peerId}`);
  const id  = uuid();
  const enc = encryptBlob(data);
  await RNFS.writeFile(`${MEDIA_DIR}/${peerId}/${id}.enc`, enc.ct, 'base64');
  store(peerId).set(`media:${id}`, JSON.stringify({key: enc.key, nonce: enc.nonce, mimeType}));
  return id;
}

export async function loadMedia(peerId, mediaId) {
  const meta = store(peerId).getString(`media:${mediaId}`);
  if (!meta) throw new Error('Media not found');
  const {key, nonce, mimeType} = JSON.parse(meta);
  const ct   = await RNFS.readFile(`${MEDIA_DIR}/${peerId}/${mediaId}.enc`, 'base64');
  const data = decryptBlob(key, nonce, ct);
  return {data, mimeType};
}

// ── Shared key store (memory only) ────────────────────────────────

const _keys = new Map();
export const keyStore = {
  set: (peerId, key) => _keys.set(peerId, key),
  get: (peerId)      => _keys.get(peerId),
  del: (peerId)      => _keys.delete(peerId),
};

// ── Backup ────────────────────────────────────────────────────────

export async function createBackup(peerId, sharedKey, password) {
  await RNFS.mkdir(BACKUP_DIR);

  const messages = await loadMessages(peerId, sharedKey);
  const payload  = JSON.stringify({version: 1, peerId, messages, createdAt: Date.now()});

  const pwKey      = nacl.hash(encodeUTF8(password)).slice(0, 32);
  const nonce      = nacl.randomBytes(nacl.secretbox.nonceLength);
  const ciphertext = nacl.secretbox(encodeUTF8(payload), nonce, pwKey);

  const file     = JSON.stringify({v: 1, n: encodeBase64(nonce), ct: encodeBase64(ciphertext)});
  const filename = `ghost_backup_${peerId.slice(0, 8)}_${Date.now()}.gbk`;
  const path     = `${BACKUP_DIR}/${filename}`;
  await RNFS.writeFile(path, file, 'utf8');
  return path;
}

export async function restoreBackup(filePath, password) {
  const raw  = await RNFS.readFile(filePath, 'utf8');
  const {v, n, ct} = JSON.parse(raw);
  if (v !== 1) throw new Error('Unknown backup version');

  const pwKey      = nacl.hash(encodeUTF8(password)).slice(0, 32);
  const nonce      = decodeBase64(n);
  const ciphertext = decodeBase64(ct);
  const plain      = nacl.secretbox.open(ciphertext, nonce, pwKey);
  if (!plain) throw new Error('Wrong password or corrupted backup');
  return JSON.parse(decodeUTF8(plain));
}
