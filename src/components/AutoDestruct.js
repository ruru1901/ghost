/**
 * Ghost – Auto-Destruct Timer
 * Per-message or per-chat timer. After expiry, message deleted on both devices.
 * Timer runs on sender side; destruction signal sent when timer fires.
 */
import React, {useState} from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal,
} from 'react-native';
import {colors, radius} from '../theme';

export const TIMER_OPTIONS = [
  {label: 'Off',    value: 0},
  {label: '30s',    value: 30},
  {label: '5 min',  value: 300},
  {label: '1 hr',   value: 3600},
  {label: '24 hr',  value: 86400},
  {label: '7 days', value: 604800},
];

export function timerLabel(seconds) {
  const opt = TIMER_OPTIONS.find(o => o.value === seconds);
  return opt ? opt.label : 'Off';
}

// ── Timer picker modal ────────────────────────────────────────────

export function TimerPickerModal({visible, current, onSelect, onClose}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}>
      <TouchableOpacity style={m.overlay} activeOpacity={1} onPress={onClose}>
        <View style={m.sheet}>
          <View style={m.handle} />
          <Text style={m.title}>⏱ Auto-destruct timer</Text>
          <Text style={m.sub}>
            Message deletes on both devices after this time.
          </Text>
          <View style={m.options}>
            {TIMER_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.value}
                style={[m.option, current === opt.value && m.optionActive]}
                onPress={() => { onSelect(opt.value); onClose(); }}>
                <Text style={[m.optionTxt, current === opt.value && m.optionTxtActive]}>
                  {opt.label}
                </Text>
                {current === opt.value && <Text style={m.check}>✓</Text>}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// ── Timer badge shown on a message ───────────────────────────────

export function TimerBadge({seconds}) {
  if (!seconds) return null;
  return (
    <View style={b.badge}>
      <Text style={b.txt}>⏱ {timerLabel(seconds)}</Text>
    </View>
  );
}

// ── Schedule destruction of a message ────────────────────────────

const _scheduled = new Map(); // msgId → timeoutId

export function scheduleDestruct(msgId, peerId, seconds, onDestruct) {
  if (!seconds) return;
  clearScheduled(msgId);
  const id = setTimeout(() => {
    onDestruct(msgId, peerId);
    _scheduled.delete(msgId);
  }, seconds * 1000);
  _scheduled.set(msgId, id);
}

export function clearScheduled(msgId) {
  const id = _scheduled.get(msgId);
  if (id) { clearTimeout(id); _scheduled.delete(msgId); }
}

const m = StyleSheet.create({
  overlay:         {flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end'},
  sheet:           {
    backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 40,
  },
  handle:          {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: colors.border, alignSelf: 'center', marginBottom: 20,
  },
  title:           {fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: 6},
  sub:             {fontSize: 13, color: colors.textSub, marginBottom: 18},
  options:         {gap: 4},
  option:          {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 14, borderRadius: radius.md,
    backgroundColor: colors.surface2,
  },
  optionActive:    {backgroundColor: colors.accentDim, borderWidth: 1, borderColor: colors.accent},
  optionTxt:       {fontSize: 15, color: colors.textSub},
  optionTxtActive: {color: colors.accent, fontWeight: '700'},
  check:           {color: colors.accent, fontSize: 16},
});

const b = StyleSheet.create({
  badge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 8, paddingHorizontal: 5, paddingVertical: 2,
  },
  txt: {fontSize: 9, color: 'rgba(255,255,255,0.7)'},
});
