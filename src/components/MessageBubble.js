import React from 'react';
import {View, Text, StyleSheet, Image, TouchableOpacity} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {colors, radius} from '../theme';
import {VoiceMessagePlayer} from './VoiceMessage';
import {TimerBadge} from './AutoDestruct';
import {ReactionBar} from './Reactions';
import {haptics} from '../services/Haptics';
import dayjs from 'dayjs';

function StatusTick({status}) {
  if (status === 'seen')      return <Text style={s.tick}>✓✓</Text>;   // seen — full white
  if (status === 'delivered') return <Text style={[s.tick, s.tickGrey]}>✓✓</Text>;
  if (status === 'queued')    return <Text style={[s.tick, {color: colors.yellow}]}>⏳</Text>;
  if (status === 'sending')   return <Text style={[s.tick, {opacity: 0.4}]}>✓</Text>;
  return <Text style={s.tick}>✓</Text>;
}

export default function MessageBubble({
  message, isOwn, watermark, replySource,
  onMediaPress, onSwipeReply, onReact, onLongPress, myPeerId,
}) {
  const {text, ts, status, mediaUri, mimeType, duration, destructSecs, reactions} = message;
  const time   = dayjs(ts).format('HH:mm');
  const isImg  = mimeType?.startsWith('image/');
  const isVid  = mimeType?.startsWith('video/');
  const isAud  = mimeType?.startsWith('audio/');

  const inner = (
    <>
      {/* Reply quote */}
      {replySource && (
        <View style={s.replyQuote}>
          <View style={s.replyBar} />
          <View style={s.replyBody}>
            <Text style={s.replyName} numberOfLines={1}>
              {replySource.isOwn ? 'You' : 'Them'}
            </Text>
            <Text style={s.replyText} numberOfLines={2}>
              {replySource.text ?? (replySource.mimeType?.startsWith('audio') ? '🎙 Voice' : '📎 Media')}
            </Text>
          </View>
        </View>
      )}

      {/* Image */}
      {isImg && mediaUri && (
        <TouchableOpacity onPress={() => onMediaPress?.(message)} activeOpacity={0.85}>
          <Image source={{uri: mediaUri}} style={s.mediaImg} resizeMode="cover" />
        </TouchableOpacity>
      )}

      {/* Video */}
      {isVid && mediaUri && (
        <TouchableOpacity onPress={() => onMediaPress?.(message)} activeOpacity={0.85}>
          <View style={s.videoThumb}>
            <Image source={{uri: mediaUri}} style={s.mediaImg} resizeMode="cover" />
            <View style={s.playOverlay}>
              <Text style={s.playIcon}>▶</Text>
            </View>
          </View>
        </TouchableOpacity>
      )}

      {/* Voice message */}
      {isAud && (
        <VoiceMessagePlayer
          uri={mediaUri}
          duration={duration}
          isOwn={isOwn}
        />
      )}

      {/* Text */}
      {!!text && (
        <Text selectable={false} style={[s.msgText, isOwn ? s.msgOut : s.msgIn]}>
          {text}
        </Text>
      )}

      {/* Meta row: watermark + timer badge + time + tick */}
      <View style={s.meta}>
        {!!watermark && (
          <Text selectable={false} style={s.watermark}>{watermark}</Text>
        )}
        <TimerBadge seconds={destructSecs} />
        <Text selectable={false} style={[s.time, isOwn && s.timeOut]}>
          {time}
        </Text>
        {isOwn && <StatusTick status={status} />}
      </View>
    </>
  );

  return (
    <TouchableOpacity
      style={[s.wrap, isOwn ? s.wrapOut : s.wrapIn]}
      onLongPress={() => { haptics.medium(); onLongPress?.(message); }}
      activeOpacity={0.85}
      delayLongPress={350}>
      {isOwn ? (
        <LinearGradient
          colors={['#9B88FF', '#7C65F6']}
          start={{x: 0, y: 0}} end={{x: 1, y: 1}}
          style={[s.bubble, s.bubbleOut]}>
          {inner}
        </LinearGradient>
      ) : (
        <View style={[s.bubble, s.bubbleIn]}>
          {inner}
        </View>
      )}
      <ReactionBar
        reactions={reactions}
        myPeerId={myPeerId}
        onReact={emoji => { haptics.tap(); onReact?.(message.id, emoji); }}
      />
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  wrap:       {marginVertical: 2, marginHorizontal: 12, maxWidth: '78%'},
  wrapOut:    {alignSelf: 'flex-end'},
  wrapIn:     {alignSelf: 'flex-start'},
  bubble:     {borderRadius: radius.lg, paddingHorizontal: 13, paddingVertical: 9, minWidth: 72},
  bubbleOut:  {borderBottomRightRadius: 4},
  bubbleIn:   {backgroundColor: colors.bubbleIn, borderBottomLeftRadius: 4},

  // Reply quote
  replyQuote: {
    flexDirection: 'row', gap: 6, marginBottom: 6,
    backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 6,
  },
  replyBar:   {width: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.6)'},
  replyBody:  {flex: 1},
  replyName:  {fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.8)'},
  replyText:  {fontSize: 12, color: 'rgba(255,255,255,0.65)', marginTop: 1},

  msgText:    {fontSize: 15, lineHeight: 21},
  msgOut:     {color: '#FFF'},
  msgIn:      {color: colors.text},
  meta:       {flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 4, justifyContent: 'flex-end'},
  watermark:  {fontSize: 9, color: 'rgba(255,255,255,0.2)', fontFamily: 'monospace', flex: 1},
  time:       {fontSize: 10, color: 'rgba(200,200,255,0.6)'},
  timeOut:    {color: 'rgba(255,255,255,0.55)'},
  tick:       {fontSize: 10, color: 'rgba(255,255,255,0.9)'},
  tickGrey:   {color: 'rgba(255,255,255,0.45)'},

  mediaImg:   {width: 200, height: 200, borderRadius: radius.md, marginBottom: 4},
  videoThumb: {position: 'relative'},
  playOverlay:{
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 4,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: radius.md,
  },
  playIcon:   {fontSize: 32, color: '#FFF'},
});
