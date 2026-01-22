// ColorTrains.tsx
import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import './ColorTrains.css';

interface Station {
  name: string;
  color: number;
  y: number;
}

const stations: Station[] = [
  { name: 'אדום', color: 0xef4444, y: 140 },
  { name: 'ירוק', color: 0x22c55e, y: 300 },
  { name: 'כחול', color: 0x3b82f6, y: 460 },
];

const CONFIG = {
  width: 800,
  height: 600,
  speed: 140,
  reactionTimeMs: 8000,
} as const;

class TrainScene extends Phaser.Scene {
  private train: Phaser.GameObjects.Container | null = null;
  private stationContainers: Phaser.GameObjects.Container[] = [];
  private score = 0;
  private scoreText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private currentColor = '';
  private spawnTime = 0;
  private answered = false;
  private chosenIndex = -1;

  constructor() {
    super({ key: 'TrainScene' });
  }

  create() {
    // רקע
    this.add.rectangle(0, 0, CONFIG.width, CONFIG.height, 0x0f172a).setOrigin(0);

    // פסי רכבת אמיתיים (שני מסילות + קשירות)
    this.createTracks();

    this.createStations();
    this.createUI();
    this.spawnTrain();
  }

  private createTracks() {
    const graphics = this.add.graphics();
    graphics.lineStyle(8, 0x4b5563, 1);

    // מסילה שמאל
    graphics.lineBetween(50, 290, 750, 290);
    // מסילה ימין
    graphics.lineBetween(50, 310, 750, 310);

    // קשירות (ties)
    graphics.lineStyle(4, 0x374151, 1);
    for (let x = 60; x < 780; x += 35) {
      graphics.lineBetween(x, 285, x, 325);
    }
  }

  private createStations() {
    stations.forEach((station, i) => {
      const cont = this.add.container(720, station.y);

      // פלטפורמה ארוכה
      const platform = this.add.rectangle(0, 20, 220, 60, 0x9ca3af)
        .setStrokeStyle(3, 0x6b7280);

      // גג עם עמודים
      const roofGraphics = this.add.graphics();
      roofGraphics.fillStyle(0x334155);
      roofGraphics.fillRect(-110, -60, 220, 40);
      roofGraphics.lineStyle(4, 0x475569, 1);
      roofGraphics.lineBetween(-100, -20, -100, 20);
      roofGraphics.lineBetween(-20, -20, -20, 20);
      roofGraphics.lineBetween(60, -20, 60, 20);

      // בלוק צבע גדול על הגג
      const colorBlock = this.add.rectangle(0, -40, 140, 70, station.color)
        .setStrokeStyle(4, 0xffffff);

      // שם תחנה
      const label = this.add.text(0, 50, station.name, {
        fontSize: '26px',
        color: '#ffffff',
        fontStyle: 'bold',
      }).setOrigin(0.5);

      cont.add([platform, roofGraphics, colorBlock, label]);
      cont.setSize(220, 140);
      cont.setInteractive({ useHandCursor: true });

      cont.on('pointerdown', () => this.selectStation(i));
      cont.on('pointerover', () => platform.setStrokeStyle(5, 0xffffff));
      cont.on('pointerout', () => platform.setStrokeStyle(3, 0x6b7280));

      this.stationContainers.push(cont);
    });
  }

  private createUI() {
    this.scoreText = this.add.text(30, 25, 'ניקוד: 0', {
      fontSize: '28px',
      color: '#e0f2fe',
      fontStyle: 'bold',
    }).setDepth(10);

    this.timerText = this.add.text(580, 25, 'זמן: 8', {
      fontSize: '28px',
      color: '#cbd5e1',
      fontStyle: 'bold',
    }).setDepth(10);
  }

  private spawnTrain() {
    const station = Phaser.Utils.Array.GetRandom(stations);
    this.currentColor = station.name;
    this.spawnTime = 0; // יתעדכן ב-update ראשון
    this.answered = false;
    this.chosenIndex = -1;

    this.train = this.add.container(-150, 300);

    // קטר אמיתי יותר (חלק קדמי משולש)
    const locoFront = this.add.graphics();
    locoFront.fillStyle(station.color);
    locoFront.fillTriangle(-120, 0, -70, -25, -70, 25);
    locoFront.lineStyle(3, 0xffffff, 1);
    locoFront.strokeTriangle(-120, 0, -70, -25, -70, 25);

    const locoBody = this.add.rectangle(-60, 0, 110, 65, station.color)
      .setStrokeStyle(3, 0xffffff);
    const locoWindow = this.add.rectangle(-40, -18, 50, 30, 0x93c5fd);

    // קרון ראשון
    const car1Body = this.add.rectangle(60, 0, 130, 65, station.color)
      .setStrokeStyle(3, 0xffffff);
    const car1Win1 = this.add.rectangle(20, -18, 35, 30, 0x93c5fd);
    const car1Win2 = this.add.rectangle(70, -18, 35, 30, 0x93c5fd);
    const car1Door = this.add.rectangle(100, 0, 20, 40, 0x6b7280);

    // גלגלים מפורטים
    const wheelColor = 0x1f2937;
    const wheelStroke = 0x6b7280;
    const wheels = [
      this.add.circle(-110, 35, 18, wheelColor).setStrokeStyle(3, wheelStroke),
      this.add.circle(-30, 35, 18, wheelColor).setStrokeStyle(3, wheelStroke),
      this.add.circle(30, 35, 18, wheelColor).setStrokeStyle(3, wheelStroke),
      this.add.circle(90, 35, 18, wheelColor).setStrokeStyle(3, wheelStroke),
      this.add.circle(140, 35, 18, wheelColor).setStrokeStyle(3, wheelStroke),
    ];

    this.train.add([
      locoFront, locoBody, locoWindow,
      car1Body, car1Win1, car1Win2, car1Door,
      ...wheels,
    ]);

    // סיבוב גלגלים
    this.tweens.add({
      targets: wheels,
      angle: 360,
      duration: 1000,
      repeat: -1,
      ease: 'Linear',
    });

    // טיימר כשלון
    this.time.delayedCall(CONFIG.reactionTimeMs, () => {
      if (!this.answered) this.finishRound(false);
    });
  }

  update(time: number, delta: number) {
    if (!this.train) return;

    // עדכון זמן spawn בפעם ראשונה
    if (this.spawnTime === 0) this.spawnTime = time;

    this.train.x += (CONFIG.speed * delta) / 1000;

    if (this.chosenIndex >= 0) {
      const targetY = stations[this.chosenIndex].y;
      this.train.y = Phaser.Math.Linear(this.train.y, targetY, 0.08);

      if (this.train.x >= 680) {
        const isCorrect = stations[this.chosenIndex].name === this.currentColor;
        this.finishRound(isCorrect);
        return;
      }
    }

    if (this.train.x > 900) {
      this.finishRound(false);
      return;
    }

    // טיימר
    const elapsed = time - this.spawnTime;
    const remaining = Math.max(0, Math.ceil((CONFIG.reactionTimeMs - elapsed) / 1000));
    this.timerText.setText(`זמן: ${remaining}`);
  }

  private selectStation(index: number) {
    if (this.answered) return;
    this.answered = true;
    this.chosenIndex = index;

    const platform = this.stationContainers[index].list[0] as Phaser.GameObjects.Rectangle;
    platform.setStrokeStyle(5, 0xffffff);
  }

  private finishRound(correct: boolean) {
    if (correct) {
      this.score++;
      this.scoreText.setText(`ניקוד: ${this.score}`);
    }

    this.train?.destroy();
    this.train = null;
    this.spawnTime = 0;

    this.time.delayedCall(1000, () => this.spawnTrain());
  }
}

export default function ColorTrains() {
  const gameRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!gameRef.current) return;

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      width: CONFIG.width,
      height: CONFIG.height,
      parent: gameRef.current,
      scene: TrainScene,
      backgroundColor: '#0f172a',
    });

    return () => {
      game.destroy(true);
    };
  }, []);

  return (
    <div className="game-wrapper">
      <h1>רכבות הצבעים</h1>
      <div ref={gameRef} className="game-canvas" />
      <p>לחץ על התחנה המתאימה לצבע הרכבת</p>
    </div>
  );
}