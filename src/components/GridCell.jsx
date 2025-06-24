import React from 'react';

const playerColors = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'brown'];

const GridCell = ({ orb, player, onClick, x, y }) => {
  return (
    <div
      className="grid-cell"
      onClick={() => onClick(x, y)}
      style={{
        width: '60px',
        height: '60px',
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
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            backgroundColor: playerColors[(player - 1) % 8],
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            color: 'white',
            fontWeight: 'bold',
          }}
        >
          {orb}
        </div>
      )}
    </div>
  );
};

export default GridCell;
