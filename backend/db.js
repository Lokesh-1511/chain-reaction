const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
let db;

function initializeFirebase() {
  try {
    // Check if already initialized
    if (admin.apps.length === 0) {
      // For production, use Application Default Credentials or environment variable
      if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        const serviceAccount = require(process.env.GOOGLE_APPLICATION_CREDENTIALS);
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount)
        });
      } else {
        // For deployed environments (Cloud Run, App Engine, etc.)
        admin.initializeApp();
      }
      
      console.log('✅ Firebase Admin initialized successfully');
    }
    
    db = admin.firestore();
    
    // Configure Firestore settings
    db.settings({
      ignoreUndefinedProperties: true,
      timestampsInSnapshots: true
    });
    
    return db;
  } catch (error) {
    console.error('❌ Failed to initialize Firebase:', error);
    throw error;
  }
}

// Collections
const COLLECTIONS = {
  GAMES: 'games',
  USERS: 'users',
  SESSIONS: 'sessions'
};

// ========== GAME OPERATIONS ==========

/**
 * Create a new game in Firestore
 */
async function createGame(gameData) {
  try {
    const gameRef = db.collection(COLLECTIONS.GAMES).doc(gameData.id);
    
    const gameDoc = {
      ...gameData,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      // Convert Sets to Arrays for Firestore
      activePlayers: Array.from(gameData.activePlayers || []),
      surrenderedPlayers: Array.from(gameData.surrenderedPlayers || [])
    };
    
    await gameRef.set(gameDoc);
    console.log(`✅ Game created in Firestore: ${gameData.id}`);
    
    return gameDoc;
  } catch (error) {
    console.error('❌ Error creating game:', error);
    throw error;
  }
}

/**
 * Get a game by ID
 */
async function getGame(gameId) {
  try {
    const gameRef = db.collection(COLLECTIONS.GAMES).doc(gameId);
    const doc = await gameRef.get();
    
    if (!doc.exists) {
      return null;
    }
    
    const data = doc.data();
    // Convert arrays back to Sets
    if (data.activePlayers) {
      data.activePlayers = new Set(data.activePlayers);
    }
    if (data.surrenderedPlayers) {
      data.surrenderedPlayers = new Set(data.surrenderedPlayers);
    }
    
    return data;
  } catch (error) {
    console.error(`❌ Error getting game ${gameId}:`, error);
    throw error;
  }
}

/**
 * Update a game
 */
async function updateGame(gameId, updates) {
  try {
    const gameRef = db.collection(COLLECTIONS.GAMES).doc(gameId);
    
    // Convert Sets to Arrays
    const updateData = { ...updates };
    if (updateData.activePlayers instanceof Set) {
      updateData.activePlayers = Array.from(updateData.activePlayers);
    }
    if (updateData.surrenderedPlayers instanceof Set) {
      updateData.surrenderedPlayers = Array.from(updateData.surrenderedPlayers);
    }
    
    updateData.updatedAt = admin.firestore.FieldValue.serverTimestamp();
    
    await gameRef.update(updateData);
    console.log(`✅ Game updated in Firestore: ${gameId}`);
  } catch (error) {
    console.error(`❌ Error updating game ${gameId}:`, error);
    throw error;
  }
}

/**
 * Delete a game
 */
async function deleteGame(gameId) {
  try {
    await db.collection(COLLECTIONS.GAMES).doc(gameId).delete();
    console.log(`✅ Game deleted from Firestore: ${gameId}`);
  } catch (error) {
    console.error(`❌ Error deleting game ${gameId}:`, error);
    throw error;
  }
}

/**
 * Get all active games (for admin/monitoring)
 */
async function getActiveGames() {
  try {
    const snapshot = await db.collection(COLLECTIONS.GAMES)
      .where('status', 'in', ['waiting', 'active'])
      .get();
    
    return snapshot.docs.map(doc => {
      const data = doc.data();
      if (data.activePlayers) {
        data.activePlayers = new Set(data.activePlayers);
      }
      if (data.surrenderedPlayers) {
        data.surrenderedPlayers = new Set(data.surrenderedPlayers);
      }
      return data;
    });
  } catch (error) {
    console.error('❌ Error getting active games:', error);
    throw error;
  }
}

/**
 * Clean up old games (older than 24 hours)
 */
async function cleanupOldGames() {
  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const snapshot = await db.collection(COLLECTIONS.GAMES)
      .where('createdAt', '<', oneDayAgo)
      .get();
    
    const batch = db.batch();
    snapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    await batch.commit();
    console.log(`🧹 Cleaned up ${snapshot.size} old games`);
    
    return snapshot.size;
  } catch (error) {
    console.error('❌ Error cleaning up old games:', error);
    throw error;
  }
}

// ========== USER OPERATIONS ==========

/**
 * Create or update user profile
 */
async function createOrUpdateUser(userId, userData) {
  try {
    const userRef = db.collection(COLLECTIONS.USERS).doc(userId);
    const doc = await userRef.get();
    
    if (doc.exists) {
      // Update existing user
      await userRef.update({
        ...userData,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      const updatedDoc = await userRef.get();
      return updatedDoc.data();
    } else {
      // Create new user
      const newUser = {
        ...userData,
        id: userId,
        gamesPlayed: 0,
        gamesWon: 0,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };
      
      await userRef.set(newUser);
      return newUser;
    }
  } catch (error) {
    console.error(`❌ Error creating/updating user ${userId}:`, error);
    throw error;
  }
}

/**
 * Get user by ID
 */
async function getUser(userId) {
  try {
    const userRef = db.collection(COLLECTIONS.USERS).doc(userId);
    const doc = await userRef.get();
    
    if (!doc.exists) {
      return null;
    }
    
    return doc.data();
  } catch (error) {
    console.error(`❌ Error getting user ${userId}:`, error);
    throw error;
  }
}

/**
 * Update user stats (after game completion)
 */
async function updateUserStats(userId, won) {
  try {
    const userRef = db.collection(COLLECTIONS.USERS).doc(userId);
    
    await userRef.update({
      gamesPlayed: admin.firestore.FieldValue.increment(1),
      gamesWon: admin.firestore.FieldValue.increment(won ? 1 : 0),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    const updatedDoc = await userRef.get();
    return updatedDoc.data();
  } catch (error) {
    console.error(`❌ Error updating user stats for ${userId}:`, error);
    throw error;
  }
}

// ========== SESSION OPERATIONS ==========

/**
 * Create or update session
 */
async function createSession(sessionId, sessionData) {
  try {
    const sessionRef = db.collection(COLLECTIONS.SESSIONS).doc(sessionId);
    
    await sessionRef.set({
      ...sessionData,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: new Date(Date.now() + (sessionData.expiresIn || 1800000)) // 30 minutes default
    });
    
    console.log(`✅ Session created: ${sessionId}`);
  } catch (error) {
    console.error(`❌ Error creating session ${sessionId}:`, error);
    throw error;
  }
}

/**
 * Get session
 */
async function getSession(sessionId) {
  try {
    const sessionRef = db.collection(COLLECTIONS.SESSIONS).doc(sessionId);
    const doc = await sessionRef.get();
    
    if (!doc.exists) {
      return null;
    }
    
    const data = doc.data();
    
    // Check if session expired
    if (data.expiresAt && data.expiresAt.toDate() < new Date()) {
      await sessionRef.delete();
      return null;
    }
    
    return data;
  } catch (error) {
    console.error(`❌ Error getting session ${sessionId}:`, error);
    throw error;
  }
}

/**
 * Delete session
 */
async function deleteSession(sessionId) {
  try {
    await db.collection(COLLECTIONS.SESSIONS).doc(sessionId).delete();
    console.log(`✅ Session deleted: ${sessionId}`);
  } catch (error) {
    console.error(`❌ Error deleting session ${sessionId}:`, error);
    throw error;
  }
}

/**
 * Clean up expired sessions
 */
async function cleanupExpiredSessions() {
  try {
    const now = new Date();
    
    const snapshot = await db.collection(COLLECTIONS.SESSIONS)
      .where('expiresAt', '<', now)
      .get();
    
    const batch = db.batch();
    snapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    await batch.commit();
    console.log(`🧹 Cleaned up ${snapshot.size} expired sessions`);
    
    return snapshot.size;
  } catch (error) {
    console.error('❌ Error cleaning up expired sessions:', error);
    throw error;
  }
}

// ========== UTILITY FUNCTIONS ==========

/**
 * Get database statistics
 */
async function getDatabaseStats() {
  try {
    const gamesSnapshot = await db.collection(COLLECTIONS.GAMES).count().get();
    const usersSnapshot = await db.collection(COLLECTIONS.USERS).count().get();
    const sessionsSnapshot = await db.collection(COLLECTIONS.SESSIONS).count().get();
    
    return {
      totalGames: gamesSnapshot.data().count || 0,
      totalUsers: usersSnapshot.data().count || 0,
      totalSessions: sessionsSnapshot.data().count || 0
    };
  } catch (error) {
    console.error('❌ Error getting database stats:', error);
    // Return safe defaults if Firestore is unavailable
    return {
      totalGames: 0,
      totalUsers: 0,
      totalSessions: 0,
      error: 'Could not reach Firestore'
    };
  }
}

module.exports = {
  initializeFirebase,
  // Game operations
  createGame,
  getGame,
  updateGame,
  deleteGame,
  getActiveGames,
  cleanupOldGames,
  // User operations
  createOrUpdateUser,
  getUser,
  updateUserStats,
  // Session operations
  createSession,
  getSession,
  deleteSession,
  cleanupExpiredSessions,
  // Utilities
  getDatabaseStats,
  // Direct access to Firestore (use cautiously)
  get db() { return db; }
};
