const API_URL = process.env.NODE_ENV === 'production'
  ? 'https://chain-reaction-backend-pml1.onrender.com/api'
  : 'http://localhost:5000/api';

// Create or get user profile
export const createUserProfile = async (username, avatar) => {
  try {
    const response = await fetch(`${API_URL}/user/profile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, avatar }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Failed to create user profile:', error);
    throw error;
  }
};

// Get user profile
export const getUserProfile = async (userId) => {
  try {
    const response = await fetch(`${API_URL}/user/${userId}`);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Failed to get user profile:', error);
    throw error;
  }
};

// Update user stats
export const updateUserStats = async (userId, won = false) => {
  try {
    const response = await fetch(`${API_URL}/user/${userId}/stats`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ won }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Failed to update user stats:', error);
    throw error;
  }
};

// Local storage helpers
export const getUserFromStorage = () => {
  try {
    const user = localStorage.getItem('chainReactionUser');
    return user ? JSON.parse(user) : null;
  } catch (error) {
    console.error('Error getting user from storage:', error);
    return null;
  }
};

export const saveUserToStorage = (user) => {
  try {
    localStorage.setItem('chainReactionUser', JSON.stringify(user));
  } catch (error) {
    console.error('Error saving user to storage:', error);
  }
};

export const clearUserFromStorage = () => {
  try {
    localStorage.removeItem('chainReactionUser');
  } catch (error) {
    console.error('Error clearing user from storage:', error);
  }
};
