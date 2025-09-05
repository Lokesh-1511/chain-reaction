const API_URL = process.env.NODE_ENV === 'production'
  ? 'https://chain-reaction-backend-pml1.onrender.com/api'
  : 'http://localhost:5000/api';

/**
 * Creates or retrieves a user profile.
 * @param {string} username - The user's chosen name.
 * @param {string} avatar - A URL or identifier for the user's avatar.
 * @returns {Promise<object>} The user profile data.
 * @throws {Error} If the network request fails.
 */
export const createUserProfile = async (username, avatar) => {
  try {
    const response = await fetch(`${API_URL}/user/profile`, {
// ... existing code ...
      body: JSON.stringify({ username, avatar }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    throw error;
  }
};

/**
 * Retrieves a user's profile by their ID.
 * @param {string} userId - The unique identifier for the user.
 * @returns {Promise<object>} The user profile data.
 * @throws {Error} If the network request fails.
 */
export const getUserProfile = async (userId) => {
  try {
    const response = await fetch(`${API_URL}/user/${userId}`);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    throw error;
  }
};

/**
 * Updates a user's game statistics.
 * @param {string} userId - The unique identifier for the user.
 * @param {boolean} won - Whether the user won the game.
 * @returns {Promise<object>} The updated user statistics.
 * @throws {Error} If the network request fails.
 */
export const updateUserStats = async (userId, won = false) => {
  try {
    const response = await fetch(`${API_URL}/user/${userId}/stats`, {
// ... existing code ...
      body: JSON.stringify({ won }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    throw error;
  }
};

/**
 * Retrieves the user object from local storage.
 * @returns {object|null} The user object or null if not found or on error.
 */
export const getUserFromStorage = () => {
  try {
    const user = localStorage.getItem('chainReactionUser');
    return user ? JSON.parse(user) : null;
  } catch (error) {
    return null;
  }
};

/**
 * Saves the user object to local storage.
 * @param {object} user - The user object to save.
 */
export const saveUserToStorage = (user) => {
  try {
    localStorage.setItem('chainReactionUser', JSON.stringify(user));
  } catch (error) {
    // Fails silently if storage is unavailable.
  }
};

/**
 * Removes the user object from local storage.
 */
export const clearUserFromStorage = () => {
  try {
    localStorage.removeItem('chainReactionUser');
  } catch (error) {
    // Fails silently if storage is unavailable.
  }
};
