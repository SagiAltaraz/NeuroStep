import './App.css';
import Home from './pages/home/home';
import Features from './components/features/features';
//import Stats from './components/stats/Stats';
import ChatAssistant from './components/ChatAssistant/ChatAssistant';

function App() {
   return (
      <div className="App">
         <Home />
         <Features />
         <ChatAssistant />
         {/* <Stats /> */}
      </div>
   );
}

export default App;
