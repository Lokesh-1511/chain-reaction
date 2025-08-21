import { auth, db } from '../config/firebase';
import { doc, getDoc, updateDoc, setDoc, collection, addDoc, query, where, orderBy, limit, getDocs } from 'firebase/firestore';

/**
 * Initialize user profile with default stats
 */
export const initializeUserProfile = async (uid, username) => {
  try {
    const userRef = doc(db, 'users', uid);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      const defaultProfile = {
        username: username || '',
        bio: '',
        avatar: '',
        gamesPlayed: 0,
        gamesWon: 0,
        totalScore: 0,
        currentStreak: 0,
        bestStreak: 0,
        joinedDate: new Date().toISOString(),
        lastActiveDate: new Date().toISOString(),
        totalPlayTime: 0, // in minutes
        favoriteGridSize: '5x5',
        achievements: []
      };
      
      await setDoc(userRef, defaultProfile);
      return defaultProfile;
    }
    
    return userDoc.data();
  } catch (error) {
    console.error('Error initializing user profile:', error);
    throw error;
  }
};

/**
 * Update game statistics after a game completion
 */
export const updateGameStats = async (gameData) => {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    console.warn('No authenticated user to update stats for');
    return;
  }
  
  try {
    const userRef = doc(db, 'users', currentUser.uid);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      console.warn('User profile does not exist');
      return;
    }
    
    const currentStats = userDoc.data();
    const won = gameData.winner === gameData.playerId;
    
    // Calculate new streak
    let newCurrentStreak = won ? (currentStats.currentStreak || 0) + 1 : 0;
    let newBestStreak = Math.max(newCurrentStreak, currentStats.bestStreak || 0);
    
    // Calculate score based on performance
    const baseScore = won ? 100 : 25; // Win = 100 points, Loss = 25 points
    const gridSizeBonus = (gameData.gridSize || 25) * 2; // Bonus for larger grids
    const streakBonus = newCurrentStreak * 10; // Streak bonus
    const gameScore = baseScore + gridSizeBonus + streakBonus;
    
    const updatedStats = {
      gamesPlayed: (currentStats.gamesPlayed || 0) + 1,
      gamesWon: won ? (currentStats.gamesWon || 0) + 1 : (currentStats.gamesWon || 0),
      totalScore: (currentStats.totalScore || 0) + gameScore,
      currentStreak: newCurrentStreak,
      bestStreak: newBestStreak,
      lastActiveDate: new Date().toISOString(),
      totalPlayTime: (currentStats.totalPlayTime || 0) + (gameData.gameDuration || 0)
    };
    
    // Update favorite grid size based on most played
    if (gameData.gridSize) {
      const gridSizeKey = `${Math.sqrt(gameData.gridSize)}x${Math.sqrt(gameData.gridSize)}`;
      updatedStats.favoriteGridSize = gridSizeKey;
    }
    
    await updateDoc(userRef, updatedStats);
    
    // Record the game in game history
    await recordGameHistory(currentUser.uid, {
      ...gameData,
      won,
      score: gameScore,
      timestamp: new Date().toISOString()
    });
    
    // Check and award achievements
    await checkAndAwardAchievements(currentUser.uid, updatedStats);
    
    console.log('Game stats updated successfully');
    return updatedStats;
  } catch (error) {
    console.error('Error updating game stats:', error);
    throw error;
  }
};

/**
 * Record individual game in history
 */
export const recordGameHistory = async (uid, gameData) => {
  try {
    const gameHistoryRef = collection(db, 'users', uid, 'gameHistory');
    await addDoc(gameHistoryRef, {
      ...gameData,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error recording game history:', error);
  }
};

/**
 * Get recent game history for a user
 */
export const getRecentGames = async (uid, limitCount = 10) => {
  try {
    const gameHistoryRef = collection(db, 'users', uid, 'gameHistory');
    const q = query(gameHistoryRef, orderBy('timestamp', 'desc'), limit(limitCount));
    const querySnapshot = await getDocs(q);
    
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Error fetching recent games:', error);
    return [];
  }
};

/**
 * Check and award achievements based on current stats
 */
export const checkAndAwardAchievements = async (uid, stats) => {
  try {
    const userRef = doc(db, 'users', uid);
    const currentAchievements = stats.achievements || [];
    const newAchievements = [];
    
    // Define achievements
    const achievementRules = [
      {
        id: 'first_game',
        name: 'First Game',
        description: 'Play your first game',
        icon: '🎮',
        condition: stats.gamesPlayed >= 1
      },
      {
        id: 'first_victory',
        name: 'First Victory',
        description: 'Win your first game',
        icon: '🏆',
        condition: stats.gamesWon >= 1
      },
      {
        id: 'dedicated_player',
        name: 'Dedicated Player',
        description: 'Play 10 games',
        icon: '🔟',
        condition: stats.gamesPlayed >= 10
      },
      {
        id: 'rising_star',
        name: 'Rising Star',
        description: 'Win 5 games',
        icon: '⭐',
        condition: stats.gamesWon >= 5
      },
      {
        id: 'champion',
        name: 'Champion',
        description: 'Achieve 75% win rate with at least 10 games',
        icon: '👑',
        condition: stats.gamesPlayed >= 10 && (stats.gamesWon / stats.gamesPlayed) >= 0.75
      },
      {
        id: 'master_player',
        name: 'Master Player',
        description: 'Play 50 games',
        icon: '🎯',
        condition: stats.gamesPlayed >= 50
      },
      {
        id: 'streak_master',
        name: 'Streak Master',
        description: 'Achieve a 5-game win streak',
        icon: '🔥',
        condition: stats.bestStreak >= 5
      },
      {
        id: 'legendary',
        name: 'Legendary',
        description: 'Win 25 games',
        icon: '👑',
        condition: stats.gamesWon >= 25
      },
      {
        id: 'score_hunter',
        name: 'Score Hunter',
        description: 'Reach 5000 total points',
        icon: '💎',
        condition: stats.totalScore >= 5000
      }
    ];
    
    // Check each achievement
    for (const achievement of achievementRules) {
      if (achievement.condition && !currentAchievements.includes(achievement.id)) {
        newAchievements.push(achievement.id);
        console.log(`🏆 Achievement unlocked: ${achievement.name}`);
      }
    }
    
    // Update achievements if there are new ones
    if (newAchievements.length > 0) {
      await updateDoc(userRef, {
        achievements: [...currentAchievements, ...newAchievements]
      });
    }
    
    return newAchievements;
  } catch (error) {
    console.error('Error checking achievements:', error);
    return [];
  }
};

/**
 * Get user profile with all stats
 */
export const getUserProfile = async (uid) => {
  try {
    const userRef = doc(db, 'users', uid);
    const userDoc = await getDoc(userRef);
    
    if (userDoc.exists()) {
      return userDoc.data();
    }
    
    return null;
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return null;
  }
};

/**
 * Update user profile information
 */
export const updateUserProfile = async (uid, profileData) => {
  try {
    const userRef = doc(db, 'users', uid);
    await updateDoc(userRef, {
      ...profileData,
      lastActiveDate: new Date().toISOString()
    });
    
    return true;
  } catch (error) {
    console.error('Error updating user profile:', error);
    throw error;
  }
};

/**
 * Get leaderboard data
 */
export const getLeaderboard = async (type = 'wins', limitCount = 10) => {
  try {
    const usersRef = collection(db, 'users');
    let orderByField = 'gamesWon';
    
    switch (type) {
      case 'wins':
        orderByField = 'gamesWon';
        break;
      case 'score':
        orderByField = 'totalScore';
        break;
      case 'streak':
        orderByField = 'bestStreak';
        break;
      case 'games':
        orderByField = 'gamesPlayed';
        break;
      default:
        orderByField = 'gamesWon';
    }
    
    const q = query(usersRef, orderBy(orderByField, 'desc'), limit(limitCount));
    const querySnapshot = await getDocs(q);
    
    return querySnapshot.docs.map(doc => ({
      uid: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    return [];
  }
};

/**
 * Helper function to calculate user rank
 */
export const getUserRank = async (uid, type = 'wins') => {
  try {
    const leaderboard = await getLeaderboard(type, 1000); // Get top 1000
    const userIndex = leaderboard.findIndex(user => user.uid === uid);
    return userIndex >= 0 ? userIndex + 1 : null;
  } catch (error) {
    console.error('Error calculating user rank:', error);
    return null;
  }
};
