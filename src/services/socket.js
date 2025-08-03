import { io } from 'socket.io-client';
import { getCurrentUsername } from '../components/UserProfile';

// Use localhost for development, Render for production
const BACKEND_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:5000' 
  : 'https://chain-reaction-backend-pml1.onrender.com';

const socket = io(BACKEND_URL);

// Enhanced socket functions for multiplayer with usernames
export const joinRoom = (roomCode) => {
  const username = getCurrentUsername();
  socket.emit('joinRoom', { roomCode, username });
};

export const createRoom = () => {
  const username = getCurrentUsername();
  socket.emit('createRoom', { username });
};

export const makeMove = (roomCode, move) => {
  const username = getCurrentUsername();
  socket.emit('makeMove', { roomCode, move, username });
};

export default socket;
