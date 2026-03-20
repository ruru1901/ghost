/**
 * Ghost – Haptic Feedback
 * Centralized so it's easy to disable globally.
 */
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import {MMKV} from 'react-native-mmkv';

const prefs = new MMKV({id: 'ghost_haptic_prefs'});

const OPTIONS = {enableVibrateFallback: true, ignoreAndroidSystemSettings: false};

function enabled() {
  return prefs.getBoolean('enabled') !== false; // default on
}

export function setHapticsEnabled(v) {
  prefs.set('enabled', v);
}

export function isHapticsEnabled() {
  return enabled();
}

export const haptics = {
  // Light tap — button press, reaction add
  tap() {
    if (!enabled()) return;
    ReactNativeHapticFeedback.trigger('impactLight', OPTIONS);
  },
  // Medium — send message, connect
  medium() {
    if (!enabled()) return;
    ReactNativeHapticFeedback.trigger('impactMedium', OPTIONS);
  },
  // Heavy — delete, wipe, call end
  heavy() {
    if (!enabled()) return;
    ReactNativeHapticFeedback.trigger('impactHeavy', OPTIONS);
  },
  // Success — delivery confirmed, connection established
  success() {
    if (!enabled()) return;
    ReactNativeHapticFeedback.trigger('notificationSuccess', OPTIONS);
  },
  // Warning — offline, failed
  warning() {
    if (!enabled()) return;
    ReactNativeHapticFeedback.trigger('notificationWarning', OPTIONS);
  },
  // Error — wrong PIN, decrypt fail
  error() {
    if (!enabled()) return;
    ReactNativeHapticFeedback.trigger('notificationError', OPTIONS);
  },
};
