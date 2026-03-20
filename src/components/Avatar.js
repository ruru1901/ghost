import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {avatarColor} from '../theme';

export default function Avatar({peerId, nickname, size = 46, style}) {
  const letter = nickname ? nickname[0].toUpperCase() : (peerId?.[0]?.toUpperCase() ?? '?');
  const bg     = avatarColor(peerId);
  const fs     = Math.round(size * 0.42);

  return (
    <View style={[styles.circle, {width: size, height: size, borderRadius: size / 2, backgroundColor: bg}, style]}>
      <Text style={[styles.letter, {fontSize: fs}]}>{letter}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {alignItems: 'center', justifyContent: 'center'},
  letter: {color: '#FFF', fontWeight: '700'},
});
