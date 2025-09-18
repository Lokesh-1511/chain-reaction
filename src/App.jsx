// src/App.js
import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import Menu from './components/Menu'; 
import UserProfile from './components/UserProfile';
import { offlineDetector, showOfflineNotification, showOnlineNotification } from './services/offlineDetector';

// Game State Manager Component
function GameStateManager() {
  const navigate = useNavigate();
  const location = useLocation();
  const [currentPage, setCurrentPage] = useState("menu");
  const [isOnline, setIsOnline] = useState(offlineDetector.isOnline);
  const hasNavigated = useRef(false);
  
  // Handle offline/online status changes
  useEffect(() => {
    const removeListener = offlineDetector.addListener((status, online) => {
      setIsOnline(online);
      
      if (online) {
        showOnlineNotification();
      } else {
        showOfflineNotification();
      }
    });

    return removeListener;
  }, []);
  
  // Load saved game state on mount
  useEffect(() => {
    if (hasNavigated.current) return; // Prevent multiple navigations
    
    const savedGameState = localStorage.getItem('chainReactionGameState');
    if (savedGameState) {
      try {
        const gameData = JSON.parse(savedGameState);
        // If there's a saved game and we're on the root, navigate to game
        if (gameData.gameId && location.pathname === '/' && gameData.timestamp && 
            (Date.now() - gameData.timestamp < 24 * 60 * 60 * 1000)) { // 24 hours
          hasNavigated.current = true;
          navigate('/game', { replace: true });
        }
      } catch (error) {
        console.error('Failed to parse saved game state:', error);
        localStorage.removeItem('chainReactionGameState');
      }
    }
  }, [navigate]); // Remove location.pathname from dependencies

  // Handle page changes and update URL
  const handlePageChange = (page) => {
    setCurrentPage(page);
    if (page === 'game') {
      navigate('/game');
    } else {
      navigate('/');
    }
  };

  return (
    <div className="App">
      {/* Offline indicator */}
      {!isOnline && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          background: 'linear-gradient(90deg, #ff6b6b, #ff8e8e)',
          color: 'white',
          padding: '8px',
          textAlign: 'center',
          fontSize: '14px',
          fontWeight: '600',
          zIndex: 1000,
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
        }}>
          📱 Offline Mode - Multiplayer features unavailable
        </div>
      )}
      <UserProfile />
      <Routes>
        <Route 
          path="/" 
          element={<Menu onPageChange={handlePageChange} isOnline={isOnline} />} 
        />
        <Route 
          path="/game" 
          element={<Menu onPageChange={handlePageChange} isOnline={isOnline} />} 
        />
        <Route 
          path="*" 
          element={<Navigate to="/" replace />} 
        />
      </Routes>
    </div>
  );
}

function App() {
  return (
    <Router>
      <GameStateManager />
    </Router>
  );
}

export default App;