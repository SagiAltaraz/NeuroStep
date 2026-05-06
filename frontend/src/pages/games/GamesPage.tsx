import { useNavigate } from 'react-router-dom';
import './GamesPage.css';

const games = [
  {
    id: 'colorTracking',
    name: 'רכבות הצבעים',
    icon: '🚂',
    description: 'עקוב אחרי הרכבות ושלח כל אחת לתחנה הנכונה. אמן זמן תגובה וריכוז',
    focus: 'זמן תגובה · ריכוז',
    color: '#3B82F6',
    glow: 'rgba(59, 130, 246, 0.22)',
    route: '/games/colorTracking',
  },
  {
    id: 'ticTacToe',
    name: 'איקס עיגול',
    icon: '♟️',
    description: 'שחק נגד המחשב, חשוב אסטרטגית ותכנן קדימה לנצח',
    focus: 'חשיבה אסטרטגית · תכנון',
    color: '#7C3AED',
    glow: 'rgba(124, 58, 237, 0.22)',
    route: '/games/ticTacToe',
  },
  {
    id: 'memory',
    name: 'משחק זיכרון',
    icon: '🃏',
    description: 'הפוך קלפים ומצא זוגות תואמים. אמן זיכרון חזותי וריכוז',
    focus: 'זיכרון · ריכוז',
    color: '#059669',
    glow: 'rgba(5, 150, 105, 0.22)',
    route: '/games/memory',
  },
  {
    id: 'shapesClick',
    name: 'צורות שקופצות',
    icon: '🔵',
    description: 'לחץ רק על העיגולים שמופיעים על המסך ‒ הימנע משאר הצורות',
    focus: 'עיכוב תגובה · קשב',
    color: '#D97706',
    glow: 'rgba(217, 119, 6, 0.22)',
    route: '/games/shapesClick',
  },
];

export default function GamesPage() {
  const navigate = useNavigate();

  return (
    <main className="games-page" dir="rtl">
      <div className="games-container">
        <h1 className="games-title">בחר משחק</h1>
        <p className="games-subtitle">כל משחק מתרגל יכולת קוגניטיבית שונה</p>

        <div className="games-grid">
          {games.map((game) => (
            <button
              key={game.id}
              className="game-card"
              onClick={() => navigate(game.route)}
              style={{
                '--card-color': game.color,
                '--card-glow':  game.glow,
              } as React.CSSProperties}
            >
              <div className="game-card-header">
                <div className="game-card-header-bg" />
                <div className="game-emoji-wrap">
                  <span>{game.icon}</span>
                </div>
              </div>

              <div className="game-card-body">
                <h2 className="game-name">{game.name}</h2>
                <p className="game-desc">{game.description}</p>

                <div className="game-card-footer">
                  <span className="game-focus">{game.focus}</span>
                  <span className="game-play-cue">שחק ←</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}
