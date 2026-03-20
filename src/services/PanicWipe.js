/**
 * Ghost – Panic Wipe
 * Shake phone → confirm → everything gone in <1s.
 * Also callable programmatically (e.g. from AppLock after 5 failed PINs).
 */
import {Alert} from 'react-native';
import {addListener as addShakeListener} from 'react-native-shake';
import EncryptedStorage from 'react-native-encrypted-storage';
import {MMKV} from 'react-native-mmkv';
import RNFS from 'react-native-fs';
import rtcManager from '../p2p/WebRTCManager';
import {connManager} from '../p2p/ConnectionManager';

let _shakeSubscription = null;
let _onWipe = null;

/**
 * Call this once from App.js to arm the panic listener.
 * onWipe: callback to reset navigation to a blank screen.
 */
export function armPanicWipe(onWipe) {
  _onWipe = onWipe;

  _shakeSubscription?.remove();
  _shakeSubscription = addShakeListener(() => {
    Alert.alert(
      '⚠️ Panic wipe',
      'Shake detected. Wipe ALL Ghost data immediately?',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'WIPE EVERYTHING',
          style: 'destructive',
          onPress: panicWipe,
        },
      ],
      {cancelable: true},
    );
  });
}

export function disarmPanicWipe() {
  _shakeSubscription?.remove();
  _shakeSubscription = null;
}

export async function panicWipe() {
  // 1. Stop all connections
  connManager.stop();
  rtcManager.closeAll();

  // 2. Wipe EncryptedStorage (identity)
  await EncryptedStorage.clear().catch(() => {});

  // 3. Wipe all MMKV stores
  const storeIds = [
    'ghost_contacts', 'ghost_msgqueue', 'ghost_addrbook',
    'ghost_meta', 'ghost_lock',
  ];
  for (const id of storeIds) {
    try { new MMKV({id}).clearAll(); } catch (_) {}
  }

  // 4. Wipe all files (media + backups)
  const dirs = [
    `${RNFS.DocumentDirectoryPath}/.ghost_media`,
    `${RNFS.DocumentDirectoryPath}/ghost_backups`,
  ];
  for (const dir of dirs) {
    if (await RNFS.exists(dir).catch(() => false)) {
      await RNFS.unlink(dir).catch(() => {});
    }
  }

  // 5. Notify app to reset
  _onWipe?.();
}
