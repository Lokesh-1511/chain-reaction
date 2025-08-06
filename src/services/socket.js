import { io } from 'socket.io-client';
import { getCurrentUsername } from '../components/UserProfile';

// Use localhost for development, Render for production
const BACKEND_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:5000' 
  : 'https://chain-reaction-backend-pml1.onrender.com';

// Configure socket with better options for production
const socket = io(BACKEND_URL, {
  transports: ['websocket', 'polling'],
  timeout: 20000,
  forceNew: true,
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: 5,
  maxReconnectionAttempts: 5
});

// Add connection event listeners for debugging
socket.on('connect', () => {
  console.log('Connected to backend server:', BACKEND_URL);
});

socket.on('disconnect', (reason) => {
  console.log('Disconnected from backend server:', reason);
});

socket.on('connect_error', (error) => {
  console.error('Connection error:', error);
});

socket.on('reconnect', (attemptNumber) => {
  console.log('Reconnected to backend server after', attemptNumber, 'attempts');
});

socket.on('reconnect_error', (error) => {
  console.error('Reconnection error:', error);
});

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
