// src/App.js
import React, { useState } from 'react';
import Menu from './components/Menu'; 
import UserProfile from './components/UserProfile';

function App() {
  const [currentPage, setCurrentPage] = useState("menu");

  return (
    <div className="App">
      {currentPage === "menu" && <UserProfile />}
      <Menu onPageChange={setCurrentPage} />
    </div>
  );
}

export default App;