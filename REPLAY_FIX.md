# Multiplayer Replay Fix

## Issue Description
In multiplayer games, when one player requested a replay and the other player accepted it, the requesting player would get stuck on a "waiting for other players" page while the accepting player would successfully enter the new game.

## Root Cause Analysis
The problem was a **socket room naming inconsistency** between different parts of the backend:

### Two Socket Room Systems
1. **Old System** (REST API games): Uses `game_${gameId}` format
2. **New System** (Room-based multiplayer): Uses `room_${roomCode}` format

### The Problem
- **Replay handlers** were using the old `game_${gameId}` format
- **New multiplayer games** use the new `room_${roomCode}` format
- When replay events were emitted, they went to the wrong socket room
- Players never received the `gameRestarted` event

## Solution Implemented

### Backend Changes (server.js)
Updated all multiplayer socket event handlers to use the correct room format:

```javascript
// Before: Hard-coded old format
io.to(`game_${gameId}`).emit('gameRestarted', { gameId, state: newState });

// After: Dynamic room format based on game mode
const roomName = game.mode === 'multi' ? `room_${gameId}` : `game_${gameId}`;
io.to(roomName).emit('gameRestarted', { gameId, state: newState });
```

### Handlers Updated
- ✅ `requestReplay` - Fixed room format for replay requests
- ✅ `respondToReplay` - Fixed room format for replay responses and game restart
- ✅ `exitGame` - Fixed room format for player exits
- ✅ `surrenderGame` - Fixed room format for surrenders
- ✅ `makeMove` - Fixed room format for moves (consistency)

### Flow After Fix
1. Player 1 requests replay → Backend emits to correct `room_${gameId}`
2. Player 2 receives request in correct room → Shows accept/decline dialog
3. Player 2 accepts → Backend emits `gameRestarted` to correct room
4. **Both players** receive `gameRestarted` event → Both enter new game
5. Waiting states properly cleared → Game starts normally

## Test Scenarios
The fix addresses these scenarios:
- ✅ 2-player multiplayer replay requests
- ✅ Multi-player multiplayer replay requests  
- ✅ Player exits during replay flow
- ✅ Player surrenders during replay flow
- ✅ Host vs non-host replay behavior

## Deployment Status
- ✅ Code committed and pushed to GitHub
- ⏳ Waiting for Render to auto-deploy the backend changes
- 🎯 Ready to test once backend redeploys

## Expected Behavior After Fix
1. Player requests replay → Shows "waiting for others" modal
2. Other player(s) see replay request dialog
3. If all accept → **All players** simultaneously enter new game
4. If any decline → Replay cancelled for everyone
5. No more stuck waiting pages!

## Verification Steps
1. Start multiplayer game with 2 players
2. Finish the game (let one player win)
3. Player 1 clicks "Request Replay"
4. Player 2 clicks "Yes, Play Again" 
5. **Both players should enter the new game together**
