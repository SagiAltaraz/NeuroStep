import { useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import Phaser from 'phaser';
import type { GameAdjustment } from '../../hooks/useGameSession';
import './TicTacToe.css';

// ─── Types ────────────────────────────────────────────────────────

export interface GameAction {
  type: 'ROUND_START' | 'MOVE_MADE' | 'GAME_WON' | 'GAME_DRAW';
  timestamp: number;
  payload: Record<string, unknown>;
}

interface GameConfig {
  canvasWidth:  number;
  canvasHeight: number;
  aiDepth:      number; // 1 (easy) – 9 (perfect)
}

const DEFAULT_CONFIG: GameConfig = {
  canvasWidth:  920,
  canvasHeight: 560,
  aiDepth:      3,
};

const MIN_DEPTH = 1;
const MAX_DEPTH = 9;

type Cell = 'X' | 'O' | null;
const PLAYER: 'X' = 'X';
const AI: 'O'     = 'O';

// ─── Phaser Scene ─────────────────────────────────────────────────

class TicTacToeScene extends Phaser.Scene {
  private cfg:      GameConfig = DEFAULT_CONFIG;
  private onAction?: (a: GameAction) => void;
  private onReady?:  (s: TicTacToeScene) => void;

  // Board state
  private board:        Cell[] = Array(9).fill(null);
  private cellTargets:  Phaser.GameObjects.Rectangle[] = [];
  private cellMarks:    (Phaser.GameObjects.Container | null)[] = Array(9).fill(null);
  private isPlayerTurn = true;
  private gameOver     = false;
  private moveStart    = 0;

  // Stats
  private playerWins = 0;
  private aiWins     = 0;
  private draws      = 0;

  // UI
  private playerScoreText!: Phaser.GameObjects.Text;
  private aiScoreText!:     Phaser.GameObjects.Text;
  private drawScoreText!:   Phaser.GameObjects.Text;
  private depthText!:       Phaser.GameObjects.Text;
  private statusText!:      Phaser.GameObjects.Text;
  private feedbackTx!:      Phaser.GameObjects.Text;
  private newRoundBtn!:     Phaser.GameObjects.Container;
  private boardLines!:      Phaser.GameObjects.Graphics;
  private bgStars!:         Phaser.GameObjects.Graphics;

  constructor() { super({ key: 'TicTacToeScene' }); }

  init(data: {
    config?:   Partial<GameConfig>;
    onAction?: (a: GameAction) => void;
    onReady?:  (s: TicTacToeScene) => void;
  }) {
    if (data.config)   this.cfg      = { ...DEFAULT_CONFIG, ...data.config };
    if (data.onAction) this.onAction = data.onAction;
    if (data.onReady)  this.onReady  = data.onReady;
  }

  create() {
    this.createBackground();
    this.createUI();
    this.createBoard();
    this.onReady?.(this);
    this.startRound();
  }

  // ── Apply server adjustment ──────────────────────────────────────
  applyParams(params: GameAdjustment) {
    if (typeof params.aiDepth === 'number') {
      const next = Math.max(MIN_DEPTH, Math.min(MAX_DEPTH, Math.round(this.cfg.aiDepth + params.aiDepth)));
      this.cfg.aiDepth = next;
      this.depthText.setText(this.depthLabel(next));
    }
  }

  // ── Background ──────────────────────────────────────────────────
  private createBackground() {
    const { canvasWidth: W, canvasHeight: H } = this.cfg;

    const bg = this.add.graphics();
    bg.fillGradientStyle(0x0f172a, 0x0f172a, 0x1e1b4b, 0x1e1b4b, 1);
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
    const { canvasWidth: W } = this.cfg;

    // Top bar
    this.add.rectangle(W / 2, 38, W, 76, 0x0f172a, 0.9).setDepth(10);
    this.add.rectangle(W / 2, 76, W, 2, 0x3730a3, 1).setDepth(10);

    // Player score (right side in RTL feel)
    this.add.text(W - 90, 20, 'אתה ✖', { fontSize: '11px', color: '#94a3b8', fontFamily: 'Arial' }).setOrigin(0.5).setDepth(10);
    this.playerScoreText = this.add.text(W - 90, 44, '0', {
      fontSize: '26px', fontFamily: 'Arial Black', color: '#a5b4fc',
    }).setOrigin(0.5).setDepth(10);

    // Draws (center)
    this.add.text(W / 2, 18, 'תיקו', { fontSize: '11px', color: '#94a3b8', fontFamily: 'Arial' }).setOrigin(0.5).setDepth(10);
    this.drawScoreText = this.add.text(W / 2, 40, '0', {
      fontSize: '22px', fontFamily: 'Arial Black', color: '#cbd5e1',
    }).setOrigin(0.5).setDepth(10);
    this.depthText = this.add.text(W / 2, 62, this.depthLabel(this.cfg.aiDepth), {
      fontSize: '11px', fontFamily: 'Arial', color: '#a5b4fc',
    }).setOrigin(0.5).setDepth(10);

    // AI score
    this.add.text(90, 20, 'מחשב ⭕', { fontSize: '11px', color: '#94a3b8', fontFamily: 'Arial' }).setOrigin(0.5).setDepth(10);
    this.aiScoreText = this.add.text(90, 44, '0', {
      fontSize: '26px', fontFamily: 'Arial Black', color: '#fca5a5',
    }).setOrigin(0.5).setDepth(10);

    // Status
    this.statusText = this.add.text(W / 2, this.cfg.canvasHeight - 26, 'התור שלך — בחר משבצת', {
      fontSize: '14px', fontFamily: 'Arial', color: '#94a3b8', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(10);

    // Feedback
    this.feedbackTx = this.add.text(W / 2, this.cfg.canvasHeight / 2, '', {
      fontSize: '64px', fontFamily: 'Arial Black', color: '#fff',
    }).setOrigin(0.5).setAlpha(0).setDepth(25);

    // New round button (hidden by default)
    this.newRoundBtn = this.createButton(W / 2, this.cfg.canvasHeight / 2 + 80, 'סיבוב חדש', () => this.startRound());
    this.newRoundBtn.setVisible(false);
  }

  private depthLabel(depth: number): string {
    if (depth <= 2) return `קל · ${depth}`;
    if (depth <= 5) return `בינוני · ${depth}`;
    if (depth <= 7) return `קשה · ${depth}`;
    return `מומחה · ${depth}`;
  }

  private createButton(x: number, y: number, label: string, onClick: () => void): Phaser.GameObjects.Container {
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
    return c;
  }

  // ── Board ───────────────────────────────────────────────────────
  private createBoard() {
    const { canvasWidth: W, canvasHeight: H } = this.cfg;
    const cellSize = 110;
    const gap      = 8;
    const totalW   = cellSize * 3 + gap * 2;
    const startX   = (W - totalW) / 2 + cellSize / 2;
    const startY   = (H - totalW) / 2 + cellSize / 2 + 6;

    // Board glow background
    const boardBg = this.add.graphics();
    boardBg.fillStyle(0x1e1b4b, 0.55);
    boardBg.fillRoundedRect(startX - cellSize / 2 - 12, startY - cellSize / 2 - 12,
      totalW + 24, totalW + 24, 16);
    boardBg.lineStyle(2, 0x4338ca, 0.4);
    boardBg.strokeRoundedRect(startX - cellSize / 2 - 12, startY - cellSize / 2 - 12,
      totalW + 24, totalW + 24, 16);

    this.boardLines = this.add.graphics().setDepth(7);

    for (let i = 0; i < 9; i++) {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = startX + col * (cellSize + gap);
      const y = startY + row * (cellSize + gap);

      const cell = this.add.rectangle(x, y, cellSize, cellSize, 0x312e81, 0.7);
      cell.setStrokeStyle(2, 0x4338ca, 0.6);
      cell.setInteractive({ useHandCursor: true });
      cell.setDepth(2);
      cell.on('pointerover', () => { if (this.canPlay(i)) cell.setFillStyle(0x4338ca, 0.8); });
      cell.on('pointerout',  () => { if (this.canPlay(i)) cell.setFillStyle(0x312e81, 0.7); });
      cell.on('pointerdown', () => this.onCellClick(i));
      this.cellTargets.push(cell);
    }
  }

  private canPlay(i: number): boolean {
    return !this.gameOver && this.isPlayerTurn && this.board[i] === null;
  }

  // ── Round flow ──────────────────────────────────────────────────
  private startRound() {
    this.board = Array(9).fill(null);
    this.cellMarks.forEach(m => m?.destroy());
    this.cellMarks = Array(9).fill(null);
    this.cellTargets.forEach(c => c.setFillStyle(0x312e81, 0.7));
    this.boardLines.clear();
    this.gameOver = false;
    this.isPlayerTurn = true;
    this.moveStart = Date.now();
    this.statusText.setText('התור שלך — בחר משבצת');
    this.newRoundBtn.setVisible(false);
    this.fireAction('ROUND_START', { aiDepth: this.cfg.aiDepth });
  }

  private onCellClick(i: number) {
    if (!this.canPlay(i)) return;
    const reactionMs = Date.now() - this.moveStart;
    this.placeMark(i, PLAYER);
    this.fireAction('MOVE_MADE', { cell: i, reactionMs, by: 'player' });

    const result = this.checkResult();
    if (result) { this.endGame(result); return; }

    this.isPlayerTurn = false;
    this.statusText.setText('המחשב חושב…');
    this.time.delayedCall(380, () => this.aiMove());
  }

  private aiMove() {
    if (this.gameOver) return;
    const idx = this.pickAiMove();
    if (idx === -1) return;
    this.placeMark(idx, AI);
    this.fireAction('MOVE_MADE', { cell: idx, by: 'ai', aiDepth: this.cfg.aiDepth });

    const result = this.checkResult();
    if (result) { this.endGame(result); return; }

    this.isPlayerTurn = true;
    this.moveStart    = Date.now();
    this.statusText.setText('התור שלך — בחר משבצת');
  }

  private endGame(result: 'X' | 'O' | 'draw') {
    this.gameOver = true;
    this.isPlayerTurn = false;
    if (result === PLAYER) {
      this.playerWins++;
      this.playerScoreText.setText(String(this.playerWins));
      this.showFeedback('ניצחת!', '#a5b4fc');
      this.statusText.setText('כל הכבוד 🎉');
      this.fireAction('GAME_WON', { winner: 'player', aiDepth: this.cfg.aiDepth });
    } else if (result === AI) {
      this.aiWins++;
      this.aiScoreText.setText(String(this.aiWins));
      this.showFeedback('הפסדת', '#fca5a5');
      this.statusText.setText('המחשב ניצח');
      this.fireAction('GAME_WON', { winner: 'ai', aiDepth: this.cfg.aiDepth });
    } else {
      this.draws++;
      this.drawScoreText.setText(String(this.draws));
      this.showFeedback('תיקו', '#cbd5e1');
      this.statusText.setText('המשחק הסתיים בתיקו');
      this.fireAction('GAME_DRAW', { aiDepth: this.cfg.aiDepth });
    }
    this.drawWinningLine(result);
    this.time.delayedCall(700, () => this.newRoundBtn.setVisible(true));
  }

  // ── Mark placement ──────────────────────────────────────────────
  private placeMark(i: number, who: 'X' | 'O') {
    this.board[i] = who;
    const cell = this.cellTargets[i];
    cell.setFillStyle(who === PLAYER ? 0x312e81 : 0x3f1d3a, 0.85);

    const mark = this.add.container(cell.x, cell.y).setDepth(5);
    const g = this.add.graphics();
    if (who === PLAYER) {
      // X
      g.lineStyle(8, 0xa5b4fc, 1);
      g.beginPath(); g.moveTo(-30, -30); g.lineTo(30, 30); g.strokePath();
      g.beginPath(); g.moveTo(30, -30); g.lineTo(-30, 30); g.strokePath();
    } else {
      // O
      g.lineStyle(8, 0xfca5a5, 1);
      g.strokeCircle(0, 0, 32);
    }
    mark.add(g);
    mark.setScale(0);
    this.tweens.add({ targets: mark, scaleX: 1, scaleY: 1, duration: 220, ease: 'Back.easeOut' });
    this.cellMarks[i] = mark;
  }

  // ── Win check ───────────────────────────────────────────────────
  private static LINES = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6],
  ] as const;

  private checkResult(): 'X' | 'O' | 'draw' | null {
    const w = TicTacToeScene.winnerOf(this.board);
    if (w) return w;
    if (this.board.every(c => c !== null)) return 'draw';
    return null;
  }

  private static winnerOf(b: Cell[]): 'X' | 'O' | null {
    for (const [a, c, d] of TicTacToeScene.LINES) {
      if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a] as 'X' | 'O';
    }
    return null;
  }

  private drawWinningLine(result: 'X' | 'O' | 'draw') {
    if (result === 'draw') return;
    for (const [a, c, d] of TicTacToeScene.LINES) {
      const b = this.board;
      if (b[a] && b[a] === b[c] && b[a] === b[d]) {
        const p1 = this.cellTargets[a];
        const p3 = this.cellTargets[d];
        this.boardLines.lineStyle(8, result === PLAYER ? 0x818cf8 : 0xf87171, 0.85);
        this.boardLines.lineBetween(p1.x, p1.y, p3.x, p3.y);
        break;
      }
    }
  }

  // ── AI ──────────────────────────────────────────────────────────
  private pickAiMove(): number {
    const empties = this.board
      .map((v, i) => v === null ? i : -1)
      .filter(i => i !== -1);
    if (empties.length === 0) return -1;

    // Easy difficulty → mostly random
    if (this.cfg.aiDepth <= 1) {
      return empties[Math.floor(Math.random() * empties.length)];
    }
    if (this.cfg.aiDepth === 2 && Math.random() < 0.5) {
      return empties[Math.floor(Math.random() * empties.length)];
    }

    // Minimax with depth limit and alpha-beta pruning
    let bestScore = -Infinity;
    let bestMoves: number[] = [];
    for (const i of empties) {
      this.board[i] = AI;
      const score = this.minimax(this.board, this.cfg.aiDepth - 1, false, -Infinity, Infinity);
      this.board[i] = null;
      if (score > bestScore) {
        bestScore = score;
        bestMoves = [i];
      } else if (score === bestScore) {
        bestMoves.push(i);
      }
    }
    return bestMoves[Math.floor(Math.random() * bestMoves.length)];
  }

  private minimax(board: Cell[], depth: number, isMax: boolean, alpha: number, beta: number): number {
    const w = TicTacToeScene.winnerOf(board);
    if (w === AI)     return 10 + depth;
    if (w === PLAYER) return -10 - depth;
    if (board.every(c => c !== null)) return 0;
    if (depth === 0) return 0;

    if (isMax) {
      let best = -Infinity;
      for (let i = 0; i < 9; i++) {
        if (board[i] !== null) continue;
        board[i] = AI;
        best = Math.max(best, this.minimax(board, depth - 1, false, alpha, beta));
        board[i] = null;
        alpha = Math.max(alpha, best);
        if (beta <= alpha) break;
      }
      return best;
    } else {
      let best = Infinity;
      for (let i = 0; i < 9; i++) {
        if (board[i] !== null) continue;
        board[i] = PLAYER;
        best = Math.min(best, this.minimax(board, depth - 1, true, alpha, beta));
        board[i] = null;
        beta = Math.min(beta, best);
        if (beta <= alpha) break;
      }
      return best;
    }
  }

  // ── Feedback ────────────────────────────────────────────────────
  private showFeedback(text: string, color: string) {
    const { canvasWidth: W, canvasHeight: H } = this.cfg;
    this.feedbackTx.setPosition(W / 2, H / 2 - 70).setText(text).setColor(color)
      .setAlpha(0).setScale(0.4);
    this.tweens.add({ targets: this.feedbackTx, alpha: 1, scale: 1.1, duration: 260, ease: 'Back.easeOut' });
    this.tweens.add({ targets: this.feedbackTx, alpha: 0, duration: 400, delay: 1100 });
  }

  private fireAction(type: GameAction['type'], payload: Record<string, unknown>) {
    this.onAction?.({ type, timestamp: Date.now(), payload });
  }
}

// ─── React Component ──────────────────────────────────────────────

interface TicTacToeProps {
  config?:     Partial<GameConfig>;
  onAction?:   (action: GameAction) => void;
  adjustment?: GameAdjustment;
}

export default function TicTacToe({ config, onAction, adjustment }: TicTacToeProps) {
  const navigate     = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef      = useRef<Phaser.Game | null>(null);
  const sceneRef     = useRef<TicTacToeScene | null>(null);

  const handleAction = useCallback((a: GameAction) => { onAction?.(a); }, [onAction]);

  useEffect(() => {
    if (adjustment) sceneRef.current?.applyParams(adjustment);
  }, [adjustment]);

  useEffect(() => {
    if (!containerRef.current) return;
    const mergedCfg = { ...DEFAULT_CONFIG, ...config };
    gameRef.current = new Phaser.Game({
      type:            Phaser.AUTO,
      width:           mergedCfg.canvasWidth,
      height:          mergedCfg.canvasHeight,
      parent:          containerRef.current,
      backgroundColor: '#0f172a',
      banner:          false,
      scene:           TicTacToeScene,
    });
    gameRef.current.scene.start('TicTacToeScene', {
      config:   mergedCfg,
      onAction: handleAction,
      onReady:  (s: TicTacToeScene) => { sceneRef.current = s; },
    });
    return () => {
      gameRef.current?.destroy(true);
      gameRef.current  = null;
      sceneRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="tictactoe-game">
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
