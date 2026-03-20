/**
 * Ghost – Onboarding Screen
 * Shown only on first launch. Explains Ghost, shows peer ID, leads to Home.
 */
import React, {useState, useRef} from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Dimensions, Animated,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import {MMKV} from 'react-native-mmkv';
import {useStore} from '../store/useStore';
import {colors, radius, font} from '../theme';

const {width: W} = Dimensions.get('window');
const meta = new MMKV({id: 'ghost_meta'});

export function hasSeenOnboarding() {
  return meta.getBoolean('onboarded') === true;
}
export function markOnboardingDone() {
  meta.set('onboarded', true);
}

const SLIDES = [
  {
    icon: '👻',
    title: 'Welcome to Ghost',
    body:  'Anonymous P2P messaging. No account. No phone number. No server. Your identity is a cryptographic keypair — generated right now, stored only on this device.',
  },
  {
    icon: '🔐',
    title: 'End-to-end encrypted',
    body:  'Every message is encrypted with X25519 key exchange before it leaves your device. Even if someone intercepts the connection, they see only noise.',
  },
  {
    icon: '📡',
    title: 'Direct peer-to-peer',
    body:  'Messages travel directly between devices using WebRTC. Tap ＋ on the home screen, show your QR code or scan theirs — connected in seconds.',
  },
  {
    icon: '🛡️',
    title: 'Privacy by default',
    body:  'Screenshots blocked. Messages not selectable. Media encrypted at rest. Delete a chat and it wipes on both devices simultaneously.',
  },
  {
    icon: '📴',
    title: 'Works offline too',
    body:  "Send a message even if your contact is offline. Ghost queues it and delivers automatically when they come back online — no push server needed.",
  },
];

export default function OnboardingScreen() {
  const nav    = useNavigation();
  const insets = useSafeAreaInsets();
  const {identity} = useStore();
  const [page, setPage] = useState(0);
  const scrollRef = useRef(null);

  const goNext = () => {
    if (page < SLIDES.length - 1) {
      scrollRef.current?.scrollTo({x: (page + 1) * W, animated: true});
      setPage(page + 1);
    } else {
      markOnboardingDone();
      nav.replace('Home');
    }
  };

  const isLast = page === SLIDES.length - 1;

  return (
    <View style={[s.root, {paddingBottom: insets.bottom + 24}]}>
      {/* Slides */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={e => {
          setPage(Math.round(e.nativeEvent.contentOffset.x / W));
        }}>
        {SLIDES.map((slide, i) => (
          <View key={i} style={[s.slide, {width: W}]}>
            <Text style={s.slideIcon}>{slide.icon}</Text>
            <Text style={s.slideTitle}>{slide.title}</Text>
            <Text style={s.slideBody}>{slide.body}</Text>

            {/* Show peer ID on last slide */}
            {i === SLIDES.length - 1 && identity?.peerId && (
              <View style={s.peerIdBox}>
                <Text style={s.peerIdLabel}>Your anonymous Peer ID</Text>
                <Text style={s.peerIdVal} numberOfLines={2}>
                  {identity.peerId}
                </Text>
                <Text style={s.peerIdSub}>
                  This is your permanent address. Share it via QR — never via plain text.
                </Text>
              </View>
            )}
          </View>
        ))}
      </ScrollView>

      {/* Dots */}
      <View style={s.dots}>
        {SLIDES.map((_, i) => (
          <View key={i} style={[s.dot, i === page && s.dotActive]} />
        ))}
      </View>

      {/* Button */}
      <TouchableOpacity style={s.btn} onPress={goNext}>
        <Text style={s.btnTxt}>{isLast ? "Let's go →" : 'Next'}</Text>
      </TouchableOpacity>

      {/* Skip */}
      {!isLast && (
        <TouchableOpacity onPress={() => { markOnboardingDone(); nav.replace('Home'); }}>
          <Text style={s.skip}>Skip</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root:       {flex: 1, backgroundColor: colors.bg, alignItems: 'center'},
  slide:      {
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 36, gap: 16,
  },
  slideIcon:  {fontSize: 72},
  slideTitle: {...font.h1, textAlign: 'center'},
  slideBody:  {
    fontSize: 16, color: colors.textSub, textAlign: 'center',
    lineHeight: 24, marginTop: 4,
  },
  peerIdBox:  {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: 16, width: '100%', marginTop: 12,
    borderWidth: 1, borderColor: colors.accentDim,
  },
  peerIdLabel:{fontSize: 11, color: colors.textMuted, marginBottom: 6,
               letterSpacing: 1, textTransform: 'uppercase'},
  peerIdVal:  {
    fontSize: 12, fontFamily: 'monospace', color: colors.accent,
    lineHeight: 18,
  },
  peerIdSub:  {fontSize: 11, color: colors.textMuted, marginTop: 6},
  dots:       {flexDirection: 'row', gap: 8, marginBottom: 24},
  dot:        {width: 7, height: 7, borderRadius: 4, backgroundColor: colors.surface3},
  dotActive:  {backgroundColor: colors.accent, width: 22},
  btn:        {
    backgroundColor: colors.accent, borderRadius: radius.full,
    paddingHorizontal: 48, paddingVertical: 16,
    width: W - 48, alignItems: 'center',
  },
  btnTxt:     {color: '#FFF', fontWeight: '800', fontSize: 17},
  skip:       {color: colors.textMuted, fontSize: 14, marginTop: 14, padding: 8},
});
