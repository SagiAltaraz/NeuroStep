import { useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import Phaser from 'phaser';
import './ColorTrains.css';

// =============================================================================
// GAME CONFIGURATION - Ready for Kafka integration
// =============================================================================
export interface GameConfig {
  canvasWidth: number;
  canvasHeight: number;
  trainSpeed: number;
  reactionTimeMs: number;
  stations: StationConfig[];
}

export interface StationConfig {
  id: string;
  name: string;
  color: string;
  colorHex: number;
}

const DEFAULT_CONFIG: GameConfig = {
  canvasWidth: 1100,
  canvasHeight: 700,
  trainSpeed: 80,
  reactionTimeMs: 10000,
  stations: [
    { id: 'red', name: 'Red', color: '#c62828', colorHex: 0xc62828 },
    { id: 'green', name: 'Green', color: '#2e7d32', colorHex: 0x2e7d32 },
    { id: 'blue', name: 'Blue', color: '#1565c0', colorHex: 0x1565c0 },
  ],
};

// =============================================================================
// GAME STATE & ACTIONS - For Kafka integration
// =============================================================================
export interface GameState {
  score: number;
  roundNumber: number;
  currentTrainColor: string | null;
  roundStartTime: number;
  isRoundActive: boolean;
}

export interface GameAction {
  type: 'ROUND_START' | 'STATION_SELECTED' | 'ROUND_END' | 'TIMEOUT' | 'MISSED_SWITCH';
  timestamp: number;
  payload: Record<string, unknown>;
}

// =============================================================================
// TRACK PATH DEFINITIONS
// =============================================================================
interface TrackPath {
  points: { x: number; y: number }[];
  stationId: string | null; // null for dead-end track
}

// =============================================================================
// PHASER SCENE
// =============================================================================
class TrainScene extends Phaser.Scene {
  private config: GameConfig = DEFAULT_CONFIG;

  // Track system
  private trackPaths: TrackPath[] = [];
  private deadEndPath: TrackPath | null = null;
  private switchPointX: number = 0;
  private mainTrackY: number = 0;

  // Train
  private trainContainer: Phaser.GameObjects.Container | null = null;
  private trainPath: { x: number; y: number }[] = [];
  private trainProgress: number = 0;
  private hasPassedSwitch: boolean = false;

  // Stations
  private stationContainers: Map<string, Phaser.GameObjects.Container> = new Map();

  // UI
  private scoreText!: Phaser.GameObjects.Text;
  private timerBar!: Phaser.GameObjects.Rectangle;
  private timerBarBg!: Phaser.GameObjects.Rectangle;
  private feedbackText!: Phaser.GameObjects.Text;
  private warningText!: Phaser.GameObjects.Text;

  // State
  private state: GameState = {
    score: 0,
    roundNumber: 0,
    currentTrainColor: null,
    roundStartTime: 0,
    isRoundActive: false,
  };

  private selectedStationId: string | null = null;
  private onAction?: (action: GameAction) => void;

  constructor() {
    super({ key: 'TrainScene' });
  }

  init(data: { config?: GameConfig; onAction?: (action: GameAction) => void }) {
    if (data.config) this.config = data.config;
    if (data.onAction) this.onAction = data.onAction;
  }

  create() {
    const { canvasWidth: w, canvasHeight: h } = this.config;

    // Switch point is at 55% - closer to stations
    this.mainTrackY = h * 0.5;
    this.switchPointX = w * 0.55;

    this.createBackground();
    this.createTrackSystem();
    this.createStations();
    this.createUI();
    this.startNewRound();
  }

  // ---------------------------------------------------------------------------
  // BACKGROUND - Clean and professional
  // ---------------------------------------------------------------------------
  private createBackground() {
    const { canvasWidth: w, canvasHeight: h } = this.config;

    // Sky gradient - subtle and professional
    const sky = this.add.graphics();
    sky.fillGradientStyle(0xe3f2fd, 0xe3f2fd, 0xbbdefb, 0xbbdefb, 1);
    sky.fillRect(0, 0, w, h * 0.6);

    // Ground - earthy tones
    const ground = this.add.graphics();
    ground.fillGradientStyle(0x8d6e63, 0x8d6e63, 0x6d4c41, 0x6d4c41, 1);
    ground.fillRect(0, h * 0.6, w, h * 0.4);

    // Horizon grass strip
    this.add.rectangle(w / 2, h * 0.6, w, 8, 0x558b2f);

    // Subtle clouds
    this.createCloud(100, 80, 0.6);
    this.createCloud(400, 50, 0.8);
    this.createCloud(700, 70, 0.7);
    this.createCloud(950, 90, 0.5);

    // Distant trees silhouette
    this.createTreeLine();
  }

  private createCloud(x: number, y: number, alpha: number) {
    const cloud = this.add.graphics();
    cloud.fillStyle(0xffffff, alpha);
    cloud.fillEllipse(0, 0, 60, 25);
    cloud.fillEllipse(25, -5, 50, 22);
    cloud.fillEllipse(-20, 3, 40, 20);
    cloud.setPosition(x, y);
  }

  private createTreeLine() {
    const { canvasWidth: w, canvasHeight: h } = this.config;
    const trees = this.add.graphics();
    trees.fillStyle(0x2e7d32, 0.4);

    for (let x = 0; x < w; x += 30) {
      const height = 20 + Math.random() * 30;
      trees.fillTriangle(
        x, h * 0.6,
        x + 15, h * 0.6 - height,
        x + 30, h * 0.6
      );
    }
  }

  // ---------------------------------------------------------------------------
  // TRACK SYSTEM - Switch point closer to stations
  // ---------------------------------------------------------------------------
  private createTrackSystem() {
    const { canvasWidth: w, canvasHeight: h, stations } = this.config;

    const graphics = this.add.graphics();

    // Station positions - on the right side
    const stationYPositions = [h * 0.22, h * 0.5, h * 0.78];
    const stationX = w * 0.92;

    // Create branch tracks to each station
    stations.forEach((station, index) => {
      const stationY = stationYPositions[index];

      const path = this.createBranchPath(stationX - 50, stationY);
      this.trackPaths.push({
        points: path,
        stationId: station.id,
      });

      this.drawTrack(graphics, path);
    });

    // Dead-end track (goes straight off screen)
    const deadEndPath = this.createDeadEndPath();
    this.deadEndPath = {
      points: deadEndPath,
      stationId: null,
    };
    this.drawTrack(graphics, deadEndPath);

    // Main track before switch
    this.drawMainTrack(graphics);

    // Switch junction
    this.drawSwitch(graphics);
  }

  private createBranchPath(endX: number, endY: number): { x: number; y: number }[] {
    const points: { x: number; y: number }[] = [];

    // Start from switch point
    const startX = this.switchPointX;
    const startY = this.mainTrackY;

    // Use smooth S-curve
    const numPoints = 40;
    for (let i = 0; i <= numPoints; i++) {
      const t = i / numPoints;

      // Control points for smooth curve
      const cp1x = startX + (endX - startX) * 0.3;
      const cp1y = startY;
      const cp2x = startX + (endX - startX) * 0.7;
      const cp2y = endY;

      // Cubic bezier
      const mt = 1 - t;
      const x = mt * mt * mt * startX + 3 * mt * mt * t * cp1x + 3 * mt * t * t * cp2x + t * t * t * endX;
      const y = mt * mt * mt * startY + 3 * mt * mt * t * cp1y + 3 * mt * t * t * cp2y + t * t * t * endY;

      points.push({ x, y });
    }

    return points;
  }

  private createDeadEndPath(): { x: number; y: number }[] {
    const { canvasWidth: w } = this.config;
    const points: { x: number; y: number }[] = [];

    // Straight line from switch to off-screen
    for (let x = this.switchPointX; x <= w + 100; x += 5) {
      points.push({ x, y: this.mainTrackY });
    }

    return points;
  }

  private drawMainTrack(graphics: Phaser.GameObjects.Graphics) {
    const points: { x: number; y: number }[] = [];

    // From left edge to switch point
    for (let x = -100; x <= this.switchPointX; x += 5) {
      points.push({ x, y: this.mainTrackY });
    }

    this.drawTrack(graphics, points);
  }

  private drawTrack(graphics: Phaser.GameObjects.Graphics, path: { x: number; y: number }[]) {
    if (path.length < 2) return;

    // Gravel bed
    graphics.lineStyle(32, 0x757575);
    graphics.beginPath();
    graphics.moveTo(path[0].x, path[0].y);
    path.forEach(p => graphics.lineTo(p.x, p.y));
    graphics.strokePath();

    // Ties
    for (let i = 0; i < path.length; i += 5) {
      const p = path[i];
      const next = path[Math.min(i + 1, path.length - 1)];
      const angle = Math.atan2(next.y - p.y, next.x - p.x);

      graphics.save();
      graphics.translateCanvas(p.x, p.y);
      graphics.rotateCanvas(angle);
      graphics.fillStyle(0x5d4037);
      graphics.fillRect(-6, -16, 12, 32);
      graphics.restore();
    }

    // Rails with metallic look
    const railOffset = 8;
    graphics.lineStyle(5, 0x424242);

    // Draw both rails
    [-1, 1].forEach(side => {
      graphics.beginPath();
      for (let i = 0; i < path.length; i++) {
        const p = path[i];
        const next = path[Math.min(i + 1, path.length - 1)];
        const angle = Math.atan2(next.y - p.y, next.x - p.x) + (side * Math.PI / 2);
        const ox = Math.cos(angle) * railOffset;
        const oy = Math.sin(angle) * railOffset;

        if (i === 0) graphics.moveTo(p.x + ox, p.y + oy);
        else graphics.lineTo(p.x + ox, p.y + oy);
      }
      graphics.strokePath();

      // Rail highlight
      graphics.lineStyle(2, 0x9e9e9e);
      graphics.beginPath();
      for (let i = 0; i < path.length; i++) {
        const p = path[i];
        const next = path[Math.min(i + 1, path.length - 1)];
        const angle = Math.atan2(next.y - p.y, next.x - p.x) + (side * Math.PI / 2);
        const ox = Math.cos(angle) * (railOffset - 1);
        const oy = Math.sin(angle) * (railOffset - 1);

        if (i === 0) graphics.moveTo(p.x + ox, p.y + oy);
        else graphics.lineTo(p.x + ox, p.y + oy);
      }
      graphics.strokePath();
      graphics.lineStyle(5, 0x424242);
    });
  }

  private drawSwitch(graphics: Phaser.GameObjects.Graphics) {
    // Switch mechanism - industrial look
    graphics.fillStyle(0x37474f);
    graphics.fillRect(this.switchPointX - 25, this.mainTrackY - 25, 50, 50);

    graphics.fillStyle(0x455a64);
    graphics.fillCircle(this.switchPointX, this.mainTrackY, 18);

    graphics.fillStyle(0x607d8b);
    graphics.fillCircle(this.switchPointX, this.mainTrackY, 12);

    graphics.fillStyle(0x78909c);
    graphics.fillCircle(this.switchPointX, this.mainTrackY, 6);

    // Switch label
    this.add.text(this.switchPointX, this.mainTrackY - 40, 'SWITCH', {
      fontSize: '12px',
      fontFamily: 'Arial, sans-serif',
      color: '#455a64',
      fontStyle: 'bold',
    }).setOrigin(0.5);
  }

  // ---------------------------------------------------------------------------
  // STATIONS - More realistic
  // ---------------------------------------------------------------------------
  private createStations() {
    const { canvasWidth: w, canvasHeight: h, stations } = this.config;

    const stationYPositions = [h * 0.22, h * 0.5, h * 0.78];
    const stationX = w * 0.92;

    stations.forEach((station, index) => {
      const y = stationYPositions[index];
      const container = this.createStation(stationX, y, station);
      this.stationContainers.set(station.id, container);
    });
  }

  private createStation(x: number, y: number, station: StationConfig): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);

    // Platform - concrete look
    const platformShadow = this.add.rectangle(-45, 5, 90, 28, 0x000000, 0.2);
    const platform = this.add.rectangle(-45, 0, 90, 28, 0x9e9e9e);
    platform.setStrokeStyle(2, 0x757575);

    // Yellow safety line
    const safetyLine = this.add.rectangle(-45, -12, 86, 4, 0xffc107);

    // Shelter/canopy
    const canopyPosts = this.add.graphics();
    canopyPosts.fillStyle(0x424242);
    canopyPosts.fillRect(-85, -70, 6, 70);
    canopyPosts.fillRect(-15, -70, 6, 70);

    // Canopy roof
    const canopy = this.add.rectangle(-47, -75, 100, 12, 0x37474f);
    canopy.setStrokeStyle(2, 0x263238);

    // Station building
    const buildingShadow = this.add.rectangle(32, 5, 65, 95, 0x000000, 0.15);

    // Main building with station color
    const building = this.add.rectangle(28, 0, 65, 95, 0xfafafa);
    building.setStrokeStyle(3, station.colorHex);

    // Colored accent stripe
    const accentStripe = this.add.rectangle(28, -35, 65, 12, station.colorHex);

    // Windows - modern style
    const win1 = this.add.rectangle(15, -10, 18, 25, 0x90caf9);
    win1.setStrokeStyle(2, 0x424242);
    const win2 = this.add.rectangle(41, -10, 18, 25, 0x90caf9);
    win2.setStrokeStyle(2, 0x424242);

    // Door
    const door = this.add.rectangle(28, 20, 20, 35, 0x5d4037);
    door.setStrokeStyle(2, 0x4e342e);

    // Station sign
    const signBg = this.add.rectangle(28, -58, 75, 24, station.colorHex);
    signBg.setStrokeStyle(2, 0xffffff);

    const signText = this.add.text(28, -58, station.name.toUpperCase(), {
      fontSize: '14px',
      fontFamily: 'Arial Black, sans-serif',
      color: '#ffffff',
    }).setOrigin(0.5);

    // Platform number
    const platformNum = this.add.text(-45, 0, (this.stationContainers.size + 1).toString(), {
      fontSize: '20px',
      fontFamily: 'Arial Black, sans-serif',
      color: '#424242',
    }).setOrigin(0.5);

    container.add([
      platformShadow, platform, safetyLine,
      canopyPosts, canopy,
      buildingShadow, building, accentStripe,
      win1, win2, door,
      signBg, signText, platformNum
    ]);

    container.setSize(160, 140);
    container.setInteractive({ useHandCursor: true });

    // Hover effect
    container.on('pointerover', () => {
      if (this.state.isRoundActive && !this.hasPassedSwitch && !this.selectedStationId) {
        building.setStrokeStyle(5, station.colorHex);
        this.tweens.add({
          targets: container,
          scaleX: 1.03,
          scaleY: 1.03,
          duration: 100,
        });
      }
    });

    container.on('pointerout', () => {
      building.setStrokeStyle(3, station.colorHex);
      this.tweens.add({
        targets: container,
        scaleX: 1,
        scaleY: 1,
        duration: 100,
      });
    });

    container.on('pointerdown', () => this.handleStationClick(station.id));

    return container;
  }

  // ---------------------------------------------------------------------------
  // TRAIN - Clean design with all elements in container
  // ---------------------------------------------------------------------------
  private createTrain(colorHex: number): Phaser.GameObjects.Container {
    const container = this.add.container(0, 0);
    const elements: Phaser.GameObjects.GameObject[] = [];

    // Helper to add rectangle to container
    const addRect = (x: number, y: number, w: number, h: number, color: number, alpha: number = 1) => {
      const rect = this.add.rectangle(x, y, w, h, color, alpha);
      elements.push(rect);
      return rect;
    };

    // Helper to add circle to container
    const addCircle = (x: number, y: number, r: number, color: number, alpha: number = 1) => {
      const circle = this.add.circle(x, y, r, color, alpha);
      elements.push(circle);
      return circle;
    };

    // === COAL CAR (TENDER) ===
    const tenderX = -70;

    // Tender frame
    addRect(tenderX, 0, 50, 35, 0x2d2d2d);
    addRect(tenderX, 0, 46, 31, 0x404040);

    // Coal
    const coal = this.add.graphics();
    coal.fillStyle(0x1a1a1a);
    coal.fillEllipse(tenderX, -12, 38, 16);
    elements.push(coal);

    // Tender wheels
    this.addWheelToContainer(elements, tenderX - 15, 22, 8);
    this.addWheelToContainer(elements, tenderX + 15, 22, 8);

    // === CONNECTOR ===
    addRect(-40, 2, 12, 6, 0x505050);

    // === LOCOMOTIVE BODY ===

    // Main chassis
    addRect(10, 5, 85, 30, 0x3d3d3d);

    // Main body with color
    addRect(5, -5, 75, 35, colorHex);

    // Body outline
    const bodyOutline = addRect(5, -5, 75, 35, colorHex);
    bodyOutline.setStrokeStyle(2, this.darkenColor(colorHex, 30));
    bodyOutline.setFillStyle(colorHex, 0);

    // === BOILER ===
    const boiler = this.add.graphics();
    // Boiler body
    boiler.fillStyle(colorHex);
    boiler.fillRoundedRect(25, -20, 55, 40, 12);
    // Boiler bands
    boiler.lineStyle(3, this.darkenColor(colorHex, 25));
    boiler.strokeCircle(42, 0, 16);
    boiler.strokeCircle(58, 0, 16);
    // Highlight
    boiler.lineStyle(2, this.lightenColor(colorHex, 35));
    boiler.beginPath();
    boiler.arc(50, -10, 12, -0.8, 0.8);
    boiler.strokePath();
    elements.push(boiler);

    // === SMOKEBOX (front) ===
    addCircle(75, 0, 18, 0x3a3a3a);
    addCircle(75, 0, 14, 0x4a4a4a);
    addCircle(75, 2, 8, 0x2a2a2a);

    // === CHIMNEY ===
    const chimney = this.add.graphics();
    chimney.fillStyle(0x2a2a2a);
    chimney.fillRect(60, -45, 14, 28);
    chimney.fillStyle(0x3a3a3a);
    chimney.fillRect(57, -48, 20, 6);
    chimney.fillStyle(0x4a4a4a);
    chimney.fillRect(55, -52, 24, 5);
    elements.push(chimney);

    // === STEAM DOME ===
    addCircle(35, -28, 10, colorHex);
    addCircle(35, -30, 7, this.lightenColor(colorHex, 25));

    // === CAB ===
    addRect(-25, -8, 38, 42, this.darkenColor(colorHex, 15));
    const cabOutline = addRect(-25, -8, 38, 42, 0x000000, 0);
    cabOutline.setStrokeStyle(2, this.darkenColor(colorHex, 35));

    // Cab roof
    addRect(-25, -32, 44, 7, 0x3a3a3a);

    // Cab windows
    addRect(-33, -12, 12, 16, 0x87ceeb).setStrokeStyle(1, 0x555555);
    addRect(-17, -12, 12, 16, 0x87ceeb).setStrokeStyle(1, 0x555555);

    // === HEADLIGHT ===
    addCircle(88, 0, 6, 0xfffde7);
    addCircle(88, 0, 10, 0xfffde7, 0.3);

    // === COW CATCHER ===
    const cowCatcher = this.add.graphics();
    cowCatcher.fillStyle(0x4a4a4a);
    cowCatcher.beginPath();
    cowCatcher.moveTo(82, 15);
    cowCatcher.lineTo(98, 22);
    cowCatcher.lineTo(82, 22);
    cowCatcher.closePath();
    cowCatcher.fill();
    elements.push(cowCatcher);

    // === WHEELS ===
    // Drive wheels (large)
    this.addWheelToContainer(elements, -5, 24, 12, true);
    this.addWheelToContainer(elements, 25, 24, 12, true);

    // Front wheel (small)
    this.addWheelToContainer(elements, 60, 24, 8);

    // Connecting rod
    const rod = this.add.graphics();
    rod.lineStyle(3, 0x606060);
    rod.lineBetween(-5, 24, 25, 24);
    elements.push(rod);

    // Add all elements to container
    container.add(elements);

    // === SMOKE PARTICLES ===
    this.createSmokeEffect(container);

    return container;
  }

  private addWheelToContainer(
    elements: Phaser.GameObjects.GameObject[],
    x: number, y: number, radius: number,
    hasSpokes: boolean = false
  ) {
    // Shadow
    elements.push(this.add.circle(x + 2, y + 2, radius, 0x000000, 0.25));

    // Outer rim
    const rim = this.add.circle(x, y, radius, 0x3a3a3a);
    rim.setStrokeStyle(2, 0x2a2a2a);
    elements.push(rim);

    // Inner wheel
    elements.push(this.add.circle(x, y, radius * 0.7, 0x4a4a4a));

    // Hub
    elements.push(this.add.circle(x, y, radius * 0.25, 0x5a5a5a));

    if (hasSpokes) {
      const spokes = this.add.graphics();
      spokes.lineStyle(2, 0x5a5a5a);
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2;
        spokes.lineBetween(
          x, y,
          x + Math.cos(angle) * radius * 0.65,
          y + Math.sin(angle) * radius * 0.65
        );
      }
      elements.push(spokes);
    }
  }

  private createSmokeEffect(container: Phaser.GameObjects.Container) {
    // Create smoke texture if not exists
    if (!this.textures.exists('smoke')) {
      const graphics = this.add.graphics();
      graphics.fillStyle(0xffffff);
      graphics.fillCircle(8, 8, 8);
      graphics.generateTexture('smoke', 16, 16);
      graphics.destroy();
    }

    const particles = this.add.particles(0, 0, 'smoke', {
      x: 67,
      y: -55,
      speed: { min: 15, max: 40 },
      angle: { min: 255, max: 285 },
      scale: { start: 0.25, end: 1.2 },
      alpha: { start: 0.5, end: 0 },
      lifespan: 1200,
      frequency: 120,
      tint: [0xfafafa, 0xf0f0f0, 0xe5e5e5],
    });

    container.add(particles);
  }

  private lightenColor(color: number, amount: number): number {
    const r = Math.min(255, ((color >> 16) & 0xff) + amount);
    const g = Math.min(255, ((color >> 8) & 0xff) + amount);
    const b = Math.min(255, (color & 0xff) + amount);
    return (r << 16) | (g << 8) | b;
  }

  private darkenColor(color: number, amount: number): number {
    const r = Math.max(0, ((color >> 16) & 0xff) - amount);
    const g = Math.max(0, ((color >> 8) & 0xff) - amount);
    const b = Math.max(0, (color & 0xff) - amount);
    return (r << 16) | (g << 8) | b;
  }

  // ---------------------------------------------------------------------------
  // UI
  // ---------------------------------------------------------------------------
  private createUI() {
    const { canvasWidth: w, canvasHeight: h } = this.config;

    // Score panel - top left
    const scorePanel = this.add.rectangle(90, 35, 140, 50, 0xffffff, 0.95);
    scorePanel.setStrokeStyle(3, 0x1976d2);

    this.add.text(90, 20, 'SCORE', {
      fontSize: '12px',
      fontFamily: 'Arial, sans-serif',
      color: '#757575',
    }).setOrigin(0.5);

    this.scoreText = this.add.text(90, 42, '0', {
      fontSize: '28px',
      fontFamily: 'Arial Black, sans-serif',
      color: '#1976d2',
    }).setOrigin(0.5);

    // Timer bar - top center
    const timerWidth = 300;
    this.timerBarBg = this.add.rectangle(w / 2, 35, timerWidth, 20, 0xe0e0e0);
    this.timerBarBg.setStrokeStyle(2, 0x9e9e9e);

    this.timerBar = this.add.rectangle(w / 2 - timerWidth / 2, 35, timerWidth, 16, 0x4caf50);
    this.timerBar.setOrigin(0, 0.5);

    this.add.text(w / 2, 55, 'TIME REMAINING', {
      fontSize: '10px',
      fontFamily: 'Arial, sans-serif',
      color: '#757575',
    }).setOrigin(0.5);

    // Warning text
    this.warningText = this.add.text(w / 2, h / 2 - 80, '', {
      fontSize: '24px',
      fontFamily: 'Arial Black, sans-serif',
      color: '#f44336',
    }).setOrigin(0.5).setAlpha(0);

    // Feedback text
    this.feedbackText = this.add.text(w / 2, h / 2, '', {
      fontSize: '48px',
      fontFamily: 'Arial Black, sans-serif',
      color: '#1a365d',
    }).setOrigin(0.5).setAlpha(0);

    // Instructions at bottom
    this.add.rectangle(w / 2, h - 30, 450, 40, 0xffffff, 0.9).setStrokeStyle(2, 0x90a4ae);
    this.add.text(w / 2, h - 30, 'Click the station matching the train color before the switch!', {
      fontSize: '14px',
      fontFamily: 'Arial, sans-serif',
      color: '#455a64',
      fontStyle: 'bold',
    }).setOrigin(0.5);
  }

  // ---------------------------------------------------------------------------
  // GAME LOGIC
  // ---------------------------------------------------------------------------
  private startNewRound() {
    const station = Phaser.Utils.Array.GetRandom(this.config.stations);

    this.state.roundNumber++;
    this.state.currentTrainColor = station.id;
    this.state.roundStartTime = Date.now();
    this.state.isRoundActive = true;
    this.selectedStationId = null;
    this.hasPassedSwitch = false;

    // Reset timer bar
    this.timerBar.setFillStyle(0x4caf50);
    this.timerBar.width = 300;

    // Create train
    this.trainContainer = this.createTrain(station.colorHex);
    this.trainContainer.setPosition(-180, this.mainTrackY);

    // Start on main track (before switch)
    this.trainPath = [];
    for (let x = -180; x <= this.switchPointX; x += 5) {
      this.trainPath.push({ x, y: this.mainTrackY });
    }
    this.trainProgress = 0;

    this.emitAction({
      type: 'ROUND_START',
      timestamp: Date.now(),
      payload: {
        roundNumber: this.state.roundNumber,
        trainColor: station.id,
      },
    });

    // Reset station visuals
    this.stationContainers.forEach((container, id) => {
      const building = container.list[6] as Phaser.GameObjects.Rectangle;
      const stationConfig = this.config.stations.find(s => s.id === id);
      if (stationConfig) {
        building.setStrokeStyle(3, stationConfig.colorHex);
      }
      container.setScale(1);
    });
  }

  private handleStationClick(stationId: string) {
    if (!this.state.isRoundActive || this.hasPassedSwitch || this.selectedStationId) return;

    this.selectedStationId = stationId;
    const reactionTime = Date.now() - this.state.roundStartTime;

    // Highlight selected station
    const container = this.stationContainers.get(stationId);
    if (container) {
      const building = container.list[6] as Phaser.GameObjects.Rectangle;
      building.setStrokeStyle(6, 0xffd700);
    }

    this.emitAction({
      type: 'STATION_SELECTED',
      timestamp: Date.now(),
      payload: {
        roundNumber: this.state.roundNumber,
        selectedStation: stationId,
        correctStation: this.state.currentTrainColor,
        reactionTimeMs: reactionTime,
      },
    });
  }

  private handleSwitchReached() {
    this.hasPassedSwitch = true;

    if (this.selectedStationId) {
      // Switch to selected track
      const selectedPath = this.trackPaths.find(p => p.stationId === this.selectedStationId);
      if (selectedPath) {
        this.trainPath = [...this.trainPath, ...selectedPath.points];
      }
    } else {
      // No selection - go to dead end
      this.emitAction({
        type: 'MISSED_SWITCH',
        timestamp: Date.now(),
        payload: {
          roundNumber: this.state.roundNumber,
          trainColor: this.state.currentTrainColor,
        },
      });

      if (this.deadEndPath) {
        this.trainPath = [...this.trainPath, ...this.deadEndPath.points];
      }

      // Show warning
      this.warningText.setText('NO SELECTION!');
      this.warningText.setAlpha(1);
      this.tweens.add({
        targets: this.warningText,
        alpha: 0,
        duration: 1500,
      });
    }
  }

  private endRound(correct: boolean | null) {
    this.state.isRoundActive = false;

    if (correct === true) {
      this.state.score++;
      this.scoreText.setText(this.state.score.toString());
      this.showFeedback('CORRECT!', '#4caf50');
    } else if (correct === false) {
      this.showFeedback('WRONG!', '#f44336');
    } else {
      // null = missed switch (dead end)
      this.showFeedback('MISSED!', '#ff9800');
    }

    this.emitAction({
      type: 'ROUND_END',
      timestamp: Date.now(),
      payload: {
        roundNumber: this.state.roundNumber,
        correct,
        score: this.state.score,
        selectedStation: this.selectedStationId,
        correctStation: this.state.currentTrainColor,
      },
    });

    this.time.delayedCall(2000, () => {
      if (this.trainContainer) {
        this.trainContainer.destroy();
        this.trainContainer = null;
      }
      this.startNewRound();
    });
  }

  private showFeedback(text: string, color: string) {
    this.feedbackText.setText(text);
    this.feedbackText.setColor(color);
    this.feedbackText.setAlpha(1);
    this.feedbackText.setScale(0.5);

    this.tweens.add({
      targets: this.feedbackText,
      scale: 1,
      duration: 200,
      ease: 'Back.easeOut',
    });

    this.tweens.add({
      targets: this.feedbackText,
      alpha: 0,
      duration: 500,
      delay: 1200,
    });
  }

  private emitAction(action: GameAction) {
    if (this.onAction) {
      this.onAction(action);
    }
  }

  // ---------------------------------------------------------------------------
  // UPDATE LOOP
  // ---------------------------------------------------------------------------
  update(_time: number, delta: number) {
    if (!this.trainContainer || !this.state.isRoundActive) return;

    // Move train
    const speed = (this.config.trainSpeed * delta) / 1000;
    this.trainProgress += speed;

    // Find position on path
    let totalDist = 0;
    let currentPos = this.trainPath[0];
    let nextPos = this.trainPath[Math.min(1, this.trainPath.length - 1)];

    for (let i = 0; i < this.trainPath.length - 1; i++) {
      const p1 = this.trainPath[i];
      const p2 = this.trainPath[i + 1];
      const segDist = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);

      if (totalDist + segDist >= this.trainProgress) {
        const t = (this.trainProgress - totalDist) / segDist;
        currentPos = {
          x: p1.x + (p2.x - p1.x) * t,
          y: p1.y + (p2.y - p1.y) * t,
        };
        nextPos = p2;
        break;
      }
      totalDist += segDist;
      currentPos = p2;
      nextPos = this.trainPath[Math.min(i + 2, this.trainPath.length - 1)];
    }

    // Position train
    this.trainContainer.setPosition(currentPos.x, currentPos.y);
    const angle = Math.atan2(nextPos.y - currentPos.y, nextPos.x - currentPos.x);
    this.trainContainer.setRotation(angle);

    // Check if reached switch point
    if (!this.hasPassedSwitch && currentPos.x >= this.switchPointX - 10) {
      this.handleSwitchReached();
    }

    // Update timer bar
    const elapsed = Date.now() - this.state.roundStartTime;
    const progress = Math.max(0, 1 - elapsed / this.config.reactionTimeMs);
    this.timerBar.width = 300 * progress;

    if (progress < 0.3) {
      this.timerBar.setFillStyle(0xf44336);
    } else if (progress < 0.6) {
      this.timerBar.setFillStyle(0xffc107);
    }

    // Check end conditions
    if (this.hasPassedSwitch) {
      // Check if reached station or dead end
      const endPoint = this.trainPath[this.trainPath.length - 1];
      const distToEnd = Math.sqrt(
        (currentPos.x - endPoint.x) ** 2 + (currentPos.y - endPoint.y) ** 2
      );

      if (distToEnd < 20) {
        if (this.selectedStationId) {
          const correct = this.selectedStationId === this.state.currentTrainColor;
          this.endRound(correct);
        } else {
          // Dead end reached
          this.endRound(null);
        }
      }
    }
  }

  public getState(): GameState {
    return { ...this.state };
  }
}

// =============================================================================
// REACT COMPONENT
// =============================================================================
interface ColorTrainsProps {
  config?: Partial<GameConfig>;
  onAction?: (action: GameAction) => void;
}

export default function ColorTrains({ config, onAction }: ColorTrainsProps) {
  const navigate = useNavigate();
  const gameRef = useRef<HTMLDivElement>(null);
  const gameInstance = useRef<Phaser.Game | null>(null);

  const mergedConfig: GameConfig = {
    ...DEFAULT_CONFIG,
    ...config,
    stations: config?.stations || DEFAULT_CONFIG.stations,
  };

  const handleAction = useCallback((action: GameAction) => {
    if (onAction) {
      onAction(action);
    }
  }, [onAction]);

  useEffect(() => {
    if (!gameRef.current) return;

    gameInstance.current = new Phaser.Game({
      type: Phaser.AUTO,
      width: mergedConfig.canvasWidth,
      height: mergedConfig.canvasHeight,
      parent: gameRef.current,
      backgroundColor: '#e3f2fd',
      scene: TrainScene,
    });

    gameInstance.current.scene.start('TrainScene', {
      config: mergedConfig,
      onAction: handleAction,
    });

    return () => {
      if (gameInstance.current) {
        gameInstance.current.destroy(true);
        gameInstance.current = null;
      }
    };
  }, []);

  return (
    <div className="color-trains-game">
      <div className="game-back-row" dir="rtl">
        <button
          onClick={() => navigate('/games')}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-100 transition-colors duration-200"
        >
          <ChevronRight size={14} />
          חזור
        </button>
      </div>
      <div ref={gameRef} className="game-canvas" />
    </div>
  );
}
