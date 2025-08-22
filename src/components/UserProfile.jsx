import React, { useState, useEffect } from 'react';
import { auth, db } from '../config/firebase';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  updateProfile 
} from 'firebase/auth';
import { doc, setDoc, getDoc, updateDoc } from 'firebase/firestore';
import { 
  getUserProfile, 
  updateUserProfile, 
  getRecentGames, 
  getUserRank, 
  getLeaderboard,
  updateGameStats as updateGameStatsService
} from '../services/userStats';
import './UserProfile.css';

const UserProfile = () => {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [isLogin, setIsLogin] = useState(true);
  const [showDashboard, setShowDashboard] = useState(false);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: ''
  });
  const [profileFormData, setProfileFormData] = useState({
    username: '',
    bio: '',
    avatar: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [recentGames, setRecentGames] = useState([]);
  const [userRank, setUserRank] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [activeTab, setActiveTab] = useState('stats'); // 'stats', 'history', 'leaderboard'

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // Load user profile from Firestore
        await loadUserProfile(currentUser.uid);
      } else {
        setUserProfile(null);
      }
    });
    return () => unsubscribe();
  }, []);

  const loadUserProfile = async (uid) => {
    try {
      const profileData = await getUserProfile(uid);
      if (profileData) {
        setUserProfile(profileData);
        setProfileFormData({
          username: profileData.username || '',
          bio: profileData.bio || '',
          avatar: profileData.avatar || ''
        });
        
        // Load additional data
        const [recentGamesData, rank, leaderboardData] = await Promise.all([
          getRecentGames(uid, 5),
          getUserRank(uid, 'wins'),
          getLeaderboard('wins', 10)
        ]);
        
        setRecentGames(recentGamesData);
        setUserRank(rank);
        setLeaderboard(leaderboardData);
      } else {
        // Create default profile if it doesn't exist
        const defaultProfile = {
          username: user?.displayName || '',
          bio: '',
          avatar: '',
          gamesPlayed: 0,
          gamesWon: 0,
          totalScore: 0,
          currentStreak: 0,
          bestStreak: 0,
          joinedDate: new Date().toISOString(),
          lastActiveDate: new Date().toISOString(),
          totalPlayTime: 0,
          favoriteGridSize: '5x5',
          achievements: []
        };
        await setDoc(doc(db, 'users', uid), defaultProfile);
        setUserProfile(defaultProfile);
        setProfileFormData({
          username: defaultProfile.username,
          bio: defaultProfile.bio,
          avatar: defaultProfile.avatar
        });
      }
    } catch (error) {
      console.error('Error loading user profile:', error);
      
      // More specific error messages based on error type
      if (error.code === 'permission-denied') {
        setError('Please log in to access your profile data');
      } else if (error.code === 'unavailable') {
        setError('Firebase service is temporarily unavailable. Please try again later.');
      } else if (error.code === 'failed-precondition') {
        setError('Database rules may be updating. Please try again in a moment.');
      } else {
        setError('Failed to load profile data. Please check your internet connection.');
      }
    }
  };

  const handleInputChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleProfileInputChange = (e) => {
    setProfileFormData({
      ...profileFormData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (isLogin) {
        // Login
        await signInWithEmailAndPassword(auth, formData.email, formData.password);
      } else {
        // Register
        const userCredential = await createUserWithEmailAndPassword(
          auth, 
          formData.email, 
          formData.password
        );
        
        // Update profile with username and create Firestore document
        await updateProfile(userCredential.user, {
          displayName: formData.username
        });

        // Create user profile in Firestore
        const profileData = {
          username: formData.username,
          bio: '',
          avatar: '',
          gamesPlayed: 0,
          gamesWon: 0,
          joinedDate: new Date().toISOString()
        };
        await setDoc(doc(db, 'users', userCredential.user.uid), profileData);
      }
      
      setShowModal(false);
      setFormData({ username: '', email: '', password: '' });
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setShowDashboard(false);
      setShowModal(false);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const handleUpdateProfile = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      // Update Firebase Auth profile
      await updateProfile(user, {
        displayName: profileFormData.username
      });

      // Update Firestore document using our service
      await updateUserProfile(user.uid, {
        username: profileFormData.username,
        bio: profileFormData.bio,
        avatar: profileFormData.avatar
      });

      // Reload profile
      await loadUserProfile(user.uid);
      setIsEditing(false);
    } catch (error) {
      setError('Failed to update profile: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const getUsername = () => {
    return userProfile?.username || user?.displayName || 'Player';
  };

  const getWinRate = () => {
    if (!userProfile || userProfile.gamesPlayed === 0) return 0;
    return Math.round((userProfile.gamesWon / userProfile.gamesPlayed) * 100);
  };

  const getAverageScore = () => {
    if (!userProfile || userProfile.gamesPlayed === 0) return 0;
    return Math.round((userProfile.totalScore || 0) / userProfile.gamesPlayed);
  };

  const formatPlayTime = (minutes) => {
    if (!minutes || minutes < 60) return `${minutes || 0}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  const formatGameResult = (game) => {
    const won = game.winner === game.playerId;
    return {
      result: won ? 'Won' : 'Lost',
      resultClass: won ? 'win' : 'loss',
      icon: won ? '🏆' : '❌'
    };
  };

  const getAchievements = () => {
    return [
      {
        id: 'first_game',
        title: 'First Game',
        description: 'Play your first game',
        icon: '🎮',
        unlocked: (userProfile?.gamesPlayed || 0) >= 1
      },
      {
        id: 'first_victory',
        title: 'First Victory',
        description: 'Win your first game',
        icon: '🏆',
        unlocked: (userProfile?.gamesWon || 0) >= 1
      },
      {
        id: 'dedicated_player',
        title: 'Dedicated Player',
        description: 'Play 10 games',
        icon: '🔟',
        unlocked: (userProfile?.gamesPlayed || 0) >= 10
      },
      {
        id: 'rising_star',
        title: 'Rising Star',
        description: 'Win 5 games',
        icon: '⭐',
        unlocked: (userProfile?.gamesWon || 0) >= 5
      },
      {
        id: 'champion',
        title: 'Champion',
        description: 'Achieve 75% win rate with 10+ games',
        icon: '👑',
        unlocked: (userProfile?.gamesPlayed || 0) >= 10 && getWinRate() >= 75
      },
      {
        id: 'master_player',
        title: 'Master Player',
        description: 'Play 50 games',
        icon: '🎯',
        unlocked: (userProfile?.gamesPlayed || 0) >= 50
      },
      {
        id: 'streak_master',
        title: 'Streak Master',
        description: 'Achieve a 5-game win streak',
        icon: '🔥',
        unlocked: (userProfile?.bestStreak || 0) >= 5
      },
      {
        id: 'legendary',
        title: 'Legendary',
        description: 'Win 25 games',
        icon: '👑',
        unlocked: (userProfile?.gamesWon || 0) >= 25
      },
      {
        id: 'score_hunter',
        title: 'Score Hunter',
        description: 'Reach 5000 total points',
        icon: '💎',
        unlocked: (userProfile?.totalScore || 0) >= 5000
      }
    ];
  };

  const toggleMode = () => {
    setIsLogin(!isLogin);
    setError('');
    setFormData({ username: '', email: '', password: '' });
  };

  return (
    <div className="user-profile">
      {user ? (
        <div className="profile-menu">
          <div className="profile-icon" onClick={() => setShowDashboard(true)}>
            <div className="avatar">
              {getUsername().charAt(0).toUpperCase()}
            </div>
          </div>
          
          {showDashboard && (
            <div className="modal-overlay" onClick={() => setShowDashboard(false)}>
              <div className="dashboard-modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <h2>Profile Dashboard</h2>
                  <button className="close-btn" onClick={() => setShowDashboard(false)}>×</button>
                </div>
                
                <div className="dashboard-content">
                  <div className="profile-section">
                    <div className="profile-header">
                      <div className="profile-avatar-large">
                        <div className="avatar-ring">
                          <div className="avatar-inner">
                            {getUsername().charAt(0).toUpperCase()}
                          </div>
                        </div>
                        <div className="online-indicator"></div>
                      </div>
                      
                      <div className="profile-info">
                        <div className="profile-details">
                          {!isEditing ? (
                            <>
                              <h2 className="username">{getUsername()}</h2>
                              <p className="email">{user.email}</p>
                              <div className="bio-container">
                                <p className="bio">{userProfile?.bio || 'Chain Reaction enthusiast 🔥'}</p>
                              </div>
                              <div className="profile-badges">
                                {(userProfile?.gamesWon || 0) > 0 && <span className="badge winner">Winner 🏆</span>}
                                {(userProfile?.gamesPlayed || 0) > 10 && <span className="badge veteran">Veteran 🎮</span>}
                                {getWinRate() > 50 && <span className="badge champion">Champion ⭐</span>}
                              </div>
                            </>
                          ) : (
                            <div className="edit-form">
                              <div className="form-group">
                                <label>Username:</label>
                                <input
                                  type="text"
                                  name="username"
                                  value={profileFormData.username}
                                  onChange={handleProfileInputChange}
                                  placeholder="Enter username"
                                  className="modern-input"
                                />
                              </div>
                              <div className="form-group">
                                <label>Bio:</label>
                                <textarea
                                  name="bio"
                                  value={profileFormData.bio}
                                  onChange={handleProfileInputChange}
                                  placeholder="Tell us about yourself..."
                                  rows="3"
                                  className="modern-textarea"
                                />
                              </div>
                              <div className="edit-actions">
                                <button 
                                  className="save-btn" 
                                  onClick={handleUpdateProfile}
                                  disabled={loading}
                                >
                                  <span className="btn-icon">💾</span>
                                  {loading ? 'Saving...' : 'Save Changes'}
                                </button>
                                <button 
                                  className="cancel-btn" 
                                  onClick={() => setIsEditing(false)}
                                >
                                  <span className="btn-icon">❌</span>
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    {!isEditing && (
                      <div className="profile-actions">
                        <button className="edit-btn" onClick={() => setIsEditing(true)}>
                          <span className="btn-icon">✏️</span>
                          Edit Profile
                        </button>
                      </div>
                    )}
                  </div>
                  
                  {/* Tab Navigation */}
                  <div className="dashboard-tabs">
                    <button 
                      className={`tab-btn ${activeTab === 'stats' ? 'active' : ''}`}
                      onClick={() => setActiveTab('stats')}
                    >
                      📊 Statistics
                    </button>
                    <button 
                      className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`}
                      onClick={() => setActiveTab('history')}
                    >
                      📜 Recent Games
                    </button>
                    <button 
                      className={`tab-btn ${activeTab === 'leaderboard' ? 'active' : ''}`}
                      onClick={() => setActiveTab('leaderboard')}
                    >
                      🏅 Leaderboard
                    </button>
                  </div>

                  {/* Statistics Tab */}
                  {activeTab === 'stats' && (
                    <div className="stats-section">
                      <div className="section-header">
                        <h3>🎮 Game Statistics</h3>
                        <div className="section-subtitle">Your multiplayer gaming journey</div>
                        <div className="stats-note">
                          📊 Only multiplayer games count towards statistics for competitive integrity
                        </div>
                        {userRank && (
                          <div className="rank-badge">
                            Global Rank: #{userRank}
                          </div>
                        )}
                      </div>
                      <div className="stats-grid">
                        <div className="stat-card primary">
                          <div className="stat-icon">🎯</div>
                          <div className="stat-info">
                            <div className="stat-number">{userProfile?.gamesPlayed || 0}</div>
                            <div className="stat-label">Total Games</div>
                          </div>
                          <div className="stat-trend">
                            {(userProfile?.gamesPlayed || 0) > 5 && <span className="trend-up">↗️</span>}
                          </div>
                        </div>
                        
                        <div className="stat-card success">
                          <div className="stat-icon">🏆</div>
                          <div className="stat-info">
                            <div className="stat-number">{userProfile?.gamesWon || 0}</div>
                            <div className="stat-label">Victories</div>
                          </div>
                          <div className="stat-progress">
                            <div 
                              className="progress-bar" 
                              style={{ width: `${Math.min((userProfile?.gamesWon || 0) * 10, 100)}%` }}
                            ></div>
                          </div>
                        </div>
                        
                        <div className="stat-card info">
                          <div className="stat-icon">📊</div>
                          <div className="stat-info">
                            <div className="stat-number">{getWinRate()}%</div>
                            <div className="stat-label">Win Rate</div>
                          </div>
                          <div className="win-rate-indicator">
                            <div className={`rate-circle ${getWinRate() > 50 ? 'high' : getWinRate() > 25 ? 'medium' : 'low'}`}>
                              {getWinRate() > 70 ? '🔥' : getWinRate() > 50 ? '💪' : getWinRate() > 25 ? '📈' : '🎯'}
                            </div>
                          </div>
                        </div>
                        
                        <div className="stat-card warning">
                          <div className="stat-icon">💎</div>
                          <div className="stat-info">
                            <div className="stat-number">{userProfile?.totalScore || 0}</div>
                            <div className="stat-label">Total Score</div>
                          </div>
                          <div className="score-info">
                            Avg: {getAverageScore()}
                          </div>
                        </div>
                        
                        <div className="stat-card accent">
                          <div className="stat-icon">🔥</div>
                          <div className="stat-info">
                            <div className="stat-number">{userProfile?.currentStreak || 0}</div>
                            <div className="stat-label">Current Streak</div>
                          </div>
                          <div className="streak-info">
                            Best: {userProfile?.bestStreak || 0}
                          </div>
                        </div>
                        
                        <div className="stat-card neutral">
                          <div className="stat-icon">⏱️</div>
                          <div className="stat-info">
                            <div className="stat-number">{formatPlayTime(userProfile?.totalPlayTime)}</div>
                            <div className="stat-label">Play Time</div>
                          </div>
                          <div className="time-info">
                            Favorite: {userProfile?.favoriteGridSize || '5x5'}
                          </div>
                        </div>
                        
                        <div className="stat-card accent">
                          <div className="stat-icon">📅</div>
                          <div className="stat-info">
                            <div className="stat-number">
                              {userProfile?.joinedDate ? 
                                new Date(userProfile.joinedDate).toLocaleDateString('en-US', { 
                                  month: 'short', 
                                  day: 'numeric',
                                  year: 'numeric'
                                }) : 
                                'Today'
                              }
                            </div>
                            <div className="stat-label">Member Since</div>
                          </div>
                          <div className="member-duration">
                            {userProfile?.joinedDate && (
                              <span className="duration-text">
                                {Math.floor((new Date() - new Date(userProfile.joinedDate)) / (1000 * 60 * 60 * 24))} days
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Recent Games Tab */}
                  {activeTab === 'history' && (
                    <div className="history-section">
                      <div className="section-header">
                        <h3>📜 Recent Games</h3>
                        <div className="section-subtitle">Your latest multiplayer matches</div>
                        <div className="stats-note">
                          Only multiplayer games are shown (single-player games don't affect stats)
                        </div>
                      </div>
                      <div className="games-list">
                        {recentGames.length > 0 ? (
                          recentGames.map((game, index) => {
                            const result = formatGameResult(game);
                            return (
                              <div key={game.id || index} className={`game-item ${result.resultClass}`}>
                                <div className="game-result">
                                  <span className="result-icon">{result.icon}</span>
                                  <span className="result-text">{result.result}</span>
                                </div>
                                <div className="game-details">
                                  <div className="game-mode">
                                    {game.gameMode === 'single' ? '🤖 vs AI' : '👥 Multiplayer'}
                                  </div>
                                  <div className="game-grid">
                                    Grid: {Math.sqrt(game.gridSize || 25)}x{Math.sqrt(game.gridSize || 25)}
                                  </div>
                                  <div className="game-score">
                                    +{game.score || 0} pts
                                  </div>
                                </div>
                                <div className="game-time">
                                  {new Date(game.timestamp).toLocaleDateString()}
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <div className="no-games">
                            <div className="no-games-icon">🎮</div>
                            <div className="no-games-text">No games played yet</div>
                            <div className="no-games-subtitle">Start playing to see your game history!</div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Leaderboard Tab */}
                  {activeTab === 'leaderboard' && (
                    <div className="leaderboard-section">
                      <div className="section-header">
                        <h3>🏅 Leaderboard</h3>
                        <div className="section-subtitle">Top players by wins</div>
                      </div>
                      <div className="leaderboard-list">
                        {leaderboard.map((player, index) => (
                          <div 
                            key={player.uid} 
                            className={`leaderboard-item ${player.uid === user?.uid ? 'current-user' : ''}`}
                          >
                            <div className="rank">
                              <span className="rank-number">#{index + 1}</span>
                              {index < 3 && (
                                <span className="rank-medal">
                                  {index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}
                                </span>
                              )}
                            </div>
                            <div className="player-info">
                              <div className="player-name">
                                {player.username || 'Anonymous'}
                                {player.uid === user?.uid && <span className="you-badge">You</span>}
                              </div>
                              <div className="player-stats">
                                {player.gamesWon} wins • {player.gamesPlayed} games
                              </div>
                            </div>
                            <div className="player-score">
                              {player.totalScore || 0} pts
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="achievements-section">
                    <div className="section-header">
                      <h3>🏅 Achievements</h3>
                      <div className="section-subtitle">
                        {getAchievements().filter(a => a.unlocked).length} of {getAchievements().length} unlocked
                      </div>
                    </div>
                    <div className="achievements-grid">
                      {getAchievements().map(achievement => (
                        <div 
                          key={achievement.id} 
                          className={`achievement ${achievement.unlocked ? 'unlocked' : 'locked'}`}
                        >
                          <div className="achievement-icon">{achievement.icon}</div>
                          <div className="achievement-info">
                            <div className="achievement-title">{achievement.title}</div>
                            <div className="achievement-desc">{achievement.description}</div>
                          </div>
                          {achievement.unlocked && (
                            <div className="achievement-check">✅</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  {error && <div className="error-message">{error}</div>}
                  
                  <div className="dashboard-actions">
                    <button className="logout-btn" onClick={handleLogout}>
                      Logout
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          <button className="login-btn" onClick={() => setShowModal(true)}>
            <div className="profile-icon">
              <span>👤</span>
            </div>
          </button>

          {showModal && (
            <div className="modal-overlay" onClick={() => setShowModal(false)}>
              <div className="auth-modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <h3>{isLogin ? 'Login' : 'Sign Up'}</h3>
                  <button className="close-btn" onClick={() => setShowModal(false)}>×</button>
                </div>
                
                <form onSubmit={handleSubmit} className="auth-form">
                  {!isLogin && (
                    <div className="form-group">
                      <label>Username:</label>
                      <input
                        type="text"
                        name="username"
                        value={formData.username}
                        onChange={handleInputChange}
                        required
                        placeholder="Enter your username"
                      />
                    </div>
                  )}
                  
                  <div className="form-group">
                    <label>Email:</label>
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleInputChange}
                      required
                      placeholder="Enter your email"
                    />
                  </div>
                  
                  <div className="form-group">
                    <label>Password:</label>
                    <input
                      type="password"
                      name="password"
                      value={formData.password}
                      onChange={handleInputChange}
                      required
                      placeholder="Enter your password"
                      minLength="6"
                    />
                  </div>
                  
                  {error && <div className="error-message">{error}</div>}
                  
                  <button type="submit" disabled={loading} className="submit-btn">
                    {loading ? 'Loading...' : (isLogin ? 'Login' : 'Sign Up')}
                  </button>
                </form>
                
                <div className="toggle-mode">
                  <p>
                    {isLogin ? "Don't have an account? " : "Already have an account? "}
                    <button type="button" onClick={toggleMode} className="toggle-btn">
                      {isLogin ? 'Sign Up' : 'Login'}
                    </button>
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

// Export function to get current user's username for multiplayer
export const getCurrentUsername = () => {
  const currentUser = auth.currentUser;
  if (!currentUser) return 'Guest';
  
  return currentUser.displayName || currentUser.email?.split('@')[0] || 'Player';
};

// Export function to update game stats (legacy compatibility)
// Only for multiplayer games to prevent score manipulation
export const updateGameStatsLegacy = async (won = false) => {
  console.warn('⚠️ Legacy updateGameStats called - single-player games are not tracked for competitive integrity');
  console.log('💡 Only multiplayer games count towards statistics to prevent score manipulation');
  
  // Don't update stats for legacy calls (likely single-player)
  return;
};

// Backward compatibility
export const updateGameStats = updateGameStatsLegacy;

export default UserProfile;
