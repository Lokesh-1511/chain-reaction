// Test Firebase connection and permissions
import { auth, db } from '../src/config/firebase.js';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';

// Test function to verify Firebase integration
const testFirebaseConnection = async () => {
  console.log('🔥 Testing Firebase Connection...');
  
  try {
    // Test 1: Check if Firebase is initialized
    console.log('✅ Firebase app initialized');
    console.log('📱 Auth instance:', auth.app.name);
    console.log('🗄️  Firestore instance:', db.app.name);
    
    // Test 2: Listen for auth state
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        console.log('✅ User authenticated:', user.email);
        
        // Test 3: Try to read user document
        try {
          const userDocRef = doc(db, 'users', user.uid);
          const userDoc = await getDoc(userDocRef);
          
          if (userDoc.exists()) {
            console.log('✅ User document exists:', userDoc.data());
          } else {
            console.log('📝 User document does not exist, creating...');
            
            // Test 4: Try to create user document
            const defaultProfile = {
              username: user.displayName || 'Test User',
              bio: 'Testing Firebase integration',
              gamesPlayed: 0,
              gamesWon: 0,
              totalScore: 0,
              joinedDate: new Date().toISOString()
            };
            
            await setDoc(userDocRef, defaultProfile);
            console.log('✅ User document created successfully');
          }
        } catch (firestoreError) {
          console.error('❌ Firestore error:', firestoreError.code, firestoreError.message);
          
          if (firestoreError.code === 'permission-denied') {
            console.log('🔒 Permission denied - Check Firestore rules');
          } else if (firestoreError.code === 'unavailable') {
            console.log('📡 Firebase service unavailable');
          }
        }
      } else {
        console.log('👤 No user authenticated');
      }
      
      unsubscribe();
    });
    
  } catch (error) {
    console.error('❌ Firebase initialization error:', error);
  }
};

// Run test when this file is imported
testFirebaseConnection();

export default testFirebaseConnection;
