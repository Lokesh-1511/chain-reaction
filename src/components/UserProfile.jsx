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
      const userDoc = await getDoc(doc(db, 'users', uid));
      if (userDoc.exists()) {
        const profileData = userDoc.data();
        setUserProfile(profileData);
        setProfileFormData({
          username: profileData.username || '',
          bio: profileData.bio || '',
          avatar: profileData.avatar || ''
        });
      } else {
        // Create default profile if it doesn't exist
        const defaultProfile = {
          username: user?.displayName || '',
          bio: '',
          avatar: '',
          gamesPlayed: 0,
          gamesWon: 0,
          joinedDate: new Date().toISOString()
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

      // Update Firestore document
      await updateDoc(doc(db, 'users', user.uid), {
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
                  
                  <div className="stats-section">
                    <div className="section-header">
                      <h3>🎮 Game Statistics</h3>
                      <div className="section-subtitle">Your gaming journey</div>
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

                  <div className="achievements-section">
                    <div className="section-header">
                      <h3>🏅 Achievements</h3>
                      <div className="section-subtitle">Unlock more by playing!</div>
                    </div>
                    <div className="achievements-grid">
                      <div className={`achievement ${(userProfile?.gamesPlayed || 0) >= 1 ? 'unlocked' : 'locked'}`}>
                        <div className="achievement-icon">🎮</div>
                        <div className="achievement-info">
                          <div className="achievement-title">First Game</div>
                          <div className="achievement-desc">Play your first game</div>
                        </div>
                      </div>
                      
                      <div className={`achievement ${(userProfile?.gamesWon || 0) >= 1 ? 'unlocked' : 'locked'}`}>
                        <div className="achievement-icon">🏆</div>
                        <div className="achievement-info">
                          <div className="achievement-title">First Victory</div>
                          <div className="achievement-desc">Win your first game</div>
                        </div>
                      </div>
                      
                      <div className={`achievement ${(userProfile?.gamesPlayed || 0) >= 10 ? 'unlocked' : 'locked'}`}>
                        <div className="achievement-icon">🔟</div>
                        <div className="achievement-info">
                          <div className="achievement-title">Dedicated Player</div>
                          <div className="achievement-desc">Play 10 games</div>
                        </div>
                      </div>
                      
                      <div className={`achievement ${(userProfile?.gamesWon || 0) >= 5 ? 'unlocked' : 'locked'}`}>
                        <div className="achievement-icon">⭐</div>
                        <div className="achievement-info">
                          <div className="achievement-title">Rising Star</div>
                          <div className="achievement-desc">Win 5 games</div>
                        </div>
                      </div>
                      
                      <div className={`achievement ${getWinRate() >= 75 ? 'unlocked' : 'locked'}`}>
                        <div className="achievement-icon">👑</div>
                        <div className="achievement-info">
                          <div className="achievement-title">Champion</div>
                          <div className="achievement-desc">Achieve 75% win rate</div>
                        </div>
                      </div>
                      
                      <div className={`achievement ${(userProfile?.gamesPlayed || 0) >= 50 ? 'unlocked' : 'locked'}`}>
                        <div className="achievement-icon">🎯</div>
                        <div className="achievement-info">
                          <div className="achievement-title">Master Player</div>
                          <div className="achievement-desc">Play 50 games</div>
                        </div>
                      </div>
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

// Export function to update game stats
export const updateGameStats = async (won = false) => {
  const currentUser = auth.currentUser;
  if (!currentUser) return;
  
  try {
    const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
    if (userDoc.exists()) {
      const currentStats = userDoc.data();
      await updateDoc(doc(db, 'users', currentUser.uid), {
        gamesPlayed: (currentStats.gamesPlayed || 0) + 1,
        gamesWon: won ? (currentStats.gamesWon || 0) + 1 : (currentStats.gamesWon || 0)
      });
    }
  } catch (error) {
    console.error('Error updating game stats:', error);
  }
};

export default UserProfile;
