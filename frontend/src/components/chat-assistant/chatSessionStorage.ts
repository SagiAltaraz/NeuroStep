import type { Message } from './ChatAssistant';

export type StoredChatSession = {
   sessionId: string;
   lastMessageAt: number;
   messages: Message[];
};

export const CHAT_STORAGE_KEY = 'neurostep.chat.session.v1';
export const CHAT_RESET_EVENT = 'neurostep:chat-session-reset';

export const resetStoredChatSession = () => {
   window.localStorage.removeItem(CHAT_STORAGE_KEY);
   window.dispatchEvent(new Event(CHAT_RESET_EVENT));
};

