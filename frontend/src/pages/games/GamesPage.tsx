import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import './GamesPage.css';
import {
   gamesForProblem,
   problemById,
   problemsForGame,
   type ProblemId,
   type TrainingStrength,
} from '../../data/cognitiveProblems';
import { useLang, type TKey } from '../../context/LanguageContext';
import { useCardTilt } from '../../hooks/useCardTilt';

interface GameEntry {
   id: string;
   nameKey?: TKey; // optional translation key for the name (new games)
   nameHe?: string; // legacy hardcoded Hebrew name (existing games)
   nameEn?: string;
   icon: string;
   descHe?: string;
   descEn?: string;
   descKey?: TKey;
   color: string;
   glow: string;
   gradient: string;
   route?: string; // undefined for upcoming games
   comingSoon?: boolean;
}

// ── Color palette ──────────────────────────────────────────────────
// Eight evenly-spaced hues — every game has a distinct, non-adjacent color.
const games: GameEntry[] = [
   {
      id: 'colorTracking',
      nameHe: 'רכבות הצבעים',
      nameEn: 'Color Trains',
      icon: '🚂',
      descHe: 'עקוב אחרי הרכבות ושלח כל אחת לתחנה הנכונה',
      descEn: 'Track each train and route it to the matching station',
      color: '#2563EB',
      glow: 'rgba(37, 99, 235, 0.25)',
      gradient:
         'linear-gradient(135deg, #1E3A8A 0%, #2563EB 55%, #93C5FD 100%)',
      route: '/games/colorTracking',
   },
   {
      id: 'ticTacToe',
      nameHe: 'איקס עיגול',
      nameEn: 'Tic-Tac-Toe',
      icon: '♟️',
      descHe: 'שחק נגד המחשב, חשוב אסטרטגית ותכנן קדימה לנצח',
      descEn: 'Play against the computer, think strategically, plan ahead',
      color: '#6D28D9',
      glow: 'rgba(109, 40, 217, 0.25)',
      gradient:
         'linear-gradient(135deg, #2E1065 0%, #6D28D9 50%, #C4B5FD 100%)',
      route: '/games/ticTacToe',
   },
   {
      id: 'memory',
      nameHe: 'משחק זיכרון',
      nameEn: 'Memory Match',
      icon: '🃏',
      descHe: 'הפוך קלפים ומצא זוגות תואמים',
      descEn: 'Flip cards and find matching pairs',
      color: '#16A34A',
      glow: 'rgba(22, 163, 74, 0.25)',
      gradient:
         'linear-gradient(135deg, #14532D 0%, #16A34A 50%, #86EFAC 100%)',
      route: '/games/memory',
   },
   {
      id: 'shapesClick',
      nameHe: 'צורות שקופצות',
      nameEn: 'Pop the Circles',
      icon: '🔵',
      descHe: 'לחץ רק על העיגולים שמופיעים על המסך ‒ הימנע משאר הצורות',
      descEn: 'Tap only the circles — ignore every other shape',
      color: '#EA580C',
      glow: 'rgba(234, 88, 12, 0.25)',
      gradient:
         'linear-gradient(135deg, #7C2D12 0%, #EA580C 50%, #FDBA74 100%)',
      route: '/games/shapesClick',
   },
   {
      id: 'greenLight',
      nameKey: 'game.greenLight.name',
      descKey: 'game.greenLight.desc',
      icon: '🚦',
      color: '#D97706',
      glow: 'rgba(217, 119, 6, 0.25)',
      gradient:
         'linear-gradient(135deg, #78350F 0%, #D97706 50%, #FDE68A 100%)',
      route: '/games/greenLight',
   },
   {
      id: 'spotDifference',
      nameKey: 'game.spotDifference.name',
      descKey: 'game.spotDifference.desc',
      icon: '🔍',
      color: '#DB2777',
      glow: 'rgba(219, 39, 119, 0.25)',
      gradient:
         'linear-gradient(135deg, #831843 0%, #DB2777 50%, #FBCFE8 100%)',
      route: '/games/spotDifference',
   },
   {
      id: 'whereWasIt',
      nameKey: 'game.whereWasIt.name',
      descKey: 'game.whereWasIt.desc',
      icon: '🧩',
      color: '#DC2626',
      glow: 'rgba(220, 38, 38, 0.25)',
      gradient:
         'linear-gradient(135deg, #7F1D1D 0%, #DC2626 50%, #FCA5A5 100%)',
      route: '/games/whereWasIt',
   },
   {
      id: 'findLetter',
      nameKey: 'game.findLetter.name',
      descKey: 'game.findLetter.desc',
      icon: '🔤',
      color: '#0891B2',
      glow: 'rgba(8, 145, 178, 0.25)',
      gradient:
         'linear-gradient(135deg, #164E63 0%, #0891B2 50%, #7DD3FC 100%)',
      route: '/games/findLetter',
   },
];

interface GameCardProps {
   game: GameEntry;
   isComing: boolean;
   primaryLabel: string | null;
   primaryPrefix: string;
   name: string;
   desc: string;
   comingSoonLabel: string;
   playLabel: string;
   ariaLabel: string;
   onClick: () => void;
}

function GameCard({
   game,
   isComing,
   primaryLabel,
   primaryPrefix,
   name,
   desc,
   comingSoonLabel,
   playLabel,
   ariaLabel,
   onClick,
}: GameCardProps) {
   const {
      ref,
      onMouseMove,
      onMouseLeave,
      cardRotX,
      cardRotY,
      emojiRotX,
      emojiRotY,
      glowX,
      glowY,
   } = useCardTilt<HTMLButtonElement>({ enabled: !isComing });

   return (
      <motion.button
         ref={ref}
         type="button"
         className={`game-card${isComing ? ' game-card--coming-soon' : ''}`}
         onClick={onClick}
         onMouseMove={onMouseMove}
         onMouseLeave={onMouseLeave}
         disabled={isComing}
         aria-label={ariaLabel}
         style={{
            ['--card-color' as string]: game.color,
            ['--card-glow' as string]: game.glow,
            ['--card-gradient' as string]: game.gradient,
            rotateX: cardRotX,
            rotateY: cardRotY,
            transformPerspective: 1100,
         }}
         whileHover={isComing ? undefined : { y: -6, scale: 1.015 }}
         whileTap={isComing ? undefined : { scale: 0.98 }}
         transition={{ type: 'spring', stiffness: 260, damping: 24 }}
      >
         <div className="game-card-header">
            <div className="game-card-header-bg" />

            {!isComing && (
               <motion.span
                  aria-hidden
                  className="game-emoji-glow"
                  style={{ left: glowX, top: glowY }}
               />
            )}

            <motion.div
               className="game-emoji-stage"
               style={{ rotateX: emojiRotX, rotateY: emojiRotY }}
            >
               <span className="game-emoji">{game.icon}</span>
               <span className="game-emoji-shadow" aria-hidden />
            </motion.div>

            {isComing && (
               <span className="game-coming-badge">{comingSoonLabel}</span>
            )}
         </div>

         <div className="game-card-body">
            <h2 className="game-name">{name}</h2>
            <p className="game-desc">{desc}</p>

            {primaryLabel && (
               <span className="game-primary-skill">
                  ★ {primaryPrefix}: {primaryLabel}
               </span>
            )}

            <div className="game-card-footer">
               <span className="game-play-cue">
                  {isComing ? comingSoonLabel : playLabel}
               </span>
            </div>
         </div>
      </motion.button>
   );
}

export default function GamesPage() {
   const navigate = useNavigate();
   const [searchParams] = useSearchParams();
   const { t, lang, dir } = useLang();
   const problemQuery = searchParams.get('problem');
   const problem = problemById(problemQuery);

   // ── Build the visible list, sorted by training strength ──────────
   let visibleGames: (GameEntry & { strength?: TrainingStrength })[];
   if (problem) {
      // Primary games first, then secondary — gamesForProblem already orders them.
      visibleGames = gamesForProblem(problem.id as ProblemId).flatMap((m) => {
         const g = games.find((x) => x.id === m.gameId);
         return g ? [{ ...g, strength: m.strength }] : [];
      });
   } else {
      // No filter — live games first, then coming-soon
      visibleGames = [...games].sort(
         (a, b) => Number(!!a.comingSoon) - Number(!!b.comingSoon)
      );
   }

   const localizedProblemTitle = problem
      ? t(`problem.${problem.id}.title` as TKey)
      : '';

   // Helpers for name + description (handles legacy hardcoded vs. translation key)
   const gameName = (g: GameEntry): string =>
      g.nameKey
         ? t(g.nameKey)
         : lang === 'he'
           ? g.nameHe!
           : (g.nameEn ?? g.nameHe!);
   const gameDesc = (g: GameEntry): string =>
      g.descKey
         ? t(g.descKey)
         : lang === 'he'
           ? g.descHe!
           : (g.descEn ?? g.descHe!);

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
                  <p>
                     {t('games.empty')} {localizedProblemTitle} 🎯
                  </p>
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
                        ? problem && game.strength === 'primary'
                           ? problem.id
                           : undefined
                        : problemsForGame(game.id).find(
                             (p) => p.strength === 'primary'
                          )?.problemId;
                     const primaryLabel = primaryProblem
                        ? t(`problem.${primaryProblem}.title` as TKey)
                        : null;

                     const name = gameName(game);
                     return (
                        <GameCard
                           key={game.id}
                           game={game}
                           isComing={isComing}
                           primaryLabel={primaryLabel}
                           primaryPrefix={t('training.primary')}
                           name={name}
                           desc={gameDesc(game)}
                           comingSoonLabel={t('games.coming.soon')}
                           playLabel={t('games.play')}
                           ariaLabel={
                              name +
                              (isComing ? ` (${t('games.coming.soon')})` : '')
                           }
                           onClick={() => handleCardClick(game)}
                        />
                     );
                  })}
               </div>
            )}
         </div>
      </main>
   );
}
