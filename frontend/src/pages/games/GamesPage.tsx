import { useNavigate, useSearchParams } from 'react-router-dom';
import './GamesPage.css';
import {
  gamesForProblem,
  problemById,
  type ProblemId,
} from '../../data/cognitiveProblems';
import { useLang, type TKey } from '../../context/LanguageContext';

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
  const navigate       = useNavigate();
  const [searchParams] = useSearchParams();
  const { t, dir }     = useLang();
  const problemQuery   = searchParams.get('problem');
  const problem        = problemById(problemQuery);

  const visibleGames = problem
    ? games.filter(g => gamesForProblem(problem.id as ProblemId).includes(g.id))
    : games;

  // Localized problem title (use TKey for type-safety)
  const localizedProblemTitle = problem ? t(`problem.${problem.id}.title` as TKey) : '';

  return (
    <main className="games-page" dir={dir}>
      <div className="games-container">
        <h1 className="games-title">
          {problem
            ? `${t('games.title.filtered')}${localizedProblemTitle}`
            : t('games.title')}
        </h1>
        <p className="games-subtitle">
          {problem ? t('games.subtitle.filtered') : t('games.subtitle')}
        </p>

        {problem && (
          <button
            type="button"
            className="games-clear-filter"
            onClick={() => navigate('/games')}
          >
            {t('games.show.all')}
          </button>
        )}

        {visibleGames.length === 0 ? (
          <div className="games-empty">
            <p>{t('games.empty')} {localizedProblemTitle} 🎯</p>
            <button
              type="button"
              className="games-clear-filter"
              onClick={() => navigate('/games')}
            >
              {t('games.empty.cta')}
            </button>
          </div>
        ) : (
          <div className="games-grid">
            {visibleGames.map((game) => (
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
                    <span className="game-play-cue">{t('games.play')}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
