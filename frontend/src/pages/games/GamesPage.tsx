import { useNavigate, useSearchParams } from 'react-router-dom';
import './GamesPage.css';
import {
  gamesForProblem,
  problemById,
  problemsForGame,
  type ProblemId,
  type TrainingStrength,
} from '../../data/cognitiveProblems';
import { useLang, type TKey } from '../../context/LanguageContext';

interface GameEntry {
  id:          string;
  nameKey?:    TKey;       // optional translation key for the name (new games)
  nameHe?:     string;     // legacy hardcoded Hebrew name (existing games)
  nameEn?:     string;
  icon:        string;
  descHe?:     string;
  descEn?:     string;
  descKey?:    TKey;
  color:       string;
  glow:        string;
  route?:      string;     // undefined for upcoming games
  comingSoon?: boolean;
}

const games: GameEntry[] = [
  // ── Live games ───────────────────────────────────────────────────
  {
    id: 'colorTracking',
    nameHe: 'רכבות הצבעים',
    nameEn: 'Color Trains',
    icon: '🚂',
    descHe: 'עקוב אחרי הרכבות ושלח כל אחת לתחנה הנכונה',
    descEn: 'Track each train and route it to the matching station',
    color: '#3B82F6',
    glow: 'rgba(59, 130, 246, 0.22)',
    route: '/games/colorTracking',
  },
  {
    id: 'ticTacToe',
    nameHe: 'איקס עיגול',
    nameEn: 'Tic-Tac-Toe',
    icon: '♟️',
    descHe: 'שחק נגד המחשב, חשוב אסטרטגית ותכנן קדימה לנצח',
    descEn: 'Play against the computer, think strategically, plan ahead',
    color: '#7C3AED',
    glow: 'rgba(124, 58, 237, 0.22)',
    route: '/games/ticTacToe',
  },
  {
    id: 'memory',
    nameHe: 'משחק זיכרון',
    nameEn: 'Memory Match',
    icon: '🃏',
    descHe: 'הפוך קלפים ומצא זוגות תואמים',
    descEn: 'Flip cards and find matching pairs',
    color: '#059669',
    glow: 'rgba(5, 150, 105, 0.22)',
    route: '/games/memory',
  },
  {
    id: 'shapesClick',
    nameHe: 'צורות שקופצות',
    nameEn: 'Pop the Circles',
    icon: '🔵',
    descHe: 'לחץ רק על העיגולים שמופיעים על המסך ‒ הימנע משאר הצורות',
    descEn: 'Tap only the circles — ignore every other shape',
    color: '#D97706',
    glow: 'rgba(217, 119, 6, 0.22)',
    route: '/games/shapesClick',
  },

  // ── Upcoming games (no route yet) ────────────────────────────────
  {
    id: 'greenLight',
    nameKey: 'game.greenLight.name',
    descKey: 'game.greenLight.desc',
    icon: '🚦',
    color: '#10B981',
    glow: 'rgba(16, 185, 129, 0.22)',
    comingSoon: true,
  },
  {
    id: 'spotDifference',
    nameKey: 'game.spotDifference.name',
    descKey: 'game.spotDifference.desc',
    icon: '🔍',
    color: '#F59E0B',
    glow: 'rgba(245, 158, 11, 0.22)',
    comingSoon: true,
  },
  {
    id: 'whereWasIt',
    nameKey: 'game.whereWasIt.name',
    descKey: 'game.whereWasIt.desc',
    icon: '🧩',
    color: '#F97316',
    glow: 'rgba(249, 115, 22, 0.22)',
    comingSoon: true,
  },
  {
    id: 'findLetter',
    nameKey: 'game.findLetter.name',
    descKey: 'game.findLetter.desc',
    icon: '🔤',
    color: '#0EA5E9',
    glow: 'rgba(14, 165, 233, 0.22)',
    comingSoon: true,
  },
];

export default function GamesPage() {
  const navigate       = useNavigate();
  const [searchParams] = useSearchParams();
  const { t, lang, dir } = useLang();
  const problemQuery   = searchParams.get('problem');
  const problem        = problemById(problemQuery);

  // ── Build the visible list, sorted by training strength ──────────
  let visibleGames: (GameEntry & { strength?: TrainingStrength })[];
  if (problem) {
    // Primary games first, then secondary — gamesForProblem already orders them.
    visibleGames = gamesForProblem(problem.id as ProblemId).flatMap(m => {
      const g = games.find(x => x.id === m.gameId);
      return g ? [{ ...g, strength: m.strength }] : [];
    });
  } else {
    // No filter — live games first, then coming-soon
    visibleGames = [...games].sort((a, b) => Number(!!a.comingSoon) - Number(!!b.comingSoon));
  }

  const localizedProblemTitle = problem ? t(`problem.${problem.id}.title` as TKey) : '';

  // Helpers for name + description (handles legacy hardcoded vs. translation key)
  const gameName = (g: GameEntry): string =>
    g.nameKey ? t(g.nameKey) : (lang === 'he' ? g.nameHe! : g.nameEn ?? g.nameHe!);
  const gameDesc = (g: GameEntry): string =>
    g.descKey ? t(g.descKey) : (lang === 'he' ? g.descHe! : g.descEn ?? g.descHe!);

  const handleCardClick = (g: GameEntry) => {
    if (g.comingSoon || !g.route) return;
    navigate(g.route);
  };

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
            {visibleGames.map((game) => {
              const isComing = !!game.comingSoon;
              // Primary-skill badge — what this game's #1 strength is.
              // When a filter is active, we already know the strength for this view.
              const primaryProblem = game.strength
                ? (problem && game.strength === 'primary' ? problem.id : undefined)
                : problemsForGame(game.id).find(p => p.strength === 'primary')?.problemId;
              const primaryLabel = primaryProblem
                ? t(`problem.${primaryProblem}.title` as TKey)
                : null;

              return (
                <button
                  key={game.id}
                  className={`game-card${isComing ? ' game-card--coming-soon' : ''}`}
                  onClick={() => handleCardClick(game)}
                  disabled={isComing}
                  aria-label={gameName(game) + (isComing ? ` (${t('games.coming.soon')})` : '')}
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
                    {isComing && (
                      <span className="game-coming-badge">{t('games.coming.soon')}</span>
                    )}
                  </div>

                  <div className="game-card-body">
                    <h2 className="game-name">{gameName(game)}</h2>
                    <p className="game-desc">{gameDesc(game)}</p>

                    {primaryLabel && (
                      <span className="game-primary-skill">
                        ★ {t('training.primary')}: {primaryLabel}
                      </span>
                    )}

                    <div className="game-card-footer">
                      <span className="game-play-cue">
                        {isComing ? t('games.coming.soon') : t('games.play')}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
