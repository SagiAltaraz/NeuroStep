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
            <button
               className="chat-toggle-button"
               onClick={openChat}
            >
               🧠 Chat
            </button>
         ) : (
            <div className="chat-overlay" onClick={closeChat}>
               <div
                  className={`chat-container ${isClosing ? 'closing' : ''}`}
                  onClick={(e) => e.stopPropagation()}
               >
                  <div className="chat-header">
                     <div className="chat-title">
                        <span className="chat-robot" aria-hidden="true">
                           🤖
                        </span>
                        <span>Chat Assistant</span>
                     </div>
                     <button
                        className="chat-close-button"
                        onClick={closeChat}
                     >
                        ×
                     </button>
                  </div>

                  <div className="chat-messages">
                     {messages.map((msg, index) => (
                        <div key={index} className={`message ${msg.sender}`}>
                           {msg.text}
                        </div>
                     ))}
                     {isLoading && <div className="message ai">Thinking...</div>}
                  </div>

                  <div className="chat-input-container">
                     <textarea
                        rows={1}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Type your message..."
                        className="chat-input"
                        disabled={isLoading}
                     />
                     <button
                        onClick={sendMessage}
                        disabled={isLoading || !input.trim()}
                        className="send-button"
                     >
                        Send
                     </button>
                  </div>
               </div>
            </div>
         )}
      </div>
   );
};

export default ChatAssistant;
