import { useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import Phaser from 'phaser';
import type { GameAdjustment } from '../../hooks/useGameSession';
import { getGameLabels, type GameLabels } from '../../data/gameLabels';
import { useLang } from '../../context/LanguageContext';
import './WhereWasIt.css';

type Labels = GameLabels<'whereWasIt'>;

// ─── Types ────────────────────────────────────────────────────────

export interface GameAction {
  type: 'ROUND_START' | 'SEQUENCE_SHOWN' | 'CELL_TAP' | 'SEQUENCE_COMPLETE' | 'SEQUENCE_FAIL';
  timestamp:  number;
  reactionMs?: number;
  correct?:    boolean;
  payload:    Record<string, unknown>;
}

interface GameConfig {
  canvasWidth:     number;
  canvasHeight:    number;
  gridSize:        number;   // 4 = 4×4
  sequenceLength:  number;
  flashDurationMs: number;
  gapMs:           number;   // gap between flashes
  interRoundMs:    number;
}

const DEFAULT_CONFIG: GameConfig = {
  canvasWidth:     920,
  canvasHeight:    560,
  gridSize:        4,
  sequenceLength:  3,
  flashDurationMs: 600,
  gapMs:           220,
  interRoundMs:    900,
};

type Phase = 'watching' | 'input' | 'feedback';

// ─── Phaser Scene ─────────────────────────────────────────────────

class WhereWasItScene extends Phaser.Scene {
  private cfg:       GameConfig = DEFAULT_CONFIG;
  private onAction?: (a: GameAction) => void;
  private onReady?:  (s: WhereWasItScene) => void;

  // Stats
  private score = 0;
  private round = 0;

  // Round state
  private cells: Phaser.GameObjects.Rectangle[] = [];
  private sequence: number[] = [];
  private inputIndex = 0;
  private phase: Phase = 'watching';
  private inputStartTime = 0;

  // UI
  private scoreText!:   Phaser.GameObjects.Text;
  private seqText!:     Phaser.GameObjects.Text;
  private statusText!:  Phaser.GameObjects.Text;
  private feedbackTx!:  Phaser.GameObjects.Text;

  private scoreLabel!:       Phaser.GameObjects.Text;
  private seqLabel!:         Phaser.GameObjects.Text;
  private instructionLabel!: Phaser.GameObjects.Text;

  private labels: Labels = getGameLabels('whereWasIt', 'he');

  constructor() { super({ key: 'WhereWasItScene' }); }

  init(data: {
    config?:   Partial<GameConfig>;
    onAction?: (a: GameAction) => void;
    onReady?:  (s: WhereWasItScene) => void;
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
    this.seqLabel?.setText(labels.sequence);
    this.instructionLabel?.setText(labels.instruction);
    if (this.phase === 'watching') this.statusText?.setText(labels.watch);
    else if (this.phase === 'input') this.statusText?.setText(labels.yourTurn);
  }

  // ── Server adjustment ───────────────────────────────────────────
  // Params are ABSOLUTE target values, buffered and applied at the next round
  // boundary so a sequence in progress is never altered mid-flight.
  private pendingParams: GameAdjustment = {};

  applyParams(params: GameAdjustment) {
    Object.assign(this.pendingParams, params);
  }

  private flushPendingParams() {
    const p = this.pendingParams;
    if (typeof p.sequenceLength === 'number')
      this.cfg.sequenceLength = Phaser.Math.Clamp(Math.round(p.sequenceLength), 2, 9);
    if (typeof p.flashDurationMs === 'number')
      this.cfg.flashDurationMs = Phaser.Math.Clamp(p.flashDurationMs, 250, 1100);
    this.pendingParams = {};
  }

  create() {
    this.createBackground();
    this.createBoard();
    this.createUI();
    this.onReady?.(this);
    this.time.delayedCall(400, () => this.startRound(), [], this);
  }

  // ── Background ───────────────────────────────────────────────────
  private createBackground() {
    const { canvasWidth: W, canvasHeight: H } = this.cfg;
    const bg = this.add.graphics();
    bg.fillGradientStyle(0xf3faf9, 0xeef6ff, 0xe7f1fb, 0xdcebf7, 1);
    bg.fillRect(0, 0, W, H);
  }

  private createBoard() {
    this.cells.forEach(c => c.destroy());
    this.cells = [];

    const { canvasWidth: W, canvasHeight: H, gridSize: N } = this.cfg;
    const top = 110, bottom = H - 60;
    const usableW = W - 120, usableH = bottom - top;
    const cellSize = Math.floor(Math.min(usableW / N, usableH / N)) - 10;
    const gridW = N * (cellSize + 10);
    const gridH = N * (cellSize + 10);
    const startX = (W - gridW) / 2 + cellSize / 2 + 5;
    const startY = top + (usableH - gridH) / 2 + cellSize / 2 + 5;

    for (let i = 0; i < N * N; i++) {
      const col = i % N;
      const row = Math.floor(i / N);
      const x = startX + col * (cellSize + 10);
      const y = startY + row * (cellSize + 10);
      const rect = this.add.rectangle(x, y, cellSize, cellSize, 0x1f2937, 1)
        .setStrokeStyle(2, 0x374151)
        .setDepth(5)
        .setInteractive({ useHandCursor: true });
      const idx = i;
      rect.on('pointerdown', () => this.onCellClick(idx));
      this.cells.push(rect);
    }
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

    this.seqLabel = this.add.text(W - 80, 20, this.labels.sequence,
      { fontSize: '11px', color: '#5a7fa8', fontFamily: 'Arial' }
    ).setOrigin(0.5).setDepth(10);
    this.seqText = this.add.text(W - 80, 44, '0',
      { fontSize: '26px', fontFamily: 'Arial Black', color: '#c084fc' }
    ).setOrigin(0.5).setDepth(10);

    this.statusText = this.add.text(W / 2, 38, this.labels.watch, {
      fontSize: '20px', fontFamily: 'Arial Black', color: '#c084fc',
    }).setOrigin(0.5).setDepth(10);

    this.feedbackTx = this.add.text(W / 2, H / 2, '', {
      fontSize: '46px', fontFamily: 'Arial Black', color: '#fff',
    }).setOrigin(0.5).setAlpha(0).setDepth(30);

    this.instructionLabel = this.add.text(W / 2, H - 18, this.labels.instruction, {
      fontSize: '13px', fontFamily: 'Arial', color: '#5a7fa8', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(10);
  }

  // ── Round flow ───────────────────────────────────────────────────
  private startRound() {
    this.flushPendingParams();
    this.round++;
    this.seqText.setText(String(this.cfg.sequenceLength));

    // Build new random sequence (no consecutive duplicates)
    const N = this.cfg.gridSize * this.cfg.gridSize;
    this.sequence = [];
    let last = -1;
    for (let i = 0; i < this.cfg.sequenceLength; i++) {
      let pick: number;
      do { pick = Math.floor(Math.random() * N); } while (pick === last);
      this.sequence.push(pick);
      last = pick;
    }

    this.inputIndex = 0;
    this.phase = 'watching';
    this.statusText.setText(this.labels.watch).setColor('#c084fc');

    this.fireAction('ROUND_START', {
      round: this.round,
      sequenceLength: this.cfg.sequenceLength,
      gridSize: this.cfg.gridSize,
    });

    this.playSequence();
  }

  private playSequence() {
    const { flashDurationMs, gapMs } = this.cfg;
    let t = 0;
    this.sequence.forEach((cellIdx, i) => {
      this.time.delayedCall(t, () => this.flashCell(cellIdx, flashDurationMs), [], this);
      t += flashDurationMs + gapMs;
      if (i === this.sequence.length - 1) {
        this.time.delayedCall(t, () => {
          this.fireAction('SEQUENCE_SHOWN', {
            round: this.round, sequence: [...this.sequence],
          });
          this.startInputPhase();
        }, [], this);
      }
    });
  }

  private flashCell(idx: number, duration: number) {
    const cell = this.cells[idx];
    if (!cell) return;
    cell.setFillStyle(0xbf5af2, 1);
    this.tweens.add({
      targets: cell, scale: 1.08, duration: duration / 2, yoyo: true,
      onComplete: () => cell.setFillStyle(0x1f2937, 1),
    });
  }

  private startInputPhase() {
    this.phase = 'input';
    this.inputStartTime = Date.now();
    this.statusText.setText(this.labels.yourTurn).setColor('#16a34a');
  }

  private onCellClick(idx: number) {
    if (this.phase !== 'input') return;
    const expected = this.sequence[this.inputIndex];

    this.fireAction('CELL_TAP', {
      round: this.round, index: idx, expected, position: this.inputIndex,
    }, undefined, idx === expected);

    if (idx === expected) {
      // brief positive flash
      const cell = this.cells[idx];
      cell.setFillStyle(0x10b981, 1);
      this.tweens.add({
        targets: cell, scale: 1.06, duration: 120, yoyo: true,
        onComplete: () => cell.setFillStyle(0x1f2937, 1),
      });
      this.inputIndex++;
      if (this.inputIndex >= this.sequence.length) {
        this.onSequenceComplete();
      }
    } else {
      // wrong cell — fail the round
      const cell = this.cells[idx];
      cell.setFillStyle(0xef4444, 1);
      this.tweens.add({
        targets: cell, x: cell.x + 6, yoyo: true, repeat: 3, duration: 50,
        onComplete: () => cell.setFillStyle(0x1f2937, 1),
      });
      this.onSequenceFail();
    }
  }

  private onSequenceComplete() {
    const totalMs = Date.now() - this.inputStartTime;
    this.score++;
    this.scoreText.setText(String(this.score));
    this.flash(this.labels.correct, '#22c55e');
    this.fireAction('SEQUENCE_COMPLETE', {
      round: this.round,
      sequenceLength: this.sequence.length,
      reactionMs: totalMs,
    }, totalMs, true);
    this.phase = 'feedback';
    this.time.delayedCall(this.cfg.interRoundMs, () => this.startRound(), [], this);
  }

  private onSequenceFail() {
    this.flash(this.labels.wrong, '#ef4444');
    this.fireAction('SEQUENCE_FAIL', {
      round: this.round, position: this.inputIndex,
    }, undefined, false);
    this.phase = 'feedback';
    this.time.delayedCall(this.cfg.interRoundMs, () => this.startRound(), [], this);
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
}

// ─── React Component ──────────────────────────────────────────────

interface WhereWasItProps {
  config?:     Partial<GameConfig>;
  onAction?:   (action: GameAction) => void;
  adjustment?: GameAdjustment;
}

export default function WhereWasIt({ config, onAction, adjustment }: WhereWasItProps) {
  const navigate     = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef      = useRef<Phaser.Game | null>(null);
  const sceneRef     = useRef<WhereWasItScene | null>(null);
  const { lang }     = useLang();

  const labels = useMemo(() => getGameLabels('whereWasIt', lang), [lang]);

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
      scene:           WhereWasItScene,
    });
    gameRef.current.scene.start('WhereWasItScene', {
      config:   mergedCfg,
      onAction: handleAction,
      onReady:  (s: WhereWasItScene) => { sceneRef.current = s; },
      labels,
    });
    return () => {
      gameRef.current?.destroy(true);
      gameRef.current  = null;
      sceneRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="where-was-it-game">
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
