/**
 * Ghost – Message Search
 * Searches decrypted messages locally across all chats.
 * No server. Results link directly to the chat.
 */
import React, {useState, useCallback, useMemo} from 'react';
import {
  View, Text, TextInput, FlatList,
  TouchableOpacity, StyleSheet,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import {useStore} from '../store/useStore';
import Avatar from '../components/Avatar';
import {colors, radius} from '../theme';
import dayjs from 'dayjs';

function highlight(text, query) {
  // Returns segments: [{text, bold}]
  if (!query || !text) return [{text: text ?? '', bold: false}];
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return [{text, bold: false}];
  return [
    {text: text.slice(0, idx),              bold: false},
    {text: text.slice(idx, idx + query.length), bold: true},
    {text: text.slice(idx + query.length),  bold: false},
  ];
}

export default function SearchScreen() {
  const nav    = useNavigation();
  const insets = useSafeAreaInsets();
  const {contacts, searchMessages} = useStore();

  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    if (query.trim().length < 2) return [];
    return searchMessages(query);
  }, [query, searchMessages]);

  const openChat = useCallback((peerId, msgId) => {
    useStore.getState().setActiveChat(peerId);
    nav.navigate('Chat', {peerId, scrollToMsgId: msgId});
  }, [nav]);

  const renderItem = ({item}) => {
    const {peerId, message} = item;
    const contact  = contacts[peerId] ?? {};
    const name     = contact.nickname ?? peerId.slice(0, 14) + '…';
    const segs     = highlight(message.text, query);
    const time     = dayjs(message.ts).format(
      dayjs().isSame(dayjs(message.ts), 'day') ? 'HH:mm' : 'MMM D',
    );

    return (
      <TouchableOpacity
        style={s.row}
        onPress={() => openChat(peerId, message.id)}
        activeOpacity={0.7}>
        <Avatar peerId={peerId} nickname={contact.nickname} size={42} />
        <View style={s.info}>
          <View style={s.rowTop}>
            <Text style={s.name}>{name}</Text>
            <Text style={s.time}>{time}</Text>
          </View>
          <Text style={s.preview} numberOfLines={2}>
            {segs.map((seg, i) => (
              <Text key={i} style={seg.bold ? s.bold : undefined}>{seg.text}</Text>
            ))}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[s.root, {paddingTop: insets.top}]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => nav.goBack()} style={s.back}>
          <Text style={s.backIcon}>‹</Text>
        </TouchableOpacity>
        <TextInput
          style={s.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search messages…"
          placeholderTextColor={colors.textMuted}
          autoFocus
          returnKeyType="search"
          autoCorrect={false}
          autoComplete="off"
          textContentType="none"
        />
        {!!query && (
          <TouchableOpacity onPress={() => setQuery('')} style={s.clearBtn}>
            <Text style={s.clearTxt}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Results count */}
      {query.trim().length >= 2 && (
        <Text style={s.resultCount}>
          {results.length === 0
            ? 'No results'
            : `${results.length} result${results.length === 1 ? '' : 's'}`}
        </Text>
      )}

      {/* Hint */}
      {query.trim().length < 2 && (
        <View style={s.hint}>
          <Text style={s.hintIcon}>🔍</Text>
          <Text style={s.hintTxt}>Type at least 2 characters to search</Text>
          <Text style={s.hintSub}>
            Searches are local only — no server involved
          </Text>
        </View>
      )}

      {/* Results */}
      <FlatList
        data={results}
        keyExtractor={item => `${item.peerId}:${item.message.id}`}
        renderItem={renderItem}
        ItemSeparatorComponent={() => <View style={s.sep} />}
        keyboardShouldPersistTaps="handled"
      />
    </View>
  );
}

const s = StyleSheet.create({
  root:        {flex: 1, backgroundColor: colors.bg},
  header:      {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
    gap: 8,
  },
  back:        {padding: 4},
  backIcon:    {fontSize: 30, color: colors.accent, fontWeight: '300'},
  searchInput: {
    flex: 1, backgroundColor: colors.surface2, borderRadius: radius.full,
    paddingHorizontal: 16, paddingVertical: 9,
    color: colors.text, fontSize: 15,
    borderWidth: 1, borderColor: colors.border,
  },
  clearBtn:    {padding: 8},
  clearTxt:    {color: colors.textMuted, fontSize: 16},
  resultCount: {
    fontSize: 12, color: colors.textMuted,
    paddingHorizontal: 16, paddingVertical: 8,
  },
  hint:        {flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 40},
  hintIcon:    {fontSize: 48},
  hintTxt:     {fontSize: 15, color: colors.textSub, textAlign: 'center'},
  hintSub:     {fontSize: 12, color: colors.textMuted, textAlign: 'center'},
  row:         {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: 16, paddingVertical: 12, gap: 12,
  },
  info:        {flex: 1},
  rowTop:      {flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3},
  name:        {fontSize: 14, fontWeight: '600', color: colors.text},
  time:        {fontSize: 11, color: colors.textMuted},
  preview:     {fontSize: 13, color: colors.textSub, lineHeight: 18},
  bold:        {color: colors.accent, fontWeight: '700'},
  sep:         {height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 70},
});
