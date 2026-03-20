import {create} from 'zustand';

export const useStore = create((set, get) => ({
  // ── Identity ────────────────────────────────────────────────
  identity: null,
  setIdentity: id => set({identity: id}),

  // ── Contacts ────────────────────────────────────────────────
  contacts: {},
  upsertContact: (peerId, data) =>
    set(s => ({
      contacts: {
        ...s.contacts,
        [peerId]: {...(s.contacts[peerId] ?? {}), ...data},
      },
    })),

  // ── Chats ───────────────────────────────────────────────────
  chats: {},

  addMessage: (peerId, msg) =>
    set(s => ({
      chats: {
        ...s.chats,
        [peerId]: [...(s.chats[peerId] ?? []), msg],
      },
    })),

  setMessages: (peerId, msgs) =>
    set(s => ({chats: {...s.chats, [peerId]: msgs}})),

  updateMsgStatus: (peerId, msgId, status) =>
    set(s => ({
      chats: {
        ...s.chats,
        [peerId]: (s.chats[peerId] ?? []).map(m =>
          m.id === msgId ? {...m, status} : m,
        ),
      },
    })),

  // Fully remove a single message (auto-destruct)
  removeMessage: (peerId, msgId) =>
    set(s => ({
      chats: {
        ...s.chats,
        [peerId]: (s.chats[peerId] ?? []).filter(m => m.id !== msgId),
      },
    })),

  // Add / update a reaction on a message
  // reactions stored as {emoji: [peerId, ...]}
  addReaction: (peerId, msgId, emoji, reactorId) =>
    set(s => ({
      chats: {
        ...s.chats,
        [peerId]: (s.chats[peerId] ?? []).map(m => {
          if (m.id !== msgId) return m;
          const reactions = {...(m.reactions ?? {})};
          const existing  = reactions[emoji] ?? [];
          if (existing.includes(reactorId)) {
            // Toggle off
            const next = existing.filter(id => id !== reactorId);
            if (next.length === 0) delete reactions[emoji];
            else reactions[emoji] = next;
          } else {
            reactions[emoji] = [...existing, reactorId];
          }
          return {...m, reactions};
        }),
      },
    })),

  nukeChat: peerId =>
    set(s => {
      const chats = {...s.chats};
      delete chats[peerId];
      return {chats};
    }),

  // ── Active chat ──────────────────────────────────────────────
  activeChat: null,
  setActiveChat: p => set({activeChat: p}),

  // ── Connection states ────────────────────────────────────────
  connState: {},
  setConnState: (peerId, st) =>
    set(s => ({connState: {...s.connState, [peerId]: st}})),

  // ── Incoming call ────────────────────────────────────────────
  incomingCall: null,
  setIncomingCall:  peerId => set({incomingCall: peerId}),
  clearIncomingCall: ()    => set({incomingCall: null}),

  // ── Message search ───────────────────────────────────────────
  // Returns [{peerId, message}] matching query across all chats
  searchMessages: query => {
    if (!query?.trim()) return [];
    const q     = query.toLowerCase();
    const {chats} = get();
    const results = [];
    for (const [peerId, msgs] of Object.entries(chats)) {
      for (const m of msgs) {
        if (m.text?.toLowerCase().includes(q)) {
          results.push({peerId, message: m});
        }
      }
    }
    return results.sort((a, b) => b.message.ts - a.message.ts);
  },
}));
