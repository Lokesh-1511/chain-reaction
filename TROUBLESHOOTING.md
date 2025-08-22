# Chain Reaction - Troubleshooting Guide

## Common Issues and Solutions

### 1. Socket.io Connection Error
**Error:** `TransportError: websocket error` or `WebSocket connection to 'ws://localhost:5000/socket.io/' failed`

**Cause:** Backend server is not running

**Solution:**
```bash
cd chain-reaction/backend
npm start
```

**Verification:** You should see:
```
🚀 Backend server running on port 5000
🔍 Health check: http://localhost:5000/health
🌍 Environment: development
```

### 2. Firebase Permissions Error
**Error:** `FirebaseError: Missing or insufficient permissions`

**Cause:** Firestore security rules have expired or are too restrictive

**Solution:**
1. Update `firestore.rules` with proper authentication rules
2. Deploy the rules:
```bash
cd chain-reaction
firebase deploy --only firestore:rules
```

**Current Rules:** Updated to allow authenticated users to access their own data

### 3. Profile Data Not Loading
**Error:** Profile dashboard shows no data or loading errors

**Possible Causes & Solutions:**

#### A. User not authenticated
- Make sure to log in before accessing profile
- Check if Firebase Auth is properly configured

#### B. Missing user document
- The system will automatically create a user profile on first login
- If issues persist, try logging out and back in

#### C. Network connectivity
- Check internet connection
- Verify Firebase project is accessible

### 4. Stats Not Updating After Games
**Cause:** Game completion events not properly connected

**Solution:** 
- Ensure both frontend and backend servers are running
- Check browser console for any JavaScript errors
- Verify Firebase Auth token is valid

### 5. Development Setup Checklist

**Before starting development:**
1. ✅ Install dependencies:
   ```bash
   cd chain-reaction
   npm install
   cd backend
   npm install
   ```

2. ✅ Start backend server:
   ```bash
   cd backend
   npm start
   ```

3. ✅ Start frontend development server:
   ```bash
   cd chain-reaction
   npm run dev
   ```

4. ✅ Verify Firebase configuration:
   - Check `src/config/firebase.js` has correct config
   - Ensure Firestore rules are deployed
   - Verify project ID matches

### 6. Testing the Integration

**To verify everything is working:**

1. **Open the app:** http://localhost:5173/
2. **Create an account** or log in
3. **Check profile icon** appears in top-right
4. **Play a game** (single or multiplayer)
5. **Open profile dashboard** - should show updated stats

**Expected results:**
- No console errors
- Profile loads with user data
- Stats update after completing games
- Achievements unlock based on performance
- Leaderboard shows other players

### 7. Production Deployment

**For production deployment:**

1. **Build the frontend:**
   ```bash
   npm run build
   ```

2. **Deploy to Firebase Hosting:**
   ```bash
   firebase deploy
   ```

3. **Configure backend for production:**
   - Set appropriate CORS origins
   - Use production Firebase credentials
   - Deploy to hosting service (Heroku, Railway, etc.)

### 8. Emergency Reset

**If nothing works, reset everything:**

1. **Clear browser data** for localhost
2. **Restart both servers:**
   ```bash
   # Terminal 1
   cd chain-reaction/backend
   npm start
   
   # Terminal 2  
   cd chain-reaction
   npm run dev
   ```
3. **Re-deploy Firebase rules:**
   ```bash
   firebase deploy --only firestore:rules
   ```
4. **Clear and re-login** to Firebase Auth

### Need Help?

If issues persist:
1. Check browser console for detailed error messages
2. Verify all services are running (frontend, backend, Firebase)
3. Ensure Firebase project permissions are correctly configured
4. Check network connectivity to Firebase services
