// Use localhost for development, Render for production
const API_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:5000/api' 
  : 'https://chain-reaction-backend-pml1.onrender.com/api';

export async function createGame({ mode, row, col, players, gameId }) {
  const res = await fetch(`${API_URL}/game`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, row, col, players, id: gameId })
  });
  return res.json();
}

export async function joinGame(gameId) {
  const res = await fetch(`${API_URL}/game/${gameId}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  return res.json();
}

export async function getGameState(gameId) {
  const res = await fetch(`${API_URL}/game/${gameId}`);
  return res.json();
}
