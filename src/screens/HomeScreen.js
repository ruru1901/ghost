import React, {useCallback} from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, StatusBar, Alert,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import {useStore} from '../store/useStore';
import {wipeChat} from '../storage';
import rtcManager from '../p2p/WebRTCManager';
import Avatar from '../components/Avatar';
import {colors, font, spacing, radius} from '../theme';
import dayjs from 'dayjs';

function ConvRow({item, onPress, onLongPress}) {
  const {peerId, contact, lastMsg, unread, online} = item;
  const name = contact?.nickname ?? peerId.slice(0, 12) + '…';
  const preview = lastMsg?.text ?? (lastMsg?.mimeType ? '📎 Media' : '');
  const time   = lastMsg ? dayjs(lastMsg.ts).format(
    dayjs().isSame(dayjs(lastMsg.ts), 'day') ? 'HH:mm' : 'MMM D',
  ) : '';

  return (
    <TouchableOpacity
      style={s.row}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.65}>
      <View>
        <Avatar peerId={peerId} nickname={contact?.nickname} size={50} />
        {online && <View style={s.onlineDot} />}
      </View>

      <View style={s.info}>
        <View style={s.rowTop}>
          <Text style={s.name} numberOfLines={1}>{name}</Text>
          <Text style={s.time}>{time}</Text>
        </View>
        <View style={s.rowBot}>
          <Text style={s.preview} numberOfLines={1}>{preview || 'Tap to open'}</Text>
          {unread > 0 && (
            <View style={s.badge}>
              <Text style={s.badgeTxt}>{unread > 9 ? '9+' : unread}</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function HomeScreen() {
  const nav    = useNavigation();
  const insets = useSafeAreaInsets();
  const {contacts, chats, connState, nukeChat} = useStore();

  const rows = Object.keys(contacts).map(peerId => ({
    peerId,
    contact:  contacts[peerId],
    lastMsg:  (chats[peerId] ?? []).at(-1),
    unread:   (chats[peerId] ?? []).filter(m => !m.isOwn && m.status !== 'read').length,
    online:   connState[peerId] === 'connected',
  })).sort((a, b) => (b.lastMsg?.ts ?? 0) - (a.lastMsg?.ts ?? 0));

  const openChat = useCallback(peerId => {
    useStore.getState().setActiveChat(peerId);
    nav.navigate('Chat', {peerId});
  }, [nav]);

  const longPress = useCallback(peerId => {
    Alert.alert('Delete conversation', 'Wipes messages on both devices instantly.', [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Delete everywhere', style: 'destructive',
        onPress: async () => {
          rtcManager.send(peerId, {type: 'delete'});
          await wipeChat(peerId);
          nukeChat(peerId);
        },
      },
    ]);
  }, [nukeChat]);

  return (
    <View style={[s.root, {paddingTop: insets.top}]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />

      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.logo}>👻 Ghost</Text>
          <Text style={s.tagline}>Anonymous · Encrypted · P2P</Text>
        </View>
        <View style={s.headerBtns}>
          <TouchableOpacity style={s.iconBtn} onPress={() => nav.navigate('Search')}>
            <Text style={s.iconBtnTxt}>🔍</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.iconBtn} onPress={() => nav.navigate('Connect')}>
            <Text style={s.iconBtnTxt}>＋</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.iconBtn} onPress={() => nav.navigate('Settings', {})}>
            <Text style={s.iconBtnTxt}>⚙</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* List */}
      {rows.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyIcon}>👻</Text>
          <Text style={s.emptyTitle}>No chats yet</Text>
          <Text style={s.emptySub}>
            Tap ＋ to connect with someone via QR code or invite link.{'\n'}
            No accounts. No phone numbers.
          </Text>
          <TouchableOpacity style={s.startBtn} onPress={() => nav.navigate('Connect')}>
            <Text style={s.startBtnTxt}>New Connection</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={r => r.peerId}
          renderItem={({item}) => (
            <ConvRow
              item={item}
              onPress={() => openChat(item.peerId)}
              onLongPress={() => longPress(item.peerId)}
            />
          )}
          ItemSeparatorComponent={() => <View style={s.sep} />}
          contentContainerStyle={{paddingBottom: insets.bottom + 16}}
        />
      )}

      {rows.length > 0 && (
        <Text style={s.hint}>Long-press a chat to delete on both devices</Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root:      {flex: 1, backgroundColor: colors.bg},
  header:    {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  logo:      {...font.h2, color: colors.text},
  tagline:   {...font.tiny, color: colors.textMuted, marginTop: 2},
  headerBtns:{flexDirection: 'row', gap: 8},
  iconBtn:   {
    backgroundColor: colors.surface2, width: 38, height: 38,
    borderRadius: radius.full, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  iconBtnTxt:{color: colors.textSub, fontSize: 18},

  row:       {flexDirection: 'row', padding: 14, paddingHorizontal: 16, alignItems: 'center', gap: 12},
  onlineDot: {
    position: 'absolute', bottom: 1, right: 1,
    width: 13, height: 13, borderRadius: 7,
    backgroundColor: colors.green, borderWidth: 2, borderColor: colors.bg,
  },
  info:      {flex: 1},
  rowTop:    {flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3},
  rowBot:    {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  name:      {fontSize: 15, fontWeight: '600', color: colors.text, flex: 1},
  time:      {fontSize: 11, color: colors.textMuted},
  preview:   {fontSize: 13, color: colors.textSub, flex: 1},
  badge:     {
    backgroundColor: colors.accent, borderRadius: 10,
    minWidth: 20, height: 20, alignItems: 'center',
    justifyContent: 'center', paddingHorizontal: 5,
  },
  badgeTxt:  {fontSize: 11, color: '#FFF', fontWeight: '700'},
  sep:       {height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 78},

  empty:     {flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12},
  emptyIcon: {fontSize: 64},
  emptyTitle:{...font.h3, color: colors.textSub},
  emptySub:  {fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 20},
  startBtn:  {
    backgroundColor: colors.accent, borderRadius: radius.full,
    paddingHorizontal: 24, paddingVertical: 13, marginTop: 8,
  },
  startBtnTxt:{color: '#FFF', fontWeight: '700', fontSize: 15},
  hint:      {textAlign: 'center', color: colors.textMuted, fontSize: 11, paddingVertical: 8},
});
