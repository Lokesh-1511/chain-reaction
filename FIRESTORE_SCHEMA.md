Firestore Schema & Security (Chain Reaction)

This file defines a Firestore-first schema, Firestore security rules snippets, recommended indexes, sample documents, migration notes, and example server-side write patterns for the Chain Reaction project. Use this as a copy-pasteable reference for interviews or to implement Firestore persistence in your server.

-- Collections & Document Shapes

1) /users/{uid}
- Purpose: Auth-linked user profile and settings
- ID: Firebase Auth UID
- Fields:
  - username: string
  - displayName: string
  - avatarUrl: string
  - createdAt: timestamp
  - lastSeenAt: timestamp
  - settings: map
  - stats: map { gamesPlayed: number, wins: number, totalScore: number, streak: number }
  - roles: map { admin: boolean }

Sample:
{
  "username": "alice",
  "displayName": "Alice",
  "avatarUrl": "https://.../avatar.png",
  "createdAt": "2025-11-04T12:00:00Z",
  "lastSeenAt": "2025-11-04T12:05:00Z",
  "settings": { "grid": { "row": 9, "col": 6 } },
  "stats": { "gamesPlayed": 20, "wins": 12, "totalScore": 3145, "streak": 3 },
  "roles": { "admin": false }
}

2) /rooms/{roomId}
- Purpose: Active multiplayer lobby (ephemeral)
- ID: readable room code (e.g., "A1B2C3")
- Fields:
  - hostUid: string
  - players: array of { uid, username, joinedAt }
  - maxPlayers: number
  - row: number
  - col: number
  - createdAt: timestamp
  - status: string ("waiting" | "active" | "finished" | "cancelled")
  - gameId: string | null
  - settings: map
  - lastHeartbeat: timestamp

Note: store players as subcollection if churn is high: /rooms/{roomId}/players/{uid}

3) /games/{gameId}
- Purpose: Finished game summary and metadata
- ID: uuid or timestamp-based ID
- Fields:
  - createdAt, startedAt, finishedAt: timestamp
  - hostUid: string
  - players: array of { uid, username, startIndex }
  - settings: map { row, col, players }
  - winnerUid: string | null
  - durationSeconds: number
  - movesCount: number
  - boardSnapshot: map (sparse final board representation)
  - public: boolean

4) /games/{gameId}/moves/{moveId}
- Purpose: Move-by-move replay data
- Fields:
  - seq: number
  - uid: string
  - x: number
  - y: number
  - timestamp: timestamp
  - meta: map

Storage note: store moves as subcollection for efficient pagination (orderBy("seq")). Use batched writes for server-side writes.

5) /leaderboards/top (or /profiles ordered by wins)
- Purpose: Cached or derived top-N leaderboard entries
- Alternative: compute on read (costly) or maintain via Cloud Functions on game completion

6) /achievementsMeta/{id} and /users/{uid}/achievements/{id}
- Purpose: Achievement definitions and per-user unlocks

-- Recommended Composite Indexes
- games (public, finishedAt desc): for recent public games
  - fields: public ASC, finishedAt DESC
- profiles (wins desc): for top players
  - fields: wins DESC
- rooms (status, createdAt): to list waiting rooms
  - fields: status ASC, createdAt DESC

Create these via `firestore.indexes.json` or through Firebase console.

-- Firestore Security Rules (starter)

// Firestore rules - tailored starter
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    match /users/{uid} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == uid;
    }

    match /profiles/{uid} {
      // public read; server (admin) writes only
      allow read: if true;
      allow write: if request.auth != null && request.auth.token.admin == true;
    }

    match /rooms/{roomId} {
      allow create: if request.auth != null && request.resource.data.hostUid == request.auth.uid
        && request.resource.data.row is int && request.resource.data.col is int;
      allow read: if true;
      // limit client updates to non-critical fields (heartbeat), server handles status transitions
      allow update: if request.auth != null && (
        (request.resource.data.keys().hasOnly(['lastHeartbeat']) && request.auth.uid == resource.data.hostUid)
      );
    }

    match /rooms/{roomId}/players/{playerId} {
      allow create: if request.auth != null && request.auth.uid == playerId;
      allow read: if true;
      allow delete: if request.auth != null && (request.auth.uid == playerId || request.auth.token.admin == true);
    }

    match /games/{gameId} {
      allow read: if resource.data.public == true || request.auth.uid == resource.data.hostUid || request.auth.token.admin == true;
      // creation/updates only via trusted server (custom claim 'server' or admin)
      allow create, update, delete: if request.auth != null && request.auth.token.server == true;
    }

    match /games/{gameId}/moves/{moveId} {
      allow read: if true;
      allow create: if request.auth != null && request.auth.token.server == true;
    }

    match /leaderboards/{docId} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.token.server == true;
    }
  }
}

Notes:
- Use custom claims (set via Admin SDK) to mark server agents (`server == true`) and admins.
- Keep extremely sensitive transitions (e.g., marking game finished) as server-only operations.

-- Write patterns & transactions (server-side)

Preferred flow for `makeMove` (authoritative server writes):
1. Server receives makeMove over Socket.IO (with authenticated uid).
2. Server validates move against authoritative in-memory or Redis state and computes new board state (using the game logic module).
3. Server writes authoritative updates to Firestore in a transaction or batched write:
   - update `/games/{gameId}` summary fields (currentPlayer, status, movesCount)
   - create `/games/{gameId}/moves/{seq}` move doc
   - optionally update `/rooms/{roomId}` or `/users/{uid}/stats` (with atomic increments)
4. After successful write, server emits `gameUpdate` event to room participants.

Example Node snippet (pseudo):

const admin = require('firebase-admin');
// admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function persistMove(gameId, moveDoc, gameSummaryUpdate) {
  const batch = db.batch();
  const gameRef = db.collection('games').doc(gameId);
  const moveRef = gameRef.collection('moves').doc();
  batch.set(moveRef, moveDoc);
  batch.update(gameRef, gameSummaryUpdate);
  await batch.commit();
}

-- Migration notes (in-memory -> Firestore)

1. Decide authoritative writer(s): the Node server should be the authoritative writer that validates moves and writes to Firestore.
2. Map in-memory objects to Firestore docs: `games[gameId]` -> `/games/{gameId}`, `rooms` -> `/rooms/{roomId}`.
3. Implement batched writes for per-move persistence. If move frequency is extremely high, keep ephemeral state in Redis and checkpoint to Firestore periodically.
4. Add cleanup for stale rooms using Cloud Functions scheduled jobs or `lastHeartbeat`.

-- Cost & performance cautions

- Firestore charges per document read/write/delete. Per-move writes at very high rates can be costly.
- Strategies to reduce cost:
  - Save every Nth move (snapshots + diffs) instead of every single move.
  - Batch writes for a move + summary to reduce overhead.
  - Use Cloud Functions to update aggregated leaderboards sparingly.
  - Export to BigQuery for analytics rather than performing heavy queries in Firestore.

-- Testing guidance

- Use the Firebase Emulator Suite for integration tests (Auth + Firestore + Functions) so you can run tests locally and validate security rules and server writes.
- Use unit tests for the pure game logic (backend/gameLogic.js) and integration tests for socket flows with socket.io-client + Firestore emulator.

-- Example sample documents

users/uid_abc:
{
  "username": "alice",
  "createdAt": "2025-11-04T12:00:00Z",
  "stats": { "gamesPlayed": 20, "wins": 12 }
}

rooms/A1B2C3:
{
  "hostUid": "uid_abc",
  "players": [{ "uid": "uid_abc", "username": "Alice", "joinedAt": "2025-11-04T12:00:01Z" }],
  "maxPlayers": 2,
  "row": 9,
  "col": 6,
  "createdAt": "2025-11-04T12:00:00Z",
  "status": "waiting",
  "lastHeartbeat": "2025-11-04T12:02:00Z"
}

games/game_0001:
{
  "createdAt": "2025-11-04T12:00:00Z",
  "startedAt": "2025-11-04T12:00:10Z",
  "finishedAt": "2025-11-04T12:06:00Z",
  "players": [{ "uid": "uid_abc", "username": "Alice" },{ "uid": "uid_xyz", "username": "Bob" }],
  "settings": { "row": 9, "col": 6 },
  "winnerUid": "uid_xyz",
  "movesCount": 38,
  "boardSnapshot": { "0_0": { "player": "uid_abc", "count": 2 } },
  "public": true
}

-- End of FIRESTORE_SCHEMA.md
