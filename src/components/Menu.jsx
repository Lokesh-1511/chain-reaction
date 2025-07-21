import React, { useState, useEffect } from "react";
import GameBoard from "./GameBoard";
import { createGame, joinGame } from '../services/api';
import socket from '../services/socket';
import CustomSelect from "./CustomSelect";
import "./Menu.css";

// Generate a unique alphanumeric Game ID
function generateGameId() {
  return Math.random().toString(36).substr(2, 6).toUpperCase();
}

const boardSizes = {
  small: { row: 9, col: 6 },
  medium: { row: 12, col: 8 },
  big: { row: 15, col: 10 },
};

function Menu() {
  const [page, setPage] = useState("menu");
  const [size, setSize] = useState("small");
  const [row, setRow] = useState(boardSizes.small.row);
  const [col, setCol] = useState(boardSizes.small.col);
  const [players, setPlayers] = useState(2);
  const [gameId, setGameId] = useState("");
  const [playerId, setPlayerId] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [mode, setMode] = useState('single');
  const [joinGameId, setJoinGameId] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 480);

  // Options for custom selects
  const sizeOptions = [
    { value: 'small', label: isMobile ? '9×6' : 'Small (9×6)' },
    { value: 'medium', label: isMobile ? '12×8' : 'Medium (12×8)' },
    { value: 'big', label: isMobile ? '15×10' : 'Big (15×10)' }
  ];

  const modeOptions = [
    { value: 'single', label: isMobile ? '🏠 Local' : '🏠 Local Mode' },
    { value: 'multi', label: isMobile ? '🌐 Online' : '🌐 Online Multiplayer' }
  ];

  // Handle window resize to detect mobile
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 480);
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleSizeChange = (e) => {
    const newSize = e.target.value;
    setSize(newSize);
    setRow(boardSizes[newSize].row);
    setCol(boardSizes[newSize].col);
  };

  // When mode changes, generate a Game ID for multiplayer
  const handleModeChange = (e) => {
    const selectedMode = e.target.value;
    setMode(selectedMode);
    setPlayerId(null);
    setError("");
    if (selectedMode === "multi") {
      setGameId(generateGameId());
    } else {
      setGameId("");
    }
  };

  const handleCopyGameId = () => {
    if (gameId) {
      navigator.clipboard.writeText(gameId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    }
  };

  const handleExit = () => {
    setPage("menu");
    // Don't clear gameId to keep it persistent
    setPlayerId(null);
    setIsHost(false);
    setJoinGameId("");
    setError("");
  };

  const handleStartGame = async () => {
    setError("");
    if (players < 2 || players > 8) {
      setError("Players must be between 2 and 8.");
      return;
    }

    try {
      // For multiplayer, pass the pre-generated gameId. For single player, the backend will assign one.
      const gameData = {
        mode,
        row,
        col,
        players,
        gameId: mode === 'multi' ? gameId : null,
      };

      const createdGame = await createGame(gameData);

      if (createdGame.error) {
        setError(createdGame.error);
        // If the ID already existed, generate a new one for the user to try again.
        if (mode === 'multi') {
          setGameId(generateGameId());
        }
        return;
      }

      setGameId(createdGame.id);
      const join = await joinGame(createdGame.id);
      setPlayerId(join.playerId);
      setIsHost(join.isHost || false);
      setPage("game");
    } catch (e) {
      setError("Server error. Could not start game.");
    }
  };

  const handleJoinGame = async () => {
    setError("");
    if (!joinGameId) {
      setError("Please enter a game ID.");
      return;
    }
    try {
      const join = await joinGame(joinGameId);
      if (join.error) {
        setError(join.error);
        return;
      }
      setGameId(joinGameId);
      setPlayerId(join.playerId);
      setIsHost(join.isHost || false);
      setPage("game");
    } catch (e) {
      setError("Failed to join game. Check the ID and try again.");
    }
  };

  return (
    <div className="menu-container">
      {page === "menu" ? (
        <div className="menu-card">
          {/* Game Title */}
          <h1 className="menu-title">Chain Reaction</h1>
          
          {/* Game Configuration Section */}
          <div className="config-section">
            <h2 className="section-title">Game Setup</h2>
            
            {/* Board Size Selection */}
            <div className="config-item">
              <div className="config-label">
                <span>Board Size</span>
              </div>
              <CustomSelect
                value={size}
                options={sizeOptions}
                onChange={handleSizeChange}
              />
            </div>

            {/* Number of Players */}
            <div className="config-item">
              <div className="config-label">
                <span className="config-icon">👥</span>
                <span>Players</span>
              </div>
              <input
                className="game-input"
                type="number"
                min={2}
                max={8}
                value={players}
                onChange={(e) => setPlayers(Number(e.target.value))}
              />
            </div>

            {/* Game Mode */}
            <div className="config-item">
              <div className="config-label">
                <span className="config-icon">🎯</span>
                <span>Mode</span>
              </div>
              <CustomSelect
                value={mode}
                options={modeOptions}
                onChange={handleModeChange}
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="action-buttons">
            <button
              onClick={handleStartGame}
              disabled={players < 2 || players > 8}
              className="start-button"
            >
              Start Game
            </button>

            {/* Multiplayer Section */}
            {mode === 'multi' && (
              <div className="multiplayer-section">
                <div className="multiplayer-boxes">
                  {/* Share Game ID Box */}
                  <div className="share-game-box">
                    <h3 className="box-title">🔗 Share Game ID</h3>
                    <div className="game-id-display">
                      <span className="game-id-text">{gameId}</span>
                      <button
                        onClick={handleCopyGameId}
                        className="copy-id-button"
                      >
                        {copied ? "✅ Copied!" : "📋 Copy"}
                      </button>
                    </div>
                    <p className="box-instruction">Share this ID with friends to join!</p>
                  </div>

                  {/* Join Game Box */}
                  <div className="join-game-box">
                    <h3 className="box-title">Join Existing Game</h3>
                    <div className="join-input-group">
                      <input
                        className="join-input"
                        type="text"
                        placeholder="Enter Game ID"
                        value={joinGameId}
                        onChange={e => setJoinGameId(e.target.value)}
                      />
                      <button onClick={handleJoinGame} className="join-button">
                        Join
                      </button>
                    </div>
                    <p className="box-instruction">Enter a friend's Game ID to join their game!</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Error Display */}
          {error && (
            <div className="error-message">
              ⚠️ {error}
            </div>
          )}
        </div>
      ) : (
        <>
          <GameBoard row={row} col={col} players={players} onExit={handleExit} gameId={gameId} playerId={playerId} mode={mode} isHost={isHost} />
          {mode === 'multi' && (
            <div className="game-info-footer">
              Game ID: {gameId || 'N/A'} | Player ID: {playerId || 'N/A'} | {isHost ? 'Host' : 'Player'}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default Menu;
