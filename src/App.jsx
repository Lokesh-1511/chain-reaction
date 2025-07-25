// src/App.js
import React from 'react';
import Menu from './components/Menu'; 
import UserProfile from './components/UserProfile';

function App() {
  return (
    <div className="App">
      <UserProfile />
      <Menu />
    </div>
  );
}

export default App;