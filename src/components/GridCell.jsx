import React from 'react';

const playerColors = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'brown'];

const GridCell = ({ orb, player, onClick, x, y, size }) => {
  const renderOrbs = () => {
    if (orb === 0) return null;
    
    const color = playerColors[(player - 1) % 8];
    const orbSize = size * 0.25;
    
    const orbStyle = {
      width: `${orbSize}px`,
      height: `${orbSize}px`,
      borderRadius: '50%',
      backgroundColor: color,
      border: '2px solid white',
      boxShadow: '0 0 8px rgba(255, 255, 255, 0.6)',
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
        backgroundColor: orb === 0 ? 'lightgray' : 'transparent',
        position: 'relative',
      }}
    >
      {renderOrbs()}
    </div>
  );
};

export default GridCell;
