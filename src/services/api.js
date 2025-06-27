const API_URL = 'http://localhost:5000/api';

export async function createGame({ mode, row, col, players }) {
  const res = await fetch(`${API_URL}/game`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, row, col, players })
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
