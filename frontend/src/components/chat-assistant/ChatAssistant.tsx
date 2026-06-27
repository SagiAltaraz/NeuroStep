import React, { useState } from 'react';
import './ChatAssistant.css';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';

type Message = {
   sender: 'ai' | 'user';
   text: string;
};

const ChatAssistant = () => {
   const { token } = useAuth();
   const [isOpen, setIsOpen] = useState(false);
   const [isClosing, setIsClosing] = useState(false);
   const [messages, setMessages] = useState<Message[]>([
      { sender: 'ai', text: 'היי, איך אוכל לעזור היום?' },
   ]);
   const [input, setInput] = useState('');
   const [isLoading, setIsLoading] = useState(false);

   const sendMessage = async () => {
      if (!input.trim()) return;

      const userMessage: Message = { sender: 'user', text: input };
      setMessages((prev) => [...prev, userMessage]);
      const promptText = input;
      setInput('');
      setIsLoading(true);

      try {
         const response = await axios.post(
            '/api/askAI',
            { prompt: promptText },
            {
               headers: {
                  'Content-Type': 'application/json',
                  ...(token ? { Authorization: `Bearer ${token}` } : {}),
               },
            }
         );

         const aiReply = response.data?.response || "Hmm, I didn't catch that.";
         setMessages((prev) => [...prev, { sender: 'ai', text: aiReply }]);
      } catch (err: unknown) {
         console.error('Error with AI API:', err);
         let errorMsg = 'Connection failed';
         if (axios.isAxiosError(err)) {
            errorMsg =
               (err.response?.data as any)?.error || err.message || errorMsg;
         } else if (err instanceof Error) {
            errorMsg = err.message;
         }
         setMessages((prev) => [
            ...prev,
            {
               sender: 'ai',
               text: `Sorry, I'm having trouble right now: ${errorMsg}`,
            },
         ]);
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
      setIsClosing(false);
      setIsOpen(true);
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
                     <button className="chat-close-button" onClick={closeChat} aria-label="סגור">
                        ×
                     </button>
                  </div>

                  <div className="chat-messages">
                     {messages.map((msg, index) => (
                        <div key={index} className={`message ${msg.sender}`}>
                           {msg.text}
                        </div>
                     ))}
                     {isLoading && (
                        <div className="message ai thinking" aria-label="חושב...">
                           <span className="thinking-dot" />
                           <span className="thinking-dot" />
                           <span className="thinking-dot" />
                        </div>
                     )}
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
