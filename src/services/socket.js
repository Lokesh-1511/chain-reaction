import { io } from 'socket.io-client';
import { getCurrentUsername } from '../components/UserProfile';

// Dynamically set the backend URL based on the environment.
const BACKEND_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:5000' 
  : 'https://chain-reaction-backend-pml1.onrender.com';

// Configure the socket connection with settings optimized for production.
const socket = io(BACKEND_URL, {
  transports: ['websocket', 'polling'],
  timeout: 20000,
  forceNew: true,
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: 5,
  maxReconnectionAttempts: 5
});

// These event listeners are for debugging connection status.
socket.on('connect', () => {});
socket.on('disconnect', (reason) => {});
socket.on('connect_error', (error) => {});
socket.on('reconnect', (attemptNumber) => {});
socket.on('reconnect_error', (error) => {});

/**
 * Emits a 'joinRoom' event to the server with the room code and current user's username.
 * @param {string} roomCode - The code of the room to join.
 */
export const joinRoom = (roomCode) => {
  const username = getCurrentUsername();
  socket.emit('joinRoom', { roomCode, username });
};

/**
 * Emits a 'createRoom' event to the server to create a new multiplayer room.
 */
export const createRoom = () => {
  const username = getCurrentUsername();
  socket.emit('createRoom', { username });
};

/**
 * Emits a 'makeMove' event to the server with the move details.
 * @param {string} roomCode - The room where the move is made.
 * @param {object} move - The move object.
 */
export const makeMove = (roomCode, move) => {
  const username = getCurrentUsername();
  socket.emit('makeMove', { roomCode, move, username });
};

export default socket;
