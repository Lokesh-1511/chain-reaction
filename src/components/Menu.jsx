import React, { useState } from "react";
import GameBoard from "./GameBoard";
import { createGame, joinGame } from '../services/api';
import socket from '../services/socket';
import "./Menu.css";

function Menu() {
  const [page, setPage] = useState("menu");
  const [row, setRow] = useState(0);
  const [col, setCol] = useState(0);
  const [players, setPlayers] = useState(0);
  const [gameId, setGameId] = useState(null);
  const [playerId, setPlayerId] = useState(null);
  const [mode, setMode] = useState('single');
  const [joinGameId, setJoinGameId] = useState("");
  const [error, setError] = useState("");
  const [showGameId, setShowGameId] = useState(false);

  const handleExit = () => {
    setPage("menu");
    setGameId(null);
    setPlayerId(null);
    setJoinGameId("");
    setError("");
    setShowGameId(false);
  };

  const handleStartGame = async () => {
    setError("");
    console.log('Start Game clicked', { row, col, players, mode });
    if (row >= 2 && col >= 2 && players >= 2 && players <= 8) {
      try {
        const game = await createGame({ mode, row, col, players });
        if (!game || !game.id) {
          setError("Failed to create game. Try again.");
          return;
        }
        setGameId(game.id);
        const join = await joinGame(game.id);
        if (!join || !join.playerId) {
          setError("Failed to join game. Try again.");
          return;
        }
        setPlayerId(join.playerId);
        setShowGameId(true); // Always show Game ID screen for debug
        setPage("game"); // Also set page to game for immediate transition
      } catch (e) {
        setError("Server error. Try again.");
      }
    } else {
      setError("Please enter valid values for all fields.");
    }
  };

  const handleContinueToGame = () => {
    setShowGameId(false);
    setPage("game");
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
            <select value={mode} onChange={e => setMode(e.target.value)}>
              <option value="single">Single Player</option>
              <option value="multi">Multiplayer</option>
            </select>
          </div>
          <br/>
          <button onClick={handleStartGame} disabled={row < 2 || col < 2 || players < 2 || players > 8}>Start Game</button>
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
      ) : showGameId ? (
        <div style={{ textAlign: 'center', marginTop: '40px' }}>
          <h2>Share this Game ID with your friend:</h2>
          <div style={{ fontSize: '32px', margin: '20px 0', fontWeight: 'bold' }}>{gameId}</div>
          <button onClick={handleContinueToGame} style={{ fontSize: '18px', padding: '10px 30px' }}>Continue to Game</button>
        </div>
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
