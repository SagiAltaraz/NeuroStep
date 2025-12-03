import './App.css';
import{ useState } from 'react';
import Main from './pages/main/main';
import Features from './components/features/features';
//import Stats from './components/stats/Stats';
import ChatAssistant from './components/ChatAssistant/ChatAssistant';


function App() {
  return (
    <div className="App">
      <Main />
      <Features />
      <ChatAssistant/>
      {/* <Stats /> */}
    </div>
  );
}

export default App;