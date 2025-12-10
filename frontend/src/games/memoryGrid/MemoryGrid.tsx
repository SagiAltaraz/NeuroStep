import './MemoryGrid.css';

const MemoryGrid = () => {
  return (
    <div className="memory-grid-wrapper">
      <iframe
        src="/games/neuranest/NeuraNest/games/memory-grid.html"
        title="Memory Grid"
        className="game-iframe"
      />
    </div>
  );
};

export default MemoryGrid;
