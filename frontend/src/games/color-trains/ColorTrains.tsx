import { useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import Phaser from 'phaser';
import type { GameAdjustment } from '../../hooks/useGameSession';
import { getGameLabels, type GameLabels } from '../../data/gameLabels';
import { useLang } from '../../context/LanguageContext';
import './ColorTrains.css';

type TrainsLabels = GameLabels<'colorTracking'>;

// ─── Types ────────────────────────────────────────────────────────

export interface GameAction {
  type: 'ROUND_START' | 'STATION_SELECTED' | 'MISSED_SWITCH' | 'ROUND_END';
  timestamp: number;
  payload: Record<string, unknown>;
}

interface StationConfig {
  id:       string;
  label:    string;        // Hebrew label shown on sign
  colorHex: number;
  cssColor: string;
}

interface GameConfig {
  trainSpeedPx: number;    // pixels per second
  reactionMs:   number;    // window before switch is reached
}

const DEFAULT_CONFIG: GameConfig = { trainSpeedPx: 120, reactionMs: 6000 };

const STATIONS: StationConfig[] = [
  { id: 'red',   label: 'אדום',  colorHex: 0xe53935, cssColor: '#e53935' },
  { id: 'blue',  label: 'כחול',  colorHex: 0x1e88e5, cssColor: '#1e88e5' },
  { id: 'green', label: 'ירוק',  colorHex: 0x43a047, cssColor: '#43a047' },
];

// ─── Scene ────────────────────────────────────────────────────────

class TrainScene extends Phaser.Scene {
  private cfg:      GameConfig = DEFAULT_CONFIG;
  private onAction?: (a: GameAction) => void;
  private onReady?:  (s: TrainScene) => void;

  // Layout
  private W = 960;
  private H = 580;
  private switchX = 0;
  private trackY  = 0;

  // Stations
  private stationY: number[] = [];
  private stationX  = 0;
  private stationBtns: Map<string, Phaser.GameObjects.Container> = new Map();

  // Round state
  private trainContainer:  Phaser.GameObjects.Container | null = null;
  private trainX   = -120;
  private trainPathY = 0;
  private pastSwitch = false;
  private chosenId:  string | null = null;
  private targetId:  string | null = null;
  private roundStart = 0;
  private isActive   = false;

  // Score
  private score = 0;
  private scoreText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private timerBar!:  Phaser.GameObjects.Rectangle;
  private feedbackTx!: Phaser.GameObjects.Text;

  // Localized label refs (updated by applyLabels)
  private trackLabel!:       Phaser.GameObjects.Text;
  private scoreLabel!:       Phaser.GameObjects.Text;
  private instructionLabel!: Phaser.GameObjects.Text;
  private stationLabels:     Map<string, Phaser.GameObjects.Text> = new Map();

  private labels: TrainsLabels = getGameLabels('colorTracking', 'he');

  constructor() { super({ key: 'TrainScene' }); }

  init(data: {
    config?:   Partial<GameConfig>;
    onAction?: (a: GameAction) => void;
    onReady?:  (s: TrainScene) => void;
    labels?:   TrainsLabels;
  }) {
    if (data.config)   this.cfg      = { ...DEFAULT_CONFIG, ...data.config };
    if (data.onAction) this.onAction = data.onAction;
    if (data.onReady)  this.onReady  = data.onReady;
    if (data.labels)   this.labels   = data.labels;
  }

  /** Localize a station id → its current-language colour name. */
  private stationLabel(id: string): string {
    return this.labels[`color_${id}` as keyof TrainsLabels] as string;
  }

  /** Replace localized text on every visible element without disrupting state. */
  applyLabels(labels: TrainsLabels) {
    this.labels = labels;
    this.trackLabel?.setText(labels.track);
    this.scoreLabel?.setText(labels.score);
    this.instructionLabel?.setText(labels.instruction);
    // Station signs
    this.stationLabels.forEach((textObj, id) => {
      textObj.setText(this.stationLabel(id));
    });
    // Round prompt — only update if a round is active so we don't blank it out
    if (this.isActive && this.targetId) {
      this.roundText.setText(
        labels.sendTo.replace('{station}', this.stationLabel(this.targetId)),
      );
    }
  }

  create() {
    this.switchX  = this.W * 0.52;
    this.trackY   = this.H * 0.62;
    this.stationX = this.W * 0.88;
    this.stationY = [this.H * 0.20, this.H * 0.52, this.H * 0.84];

    this.drawBackground();
    this.drawMainTrack();
    this.drawBranchTracks();
    this.drawSwitch();
    this.buildStations();
    this.buildUI();

    this.onReady?.(this);
    this.time.delayedCall(600, () => this.startRound());
  }

  // ── Apply server difficulty update ──────────────────────────────
  // Params are ABSOLUTE target values, buffered and applied at the next
  // round boundary so the current train isn't disrupted mid-flight.
  private pendingParams: GameAdjustment = {};

  applyParams(params: GameAdjustment) {
    Object.assign(this.pendingParams, params);
  }

  private flushPendingParams() {
    const p = this.pendingParams;
    if (typeof p.trainSpeedPx === 'number')
      this.cfg.trainSpeedPx = Phaser.Math.Clamp(p.trainSpeedPx, 60, 280);
    if (typeof p.reactionMs === 'number')
      this.cfg.reactionMs = Phaser.Math.Clamp(p.reactionMs, 2000, 10000);
    this.pendingParams = {};
  }

  // ── Background ──────────────────────────────────────────────────
  private drawBackground() {
    const g = this.add.graphics();
    // Sky
    g.fillGradientStyle(0xbfdbfe, 0xbfdbfe, 0xdbeafe, 0xdbeafe, 1);
    g.fillRect(0, 0, this.W, this.H * 0.68);
    // Ground
    g.fillGradientStyle(0x6b7280, 0x6b7280, 0x4b5563, 0x4b5563, 1);
    g.fillRect(0, this.H * 0.68, this.W, this.H * 0.32);
    // Horizon strip
    this.add.rectangle(this.W / 2, this.H * 0.68, this.W, 6, 0x16a34a);

    // Distant mountains
    const mtn = this.add.graphics();
    mtn.fillStyle(0x93c5fd, 0.35);
    [[80, 0.62, 120], [220, 0.55, 160], [400, 0.58, 140], [600, 0.52, 180], [800, 0.60, 110]]
      .forEach(([x, yf, size]) => {
        mtn.fillTriangle(x as number - size/2, this.H*(yf as number), x as number + size/2, this.H*(yf as number), x as number, this.H*(yf as number) - (size as number)*0.7);
      });

    // Clouds
    [100, 320, 580, 750].forEach((cx, i) => this.drawCloud(cx, 40 + i * 12));
  }

  private drawCloud(x: number, y: number) {
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 0.85);
    g.fillEllipse(x,      y,      70, 28);
    g.fillEllipse(x + 22, y - 8,  50, 24);
    g.fillEllipse(x - 18, y + 2,  44, 20);
  }

  // ── Tracks ──────────────────────────────────────────────────────
  private drawMainTrack() {
    this.drawTrack([{ x: -50, y: this.trackY }, { x: this.switchX, y: this.trackY }]);
  }

  private drawBranchTracks() {
    STATIONS.forEach((_, i) => {
      const endY = this.stationY[i];
      const pts  = this.bezierPoints(this.switchX, this.trackY, this.stationX - 40, endY);
      this.drawTrack(pts);
    });
  }

  private bezierPoints(x0: number, y0: number, x1: number, y1: number): { x: number; y: number }[] {
    const pts: { x: number; y: number }[] = [];
    const cpx0 = x0 + (x1 - x0) * 0.4, cpy0 = y0;
    const cpx1 = x0 + (x1 - x0) * 0.6, cpy1 = y1;
    for (let t = 0; t <= 1; t += 0.025) {
      const mt = 1 - t;
      pts.push({
        x: mt*mt*mt*x0 + 3*mt*mt*t*cpx0 + 3*mt*t*t*cpx1 + t*t*t*x1,
        y: mt*mt*mt*y0 + 3*mt*mt*t*cpy0 + 3*mt*t*t*cpy1 + t*t*t*y1,
      });
    }
    return pts;
  }

  private drawTrack(pts: { x: number; y: number }[]) {
    if (pts.length < 2) return;
    const g = this.add.graphics();
    // Gravel
    g.lineStyle(28, 0x6b7280); g.beginPath();
    pts.forEach((p, i) => i === 0 ? g.moveTo(p.x, p.y) : g.lineTo(p.x, p.y));
    g.strokePath();
    // Ties
    for (let i = 0; i < pts.length - 1; i += 4) {
      const p = pts[i], n = pts[i + 1];
      const ang = Math.atan2(n.y - p.y, n.x - p.x);
      g.fillStyle(0x78350f);
      g.save(); g.translateCanvas(p.x, p.y); g.rotateCanvas(ang);
      g.fillRect(-5, -14, 10, 28); g.restore();
    }
    // Rails
    g.lineStyle(5, 0x374151);
    [-8, 8].forEach(off => {
      g.beginPath();
      pts.forEach((p, i) => {
        const n = pts[Math.min(i + 1, pts.length - 1)];
        const ang = Math.atan2(n.y - p.y, n.x - p.x) + Math.PI / 2;
        const px = p.x + Math.cos(ang) * off, py = p.y + Math.sin(ang) * off;
        i === 0 ? g.moveTo(px, py) : g.lineTo(px, py);
      });
      g.strokePath();
    });
  }

  private drawSwitch() {
    const g = this.add.graphics();
    g.fillStyle(0x1f2937); g.fillRect(this.switchX - 22, this.trackY - 22, 44, 44);
    g.fillStyle(0x374151); g.fillCircle(this.switchX, this.trackY, 16);
    g.fillStyle(0x4b5563); g.fillCircle(this.switchX, this.trackY, 10);
    g.fillStyle(0x6b7280); g.fillCircle(this.switchX, this.trackY, 5);
    this.trackLabel = this.add.text(this.switchX, this.trackY - 34, this.labels.track, {
      fontSize: '11px', fontFamily: 'Arial', color: '#94a3b8', fontStyle: 'bold',
    }).setOrigin(0.5);
  }

  // ── Stations ─────────────────────────────────────────────────────
  private buildStations() {
    STATIONS.forEach((st, i) => {
      const y = this.stationY[i];
      const c = this.add.container(this.stationX, y).setDepth(4);

      // Platform
      const plat = this.add.rectangle(-30, 0, 80, 22, 0xd1d5db).setStrokeStyle(2, 0x9ca3af);
      // Building
      const bld  = this.add.rectangle(30, -8, 70, 80, 0xf9fafb).setStrokeStyle(3, st.colorHex);
      // Color stripe
      const stripe = this.add.rectangle(30, -38, 70, 14, st.colorHex);
      // Windows
      const w1 = this.add.rectangle(18, -10, 16, 22, 0xbae6fd).setStrokeStyle(1, 0x64748b);
      const w2 = this.add.rectangle(42, -10, 16, 22, 0xbae6fd).setStrokeStyle(1, 0x64748b);
      // Door
      const door = this.add.rectangle(30, 14, 18, 32, 0x92400e).setStrokeStyle(2, 0x78350f);
      // Sign
      const sign = this.add.rectangle(30, -52, 68, 22, st.colorHex).setStrokeStyle(2, 0xffffff);
      const lbl  = this.add.text(30, -52, this.stationLabel(st.id), {
        fontSize: '13px', fontFamily: 'Arial Black', color: '#ffffff',
      }).setOrigin(0.5);
      this.stationLabels.set(st.id, lbl);

      c.add([plat, bld, stripe, w1, w2, door, sign, lbl]);
      c.setSize(120, 110);
      c.setInteractive({ useHandCursor: true });

      c.on('pointerover', () => {
        if (this.isActive && !this.pastSwitch && !this.chosenId) {
          bld.setStrokeStyle(5, st.colorHex);
          this.tweens.add({ targets: c, scaleX: 1.04, scaleY: 1.04, duration: 80 });
        }
      });
      c.on('pointerout', () => {
        bld.setStrokeStyle(3, st.colorHex);
        this.tweens.add({ targets: c, scaleX: 1, scaleY: 1, duration: 80 });
      });
      c.on('pointerdown', () => this.onStationClick(st.id));

      this.stationBtns.set(st.id, c);
    });
  }

  // ── UI ────────────────────────────────────────────────────────────
  private buildUI() {
    // Score box
    this.add.rectangle(68, 36, 110, 48, 0xffffff, 0.92).setStrokeStyle(2, 0x3b82f6).setDepth(10);
    this.scoreLabel = this.add.text(68, 20, this.labels.score, { fontSize: '11px', color: '#94a3b8', fontFamily: 'Arial' }).setOrigin(0.5).setDepth(10);
    this.scoreText = this.add.text(68, 42, '0', {
      fontSize: '24px', fontFamily: 'Arial Black', color: '#1d4ed8',
    }).setOrigin(0.5).setDepth(10);

    // Target instruction box
    this.add.rectangle(this.W / 2, 36, 280, 48, 0xffffff, 0.92).setStrokeStyle(2, 0x3b82f6).setDepth(10);
    this.roundText = this.add.text(this.W / 2, 36, '', {
      fontSize: '18px', fontFamily: 'Arial Black', color: '#1e3a8a',
    }).setOrigin(0.5).setDepth(10);

    // Timer bar
    const barW = 260;
    this.add.rectangle(this.W / 2, 68, barW, 12, 0xe2e8f0).setStrokeStyle(1, 0xc7d2fe).setDepth(10);
    this.timerBar = this.add.rectangle(this.W / 2 - barW / 2, 68, barW, 8, 0x3b82f6)
      .setOrigin(0, 0.5).setDepth(10);

    // Bottom hint
    this.add.rectangle(this.W / 2, this.H - 22, 340, 28, 0xffffff, 0.8)
      .setStrokeStyle(1, 0xbfdbfe).setDepth(10);
    this.instructionLabel = this.add.text(this.W / 2, this.H - 22, this.labels.instruction, {
      fontSize: '12px', fontFamily: 'Arial', color: '#475569', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(10);

    // Feedback
    this.feedbackTx = this.add.text(this.W / 2, this.H / 2 - 60, '', {
      fontSize: '64px', fontFamily: 'Arial Black', color: '#fff',
    }).setOrigin(0.5).setAlpha(0).setDepth(20);
  }

  // ── Round ─────────────────────────────────────────────────────────
  private startRound() {
    this.flushPendingParams();
    this.chosenId    = null;
    this.pastSwitch  = false;
    this.isActive    = true;
    this.trainX      = -130;
    this.roundStart  = Date.now();

    const st = Phaser.Utils.Array.GetRandom(STATIONS) as StationConfig;
    this.targetId  = st.id;
    this.trainPathY = this.trackY;

    this.timerBar.setFillStyle(0x3b82f6);
    this.roundText
      .setText(this.labels.sendTo.replace('{station}', this.stationLabel(st.id)))
      .setColor(st.cssColor);

    if (this.trainContainer) { this.trainContainer.destroy(); this.trainContainer = null; }
    this.trainContainer = this.buildTrain(st.colorHex);
    this.trainContainer.setPosition(-130, this.trackY);

    // Reset station visuals
    this.stationBtns.forEach((c, id) => {
      const bld = c.list[1] as Phaser.GameObjects.Rectangle;
      const cfg = STATIONS.find(s => s.id === id)!;
      bld.setStrokeStyle(3, cfg.colorHex);
      c.setScale(1);
    });

    this.emit('ROUND_START', { targetId: st.id, label: st.label });
  }

  private onStationClick(id: string) {
    if (!this.isActive || this.pastSwitch || this.chosenId) return;
    this.chosenId = id;
    const reactionMs = Date.now() - this.roundStart;

    const btn = this.stationBtns.get(id)!;
    const bld = btn.list[1] as Phaser.GameObjects.Rectangle;
    bld.setStrokeStyle(6, 0xfbbf24);

    this.emit('STATION_SELECTED', { chosenId: id, targetId: this.targetId, reactionMs });
  }

  // ── Update ────────────────────────────────────────────────────────
  update(_t: number, delta: number) {
    if (!this.trainContainer || !this.isActive) return;

    const speed = (this.cfg.trainSpeedPx * delta) / 1000;

    if (!this.pastSwitch) {
      this.trainX += speed;
      if (this.trainX >= this.switchX) {
        this.pastSwitch = true;
        if (!this.chosenId) {
          this.emit('MISSED_SWITCH', { targetId: this.targetId });
        }
      }
    } else {
      // Glide toward selected station's Y (or straight if missed)
      const destY = this.chosenId
        ? this.stationY[STATIONS.findIndex(s => s.id === this.chosenId)]
        : this.trackY;

      this.trainX   += speed * 0.85;
      this.trainPathY = Phaser.Math.Linear(this.trainPathY, destY, 0.04);
    }

    this.trainContainer.setPosition(this.trainX, this.trainPathY);

    // Timer bar
    const elapsed  = Date.now() - this.roundStart;
    const progress = Math.max(0, 1 - elapsed / this.cfg.reactionMs);
    this.timerBar.width = 260 * progress;
    this.timerBar.setFillStyle(progress > 0.5 ? 0x3b82f6 : progress > 0.25 ? 0xf59e0b : 0xef4444);

    // Check arrival
    if (this.trainX > this.W + 100) {
      this.isActive = false;
      const correct = this.chosenId === this.targetId;
      if (this.chosenId) {
        if (correct) { this.score++; this.scoreText.setText(String(this.score)); }
        this.showFeedback(correct ? '✓' : '✗', correct ? '#16a34a' : '#dc2626');
      } else {
        this.showFeedback('⚡', '#d97706');
      }
      this.emit('ROUND_END', { correct, chosenId: this.chosenId, targetId: this.targetId, score: this.score });
      this.time.delayedCall(1400, () => this.startRound());
    }
  }

  private showFeedback(text: string, color: string) {
    this.feedbackTx.setText(text).setColor(color).setAlpha(1).setScale(0.4);
    this.tweens.add({ targets: this.feedbackTx, scale: 1.3, duration: 200, ease: 'Back.easeOut' });
    this.tweens.add({ targets: this.feedbackTx, alpha: 0, duration: 350, delay: 500 });
  }

  private emit(type: GameAction['type'], payload: Record<string, unknown>) {
    this.onAction?.({ type, timestamp: Date.now(), payload });
  }

  // ── Train ─────────────────────────────────────────────────────────
  private buildTrain(color: number): Phaser.GameObjects.Container {
    const c = this.add.container(0, 0).setDepth(6);
    const g = this.add.graphics();

    const dark  = this.darken(color, 35);
    const light = this.lighten(color, 40);

    // Tender (coal car)
    g.fillStyle(0x374151); g.fillRoundedRect(-115, -14, 50, 28, 4);
    g.fillStyle(0x1f2937); g.fillEllipse(-90, -8, 38, 14);

    // Connector
    g.fillStyle(0x4b5563); g.fillRect(-62, -4, 14, 8);

    // Boiler
    g.fillStyle(color); g.fillRoundedRect(-46, -22, 90, 44, 10);
    g.lineStyle(3, dark);
    g.strokeCircle(-10, 0, 18); g.strokeCircle(18, 0, 18);
    g.lineStyle(2, light);
    g.beginPath(); g.arc(4, -10, 13, -0.8, 0.8); g.strokePath();

    // Cab
    g.fillStyle(this.darken(color, 15)); g.fillRoundedRect(-50, -20, 42, 40, 5);
    g.fillStyle(0x7dd3fc); // windows
    g.fillRoundedRect(-45, -14, 14, 16, 2);
    g.fillRoundedRect(-27, -14, 14, 16, 2);

    // Smokebox (front)
    g.fillStyle(0x374151); g.fillCircle(48, 0, 20);
    g.fillStyle(0x1f2937); g.fillCircle(48, 0, 14);

    // Chimney
    g.fillStyle(0x1f2937); g.fillRect(20, -38, 14, 18);
    g.fillStyle(0x374151); g.fillRect(16, -42, 22, 6);

    // Steam dome
    g.fillStyle(light); g.fillCircle(0, -28, 10);

    // Headlight glow
    g.fillStyle(0xfef9c3, 0.6); g.fillCircle(62, 0, 10);
    g.fillStyle(0xfef08a); g.fillCircle(60, 0, 6);

    // Cowcatcher
    g.fillStyle(0x6b7280);
    g.fillTriangle(44, 14, 64, 20, 44, 20);

    // Wheels
    [[-90, 16, 9], [-30, 20, 13], [10, 20, 13], [38, 18, 9]].forEach(([wx, wy, r]) => {
      g.fillStyle(0x1f2937); g.fillCircle(wx as number, wy as number, r as number);
      g.fillStyle(0x374151); g.fillCircle(wx as number, wy as number, (r as number) * 0.7);
      g.fillStyle(0x6b7280); g.fillCircle(wx as number, wy as number, (r as number) * 0.25);
    });

    // Connecting rod
    g.lineStyle(3, 0x6b7280); g.lineBetween(-30, 20, 10, 20);

    c.add(g);

    // Smoke particles
    if (!this.textures.exists('smoke_dot')) {
      const pg = this.add.graphics();
      pg.fillStyle(0xffffff); pg.fillCircle(6, 6, 6);
      pg.generateTexture('smoke_dot', 12, 12); pg.destroy();
    }
    const smoke = this.add.particles(0, 0, 'smoke_dot', {
      x: 22, y: -42,
      speed: { min: 15, max: 35 },
      angle: { min: 258, max: 282 },
      scale: { start: 0.22, end: 1.0 },
      alpha: { start: 0.5, end: 0 },
      lifespan: 1100,
      frequency: 100,
      tint: [0xf1f5f9, 0xe2e8f0],
    });
    c.add(smoke);

    return c;
  }

  private darken(color: number, amt: number): number {
    return (Math.max(0, ((color >> 16) & 0xff) - amt) << 16) |
           (Math.max(0, ((color >> 8)  & 0xff) - amt) << 8)  |
            Math.max(0, (color         & 0xff) - amt);
  }
  private lighten(color: number, amt: number): number {
    return (Math.min(255, ((color >> 16) & 0xff) + amt) << 16) |
           (Math.min(255, ((color >> 8)  & 0xff) + amt) << 8)  |
            Math.min(255, (color         & 0xff) + amt);
  }
}

// ─── React Component ──────────────────────────────────────────────

interface ColorTrainsProps {
  config?:     Partial<GameConfig>;
  onAction?:   (action: GameAction) => void;
  adjustment?: GameAdjustment;
  onExit?:     () => void;
}

export default function ColorTrains({ config, onAction, adjustment, onExit }: ColorTrainsProps) {
  const navigate     = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef      = useRef<Phaser.Game | null>(null);
  const sceneRef     = useRef<TrainScene | null>(null);
  const { lang }     = useLang();

  const labels = useMemo(() => getGameLabels('colorTracking', lang), [lang]);

  const handleAction = useCallback((a: GameAction) => { onAction?.(a); }, [onAction]);

  useEffect(() => {
    if (adjustment) sceneRef.current?.applyParams(adjustment);
  }, [adjustment]);

  useEffect(() => {
    sceneRef.current?.applyLabels(labels);
  }, [labels]);

  useEffect(() => {
    if (!containerRef.current) return;
    gameRef.current = new Phaser.Game({
      type:            Phaser.AUTO,
      width:           960,
      height:          580,
      parent:          containerRef.current,
      backgroundColor: '#bfdbfe',
      banner:          false,
      scene:           TrainScene,
    });
    gameRef.current.scene.start('TrainScene', {
      config:   config ?? {},
      onAction: handleAction,
      onReady:  (s: TrainScene) => { sceneRef.current = s; },
      labels,
    });
    return () => {
      gameRef.current?.destroy(true);
      gameRef.current  = null;
      sceneRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="color-trains-game">
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
