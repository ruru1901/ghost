/**
 * Ghost – Voice Message
 * Hold to record, release to send.
 * Audio encrypted as blob before sending, just like images.
 */
import React, {useState, useRef, useCallback} from 'react';
import {
  View, TouchableOpacity, StyleSheet, Text,
  Animated, Alert,
} from 'react-native';
import AudioRecorderPlayer from 'react-native-audio-recorder-player';
import RNFS from 'react-native-fs';
import {colors, radius} from '../theme';

const recorder = new AudioRecorderPlayer();

// ── Recorder button (in chat input bar) ──────────────────────────

export function VoiceRecordButton({onSend, disabled}) {
  const [recording, setRecording] = useState(false);
  const [duration,  setDuration]  = useState(0);
  const pulse = useRef(new Animated.Value(1)).current;
  const loop  = useRef(null);

  const startPulse = () => {
    loop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {toValue: 1.25, duration: 600, useNativeDriver: true}),
        Animated.timing(pulse, {toValue: 1,    duration: 600, useNativeDriver: true}),
      ]),
    );
    loop.current.start();
  };

  const stopPulse = () => {
    loop.current?.stop();
    pulse.setValue(1);
  };

  const startRec = useCallback(async () => {
    try {
      const path = `${RNFS.TemporaryDirectoryPath}/ghost_voice_${Date.now()}.m4a`;
      await recorder.startRecorder(path);
      recorder.addRecordBackListener(e => setDuration(Math.floor(e.currentPosition / 1000)));
      setRecording(true);
      setDuration(0);
      startPulse();
    } catch (e) {
      Alert.alert('Microphone error', e.message);
    }
  }, []);

  const stopRec = useCallback(async () => {
    stopPulse();
    setRecording(false);
    recorder.removeRecordBackListener();

    try {
      const path = await recorder.stopRecorder();
      if (duration < 1) {
        // Too short — discard
        await RNFS.unlink(path).catch(() => {});
        return;
      }
      // Read raw bytes and pass to parent for encryption + send
      const b64  = await RNFS.readFile(path, 'base64');
      const data = new Uint8Array(Buffer.from(b64, 'base64'));
      await RNFS.unlink(path).catch(() => {});
      onSend(data, 'audio/m4a', duration);
    } catch (e) {
      Alert.alert('Recording error', e.message);
    }
  }, [duration, onSend]);

  const fmtDur = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <View style={s.wrap}>
      {recording && (
        <View style={s.recInfo}>
          <View style={s.redDot} />
          <Text style={s.recDur}>{fmtDur(duration)}</Text>
          <Text style={s.recHint}>Release to send · slide to cancel</Text>
        </View>
      )}
      <Animated.View style={{transform: [{scale: pulse}]}}>
        <TouchableOpacity
          style={[s.btn, recording && s.btnActive, disabled && s.btnDisabled]}
          onPressIn={startRec}
          onPressOut={stopRec}
          disabled={disabled}
          delayLongPress={0}>
          <Text style={s.btnIcon}>{recording ? '⏹' : '🎙'}</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

// ── Voice message bubble content ──────────────────────────────────

export function VoiceMessagePlayer({uri, duration, isOwn}) {
  const [playing,  setPlaying]  = useState(false);
  const [position, setPosition] = useState(0);
  const [total,    setTotal]    = useState(duration ?? 0);

  const play = useCallback(async () => {
    if (playing) {
      await recorder.pausePlayer();
      setPlaying(false);
      return;
    }
    try {
      await recorder.startPlayer(uri);
      recorder.addPlayBackListener(e => {
        setPosition(Math.floor(e.currentPosition / 1000));
        setTotal(Math.floor(e.duration / 1000));
        if (e.currentPosition >= e.duration) {
          setPlaying(false);
          setPosition(0);
          recorder.removePlayBackListener();
        }
      });
      setPlaying(true);
    } catch (_) {}
  }, [uri, playing]);

  const fmtT = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const progress = total > 0 ? position / total : 0;

  return (
    <View style={[p.wrap, isOwn && p.wrapOwn]}>
      <TouchableOpacity style={p.playBtn} onPress={play}>
        <Text style={p.playIcon}>{playing ? '⏸' : '▶'}</Text>
      </TouchableOpacity>

      {/* Waveform bar (static decorative) */}
      <View style={p.waveWrap}>
        <View style={p.waveBg} />
        <View style={[p.waveFill, {width: `${progress * 100}%`}]} />
      </View>

      <Text style={[p.dur, isOwn && p.durOwn]}>
        {playing ? fmtT(position) : fmtT(total)}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap:       {alignItems: 'center'},
  recInfo:    {
    position: 'absolute', bottom: 56, left: -80, right: -80,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.surface, borderRadius: radius.md,
    paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: colors.border,
  },
  redDot:     {width: 8, height: 8, borderRadius: 4, backgroundColor: colors.red},
  recDur:     {fontSize: 13, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums']},
  recHint:    {fontSize: 10, color: colors.textMuted, flex: 1},
  btn:        {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.surface3,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  btnActive:  {backgroundColor: colors.red},
  btnDisabled:{opacity: 0.4},
  btnIcon:    {fontSize: 20},
});

const p = StyleSheet.create({
  wrap:    {
    flexDirection: 'row', alignItems: 'center',
    gap: 8, paddingVertical: 4, minWidth: 160,
  },
  wrapOwn: {},
  playBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  playIcon:{fontSize: 16, color: '#FFF'},
  waveWrap:{flex: 1, height: 4, position: 'relative', justifyContent: 'center'},
  waveBg:  {
    position: 'absolute', left: 0, right: 0, height: 4,
    borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)',
  },
  waveFill:{height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.85)'},
  dur:     {fontSize: 11, color: 'rgba(255,255,255,0.7)', fontVariant: ['tabular-nums']},
  durOwn:  {},
});
