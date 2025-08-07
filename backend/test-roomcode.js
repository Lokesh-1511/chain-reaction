// Quick test script to verify room code generation
function generateRoomCode() {
  return Math.random().toString(36).substr(2, 6).toUpperCase();
}

console.log('Testing room code generation:');
for (let i = 0; i < 10; i++) {
  const roomCode = generateRoomCode();
  console.log(`Room Code ${i + 1}: ${roomCode} (Length: ${roomCode.length})`);
}

// Test that codes are unique
const codes = new Set();
for (let i = 0; i < 1000; i++) {
  codes.add(generateRoomCode());
}
console.log(`\nGenerated 1000 codes, ${codes.size} were unique (${(codes.size/1000*100).toFixed(1)}% uniqueness)`);
