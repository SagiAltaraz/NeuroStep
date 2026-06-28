import { useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import Phaser from 'phaser';
import type { GameAdjustment } from '../../hooks/useGameSession';
import { getGameLabels, type GameLabels } from '../../data/gameLabels';
import { useLang } from '../../context/LanguageContext';
import './ShapesClick.css';

type ShapesLabels = GameLabels<'shapesClick'>;

// ─── Types ────────────────────────────────────────────────────────

export interface GameAction {
  type: 'ROUND_START' | 'CIRCLE_HIT' | 'DISTRACTOR_CLICK' | 'TIMEOUT';
  timestamp: number;
  payload: Record<string, unknown>;
}

interface GameConfig {
  canvasWidth:     number;
  canvasHeight:    number;
  circleLifeMs:    number;
  spawnIntervalMs: number;
  distractorCount: number;
}

const DEFAULT_CONFIG: GameConfig = {
  canvasWidth:     920,
  canvasHeight:    560,
  circleLifeMs:    3000,
  spawnIntervalMs: 1000,
  distractorCount: 0,
};

// Level thresholds — every N consecutive hits raises level
const LEVEL_UP_AT  = 5;   // hits per level
const MAX_LEVEL    = 8;

const CIRCLE_COLORS = [0xe11d48, 0x7c3aed, 0x0284c7, 0x059669, 0xd97706, 0xdb2777];

type DistractorShape = 'square' | 'triangle' | 'diamond' | 'pentagon';
const DISTRACTOR_SHAPES: DistractorShape[] = ['square', 'triangle', 'diamond', 'pentagon'];

// ─── Phaser Scene ─────────────────────────────────────────────────

class ShapesScene extends Phaser.Scene {
  private cfg:       GameConfig = DEFAULT_CONFIG;
  private onAction?: (a: GameAction) => void;
  private onReady?:  (s: ShapesScene) => void;

  // Round state
  private circleContainer:  Phaser.GameObjects.Container | null = null;
  private distractors:       Phaser.GameObjects.Container[] = [];
  private circlePos =        { x: 0, y: 0 };
  private circleStartTime =  0;
  private isCircleActive =   false;
  private lifeTimer:         Phaser.Time.TimerEvent | null = null;

  // Stats
  private score  = 0;
  private streak = 0;
  private level  = 1;
  private totalHits = 0;           // lifetime hits this session

  // UI
  private scoreText!:  Phaser.GameObjects.Text;
  private streakText!: Phaser.GameObjects.Text;
  private levelText!:  Phaser.GameObjects.Text;
  private feedbackTx!: Phaser.GameObjects.Text;
  private levelBarFill!: Phaser.GameObjects.Rectangle;
  private countdownRing!: Phaser.GameObjects.Graphics;
  private waitDot!:    Phaser.GameObjects.Text;
  private bgStars!:    Phaser.GameObjects.Graphics;

  // Localized label refs — kept so applyLabels() can update them in place
  private scoreLabel!:       Phaser.GameObjects.Text;
  private streakLabel!:      Phaser.GameObjects.Text;
  private levelLabel!:       Phaser.GameObjects.Text;
  private instructionLabel!: Phaser.GameObjects.Text;

  // Current localized strings — default to Hebrew until init runs
  private labels: ShapesLabels = getGameLabels('shapesClick', 'he');

  constructor() { super({ key: 'ShapesScene' }); }

  init(data: {
    config?:   Partial<GameConfig>;
    onAction?: (a: GameAction) => void;
    onReady?:  (s: ShapesScene) => void;
    labels?:   ShapesLabels;
  }) {
    if (data.config)   this.cfg      = { ...DEFAULT_CONFIG, ...data.config };
    if (data.onAction) this.onAction = data.onAction;
    if (data.onReady)  this.onReady  = data.onReady;
    if (data.labels)   this.labels   = data.labels;
  }

  /** Replace the localized text on every label without disrupting state. */
  applyLabels(labels: ShapesLabels) {
    this.labels = labels;
    this.scoreLabel?.setText(labels.score);
    this.streakLabel?.setText(labels.streak);
    this.levelLabel?.setText(labels.level);
    this.instructionLabel?.setText(labels.instruction);
  }

  create() {
    this.createBackground();
    this.createUI();
    this.countdownRing = this.add.graphics().setDepth(7);
    this.onReady?.(this);
    this.scheduleNextSpawn(800);
  }

  // ── Apply server adjustment ──────────────────────────────────────
  applyParams(params: GameAdjustment) {
    if (typeof params.circleLifeMs    === 'number') this.cfg.circleLifeMs    = Math.max(500,  params.circleLifeMs);
    if (typeof params.distractorCount === 'number') this.cfg.distractorCount = Math.max(0, Math.round(params.distractorCount));
  }

  // ── Background ──────────────────────────────────────────────────
  private createBackground() {
    const { canvasWidth: W, canvasHeight: H } = this.cfg;

    // Light brand gradient bg (matches Lian's .site-bg palette)
    const bg = this.add.graphics();
    bg.fillGradientStyle(0xf3faf9, 0xeef6ff, 0xe7f1fb, 0xdcebf7, 1);
    bg.fillRect(0, 0, W, H);

    // Soft floating dots (subtle, brand-tinted — replaces the dark star field)
    this.bgStars = this.add.graphics();
    for (let i = 0; i < 70; i++) {
      const x = Phaser.Math.Between(0, W);
      const y = Phaser.Math.Between(90, H);
      const r = Math.random() < 0.15 ? 2.2 : 1.3;
      this.bgStars.fillStyle(0x2f86d6, 0.05 + Math.random() * 0.06);
      this.bgStars.fillCircle(x, y, r);
    }

    // Very subtle light grid
    const grid = this.add.graphics();
    grid.lineStyle(1, 0x2f86d6, 0.06);
    for (let x = 0; x <= W; x += 80) grid.lineBetween(x, 90, x, H);
    for (let y = 90; y <= H; y += 80) grid.lineBetween(0, y, W, y);
  }

  // ── UI ──────────────────────────────────────────────────────────
  private createUI() {
    const { canvasWidth: W, canvasHeight: H } = this.cfg;

    // Top bar background — light frosted with a brand divider
    this.add.rectangle(W / 2, 38, W, 76, 0xffffff, 0.72).setDepth(10);
    this.add.rectangle(W / 2, 76, W, 2, 0x2f86d6, 0.25).setDepth(10);

    // Score
    this.scoreLabel = this.add.text(72, 20, this.labels.score, { fontSize: '11px', color: '#5a7fa8', fontFamily: 'Arial' }).setOrigin(0.5).setDepth(10);
    this.scoreText = this.add.text(72, 44, '0', {
      fontSize: '26px', fontFamily: 'Arial Black', color: '#1c3a45',
    }).setOrigin(0.5).setDepth(10);

    // Streak
    this.streakLabel = this.add.text(W - 72, 20, this.labels.streak, { fontSize: '11px', color: '#5a7fa8', fontFamily: 'Arial' }).setOrigin(0.5).setDepth(10);
    this.streakText = this.add.text(W - 72, 44, '0', {
      fontSize: '26px', fontFamily: 'Arial Black', color: '#1c3a45',
    }).setOrigin(0.5).setDepth(10);

    // Level
    this.levelLabel = this.add.text(W / 2, 18, this.labels.level, { fontSize: '11px', color: '#5a7fa8', fontFamily: 'Arial' }).setOrigin(0.5).setDepth(10);
    this.levelText = this.add.text(W / 2, 40, '1', {
      fontSize: '22px', fontFamily: 'Arial Black', color: '#2f86d6',
    }).setOrigin(0.5).setDepth(10);

    // Level progress bar
    const barW = 160;
    this.add.rectangle(W / 2, 62, barW, 8, 0xdbeafe).setDepth(10);
    this.levelBarFill = this.add.rectangle(W / 2 - barW / 2, 62, 0, 8, 0x2f86d6)
      .setOrigin(0, 0.5).setDepth(10);
    this.updateLevelBar();

    // Instruction
    this.instructionLabel = this.add.text(W / 2, H - 18, this.labels.instruction, {
      fontSize: '13px', fontFamily: 'Arial', color: '#5a7fa8', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(10);

    // Feedback
    this.feedbackTx = this.add.text(W / 2, H / 2, '', {
      fontSize: '72px', fontFamily: 'Arial Black', color: '#fff',
    }).setOrigin(0.5).setAlpha(0).setDepth(20);

    // Waiting dot
    this.waitDot = this.add.text(W / 2, H / 2, '◉', {
      fontSize: '30px', fontFamily: 'Arial', color: '#4338ca',
    }).setOrigin(0.5).setAlpha(0).setDepth(3);
    this.tweens.add({ targets: this.waitDot, alpha: 0.6, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  private updateLevelBar() {
    const barW   = 160;
    const hitsInLevel = this.totalHits % LEVEL_UP_AT;
    const progress    = hitsInLevel / LEVEL_UP_AT;
    this.tweens.add({ targets: this.levelBarFill, width: barW * progress, duration: 250 });
  }

  // ── Spawning ─────────────────────────────────────────────────────
  private scheduleNextSpawn(delay?: number) {
    this.waitDot.setAlpha(0.3);
    this.time.delayedCall(delay ?? this.cfg.spawnIntervalMs, this.spawnCircle, [], this);
  }

  private spawnCircle() {
    const { canvasWidth: W, canvasHeight: H, distractorCount } = this.cfg;
    this.waitDot.setAlpha(0);

    const x = Phaser.Math.Between(90, W - 90);
    const y = Phaser.Math.Between(120, H - 70);
    this.circlePos = { x, y };

    this.circleContainer = this.buildCircle(x, y);

    const placed: { x: number; y: number }[] = [{ x, y }];
    for (let i = 0; i < distractorCount; i++) {
      const pos = this.findFreePos(placed, W, H);
      placed.push(pos);
      this.distractors.push(this.buildDistractor(pos.x, pos.y));
    }

    this.isCircleActive  = true;
    this.circleStartTime = Date.now();

    this.lifeTimer = this.time.addEvent({
      delay: this.cfg.circleLifeMs, callback: this.onTimeout, callbackScope: this,
    });

    this.fireAction('ROUND_START', { level: this.level, distractorCount });
  }

  private findFreePos(placed: { x: number; y: number }[], W: number, H: number) {
    for (let t = 0; t < 60; t++) {
      const x = Phaser.Math.Between(80, W - 80);
      const y = Phaser.Math.Between(110, H - 60);
      if (placed.every(p => Math.hypot(x - p.x, y - p.y) > 130)) return { x, y };
    }
    return { x: Phaser.Math.Between(80, W - 80), y: Phaser.Math.Between(110, H - 60) };
  }

  // ── Shape creation ───────────────────────────────────────────────
  private buildCircle(x: number, y: number): Phaser.GameObjects.Container {
    const c = this.add.container(x, y).setDepth(6);
    const g = this.add.graphics();
    const r = 36;
    const color = Phaser.Utils.Array.GetRandom(CIRCLE_COLORS) as number;

    // Outer glow
    g.fillStyle(color, 0.15); g.fillCircle(0, 0, r + 16);
    // Ring
    g.lineStyle(3, color, 0.6); g.strokeCircle(0, 0, r + 8);
    // Main
    g.fillStyle(color); g.fillCircle(0, 0, r);
    // Shine
    g.fillStyle(0xffffff, 0.28); g.fillCircle(-r * 0.3, -r * 0.32, r * 0.32);

    c.add(g);
    c.setSize((r + 16) * 2, (r + 16) * 2);
    c.setInteractive({ useHandCursor: true });
    c.setScale(0);
    this.tweens.add({ targets: c, scaleX: 1, scaleY: 1, duration: 200, ease: 'Back.easeOut' });
    c.on('pointerdown', () => this.onCircleClick());
    return c;
  }

  private buildDistractor(x: number, y: number): Phaser.GameObjects.Container {
    const c    = this.add.container(x, y).setDepth(6);
    const g    = this.add.graphics();
    const type = Phaser.Utils.Array.GetRandom(DISTRACTOR_SHAPES) as DistractorShape;
    const s    = 32, s2 = s / 2;

    g.fillStyle(0x64748b); g.lineStyle(2, 0x94a3b8);
    switch (type) {
      case 'square':
        g.fillRect(-s2, -s2, s, s); g.strokeRect(-s2, -s2, s, s); break;
      case 'triangle': {
        const pts = [{ x: 0, y: -s2 }, { x: s2, y: s2 }, { x: -s2, y: s2 }];
        g.fillPoints(pts, true); g.strokePoints(pts, true); break;
      }
      case 'diamond': {
        const pts = [{ x: 0, y: -s2 }, { x: s2, y: 0 }, { x: 0, y: s2 }, { x: -s2, y: 0 }];
        g.fillPoints(pts, true); g.strokePoints(pts, true); break;
      }
      case 'pentagon': {
        const pts = Array.from({ length: 5 }, (_, i) => {
          const a = (i * Math.PI * 2) / 5 - Math.PI / 2;
          return { x: Math.cos(a) * s2, y: Math.sin(a) * s2 };
        });
        g.fillPoints(pts, true); g.strokePoints(pts, true); break;
      }
    }

    c.add(g);
    c.setSize(s + 20, s + 20);
    c.setInteractive({ useHandCursor: true });
    c.setScale(0);
    this.tweens.add({ targets: c, scaleX: 1, scaleY: 1, duration: 180, ease: 'Back.easeOut', delay: 60 });
    c.on('pointerdown', () => this.onDistractorClick(c));
    return c;
  }

  // ── Interaction ──────────────────────────────────────────────────
  private onCircleClick() {
    if (!this.isCircleActive) return;
    const reactionMs = Date.now() - this.circleStartTime;
    this.clearRound();

    this.score++;
    this.streak++;
    this.totalHits++;
    this.scoreText.setText(String(this.score));
    this.streakText.setText(String(this.streak));

    // Level up?
    const newLevel = Math.min(MAX_LEVEL, Math.floor(this.totalHits / LEVEL_UP_AT) + 1);
    if (newLevel > this.level) {
      this.level = newLevel;
      this.levelText.setText(String(this.level));
      this.showBigFeedback(this.labels.levelUp.replace('{n}', String(this.level)), '#a5b4fc');
    } else {
      this.showFeedback('✓', '#4ade80');
    }
    this.updateLevelBar();

    this.fireAction('CIRCLE_HIT', { reactionMs, streak: this.streak, level: this.level });
    this.scheduleNextSpawn();
  }

  private onDistractorClick(container: Phaser.GameObjects.Container) {
    if (!this.isCircleActive) return;
    this.streak = 0;
    this.streakText.setText('0');
    this.tweens.add({ targets: container, x: container.x + 10, yoyo: true, repeat: 3, duration: 45 });
    this.showFeedback('✗', '#f87171');
    this.fireAction('DISTRACTOR_CLICK', { reactionMs: Date.now() - this.circleStartTime, level: this.level });
  }

  private onTimeout() {
    if (!this.isCircleActive) return;
    this.streak = 0;
    this.streakText.setText('0');
    this.clearRound();
    this.showFeedback('⏱', '#fb923c');
    this.fireAction('TIMEOUT', { level: this.level });
    this.scheduleNextSpawn();
  }

  private clearRound() {
    this.isCircleActive = false;
    this.lifeTimer?.destroy();
    this.lifeTimer = null;
    this.countdownRing.clear();
    this.circleContainer?.destroy(); this.circleContainer = null;
    this.distractors.forEach(d => d.destroy()); this.distractors = [];
  }

  private showFeedback(text: string, color: string) {
    const { canvasWidth: W, canvasHeight: H } = this.cfg;
    this.feedbackTx.setPosition(W / 2, H / 2).setText(text).setColor(color).setAlpha(1).setScale(0.3);
    this.tweens.add({ targets: this.feedbackTx, scale: 1.1, duration: 180, ease: 'Back.easeOut' });
    this.tweens.add({ targets: this.feedbackTx, alpha: 0, duration: 280, delay: 320 });
  }

  private showBigFeedback(text: string, color: string) {
    const { canvasWidth: W, canvasHeight: H } = this.cfg;
    const t = this.add.text(W / 2, H / 2, text, {
      fontSize: '48px', fontFamily: 'Arial Black', color,
    }).setOrigin(0.5).setAlpha(0).setDepth(25).setScale(0.5);
    this.tweens.add({ targets: t, alpha: 1, scale: 1.3, duration: 300, ease: 'Back.easeOut' });
    this.tweens.add({ targets: t, alpha: 0, y: H / 2 - 60, duration: 600, delay: 600,
      onComplete: () => t.destroy() });
  }

  // ── Update — countdown ring ──────────────────────────────────────
  update() {
    if (!this.isCircleActive) return;
    const progress = Math.max(0, 1 - (Date.now() - this.circleStartTime) / this.cfg.circleLifeMs);
    const color    = progress > 0.5 ? 0x4ade80 : progress > 0.25 ? 0xfbbf24 : 0xf87171;

    this.countdownRing.clear();
    this.countdownRing.lineStyle(5, color, 0.9);
    this.countdownRing.beginPath();
    this.countdownRing.arc(
      this.circlePos.x, this.circlePos.y, 54,
      -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2, false,
    );
    this.countdownRing.strokePath();

    if (progress < 0.25 && this.circleContainer) {
      this.circleContainer.setScale(1 + 0.07 * Math.sin(Date.now() * 0.018));
    }
  }

  private fireAction(type: GameAction['type'], payload: Record<string, unknown>) {
    this.onAction?.({ type, timestamp: Date.now(), payload });
  }
}

// ─── React Component ──────────────────────────────────────────────

interface ShapesClickProps {
  config?:     Partial<GameConfig>;
  onAction?:   (action: GameAction) => void;
  adjustment?: GameAdjustment;
}

export default function ShapesClick({ config, onAction, adjustment }: ShapesClickProps) {
  const navigate     = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef      = useRef<Phaser.Game | null>(null);
  const sceneRef     = useRef<ShapesScene | null>(null);
  const { lang }     = useLang();

  // Re-compute labels whenever the user changes language. useMemo keeps
  // the object identity stable across renders so the effect below only
  // fires when lang actually changes.
  const labels = useMemo(() => getGameLabels('shapesClick', lang), [lang]);

  const handleAction = useCallback((a: GameAction) => { onAction?.(a); }, [onAction]);

  useEffect(() => {
    if (adjustment) sceneRef.current?.applyParams(adjustment);
  }, [adjustment]);

  // Mid-session language switch — update labels in place without restarting.
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
      scene:           ShapesScene,
    });
    gameRef.current.scene.start('ShapesScene', {
      config:   mergedCfg,
      onAction: handleAction,
      onReady:  (s: ShapesScene) => { sceneRef.current = s; },
      labels,
    });
    return () => {
      gameRef.current?.destroy(true);
      gameRef.current  = null;
      sceneRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="shapes-click-game">
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
