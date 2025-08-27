// src/App.js
import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import Menu from './components/Menu'; 
import UserProfile from './components/UserProfile';

// Game State Manager Component
function GameStateManager() {
  const navigate = useNavigate();
  const location = useLocation();
  const [currentPage, setCurrentPage] = useState("menu");
  const hasNavigated = useRef(false);
  
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
      <UserProfile />
      <Routes>
        <Route 
          path="/" 
          element={<Menu onPageChange={handlePageChange} />} 
        />
        <Route 
          path="/game" 
          element={<Menu onPageChange={handlePageChange} />} 
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