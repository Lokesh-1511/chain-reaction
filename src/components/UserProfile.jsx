import React, { useState, useEffect } from 'react';
import { auth } from '../config/firebase';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  updateProfile 
} from 'firebase/auth';
import './UserProfile.css';

const UserProfile = () => {
  const [user, setUser] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  const handleInputChange = (e) => {
    setFormData({
      ...formData,
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
        
        // Update profile with username
        await updateProfile(userCredential.user, {
          displayName: formData.username
        });
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
    } catch (error) {
      console.error('Logout error:', error);
    }
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
          <div className="profile-icon" onClick={() => setShowModal(true)}>
            <div className="avatar">
              {user.displayName ? user.displayName.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase()}
            </div>
          </div>
          
          {showModal && (
            <div className="modal-overlay" onClick={() => setShowModal(false)}>
              <div className="profile-modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <h3>Profile</h3>
                  <button className="close-btn" onClick={() => setShowModal(false)}>×</button>
                </div>
                <div className="profile-info">
                  <p><strong>Username:</strong> {user.displayName || 'Not set'}</p>
                  <p><strong>Email:</strong> {user.email}</p>
                  <button className="logout-btn" onClick={handleLogout}>
                    Logout
                  </button>
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

export default UserProfile;
