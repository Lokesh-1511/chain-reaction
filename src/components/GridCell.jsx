import React, { useState, useEffect } from 'react';

const playerColors = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'brown'];

const GridCell = ({ orb, player, onClick, x, y, size, currentPlayer, isExploding }) => {
  const [showExplosion, setShowExplosion] = useState(false);
  const [explosionOrbs, setExplosionOrbs] = useState([]);

  useEffect(() => {
    if (isExploding && orb > 0) {
      setShowExplosion(true);
      // Create explosion orbs that move in 4 directions
      const directions = [
        { x: 0, y: -1, angle: 0 },   // up
        { x: 1, y: 0, angle: 90 },   // right
        { x: 0, y: 1, angle: 180 },  // down
        { x: -1, y: 0, angle: 270 }  // left
      ];
      
      const newExplosionOrbs = directions.slice(0, orb).map((dir, index) => ({
        id: index,
        direction: dir,
        color: playerColors[(player - 1) % 8]
      }));
      
      setExplosionOrbs(newExplosionOrbs);
      
      // Clear explosion after animation
      setTimeout(() => {
        setShowExplosion(false);
        setExplosionOrbs([]);
      }, 1200);
    }
  }, [isExploding, orb, player]);

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

  const renderExplosionAnimation = () => {
    if (!showExplosion) return null;
    
    return explosionOrbs.map((explosionOrb) => (
      <div
        key={explosionOrb.id}
        style={{
          position: 'absolute',
          width: `${size * 0.2}px`,
          height: `${size * 0.2}px`,
          borderRadius: '50%',
          backgroundColor: explosionOrb.color,
          border: `2px solid ${explosionOrb.color}`,
          boxShadow: `0 0 10px ${explosionOrb.color}`,
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          animation: `explode-${explosionOrb.direction.x}-${explosionOrb.direction.y} 1.2s ease-in-out forwards`,
          zIndex: 10,
        }}
      />
    ));
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
      {renderExplosionAnimation()}
    </div>
  );
};

export default GridCell;
