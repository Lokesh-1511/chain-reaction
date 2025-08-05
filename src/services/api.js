// Use localhost for development, Render for production
const API_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:5000/api' 
  : 'https://chain-reaction-backend-pml1.onrender.com/api';

// Helper function to handle API calls with error handling
async function apiCall(url, options = {}) {
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('API call failed:', error);
    throw error;
  }
}

export async function createGame({ mode, row, col, players, gameId }) {
  return await apiCall(`${API_URL}/game`, {
    method: 'POST',
    body: JSON.stringify({ mode, row, col, players, id: gameId })
  });
}

export async function joinGame(gameId, username) {
  return await apiCall(`${API_URL}/game/${gameId}/join`, {
    method: 'POST',
    body: JSON.stringify({ username })
  });
}

export async function getGameState(gameId) {
  return await apiCall(`${API_URL}/game/${gameId}`);
}
