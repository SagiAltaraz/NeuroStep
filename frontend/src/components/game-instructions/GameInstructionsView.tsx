/**
 * GameInstructionsView — shared instructions screen rendered for every game.
 *
 * Reads the game's content from data/gameInstructions.ts and the current
 * language from LanguageContext. Each per-game instruction file is now a
 * thin wrapper that just passes gameId here, keeping the four screens
 * structurally identical and bilingual.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import {
  Card, CardHeader, CardTitle, CardContent, CardFooter,
} from '../ui/card';
import { Button } from '../ui/button';
import AnimatedAvatar from '../companion/AnimatedAvatar';
import CognitiveAreas from './CognitiveAreas';
import { GAME_INSTRUCTIONS, GAME_RECOMMENDED_MINUTES } from '../../data/gameInstructions';
import { useLang } from '../../context/LanguageContext';
import { useCompanionPresentation } from '../../context/CompanionPresentationContext';

interface Props {
  gameId:  string;
  onStart: () => void;
}

export default function GameInstructionsView({ gameId, onStart }: Props) {
  const navigate = useNavigate();
  const { lang, dir, t } = useLang();
  const { showInstructionAvatar, hideInstructionAvatar } = useCompanionPresentation();
  const data = GAME_INSTRUCTIONS[gameId];
  const recommendedMinutes = GAME_RECOMMENDED_MINUTES[gameId];

  // The avatar greets with a single 'talk' cycle, then settles to a constant
  // 'idle' — it introduces the game once and stops "talking" while the user reads.
  const [avatarMode, setAvatarMode] = useState<'talk' | 'idle'>('talk');
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    // Fallback for the static-image / reduced-motion path, where the clip's
    // onAnimationEnd never fires: settle to idle after one talk beat anyway.
    settleTimer.current = setTimeout(() => setAvatarMode('idle'), 2600);
    return () => { if (settleTimer.current) clearTimeout(settleTimer.current); };
  }, [gameId]);

  useLayoutEffect(() => {
    if (!data) return;
    showInstructionAvatar();
    return hideInstructionAvatar;
  }, [data, showInstructionAvatar, hideInstructionAvatar]);

  if (!data) {
    console.warn(`[GameInstructionsView] No instructions found for game "${gameId}"`);
    return null;
  }

  // RTL: back button on right with right-pointing chevron;
  // LTR: back button on left with left-pointing chevron.
  const Chevron = dir === 'rtl' ? ChevronRight : ChevronLeft;
  const backPositionClass = dir === 'rtl' ? 'top-3 right-3' : 'top-3 left-3';
  const contentAlignClass = dir === 'rtl' ? 'text-right' : 'text-left';

  return (
    <div className="flex items-center justify-center min-h-[80vh] p-4" dir={dir}>
      <Card className="relative max-w-lg w-full">
        <button
          onClick={() => navigate('/games')}
          className={`absolute ${backPositionClass} inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-100 transition-colors duration-200`}
        >
          <Chevron size={14} />
          {t('inst.back')}
        </button>

        <CardHeader className="text-center">
          <CardTitle className="text-2xl">
            {data.emoji} {data.title[lang]}
          </CardTitle>
        </CardHeader>

        <CardContent className={`space-y-6 ${contentAlignClass}`}>
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <AnimatedAvatar
              mode={avatarMode}
              size="medium"
              className="shrink-0"
              onAnimationEnd={() => setAvatarMode('idle')}
            />
            <div className="w-full rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 shadow-sm">
              <p className="m-0 text-sm text-gray-700">{data.desc[lang]}</p>
            </div>
          </div>

          {recommendedMinutes !== undefined && (
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800">
              ⏱ {t('inst.recommendedTime').replace('{minutes}', String(recommendedMinutes))}
            </div>
          )}

          <CognitiveAreas gameId={gameId} />

          <div>
            <h3 className="font-semibold text-lg mb-2">{t('inst.rules.heading')}</h3>
            <ol className="list-decimal list-inside space-y-1 text-sm text-gray-600">
              {data.rules.map((rule, i) => (
                <li key={i}>{rule[lang]}</li>
              ))}
            </ol>
          </div>

          <div>
            <h3 className="font-semibold text-lg mb-2">{t('inst.tips.heading')}</h3>
            <ul className="list-disc list-inside space-y-1 text-sm text-gray-600">
              {data.tips.map((tip, i) => (
                <li key={i}>{tip[lang]}</li>
              ))}
            </ul>
          </div>
        </CardContent>

        <CardFooter className="justify-center">
          <Button variant="black" size="lg" onClick={onStart}>
            {t('inst.start')}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
