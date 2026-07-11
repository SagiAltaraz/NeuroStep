import './App.css';
import { lazy, Suspense, useEffect, type ComponentType } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import Header from './components/Header/Header';
import SiteBackground from './components/SiteBackground/SiteBackground';

import HomePage from './pages/home/Home';
import SignupPage from './pages/sign-up/SignUp';
import LoginPage from './pages/log-in/LogIn';

import ProblemsCarousel from './components/ProblemsCarousel/ProblemsCarousel';
import ChatAssistant from './components/chat-assistant/ChatAssistant';
import CompanionAvatar from './components/companion/CompanionAvatar';
import ColorTrackingPage from './pages/games/ColorTrainsPage';
import GamesPage from './pages/games/GamesPage';
import TicTacToePage from './pages/games/TicTacToePage';
import MemoryGamePage from './pages/games/MemoryGamePage';
import ShapesClickPage from './pages/games/ShapesClickPage';
import GreenLightPage from './pages/games/GreenLightPage';
import SpotDifferencePage from './pages/games/SpotDifferencePage';
import WhereWasItPage from './pages/games/WhereWasItPage';
import FindLetterPage from './pages/games/FindLetterPage';
import JourneyPage from './pages/journey/JourneyPage';
import ProtectedRoute from './components/ProtectedRoute/ProtectedRoute';
import AccessibilityWidget from './components/AccessibilityWidget/AccessibilityWidget';
import { isAdminPanelEnabled } from './config/features';
import { useAuth } from './context/AuthContext';
import {
   ChatControllerProvider,
   useChatController,
} from './context/ChatControllerContext';

// Admin pages are lazy-loaded so they only weigh on the bundle when the panel
// is enabled (see isAdminPanelEnabled in config/features).
const AdminPage = isAdminPanelEnabled ? lazy(() => import('./pages/admin/AdminPage')) : null;
const CognitiveTrendPage = isAdminPanelEnabled
   ? lazy(() => import('./pages/admin/trend/CognitiveTrendPage'))
   : null;
const AlertsPage = isAdminPanelEnabled ? lazy(() => import('./pages/admin/alerts/AlertsPage')) : null;
const CoachReportsPage = isAdminPanelEnabled
   ? lazy(() => import('./pages/admin/coach-reports/CoachReportsPage'))
   : null;
const PlayerFilePage = isAdminPanelEnabled
   ? lazy(() => import('./pages/admin/player-file/PlayerFilePage'))
   : null;

const renderAdminRoute = (Page: ComponentType) => (
   <Suspense fallback={null}>
      <Page />
   </Suspense>
);

const PUBLIC_CHAT_PATHS = new Set(['/', '/games']);

function SharedChatAssistant() {
   const { pathname } = useLocation();
   const { user } = useAuth();
   const { closeChat } = useChatController();
   const isSupported = PUBLIC_CHAT_PATHS.has(pathname) || (pathname === '/journey' && !!user);

   useEffect(() => {
      if (!isSupported) closeChat();
   }, [isSupported, closeChat]);

   return isSupported ? <ChatAssistant /> : null;
}

function AppContent() {
   return (
      <div className="App">
         <SiteBackground />
         <Header />
         <CompanionAvatar />
         <Routes>
            {/* home page */}
            <Route
               path="/"
               element={
                  <div className="home-onescreen">
                     <HomePage />
                     <ProblemsCarousel />
                  </div>
               }
            />
            <Route path="/sign-up" element={<SignupPage />} />
            <Route path="/log-in" element={<LoginPage />} />
            <Route
               path="/games"
               element={<GamesPage />}
            />
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
            <Route
               path="/games/greenLight"
               element={
                  <ProtectedRoute>
                     <GreenLightPage />
                  </ProtectedRoute>
               }
            />
            <Route
               path="/games/spotDifference"
               element={
                  <ProtectedRoute>
                     <SpotDifferencePage />
                  </ProtectedRoute>
               }
            />
            <Route
               path="/games/whereWasIt"
               element={
                  <ProtectedRoute>
                     <WhereWasItPage />
                  </ProtectedRoute>
               }
            />
            <Route
               path="/games/findLetter"
               element={
                  <ProtectedRoute>
                     <FindLetterPage />
                  </ProtectedRoute>
               }
            />
            <Route
               path="/journey"
               element={
                  <ProtectedRoute>
                     <JourneyPage />
                  </ProtectedRoute>
               }
            />
            {isAdminPanelEnabled &&
               AdminPage &&
               CognitiveTrendPage &&
               CoachReportsPage &&
               PlayerFilePage &&
               AlertsPage && (
                  <>
                     <Route path="/admin" element={renderAdminRoute(AdminPage)} />
                     <Route
                        path="/admin/users/:userId/player-file"
                        element={renderAdminRoute(PlayerFilePage)}
                     />
                     <Route
                        path="/admin/users/:userId/trend"
                        element={renderAdminRoute(CognitiveTrendPage)}
                     />
                     <Route
                        path="/admin/users/:userId/coach-reports"
                        element={renderAdminRoute(CoachReportsPage)}
                     />
                     <Route path="/admin/alerts" element={renderAdminRoute(AlertsPage)} />
                  </>
               )}
            <Route path="*" element={<div>404 - Page not found</div>} />
         </Routes>
         <SharedChatAssistant />
         <AccessibilityWidget />
      </div>
   );
}

function App() {
   return (
      <ChatControllerProvider>
         <AppContent />
      </ChatControllerProvider>
   );
}

export default App;
