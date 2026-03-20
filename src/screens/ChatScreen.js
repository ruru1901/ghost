import React, {useState, useEffect, useRef, useCallback} from 'react';
import {
  View, TextInput, TouchableOpacity, FlatList,
  StyleSheet, Text, KeyboardAvoidingView, Platform,
  Alert, ActivityIndicator,
} from 'react-native';
import {useSafeAreaInsets}       from 'react-native-safe-area-context';
import {useNavigation, useRoute} from '@react-navigation/native';
import {launchImageLibrary}      from 'react-native-image-picker';
import {v4 as uuid}              from 'uuid';

import {useStore}                from '../store/useStore';
import {
  encryptMessage, decryptMessage,
  deriveWatermark, getIdentity,
}                                from '../crypto';
import {
  saveMessage, loadMessages,
  wipeChat, saveMedia, keyStore,
}                                from '../storage';
import rtcManager                from '../p2p/WebRTCManager';
import {connManager}             from '../p2p/ConnectionManager';
import {notifyMessage}           from '../services/NotificationService';
import {haptics}                 from '../services/Haptics';
import MessageBubble             from '../components/MessageBubble';
import Avatar                    from '../components/Avatar';
import {VoiceRecordButton}       from '../components/VoiceMessage';
import {
  TimerPickerModal, scheduleDestruct,
  clearScheduled, timerLabel,
}                                from '../components/AutoDestruct';
import {ReactionPicker}          from '../components/Reactions';
import {colors}                  from '../theme';

const TYPING_MS = 3000;

export default function ChatScreen() {
  const nav    = useNavigation();
  const route  = useRoute();
  const insets = useSafeAreaInsets();
  const {peerId} = route.params;

  const {
    contacts, chats, identity,
    addMessage, setMessages,
    updateMsgStatus, removeMessage,
    addReaction, nukeChat, connState,
  } = useStore();

  const contact   = contacts[peerId] ?? {peerId};
  const messages  = chats[peerId] ?? [];
  const sharedKey = keyStore.get(peerId);
  const isOnline  = connState[peerId] === 'connected';
  const name      = contact.nickname ?? peerId.slice(0, 14) + '…';

  const [text,        setText]        = useState('');
  const [sending,     setSending]     = useState(false);
  const [watermark,   setWmark]       = useState('');
  const [peerTyping,  setPeerTyping]  = useState(false);
  const [replyTo,     setReplyTo]     = useState(null);
  const [timerSecs,   setTimerSecs]   = useState(0);
  const [showTimer,   setShowTimer]   = useState(false);
  const [reactTarget, setReactTarget] = useState(null); // msg object for picker

  const listRef       = useRef(null);
  const typingTimer   = useRef(null);
  const peerTypTimer  = useRef(null);
  const typingSent    = useRef(false);

  // ── Boot: load messages + watermark ─────────────────────────
  useEffect(() => {
    if (sharedKey) {
      loadMessages(peerId, sharedKey).then(msgs => {
        if (msgs.length) setMessages(peerId, msgs);
      });
    }
    getIdentity().then(id => setWmark(deriveWatermark(peerId, id.peerId)));
  }, [peerId, sharedKey]);

  // ── Incoming P2P messages ───────────────────────────────────
  useEffect(() => {
    const onMsg = async (raw) => {
      const {peerId: from, type, nonce, ct, id: msgId, ts,
             mimeType, replyToId, destructSecs, emoji, from: reactor} = raw;

      if (from !== peerId) return;

      switch (type) {

        case 'delete':
          await wipeChat(peerId);
          nukeChat(peerId);
          nav.goBack();
          Alert.alert('Chat deleted', `${name} wiped this conversation.`);
          return;

        case 'ack':
          updateMsgStatus(peerId, msgId, 'delivered');
          connManager.confirmAck(msgId);
          return;

        case 'seen':
          updateMsgStatus(peerId, msgId, 'seen');
          return;

        case 'typing':
          setPeerTyping(true);
          clearTimeout(peerTypTimer.current);
          peerTypTimer.current = setTimeout(() => setPeerTyping(false), TYPING_MS + 500);
          return;

        case 'reaction':
          if (msgId && emoji && reactor) {
            addReaction(peerId, msgId, emoji, reactor);
          }
          return;

        case 'destruct':
          removeMessage(peerId, msgId);
          clearScheduled(msgId);
          return;

        case 'msg':
          if (!nonce || !ct || !sharedKey) return;
          try {
            const plain = decryptMessage(nonce, ct, sharedKey);
            const msg   = {
              id: msgId, text: plain, ts, mimeType,
              replyToId, destructSecs,
              isOwn: false, status: 'received',
            };
            addMessage(peerId, msg);
            saveMessage(peerId, msg, sharedKey);
            // ACK
            rtcManager.send(peerId, {type: 'ack', id: msgId});
            // Notification
            notifyMessage(peerId, contact.nickname, plain.slice(0, 60));
            haptics.success();
            // Auto-destruct schedule
            if (destructSecs) {
              scheduleDestruct(msgId, peerId, destructSecs, handleDestruct);
            }
          } catch (_) {}
          return;

        default: return;
      }
    };

    const onOnline  = id => { if (id === peerId) useStore.getState().setConnState(peerId, 'connected'); };
    const onOffline = id => { if (id === peerId) useStore.getState().setConnState(peerId, 'offline'); };

    rtcManager.on('message', onMsg);
    connManager.on('peer:online',  onOnline);
    connManager.on('peer:offline', onOffline);

    return () => {
      rtcManager.off('message', onMsg);
      connManager.off('peer:online',  onOnline);
      connManager.off('peer:offline', onOffline);
      clearTimeout(typingTimer.current);
      clearTimeout(peerTypTimer.current);
    };
  }, [peerId, sharedKey, name]);

  // ── Mark seen when chat open ────────────────────────────────
  useEffect(() => {
    messages.forEach(m => {
      if (!m.isOwn && m.status !== 'seen') {
        rtcManager.send(peerId, {type: 'seen', id: m.id});
        updateMsgStatus(peerId, m.id, 'seen');
      }
    });
  }, [messages.length]);

  // Auto-scroll
  useEffect(() => {
    setTimeout(() => listRef.current?.scrollToEnd({animated: false}), 80);
  }, [messages.length]);

  // ── Typing indicator ────────────────────────────────────────
  const handleTextChange = useCallback(val => {
    setText(val);
    if (!isOnline) return;
    if (!typingSent.current) {
      rtcManager.send(peerId, {type: 'typing', id: `t_${Date.now()}`});
      typingSent.current = true;
    }
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => { typingSent.current = false; }, TYPING_MS);
  }, [peerId, isOnline]);

  // ── Auto-destruct ───────────────────────────────────────────
  const handleDestruct = useCallback((msgId, pid) => {
    rtcManager.send(pid, {type: 'destruct', id: msgId});
    removeMessage(pid, msgId);
  }, [removeMessage]);

  // ── Send text ────────────────────────────────────────────────
  const sendText = useCallback(async () => {
    const body = text.trim();
    if (!body || !sharedKey || sending) return;
    setText('');
    setReplyTo(null);
    setSending(true);
    typingSent.current = false;

    const msgId   = uuid();
    const enc     = encryptMessage(body, sharedKey);
    const payload = {
      type: 'msg', id: msgId, ts: Date.now(), ...enc,
      replyToId:    replyTo?.id ?? null,
      destructSecs: timerSecs || null,
    };

    const outMsg = {
      id: msgId, text: body, ts: Date.now(),
      replyToId: replyTo?.id ?? null,
      destructSecs: timerSecs || null,
      isOwn: true, status: 'sending',
    };
    addMessage(peerId, outMsg);
    saveMessage(peerId, outMsg, sharedKey);

    if (timerSecs) scheduleDestruct(msgId, peerId, timerSecs, handleDestruct);

    const result = await connManager.send(peerId, payload);
    updateMsgStatus(peerId, msgId, result === 'sent' ? 'sent' : 'queued');
    haptics.medium();
    setSending(false);
  }, [text, peerId, sharedKey, sending, replyTo, timerSecs, handleDestruct]);

  // ── Send media ──────────────────────────────────────────────
  const sendMedia = useCallback(async () => {
    const res = await launchImageLibrary({mediaType: 'mixed', quality: 0.8, includeBase64: true});
    if (res.didCancel || !res.assets?.[0] || !sharedKey) return;
    const asset = res.assets[0];
    const mime  = asset.type ?? 'image/jpeg';
    if (!asset.base64) return;

    const msgId   = uuid();
    const bytes   = Buffer.from(asset.base64, 'base64');
    const mediaId = await saveMedia(peerId, new Uint8Array(bytes), mime);
    const outMsg  = {id: msgId, ts: Date.now(), mediaId, mimeType: mime, mediaUri: asset.uri, isOwn: true, status: 'sending'};
    addMessage(peerId, outMsg);
    saveMessage(peerId, outMsg, sharedKey);

    const enc     = encryptMessage(JSON.stringify({mediaId, mimeType: mime}), sharedKey);
    const r       = await connManager.send(peerId, {type: 'msg', id: msgId, ts: outMsg.ts, ...enc, mimeType: mime});
    updateMsgStatus(peerId, msgId, r === 'sent' ? 'sent' : 'queued');
    haptics.medium();
  }, [peerId, sharedKey]);

  // ── Send voice ───────────────────────────────────────────────
  const sendVoice = useCallback(async (data, mimeType, duration) => {
    if (!sharedKey) return;
    const msgId   = uuid();
    const mediaId = await saveMedia(peerId, data, mimeType);
    const outMsg  = {id: msgId, ts: Date.now(), mediaId, mimeType, duration, isOwn: true, status: 'sending'};
    addMessage(peerId, outMsg);
    saveMessage(peerId, outMsg, sharedKey);
    const enc = encryptMessage(JSON.stringify({mediaId, mimeType, duration}), sharedKey);
    const r   = await connManager.send(peerId, {type: 'msg', id: msgId, ts: outMsg.ts, ...enc, mimeType});
    updateMsgStatus(peerId, msgId, r === 'sent' ? 'sent' : 'queued');
    haptics.medium();
  }, [peerId, sharedKey]);

  // ── Send reaction ────────────────────────────────────────────
  const handleReact = useCallback((msgId, emoji) => {
    const myId = identity?.peerId ?? '';
    addReaction(peerId, msgId, emoji, myId);
    rtcManager.send(peerId, {
      type: 'reaction', id: `rx_${Date.now()}`,
      msgId, emoji, from: myId,
    });
    haptics.tap();
  }, [peerId, identity, addReaction]);

  // ── Delete chat ──────────────────────────────────────────────
  const deleteChat = useCallback(() => {
    Alert.alert('Delete everywhere', 'Wipes messages on both devices.', [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          haptics.heavy();
          rtcManager.send(peerId, {type: 'delete', id: uuid()});
          await wipeChat(peerId);
          nukeChat(peerId);
          nav.goBack();
        },
      },
    ]);
  }, [peerId, nav, nukeChat]);

  // ── Render ───────────────────────────────────────────────────
  const statusLabel = isOnline
    ? (peerTyping ? `${name} is typing…` : 'Connected · E2E encrypted')
    : 'Offline · messages will queue';

  return (
    <View style={[s.root, {paddingTop: insets.top}]}>

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => nav.goBack()} style={s.back}>
          <Text style={s.backIcon}>‹</Text>
        </TouchableOpacity>
        <Avatar peerId={peerId} nickname={contact.nickname} size={38} />
        <View style={s.hInfo}>
          <Text style={s.hName} numberOfLines={1}>{name}</Text>
          <View style={s.hSubRow}>
            <View style={[s.dot, {backgroundColor: isOnline ? colors.green : colors.textMuted}]} />
            <Text style={[s.hSubTxt, peerTyping && {color: colors.accent}]} numberOfLines={1}>
              {statusLabel}
            </Text>
          </View>
        </View>
        <TouchableOpacity style={s.hBtn} onPress={() => nav.navigate('Call', {peerId})}>
          <Text style={s.hBtnIcon}>📞</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.hBtn} onPress={() => nav.navigate('Settings', {peerId})}>
          <Text style={s.hBtnIcon}>⚙️</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.hBtn} onPress={deleteChat}>
          <Text style={s.hBtnIcon}>🗑</Text>
        </TouchableOpacity>
      </View>

      {/* Offline banner */}
      {!isOnline && (
        <View style={s.offlineBanner}>
          <Text style={s.offlineTxt}>
            ⏳ Peer offline — messages queued, will deliver when they reconnect
          </Text>
        </View>
      )}

      {/* Messages */}
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={m => m.id}
        renderItem={({item}) => (
          <MessageBubble
            message={item}
            isOwn={item.isOwn}
            watermark={watermark}
            myPeerId={identity?.peerId}
            replySource={item.replyToId ? messages.find(m => m.id === item.replyToId) : null}
            onMediaPress={msg => nav.navigate('MediaViewer', {
              peerId, mediaId: msg.mediaId,
              mimeType: msg.mimeType, localUri: msg.mediaUri,
            })}
            onSwipeReply={msg => { haptics.tap(); setReplyTo(msg); }}
            onReact={(msgId, emoji) => handleReact(msgId, emoji)}
            onLongPress={msg => setReactTarget(msg)}
          />
        )}
        contentContainerStyle={s.list}
        onContentSizeChange={() => listRef.current?.scrollToEnd({animated: true})}
      />

      {/* Reaction picker modal */}
      <ReactionPicker
        visible={!!reactTarget}
        onSelect={emoji => { if (reactTarget) handleReact(reactTarget.id, emoji); }}
        onClose={() => setReactTarget(null)}
      />

      {/* Reply preview bar */}
      {replyTo && (
        <View style={s.replyBar}>
          <View style={s.replyAccent} />
          <View style={s.replyContent}>
            <Text style={s.replyName}>{replyTo.isOwn ? 'You' : name}</Text>
            <Text style={s.replyText} numberOfLines={1}>
              {replyTo.text ?? (replyTo.mimeType?.startsWith('audio') ? '🎙 Voice' : '📎 Media')}
            </Text>
          </View>
          <TouchableOpacity onPress={() => setReplyTo(null)} style={s.replyClose}>
            <Text style={s.replyCloseTxt}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Timer picker */}
      <TimerPickerModal
        visible={showTimer}
        current={timerSecs}
        onSelect={setTimerSecs}
        onClose={() => setShowTimer(false)}
      />

      {/* Input bar */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[s.bar, {paddingBottom: insets.bottom || 10}]}>

          <TouchableOpacity style={s.iconBtn} onPress={() => setShowTimer(true)}>
            <Text style={[s.iconBtnTxt, timerSecs > 0 && {color: colors.accent}]}>⏱</Text>
            {timerSecs > 0 && <Text style={s.timerBadge}>{timerLabel(timerSecs)}</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={s.iconBtn} onPress={sendMedia}>
            <Text style={s.iconBtnTxt}>📎</Text>
          </TouchableOpacity>

          <TextInput
            style={s.input}
            value={text}
            onChangeText={handleTextChange}
            placeholder="Message…"
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={4000}
            autoCorrect={false}
            autoComplete="off"
            keyboardType="default"
            textContentType="none"
            importantForAutofill="no"
          />

          {text.trim() ? (
            <TouchableOpacity
              style={s.sendBtn}
              onPress={sendText}
              disabled={sending}>
              {sending
                ? <ActivityIndicator color="#FFF" size="small" />
                : <Text style={s.sendIcon}>↑</Text>
              }
            </TouchableOpacity>
          ) : (
            <VoiceRecordButton onSend={sendVoice} disabled={!sharedKey} />
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  root:         {flex: 1, backgroundColor: colors.bg},
  header:       {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border, gap: 8,
  },
  back:         {padding: 4},
  backIcon:     {fontSize: 30, color: colors.accent, fontWeight: '300'},
  hInfo:        {flex: 1},
  hName:        {fontSize: 15, fontWeight: '700', color: colors.text},
  hSubRow:      {flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1},
  dot:          {width: 7, height: 7, borderRadius: 4},
  hSubTxt:      {fontSize: 11, color: colors.textMuted, flex: 1},
  hBtn:         {padding: 6},
  hBtnIcon:     {fontSize: 20},
  offlineBanner:{
    backgroundColor: '#1A1200',
    borderBottomWidth: 1, borderBottomColor: '#3A2800',
    paddingHorizontal: 14, paddingVertical: 7,
  },
  offlineTxt:   {fontSize: 12, color: colors.yellow},
  list:         {paddingVertical: 12},
  replyBar:     {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface2,
    borderTopWidth: 1, borderTopColor: colors.accentDim,
    paddingHorizontal: 12, paddingVertical: 8, gap: 8,
  },
  replyAccent:  {width: 3, alignSelf: 'stretch', backgroundColor: colors.accent, borderRadius: 2},
  replyContent: {flex: 1},
  replyName:    {fontSize: 12, fontWeight: '700', color: colors.accent},
  replyText:    {fontSize: 12, color: colors.textSub},
  replyClose:   {padding: 4},
  replyCloseTxt:{color: colors.textMuted, fontSize: 16},
  bar:          {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: 10, paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: 6, backgroundColor: colors.bg,
  },
  iconBtn:      {padding: 8, alignItems: 'center'},
  iconBtnTxt:   {fontSize: 20},
  timerBadge:   {fontSize: 8, color: colors.accent, marginTop: -2},
  input:        {
    flex: 1, backgroundColor: colors.surface2,
    borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10,
    color: colors.text, fontSize: 15, maxHeight: 120,
    borderWidth: 1, borderColor: colors.border,
  },
  sendBtn:      {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  sendIcon:     {color: '#FFF', fontSize: 20, fontWeight: '700'},
});
