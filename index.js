import './src/shims'; // must be first — polyfills atob, Buffer, TextEncoder for Hermes
import React, {useEffect, useState, useCallback} from 'react';
import {NavigationContainer, DarkTheme} from '@react-navigation/native';
import {createStackNavigator} from '@react-navigation/stack';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {View, Text, StyleSheet, ActivityIndicator, Alert} from 'react-native';

import HomeScreen        from './src/screens/HomeScreen';
import ChatScreen        from './src/screens/ChatScreen';
import ConnectScreen     from './src/screens/ConnectScreen';
import CallScreen        from './src/screens/CallScreen';
import SettingsScreen    from './src/screens/SettingsScreen';
import MediaViewerScreen from './src/screens/MediaViewerScreen';
import BackupScreen      from './src/screens/BackupScreen';
import OnboardingScreen, {hasSeenOnboarding} from './src/screens/OnboardingScreen';
import AppLockScreen, {isLockEnabled, useAppLock} from './src/screens/AppLockScreen';
import SearchScreen      from './src/screens/SearchScreen';

import {loadOrCreateIdentity}        from './src/crypto';
import rtcManager                    from './src/p2p/WebRTCManager';
import {connManager}                 from './src/p2p/ConnectionManager';
import {getContactIds}               from './src/storage';
import {useStore}                    from './src/store/useStore';
import {colors}                      from './src/theme';
import {armPanicWipe}                from './src/services/PanicWipe';
import {setupNotifications} from './src/services/NotificationService';

const Stack = createStackNavigator();

const Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg,
    card:       colors.surface,
    text:       colors.text,
    border:     colors.border,
    primary:    colors.accent,
  },
};

function SplashScreen() {
  return (
    <View style={s.splash}>
      <Text style={s.splashIcon}>👻</Text>
      <Text style={s.splashTitle}>Ghost</Text>
      <ActivityIndicator color={colors.accent} style={{marginTop: 28}} />
    </View>
  );
}

export default function App() {
  const [ready,    setReady]    = useState(false);
  const [locked,   setLocked]   = useState(false);
  const [wiped,    setWiped]    = useState(false);
  const navRef = React.useRef(null);

  const {setIdentity, setConnState, setIncomingCall, updateMsgStatus} = useStore();

  // App lock — triggers after 30s in background
  useAppLock(useCallback(() => {
    if (isLockEnabled()) setLocked(true);
  }, []));

  useEffect(() => {
    async function boot() {
      // 1. Identity
      const identity = await loadOrCreateIdentity();
      setIdentity(identity);
      rtcManager.setIdentity(identity.peerId, identity.boxSecretKey);

      // 2. Contacts → ConnectionManager
      const savedPeerIds = getContactIds();
      connManager.start(savedPeerIds);

      // 3. Events
      connManager.on('peer:online',  peerId => setConnState(peerId, 'connected'));
      connManager.on('peer:offline', peerId => setConnState(peerId, 'offline'));
      connManager.on('ack', msgId => {
        const {chats} = useStore.getState();
        for (const [pid, msgs] of Object.entries(chats)) {
          if (msgs.some(m => m.id === msgId)) {
            updateMsgStatus(pid, msgId, 'delivered');
            break;
          }
        }
      });

      rtcManager.on('connected',    peerId => setConnState(peerId, 'connected'));
      rtcManager.on('disconnected', peerId => setConnState(peerId, 'offline'));

      // 4. Incoming call
      rtcManager.on('message', ({peerId, type}) => {
        if (type === 'call_offer') {
          setIncomingCall(peerId);
          navRef.current?.navigate('Call', {peerId, mode: 'incoming'});
        }
        if (type === 'call_end') useStore.getState().clearIncomingCall();
      });

      // 5. Notifications setup
      setupNotifications(peerId => {
        navRef.current?.navigate('Chat', {peerId});
      });

      // 6. Panic wipe (shake)
      armPanicWipe(() => setWiped(true));

      // 7. App lock on start if enabled
      if (isLockEnabled()) setLocked(true);

      setReady(true);
    }

    boot().catch(e => Alert.alert('Startup error', e.message));

    return () => {
      connManager.stop();
      rtcManager.closeAll();
    };
  }, []);

  // Wiped state — show blank screen
  if (wiped) {
    return (
      <View style={s.splash}>
        <Text style={s.splashIcon}>🗑</Text>
        <Text style={s.splashTitle}>Ghost wiped</Text>
        <Text style={s.splashSub}>Restart the app to generate a new identity.</Text>
      </View>
    );
  }

  if (!ready) return <SplashScreen />;

  // Locked state — show lock screen over everything
  if (locked) {
    return (
      <GestureHandlerRootView style={{flex: 1}}>
        <SafeAreaProvider>
          <AppLockScreen onUnlock={() => setLocked(false)} />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{flex: 1}}>
      <SafeAreaProvider>
        <NavigationContainer theme={Theme} ref={navRef}>
          <Stack.Navigator
            initialRouteName={hasSeenOnboarding() ? 'Home' : 'Onboarding'}
            screenOptions={{headerShown: false, cardStyle: {backgroundColor: colors.bg}}}>

            <Stack.Screen name="Onboarding"   component={OnboardingScreen} />
            <Stack.Screen name="Home"         component={HomeScreen} />
            <Stack.Screen name="Chat"         component={ChatScreen} />
            <Stack.Screen name="Connect"      component={ConnectScreen} />
            <Stack.Screen name="Settings"     component={SettingsScreen} />
            <Stack.Screen name="Backup"       component={BackupScreen} />
            <Stack.Screen name="Search"       component={SearchScreen} />
            <Stack.Screen
              name="MediaViewer"
              component={MediaViewerScreen}
              options={{presentation: 'modal', cardStyle: {backgroundColor: '#000'}}}
            />
            <Stack.Screen
              name="Call"
              component={CallScreen}
              options={{presentation: 'modal', cardStyle: {backgroundColor: '#060610'}}}
            />
          </Stack.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const s = StyleSheet.create({
  splash:      {flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center'},
  splashIcon:  {fontSize: 72},
  splashTitle: {fontSize: 36, fontWeight: '900', color: colors.text, marginTop: 12, letterSpacing: -1},
  splashSub:   {fontSize: 13, color: colors.textMuted, marginTop: 12, textAlign: 'center', paddingHorizontal: 40},
});
