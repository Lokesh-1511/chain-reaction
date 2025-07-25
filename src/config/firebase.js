import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCXh8lpzewObS3CrBrxy95RyxripxfF-WU",
  authDomain: "chain-reaction-8bb4b.firebaseapp.com",
  projectId: "chain-reaction-8bb4b",
  storageBucket: "chain-reaction-8bb4b.firebasestorage.app",
  messagingSenderId: "138835377578",
  appId: "1:138835377578:web:ecb0cc4ce174e253c23fd3",
  measurementId: "G-4QWWJN2BCC"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication and get a reference to the service
export const auth = getAuth(app);

// Initialize Cloud Firestore and get a reference to the service
export const db = getFirestore(app);

export default app;
