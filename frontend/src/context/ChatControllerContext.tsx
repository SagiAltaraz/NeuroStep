import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type ChatOpenSource = 'button' | 'avatar' | 'instructions' | 'journey';

// Drives the companion avatar's clip during a chat: thinking → talk → idle.
export type ChatStatus = 'idle' | 'thinking' | 'answering';

// Where the chat bubble should open, in viewport-edge offsets (px). The avatar
// captures this from its own position at click time so the bubble appears right
// where the mascot is standing. null → the default bottom-right corner.
export interface ChatAnchor {
  right: number;
  bottom: number;
}

interface ChatControllerValue {
  isOpen: boolean;
  openChat: (source?: ChatOpenSource, anchor?: ChatAnchor | null) => void;
  closeChat: () => void;
  status: ChatStatus;
  setStatus: (status: ChatStatus) => void;
  anchor: ChatAnchor | null;
  setAnchor: (anchor: ChatAnchor | null) => void;
}

const ChatControllerContext = createContext<ChatControllerValue | undefined>(undefined);

export function ChatControllerProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState<ChatStatus>('idle');
  const [anchor, setAnchor] = useState<ChatAnchor | null>(null);

  const openChat = useCallback((source?: ChatOpenSource, nextAnchor?: ChatAnchor | null) => {
    void source;
    setAnchor(nextAnchor ?? null);
    setIsOpen(true);
  }, []);

  const closeChat = useCallback(() => {
    setIsOpen(false);
    setStatus('idle');
    setAnchor(null);
  }, []);

  const value = useMemo(
    () => ({ isOpen, openChat, closeChat, status, setStatus, anchor, setAnchor }),
    [isOpen, openChat, closeChat, status, anchor],
  );

  return (
    <ChatControllerContext.Provider value={value}>
      {children}
    </ChatControllerContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useChatController() {
  const context = useContext(ChatControllerContext);
  if (!context) {
    throw new Error('useChatController must be used within <ChatControllerProvider>');
  }
  return context;
}
