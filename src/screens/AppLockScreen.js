/**
 * Ghost – App Lock
 * Biometric (fingerprint/face) with PIN fallback.
 * Shown when app resumes from background after 30s.
 * Uses react-native-biometrics.
 */
import React, {useState, useEffect, useCallback} from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Alert, AppState,
} from 'react-native';
import ReactNativeBiometrics from 'react-native-biometrics';
import {MMKV} from 'react-native-mmkv';
import {colors, radius} from '../theme';

const lockStore = new MMKV({id: 'ghost_lock'});
const rnBio    = new ReactNativeBiometrics({allowDeviceCredentials: true});

const LOCK_TIMEOUT_MS = 30_000; // lock after 30s in background

// ── Settings helpers ─────────────────────────────────────────────

export function isLockEnabled() {
  return lockStore.getBoolean('enabled') === true;
}
export function setLockEnabled(v) {
  lockStore.set('enabled', v);
}
export function getLockPin() {
  return lockStore.getString('pin') ?? null;
}
export function setLockPin(pin) {
  lockStore.set('pin', pin);
}

// ── Hook: manages background timer ───────────────────────────────

export function useAppLock(onLock) {
  useEffect(() => {
    if (!isLockEnabled()) return;

    let bgTime = null;

    const sub = AppState.addEventListener('change', state => {
      if (state === 'background') {
        bgTime = Date.now();
      }
      if (state === 'active' && bgTime !== null) {
        const elapsed = Date.now() - bgTime;
        bgTime = null;
        if (elapsed >= LOCK_TIMEOUT_MS) {
          onLock();
        }
      }
    });

    return () => sub.remove();
  }, [onLock]);
}

// ── Lock Screen Component ─────────────────────────────────────────

export default function AppLockScreen({onUnlock}) {
  const [pin,        setPin]        = useState('');
  const [mode,       setMode]       = useState('bio'); // 'bio' | 'pin'
  const [attempts,   setAttempts]   = useState(0);
  const [bioAvail,   setBioAvail]   = useState(false);

  const PIN_DIGITS = 6;
  const savedPin   = getLockPin();

  useEffect(() => {
    rnBio.isSensorAvailable().then(({available}) => {
      setBioAvail(available);
      if (available) tryBiometric();
    });
  }, []);

  const tryBiometric = useCallback(async () => {
    try {
      const {success} = await rnBio.simplePrompt({
        promptMessage:          'Unlock Ghost',
        cancelButtonText:       'Use PIN',
        fallbackPromptMessage:  'Use PIN instead',
      });
      if (success) onUnlock();
    } catch (_) {
      setMode('pin');
    }
  }, [onUnlock]);

  const pressDigit = useCallback(d => {
    if (pin.length >= PIN_DIGITS) return;
    const next = pin + d;
    setPin(next);

    if (next.length === PIN_DIGITS) {
      if (next === savedPin) {
        onUnlock();
      } else {
        const a = attempts + 1;
        setAttempts(a);
        setPin('');
        if (a >= 5) {
          Alert.alert(
            'Too many attempts',
            'Ghost will wipe all data to protect your privacy.',
            [{text: 'Wipe', style: 'destructive', onPress: () => {
              // Trigger panic wipe (imported lazily to avoid circular dep)
              import('../services/PanicWipe').then(m => m.panicWipe());
            }}],
          );
        }
      }
    }
  }, [pin, savedPin, attempts, onUnlock]);

  const del = () => setPin(p => p.slice(0, -1));

  const KEYS = [
    ['1','2','3'],
    ['4','5','6'],
    ['7','8','9'],
    ['','0','⌫'],
  ];

  return (
    <View style={s.root}>
      <Text style={s.icon}>👻</Text>
      <Text style={s.title}>Ghost is locked</Text>

      {mode === 'bio' ? (
        <>
          <Text style={s.sub}>Use biometrics to unlock</Text>
          <TouchableOpacity style={s.bioBtn} onPress={tryBiometric}>
            <Text style={s.bioBtnIcon}>🔒</Text>
            <Text style={s.bioBtnTxt}>Unlock with biometrics</Text>
          </TouchableOpacity>
          {!!savedPin && (
            <TouchableOpacity onPress={() => setMode('pin')}>
              <Text style={s.switchTxt}>Use PIN instead</Text>
            </TouchableOpacity>
          )}
        </>
      ) : (
        <>
          {/* PIN dots */}
          <View style={s.dots}>
            {Array.from({length: PIN_DIGITS}).map((_, i) => (
              <View key={i} style={[s.dot, i < pin.length && s.dotFilled]} />
            ))}
          </View>

          {attempts > 0 && (
            <Text style={s.errorTxt}>
              Wrong PIN · {5 - attempts} attempts left
            </Text>
          )}

          {/* Keypad */}
          <View style={s.keypad}>
            {KEYS.map((row, ri) => (
              <View key={ri} style={s.keyRow}>
                {row.map((k, ki) => (
                  <TouchableOpacity
                    key={ki}
                    style={[s.key, !k && s.keyEmpty]}
                    onPress={() => k === '⌫' ? del() : k ? pressDigit(k) : null}
                    disabled={!k}>
                    <Text style={s.keyTxt}>{k}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ))}
          </View>

          {bioAvail && (
            <TouchableOpacity onPress={() => { setMode('bio'); tryBiometric(); }}>
              <Text style={s.switchTxt}>Use biometrics</Text>
            </TouchableOpacity>
          )}
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root:       {
    flex: 1, backgroundColor: colors.bg,
    alignItems: 'center', justifyContent: 'center', gap: 16,
  },
  icon:       {fontSize: 56},
  title:      {fontSize: 24, fontWeight: '800', color: colors.text},
  sub:        {fontSize: 15, color: colors.textSub},
  bioBtn:     {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.surface2, borderRadius: radius.full,
    paddingHorizontal: 28, paddingVertical: 16,
    borderWidth: 1, borderColor: colors.accentDim,
    marginTop: 8,
  },
  bioBtnIcon: {fontSize: 22},
  bioBtnTxt:  {fontSize: 16, fontWeight: '600', color: colors.accent},
  switchTxt:  {color: colors.textMuted, fontSize: 14, marginTop: 8, padding: 8},
  dots:       {flexDirection: 'row', gap: 14, marginVertical: 8},
  dot:        {
    width: 14, height: 14, borderRadius: 7,
    borderWidth: 2, borderColor: colors.accent,
    backgroundColor: 'transparent',
  },
  dotFilled:  {backgroundColor: colors.accent},
  errorTxt:   {color: colors.red, fontSize: 13},
  keypad:     {gap: 12, marginTop: 8},
  keyRow:     {flexDirection: 'row', gap: 16},
  key:        {
    width: 76, height: 76, borderRadius: 38,
    backgroundColor: colors.surface2,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  keyEmpty:   {backgroundColor: 'transparent', borderColor: 'transparent'},
  keyTxt:     {fontSize: 24, fontWeight: '600', color: colors.text},
});
