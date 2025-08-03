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
                    <div className="profile-avatar-large">
                      {getUsername().charAt(0).toUpperCase()}
                    </div>
                    
                    <div className="profile-details">
                      {!isEditing ? (
                        <>
                          <h3>{getUsername()}</h3>
                          <p className="email">{user.email}</p>
                          <p className="bio">{userProfile?.bio || 'No bio added yet'}</p>
                          <button className="edit-btn" onClick={() => setIsEditing(true)}>
                            Edit Profile
                          </button>
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
                            />
                          </div>
                          <div className="edit-actions">
                            <button 
                              className="save-btn" 
                              onClick={handleUpdateProfile}
                              disabled={loading}
                            >
                              {loading ? 'Saving...' : 'Save'}
                            </button>
                            <button 
                              className="cancel-btn" 
                              onClick={() => setIsEditing(false)}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="stats-section">
                    <h3>Game Statistics</h3>
                    <div className="stats-grid">
                      <div className="stat-card">
                        <div className="stat-number">{userProfile?.gamesPlayed || 0}</div>
                        <div className="stat-label">Games Played</div>
                      </div>
                      <div className="stat-card">
                        <div className="stat-number">{userProfile?.gamesWon || 0}</div>
                        <div className="stat-label">Games Won</div>
                      </div>
                      <div className="stat-card">
                        <div className="stat-number">{getWinRate()}%</div>
                        <div className="stat-label">Win Rate</div>
                      </div>
                      <div className="stat-card">
                        <div className="stat-number">
                          {userProfile?.joinedDate ? 
                            new Date(userProfile.joinedDate).toLocaleDateString() : 
                            'Unknown'
                          }
                        </div>
                        <div className="stat-label">Member Since</div>
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
