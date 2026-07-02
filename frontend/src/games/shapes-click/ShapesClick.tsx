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

type DistractorShape =
  | 'square' | 'triangle' | 'rectangle' | 'diamond'
  | 'pentagon' | 'hexagon' | 'star' | 'octagon';

// Shape variety unlocks GRADUALLY with the level — early levels see only
// simple, clearly-not-a-circle shapes; the many-sided ones (hexagon, octagon —
// which reads almost like a circle) are saved for the top levels, where they
// force real shape discrimination. Count stays DDA-owned (see spawnCircle).
const SHAPE_LADDER: { type: DistractorShape; minLevel: number }[] = [
  { type: 'square',    minLevel: 1 },
  { type: 'triangle',  minLevel: 1 },
  { type: 'rectangle', minLevel: 2 },
  { type: 'diamond',   minLevel: 3 },
  { type: 'pentagon',  minLevel: 4 },
  { type: 'hexagon',   minLevel: 5 },
  { type: 'star',      minLevel: 6 },
  { type: 'octagon',   minLevel: 7 },
];

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
  // Round timer lives at the TOP of the screen (never on/near a shape, so it
  // can't reveal which one is the target).
  private timerBarFill!: Phaser.GameObjects.Rectangle;
  private lastCircleColor = 0x2f86d6;   // for the hit particle burst
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

    // Round timer — a full-width drain bar at the TOP, far from the play area,
    // so nothing near the shapes hints which one is the target.
    this.add.rectangle(W / 2, 84, W - 32, 6, 0xdbeafe).setDepth(10);
    this.timerBarFill = this.add.rectangle(16, 84, W - 32, 6, 0x16a34a)
      .setOrigin(0, 0.5).setDepth(10).setVisible(false);

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
      fontSize: '30px', fontFamily: 'Arial', color: '#2f86d6',
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

  // Control model — one owner per difficulty axis, so nothing double-dips:
  //   • SPEED (circleLifeMs)  → the DDA agent, per-player, in real time.
  //   • COUNT (distractorCount) → the DDA agent as well.
  //   • PACE (wait between rounds) → derived from the DDA speed below, so the
  //     rhythm tightens together with the player's calculated difficulty.
  //   • VARIETY + DISGUISE (which shapes, colors) → the in-session level,
  //     giving a visible sense of progression without fighting the DDA.
  private nextSpawnDelay(): number {
    return Phaser.Math.Clamp(Math.round(this.cfg.circleLifeMs * 0.33), 450, 1100);
  }

  private scheduleNextSpawn(delay?: number) {
    this.waitDot.setAlpha(0.3);
    this.time.delayedCall(delay ?? this.nextSpawnDelay(), this.spawnCircle, [], this);
  }

  private spawnCircle() {
    const { canvasWidth: W, canvasHeight: H, distractorCount } = this.cfg;
    this.waitDot.setAlpha(0);

    const x = Phaser.Math.Between(90, W - 90);
    const y = Phaser.Math.Between(120, H - 70);
    this.circlePos = { x, y };

    this.circleContainer = this.buildCircle(x, y);

    // Variety by level: only shapes unlocked at the current level may appear,
    // and at high levels one guaranteed "near-circle" confuser joins the round.
    const unlocked = SHAPE_LADDER.filter(s => s.minLevel <= this.level).map(s => s.type);
    const shapeTypes: DistractorShape[] = Array.from({ length: distractorCount },
      () => Phaser.Utils.Array.GetRandom(unlocked) as DistractorShape);
    if (this.level >= 5 && shapeTypes.length >= 2) {
      shapeTypes[0] = unlocked[unlocked.length - 1];   // hardest unlocked shape
    }

    const placed: { x: number; y: number }[] = [{ x, y }];
    for (const type of shapeTypes) {
      const pos = this.findFreePos(placed, W, H);
      placed.push(pos);
      this.distractors.push(this.buildDistractor(pos.x, pos.y, type));
    }

    this.isCircleActive  = true;
    this.circleStartTime = Date.now();

    this.lifeTimer = this.time.addEvent({
      delay: this.cfg.circleLifeMs, callback: this.onTimeout, callbackScope: this,
    });

    this.fireAction('ROUND_START', { level: this.level, distractorCount, shapeTypes });
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

  // Confusion tier — as the level climbs, color (and then styling/size) stop
  // being cues, so ONLY the shape identifies the target:
  //   0 (levels 1-2): distractors are plain gray — easy.
  //   1 (levels 3-4): distractors wear the SAME color palette as the circles.
  //   2 (levels 5+):  distractors get the full circle treatment (glow + ring +
  //                   shine + same size) — pure shape discrimination.
  private confusionTier(): 0 | 1 | 2 {
    if (this.level >= 5) return 2;
    if (this.level >= 3) return 1;
    return 0;
  }

  // Identical idle motion for EVERY shape — motion must never be a cue either.
  private addIdleFloat(c: Phaser.GameObjects.Container, y: number) {
    this.tweens.add({
      targets: c, y: y - 6,
      duration: Phaser.Math.Between(1300, 1800),
      yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      delay: Phaser.Math.Between(0, 400),
    });
  }

  private regularPoly(sides: number, half: number): { x: number; y: number }[] {
    return Array.from({ length: sides }, (_, i) => {
      const a = (i * Math.PI * 2) / sides - Math.PI / 2;
      return { x: Math.cos(a) * half, y: Math.sin(a) * half };
    });
  }

  private polyPoints(type: DistractorShape, half: number): { x: number; y: number }[] {
    switch (type) {
      case 'square':
        return [{ x: -half, y: -half }, { x: half, y: -half }, { x: half, y: half }, { x: -half, y: half }];
      case 'rectangle': {
        const w = half * 1.3, h = half * 0.72;
        return [{ x: -w, y: -h }, { x: w, y: -h }, { x: w, y: h }, { x: -w, y: h }];
      }
      case 'triangle':
        return [{ x: 0, y: -half }, { x: half, y: half }, { x: -half, y: half }];
      case 'diamond':
        return [{ x: 0, y: -half }, { x: half, y: 0 }, { x: 0, y: half }, { x: -half, y: 0 }];
      case 'pentagon': return this.regularPoly(5, half);
      case 'hexagon':  return this.regularPoly(6, half);
      case 'octagon':  return this.regularPoly(8, half);   // reads almost like a circle
      case 'star':
        return Array.from({ length: 10 }, (_, i) => {
          const a = (i * Math.PI) / 5 - Math.PI / 2;
          const r = i % 2 === 0 ? half : half * 0.48;
          return { x: Math.cos(a) * r, y: Math.sin(a) * r };
        });
    }
  }

  private buildCircle(x: number, y: number): Phaser.GameObjects.Container {
    const c = this.add.container(x, y).setDepth(6);
    const g = this.add.graphics();
    const r = 36;
    const color = Phaser.Utils.Array.GetRandom(CIRCLE_COLORS) as number;
    this.lastCircleColor = color;

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
    this.tweens.add({
      targets: c, scaleX: 1, scaleY: 1,
      duration: 260, ease: 'Back.easeOut',
      onComplete: () => this.addIdleFloat(c, y),
    });
    c.on('pointerdown', () => this.onCircleClick());
    return c;
  }

  private buildDistractor(x: number, y: number, type: DistractorShape): Phaser.GameObjects.Container {
    const c    = this.add.container(x, y).setDepth(6);
    const g    = this.add.graphics();
    const tier = this.confusionTier();

    // Size grows with the tier until it matches the circle's visual weight.
    const half  = tier === 2 ? 34 : tier === 1 ? 30 : 16;
    const color = tier === 0 ? 0x64748b : (Phaser.Utils.Array.GetRandom(CIRCLE_COLORS) as number);
    const main  = this.polyPoints(type, half);

    if (tier === 2) {
      // Full circle treatment — glow + ring + shine — only the geometry differs.
      g.fillStyle(color, 0.15); g.fillPoints(this.polyPoints(type, half * 1.45), true);
      g.lineStyle(3, color, 0.6); g.strokePoints(this.polyPoints(type, half * 1.2), true, true);
      g.fillStyle(color); g.fillPoints(main, true);
      g.fillStyle(0xffffff, 0.28); g.fillCircle(-half * 0.3, -half * 0.32, half * 0.3);
    } else {
      g.fillStyle(color); g.lineStyle(2, tier === 1 ? color : 0x94a3b8, tier === 1 ? 0.6 : 1);
      g.fillPoints(main, true); g.strokePoints(main, true, true);
      if (tier === 1) { g.fillStyle(0xffffff, 0.22); g.fillCircle(-half * 0.3, -half * 0.32, half * 0.28); }
    }

    c.add(g);
    c.setSize(half * 2 + 20, half * 2 + 20);
    c.setInteractive({ useHandCursor: true });
    c.setScale(0);
    this.tweens.add({
      targets: c, scaleX: 1, scaleY: 1,
      duration: 240, ease: 'Back.easeOut', delay: Phaser.Math.Between(30, 120),
      onComplete: () => this.addIdleFloat(c, y),
    });
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

    // Hit juice — a burst in the circle's color + a floating "+1" at the spot.
    this.burstAt(this.circlePos.x, this.circlePos.y, this.lastCircleColor);
    this.floatScore(this.circlePos.x, this.circlePos.y);

    // Level up?
    const newLevel = Math.min(MAX_LEVEL, Math.floor(this.totalHits / LEVEL_UP_AT) + 1);
    if (newLevel > this.level) {
      this.level = newLevel;
      this.levelText.setText(String(this.level));
      this.showBigFeedback(this.labels.levelUp.replace('{n}', String(this.level)), '#2f86d6');
    } else {
      this.showFeedback('✓', '#16a34a');
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
    this.cameras.main.shake(120, 0.004);
    this.showFeedback('✗', '#e5484d');
    this.fireAction('DISTRACTOR_CLICK', { reactionMs: Date.now() - this.circleStartTime, level: this.level });
  }

  private onTimeout() {
    if (!this.isCircleActive) return;
    this.streak = 0;
    this.streakText.setText('0');
    this.clearRound();
    this.showFeedback('⏱', '#d97706');
    this.fireAction('TIMEOUT', { level: this.level });
    this.scheduleNextSpawn();
  }

  private clearRound() {
    this.isCircleActive = false;
    this.lifeTimer?.destroy();
    this.lifeTimer = null;
    this.timerBarFill.setVisible(false);
    this.circleContainer?.destroy(); this.circleContainer = null;
    this.distractors.forEach(d => d.destroy()); this.distractors = [];
  }

  // ── Hit juice ─────────────────────────────────────────────────────
  private burstAt(x: number, y: number, color: number) {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + Math.random() * 0.5;
      const dist = Phaser.Math.Between(38, 70);
      const p = this.add.graphics().setDepth(15);
      p.fillStyle(color, 0.9); p.fillCircle(0, 0, Phaser.Math.Between(3, 5));
      p.setPosition(x, y);
      this.tweens.add({
        targets: p, x: x + Math.cos(a) * dist, y: y + Math.sin(a) * dist,
        alpha: 0, scale: 0.4, duration: Phaser.Math.Between(320, 480),
        ease: 'Cubic.easeOut', onComplete: () => p.destroy(),
      });
    }
  }

  private floatScore(x: number, y: number) {
    const t = this.add.text(x, y - 30, '+1', {
      fontSize: '26px', fontFamily: 'Arial Black', color: '#16a34a',
    }).setOrigin(0.5).setDepth(15);
    this.tweens.add({ targets: t, y: y - 70, alpha: 0, duration: 650, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
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

  // ── Update — top timer bar ───────────────────────────────────────
  // The countdown lives ONLY in the top bar. No ring around the target, no
  // urgency wobble on it — nothing in the play area may hint at the answer.
  update() {
    if (!this.isCircleActive) { this.timerBarFill.setVisible(false); return; }
    const progress = Math.max(0, 1 - (Date.now() - this.circleStartTime) / this.cfg.circleLifeMs);
    const color    = progress > 0.5 ? 0x16a34a : progress > 0.25 ? 0xd97706 : 0xe5484d;

    this.timerBarFill.setVisible(true).setFillStyle(color);
    this.timerBarFill.scaleX = progress;
    // urgency pulse on the BAR (not on any shape)
    this.timerBarFill.alpha = progress < 0.25 ? 0.55 + 0.45 * Math.abs(Math.sin(Date.now() * 0.012)) : 1;
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
