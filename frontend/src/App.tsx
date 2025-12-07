import './App.css';
import { Routes, Route } from 'react-router-dom';
import Home from './pages/home/home';
import Features from './components/features/features';
//import Stats from './components/stats/Stats';
import ChatAssistant from './components/ChatAssistant/ChatAssistant';
import Header from './components/Header/Header';
//import LogIn from './pages/log-in/log-in';
import SignupPage from './pages/sign-up/sign-up';

function App() {
   return (
      <div className="App">
         <Header />
         <Routes>
            <Route path="/sign-up" element={<SignupPage />} />
         </Routes>
         <Home />
         <Features />
         <ChatAssistant />
         {/* <Stats /> */}
      </div>
   );
}

export default App;
