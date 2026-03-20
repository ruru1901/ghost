/**
 * Ghost – Media Viewer Screen
 * Fullscreen viewer for images and videos.
 * No save, no share, no system access — Ghost-only.
 * Video uses react-native-video with controls.
 */
import React, {useState, useEffect, useRef} from 'react';
import {
  View, Image, StyleSheet, TouchableOpacity,
  Text, ActivityIndicator, Alert, StatusBar, Dimensions,
} from 'react-native';
import Video from 'react-native-video';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useNavigation, useRoute} from '@react-navigation/native';
import {loadMedia} from '../storage';
import {colors} from '../theme';

const {width: W, height: H} = Dimensions.get('window');

export default function MediaViewerScreen() {
  const nav    = useNavigation();
  const route  = useRoute();
  const insets = useSafeAreaInsets();

  // params: {peerId, mediaId, mimeType, localUri}
  const {peerId, mediaId, mimeType, localUri} = route.params;

  const [uri,     setUri]     = useState(localUri ?? null);
  const [loading, setLoading] = useState(!localUri);
  const [paused,  setPaused]  = useState(false);
  const [error,   setError]   = useState(null);
  const [showControls, setShowControls] = useState(true);
  const controlTimer = useRef(null);

  const isVideo = mimeType?.startsWith('video/');
  const isImage = mimeType?.startsWith('image/');

  // ── Load encrypted media if no local URI ────────────────────
  useEffect(() => {
    if (uri) return;
    if (!peerId || !mediaId) { setError('Missing media reference'); return; }

    setLoading(true);
    loadMedia(peerId, mediaId)
      .then(({data, mimeType: mt}) => {
        // data is Uint8Array — convert to base64 data URI
        const b64   = btoa(String.fromCharCode(...data));
        const mime  = mt ?? mimeType ?? 'image/jpeg';
        setUri(`data:${mime};base64,${b64}`);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [peerId, mediaId]);

  // ── Auto-hide controls after 3s ──────────────────────────────
  useEffect(() => {
    if (!isVideo) return;
    resetControlTimer();
    return () => clearTimeout(controlTimer.current);
  }, [isVideo]);

  function resetControlTimer() {
    clearTimeout(controlTimer.current);
    setShowControls(true);
    if (isVideo) {
      controlTimer.current = setTimeout(() => setShowControls(false), 3000);
    }
  }

  function handleTap() {
    if (isVideo) { resetControlTimer(); }
  }

  // ── Render ───────────────────────────────────────────────────
  return (
    <View style={s.root}>
      <StatusBar hidden />

      {/* Loading */}
      {loading && (
        <View style={s.center}>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={s.loadingTxt}>Decrypting media…</Text>
        </View>
      )}

      {/* Error */}
      {error && (
        <View style={s.center}>
          <Text style={s.errorIcon}>⚠️</Text>
          <Text style={s.errorTxt}>{error}</Text>
        </View>
      )}

      {/* Image */}
      {!loading && !error && uri && isImage && (
        <TouchableOpacity activeOpacity={1} onPress={handleTap} style={s.mediaWrap}>
          <Image
            source={{uri}}
            style={s.image}
            resizeMode="contain"
            onError={() => setError('Failed to display image')}
          />
        </TouchableOpacity>
      )}

      {/* Video */}
      {!loading && !error && uri && isVideo && (
        <TouchableOpacity activeOpacity={1} onPress={handleTap} style={s.mediaWrap}>
          <Video
            source={{uri}}
            style={s.video}
            paused={paused}
            resizeMode="contain"
            repeat={false}
            controls={false}       // custom controls below
            onError={e => setError(e.error?.localizedDescription ?? 'Video error')}
            onEnd={() => setPaused(true)}
          />

          {/* Custom controls overlay */}
          {showControls && (
            <View style={s.videoControls}>
              <TouchableOpacity
                style={s.playBtn}
                onPress={() => { setPaused(p => !p); resetControlTimer(); }}>
                <Text style={s.playBtnIcon}>{paused ? '▶' : '⏸'}</Text>
              </TouchableOpacity>
            </View>
          )}
        </TouchableOpacity>
      )}

      {/* Header — always visible */}
      <View style={[s.header, {paddingTop: insets.top + 8}]}>
        <TouchableOpacity style={s.closeBtn} onPress={() => nav.goBack()}>
          <Text style={s.closeBtnTxt}>✕</Text>
        </TouchableOpacity>

        <View style={s.headerMiddle}>
          <Text style={s.headerType}>{isVideo ? '🎬 Video' : '🖼 Image'}</Text>
          <Text style={s.headerSub}>Ghost encrypted · no save · no share</Text>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root:         {flex: 1, backgroundColor: '#000'},
  center:       {flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12},
  loadingTxt:   {color: colors.textSub, fontSize: 14},
  errorIcon:    {fontSize: 40},
  errorTxt:     {color: colors.red, fontSize: 14, textAlign: 'center', paddingHorizontal: 32},
  mediaWrap:    {flex: 1},
  image:        {width: W, height: H},
  video:        {width: W, height: H},
  videoControls:{
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  playBtn:      {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)',
  },
  playBtnIcon:  {fontSize: 28, color: '#FFF'},
  header:       {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
    gap: 12,
  },
  closeBtn:     {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  closeBtnTxt:  {color: '#FFF', fontSize: 16, fontWeight: '600'},
  headerMiddle: {flex: 1},
  headerType:   {fontSize: 14, fontWeight: '700', color: '#FFF'},
  headerSub:    {fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2},
});
