import type { Message } from './ChatAssistant';

export type StoredChatSession = {
   sessionId: string;
   lastMessageAt: number;
   messages: Message[];
};

export const CHAT_STORAGE_KEY = 'neurostep.chat.session.v1';
export const CHAT_RESET_EVENT = 'neurostep:chat-session-reset';

export const getStoredChatSessionId = (): string | null => {
   try {
      const raw = window.localStorage.getItem(CHAT_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<StoredChatSession>;
      return typeof parsed.sessionId === 'string' && parsed.sessionId
         ? parsed.sessionId
         : null;
   } catch {
      return null;
   }
};

export const resetStoredChatSession = () => {
   window.localStorage.removeItem(CHAT_STORAGE_KEY);
   window.dispatchEvent(new Event(CHAT_RESET_EVENT));
};
