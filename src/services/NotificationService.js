import notifee, {AndroidImportance} from '@notifee/react-native';
import {AppState} from 'react-native';
import {MMKV} from 'react-native-mmkv';

const prefs = new MMKV({id: 'ghost_notif_prefs'});
const CHANNEL_ID = 'ghost_messages';

export async function setupNotifications(onNotificationTap) {
  await notifee.createChannel({
    id: CHANNEL_ID,
    name: 'Ghost Messages',
    importance: AndroidImportance.HIGH,
    vibration: true,
  });
  notifee.onForegroundEvent(({type, detail}) => {
    if (type === 1 && detail.notification?.data?.peerId) {
      onNotificationTap?.(detail.notification.data.peerId);
    }
  });
  notifee.onBackgroundEvent(async ({type, detail}) => {
    if (type === 1 && detail.notification?.data?.peerId) {
      onNotificationTap?.(detail.notification.data.peerId);
    }
  });
}

export async function notifyMessage(peerId, nickname, preview) {
  if (AppState.currentState === 'active') return;
  if (prefs.getBoolean('disabled') === true) return;
  const showPreview = prefs.getBoolean('showPreview') !== false;
  await notifee.displayNotification({
    title: nickname ?? `${peerId.slice(0, 10)}…`,
    body: showPreview ? preview : 'New message',
    data: {peerId},
    android: {channelId: CHANNEL_ID, importance: AndroidImportance.HIGH, smallIcon: 'ic_launcher', pressAction: {id: 'default'}},
  });
}

export async function notifyCall(peerId, nickname) {
  if (AppState.currentState === 'active') return;
  await notifee.displayNotification({
    title: 'Incoming Ghost call',
    body: `${nickname ?? peerId.slice(0, 10) + '…'} is calling`,
    data: {peerId, type: 'call'},
    android: {channelId: CHANNEL_ID, importance: AndroidImportance.HIGH, smallIcon: 'ic_launcher', pressAction: {id: 'default'}},
  });
}

export function setNotificationsEnabled(v) { prefs.set('disabled', !v); }
export function setShowPreview(v) { prefs.set('showPreview', v); }
export function areNotificationsEnabled() { return prefs.getBoolean('disabled') !== true; }
export function isPreviewEnabled() { return prefs.getBoolean('showPreview') !== false; }
