import { useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import Phaser from 'phaser';
import type { GameAdjustment } from '../../hooks/useGameSession';
import { getGameLabels, type GameLabels } from '../../data/gameLabels';
import { useLang } from '../../context/LanguageContext';
import './GreenLight.css';

type Labels = GameLabels<'greenLight'>;

// ─── Types ────────────────────────────────────────────────────────

export interface GameAction {
  type: 'ROUND_START' | 'GO_HIT' | 'FALSE_START' | 'MISS';
  timestamp:  number;
  reactionMs?: number;
  correct?:    boolean;
  payload:    Record<string, unknown>;
}

interface GameConfig {
  canvasWidth:    number;
  canvasHeight:   number;
  redHoldMinMs:   number;   // min red duration
  redHoldMaxMs:   number;   // max red duration
  yellowHoldMs:   number;   // brief yellow before green
  greenWindowMs:  number;   // time window to tap during green
  interRoundMs:   number;   // pause between rounds
}

const DEFAULT_CONFIG: GameConfig = {
  canvasWidth:   920,
  canvasHeight:  560,
  redHoldMinMs:  1800,
  redHoldMaxMs:  3800,
  yellowHoldMs:  500,
  greenWindowMs: 1100,
  interRoundMs:  1000,
};

type Phase = 'red' | 'yellow' | 'green' | 'feedback';

// ─── Phaser Scene ─────────────────────────────────────────────────

class GreenLightScene extends Phaser.Scene {
  private cfg:       GameConfig = DEFAULT_CONFIG;
  private onAction?: (a: GameAction) => void;
  private onReady?:  (s: GreenLightScene) => void;

  // Stats
  private score    = 0;
  private bestMs   = Infinity;
  private rounds   = 0;

  // Round state
  private phase: Phase = 'red';
  private greenStartTime = 0;
  private redTimer:    Phaser.Time.TimerEvent | null = null;
  private yellowTimer: Phaser.Time.TimerEvent | null = null;
  private greenTimer:  Phaser.Time.TimerEvent | null = null;

  // UI
  private redLight!:    Phaser.GameObjects.Arc;
  private yellowLight!: Phaser.GameObjects.Arc;
  private greenLight!:  Phaser.GameObjects.Arc;
  private redGlow!:     Phaser.GameObjects.Arc;
  private yellowGlow!:  Phaser.GameObjects.Arc;
  private greenGlow!:   Phaser.GameObjects.Arc;
  private tapButton!:   Phaser.GameObjects.Rectangle;
  private tapText!:     Phaser.GameObjects.Text;
  private scoreText!:   Phaser.GameObjects.Text;
  private bestText!:    Phaser.GameObjects.Text;
  private feedbackTx!:  Phaser.GameObjects.Text;
  private statusText!:  Phaser.GameObjects.Text;

  // Localized text label refs (updated by applyLabels)
  private scoreLabel!:       Phaser.GameObjects.Text;
  private bestLabel!:        Phaser.GameObjects.Text;
  private instructionLabel!: Phaser.GameObjects.Text;

  private labels: Labels = getGameLabels('greenLight', 'he');

  constructor() { super({ key: 'GreenLightScene' }); }

  init(data: {
    config?:   Partial<GameConfig>;
    onAction?: (a: GameAction) => void;
    onReady?:  (s: GreenLightScene) => void;
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
    this.bestLabel?.setText(labels.bestMs);
    this.instructionLabel?.setText(labels.instruction);
    if (this.phase === 'red' || this.phase === 'yellow') {
      this.statusText?.setText(labels.waitRed);
    }
  }

  // ── Server adjustment (real-time difficulty) ───────────────────
  // Params are ABSOLUTE target values, buffered and applied at the next round
  // boundary so the current red/green cycle is never altered mid-cycle.
  private pendingParams: GameAdjustment = {};

  applyParams(params: GameAdjustment) {
    Object.assign(this.pendingParams, params);
  }

  private flushPendingParams() {
    const p = this.pendingParams;
    if (typeof p.greenWindowMs === 'number')
      this.cfg.greenWindowMs = Math.max(400, p.greenWindowMs);
    if (typeof p.redHoldMinMs === 'number')
      this.cfg.redHoldMinMs = Math.max(800, p.redHoldMinMs);
    if (typeof p.redHoldMaxMs === 'number')
      this.cfg.redHoldMaxMs = Math.max(this.cfg.redHoldMinMs + 500, p.redHoldMaxMs);
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
    bg.fillGradientStyle(0x0a0a0f, 0x0a0a0f, 0x18181f, 0x18181f, 1);
    bg.fillRect(0, 0, W, H);
  }

  // ── UI ──────────────────────────────────────────────────────────
  private createUI() {
    const { canvasWidth: W, canvasHeight: H } = this.cfg;

    // Top stats bar
    this.add.rectangle(W / 2, 38, W, 76, 0x0a0a0f, 0.9).setDepth(10);

    this.scoreLabel = this.add.text(80, 20, this.labels.score,
      { fontSize: '11px', color: '#94a3b8', fontFamily: 'Arial' }
    ).setOrigin(0.5).setDepth(10);
    this.scoreText = this.add.text(80, 44, '0',
      { fontSize: '26px', fontFamily: 'Arial Black', color: '#e0e7ff' }
    ).setOrigin(0.5).setDepth(10);

    this.bestLabel = this.add.text(W - 80, 20, this.labels.bestMs,
      { fontSize: '11px', color: '#94a3b8', fontFamily: 'Arial' }
    ).setOrigin(0.5).setDepth(10);
    this.bestText = this.add.text(W - 80, 44, '—',
      { fontSize: '22px', fontFamily: 'Arial Black', color: '#86efac' }
    ).setOrigin(0.5).setDepth(10);

    // Traffic-light housing
    const cx = W / 2;
    const housingY = H / 2 - 50;
    this.add.rectangle(cx, housingY, 130, 320, 0x1a1a1a)
      .setStrokeStyle(2, 0x2a2a2a).setDepth(2);

    // Light glows (drawn below lights, hidden by default)
    this.redGlow    = this.add.circle(cx, housingY - 100, 60, 0xff3b3b, 0).setDepth(3);
    this.yellowGlow = this.add.circle(cx, housingY,         60, 0xffd60a, 0).setDepth(3);
    this.greenGlow  = this.add.circle(cx, housingY + 100, 60, 0x00f5a0, 0).setDepth(3);

    // Light circles (inactive by default — dim)
    this.redLight    = this.add.circle(cx, housingY - 100, 36, 0xff3b3b, 0.12)
      .setStrokeStyle(2, 0x2a2a2a).setDepth(4);
    this.yellowLight = this.add.circle(cx, housingY,         36, 0xffd60a, 0.12)
      .setStrokeStyle(2, 0x2a2a2a).setDepth(4);
    this.greenLight  = this.add.circle(cx, housingY + 100, 36, 0x00f5a0, 0.12)
      .setStrokeStyle(2, 0x2a2a2a).setDepth(4);

    // Status text under the housing
    this.statusText = this.add.text(cx, H - 150, this.labels.waitRed, {
      fontSize: '28px', fontFamily: 'Arial Black', color: '#cbd5e1',
    }).setOrigin(0.5).setDepth(10);

    // TAP button (big, full-width)
    const btnY = H - 88;
    this.tapButton = this.add.rectangle(cx, btnY, 360, 72, 0x1f2937, 0.95)
      .setStrokeStyle(2, 0x374151).setDepth(10)
      .setInteractive({ useHandCursor: true });
    this.tapText = this.add.text(cx, btnY, 'TAP', {
      fontSize: '28px', fontFamily: 'Arial Black', color: '#94a3b8', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(11);
    this.tapButton.on('pointerdown', () => this.onTap());

    // Feedback overlay (large)
    this.feedbackTx = this.add.text(cx, H / 2 - 50, '', {
      fontSize: '46px', fontFamily: 'Arial Black', color: '#fff',
    }).setOrigin(0.5).setAlpha(0).setDepth(20);

    // Instruction at very bottom
    this.instructionLabel = this.add.text(cx, H - 18, this.labels.instruction, {
      fontSize: '13px', fontFamily: 'Arial', color: '#94a3b8', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(10);
  }

  // ── Round flow ───────────────────────────────────────────────────
  private startRound() {
    this.flushPendingParams();
    this.rounds++;
    this.setPhase('red');
    this.statusText.setText(this.labels.waitRed);

    const holdMs = Phaser.Math.Between(this.cfg.redHoldMinMs, this.cfg.redHoldMaxMs);
    this.fireAction('ROUND_START', { round: this.rounds, redHoldMs: holdMs });

    this.redTimer = this.time.delayedCall(holdMs, () => this.toYellow(), [], this);
  }

  private toYellow() {
    this.setPhase('yellow');
    this.yellowTimer = this.time.delayedCall(this.cfg.yellowHoldMs, () => this.toGreen(), [], this);
  }

  private toGreen() {
    this.setPhase('green');
    this.statusText.setText(this.labels.go).setColor('#00f5a0');
    this.greenStartTime = Date.now();

    // Pulse the green light
    this.tweens.add({
      targets: [this.greenLight, this.greenGlow],
      scale: 1.1, duration: 350, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    // Pulse the TAP button border
    this.tapButton.setStrokeStyle(3, 0x00f5a0);
    this.tapText.setColor('#00f5a0');
    this.tweens.add({
      targets: this.tapButton, alpha: 0.7, duration: 280, yoyo: true, repeat: -1,
    });

    this.greenTimer = this.time.delayedCall(this.cfg.greenWindowMs, () => this.onMiss(), [], this);
  }

  private onTap() {
    if (this.phase === 'feedback') return;

    if (this.phase === 'red' || this.phase === 'yellow') {
      // False start — too early
      this.cancelAllTimers();
      this.flashFeedback(this.labels.falseStart, '#ff3b3b');
      this.fireAction('FALSE_START', { phase: this.phase }, undefined, false);
      this.setPhase('feedback');
      this.time.delayedCall(this.cfg.interRoundMs, () => this.startRound(), [], this);
      return;
    }

    if (this.phase === 'green') {
      const reactionMs = Date.now() - this.greenStartTime;
      this.cancelAllTimers();
      this.score++;
      this.scoreText.setText(String(this.score));
      if (reactionMs < this.bestMs) {
        this.bestMs = reactionMs;
        this.bestText.setText(String(reactionMs));
      }
      this.flashFeedback(this.labels.reactionMs.replace('{n}', String(reactionMs)), '#00f5a0');
      this.fireAction('GO_HIT', { round: this.rounds }, reactionMs, true);
      this.setPhase('feedback');
      this.time.delayedCall(this.cfg.interRoundMs, () => this.startRound(), [], this);
    }
  }

  private onMiss() {
    if (this.phase !== 'green') return;
    this.cancelAllTimers();
    this.flashFeedback(this.labels.miss, '#ffd60a');
    this.fireAction('MISS', { round: this.rounds }, undefined, false);
    this.setPhase('feedback');
    this.time.delayedCall(this.cfg.interRoundMs, () => this.startRound(), [], this);
  }

  // ── Visuals ──────────────────────────────────────────────────────
  private setPhase(phase: Phase) {
    this.phase = phase;
    // Reset all light alphas/glows
    this.redLight.setFillStyle(0xff3b3b, 0.12);
    this.yellowLight.setFillStyle(0xffd60a, 0.12);
    this.greenLight.setFillStyle(0x00f5a0, 0.12);
    this.redGlow.setAlpha(0);
    this.yellowGlow.setAlpha(0);
    this.greenGlow.setAlpha(0);

    // Stop pulsing tweens
    this.tweens.killTweensOf([this.greenLight, this.greenGlow, this.tapButton]);
    this.greenLight.setScale(1);
    this.greenGlow.setScale(1);
    this.tapButton.setAlpha(1);

    if (phase === 'red') {
      this.redLight.setFillStyle(0xff3b3b, 1);
      this.redGlow.setAlpha(0.35);
      this.statusText.setText(this.labels.waitRed).setColor('#cbd5e1');
      this.tapButton.setStrokeStyle(2, 0x374151);
      this.tapText.setColor('#94a3b8');
    } else if (phase === 'yellow') {
      this.yellowLight.setFillStyle(0xffd60a, 1);
      this.yellowGlow.setAlpha(0.35);
      this.statusText.setText(this.labels.waitRed).setColor('#fbbf24');
    } else if (phase === 'green') {
      this.greenLight.setFillStyle(0x00f5a0, 1);
      this.greenGlow.setAlpha(0.45);
    } else if (phase === 'feedback') {
      this.tapButton.setStrokeStyle(2, 0x374151);
      this.tapText.setColor('#94a3b8');
    }
  }

  private flashFeedback(text: string, color: string) {
    const { canvasWidth: W, canvasHeight: H } = this.cfg;
    this.feedbackTx.setPosition(W / 2, H / 2 - 50)
      .setText(text).setColor(color).setAlpha(1).setScale(0.6);
    this.tweens.add({
      targets: this.feedbackTx, scale: 1.05, duration: 180, ease: 'Back.easeOut',
    });
    this.tweens.add({
      targets: this.feedbackTx, alpha: 0, duration: 350, delay: 500,
    });
  }

  private cancelAllTimers() {
    this.redTimer?.remove();    this.redTimer    = null;
    this.yellowTimer?.remove(); this.yellowTimer = null;
    this.greenTimer?.remove();  this.greenTimer  = null;
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

interface GreenLightProps {
  config?:     Partial<GameConfig>;
  onAction?:   (action: GameAction) => void;
  adjustment?: GameAdjustment;
}

export default function GreenLight({ config, onAction, adjustment }: GreenLightProps) {
  const navigate     = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef      = useRef<Phaser.Game | null>(null);
  const sceneRef     = useRef<GreenLightScene | null>(null);
  const { lang }     = useLang();

  const labels = useMemo(() => getGameLabels('greenLight', lang), [lang]);

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
      scene:           GreenLightScene,
    });
    gameRef.current.scene.start('GreenLightScene', {
      config:   mergedCfg,
      onAction: handleAction,
      onReady:  (s: GreenLightScene) => { sceneRef.current = s; },
      labels,
    });
    return () => {
      gameRef.current?.destroy(true);
      gameRef.current  = null;
      sceneRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="green-light-game">
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
