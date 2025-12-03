import React, { useState } from 'react';
import './ChatAssistant.css';
import axios from 'axios';

const ChatAssistant = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    { sender: 'ai', text: 'Hi! How can I help you today?' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const sendMessage = async () => {
    if (!input.trim()) return;

    const userMessage = { sender: 'user', text: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await axios.post('/askAI', 
        { prompt: input },
        { headers: { 'Content-Type': 'application/json' } }
      );

      const aiReply = response.data.response || "Hmm, I didn't catch that.";
      setMessages(prev => [...prev, { sender: 'ai', text: aiReply }]);

    } catch (error) {
      console.error('Error with AI API:', error);
      const errorMsg = error.response?.data?.error 
        || error.message 
        || "Connection failed";

      setMessages(prev => [...prev, {
        sender: 'ai',
        text: `Sorry, I'm having trouble right now: ${errorMsg}`
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="chat-assistant">
      {!isOpen ? (
        <button onClick={() => setIsOpen(true)} className="chat-toggle-button">
          Chat
        </button>
      ) : (
        <div className="chat-container">
          <div className="chat-header">
            <span>Assistant</span>
            <button onClick={() => setIsOpen(false)} className="chat-close-button">
              ×
            </button>
          </div>

          <div className="chat-messages">
            {messages.map((msg, index) => (
              <div key={index} className={`message ${msg.sender}`}>
                {msg.text}
              </div>
            ))}
            {isLoading && <div className="message-loading">Thinking...</div>}
          </div>

          <div className="chat-input-container">
            <textarea
              rows="1"
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