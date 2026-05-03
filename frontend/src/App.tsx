import './App.css';
import { Routes, Route } from 'react-router-dom';
import Header from './components/Header/Header';

import HomePage from './pages/home/Home';
import SignupPage from './pages/sign-up/SignUp';
import LoginPage from './pages/log-in/LogIn';

import Features from './components/features/Features';
import ChatAssistant from './components/chat-assistant/ChatAssistant';
import ColorTrackingPage from './pages/games/ColorTrainsPage';
import GamesPage from './pages/games/GamesPage';
import TicTacToePage from './pages/games/TicTacToePage';
import MemoryGamePage from './pages/games/MemoryGamePage';
import ShapesClickPage from './pages/games/ShapesClickPage';
import AdminPage from './pages/admin/AdminPage';
import CognitiveTrendPage from './pages/admin/trend/CognitiveTrendPage';
import ProtectedRoute from './components/ProtectedRoute/ProtectedRoute';

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
            <Route path="/games" element={<GamesPage />} />
            <Route
               path="/games/colorTracking"
               element={
                  <ProtectedRoute>
                     <ColorTrackingPage />
                  </ProtectedRoute>
               }
            />
            <Route
               path="/games/ticTacToe"
               element={
                  <ProtectedRoute>
                     <TicTacToePage />
                  </ProtectedRoute>
               }
            />
            <Route
               path="/games/memory"
               element={
                  <ProtectedRoute>
                     <MemoryGamePage />
                  </ProtectedRoute>
               }
            />
            <Route
               path="/games/shapesClick"
               element={
                  <ProtectedRoute>
                     <ShapesClickPage />
                  </ProtectedRoute>
               }
            />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/admin/users/:userId/trend" element={<CognitiveTrendPage />} />
            <Route path="*" element={<div>404 - Page not found</div>} />
         </Routes>
      </div>
   );
}

export default App;