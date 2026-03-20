import React, {useState, useEffect} from 'react';
import {View, Text, TouchableOpacity, StyleSheet, Vibration} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useNavigation, useRoute} from '@react-navigation/native';
import InCallManager from 'react-native-incall-manager';
import rtcManager from '../p2p/WebRTCManager';
import {useStore} from '../store/useStore';
import Avatar from '../components/Avatar';
import {colors, radius} from '../theme';

export default function CallScreen() {
  const nav    = useNavigation();
  const route  = useRoute();
  const insets = useSafeAreaInsets();
  const {peerId, mode} = route.params; // mode: 'outgoing' | 'incoming'
  const {contacts} = useStore();
  const contact = contacts[peerId] ?? {peerId};
  const name    = contact.nickname ?? peerId.slice(0, 14) + '…';

  const [status,  setStatus]  = useState(mode === 'outgoing' ? 'Calling…' : 'Incoming call');
  const [elapsed, setElapsed] = useState(0);
  const [muted,   setMuted]   = useState(false);
  const [speaker, setSpeaker] = useState(false);
  const [timer,   setTimer]   = useState(null);

  useEffect(() => {
    if (mode === 'incoming') Vibration.vibrate([400, 300, 400], true);

    if (mode === 'outgoing') {
      // Start call — add audio track to peer connection
      rtcManager.startCall(peerId).catch(() => {
        setStatus('Failed to access microphone');
      });
    }

    const onConnected = () => {
      Vibration.cancel();
      InCallManager.start({media: 'audio', auto: true});
      setStatus('Connected');
      const t = setInterval(() => setElapsed(e => e + 1), 1000);
      setTimer(t);
    };

    const onEnded = () => {
      Vibration.cancel();
      InCallManager.stop();
      clearInterval(timer);
      setStatus('Call ended');
      setTimeout(() => nav.goBack(), 1200);
    };

    rtcManager.on('remoteStream', ({peerId: id}) => {
      if (id === peerId) onConnected();
    });
    // Simple: treat data channel open as "call connected" if already in call
    rtcManager.on('channelOpen', id => {
      if (id === peerId && mode === 'outgoing') onConnected();
    });

    return () => {
      clearInterval(timer);
      Vibration.cancel();
    };
  }, [peerId]);

  const fmtTime = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  const handleAnswer = () => {
    Vibration.cancel();
    rtcManager.startCall(peerId).catch(() => {});
    setStatus('Connecting…');
  };

  const handleHangup = () => {
    rtcManager.endCall(peerId);
    rtcManager.send(peerId, {type: 'call_end'});
    InCallManager.stop();
    clearInterval(timer);
    nav.goBack();
  };

  const toggleMute = () => {
    setMuted(m => {
      const next = !m;
      const conn = rtcManager.conns.get(peerId);
      conn?.localStream?.getAudioTracks().forEach(t => {t.enabled = !next;});
      return next;
    });
  };

  return (
    <View style={[s.root, {paddingTop: insets.top, paddingBottom: insets.bottom + 20}]}>
      {/* Avatar + name */}
      <View style={s.top}>
        <Avatar peerId={peerId} nickname={contact.nickname} size={96} />
        <Text style={s.name}>{name}</Text>
        <Text style={s.status}>{status}</Text>
        {elapsed > 0 && <Text style={s.timer}>{fmtTime(elapsed)}</Text>}
        <Text style={s.encrypted}>🔒 End-to-end encrypted · no phone number</Text>
      </View>

      {/* Controls */}
      <View style={s.controls}>
        {status === 'Connected' ? (
          <>
            <CallBtn icon={muted ? '🔇' : '🎤'} label={muted ? 'Unmute' : 'Mute'}
              onPress={toggleMute} active={muted} />
            <CallBtn icon="📵" label="End" onPress={handleHangup} red />
            <CallBtn icon="🔊" label="Speaker" onPress={() => setSpeaker(v => {
              InCallManager.setSpeakerphoneOn(!v); return !v;
            })} active={speaker} />
          </>
        ) : mode === 'incoming' && status === 'Incoming call' ? (
          <>
            <CallBtn icon="📞" label="Answer" onPress={handleAnswer} green />
            <CallBtn icon="📵" label="Decline" onPress={handleHangup} red />
          </>
        ) : (
          <CallBtn icon="📵" label="Cancel" onPress={handleHangup} red />
        )}
      </View>
    </View>
  );
}

function CallBtn({icon, label, onPress, red, green, active}) {
  const bg = red ? '#5E1B1B' : green ? '#1B3A2A' : active ? colors.accentDim : colors.surface2;
  return (
    <TouchableOpacity style={[s.btn, {backgroundColor: bg}]} onPress={onPress}>
      <Text style={s.btnIcon}>{icon}</Text>
      <Text style={s.btnLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  root:      {flex: 1, backgroundColor: '#060610', alignItems: 'center', justifyContent: 'space-between'},
  top:       {alignItems: 'center', gap: 10, paddingTop: 60},
  name:      {fontSize: 26, fontWeight: '800', color: colors.text},
  status:    {fontSize: 16, color: colors.textSub},
  timer:     {fontSize: 24, color: colors.green, fontWeight: '700', fontVariant: ['tabular-nums']},
  encrypted: {fontSize: 12, color: colors.textMuted, marginTop: 4},
  controls:  {flexDirection: 'row', gap: 16, paddingBottom: 10},
  btn:       {
    width: 80, height: 80, borderRadius: 40,
    alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  btnIcon:   {fontSize: 28},
  btnLabel:  {fontSize: 10, color: colors.textSub},
});
