# Chain Reaction Game

A multiplayer Chain Reaction game built with React and Vite.

## Features

- Play with 2 to 8 players
- Customizable board size (2x2 to 12x12)
- Animated orb explosions and chain reactions
- Player elimination and win detection
- Responsive, dark-themed UI

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v16 or newer)
- [npm](https://www.npmjs.com/) (comes with Node.js)

### Installation

1. Clone the repository:
   ```sh
   git clone <your-repo-url>
   cd chain-reaction
   ```

2. Install dependencies:
   ```sh
   npm install
   ```

### Running the App

Start the development server:
```sh
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

### Building for Production

```sh
npm run build
```

### Linting

```sh
npm run lint
```

## Project Structure

```
src/
  App.jsx           # Main app component
  components/       # UI components (Menu, GameBoard, GridCell)
  models/           # Game logic (Cell model)
  assets/           # Static assets (SVGs)
  App.css           # Global styles
  index.css         # Base styles
  main.jsx          # Entry point
```

## How to Play

1. Choose the board dimensions and number of players.
2. Players take turns placing orbs in empty cells or cells they own.
3. When a cell exceeds its critical mass, it explodes, sending orbs to adjacent cells and possibly triggering chain reactions.
4. Players are eliminated when they have no orbs left after their first move.
5. The last player remaining wins!

## Credits

- Built with [React](https://react.dev/) and [Vite](https://vitejs.dev/)
- Inspired by the classic Chain Reaction game

---

Feel free to contribute or open issues!