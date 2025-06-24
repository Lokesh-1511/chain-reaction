import React, { useState } from "react";
import GameBoard from "./GameBoard";
import "./Menu.css";

function Menu() {
  const [page, setPage] = useState("menu");
  const [row, setRow] = useState(0);
  const [col, setCol] = useState(0);
  const [players, setPlayers] = useState(0);

  const handleExit = () => {
    setPage("menu");
  };

  return (
    <div id="card">
      {page === "menu" ? (
        <>
          <h1>Chain Reaction Game</h1>
          <div className="input-container">
            <label>Choose dimension</label>
            <input
              id="row"
              type="number"
              min={2}
              max={12}
              onChange={(e) => setRow(Number(e.target.value))}
            />
            <input
              id="col"
              type="number"
              min={2}
              max={12}
              onChange={(e) => setCol(Number(e.target.value))}
            />
          </div>

          <div className="input-container">
            <label>Choose number of players</label>
            <input
              id="players"
              type="number"
              min={2}
              max={8}
              onChange={(e) => setPlayers(Number(e.target.value))}
            />
          </div>
          <br/><br/>
          <button
            onClick={() => {
              if (row >= 2 && col >= 2 && players >= 2 && players <= 8) setPage("game");
            }}
          >
            Start Game
          </button>
        </>
      ) : (
        <GameBoard row={row} col={col} players={players} onExit={handleExit} />
      )}
    </div>
  );
}

export default Menu;
