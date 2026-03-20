/**
 * Ghost – Backup Screen
 *
 * Full flow:
 *  1. Show your backup half (3 hex chars, rotates daily)
 *  2. Request peer's half via P2P message
 *  3. Once both halves received → show combined 6-char password
 *  4. Create encrypted backup file (local only, no cloud)
 *  5. Restore from backup file
 *  6. Revoke peer's backup access
 */
import React, {useState, useEffect, useCallback} from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, ScrollView,
} from 'react-native';
import {
  pick,
  isCancel,
  types as DocumentTypes,
} from '@react-native-documents/picker';
import RNFS from 'react-native-fs';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useNavigation, useRoute} from '@react-navigation/native';

import {getMyBackupHalf, combineBackupPassword} from '../crypto';
import {createBackup, restoreBackup, keyStore}  from '../storage';
import rtcManager                                from '../p2p/WebRTCManager';
import {useStore}                                from '../store/useStore';
import {colors, radius, font}                    from '../theme';

const BACKUP_DIR = `${RNFS.DocumentDirectoryPath}/ghost_backups`;

export default function BackupScreen() {
  const nav    = useNavigation();
  const route  = useRoute();
  const insets = useSafeAreaInsets();
  const {peerId} = route.params ?? {};

  const {contacts} = useStore();
  const contact     = contacts[peerId] ?? {};
  const name        = contact.nickname ?? peerId?.slice(0, 14) + '…';
  const sharedKey   = keyStore.get(peerId);

  const [myHalf,        setMyHalf]        = useState('');
  const [theirHalf,     setTheirHalf]     = useState('');
  const [requesting,    setRequesting]    = useState(false);
  const [revoking,      setRevoking]      = useState(false);
  const [creatingBackup,setCreating]      = useState(false);
  const [restoring,     setRestoring]     = useState(false);
  const [backupPath,    setBackupPath]    = useState('');
  const [expiresIn,     setExpiresIn]     = useState('');

  const fullPassword = theirHalf
    ? combineBackupPassword(myHalf, theirHalf)
    : null;

  // ── Init ─────────────────────────────────────────────────────
  useEffect(() => {
    getMyBackupHalf().then(h => {
      setMyHalf(h);
      // Calculate time until rotation (midnight UTC)
      const now   = new Date();
      const midnight = new Date();
      midnight.setUTCHours(24, 0, 0, 0);
      const diffMs  = midnight - now;
      const h2      = Math.floor(diffMs / 3_600_000);
      const m       = Math.floor((diffMs % 3_600_000) / 60_000);
      setExpiresIn(`${h2}h ${m}m`);
    });

    // Listen for peer's backup half coming back over P2P
    const onMsg = ({peerId: from, type, backupHalf}) => {
      if (from !== peerId) return;
      if (type === 'backup_half_response') {
        setTheirHalf(backupHalf);
        setRequesting(false);
      }
      if (type === 'backup_half_request') {
        // Auto-respond with our half
        getMyBackupHalf().then(half => {
          rtcManager.send(from, {
            type: 'backup_half_response',
            id: `bhr_${Date.now()}`,
            backupHalf: half,
          });
        });
      }
      if (type === 'backup_revoked') {
        setTheirHalf('');
        Alert.alert('Access revoked', `${name} revoked your backup access.`);
      }
    };

    rtcManager.on('message', onMsg);
    return () => rtcManager.off('message', onMsg);
  }, [peerId]);

  // ── Request peer's half ──────────────────────────────────────
  const requestHalf = useCallback(async () => {
    setRequesting(true);
    const sent = rtcManager.send(peerId, {
      type: 'backup_half_request',
      id:   `bhreq_${Date.now()}`,
    });
    if (!sent) {
      setRequesting(false);
      Alert.alert('Peer offline', 'Connect to this peer first, then request backup access.');
    }
  }, [peerId, myHalf]);

  // ── Create backup ────────────────────────────────────────────
  const handleCreate = useCallback(async () => {
    if (!fullPassword) return;
    if (!sharedKey) {
      Alert.alert('Not connected', 'Must be connected to peer to backup this chat.');
      return;
    }

    Alert.alert(
      'Create encrypted backup',
      `Password: ${fullPassword}\n\nThis password rotates in ${expiresIn}. Save the file before then.`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Create', onPress: async () => {
            setCreating(true);
            try {
              await RNFS.mkdir(BACKUP_DIR);
              const path = await createBackup(peerId, sharedKey, fullPassword);
              setBackupPath(path);
              Alert.alert(
                'Backup created ✓',
                `Saved to device storage.\n\nPassword: ${fullPassword}\nExpires in: ${expiresIn}\n\nBoth you and ${name} need your halves to open it.`,
              );
            } catch (e) {
              Alert.alert('Backup failed', e.message);
            } finally {
              setCreating(false);
            }
          },
        },
      ],
    );
  }, [fullPassword, peerId, sharedKey, expiresIn, name]);

  // ── Restore backup ───────────────────────────────────────────
  const handleRestore = useCallback(async () => {
    if (!fullPassword) {
      Alert.alert('Need both halves', 'Exchange backup passwords with peer first.');
      return;
    }
    try {
      const [result] = await pick({
        type: [DocumentTypes.allFiles],
      });

      if (!result.uri) return;
      setRestoring(true);

      const restored = await restoreBackup(result.uri, fullPassword);
      Alert.alert(
        'Restore successful ✓',
        `Restored ${restored.messages?.length ?? 0} messages from backup.`,
      );
    } catch (e) {
      if (!isCancel(e)) {
        Alert.alert('Restore failed', 'Wrong password or corrupted backup file.');
      }
    } finally {
      setRestoring(false);
    }
  }, [fullPassword]);

  // ── Revoke peer's access ─────────────────────────────────────
  const handleRevoke = useCallback(() => {
    Alert.alert(
      'Revoke backup access',
      `This permanently invalidates ${name}'s half. Old backups become unopenable.`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Revoke', style: 'destructive', onPress: () => {
            setRevoking(true);
            rtcManager.send(peerId, {type: 'backup_revoked', id: `rev_${Date.now()}`});
            setTheirHalf('');
            setRevoking(false);
            Alert.alert('Revoked', `${name} can no longer open backups.`);
          },
        },
      ],
    );
  }, [peerId, name]);

  // ── Render ───────────────────────────────────────────────────
  return (
    <ScrollView
      style={[s.root, {paddingTop: insets.top}]}
      contentContainerStyle={s.content}>

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => nav.goBack()}>
          <Text style={s.backIcon}>‹</Text>
        </TouchableOpacity>
        <Text style={s.title}>Encrypted Backup</Text>
        <View style={{width: 32}} />
      </View>

      {/* Explanation card */}
      <View style={s.infoCard}>
        <Text style={s.infoIcon}>🔐</Text>
        <View style={s.infoBody}>
          <Text style={s.infoTitle}>Dual-key backup</Text>
          <Text style={s.infoTxt}>
            Your backup password is split across both devices — 3 chars from you, 3 from {name}. Neither can open a backup alone. Password rotates every 24h.
          </Text>
        </View>
      </View>

      {/* Password halves */}
      <Text style={s.sectionLabel}>PASSWORD HALVES</Text>
      <View style={s.halvesRow}>
        <View style={s.halfCard}>
          <Text style={s.halfLabel}>Your half</Text>
          <Text style={s.halfVal}>{myHalf || '···'}</Text>
          <Text style={s.halfSub}>This device</Text>
        </View>

        <Text style={s.plus}>+</Text>

        <View style={[s.halfCard, !theirHalf && s.halfCardPending]}>
          <Text style={s.halfLabel}>Their half</Text>
          <Text style={[s.halfVal, !theirHalf && s.halfValPending]}>
            {theirHalf || '???'}
          </Text>
          <Text style={s.halfSub}>{name}</Text>
        </View>
      </View>

      {/* Expiry */}
      <View style={s.expiryRow}>
        <Text style={s.expiryIcon}>⏱</Text>
        <Text style={s.expiryTxt}>Password rotates in {expiresIn}</Text>
      </View>

      {/* Combined password */}
      {fullPassword ? (
        <View style={s.passwordBox}>
          <Text style={s.passwordLabel}>Combined password</Text>
          <Text style={s.passwordVal}>{fullPassword}</Text>
          <Text style={s.passwordSub}>Both halves needed to open any backup</Text>
        </View>
      ) : (
        <TouchableOpacity
          style={s.requestBtn}
          onPress={requestHalf}
          disabled={requesting}>
          {requesting ? (
            <View style={s.btnRow}>
              <ActivityIndicator color="#FFF" size="small" />
              <Text style={s.requestBtnTxt}> Waiting for {name}…</Text>
            </View>
          ) : (
            <Text style={s.requestBtnTxt}>Request {name}'s Half</Text>
          )}
        </TouchableOpacity>
      )}

      {/* Action buttons */}
      {fullPassword && (
        <>
          <Text style={s.sectionLabel}>BACKUP ACTIONS</Text>

          <TouchableOpacity
            style={[s.actionBtn, s.actionBtnGreen]}
            onPress={handleCreate}
            disabled={creatingBackup}>
            {creatingBackup
              ? <ActivityIndicator color="#FFF" />
              : <Text style={s.actionBtnTxt}>💾  Create Backup</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.actionBtn, s.actionBtnBlue]}
            onPress={handleRestore}
            disabled={restoring}>
            {restoring
              ? <ActivityIndicator color="#FFF" />
              : <Text style={s.actionBtnTxt}>📂  Restore from Backup</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.actionBtn, s.actionBtnRed]}
            onPress={handleRevoke}
            disabled={revoking}>
            <Text style={s.actionBtnTxt}>🚫  Revoke {name}'s Access</Text>
          </TouchableOpacity>
        </>
      )}

      {/* Saved backup path */}
      {!!backupPath && (
        <View style={s.pathBox}>
          <Text style={s.pathLabel}>Last backup saved to:</Text>
          <Text style={s.pathVal} numberOfLines={3}>{backupPath}</Text>
        </View>
      )}

      {/* Disclaimer */}
      <Text style={s.disclaimer}>
        Backups are stored locally on this device only.{'\n'}
        No cloud. No server. No copy anywhere else.{'\n'}
        Old passwords cannot open backups after rotation.
      </Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root:            {flex: 1, backgroundColor: colors.bg},
  content:         {paddingBottom: 60},
  header:          {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
  },
  backIcon:        {fontSize: 30, color: colors.accent, fontWeight: '300'},
  title:           {...font.h3},

  infoCard:        {
    flexDirection: 'row', gap: 12,
    backgroundColor: colors.surface, borderRadius: radius.lg,
    marginHorizontal: 20, marginBottom: 24, padding: 16,
    borderWidth: 1, borderColor: colors.accentDim,
  },
  infoIcon:        {fontSize: 28},
  infoBody:        {flex: 1},
  infoTitle:       {fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 4},
  infoTxt:         {fontSize: 13, color: colors.textSub, lineHeight: 19},

  sectionLabel:    {
    fontSize: 11, color: colors.textMuted, letterSpacing: 1.2,
    textTransform: 'uppercase', marginHorizontal: 20, marginBottom: 10,
  },

  halvesRow:       {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 20, marginBottom: 10, gap: 8,
  },
  halfCard:        {
    flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: 16, alignItems: 'center',
    borderWidth: 1, borderColor: colors.accentDim,
  },
  halfCardPending: {borderColor: colors.border},
  halfLabel:       {fontSize: 11, color: colors.textMuted, marginBottom: 6},
  halfVal:         {fontSize: 30, fontWeight: '900', fontFamily: 'monospace',
                    color: colors.accent, letterSpacing: 5},
  halfValPending:  {color: colors.textMuted},
  halfSub:         {fontSize: 10, color: colors.textMuted, marginTop: 4},
  plus:            {fontSize: 24, color: colors.textMuted},

  expiryRow:       {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginHorizontal: 20, marginBottom: 20,
  },
  expiryIcon:      {fontSize: 14},
  expiryTxt:       {fontSize: 12, color: colors.textMuted},

  passwordBox:     {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    marginHorizontal: 20, marginBottom: 24, padding: 18,
    alignItems: 'center',
    borderWidth: 1, borderColor: colors.accent,
  },
  passwordLabel:   {fontSize: 11, color: colors.textMuted, letterSpacing: 1, marginBottom: 8},
  passwordVal:     {
    fontSize: 38, fontWeight: '900', fontFamily: 'monospace',
    color: colors.text, letterSpacing: 8,
  },
  passwordSub:     {fontSize: 11, color: colors.textMuted, marginTop: 6},

  requestBtn:      {
    backgroundColor: colors.accent, borderRadius: radius.full,
    marginHorizontal: 20, paddingVertical: 16,
    alignItems: 'center', marginBottom: 24,
  },
  btnRow:          {flexDirection: 'row', alignItems: 'center'},
  requestBtnTxt:   {color: '#FFF', fontWeight: '700', fontSize: 15},

  actionBtn:       {
    borderRadius: radius.lg, marginHorizontal: 20,
    paddingVertical: 16, alignItems: 'center', marginBottom: 10,
  },
  actionBtnGreen:  {backgroundColor: '#1B3A2A'},
  actionBtnBlue:   {backgroundColor: colors.accentDim},
  actionBtnRed:    {backgroundColor: '#3A1B1B'},
  actionBtnTxt:    {color: '#FFF', fontWeight: '700', fontSize: 15},

  pathBox:         {
    backgroundColor: colors.surface2, borderRadius: radius.md,
    marginHorizontal: 20, padding: 12, marginBottom: 16,
    borderWidth: 1, borderColor: colors.border,
  },
  pathLabel:       {fontSize: 11, color: colors.textMuted, marginBottom: 4},
  pathVal:         {fontSize: 12, color: colors.textSub, fontFamily: 'monospace'},

  disclaimer:      {
    textAlign: 'center', color: colors.textMuted,
    fontSize: 12, marginHorizontal: 32, lineHeight: 18,
    marginTop: 8,
  },
});
