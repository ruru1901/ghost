export const colors = {
  // Backgrounds
  bg:       '#0D0D14',
  surface:  '#13131F',
  surface2: '#1A1A2A',
  surface3: '#212135',
  border:   '#252538',

  // Accent
  accent:    '#7C65F6',
  accentDim: '#3D3565',
  accentGlow:'rgba(124,101,246,0.15)',
  teal:      '#4ECDC4',

  // Text
  text:      '#F0EFF8',
  textSub:   '#8884A0',
  textMuted: '#4A4865',

  // Status
  green:  '#4ADE80',
  red:    '#F87171',
  yellow: '#FBBF24',

  // Bubbles
  bubbleOut: '#7C65F6',
  bubbleIn:  '#1E1E2E',

  white: '#FFFFFF',
  black: '#000000',
};

export const spacing = {
  xs:  4,
  sm:  8,
  md:  16,
  lg:  24,
  xl:  32,
  xxl: 48,
};

export const radius = {
  sm:   6,
  md:   12,
  lg:   18,
  xl:   24,
  full: 9999,
};

export const font = {
  h1:    {fontSize: 28, fontWeight: '800', letterSpacing: -0.5, color: '#F0EFF8'},
  h2:    {fontSize: 22, fontWeight: '700', letterSpacing: -0.3, color: '#F0EFF8'},
  h3:    {fontSize: 17, fontWeight: '700', color: '#F0EFF8'},
  body:  {fontSize: 15, fontWeight: '400', lineHeight: 22,  color: '#F0EFF8'},
  small: {fontSize: 13, fontWeight: '400', lineHeight: 18, color: '#8884A0'},
  tiny:  {fontSize: 11, fontWeight: '400', color: '#4A4865'},
  mono:  {fontSize: 12, fontFamily: 'monospace', color: '#8884A0'},
};

// Avatar colors derived from peer ID char
export const AVATAR_PALETTE = [
  '#7C65F6', '#4ECDC4', '#F9844A', '#4CC9F0',
  '#7B2D8B', '#06D6A0', '#EF476F', '#FFD166',
];

export function avatarColor(peerId) {
  if (!peerId) return AVATAR_PALETTE[0];
  const code = peerId.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return AVATAR_PALETTE[code % AVATAR_PALETTE.length];
}
