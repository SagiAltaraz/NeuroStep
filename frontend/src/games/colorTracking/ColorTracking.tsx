import './ColorTracking.css';

const ColorTracking = () => {
  return (
    <div className="color-tracking-wrapper">
      <iframe
        src="/games/neuranest/NeuraNest/games/color-tracking.html"
        title="Color Tracking"
        className="game-iframe"
      />
    </div>
  );
};

export default ColorTracking;
