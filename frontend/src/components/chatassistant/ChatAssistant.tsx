import React, { useState } from 'react';
import './ChatAssistant.css';
import axios from 'axios';

type Message = {
   sender: 'ai' | 'user';
   text: string;
};

const ChatAssistant = () => {
   const [isOpen, setIsOpen] = useState(false);
   const [messages, setMessages] = useState<Message[]>([
      { sender: 'ai', text: 'Hi! How can I help you today?' },
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
            { headers: { 'Content-Type': 'application/json' } }
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

   return (
      <div className="chat-assistant">
         {!isOpen ? (
            <button
               className="chat-toggle-button"
               onClick={() => setIsOpen(true)}
            >
               💬 Chat
            </button>
         ) : (
            <div className="chat-container">
               <div className="chat-header">
                  <span>Chat Assistant</span>
                  <button
                     className="chat-close-button"
                     onClick={() => setIsOpen(false)}
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
         )}
      </div>
   );
};

export default ChatAssistant;
