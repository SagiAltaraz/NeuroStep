import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import TicTacToeInstructions from '../../components/game-instructions/TicTacToeInstructions';

// Placeholder — replace with TicTacToeWrapper when ready.
// See ShapesClickWrapper.tsx + ShapesClickGame.ts as the pattern to follow.
function TicTacToeGame() {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] gap-4" dir="rtl">
      <div className="w-full max-w-lg flex justify-end px-4">
        <button
          onClick={() => navigate('/games')}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-100 transition-colors duration-200"
        >
          <ChevronRight size={14} />
          חזור
        </button>
      </div>
      <div style={{ fontSize: '3.5rem' }}>✖️⭕</div>
      <h2 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#1a365d' }}>איקס עיגול</h2>
      <p style={{ color: '#4a6fa5', fontSize: '1rem' }}>המשחק בפיתוח — בקרוב!</p>
    </div>
  );
}

export default function TicTacToePage() {
  const [showInstructions, setShowInstructions] = useState(true);

  if (showInstructions) {
    return <TicTacToeInstructions onStart={() => setShowInstructions(false)} />;
  }

  return <TicTacToeGame />;
}
