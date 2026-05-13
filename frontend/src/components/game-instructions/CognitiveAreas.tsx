/**
 * CognitiveAreas — renders the "what this game trains" list for an
 * instruction screen, reading directly from cognitiveProblems data.
 *
 * One source of truth: change GAME_TRAINING and every instruction screen
 * updates automatically. Bilingual via useLang's t().
 */

import { problemsForGame } from '../../data/cognitiveProblems';
import { useLang, type TKey } from '../../context/LanguageContext';

interface Props {
  gameId: string;
}

export default function CognitiveAreas({ gameId }: Props) {
  const { t } = useLang();
  const items = problemsForGame(gameId);
  if (items.length === 0) return null;

  return (
    <div>
      <h3 className="font-semibold text-lg mb-2">{t('training.what.trains')}</h3>
      <ul className="list-none space-y-1.5 text-sm text-gray-700">
        {items.map(item => (
          <li key={item.problemId} className="flex items-center gap-2">
            <span aria-hidden="true">
              {item.strength === 'primary' ? '★' : '•'}
            </span>
            <strong>{t(`problem.${item.problemId}.title` as TKey)}</strong>
            <span className="text-xs text-gray-500">
              ({item.strength === 'primary' ? t('training.primary') : t('training.secondary')})
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
