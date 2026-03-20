import React, {useState, useCallback} from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, StyleSheet, Alert, Switch,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useNavigation, useRoute} from '@react-navigation/native';
import {useStore} from '../store/useStore';
import {setNickname}  from '../storage';
import {getMyBackupHalf} from '../crypto';
import EncryptedStorage from 'react-native-encrypted-storage';
import rtcManager from '../p2p/WebRTCManager';
import {connManager} from '../p2p/ConnectionManager';
import {
  isLockEnabled, setLockEnabled,
  getLockPin, setLockPin,
} from './AppLockScreen';
import {
  areNotificationsEnabled, isPreviewEnabled,
  setNotificationsEnabled, setShowPreview,
} from '../services/NotificationService';
import {isHapticsEnabled, setHapticsEnabled} from '../services/Haptics';
import {panicWipe} from '../services/PanicWipe';
import {colors, radius, font} from '../theme';

export default function SettingsScreen() {
  const nav    = useNavigation();
  const route  = useRoute();
  const insets = useSafeAreaInsets();
  const {peerId} = route.params ?? {};
  const {identity, contacts, upsertContact} = useStore();
  const contact = peerId ? (contacts[peerId] ?? {}) : {};

  // Contact prefs
  const [nick, setNick] = useState(contact.nickname ?? '');

  // App-level prefs (read initial from storage)
  const [lockOn,    setLockOn]    = useState(isLockEnabled());
  const [notifOn,   setNotifOn]   = useState(areNotificationsEnabled());
  const [previewOn, setPreviewOn] = useState(isPreviewEnabled());
  const [hapticsOn, setHapticsOn] = useState(isHapticsEnabled());

  // PIN setup
  const [pinMode,   setPinMode]   = useState(false); // showing PIN input?
  const [newPin,    setNewPin]    = useState('');
  const [confirmPin,setConfirmPin]= useState('');
  const existingPin = getLockPin();

  const saveNick = useCallback(() => {
    if (!peerId) return;
    setNickname(peerId, nick.trim());
    upsertContact(peerId, {nickname: nick.trim()});
    Alert.alert('Saved ✓');
  }, [peerId, nick, upsertContact]);

  const toggleLock = useCallback((v) => {
    setLockEnabled(v);
    setLockOn(v);
    if (v && !getLockPin()) {
      // Prompt to set a PIN when enabling lock
      setPinMode(true);
    }
  }, []);

  const savePin = useCallback(() => {
    if (newPin.length < 4) { Alert.alert('PIN too short', 'Use at least 4 digits.'); return; }
    if (newPin !== confirmPin) { Alert.alert('Mismatch', 'PINs do not match.'); return; }
    setLockPin(newPin);
    setNewPin('');
    setConfirmPin('');
    setPinMode(false);
    Alert.alert('PIN set ✓', 'App lock is now active.');
  }, [newPin, confirmPin]);

  const toggleNotif = useCallback((v) => {
    setNotificationsEnabled(v);
    setNotifOn(v);
  }, []);

  const togglePreview = useCallback((v) => {
    setShowPreview(v);
    setPreviewOn(v);
  }, []);

  const toggleHaptics = useCallback((v) => {
    setHapticsEnabled(v);
    setHapticsOn(v);
  }, []);

  const handleNuke = useCallback(() => {
    Alert.alert(
      '⚠️ Wipe all Ghost data',
      'Deletes identity, all contacts, all messages. Irreversible.',
      [
        {text: 'Cancel', style: 'cancel'},
        {text: 'Wipe everything', style: 'destructive', onPress: panicWipe},
      ],
    );
  }, []);

  // ── Section wrapper ──────────────────────────────────────────
  const Section = ({title, children}) => (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      {children}
    </View>
  );

  const Row = ({label, value}) => (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={s.rowValue} numberOfLines={2}>{value}</Text>
    </View>
  );

  const SwitchRow = ({label, sub, value, onValueChange}) => (
    <View style={s.switchRow}>
      <View style={s.switchInfo}>
        <Text style={s.switchLabel}>{label}</Text>
        {!!sub && <Text style={s.switchSub}>{sub}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{false: colors.surface3, true: colors.accentDim}}
        thumbColor={value ? colors.accent : colors.textMuted}
      />
    </View>
  );

  const NavRow = ({icon, title, sub, onPress}) => (
    <TouchableOpacity style={s.navRow} onPress={onPress}>
      <Text style={s.navIcon}>{icon}</Text>
      <View style={s.navBody}>
        <Text style={s.navTitle}>{title}</Text>
        {!!sub && <Text style={s.navSub}>{sub}</Text>}
      </View>
      <Text style={s.chevron}>›</Text>
    </TouchableOpacity>
  );

  const FeatureBadge = ({label}) => (
    <View style={s.featureRow}>
      <Text style={s.featureLabel}>{label}</Text>
      <View style={s.onBadge}><Text style={s.onBadgeTxt}>ON</Text></View>
    </View>
  );

  return (
    <ScrollView
      style={[s.root, {paddingTop: insets.top}]}
      contentContainerStyle={s.content}>

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => nav.goBack()}>
          <Text style={s.backIcon}>‹</Text>
        </TouchableOpacity>
        <Text style={s.title}>{peerId ? 'Contact' : 'Settings'}</Text>
        <View style={{width: 32}} />
      </View>

      {/* ── IDENTITY ── */}
      {!peerId && (
        <Section title="YOUR IDENTITY">
          <Row label="Peer ID"       value={identity?.peerId ?? '–'} />
          <Row label="DH Public Key" value={(identity?.boxPublicKey ?? '').slice(0, 28) + '…'} />
          <View style={s.infoBox}>
            <Text style={s.infoTxt}>
              Permanent Ed25519 keypair, generated locally on first launch.
              No account. No phone number. No server ever sees it.
            </Text>
          </View>
        </Section>
      )}

      {/* ── CONTACT ── */}
      {peerId && (
        <Section title="CONTACT">
          <Row label="Peer ID" value={peerId} />
          <Text style={s.fieldLabel}>Local nickname</Text>
          <View style={s.inputRow}>
            <TextInput
              style={s.input}
              value={nick}
              onChangeText={setNick}
              placeholder="Optional local label…"
              placeholderTextColor={colors.textMuted}
              maxLength={30}
              returnKeyType="done"
              autoCorrect={false}
              onSubmitEditing={saveNick}
            />
            <TouchableOpacity style={s.saveBtn} onPress={saveNick}>
              <Text style={s.saveBtnTxt}>Save</Text>
            </TouchableOpacity>
          </View>
          <Text style={s.hint}>Only you see this — not shared with the peer</Text>
        </Section>
      )}

      {/* ── BACKUP (contact only) ── */}
      {peerId && (
        <Section title="BACKUP">
          <NavRow
            icon="🔐"
            title="Encrypted Backup"
            sub="Dual-key · local only · rotates daily"
            onPress={() => nav.navigate('Backup', {peerId})}
          />
        </Section>
      )}

      {/* ── APP LOCK ── */}
      {!peerId && (
        <Section title="APP LOCK">
          <SwitchRow
            label="Require unlock on resume"
            sub="Biometric or PIN after 30s in background"
            value={lockOn}
            onValueChange={toggleLock}
          />

          {lockOn && (
            <>
              <NavRow
                icon="🔢"
                title={existingPin ? 'Change PIN' : 'Set PIN'}
                sub={existingPin ? 'PIN is set' : 'No PIN set — biometric only'}
                onPress={() => setPinMode(true)}
              />

              {pinMode && (
                <View style={s.pinBox}>
                  <Text style={s.pinBoxTitle}>Set a new PIN</Text>
                  <TextInput
                    style={s.pinInput}
                    value={newPin}
                    onChangeText={setNewPin}
                    placeholder="New PIN (min 4 digits)"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="number-pad"
                    secureTextEntry
                    maxLength={8}
                  />
                  <TextInput
                    style={s.pinInput}
                    value={confirmPin}
                    onChangeText={setConfirmPin}
                    placeholder="Confirm PIN"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="number-pad"
                    secureTextEntry
                    maxLength={8}
                  />
                  <View style={s.pinBtns}>
                    <TouchableOpacity
                      style={s.pinCancel}
                      onPress={() => { setPinMode(false); setNewPin(''); setConfirmPin(''); }}>
                      <Text style={s.pinCancelTxt}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.pinSave} onPress={savePin}>
                      <Text style={s.pinSaveTxt}>Save PIN</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </>
          )}
        </Section>
      )}

      {/* ── NOTIFICATIONS ── */}
      {!peerId && (
        <Section title="NOTIFICATIONS">
          <SwitchRow
            label="Message notifications"
            sub="Local only — no push server"
            value={notifOn}
            onValueChange={toggleNotif}
          />
          {notifOn && (
            <SwitchRow
              label="Show message preview"
              sub="Off = 'New message' only"
              value={previewOn}
              onValueChange={togglePreview}
            />
          )}
        </Section>
      )}

      {/* ── EXPERIENCE ── */}
      {!peerId && (
        <Section title="EXPERIENCE">
          <SwitchRow
            label="Haptic feedback"
            sub="Vibration on send, receive, actions"
            value={hapticsOn}
            onValueChange={toggleHaptics}
          />
        </Section>
      )}

      {/* ── PRIVACY FEATURES ── */}
      <Section title="PRIVACY">
        <FeatureBadge label="Screenshot blocked (FLAG_SECURE)" />
        <FeatureBadge label="Text selection disabled on messages" />
        <FeatureBadge label="End-to-end encrypted always" />
        <FeatureBadge label="Incognito keyboard (no learning)" />
        <FeatureBadge label="No server · no analytics · no telemetry" />
        <FeatureBadge label="Media encrypted at rest (AES-256)" />
        <FeatureBadge label="Panic wipe on shake" />
      </Section>

      {/* ── DANGER ── */}
      {!peerId && (
        <Section title="DANGER">
          <TouchableOpacity style={s.nukeBtn} onPress={handleNuke}>
            <Text style={s.nukeTxt}>☠️  Wipe all Ghost data</Text>
          </TouchableOpacity>
          <Text style={s.hint}>
            Instantly deletes identity, all contacts, messages, media and keys.
          </Text>
        </Section>
      )}

      <Text style={s.footer}>Ghost v0.1.0 · open source · zero backend</Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root:         {flex: 1, backgroundColor: colors.bg},
  content:      {paddingBottom: 60},
  header:       {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
  },
  backIcon:     {fontSize: 30, color: colors.accent, fontWeight: '300'},
  title:        {...font.h3},
  section:      {marginHorizontal: 20, marginBottom: 28},
  sectionTitle: {
    fontSize: 11, color: colors.textMuted, letterSpacing: 1.2,
    textTransform: 'uppercase', marginBottom: 10,
  },
  row:          {
    backgroundColor: colors.surface, borderRadius: radius.md, padding: 13,
    marginBottom: 8, borderWidth: 1, borderColor: colors.border,
  },
  rowLabel:     {fontSize: 11, color: colors.textMuted, marginBottom: 3},
  rowValue:     {fontSize: 12, color: colors.textSub, fontFamily: 'monospace'},
  infoBox:      {
    backgroundColor: colors.surface2, borderRadius: radius.md, padding: 12,
    borderLeftWidth: 3, borderLeftColor: colors.accent,
  },
  infoTxt:      {fontSize: 13, color: colors.textSub, lineHeight: 19},
  fieldLabel:   {fontSize: 13, color: colors.textSub, marginBottom: 6},
  inputRow:     {flexDirection: 'row', gap: 8},
  input:        {
    flex: 1, backgroundColor: colors.surface2, borderRadius: radius.md,
    paddingHorizontal: 14, paddingVertical: 10, color: colors.text,
    fontSize: 14, borderWidth: 1, borderColor: colors.border,
  },
  saveBtn:      {
    backgroundColor: colors.accent, borderRadius: radius.md,
    paddingHorizontal: 16, justifyContent: 'center',
  },
  saveBtnTxt:   {color: '#FFF', fontWeight: '700'},
  hint:         {fontSize: 11, color: colors.textMuted, marginTop: 4},
  switchRow:    {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: radius.md,
    padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: colors.border,
  },
  switchInfo:   {flex: 1},
  switchLabel:  {fontSize: 14, color: colors.text, fontWeight: '500'},
  switchSub:    {fontSize: 12, color: colors.textMuted, marginTop: 2},
  navRow:       {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: radius.md,
    padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: colors.border, gap: 12,
  },
  navIcon:      {fontSize: 22},
  navBody:      {flex: 1},
  navTitle:     {fontSize: 14, fontWeight: '600', color: colors.text},
  navSub:       {fontSize: 12, color: colors.textMuted, marginTop: 2},
  chevron:      {color: colors.textMuted, fontSize: 20},
  pinBox:       {
    backgroundColor: colors.surface2, borderRadius: radius.md,
    padding: 16, marginTop: 4, marginBottom: 8,
    borderWidth: 1, borderColor: colors.accentDim, gap: 10,
  },
  pinBoxTitle:  {fontSize: 14, fontWeight: '700', color: colors.text},
  pinInput:     {
    backgroundColor: colors.surface, borderRadius: radius.md,
    paddingHorizontal: 14, paddingVertical: 10,
    color: colors.text, fontSize: 15,
    borderWidth: 1, borderColor: colors.border,
    letterSpacing: 4,
  },
  pinBtns:      {flexDirection: 'row', gap: 10},
  pinCancel:    {
    flex: 1, padding: 12, borderRadius: radius.md,
    backgroundColor: colors.surface3, alignItems: 'center',
  },
  pinCancelTxt: {color: colors.textSub, fontWeight: '600'},
  pinSave:      {
    flex: 1, padding: 12, borderRadius: radius.md,
    backgroundColor: colors.accent, alignItems: 'center',
  },
  pinSaveTxt:   {color: '#FFF', fontWeight: '700'},
  featureRow:   {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  featureLabel: {fontSize: 13, color: colors.textSub, flex: 1},
  onBadge:      {
    backgroundColor: '#1B3A2A', paddingHorizontal: 7,
    paddingVertical: 3, borderRadius: 6,
  },
  onBadgeTxt:   {fontSize: 10, color: colors.green, fontWeight: '700'},
  nukeBtn:      {
    backgroundColor: '#1A0A0A', borderRadius: radius.md, padding: 15,
    alignItems: 'center', borderWidth: 1, borderColor: '#5E1B1B', marginBottom: 6,
  },
  nukeTxt:      {color: colors.red, fontWeight: '700', fontSize: 15},
  footer:       {textAlign: 'center', color: colors.textMuted, fontSize: 11, marginTop: 8},
});
