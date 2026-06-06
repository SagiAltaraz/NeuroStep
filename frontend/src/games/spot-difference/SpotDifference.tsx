import { useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import Phaser from 'phaser';
import type { GameAdjustment } from '../../hooks/useGameSession';
import { getGameLabels, type GameLabels } from '../../data/gameLabels';
import { useLang } from '../../context/LanguageContext';
import './SpotDifference.css';

type Labels = GameLabels<'spotDifference'>;

// ─── Types ────────────────────────────────────────────────────────

export interface GameAction {
  type: 'ROUND_START' | 'ODD_HIT' | 'WRONG_PICK' | 'TIMEOUT';
  timestamp:  number;
  reactionMs?: number;
  correct?:    boolean;
  payload:    Record<string, unknown>;
}

interface GameConfig {
  canvasWidth:    number;
  canvasHeight:   number;
  gridSize:       number;   // N — produces N×N grid
  similarity:     number;   // 0..1 — 0=very different, 1=identical
  roundTimeoutMs: number;
  interRoundMs:   number;
}

const DEFAULT_CONFIG: GameConfig = {
  canvasWidth:    920,
  canvasHeight:   560,
  gridSize:       3,
  similarity:     0.5,
  roundTimeoutMs: 8000,
  interRoundMs:   700,
};

// ─── Color helpers ────────────────────────────────────────────────

const BASE_COLORS = [
  { name: 'blue',   base: { r: 59,  g: 130, b: 246 } },
  { name: 'green',  base: { r: 16,  g: 185, b: 129 } },
  { name: 'orange', base: { r: 245, g: 158, b: 11  } },
  { name: 'pink',   base: { r: 236, g: 72,  b: 153 } },
  { name: 'purple', base: { r: 168, g: 85,  b: 247 } },
];

function rgbToHex(r: number, g: number, b: number) {
  return (r << 16) | (g << 8) | b;
}

// Make a slightly-different color. `similarity` 0=very different, 1=identical
function oddVariant(base: { r: number; g: number; b: number }, similarity: number) {
  // Delta magnitude — at similarity=0 use ~90 units (very visible),
  // at similarity=1 use ~12 units (very subtle but still distinguishable).
  const delta = Phaser.Math.Linear(90, 12, Phaser.Math.Clamp(similarity, 0, 1));
  const dir   = Math.random() < 0.5 ? -1 : 1;
  // Pick one channel to shift for clarity
  const channel = Math.floor(Math.random() * 3);
  const shift = (v: number) => Phaser.Math.Clamp(Math.round(v + dir * delta), 20, 240);
  return {
    r: channel === 0 ? shift(base.r) : base.r,
    g: channel === 1 ? shift(base.g) : base.g,
    b: channel === 2 ? shift(base.b) : base.b,
  };
}

// ─── Phaser Scene ─────────────────────────────────────────────────

class SpotDifferenceScene extends Phaser.Scene {
  private cfg:       GameConfig = DEFAULT_CONFIG;
  private onAction?: (a: GameAction) => void;
  private onReady?:  (s: SpotDifferenceScene) => void;

  // Stats
  private score = 0;
  private round = 0;

  // Round state
  private cells: Phaser.GameObjects.Rectangle[] = [];
  private oddIndex = -1;
  private roundStartTime = 0;
  private isRoundActive = false;
  private roundTimer: Phaser.Time.TimerEvent | null = null;

  // UI
  private scoreText!:    Phaser.GameObjects.Text;
  private roundText!:    Phaser.GameObjects.Text;
  private timerBar!:     Phaser.GameObjects.Rectangle;
  private feedbackTx!:   Phaser.GameObjects.Text;

  // Localized text refs
  private scoreLabel!:       Phaser.GameObjects.Text;
  private roundLabel!:        Phaser.GameObjects.Text;
  private instructionLabel!:  Phaser.GameObjects.Text;

  private labels: Labels = getGameLabels('spotDifference', 'he');

  constructor() { super({ key: 'SpotDifferenceScene' }); }

  init(data: {
    config?:   Partial<GameConfig>;
    onAction?: (a: GameAction) => void;
    onReady?:  (s: SpotDifferenceScene) => void;
    labels?:   Labels;
  }) {
    if (data.config)   this.cfg      = { ...DEFAULT_CONFIG, ...data.config };
    if (data.onAction) this.onAction = data.onAction;
    if (data.onReady)  this.onReady  = data.onReady;
    if (data.labels)   this.labels   = data.labels;
  }

  applyLabels(labels: Labels) {
    this.labels = labels;
    this.scoreLabel?.setText(labels.score);
    this.roundLabel?.setText(labels.round);
    this.instructionLabel?.setText(labels.instruction);
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
      this.cfg.gridSize = Phaser.Math.Clamp(Math.round(p.gridSize), 3, 7);
    if (typeof p.similarity === 'number')
      this.cfg.similarity = Phaser.Math.Clamp(p.similarity, 0, 0.95);
    if (typeof p.roundTimeoutMs === 'number')
      this.cfg.roundTimeoutMs = Math.max(2000, p.roundTimeoutMs);
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
    bg.fillGradientStyle(0x101018, 0x101018, 0x18181f, 0x18181f, 1);
    bg.fillRect(0, 0, W, H);
  }

  // ── UI ──────────────────────────────────────────────────────────
  private createUI() {
    const { canvasWidth: W, canvasHeight: H } = this.cfg;

    // Top bar
    this.add.rectangle(W / 2, 38, W, 76, 0x0a0a0f, 0.9).setDepth(10);

    this.scoreLabel = this.add.text(80, 20, this.labels.score,
      { fontSize: '11px', color: '#94a3b8', fontFamily: 'Arial' }
    ).setOrigin(0.5).setDepth(10);
    this.scoreText = this.add.text(80, 44, '0',
      { fontSize: '26px', fontFamily: 'Arial Black', color: '#e0e7ff' }
    ).setOrigin(0.5).setDepth(10);

    this.roundLabel = this.add.text(W - 80, 20, this.labels.round,
      { fontSize: '11px', color: '#94a3b8', fontFamily: 'Arial' }
    ).setOrigin(0.5).setDepth(10);
    this.roundText = this.add.text(W - 80, 44, '0',
      { fontSize: '26px', fontFamily: 'Arial Black', color: '#fbbf24' }
    ).setOrigin(0.5).setDepth(10);

    // Timer bar (under top bar)
    const barW = W - 80;
    this.add.rectangle(W / 2, 86, barW, 6, 0x1f2937).setDepth(10);
    this.timerBar = this.add.rectangle(W / 2 - barW / 2, 86, barW, 6, 0x10b981)
      .setOrigin(0, 0.5).setDepth(11);

    // Feedback
    this.feedbackTx = this.add.text(W / 2, H / 2, '', {
      fontSize: '52px', fontFamily: 'Arial Black', color: '#fff',
    }).setOrigin(0.5).setAlpha(0).setDepth(30);

    // Instruction
    this.instructionLabel = this.add.text(W / 2, H - 18, this.labels.instruction, {
      fontSize: '13px', fontFamily: 'Arial', color: '#94a3b8', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(10);
  }

  // ── Round flow ───────────────────────────────────────────────────
  private startRound() {
    this.flushPendingParams();
    this.round++;
    this.roundText.setText(String(this.round));
    this.clearCells();

    const N = this.cfg.gridSize;
    const total = N * N;
    this.oddIndex = Math.floor(Math.random() * total);

    const palette = Phaser.Utils.Array.GetRandom(BASE_COLORS);
    const baseColor = rgbToHex(palette.base.r, palette.base.g, palette.base.b);
    const oddRgb = oddVariant(palette.base, this.cfg.similarity);
    const oddColor = rgbToHex(oddRgb.r, oddRgb.g, oddRgb.b);

    // Layout
    const { canvasWidth: W, canvasHeight: H } = this.cfg;
    const top = 110, bottom = H - 50;
    const usableW = W - 80, usableH = bottom - top;
    const cellSize = Math.floor(Math.min(usableW / N, usableH / N)) - 8;
    const gridW = N * (cellSize + 8);
    const gridH = N * (cellSize + 8);
    const startX = (W - gridW) / 2 + cellSize / 2 + 4;
    const startY = top + (usableH - gridH) / 2 + cellSize / 2 + 4;

    for (let i = 0; i < total; i++) {
      const col = i % N;
      const row = Math.floor(i / N);
      const x = startX + col * (cellSize + 8);
      const y = startY + row * (cellSize + 8);
      const isOdd = i === this.oddIndex;
      const rect = this.add.rectangle(x, y, cellSize, cellSize, isOdd ? oddColor : baseColor)
        .setStrokeStyle(2, 0x000000, 0.15)
        .setDepth(5)
        .setInteractive({ useHandCursor: true })
        .setScale(0);
      this.tweens.add({
        targets: rect, scale: 1, duration: 180, ease: 'Back.easeOut',
        delay: 10 * i,
      });
      const indexCapture = i;
      rect.on('pointerdown', () => this.onCellClick(indexCapture));
      this.cells.push(rect);
    }

    this.isRoundActive   = true;
    this.roundStartTime  = Date.now();
    this.timerBar.setScale(1, 1);

    this.fireAction('ROUND_START', {
      round: this.round, gridSize: N,
      similarity: this.cfg.similarity, oddIndex: this.oddIndex,
    });

    this.roundTimer = this.time.delayedCall(this.cfg.roundTimeoutMs, () => this.onTimeout(), [], this);
  }

  private onCellClick(index: number) {
    if (!this.isRoundActive) return;
    const reactionMs = Date.now() - this.roundStartTime;

    if (index === this.oddIndex) {
      this.score++;
      this.scoreText.setText(String(this.score));
      this.flash(this.labels.correct, '#22c55e');
      this.fireAction('ODD_HIT', { round: this.round, reactionMs }, reactionMs, true);
      this.endRound();
    } else {
      // Wrong cell — shake it and end the round
      this.tweens.add({
        targets: this.cells[index],
        x: this.cells[index].x + 8, yoyo: true, repeat: 3, duration: 50,
      });
      this.flash(this.labels.wrong, '#ef4444');
      this.fireAction('WRONG_PICK', { round: this.round, reactionMs }, reactionMs, false);
      this.endRound();
    }
  }

  private onTimeout() {
    if (!this.isRoundActive) return;
    this.flash(this.labels.timeout, '#fbbf24');
    this.fireAction('TIMEOUT', { round: this.round }, undefined, false);
    this.endRound();
  }

  private endRound() {
    this.isRoundActive = false;
    this.roundTimer?.remove();
    this.roundTimer = null;
    // Highlight the correct one briefly
    const oddCell = this.cells[this.oddIndex];
    if (oddCell) {
      this.tweens.add({
        targets: oddCell, scale: 1.18, duration: 220, yoyo: true,
      });
    }
    this.time.delayedCall(this.cfg.interRoundMs, () => this.startRound(), [], this);
  }

  private clearCells() {
    this.cells.forEach(c => c.destroy());
    this.cells = [];
  }

  private flash(text: string, color: string) {
    const { canvasWidth: W, canvasHeight: H } = this.cfg;
    this.feedbackTx.setPosition(W / 2, H / 2)
      .setText(text).setColor(color).setAlpha(1).setScale(0.6);
    this.tweens.add({
      targets: this.feedbackTx, scale: 1.1, duration: 180, ease: 'Back.easeOut',
    });
    this.tweens.add({
      targets: this.feedbackTx, alpha: 0, duration: 350, delay: 400,
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

  // ── Update — animate timer bar ──────────────────────────────────
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

interface SpotDifferenceProps {
  config?:     Partial<GameConfig>;
  onAction?:   (action: GameAction) => void;
  adjustment?: GameAdjustment;
}

export default function SpotDifference({ config, onAction, adjustment }: SpotDifferenceProps) {
  const navigate     = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef      = useRef<Phaser.Game | null>(null);
  const sceneRef     = useRef<SpotDifferenceScene | null>(null);
  const { lang }     = useLang();

  const labels = useMemo(() => getGameLabels('spotDifference', lang), [lang]);

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
      backgroundColor: '#0a0a0f',
      banner:          false,
      scene:           SpotDifferenceScene,
    });
    gameRef.current.scene.start('SpotDifferenceScene', {
      config:   mergedCfg,
      onAction: handleAction,
      onReady:  (s: SpotDifferenceScene) => { sceneRef.current = s; },
      labels,
    });
    return () => {
      gameRef.current?.destroy(true);
      gameRef.current  = null;
      sceneRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="spot-difference-game">
      <div className="game-back-row" dir="rtl">
        <button
          onClick={() => navigate('/games')}
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
