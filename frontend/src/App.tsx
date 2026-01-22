import './App.css';
import { Routes, Route } from 'react-router-dom';
import Header from './components/Header/Header';

import HomePage from './pages/home/home';
import SignupPage from './pages/sign-up/sign-up';
import LoginPage from './pages/log-in/log-in';

import Features from './components/features/features';
import ChatAssistant from './components/chatassistant/ChatAssistant';
import ColorTrackingPage from './pages/games/ColorTrainsPage';
import AdminPage from './pages/admin/AdminPage'; 

function App() {
   return (
      <div className="App">
         <Header />
         <Routes>
            {/* home page */}
            <Route
               path="/"
               element={
                  <>
                     <HomePage />
                     <Features />
                     <ChatAssistant />
                  </>
               }
            />
            <Route path="/sign-up" element={<SignupPage />} />
            <Route path="/log-in" element={<LoginPage />} />
            <Route path="/games/colorTracking" element={<ColorTrackingPage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="*" element={<div>404 – העמוד לא נמצא</div>} />
         </Routes>
      </div>
   );
}

export default App;