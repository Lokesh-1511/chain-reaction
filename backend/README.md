# Chain Reaction Backend Server

Production-ready Node.js/Express backend with Socket.IO for real-time multiplayer Chain Reaction game, using Firebase Firestore for data persistence.

## 🚀 Features

- ✅ **Real-time Multiplayer** with Socket.IO
- ✅ **Persistent Storage** with Firebase Firestore
- ✅ **Production Security** with Helmet & Rate Limiting
- ✅ **User Profiles & Stats** tracking
- ✅ **Room-based Game System** with reconnection support
- ✅ **Automatic Cleanup** of old games and expired sessions
- ✅ **Health Monitoring** endpoint
- ✅ **Graceful Shutdown** handling

## 📋 Prerequisites

- **Node.js** >= 18.0.0
- **Firebase Project** with Firestore enabled
- **Firebase Service Account Key** (see setup below)

## 🛠️ Setup Instructions

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Firebase Configuration

#### A. Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project or use existing one
3. Enable **Firestore Database**:
   - Go to **Build** → **Firestore Database**
   - Click **Create database**
   - Choose **Production mode** (configure rules later)
   - Select a location (preferably close to your users)

#### B. Get Service Account Key

1. In Firebase Console, go to **Project Settings** (⚙️)
2. Navigate to **Service Accounts** tab
3. Click **Generate New Private Key**
4. Save the JSON file as `serviceAccountKey.json` in the `backend/` folder

**⚠️ IMPORTANT:** Never commit this file to Git! It's already in `.gitignore`.

#### C. Firestore Security Rules (Optional)

For production, update your Firestore rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow backend service account full access
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
    
    // For client-side access, add specific rules
    match /users/{userId} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
    
    match /games/{gameId} {
      allow read: if true;
      allow write: if false; // Only backend can write
    }
  }
}
```

### 3. Environment Configuration

Create a `.env` file in the `backend/` folder:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
# Server Configuration
PORT=5000
NODE_ENV=development

# Firebase Configuration
GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json

# CORS Configuration (comma-separated)
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000,https://yourdomain.com

# Session Configuration (in milliseconds)
SESSION_TIMEOUT_MS=1800000
RECONNECT_GRACE_PERIOD_MS=30000

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

**Configuration Options:**

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port number | 5000 |
| `NODE_ENV` | Environment (`development` \| `production`) | development |
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to Firebase service account key | ./serviceAccountKey.json |
| `ALLOWED_ORIGINS` | Comma-separated list of allowed CORS origins | localhost:5173,localhost:3000 |
| `SESSION_TIMEOUT_MS` | Session timeout in milliseconds | 1800000 (30 min) |
| `RECONNECT_GRACE_PERIOD_MS` | Grace period for reconnection | 30000 (30 sec) |
| `RATE_LIMIT_WINDOW_MS` | Rate limit time window | 900000 (15 min) |
| `RATE_LIMIT_MAX_REQUESTS` | Max requests per window | 100 |

### 4. Run the Server

#### Development Mode (with auto-reload):

```bash
npm run dev
```

#### Production Mode:

```bash
npm start
```

### 5. Verify Installation

Check the health endpoint:

```bash
curl http://localhost:5000/health
```

Expected response:
```json
{
  "status": "OK",
  "timestamp": "2025-12-31T...",
  "service": "chain-reaction-backend",
  "version": "2.0.0",
  "environment": "development",
  "database": "connected",
  "stats": {
    "totalGames": 0,
    "totalUsers": 0,
    "totalSessions": 0
  }
}
```

## 📁 Project Structure

```
backend/
├── server.js              # Main server with Socket.IO handlers
├── db.js                  # Firestore database operations
├── gameLogic.js          # Core game logic (grid, moves, explosions)
├── package.json           # Dependencies and scripts
├── .env                   # Environment variables (create this)
├── .env.example           # Environment template
├── .gitignore            # Git ignore rules
├── serviceAccountKey.json # Firebase credentials (create this)
└── README.md             # This file
```

## 🔌 API Endpoints

### REST API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Server info |
| `GET` | `/health` | Health check with database stats |
| `POST` | `/api/game` | Create new game |
| `POST` | `/api/game/:id/join` | Join a game |
| `GET` | `/api/game/:id` | Get game state |
| `POST` | `/api/user/profile` | Create user profile |
| `GET` | `/api/user/:userId` | Get user profile |
| `PUT` | `/api/user/:userId/stats` | Update user stats |

### Socket.IO Events

**Client → Server:**
- `createRoom` - Create multiplayer room
- `joinRoom` - Join room by code
- `joinGame` - Join game (old system)
- `makeMove` - Make a move
- `requestReplay` - Request play again
- `respondToReplay` - Respond to replay request
- `exitGame` / `exitRoom` - Exit game
- `surrenderGame` / `surrenderRoom` - Surrender
- `rejoinRoom` - Reconnect after disconnect

**Server → Client:**
- `roomCreated` - Room created successfully
- `roomJoined` - Joined room successfully
- `playerJoined` - Another player joined
- `gameUpdate` - Game state updated
- `gameOver` - Game finished
- `replayRequested` - Play again requested
- `replayResponse` - Player responded to replay
- `gameRestarted` - Game restarted
- `replayCancelled` - Replay cancelled
- `playerLeft` / `playerSurrendered` - Player exited
- `playerDisconnected` - Player disconnected (30s timer)
- `playerRejoined` - Player reconnected
- `gameClosedByHost` - Host closed the game
- `error` - Error occurred

## 🗄️ Database Schema

### Collections

#### `games`
```javascript
{
  id: string,                    // Game/Room ID
  mode: 'single' | 'multi',     // Game mode
  status: 'waiting' | 'active' | 'finished',
  players: number[],             // Array of player IDs [1, 2, ...]
  activePlayers: number[],       // Currently active players
  surrenderedPlayers: number[],  // Surrendered players
  playerUsernames: {},           // Map of playerId → username
  hostPlayerId: number,          // Host player ID
  state: {                       // Game state
    grid: Cell[][],              // Game grid
    row: number,                 // Grid rows
    col: number,                 // Grid columns
    players: number,             // Total players
    currentPlayer: number,       // Current turn
    activePlayers: number[],     // Active players
    playersMoved: number[],      // Players who made moves
    winner: number,              // Winner ID
    status: string               // Game status
  },
  replayRequests: {},            // Replay vote tracking
  replayRequestedBy: number,     // Who requested replay
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

#### `users`
```javascript
{
  id: string,
  username: string,
  avatar: string,
  gamesPlayed: number,
  gamesWon: number,
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

#### `sessions`
```javascript
{
  id: string,
  userId: string,
  gameId: string,
  expiresAt: Timestamp,
  createdAt: Timestamp
}
```

## 🔒 Security Features

1. **Helmet.js** - Security headers
2. **Rate Limiting** - 100 requests per 15 minutes per IP
3. **CORS** - Configurable allowed origins
4. **Input Validation** - All endpoints validate inputs
5. **Error Handling** - Proper error responses without leaking details
6. **Environment Variables** - Sensitive data in .env

## 🧹 Maintenance

### Automatic Cleanup

The server automatically runs cleanup jobs every hour:
- Deletes games older than 24 hours
- Removes expired sessions

### Manual Cleanup

You can also trigger cleanup via the database module:

```javascript
const db = require('./db');

// Clean old games
await db.cleanupOldGames();

// Clean expired sessions
await db.cleanupExpiredSessions();

// Get stats
const stats = await db.getDatabaseStats();
```

## 🚀 Deployment

### Deploy to Render/Railway/Heroku

1. Push code to GitHub
2. Connect your repository to Render/Railway/Heroku
3. Set environment variables in the platform dashboard
4. For Firebase credentials on Render/Railway:
   ```bash
   # Option 1: Upload serviceAccountKey.json via platform
   # Option 2: Set as environment variable (JSON string)
   GOOGLE_APPLICATION_CREDENTIALS={"type":"service_account",...}
   ```
5. Deploy!

### Deploy to Google Cloud Run

```bash
# Build Docker image
docker build -t gcr.io/YOUR_PROJECT_ID/chain-reaction-backend .

# Push to Container Registry
docker push gcr.io/YOUR_PROJECT_ID/chain-reaction-backend

# Deploy to Cloud Run
gcloud run deploy chain-reaction-backend \
  --image gcr.io/YOUR_PROJECT_ID/chain-reaction-backend \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated
```

**Note:** For Cloud Run, you don't need `GOOGLE_APPLICATION_CREDENTIALS` as it uses Application Default Credentials automatically.

### Environment Variables for Production

Set these in your deployment platform:

```env
NODE_ENV=production
PORT=5000
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=50
```

## 🐛 Troubleshooting

### "Firebase not initialized"
- Ensure `serviceAccountKey.json` exists in backend folder
- Check `GOOGLE_APPLICATION_CREDENTIALS` in `.env`
- Verify Firebase project has Firestore enabled

### "CORS error"
- Add your frontend URL to `ALLOWED_ORIGINS` in `.env`
- Ensure frontend is using the correct backend URL

### "Database connection error"
- Check Firebase service account key permissions
- Verify Firestore is enabled in Firebase Console
- Check network connectivity to Firebase

### "Rate limit exceeded"
- Increase `RATE_LIMIT_MAX_REQUESTS` in `.env`
- Or increase `RATE_LIMIT_WINDOW_MS` for longer window

## 📊 Monitoring

### Health Check

```bash
curl http://localhost:5000/health
```

### Database Stats

The health endpoint returns current database statistics:
- Total games
- Total users
- Total active sessions

### Logs

All requests and important events are logged to console:
- Request logging: `2025-12-31T... - POST /api/game`
- Game events: `🎮 Room created: ABC123`
- Errors: `❌ Error: ...`

## 🔗 Related Files

- Frontend configuration: `../src/config/firebase.js`
- Game logic: `./gameLogic.js`
- Firestore schema: `../FIRESTORE_SCHEMA.md`

## 📝 License

MIT

## 👥 Support

For issues or questions, please check:
1. This README
2. Project documentation in root folder
3. Firebase Console for Firestore errors
4. Server logs for detailed error messages
