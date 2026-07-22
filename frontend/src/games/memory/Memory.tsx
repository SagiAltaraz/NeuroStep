import { useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import Phaser from 'phaser';
import type { GameAdjustment } from '../../hooks/useGameSession';
import { emitCelebrate } from '../../components/companion/celebrate';
import { getGameLabels, type GameLabels } from '../../data/gameLabels';
import { useLang } from '../../context/LanguageContext';
import './Memory.css';

type MemoryLabels = GameLabels<'memory'>;

// ─── Types ────────────────────────────────────────────────────────

export interface GameAction {
  type: 'ROUND_START' | 'CARD_FLIP' | 'PAIR_MATCHED' | 'PAIR_MISSED';
  timestamp: number;
  payload: Record<string, unknown>;
}

interface GameConfig {
  canvasWidth:  number;
  canvasHeight: number;
  cardCount:    number; // total cards (must be even). Default 16 (8 pairs).
  flipTimeMs:   number; // how long a mismatched pair stays visible
}

const DEFAULT_CONFIG: GameConfig = {
  canvasWidth:  920,
  canvasHeight: 560,
  cardCount:    16,
  flipTimeMs:   1100,
};

const MIN_CARDS = 4;
const MAX_CARDS = 24;
const MIN_FLIP  = 400;
const MAX_FLIP  = 2200;

// 12 distinct symbols → supports up to 24 cards (12 pairs)
const SYMBOLS = [
  { glyph: '★', color: 0xfbbf24 },
  { glyph: '♥', color: 0xf87171 },
  { glyph: '♦', color: 0x60a5fa },
  { glyph: '♣', color: 0x4ade80 },
  { glyph: '☀', color: 0xfb923c },
  { glyph: '☾', color: 0xa78bfa },
  { glyph: '✦', color: 0xf472b6 },
  { glyph: '⚡', color: 0xfde047 },
  { glyph: '✿', color: 0xfb7185 },
  { glyph: '❄', color: 0x67e8f9 },
  { glyph: '♪', color: 0xc084fc },
  { glyph: '✈', color: 0x93c5fd },
];

interface CardObj {
  index:        number;
  symbolIdx:    number;
  container:    Phaser.GameObjects.Container;
  back:         Phaser.GameObjects.Rectangle;
  backPattern:  Phaser.GameObjects.Text;
  front:        Phaser.GameObjects.Container;
  isFlipped:    boolean;
  isMatched:    boolean;
}

// ─── Phaser Scene ─────────────────────────────────────────────────

class MemoryScene extends Phaser.Scene {
  private cfg:      GameConfig = DEFAULT_CONFIG;
  private onAction?: (a: GameAction) => void;
  private onReady?:  (s: MemoryScene) => void;

  // Round state
  private cards:           CardObj[] = [];
  private firstSelected:   CardObj | null = null;
  private secondSelected:  CardObj | null = null;
  private busy             = false;
  private moves            = 0;
  private pairsFound       = 0;
  private totalPairs       = 0;
  private lastFlipAt       = 0;
  // Adaptive board-size change is queued and applied only at next round
  // — mid-round resets felt like "the game gave up" to the player.
  private pendingCardCount: number | null = null;

  // UI
  private movesText!:      Phaser.GameObjects.Text;
  private pairsText!:      Phaser.GameObjects.Text;
  private flipTimeText!:   Phaser.GameObjects.Text;
  private statusText!:     Phaser.GameObjects.Text;
  private feedbackTx!:     Phaser.GameObjects.Text;
  private newRoundBtn!:    Phaser.GameObjects.Container;
  private bgStars!:        Phaser.GameObjects.Graphics;

  // Localized label refs (updated by applyLabels)
  private pairsLabel!:     Phaser.GameObjects.Text;
  private exposureLabel!:  Phaser.GameObjects.Text;
  private movesLabel!:     Phaser.GameObjects.Text;
  private newRoundBtnText!:Phaser.GameObjects.Text;
  private gameFinished     = false; // when true, statusText shows the finished template

  private labels: MemoryLabels = getGameLabels('memory', 'he');

  constructor() { super({ key: 'MemoryScene' }); }

  init(data: {
    config?:   Partial<GameConfig>;
    onAction?: (a: GameAction) => void;
    onReady?:  (s: MemoryScene) => void;
    labels?:   MemoryLabels;
  }) {
    if (data.config)   this.cfg      = { ...DEFAULT_CONFIG, ...data.config };
    if (data.onAction) this.onAction = data.onAction;
    if (data.onReady)  this.onReady  = data.onReady;
    if (data.labels)   this.labels   = data.labels;
    this.cfg.cardCount = this.normaliseCardCount(this.cfg.cardCount);
  }

  /** Replace localized text without disrupting game state. */
  applyLabels(labels: MemoryLabels) {
    this.labels = labels;
    this.pairsLabel?.setText(labels.pairs);
    this.exposureLabel?.setText(labels.exposureTime);
    this.movesLabel?.setText(labels.moves);
    this.newRoundBtnText?.setText(labels.newRound);
    this.flipTimeText?.setText(labels.timeSec.replace('{n}', (this.cfg.flipTimeMs / 1000).toFixed(1)));
    this.statusText?.setText(
      this.gameFinished
        ? labels.finished.replace('{moves}', String(this.moves))
        : labels.statusInitial,
    );
  }

  create() {
    this.createBackground();
    this.createUI();
    this.onReady?.(this);
    this.startRound();
  }

  // ── Apply server adjustment ──────────────────────────────────────
  // cardCount changes are deferred to next round so we never wipe the player's
  // current board mid-game. flipTimeMs applies live — it doesn't disturb state.
  // Params are ABSOLUTE target values. cardCount is deferred to the next round
  // (changing it re-deals the board); flipTimeMs applies live (no state impact).
  applyParams(params: GameAdjustment) {
    if (typeof params.cardCount === 'number') {
      const next = this.normaliseCardCount(params.cardCount);
      if (next !== this.cfg.cardCount) this.pendingCardCount = next;
    }

    if (typeof params.flipTimeMs === 'number') {
      const next = Math.max(MIN_FLIP, Math.min(MAX_FLIP, params.flipTimeMs));
      this.cfg.flipTimeMs = next;
      this.flipTimeText.setText(this.labels.timeSec.replace('{n}', (next / 1000).toFixed(1)));
    }
  }

  private normaliseCardCount(n: number): number {
    let v = Math.round(n);
    if (v % 2 === 1) v -= 1;
    return Math.max(MIN_CARDS, Math.min(MAX_CARDS, v));
  }

  // ── Background ──────────────────────────────────────────────────
  private createBackground() {
    const { canvasWidth: W, canvasHeight: H } = this.cfg;

    const bg = this.add.graphics();
    bg.fillGradientStyle(0xf3faf9, 0xeef6ff, 0xe7f1fb, 0xdcebf7, 1);
    bg.fillRect(0, 0, W, H);

    this.bgStars = this.add.graphics();
    for (let i = 0; i < 90; i++) {
      const x = Phaser.Math.Between(0, W);
      const y = Phaser.Math.Between(90, H);
      const r = Math.random() < 0.15 ? 1.8 : 1.1;
      this.bgStars.fillStyle(0xffffff, 0.15 + Math.random() * 0.4);
      this.bgStars.fillCircle(x, y, r);
    }

    const grid = this.add.graphics();
    grid.lineStyle(1, 0x312e81, 0.35);
    for (let x = 0; x <= W; x += 80) grid.lineBetween(x, 90, x, H);
    for (let y = 90; y <= H; y += 80) grid.lineBetween(0, y, W, y);
  }

  // ── UI ──────────────────────────────────────────────────────────
  private createUI() {
    const { canvasWidth: W, canvasHeight: H } = this.cfg;

    this.add.rectangle(W / 2, 38, W, 76, 0xffffff, 0.72).setDepth(10);
    this.add.rectangle(W / 2, 76, W, 2, 0x3730a3, 1).setDepth(10);

    // Pairs (right)
    this.pairsLabel = this.add.text(W - 90, 20, this.labels.pairs, { fontSize: '11px', color: '#5a7fa8', fontFamily: 'Arial' }).setOrigin(0.5).setDepth(10);
    this.pairsText = this.add.text(W - 90, 44, '0/0', {
      fontSize: '24px', fontFamily: 'Arial Black', color: '#2f86d6',
    }).setOrigin(0.5).setDepth(10);

    // Flip time (center)
    this.exposureLabel = this.add.text(W / 2, 18, this.labels.exposureTime, { fontSize: '11px', color: '#5a7fa8', fontFamily: 'Arial' }).setOrigin(0.5).setDepth(10);
    this.flipTimeText = this.add.text(W / 2, 44,
      this.labels.timeSec.replace('{n}', (this.cfg.flipTimeMs / 1000).toFixed(1)), {
      fontSize: '22px', fontFamily: 'Arial Black', color: '#1c3a45',
    }).setOrigin(0.5).setDepth(10);

    // Moves (left)
    this.movesLabel = this.add.text(90, 20, this.labels.moves, { fontSize: '11px', color: '#5a7fa8', fontFamily: 'Arial' }).setOrigin(0.5).setDepth(10);
    this.movesText = this.add.text(90, 44, '0', {
      fontSize: '26px', fontFamily: 'Arial Black', color: '#1c3a45',
    }).setOrigin(0.5).setDepth(10);

    this.statusText = this.add.text(W / 2, H - 22, this.labels.statusInitial, {
      fontSize: '13px', fontFamily: 'Arial', color: '#5a7fa8', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(10);

    this.feedbackTx = this.add.text(W / 2, H / 2, '', {
      fontSize: '64px', fontFamily: 'Arial Black', color: '#fff',
    }).setOrigin(0.5).setAlpha(0).setDepth(25);

    const btn = this.createButton(W / 2, H / 2 + 80, this.labels.newRound, () => this.startRound());
    this.newRoundBtn     = btn.container;
    this.newRoundBtnText = btn.text;
    this.newRoundBtn.setVisible(false);
  }

  private createButton(x: number, y: number, label: string, onClick: () => void): {
    container: Phaser.GameObjects.Container;
    text:      Phaser.GameObjects.Text;
  } {
    const c = this.add.container(x, y).setDepth(26);
    const bg = this.add.rectangle(0, 0, 180, 48, 0x4338ca);
    bg.setStrokeStyle(2, 0x818cf8);
    const txt = this.add.text(0, 0, label, {
      fontSize: '18px', fontFamily: 'Arial Black', color: '#ffffff',
    }).setOrigin(0.5);
    c.add([bg, txt]);
    c.setSize(180, 48);
    c.setInteractive({ useHandCursor: true });
    c.on('pointerover', () => bg.setFillStyle(0x4f46e5));
    c.on('pointerout',  () => bg.setFillStyle(0x4338ca));
    c.on('pointerdown', () => { onClick(); });
    return { container: c, text: txt };
  }

  // ── Layout helper ───────────────────────────────────────────────
  private layoutFor(count: number): { cols: number; rows: number; cardW: number; cardH: number } {
    // Pick a grid that's roughly 16:10 aspect ratio
    let bestCols = 4, bestRows = count / 4;
    let bestScore = Infinity;
    for (let cols = 2; cols <= 8; cols++) {
      if (count % cols !== 0) continue;
      const rows = count / cols;
      const ratio = cols / rows;
      const target = 1.6;
      const score = Math.abs(ratio - target);
      if (rows >= 2 && score < bestScore) {
        bestScore = score;
        bestCols  = cols;
        bestRows  = rows;
      }
    }
    const playH = 380;
    const playW = 700;
    const gap   = 12;
    const cardW = Math.min(110, Math.floor((playW - gap * (bestCols - 1)) / bestCols));
    const cardH = Math.min(130, Math.floor((playH - gap * (bestRows - 1)) / bestRows));
    return { cols: bestCols, rows: bestRows, cardW, cardH };
  }

  // ── Round flow ──────────────────────────────────────────────────
  private startRound() {
    // Apply any deferred difficulty change from the adaptive agent
    if (this.pendingCardCount !== null) {
      this.cfg.cardCount = this.pendingCardCount;
      this.pendingCardCount = null;
    }

    // Tear down any existing cards
    this.cards.forEach(c => c.container.destroy());
    this.cards = [];
    this.firstSelected  = null;
    this.secondSelected = null;
    this.busy           = false;
    this.moves          = 0;
    this.pairsFound     = 0;
    this.totalPairs     = this.cfg.cardCount / 2;
    this.lastFlipAt     = Date.now();

    this.movesText.setText('0');
    this.pairsText.setText(`0/${this.totalPairs}`);
    this.gameFinished = false;
    this.statusText.setText(this.labels.statusInitial);
    this.newRoundBtn.setVisible(false);

    // Build deck
    const ids = Array.from({ length: this.totalPairs }, (_, i) => i);
    const deck = [...ids, ...ids];
    Phaser.Utils.Array.Shuffle(deck);

    const { canvasWidth: W, canvasHeight: H } = this.cfg;
    const { cols, rows, cardW, cardH } = this.layoutFor(this.cfg.cardCount);
    const gap     = 12;
    const totalW  = cols * cardW + (cols - 1) * gap;
    const totalH  = rows * cardH + (rows - 1) * gap;
    const startX  = (W - totalW) / 2 + cardW / 2;
    const startY  = (H - totalH) / 2 + cardH / 2 + 6;

    deck.forEach((symbolIdx, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * (cardW + gap);
      const y = startY + row * (cardH + gap);
      this.cards.push(this.buildCard(i, symbolIdx, x, y, cardW, cardH));
    });

    this.fireAction('ROUND_START', {
      cardCount:   this.cfg.cardCount,
      totalPairs:  this.totalPairs,
      flipTimeMs:  this.cfg.flipTimeMs,
    });
  }

  // ── Card build ──────────────────────────────────────────────────
  private buildCard(index: number, symbolIdx: number, x: number, y: number, cardW: number, cardH: number): CardObj {
    const c = this.add.container(x, y).setDepth(4);

    // Back (face-down)
    const back = this.add.rectangle(0, 0, cardW, cardH, 0x4338ca);
    back.setStrokeStyle(2, 0x818cf8, 0.9);

    // Subtle pattern on back
    const pattern = this.add.text(0, 0, '?', {
      fontSize: `${Math.floor(cardH * 0.45)}px`, fontFamily: 'Arial Black', color: '#312e81',
    }).setOrigin(0.5);

    // Front (hidden initially)
    const front     = this.add.container(0, 0);
    const sym       = SYMBOLS[symbolIdx % SYMBOLS.length];
    const frontBg   = this.add.rectangle(0, 0, cardW, cardH, 0xf8fafc);
    frontBg.setStrokeStyle(2, sym.color, 0.95);
    const glyphTxt  = this.add.text(0, 0, sym.glyph, {
      fontSize: `${Math.floor(cardH * 0.55)}px`, fontFamily: 'Arial Black',
      color: Phaser.Display.Color.IntegerToColor(sym.color).rgba,
    }).setOrigin(0.5);
    front.add([frontBg, glyphTxt]);
    front.setVisible(false);

    c.add([back, pattern, front]);
    c.setSize(cardW, cardH);
    c.setInteractive({ useHandCursor: true });

    const card: CardObj = {
      index, symbolIdx, container: c, back, backPattern: pattern, front,
      isFlipped: false, isMatched: false,
    };

    c.on('pointerdown', () => this.onCardClick(card));
    c.on('pointerover', () => { if (!card.isFlipped && !card.isMatched && !this.busy) c.setScale(1.04); });
    c.on('pointerout',  () => { c.setScale(1); });
    return card;
  }

  // ── Interaction ─────────────────────────────────────────────────
  private onCardClick(card: CardObj) {
    if (this.busy || card.isFlipped || card.isMatched) return;
    if (card === this.firstSelected) return;

    const reactionMs = Date.now() - this.lastFlipAt;
    this.lastFlipAt  = Date.now();

    this.flipCard(card, true);
    this.fireAction('CARD_FLIP', {
      index:    card.index,
      reactionMs,
      pairsFound: this.pairsFound,
    });

    if (!this.firstSelected) {
      this.firstSelected = card;
      return;
    }

    this.secondSelected = card;
    this.busy = true;
    this.moves++;
    this.movesText.setText(String(this.moves));

    if (this.firstSelected.symbolIdx === card.symbolIdx) {
      // Match
      this.time.delayedCall(380, () => this.handleMatch());
    } else {
      // Mismatch — flip back after flipTimeMs
      this.time.delayedCall(this.cfg.flipTimeMs, () => this.handleMiss());
    }
  }

  private handleMatch() {
    if (!this.firstSelected || !this.secondSelected) return;
    this.firstSelected.isMatched  = true;
    this.secondSelected.isMatched = true;

    [this.firstSelected, this.secondSelected].forEach(c => {
      this.tweens.add({
        targets: c.container, scale: 1.08, duration: 200, yoyo: true, ease: 'Sine.easeInOut',
      });
      (c.front.list[0] as Phaser.GameObjects.Rectangle).setFillStyle(0xdcfce7);
    });

    this.pairsFound++;
    this.pairsText.setText(`${this.pairsFound}/${this.totalPairs}`);
    this.showFeedback('✓', '#4ade80');

    this.fireAction('PAIR_MATCHED', {
      pairsFound: this.pairsFound,
      pairsLeft:  this.totalPairs - this.pairsFound,
      moves:      this.moves,
    });

    this.firstSelected  = null;
    this.secondSelected = null;
    this.busy = false;

    if (this.pairsFound >= this.totalPairs) { emitCelebrate(); this.endRound(); }
  }

  private handleMiss() {
    if (!this.firstSelected || !this.secondSelected) return;
    this.flipCard(this.firstSelected,  false);
    this.flipCard(this.secondSelected, false);
    this.showFeedback('✗', '#f87171');

    this.fireAction('PAIR_MISSED', {
      moves:      this.moves,
      pairsFound: this.pairsFound,
    });

    this.firstSelected  = null;
    this.secondSelected = null;
    this.busy = false;
  }

  private flipCard(card: CardObj, faceUp: boolean) {
    card.isFlipped = faceUp;

    this.tweens.add({
      targets: card.container,
      scaleX:  0,
      duration: 130,
      ease:    'Sine.easeIn',
      onComplete: () => {
        card.back.setVisible(!faceUp);
        card.backPattern.setVisible(!faceUp);
        card.front.setVisible(faceUp);
        this.tweens.add({
          targets: card.container,
          scaleX:  1,
          duration: 130,
          ease:    'Sine.easeOut',
        });
      },
    });
  }

  private endRound() {
    this.gameFinished = true;
    this.statusText.setText(this.labels.finished.replace('{moves}', String(this.moves)));
    this.showBigFeedback(this.labels.allFound, '#2f86d6');
    this.time.delayedCall(700, () => this.newRoundBtn.setVisible(true));
  }

  // ── Feedback ────────────────────────────────────────────────────
  private showFeedback(text: string, color: string) {
    const { canvasWidth: W, canvasHeight: H } = this.cfg;
    this.feedbackTx.setPosition(W / 2, H / 2).setText(text).setColor(color)
      .setAlpha(1).setScale(0.3);
    this.tweens.add({ targets: this.feedbackTx, scale: 1.1, duration: 180, ease: 'Back.easeOut' });
    this.tweens.add({ targets: this.feedbackTx, alpha: 0, duration: 280, delay: 320 });
  }

  private showBigFeedback(text: string, color: string) {
    const { canvasWidth: W, canvasHeight: H } = this.cfg;
    const t = this.add.text(W / 2, H / 2, text, {
      fontSize: '40px', fontFamily: 'Arial Black', color,
    }).setOrigin(0.5).setAlpha(0).setDepth(25).setScale(0.5);
    this.tweens.add({ targets: t, alpha: 1, scale: 1.2, duration: 320, ease: 'Back.easeOut' });
    this.tweens.add({ targets: t, alpha: 0, y: H / 2 - 60, duration: 600, delay: 800,
      onComplete: () => t.destroy() });
  }

  private fireAction(type: GameAction['type'], payload: Record<string, unknown>) {
    this.onAction?.({ type, timestamp: Date.now(), payload });
  }
}

// ─── React Component ──────────────────────────────────────────────

interface MemoryProps {
  config?:     Partial<GameConfig>;
  onAction?:   (action: GameAction) => void;
  adjustment?: GameAdjustment;
  onExit?:     () => void;
}

export default function Memory({ config, onAction, adjustment, onExit }: MemoryProps) {
  const navigate     = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef      = useRef<Phaser.Game | null>(null);
  const sceneRef     = useRef<MemoryScene | null>(null);
  const { lang }     = useLang();

  const labels = useMemo(() => getGameLabels('memory', lang), [lang]);

  const handleAction = useCallback((a: GameAction) => { onAction?.(a); }, [onAction]);

  useEffect(() => {
    if (adjustment) sceneRef.current?.applyParams(adjustment);
  }, [adjustment]);

  useEffect(() => {
    sceneRef.current?.applyLabels(labels);
  }, [labels]);

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
      scene:           MemoryScene,
    });
    gameRef.current.scene.start('MemoryScene', {
      config:   mergedCfg,
      onAction: handleAction,
      onReady:  (s: MemoryScene) => { sceneRef.current = s; },
      labels,
    });
    return () => {
      gameRef.current?.destroy(true);
      gameRef.current  = null;
      sceneRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="memory-game">
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
