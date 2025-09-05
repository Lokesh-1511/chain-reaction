# Chain Reaction Game

<p align="center">
  <img src="./chain-reaction-icon.svg" alt="Chain Reaction Game Logo" width="150"/>
</p>

<h3 align="center">An explosive multiplayer strategy game built with the MERN stack (React, Node.js, Express) and integrated with Firebase for user management and real-time features.</h3>

<p align="center">
  <img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React">
  <img src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/Socket.io-010101?&style=for-the-badge&logo=socketdotio&logoColor=white" alt="Socket.io">
  <img src="https://img.shields.io/badge/Firebase-FFCA28?style=for-the-badge&logo=firebase&logoColor=black" alt="Firebase">
  <img src="https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite">
</p>

---

## Table of Contents

- [✨ Features](#-features)
- [🛠️ Tech Stack](#-tech-stack)
- [📂 Project Structure](#-project-structure)
- [🚀 Getting Started](#-getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Running the Application](#running-the-application)
- [룰 How to Play](#-how-to-play)
- [🤝 Contributing](#-contributing)
- [📝 License](#-license)

---

## ✨ Features

- **Real-time Multiplayer:** Create or join game rooms to play with friends online using a unique room code.
- **Single Player Mode:** Practice your strategy by playing against yourself.
- **User Authentication:** Secure sign-up and login functionality powered by Firebase Authentication.
- **Persistent User Profiles:** Track your progress with detailed user profiles that store statistics like games played, wins, win rate, total score, and streaks.
- **Leaderboard:** Compete with other players and see who ranks at the top based on wins.
- **Achievement System:** Unlock achievements for reaching milestones like winning your first game, playing 10 games, or achieving a high win rate.
- **Game History:** Review your recent multiplayer matches with a GitHub-style activity grid.
- **Customizable Games:** Set the grid size (from 5x5 to 12x12) and the number of players (2 to 8).
- **Dynamic Gameplay:** Experience satisfying orb explosion animations and complex chain reactions.
- **Modern UI:** A sleek, responsive, dark-themed interface built with React.

---

## 🛠️ Tech Stack

- **Frontend:**
  - [React](https://react.dev/)
  - [Vite](https://vitejs.dev/)
  - [Socket.IO Client](https://socket.io/docs/v4/client-api/)
  - [Firebase SDK](https://firebase.google.com/docs/web/setup)
  - [React Router](https://reactrouter.com/)
- **Backend:**
  - [Node.js](https://nodejs.org/)
  - [Express](https://expressjs.com/)
  - [Socket.IO](https://socket.io/)
- **Database & Auth:**
  - [Google Cloud Firestore](https://firebase.google.com/docs/firestore) for user profiles, stats, and game history.
  - [Firebase Authentication](https://firebase.google.com/docs/auth) for user management.

---

## 📂 Project Structure

```
chain-reaction/
├── backend/                # Node.js & Express server
│   ├── gameLogic.js        # Core multiplayer game logic
│   └── server.js           # Express server and Socket.IO setup
├── functions/              # Firebase Cloud Functions (optional)
├── public/                 # Static assets
├── src/                    # React application source
│   ├── components/         # React components (GameBoard, UserProfile, etc.)
│   ├── config/             # Firebase configuration
│   ├── services/           # API services (socket, userStats)
│   ├── App.jsx             # Main app component with routing
│   └── main.jsx            # React entry point
├── firebase.json           # Firebase project configuration
├── firestore.rules         # Firestore security rules
└── package.json            # Frontend dependencies and scripts
```

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or newer recommended)
- [npm](https://www.npmjs.com/) (comes with Node.js)
- A [Firebase Project](https://console.firebase.google.com/) with Authentication and Firestore enabled.

### Installation

1.  **Clone the repository:**
    ```sh
    git clone https://github.com/Lokesh-1511/chain-reaction.git
    cd chain-reaction
    ```

2.  **Install Frontend Dependencies:**
    ```sh
    npm install
    ```

3.  **Install Backend Dependencies:**
    ```sh
    cd backend
    npm install
    cd ..
    ```

4.  **Firebase Setup:**
    - Create a `.env` file in the `chain-reaction/` root directory.
    - Add your Firebase project's configuration to the `.env` file. You can get this from your Firebase project settings.
      ```
      VITE_FIREBASE_API_KEY="your-api-key"
      VITE_FIREBASE_AUTH_DOMAIN="your-auth-domain"
      VITE_FIREBASE_PROJECT_ID="your-project-id"
      VITE_FIREBASE_STORAGE_BUCKET="your-storage-bucket"
      VITE_FIREBASE_MESSAGING_SENDER_ID="your-sender-id"
      VITE_FIREBASE_APP_ID="your-app-id"
      ```

### Running the Application

1.  **Start the Backend Server:**
    Open a terminal and navigate to the `backend` directory.
    ```sh
    cd backend
    node server.js
    ```
    The backend server will start on `http://localhost:5000`.

2.  **Start the Frontend Development Server:**
    Open a second terminal in the root `chain-reaction` directory.
    ```sh
    npm run dev
    ```
    The application will be available at `http://localhost:5173`.

---

## 룰 How to Play

1.  **Sign Up or Log In** to track your stats and compete on the leaderboard.
2.  From the main menu, choose **Single Player** to practice or **Multiplayer** to play with others.
3.  In multiplayer, either **Create a Room** to get a unique code to share with friends or **Join a Room** using a code.
4.  Players take turns placing orbs in empty cells or cells they already own.
5.  When a cell's orb count reaches its **critical mass**, it explodes, capturing adjacent cells and sending orbs to them. This can trigger a chain reaction.
    -   Corner cells have a critical mass of 2.
    -   Edge cells have a critical mass of 3.
    -   Inner cells have a critical mass of 4.
6.  A player is eliminated if they lose all their orbs on the board.
7.  The last player standing wins the game!

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to check the [issues page](https://github.com/Lokesh-1511/chain-reaction/issues).

---

## 📝 License

This project is [MIT](./LICENSE) licensed.
