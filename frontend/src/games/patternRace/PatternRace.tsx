import './PatternRace.css';

const PatternRace = () => {
  return (
    <div className="pattern-race-wrapper">
      <iframe
        src="/games/neuranest/NeuraNest/games/patternracegame.html"
        title="Pattern Race"
        className="game-iframe"
      />
    </div>
  );
};

export default PatternRace;
