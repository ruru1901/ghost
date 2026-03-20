/**
 * Ghost – Message Reactions
 * Long-press bubble → emoji picker appears.
 * Reaction synced to peer via data channel.
 * Stored in message.reactions = {emoji: [peerId, ...]}
 */
import React, {useState} from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal,
} from 'react-native';
import {colors, radius} from '../theme';
import {haptics} from '../services/Haptics';

const EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '👀', '✅'];

// ── Picker modal ─────────────────────────────────────────────────

export function ReactionPicker({visible, onSelect, onClose}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={p.overlay} activeOpacity={1} onPress={onClose}>
        <View style={p.picker}>
          {EMOJIS.map(e => (
            <TouchableOpacity
              key={e}
              style={p.emojiBtn}
              onPress={() => { haptics.tap(); onSelect(e); onClose(); }}>
              <Text style={p.emoji}>{e}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// ── Reaction bar shown below a message ───────────────────────────

export function ReactionBar({reactions, myPeerId, onReact}) {
  if (!reactions || Object.keys(reactions).length === 0) return null;

  return (
    <View style={r.bar}>
      {Object.entries(reactions).map(([emoji, peerIds]) => {
        const mine = peerIds.includes(myPeerId);
        return (
          <TouchableOpacity
            key={emoji}
            style={[r.pill, mine && r.pillMine]}
            onPress={() => { haptics.tap(); onReact(emoji); }}>
            <Text style={r.emoji}>{emoji}</Text>
            {peerIds.length > 1 && (
              <Text style={[r.count, mine && r.countMine]}>{peerIds.length}</Text>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const p = StyleSheet.create({
  overlay: {flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)'},
  picker:  {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center',
    backgroundColor: colors.surface, borderRadius: radius.xl,
    padding: 12, gap: 6, maxWidth: 280,
    borderWidth: 1, borderColor: colors.border,
  },
  emojiBtn:{
    width: 52, height: 52, borderRadius: 26,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface2,
  },
  emoji:   {fontSize: 26},
});

const r = StyleSheet.create({
  bar:      {flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4, paddingHorizontal: 4},
  pill:     {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: colors.surface2, borderRadius: radius.full,
    paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, borderColor: colors.border,
  },
  pillMine: {backgroundColor: colors.accentDim, borderColor: colors.accent},
  emoji:    {fontSize: 14},
  count:    {fontSize: 12, color: colors.textSub},
  countMine:{color: colors.accent, fontWeight: '700'},
});
