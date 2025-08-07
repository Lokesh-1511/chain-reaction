// Test script to verify room code generation works correctly
console.log('Testing room code generation...');

// Generate a unique alphanumeric Game/Room ID (same as backend)
function generateRoomCode() {
  let roomCode;
  let attempts = 0;
  const maxAttempts = 10;
  
  do {
    roomCode = Math.random().toString(36).substr(2, 6).toUpperCase();
    attempts++;
  } while (false && attempts < maxAttempts); // No existing games to check
  
  if (attempts >= maxAttempts) {
    // Fallback to timestamp-based code if too many collisions
    roomCode = Date.now().toString(36).toUpperCase().substr(-6);
  }
  
  console.log('Generated room code:', roomCode);
  return roomCode;
}

// Simulate createGame function
function createGame({ id, mode, row = 9, col = 6, players = 2 }) {
  let gameIdCounter = 1;
  const gameId = id || (mode === 'multi' ? generateRoomCode() : gameIdCounter++);
  console.log('Creating game with mode:', mode, 'gameId:', gameId);
  return { id: gameId, mode, players: [] };
}

// Test multiplayer room creation
console.log('\n=== Testing Multiplayer Room Creation ===');
for (let i = 0; i < 5; i++) {
  const game = createGame({ mode: 'multi', players: 2 });
  console.log(`Test ${i + 1}: Room ID = ${game.id} (Type: ${typeof game.id})`);
}

// Test single player creation
console.log('\n=== Testing Single Player Creation ===');
for (let i = 0; i < 3; i++) {
  const game = createGame({ mode: 'single', players: 2 });
  console.log(`Test ${i + 1}: Game ID = ${game.id} (Type: ${typeof game.id})`);
}
