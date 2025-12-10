import { useState, useEffect } from 'react';
import ColorTracking from '../../games/colorTracking/ColorTracking';
import JetPack from '../../games/jetPack/JetPack';
import LogicFlips from '../../games/logicFlips/LogicFlips';
import MemoryGrid from '../../games/memoryGrid/MemoryGrid';
import PatternRace from '../../games/patternRace/PatternRace';
import PixelZombie from '../../games/pixelZombie/PixelZombie';

const games = [
  ColorTracking,
  JetPack,
  LogicFlips,
  MemoryGrid,
  PatternRace,
  PixelZombie,
];

const Game = () => {
  const [GameOfTheDay, setGameOfTheDay] = useState<React.ComponentType>(() => games[0]);

  useEffect(() => {
    const today = new Date().getDay();
    const index = today % games.length;
    setGameOfTheDay(() => games[index]);
  }, []);

  const GameComponent = GameOfTheDay;

  return (
    <div>
      {GameComponent && <GameComponent />}
    </div>
  );
};

export default Game;
