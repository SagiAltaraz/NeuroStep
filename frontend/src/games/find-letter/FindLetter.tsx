import { useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import Phaser from 'phaser';
import type { GameAdjustment } from '../../hooks/useGameSession';
import { emitCelebrate } from '../../components/companion/celebrate';
import { getGameLabels, type GameLabels } from '../../data/gameLabels';
import { useLang } from '../../context/LanguageContext';
import './FindLetter.css';

type Labels = GameLabels<'findLetter'>;

// ─── Types ────────────────────────────────────────────────────────

export interface GameAction {
  type: 'ROUND_START' | 'LETTER_HIT' | 'WRONG_PICK' | 'ROUND_COMPLETE' | 'TIMEOUT';
  timestamp:  number;
  reactionMs?: number;
  correct?:    boolean;
  payload:    Record<string, unknown>;
}

interface GameConfig {
  canvasWidth:    number;
  canvasHeight:   number;
  gridSize:       number;   // N×N
  roundTimeoutMs: number;
  // 0..1 — higher = more similar (e.g. include ב/כ when target is ב)
  distractorBoost: number;
  interRoundMs:   number;
}

const DEFAULT_CONFIG: GameConfig = {
  canvasWidth:    920,
  canvasHeight:   560,
  gridSize:       5,
  roundTimeoutMs: 14000,
  distractorBoost: 0,
  interRoundMs:   900,
};

// Hebrew letters (visually-distinct subset) — easy bank
const HEB_LETTERS = ['א','ב','ג','ד','ה','ו','ז','ח','ט','י','כ','ל','מ','נ','ס','ע','פ','צ','ק','ר','ש','ת'];
// Visually similar pairs/groups — used to weight distractors when boost is high
const SIMILAR_PAIRS: Record<string, string[]> = {
  'ב': ['כ', 'ר', 'ד'],
  'כ': ['ב', 'ר'],
  'ה': ['ח', 'ת', 'ח'],
  'ח': ['ה', 'ת'],
  'ת': ['ה', 'ח'],
  'ד': ['ר', 'ב'],
  'ר': ['ד', 'ב', 'כ'],
  'ו': ['ן', 'ז', 'נ'],
  'ז': ['ו', 'נ'],
  'נ': ['ו', 'ז'],
  'ע': ['צ', 'ץ'],
  'צ': ['ע', 'ץ'],
  'מ': ['ם', 'ס'],
  'ס': ['מ', 'ם'],
};

const EN_LETTERS = ['A','B','C','D','E','F','G','H','J','K','L','M','N','P','Q','R','S','T','U','V','W','X','Y','Z'];
const EN_SIMILAR: Record<string, string[]> = {
  'O': ['Q', 'C', 'D'],
  'P': ['F', 'R', 'B'],
  'B': ['P', 'R', 'D'],
  'D': ['B', 'O', 'P'],
  'M': ['N', 'W', 'H'],
  'N': ['M', 'H'],
  'V': ['W', 'Y'],
  'W': ['M', 'V'],
};

// ─── Phaser Scene ─────────────────────────────────────────────────

class FindLetterScene extends Phaser.Scene {
  private cfg:       GameConfig = DEFAULT_CONFIG;
  private onAction?: (a: GameAction) => void;
  private onReady?:  (s: FindLetterScene) => void;
  private lang: 'he' | 'en' = 'he';

  // Stats
  private score = 0;
  private round = 0;

  // Round state
  private target = '';
  private cells: Phaser.GameObjects.Text[] = [];
  private bg:    Phaser.GameObjects.Rectangle[] = [];
  private isTarget: boolean[] = [];
  private foundFlags: boolean[] = [];
  private foundCount = 0;
  private totalTargets = 0;
  private roundStartTime = 0;
  private isRoundActive = false;
  private roundTimer: Phaser.Time.TimerEvent | null = null;

  // UI
  private scoreText!:    Phaser.GameObjects.Text;
  private targetText!:   Phaser.GameObjects.Text;
  private targetLabel!:  Phaser.GameObjects.Text;
  private foundText!:    Phaser.GameObjects.Text;
  private timerBar!:     Phaser.GameObjects.Rectangle;
  private feedbackTx!:   Phaser.GameObjects.Text;

  private scoreLabel!:       Phaser.GameObjects.Text;
  private instructionLabel!: Phaser.GameObjects.Text;

  private labels: Labels = getGameLabels('findLetter', 'he');

  constructor() { super({ key: 'FindLetterScene' }); }

  init(data: {
    config?:   Partial<GameConfig>;
    onAction?: (a: GameAction) => void;
    onReady?:  (s: FindLetterScene) => void;
    labels?:   Labels;
    lang?:     'he' | 'en';
  }) {
    if (data.config)   this.cfg      = { ...DEFAULT_CONFIG, ...data.config };
    if (data.onAction) this.onAction = data.onAction;
    if (data.onReady)  this.onReady  = data.onReady;
    if (data.labels)   this.labels   = data.labels;
    if (data.lang)     this.lang     = data.lang;
  }

  applyLabels(labels: Labels) {
    this.labels = labels;
    this.scoreLabel?.setText(labels.score);
    this.instructionLabel?.setText(labels.instruction);
    this.targetLabel?.setText(labels.findLabel);
    this.updateFoundText();
  }

  setLanguage(lang: 'he' | 'en') {
    if (this.lang === lang) return;
    this.lang = lang;
    // Restart round so letters match new language
    if (this.isRoundActive) {
      this.endRoundEarly();
      this.time.delayedCall(50, () => this.startRound(), [], this);
    }
  }

  // ── Server adjustment ───────────────────────────────────────────
  // Params are ABSOLUTE target values, buffered and applied at the next round
  // boundary so the current grid isn't rebuilt mid-round.
  private pendingParams: GameAdjustment = {};

  applyParams(params: GameAdjustment) {
    Object.assign(this.pendingParams, params);
  }

  private flushPendingParams() {
    const p = this.pendingParams;
    if (typeof p.gridSize === 'number')
      this.cfg.gridSize = Phaser.Math.Clamp(Math.round(p.gridSize), 4, 9);
    if (typeof p.roundTimeoutMs === 'number')
      this.cfg.roundTimeoutMs = Math.max(4000, p.roundTimeoutMs);
    if (typeof p.distractorBoost === 'number')
      this.cfg.distractorBoost = Phaser.Math.Clamp(p.distractorBoost, 0, 0.9);
    this.pendingParams = {};
  }

  create() {
    this.createBackground();
    this.createUI();
    this.onReady?.(this);
    this.startRound();
  }

  // ── Background ───────────────────────────────────────────────────
  private createBackground() {
    const { canvasWidth: W, canvasHeight: H } = this.cfg;
    const bg = this.add.graphics();
    bg.fillGradientStyle(0xf3faf9, 0xeef6ff, 0xe7f1fb, 0xdcebf7, 1);
    bg.fillRect(0, 0, W, H);
  }

  // ── UI ──────────────────────────────────────────────────────────
  private createUI() {
    const { canvasWidth: W, canvasHeight: H } = this.cfg;

    this.add.rectangle(W / 2, 38, W, 76, 0xffffff, 0.72).setDepth(10);

    this.scoreLabel = this.add.text(80, 20, this.labels.score,
      { fontSize: '11px', color: '#5a7fa8', fontFamily: 'Arial' }
    ).setOrigin(0.5).setDepth(10);
    this.scoreText = this.add.text(80, 44, '0',
      { fontSize: '26px', fontFamily: 'Arial Black', color: '#1c3a45' }
    ).setOrigin(0.5).setDepth(10);

    // Target display centered top
    this.targetLabel = this.add.text(W / 2, 22, this.labels.findLabel, {
      fontSize: '11px', color: '#5a7fa8', fontFamily: 'Arial',
    }).setOrigin(0.5).setDepth(10);
    this.targetText = this.add.text(W / 2, 50, '', {
      fontSize: '36px', fontFamily: 'Arial Black', color: '#38bdf8',
    }).setOrigin(0.5).setDepth(10);

    // Found counter (right)
    this.foundText = this.add.text(W - 80, 44, '0 / 0', {
      fontSize: '20px', fontFamily: 'Arial Black', color: '#38bdf8',
    }).setOrigin(0.5).setDepth(10);

    // Timer bar
    const barW = W - 80;
    this.add.rectangle(W / 2, 86, barW, 6, 0x1f2937).setDepth(10);
    this.timerBar = this.add.rectangle(W / 2 - barW / 2, 86, barW, 6, 0x10b981)
      .setOrigin(0, 0.5).setDepth(11);

    // Feedback
    this.feedbackTx = this.add.text(W / 2, H / 2, '', {
      fontSize: '40px', fontFamily: 'Arial Black', color: '#fff',
    }).setOrigin(0.5).setAlpha(0).setDepth(30);

    // Instruction
    this.instructionLabel = this.add.text(W / 2, H - 18, this.labels.instruction, {
      fontSize: '13px', fontFamily: 'Arial', color: '#5a7fa8', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(10);
  }

  // ── Round flow ───────────────────────────────────────────────────
  private startRound() {
    this.flushPendingParams();
    this.round++;
    this.clearGrid();

    const alphabet = this.lang === 'he' ? HEB_LETTERS : EN_LETTERS;
    const similar  = this.lang === 'he' ? SIMILAR_PAIRS : EN_SIMILAR;

    // Pick target
    this.target = Phaser.Utils.Array.GetRandom(alphabet) as string;
    this.targetText.setText(this.target);

    // Build distractor pool based on similarity boost
    const boost = this.cfg.distractorBoost;
    const similarBank = similar[this.target] ?? [];
    const N = this.cfg.gridSize;
    const total = N * N;

    // Number of targets: 15-30% of cells (clamped 3..12)
    const targetFraction = 0.18 + Math.random() * 0.08;
    this.totalTargets = Phaser.Math.Clamp(Math.round(total * targetFraction), 3, 12);
    this.foundCount = 0;
    this.foundFlags = new Array(total).fill(false);
    this.isTarget = new Array(total).fill(false);

    // Choose target positions
    const positions = Array.from({ length: total }, (_, i) => i);
    Phaser.Utils.Array.Shuffle(positions);
    for (let i = 0; i < this.totalTargets; i++) this.isTarget[positions[i]] = true;

    // Layout
    const { canvasWidth: W, canvasHeight: H } = this.cfg;
    const top = 110, bottom = H - 60;
    const usableW = W - 60, usableH = bottom - top;
    const cellSize = Math.floor(Math.min(usableW / N, usableH / N)) - 6;
    const gridW = N * (cellSize + 6);
    const gridH = N * (cellSize + 6);
    const startX = (W - gridW) / 2 + cellSize / 2 + 3;
    const startY = top + (usableH - gridH) / 2 + cellSize / 2 + 3;
    const fontSize = Math.max(20, Math.min(38, cellSize - 14));

    for (let i = 0; i < total; i++) {
      const col = i % N;
      const row = Math.floor(i / N);
      const x = startX + col * (cellSize + 6);
      const y = startY + row * (cellSize + 6);

      let letter: string;
      if (this.isTarget[i]) {
        letter = this.target;
      } else {
        // Distractor: with prob = boost, pick from visually-similar bank
        if (similarBank.length > 0 && Math.random() < boost) {
          letter = Phaser.Utils.Array.GetRandom(similarBank) as string;
        } else {
          let pick: string;
          do { pick = Phaser.Utils.Array.GetRandom(alphabet) as string; } while (pick === this.target);
          letter = pick;
        }
      }

      const bg = this.add.rectangle(x, y, cellSize, cellSize, 0xffffff, 1)
        .setStrokeStyle(2, 0xbcd6ef)
        .setDepth(4)
        .setInteractive({ useHandCursor: true });
      const tx = this.add.text(x, y, letter, {
        fontSize: `${fontSize}px`, fontFamily: 'monospace', color: '#1c3a45', fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(5);

      const idx = i;
      bg.on('pointerdown', () => this.onCellClick(idx));

      this.bg.push(bg);
      this.cells.push(tx);
    }

    this.isRoundActive = true;
    this.roundStartTime = Date.now();
    this.updateFoundText();
    this.timerBar.setScale(1, 1);

    this.fireAction('ROUND_START', {
      round: this.round, gridSize: N, target: this.target,
      totalTargets: this.totalTargets, distractorBoost: this.cfg.distractorBoost,
    });

    this.roundTimer = this.time.delayedCall(this.cfg.roundTimeoutMs, () => this.onTimeout(), [], this);
  }

  private onCellClick(idx: number) {
    if (!this.isRoundActive) return;
    if (this.foundFlags[idx]) return;
    const reactionMs = Date.now() - this.roundStartTime;

    if (this.isTarget[idx]) {
      this.foundFlags[idx] = true;
      this.foundCount++;
      this.score++;
      this.scoreText.setText(String(this.score));
      this.cells[idx].setColor('#ffffff');
      this.bg[idx].setFillStyle(0x2f86d6, 1).setStrokeStyle(2, 0x1c3a45);
      this.tweens.add({
        targets: this.cells[idx], scale: 1.3, duration: 120, yoyo: true,
      });
      this.updateFoundText();
      this.fireAction('LETTER_HIT', {
        round: this.round, index: idx, foundCount: this.foundCount,
        totalTargets: this.totalTargets,
      }, reactionMs, true);
      if (this.foundCount >= this.totalTargets) this.onRoundComplete(reactionMs);
    } else {
      // Wrong pick
      this.score = Math.max(0, this.score - 1);
      this.scoreText.setText(String(this.score));
      this.cells[idx].setColor('#ef4444');
      this.tweens.add({
        targets: this.cells[idx], x: this.cells[idx].x + 5, yoyo: true, repeat: 3, duration: 50,
        onComplete: () => this.cells[idx].setColor('#5a7fa8').setX(this.bg[idx].x),
      });
      this.fireAction('WRONG_PICK', { round: this.round, index: idx, reactionMs }, reactionMs, false);
    }
  }

  private onRoundComplete(totalMs: number) {
    this.flash(this.labels.roundDone, '#22c55e');
    this.fireAction('ROUND_COMPLETE', {
      round: this.round, totalMs,
    }, totalMs, true);
    emitCelebrate();               // finished a letter round → celebrate the stage
    this.endRound();
  }

  private onTimeout() {
    this.flash(this.labels.timeout, '#fbbf24');
    this.fireAction('TIMEOUT', {
      round: this.round, foundCount: this.foundCount, totalTargets: this.totalTargets,
    }, undefined, false);
    this.endRound();
  }

  private endRound() {
    this.isRoundActive = false;
    this.roundTimer?.remove();
    this.roundTimer = null;
    this.time.delayedCall(this.cfg.interRoundMs, () => this.startRound(), [], this);
  }

  private endRoundEarly() {
    this.isRoundActive = false;
    this.roundTimer?.remove();
    this.roundTimer = null;
  }

  private clearGrid() {
    this.cells.forEach(c => c.destroy());
    this.bg.forEach(b => b.destroy());
    this.cells = [];
    this.bg = [];
  }

  private updateFoundText() {
    this.foundText?.setText(
      this.labels.found.replace('{n}', String(this.foundCount)).replace('{total}', String(this.totalTargets))
    );
  }

  private flash(text: string, color: string) {
    const { canvasWidth: W, canvasHeight: H } = this.cfg;
    this.feedbackTx.setPosition(W / 2, H / 2)
      .setText(text).setColor(color).setAlpha(1).setScale(0.6);
    this.tweens.add({
      targets: this.feedbackTx, scale: 1.1, duration: 180, ease: 'Back.easeOut',
    });
    this.tweens.add({
      targets: this.feedbackTx, alpha: 0, duration: 350, delay: 500,
    });
  }

  private fireAction(
    type: GameAction['type'],
    payload: Record<string, unknown>,
    reactionMs?: number,
    correct?:    boolean,
  ) {
    this.onAction?.({ type, timestamp: Date.now(), reactionMs, correct, payload });
  }

  // ── Update — timer bar ──────────────────────────────────────────
  update() {
    if (!this.isRoundActive) return;
    const elapsed = Date.now() - this.roundStartTime;
    const left = Math.max(0, 1 - elapsed / this.cfg.roundTimeoutMs);
    this.timerBar.setScale(left, 1);
    const color = left > 0.5 ? 0x10b981 : left > 0.25 ? 0xfbbf24 : 0xef4444;
    this.timerBar.setFillStyle(color);
  }
}

// ─── React Component ──────────────────────────────────────────────

interface FindLetterProps {
  config?:     Partial<GameConfig>;
  onAction?:   (action: GameAction) => void;
  adjustment?: GameAdjustment;
  onExit?:     () => void;
}

export default function FindLetter({ config, onAction, adjustment, onExit }: FindLetterProps) {
  const navigate     = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef      = useRef<Phaser.Game | null>(null);
  const sceneRef     = useRef<FindLetterScene | null>(null);
  const { lang }     = useLang();

  const labels = useMemo(() => getGameLabels('findLetter', lang), [lang]);

  const handleAction = useCallback((a: GameAction) => { onAction?.(a); }, [onAction]);

  useEffect(() => {
    if (adjustment) sceneRef.current?.applyParams(adjustment);
  }, [adjustment]);

  useEffect(() => {
    sceneRef.current?.applyLabels(labels);
    sceneRef.current?.setLanguage(lang);
  }, [labels, lang]);

  useEffect(() => {
    if (!containerRef.current) return;
    const mergedCfg = { ...DEFAULT_CONFIG, ...config };
    gameRef.current = new Phaser.Game({
      type:            Phaser.AUTO,
      width:           mergedCfg.canvasWidth,
      height:          mergedCfg.canvasHeight,
      parent:          containerRef.current,
      backgroundColor: '#f3faf9',
      banner:          false,
      scene:           FindLetterScene,
    });
    gameRef.current.scene.start('FindLetterScene', {
      config:   mergedCfg,
      onAction: handleAction,
      onReady:  (s: FindLetterScene) => { sceneRef.current = s; },
      labels,
      lang,
    });
    return () => {
      gameRef.current?.destroy(true);
      gameRef.current  = null;
      sceneRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="find-letter-game">
      <div className="game-back-row" dir="rtl">
        <button
          onClick={() => (onExit ? onExit() : navigate('/games'))}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-100 transition-colors duration-200"
        >
          <ChevronRight size={14} />
          חזור
        </button>
      </div>
      <div ref={containerRef} className="game-canvas" />
    </div>
  );
}
