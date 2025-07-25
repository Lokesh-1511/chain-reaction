import { io } from 'socket.io-client';

// Use localhost for development, Render for production
const BACKEND_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:5000' 
  : 'https://chain-reaction-backend-pml1.onrender.com';

const socket = io(BACKEND_URL);
export default socket;
