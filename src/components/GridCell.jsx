import React from 'react';

const playerColors = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'brown'];

const GridCell = ({ orb, player, onClick, x, y, size, currentPlayer }) => {
  const renderOrbs = () => {
    if (orb === 0) return null;
    
    const color = playerColors[(player - 1) % 8];
    const orbSize = size * 0.25;
    
    const orbStyle = {
      width: `${orbSize}px`,
      height: `${orbSize}px`,
      borderRadius: '50%',
      backgroundColor: color,
      border: `2px solid ${color}`,
      boxShadow: `0 0 8px ${color}, 0 0 16px ${color}80`,
      position: 'absolute',
    };
    
    if (orb === 1) {
      // Single circle in center
      return (
        <div
          style={{
            ...orbStyle,
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
          }}
        />
      );
    } else if (orb === 2) {
      // Two intersecting circles
      return (
        <>
          <div
            style={{
              ...orbStyle,
              left: '40%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
            }}
          />
          <div
            style={{
              ...orbStyle,
              left: '60%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
            }}
          />
        </>
      );
    } else if (orb === 3) {
      // Three circles in triangle formation
      return (
        <>
          <div
            style={{
              ...orbStyle,
              left: '50%',
              top: '35%',
              transform: 'translate(-50%, -50%)',
            }}
          />
          <div
            style={{
              ...orbStyle,
              left: '35%',
              top: '65%',
              transform: 'translate(-50%, -50%)',
            }}
          />
          <div
            style={{
              ...orbStyle,
              left: '65%',
              top: '65%',
              transform: 'translate(-50%, -50%)',
            }}
          />
        </>
      );
    }
  };

  // Get the current player's color for the glow effect
  const currentPlayerColor = playerColors[(currentPlayer - 1) % 8];

  return (
    <div
      className="grid-cell"
      onClick={() => onClick(x, y)}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: '5px',
        cursor: 'pointer',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'transparent',
        position: 'relative',
        border: `2px solid ${currentPlayerColor}`,
        boxShadow: `0 0 15px ${currentPlayerColor}, 0 0 30px ${currentPlayerColor}40`,
        transition: 'box-shadow 0.3s ease-in-out',
      }}
    >
      {renderOrbs()}
    </div>
  );
};

export default GridCell;
