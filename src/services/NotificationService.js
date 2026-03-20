/**
 * Ghost – Local Notification Service
 * No push server. Notifications fired locally when a message
 * arrives while the app is in the background.
 * Uses react-native-push-notification (local only, no FCM).
 */
import PushNotification from 'react-native-push-notification';
import {AppState, Platform} from 'react-native';
import {MMKV} from 'react-native-mmkv';

const prefs = new MMKV({id: 'ghost_notif_prefs'});

// ── Setup ────────────────────────────────────────────────────────

export function setupNotifications(onNotificationTap) {
  PushNotification.configure({
    onNotification(notification) {
      if (notification.userInteraction) {
        // User tapped notification → open that chat
        const peerId = notification.data?.peerId;
        if (peerId && onNotificationTap) onNotificationTap(peerId);
      }
    },
    permissions: {alert: true, badge: true, sound: true},
    popInitialNotification: true,
    requestPermissions: Platform.OS === 'ios',
  });

  PushNotification.createChannel(
    {
      channelId:          'ghost_messages',
      channelName:        'Ghost Messages',
      channelDescription: 'Incoming Ghost messages',
      importance:         4, // HIGH
      vibrate:            true,
      soundName:          'default',
    },
    () => {},
  );
}

// ── Fire a notification ───────────────────────────────────────────

export function notifyMessage(peerId, nickname, preview) {
  // Only notify when app is in background
  if (AppState.currentState === 'active') return;

  // Check user prefs
  if (prefs.getBoolean('disabled') === true) return;

  const showPreview = prefs.getBoolean('showPreview') !== false; // default true

  PushNotification.localNotification({
    channelId:   'ghost_messages',
    title:       nickname ?? `${peerId.slice(0, 10)}…`,
    message:     showPreview ? preview : 'New message',
    playSound:   true,
    soundName:   'default',
    vibrate:     true,
    vibration:   300,
    userInfo:    {peerId},
    // No badge count — Ghost doesn't track read state on server
    number:      0,
  });
}

export function notifyCall(peerId, nickname) {
  if (AppState.currentState === 'active') return;

  PushNotification.localNotification({
    channelId: 'ghost_messages',
    title:     'Incoming Ghost call',
    message:   `${nickname ?? peerId.slice(0, 10) + '…'} is calling`,
    playSound: true,
    soundName: 'default',
    vibrate:   true,
    ongoing:   false,
    userInfo:  {peerId, type: 'call'},
  });
}

// ── Prefs ─────────────────────────────────────────────────────────

export function setNotificationsEnabled(v) { prefs.set('disabled', !v); }
export function setShowPreview(v)           { prefs.set('showPreview', v); }
export function areNotificationsEnabled()   { return prefs.getBoolean('disabled') !== true; }
export function isPreviewEnabled()          { return prefs.getBoolean('showPreview') !== false; }
