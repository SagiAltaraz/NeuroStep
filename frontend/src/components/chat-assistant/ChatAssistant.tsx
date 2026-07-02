import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './ChatAssistant.css';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';

type Message = {
   sender: 'ai' | 'user';
   text: string;
};

type StoredChatSession = {
   sessionId: string;
   lastMessageAt: number;
   messages: Message[];
};

const CHAT_STORAGE_KEY = 'neurostep.chat.session.v1';
const CHAT_SESSION_TTL_MS = 10 * 60 * 1000;
const INITIAL_MESSAGE: Message = {
   sender: 'ai',
   text: 'היי, איך אוכל לעזור היום?',
};
const INTERNAL_MARKDOWN_LINK = /\[([^\]]+)\]\((\/[^)\s]+)\)/g;

const newSessionId = () => {
   if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
   }

   return `chat-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const createChatSession = (): StoredChatSession => ({
   sessionId: newSessionId(),
   lastMessageAt: Date.now(),
   messages: [INITIAL_MESSAGE],
});

const isMessage = (value: unknown): value is Message => {
   if (!value || typeof value !== 'object') return false;
   const message = value as Partial<Message>;
   return (
      (message.sender === 'ai' || message.sender === 'user') &&
      typeof message.text === 'string'
   );
};

const loadChatSession = (): StoredChatSession => {
   try {
      const raw = window.localStorage.getItem(CHAT_STORAGE_KEY);
      if (!raw) return createChatSession();

      const parsed = JSON.parse(raw) as Partial<StoredChatSession>;
      const lastMessageAt = typeof parsed.lastMessageAt === 'number'
         ? parsed.lastMessageAt
         : 0;

      if (Date.now() - lastMessageAt > CHAT_SESSION_TTL_MS) {
         return createChatSession();
      }

      const messages = Array.isArray(parsed.messages)
         ? parsed.messages.filter(isMessage)
         : [];

      return {
         sessionId: typeof parsed.sessionId === 'string' && parsed.sessionId
            ? parsed.sessionId
            : newSessionId(),
         lastMessageAt,
         messages: messages.length > 0 ? messages : [INITIAL_MESSAGE],
      };
   } catch {
      return createChatSession();
   }
};

const persistChatSession = (session: StoredChatSession) => {
   window.localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(session));
};

const recentHistory = (messages: Message[]) =>
   messages
      .filter((message) => message.text.trim().length > 0)
      .slice(-12);

const ChatAssistant = () => {
   const { token } = useAuth();
   const navigate = useNavigate();
   const [initialSession] = useState(loadChatSession);
   const [sessionId, setSessionId] = useState(initialSession.sessionId);
   const [lastMessageAt, setLastMessageAt] = useState(initialSession.lastMessageAt);
   const [messages, setMessages] = useState<Message[]>(initialSession.messages);
   const [isOpen, setIsOpen] = useState(false);
   const [isClosing, setIsClosing] = useState(false);
   const [input, setInput] = useState('');
   const [isLoading, setIsLoading] = useState(false);
   const messagesEndRef = useRef<HTMLDivElement>(null);

   useEffect(() => {
      persistChatSession({ sessionId, lastMessageAt, messages });
   }, [sessionId, lastMessageAt, messages]);

   useEffect(() => {
      if (!isOpen) return;
      messagesEndRef.current?.scrollIntoView({ block: 'end' });
   }, [isOpen, messages, isLoading]);

   const renderMessageText = (text: string) => {
      const nodes: React.ReactNode[] = [];
      let cursor = 0;
      let match: RegExpExecArray | null;
      INTERNAL_MARKDOWN_LINK.lastIndex = 0;

      while ((match = INTERNAL_MARKDOWN_LINK.exec(text)) !== null) {
         const [fullMatch, label, href] = match;
         const start = match.index;
         if (start > cursor) nodes.push(text.slice(cursor, start));
         nodes.push(
            <button
               key={`${href}-${start}`}
               type="button"
               className="chat-inline-link"
               onClick={() => {
                  setIsOpen(false);
                  navigate(href);
               }}
            >
               {label}
            </button>
         );
         cursor = start + fullMatch.length;
      }

      if (cursor < text.length) nodes.push(text.slice(cursor));
      return nodes.map((node, index) => (
         <React.Fragment key={index}>{node}</React.Fragment>
      ));
   };

   const ensureActiveSession = (): StoredChatSession => {
      if (Date.now() - lastMessageAt <= CHAT_SESSION_TTL_MS) {
         return { sessionId, lastMessageAt, messages };
      }

      const fresh = createChatSession();
      setSessionId(fresh.sessionId);
      setLastMessageAt(fresh.lastMessageAt);
      setMessages(fresh.messages);
      persistChatSession(fresh);
      return fresh;
   };

   const appendMessages = (
      nextMessages: Message[],
      timestamp = Date.now(),
      targetSessionId = sessionId
   ) => {
      setMessages(nextMessages);
      setLastMessageAt(timestamp);
      persistChatSession({
         sessionId: targetSessionId,
         lastMessageAt: timestamp,
         messages: nextMessages,
      });
   };

   const sendMessage = async () => {
      if (!input.trim() || isLoading) return;

      const activeSession = ensureActiveSession();
      const promptText = input.trim();
      const userMessage: Message = { sender: 'user', text: promptText };
      const messagesWithUser = [...activeSession.messages, userMessage];

      setInput('');
      setIsLoading(true);
      setSessionId(activeSession.sessionId);
      appendMessages(messagesWithUser, Date.now(), activeSession.sessionId);

      try {
         const response = await axios.post(
            '/api/askAI',
            {
               prompt: promptText,
               sessionId: activeSession.sessionId,
               history: recentHistory(activeSession.messages),
            },
            {
               headers: {
                  'Content-Type': 'application/json',
                  ...(token ? { Authorization: `Bearer ${token}` } : {}),
               },
            }
         );

         const aiReply = response.data?.response || 'לא הצלחתי להבין את הבקשה.';
         appendMessages(
            [...messagesWithUser, { sender: 'ai', text: aiReply }],
            Date.now(),
            activeSession.sessionId
         );
      } catch (err: unknown) {
         console.error('Error with AI API:', err);
         let errorMsg = 'Connection failed';
         if (axios.isAxiosError(err)) {
            errorMsg =
               (err.response?.data as any)?.error ||
               (err.response?.data as any)?.response ||
               err.message ||
               errorMsg;
         } else if (err instanceof Error) {
            errorMsg = err.message;
         }
         appendMessages([
            ...messagesWithUser,
            {
               sender: 'ai',
               text: `מצטער, יש כרגע בעיה בחיבור: ${errorMsg}`,
            },
         ], Date.now(), activeSession.sessionId);
      } finally {
         setIsLoading(false);
      }
   };

   const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
         e.preventDefault();
         sendMessage();
      }
   };

   const openChat = () => {
      const activeSession = ensureActiveSession();
      setSessionId(activeSession.sessionId);
      setMessages(activeSession.messages);
      setLastMessageAt(activeSession.lastMessageAt);
      setIsClosing(false);
      setIsOpen(true);
   };

   const startNewChatSession = () => {
      const fresh = createChatSession();
      setSessionId(fresh.sessionId);
      setLastMessageAt(fresh.lastMessageAt);
      setMessages(fresh.messages);
      setInput('');
      setIsLoading(false);
      persistChatSession(fresh);
   };

   const closeChat = () => {
      setIsClosing(true);
      window.setTimeout(() => {
         setIsOpen(false);
         setIsClosing(false);
      }, 220);
   };

   return (
      <div className="chat-assistant">
         {!isOpen ? (
            <button className="chat-toggle-button" onClick={openChat} aria-label="Open AI assistant">
               <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
                     stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
               </svg>
               עוזר AI
            </button>
         ) : (
            <div className="chat-overlay" onClick={closeChat}>
               <div
                  className={`chat-container ${isClosing ? 'closing' : ''}`}
                  onClick={(e) => e.stopPropagation()}
               >
                  <div className="chat-header">
                     <div className="chat-title">
                        <div className="chat-avatar" aria-hidden="true">🧠</div>
                        <div className="chat-title-text">
                           <span className="chat-title-main">עוזר AI</span>
                           <span className="chat-title-sub">מבוסס על הפרופיל שלך</span>
                        </div>
                     </div>
                     <div className="chat-header-actions">
                        <button
                           className="chat-new-session-button"
                           type="button"
                           onClick={startNewChatSession}
                           disabled={isLoading}
                        >
                           שיחה חדשה
                        </button>
                        <button className="chat-close-button" onClick={closeChat} aria-label="סגור">
                           ×
                        </button>
                     </div>
                  </div>

                  <div className="chat-messages">
                     {messages.map((msg, index) => (
                        <div key={index} className={`message ${msg.sender}`}>
                           {renderMessageText(msg.text)}
                        </div>
                     ))}
                     {isLoading && (
                        <div className="message ai thinking" aria-label="חושב...">
                           <span className="thinking-dot" />
                           <span className="thinking-dot" />
                           <span className="thinking-dot" />
                        </div>
                     )}
                     <div ref={messagesEndRef} />
                  </div>

                  <div className="chat-input-container">
                     <textarea
                        rows={1}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="כתוב הודעה..."
                        className="chat-input"
                        disabled={isLoading}
                     />
                     <button
                        onClick={sendMessage}
                        disabled={isLoading || !input.trim()}
                        className="send-button"
                        aria-label="שלח"
                     >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                           <path d="M22 2L11 13" stroke="currentColor" strokeWidth="2.2"
                              strokeLinecap="round" strokeLinejoin="round"/>
                           <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor"
                              strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                     </button>
                  </div>
               </div>
            </div>
         )}
      </div>
   );
};

export default ChatAssistant;


