import { useNavigate } from 'react-router-dom';
import './GamesPage.css';

const games = [
  {
    id: 'colorTracking',
    name: 'רכבות הצבעים',
    icon: '🚂',
    description: 'עקוב אחרי הרכבות ושלח כל אחת לתחנה הנכונה. אמן זמן תגובה וריכוז',
    focus: 'זמן תגובה · ריכוז',
    color: '#3b82f6',
    route: '/games/colorTracking',
  },
  {
    id: 'ticTacToe',
    name: 'איקס עיגול',
    icon: '✖️',
    description: 'שחק נגד המחשב, חשוב אסטרטגית ותכנן קדימה לנצח',
    focus: 'חשיבה אסטרטגית · תכנון',
    color: '#8b5cf6',
    route: '/games/ticTacToe',
  },
  {
    id: 'memory',
    name: 'משחק זיכרון',
    icon: '🃏',
    description: 'הפוך קלפים ומצא זוגות תואמים. אמן זיכרון חזותי וריכוז',
    focus: 'זיכרון · ריכוז',
    color: '#10b981',
    route: '/games/memory',
  },
  {
    id: 'shapesClick',
    name: 'צורות שקופצות',
    icon: '🔵',
    description: 'לחץ רק על העיגולים שמופיעים על המסך ‒ הימנע משאר הצורות',
    focus: 'עיכוב תגובה · קשב',
    color: '#f59e0b',
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
              style={{ '--card-color': game.color } as React.CSSProperties}
            >
              <div className="game-card-accent" />
              <span className="game-icon">{game.icon}</span>
              <h2 className="game-name">{game.name}</h2>
              <p className="game-desc">{game.description}</p>
              <span className="game-focus">{game.focus}</span>
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}
