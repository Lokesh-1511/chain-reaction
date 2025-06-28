import React, { useState } from "react";
import GameBoard from "./GameBoard";
import { createGame, joinGame } from '../services/api';
import socket from '../services/socket';
import "./Menu.css";

// Generate a unique alphanumeric Game ID
function generateGameId() {
  return Math.random().toString(36).substr(2, 6).toUpperCase();
}

function Menu() {
  const [page, setPage] = useState("menu");
  const [row, setRow] = useState(0);
  const [col, setCol] = useState(0);
  const [players, setPlayers] = useState(0);
  const [gameId, setGameId] = useState("");
  const [playerId, setPlayerId] = useState(null);
  const [mode, setMode] = useState('single');
  const [joinGameId, setJoinGameId] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

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
    setGameId("");
    setPlayerId(null);
    setJoinGameId("");
    setError("");
  };

  const handleStartGame = async () => {
    setError("");
    if (row >= 2 && col >= 2 && players >= 2 && players <= 8) {
      try {
        // Use the pre-generated gameId for multiplayer, let backend assign for single
        let createdGame;
        if (mode === "multi") {
          createdGame = await createGame({ mode, row, col, players });
          setGameId(createdGame.id);
        } else {
          createdGame = await createGame({ mode, row, col, players });
          setGameId(createdGame.id);
        }
        const join = await joinGame(createdGame.id);
        setPlayerId(join.playerId);
        setPage("game");
      } catch (e) {
        setError("Server error. Try again.");
      }
    } else {
      setError("Please enter valid values for all fields.");
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
      setPage("game");
    } catch (e) {
      setError("Failed to join game. Check the ID and try again.");
    }
  };

  return (
    <div id="card">
      {page === "menu" ? (
        <>
          <h1>Chain Reaction Game</h1>
          <div className="input-container">
            <label>Choose dimension</label>
            <input
              id="row"
              type="number"
              min={2}
              max={12}
              onChange={(e) => setRow(Number(e.target.value))}
            />
            <input
              id="col"
              type="number"
              min={2}
              max={12}
              onChange={(e) => setCol(Number(e.target.value))}
            />
          </div>

          <div className="input-container">
            <label>Choose number of players</label>
            <input
              id="players"
              type="number"
              min={2}
              max={8}
              onChange={(e) => setPlayers(Number(e.target.value))}
            />
          </div>
          <div className="input-container">
            <label>Mode</label>
            <select className="styled-select" value={mode} onChange={handleModeChange}>
              <option value="single">Single Player</option>
              <option value="multi">Multiplayer</option>
            </select>
          </div>
          {mode === "multi" && gameId && (
            <div style={{ margin: "20px 0", color: "#ffeb3b", fontWeight: "bold", fontSize: "22px" }}>
              Game ID: {gameId}
              <button
                onClick={handleCopyGameId}
                style={{
                  marginLeft: "10px",
                  padding: "4px 10px",
                  fontSize: "16px",
                  borderRadius: "4px",
                  border: "none",
                  background: "#333",
                  color: "#fff",
                  cursor: "pointer"
                }}
              >
                {copied ? "Copied!" : "Copy"}
              </button>
              <span style={{ fontSize: "14px", color: "#fff", marginLeft: "10px" }}>
                (Share this with your friend!)
              </span>
            </div>
          )}
          <br />
          <button
            onClick={handleStartGame}
            disabled={row < 2 || col < 2 || players < 2 || players > 8}
          >
            Start Game
          </button>
          {mode === 'multi' && (
            <div style={{ marginTop: '20px' }}>
              <h3>Join a Multiplayer Game</h3>
              <input
                type="text"
                placeholder="Enter Game ID"
                value={joinGameId}
                onChange={e => setJoinGameId(e.target.value)}
              />
              <button onClick={handleJoinGame}>Join Game</button>
            </div>
          )}
          {error && <div style={{ color: 'red', marginTop: '10px' }}>{error}</div>}
        </>
      ) : (
        <>
          <GameBoard row={row} col={col} players={players} onExit={handleExit} gameId={gameId} playerId={playerId} mode={mode} />
          <div style={{ color: 'yellow', marginTop: '10px' }}>
            Game ID: {gameId || 'N/A'} | Player ID: {playerId || 'N/A'}
          </div>
        </>
      )}
    </div>
  );
}

export default Menu;
