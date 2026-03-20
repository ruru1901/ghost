/**
 * Ghost – Connect Screen
 *
 * Two-step QR handshake (truly serverless):
 *   Step 1 – Alice shows offer QR / shares invite link
 *   Step 2 – Bob scans → sees answer QR
 *   Step 3 – Alice scans answer → P2P connected!
 *
 * Also handles deep links:  ghost://connect/<base64offer>
 */
import React, {useState, useCallback, useEffect} from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Share, Alert, ActivityIndicator, ScrollView,
  Linking,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import {Camera, CameraType} from 'react-native-camera-kit';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';

import rtcManager from '../p2p/WebRTCManager';
import {getIdentity, deriveSharedSecret} from '../crypto';
import {saveContact, keyStore} from '../storage';
import {useStore} from '../store/useStore';
import {colors, font, radius, spacing} from '../theme';

const TABS = ['Create', 'Scan'];

export default function ConnectScreen() {
  const nav    = useNavigation();
  const insets = useSafeAreaInsets();
  const {upsertContact, setConnState} = useStore();

  const [tab, setTab]           = useState(0);   // 0=create offer, 1=scan
  const [step, setStep]         = useState('idle'); // idle|creating|showOffer|showAnswer|scanning|done
  const [offerData, setOffer]   = useState('');
  const [answerData, setAnswer] = useState('');
  const [scanned, setScanned]   = useState(false);

  // ── Create offer (Alice) ─────────────────────────────────────
  const createOffer = useCallback(async () => {
    setStep('creating');
    try {
      const id   = await getIdentity();
      rtcManager.setIdentity(id.peerId, id.boxSecretKey);
      const offer = await rtcManager.createOffer('__pending__', {
        myBoxPublicKey: id.boxPublicKey,
      });
      setOffer(offer);
      setStep('showOffer');
    } catch (e) {
      Alert.alert('Error', e.message);
      setStep('idle');
    }
  }, []);

  const shareInvite = useCallback(async () => {
    if (!offerData) return;
    const b64 = Buffer.from(offerData).toString('base64');
    await Share.share({
      message: `Join me on Ghost — anonymous encrypted messenger\nghost://connect/${b64}`,
      title: 'Ghost invite',
    });
  }, [offerData]);

  // ── Scan offer → produce answer (Bob) ────────────────────────
  const handleScanOffer = useCallback(async rawData => {
    if (scanned) return;
    setScanned(true);
    setStep('creating');

    try {
      let offerJson = rawData;
      if (rawData.startsWith('ghost://connect/')) {
        const b64 = rawData.slice('ghost://connect/'.length);
        offerJson = Buffer.from(b64, 'base64').toString('utf8');
      }

      const id  = await getIdentity();
      rtcManager.setIdentity(id.peerId, id.boxSecretKey);

      const answerJson = await rtcManager.createAnswer(offerJson);
      const parsed     = JSON.parse(offerJson);

      // Derive shared key from their box public key
      const sharedKey = deriveSharedSecret(id.boxSecretKey, parsed.boxPublicKey);
      keyStore.set(parsed.fromPeerId, sharedKey);

      // Save contact
      const contactInfo = {peerId: parsed.fromPeerId, boxPublicKey: parsed.boxPublicKey};
      saveContact(parsed.fromPeerId, contactInfo);
      upsertContact(parsed.fromPeerId, contactInfo);

      setAnswer(answerJson);
      setStep('showAnswer');

      // Wire connection events
      rtcManager.on('connected', peerId => {
        setConnState(peerId, 'connected');
        setStep('done');
        setTimeout(() => {
          nav.replace('Chat', {peerId});
        }, 800);
      });
    } catch (e) {
      Alert.alert('Invalid QR', e.message, [{text: 'Try again', onPress: () => { setScanned(false); setStep('idle'); setTab(1); }}]);
    }
  }, [scanned, upsertContact, setConnState, nav]);

  // ── Scan answer (Alice completes handshake) ──────────────────
  const handleScanAnswer = useCallback(async rawData => {
    if (scanned) return;
    setScanned(true);
    setStep('creating');

    try {
      const id  = await getIdentity();
      const peerId = await rtcManager.applyAnswer(rawData);

      const parsed  = JSON.parse(rawData);
      const sharedKey = deriveSharedSecret(id.boxSecretKey, parsed.boxPublicKey ?? '');

      // Note: if boxPublicKey not in answer, identity exchange done separately
      keyStore.set(peerId, sharedKey);

      const contactInfo = {peerId, boxPublicKey: parsed.boxPublicKey};
      saveContact(peerId, contactInfo);
      upsertContact(peerId, contactInfo);

      rtcManager.on('connected', connPeerId => {
        if (connPeerId !== peerId) return;
        setConnState(peerId, 'connected');
        setStep('done');
        setTimeout(() => nav.replace('Chat', {peerId}), 500);
      });
    } catch (e) {
      Alert.alert('Error', e.message);
      setScanned(false);
      setStep('showOffer');
    }
  }, [scanned, upsertContact, setConnState, nav]);

  const isShowAnswer = step === 'showAnswer';
  const isScanMode   = tab === 1 && !isShowAnswer;

  return (
    <ScrollView
      style={[s.root, {paddingTop: insets.top}]}
      contentContainerStyle={s.content}
      keyboardShouldPersistTaps="handled">

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => nav.goBack()}>
          <Text style={s.backIcon}>‹</Text>
        </TouchableOpacity>
        <Text style={s.title}>New Connection</Text>
        <View style={{width: 32}} />
      </View>

      {/* Tabs */}
      <View style={s.tabs}>
        {TABS.map((t, i) => (
          <TouchableOpacity
            key={t}
            style={[s.tab, tab === i && s.tabActive]}
            onPress={() => { setTab(i); setStep('idle'); setScanned(false); }}>
            <Text style={[s.tabTxt, tab === i && s.tabTxtActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── CREATE OFFER (Tab 0) ─────────────────────────────── */}
      {tab === 0 && !isShowAnswer && (
        <View style={s.panel}>
          <Text style={s.panelTitle}>Your invite</Text>
          <Text style={s.panelSub}>
            Generate an invite and share it or show the QR.{'\n'}
            The other person scans it and sends back a QR for you to scan.
          </Text>

          {step === 'idle' && (
            <TouchableOpacity style={s.primaryBtn} onPress={createOffer}>
              <Text style={s.primaryBtnTxt}>Generate Invite</Text>
            </TouchableOpacity>
          )}

          {step === 'creating' && (
            <View style={s.loadingBox}>
              <ActivityIndicator color={colors.accent} size="large" />
              <Text style={s.loadingTxt}>Generating secure offer…</Text>
            </View>
          )}

          {step === 'showOffer' && offerData && (
            <>
              <View style={s.qrBox}>
                <QRCode
                  value={offerData}
                  size={220}
                  backgroundColor="#FFFFFF"
                  color="#0D0D14"
                  quietZone={14}
                />
              </View>
              <Text style={s.qrHint}>
                Have them scan this, or share the link below
              </Text>
              <TouchableOpacity style={s.secondaryBtn} onPress={shareInvite}>
                <Text style={s.secondaryBtnTxt}>Share Invite Link</Text>
              </TouchableOpacity>
              <View style={s.divider}>
                <View style={s.divLine} />
                <Text style={s.divTxt}>Then</Text>
                <View style={s.divLine} />
              </View>
              <Text style={s.scanInstructTxt}>
                After they send you back a QR, tap Scan and scan their answer.
              </Text>
              <TouchableOpacity
                style={s.primaryBtn}
                onPress={() => { setTab(1); setScanned(false); }}>
                <Text style={s.primaryBtnTxt}>Scan Their Answer QR</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

      {/* ── SHOW ANSWER (Bob after scanning offer) ────────────── */}
      {isShowAnswer && answerData && (
        <View style={s.panel}>
          <Text style={s.panelTitle}>Your answer</Text>
          <Text style={s.panelSub}>
            Have the other person scan this QR to complete the connection.
          </Text>
          <View style={s.qrBox}>
            <QRCode
              value={answerData}
              size={220}
              backgroundColor="#FFFFFF"
              color="#0D0D14"
              quietZone={14}
            />
          </View>
          {step === 'done' && (
            <View style={s.successBox}>
              <Text style={s.successIcon}>✓</Text>
              <Text style={s.successTxt}>Connected!</Text>
            </View>
          )}
        </View>
      )}

      {/* ── SCAN (Tab 1) ─────────────────────────────────────── */}
      {isScanMode && (
        <View style={s.panel}>
          <Text style={s.panelTitle}>
            {step === 'showOffer' ? 'Scan their answer' : 'Scan their invite'}
          </Text>
          <Text style={s.panelSub}>
            Point your camera at the other person's Ghost QR code.
          </Text>
          <View style={s.cameraWrap}>
            <RNCamera
              style={s.camera}
              type={RNCamera.Constants.Type.back}
              onBarCodeRead={({data}) =>
                step === 'showOffer' ? handleScanAnswer(data) : handleScanOffer(data)
              }
              barCodeTypes={[RNCamera.Constants.BarCodeType.qr]}
              captureAudio={false}>
              <View style={s.crosshair} />
            </RNCamera>
          </View>
          {(step === 'creating') && (
            <View style={s.loadingBox}>
              <ActivityIndicator color={colors.accent} />
              <Text style={s.loadingTxt}>Processing…</Text>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root:          {flex: 1, backgroundColor: colors.bg},
  content:       {paddingBottom: 60},
  header:        {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
  },
  backIcon:      {fontSize: 30, color: colors.accent, fontWeight: '300'},
  title:         {fontSize: 17, fontWeight: '700', color: colors.text},
  tabs:          {
    flexDirection: 'row', marginHorizontal: 20, marginBottom: 20,
    backgroundColor: colors.surface, borderRadius: radius.full,
    padding: 4, borderWidth: 1, borderColor: colors.border,
  },
  tab:           {flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: radius.full},
  tabActive:     {backgroundColor: colors.accent},
  tabTxt:        {fontSize: 14, fontWeight: '600', color: colors.textSub},
  tabTxtActive:  {color: '#FFF'},
  panel:         {paddingHorizontal: 20, gap: 14},
  panelTitle:    {fontSize: 20, fontWeight: '700', color: colors.text},
  panelSub:      {fontSize: 14, color: colors.textSub, lineHeight: 20},
  primaryBtn:    {
    backgroundColor: colors.accent, borderRadius: radius.full,
    paddingVertical: 15, alignItems: 'center',
  },
  primaryBtnTxt: {color: '#FFF', fontWeight: '700', fontSize: 16},
  secondaryBtn:  {
    backgroundColor: colors.surface2, borderRadius: radius.full,
    paddingVertical: 14, alignItems: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  secondaryBtnTxt:{color: colors.accent, fontWeight: '600', fontSize: 15},
  loadingBox:    {alignItems: 'center', gap: 10, paddingVertical: 20},
  loadingTxt:    {color: colors.textSub, fontSize: 14},
  qrBox:         {
    backgroundColor: '#FFF', borderRadius: 20, padding: 16,
    alignSelf: 'center', elevation: 8,
    shadowColor: colors.accent, shadowOpacity: 0.3, shadowRadius: 20,
  },
  qrHint:        {fontSize: 13, color: colors.textSub, textAlign: 'center'},
  divider:       {flexDirection: 'row', alignItems: 'center', gap: 10},
  divLine:       {flex: 1, height: 1, backgroundColor: colors.border},
  divTxt:        {color: colors.textMuted, fontSize: 12},
  scanInstructTxt:{fontSize: 13, color: colors.textSub, textAlign: 'center'},
  cameraWrap:    {borderRadius: 16, overflow: 'hidden', height: 300},
  camera:        {flex: 1, alignItems: 'center', justifyContent: 'center'},
  crosshair:     {
    width: 200, height: 200, borderWidth: 2,
    borderColor: colors.accent, borderRadius: 12,
  },
  successBox:    {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8},
  successIcon:   {fontSize: 24, color: colors.green},
  successTxt:    {fontSize: 20, fontWeight: '700', color: colors.green},
});
