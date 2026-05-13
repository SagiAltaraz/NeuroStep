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
import { COGNITIVE_PROBLEMS } from '../../data/cognitiveProblems';
import { useLang, type TKey } from '../../context/LanguageContext';
import './ProblemsCarousel.css';

const SCROLL_STEP = 340; // ~card width + gap

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
              <motion.button
                key={p.id}
                type="button"
                className="pc-card"
                style={{
                  ['--card-color' as string]:    p.color,
                  ['--card-gradient' as string]: p.gradient,
                }}
                whileHover={{ y: -6 }}
                whileTap={{   scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                onClick={() => navigate(`/games?problem=${p.id}`)}
                aria-label={t(titleKey)}
              >
                <div className="pc-card-header">
                  <span className="pc-card-icon" aria-hidden="true">{p.icon}</span>
                </div>
                <div className="pc-card-body">
                  <h3 className="pc-card-title">{t(titleKey)}</h3>
                  <p className="pc-card-desc">{t(descKey)}</p>
                  <span className="pc-card-cta">{t('problems.cta')}</span>
                </div>
              </motion.button>
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
