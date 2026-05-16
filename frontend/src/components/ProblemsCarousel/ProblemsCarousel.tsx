/**
 * ProblemsCarousel — horizontally scrollable list of cognitive problems.
 *
 * Each card represents a known cognitive challenge in older adults.
 * Clicking a card navigates to /games?problem=<id>, filtering the games list
 * to only those that train that specific problem.
 *
 * Data lives in src/data/cognitiveProblems.ts — adding a new problem or
 * tagging a new game requires zero changes here.
 */

import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { COGNITIVE_PROBLEMS, type CognitiveProblem } from '../../data/cognitiveProblems';
import { useLang, type TKey } from '../../context/LanguageContext';
import { useCardTilt } from '../../hooks/useCardTilt';
import './ProblemsCarousel.css';

const SCROLL_STEP = 340; // ~card width + gap

interface ProblemCardProps {
  problem:   CognitiveProblem;
  title:     string;
  desc:      string;
  ctaLabel:  string;
  onClick:   () => void;
}

function ProblemCard({ problem, title, desc, ctaLabel, onClick }: ProblemCardProps) {
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
  } = useCardTilt<HTMLButtonElement>();

  return (
    <motion.button
      ref={ref}
      type="button"
      className="pc-card"
      style={{
        ['--card-color' as string]:    problem.color,
        ['--card-gradient' as string]: problem.gradient,
        rotateX: cardRotX,
        rotateY: cardRotY,
        transformPerspective: 1100,
      }}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      whileHover={{ y: -6, scale: 1.015 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 260, damping: 24 }}
      onClick={onClick}
      aria-label={title}
    >
      <div className="pc-card-header">
        <motion.span
          aria-hidden
          className="pc-card-glow"
          style={{ left: glowX, top: glowY }}
        />
        <motion.div
          className="pc-card-stage"
          style={{ rotateX: emojiRotX, rotateY: emojiRotY }}
        >
          <span className="pc-card-emoji" aria-hidden="true">{problem.icon}</span>
          <span className="pc-card-shadow" aria-hidden />
        </motion.div>
      </div>
      <div className="pc-card-body">
        <h3 className="pc-card-title">{title}</h3>
        <p className="pc-card-desc">{desc}</p>
        <span className="pc-card-cta">{ctaLabel}</span>
      </div>
    </motion.button>
  );
}

export default function ProblemsCarousel() {
  const trackRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { t, dir } = useLang();

  const scroll = (delta: number) => {
    trackRef.current?.scrollBy({ left: delta, behavior: 'smooth' });
  };

  // Direction-aware scroll: right-arrow goes to "previous" in RTL, "next" in LTR
  const prevDelta = dir === 'rtl' ? +SCROLL_STEP : -SCROLL_STEP;
  const nextDelta = dir === 'rtl' ? -SCROLL_STEP : +SCROLL_STEP;

  return (
    <section className="problems-section" dir={dir} aria-label={t('problems.eyebrow')}>
      <div className="problems-heading">
        <p className="problems-eyebrow">{t('problems.eyebrow')}</p>
        <h2 className="problems-title">{t('problems.title')}</h2>
        <p className="problems-subtitle">{t('problems.subtitle')}</p>
      </div>

      <div className="problems-carousel-wrap">
        <button
          type="button"
          className="pc-arrow pc-arrow--prev"
          onClick={() => scroll(prevDelta)}
          aria-label={t('problems.prev')}
        >
          <ChevronRight size={22} />
        </button>

        <div className="pc-track" ref={trackRef}>
          {COGNITIVE_PROBLEMS.map((p) => {
            const titleKey = `problem.${p.id}.title` as TKey;
            const descKey  = `problem.${p.id}.desc`  as TKey;
            return (
              <ProblemCard
                key={p.id}
                problem={p}
                title={t(titleKey)}
                desc={t(descKey)}
                ctaLabel={t('problems.cta')}
                onClick={() => navigate(`/games?problem=${p.id}`)}
              />
            );
          })}
        </div>

        <button
          type="button"
          className="pc-arrow pc-arrow--next"
          onClick={() => scroll(nextDelta)}
          aria-label={t('problems.next')}
        >
          <ChevronLeft size={22} />
        </button>
      </div>
    </section>
  );
}
