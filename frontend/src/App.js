import './App.css';
import{ useState } from 'react';
import Main from './components/main/main';
import Features from './components/features/Features';
import Stats from './components/stats/Stats';
import ChatAssistant from './components/chatassistant/ChatAssistant';


function App() {
  return (
    <div className="App">
      <Main />
      <Features />
      <ChatAssistant/>
      <Stats />
    </div>
  );
}

export default App;
