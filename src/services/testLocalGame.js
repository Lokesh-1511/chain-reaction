/**
 * Simple test to verify local game logic works
 */
import { createLocalGame } from './localGameLogic.js';

// Test basic game creation
try {
  const game = createLocalGame(3, 3, 2);
  console.log('✅ Local game creation successful');
  console.log('Initial state:', game.getGameState());
  
  // Test a move
  const result = game.makeMove(0, 0);
  console.log('✅ First move successful:', result);
  
} catch (error) {
  console.error('❌ Local game test failed:', error);
}

export default true;