import React from 'react';

const playerColors = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'brown'];

const GridCell = ({ orb, player, onClick, x, y, size }) => {
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
      }}
    >
      {orb !== 0 && (
        <div
          className="orb"
          style={{
            width: `${size * 0.7}px`,
            height: `${size * 0.7}px`,
            borderRadius: '50%',
            backgroundColor: playerColors[(player - 1) % 8],
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            color: 'white',
            fontWeight: 'bold',
            fontSize: `${size * 0.4}px`,
          }}
        >
          {orb}
        </div>
      )}
    </div>
  );
};

export default GridCell;
