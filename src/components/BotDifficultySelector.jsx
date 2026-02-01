import React, { useState } from 'react';
import './BotDifficultySelector.css';

const BotDifficultySelector = ({ onSelect, onCancel }) => {
  const [selected, setSelected] = useState('medium');

  const difficulties = [
    { id: 'easy', name: 'Easy', emoji: '🟢' },
    { id: 'medium', name: 'Medium', emoji: '🟡' },
    { id: 'hard', name: 'Hard', emoji: '🟠' },
    { id: 'expert', name: 'Expert', emoji: '🔴' }
  ];

  return (
    <div className="bot-difficulty-overlay">
      <div className="bot-difficulty-modal-compact">
        <h3>Bot Difficulty</h3>
        <div className="difficulty-radio-group">
          {difficulties.map(diff => (
            <label key={diff.id} className="difficulty-radio">
              <input
                type="radio"
                name="difficulty"
                value={diff.id}
                checked={selected === diff.id}
                onChange={() => setSelected(diff.id)}
              />
              <span className="radio-label">{diff.emoji} {diff.name}</span>
            </label>
          ))}
        </div>
        <div className="difficulty-buttons">
          <button onClick={() => onSelect(selected)} className="btn-start">
            Start Game
          </button>
          <button onClick={onCancel} className="btn-cancel">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default BotDifficultySelector;
