import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Game Logic
  enum GameStatus {
    WAITING = 'WAITING',
    FLYING = 'FLYING',
    CRASHED = 'CRASHED',
  }

  interface GameState {
    status: GameStatus;
    currentMultiplier: number;
    startTime: number;
    crashPoint: number;
    history: number[];
    timer: number;
  }

  let state: GameState = {
    status: GameStatus.WAITING,
    currentMultiplier: 1.0,
    startTime: Date.now(),
    crashPoint: 0,
    history: [],
    timer: 5, // 5 seconds betting time (sync with client)
  };

  function generateCrashPoint() {
    const r = Math.random();
    // 72% house advantage logic (28% win rate)
    if (r < 0.20) return 1.00; // 20% instant crash
    if (r < 0.72) return Math.floor((1.01 + Math.random() * 0.49) * 100) / 100; // 52% crash under 1.50x
    
    // Remaining 28% are mid-to-high rounds
    if (r < 0.94) return Math.floor((1.51 + Math.pow(Math.random(), 2) * 8) * 100) / 100; 
    return Math.floor((8.0 + Math.pow(Math.random(), 3) * 92) * 100) / 100;
  }

  function gameLoop() {
    const now = Date.now();

    if (state.status === GameStatus.WAITING) {
      state.timer = Math.max(0, 5 - Math.floor((now - state.startTime) / 1000));
      if (state.timer === 0) {
        state.status = GameStatus.FLYING;
        state.startTime = now;
        state.crashPoint = generateCrashPoint();
        state.currentMultiplier = 1.0;
      }
    } else if (state.status === GameStatus.FLYING) {
      const elapsedSeconds = (now - state.startTime) / 1000;
      // Real Aviator growth: 1.08 base for faster gameplay
      state.currentMultiplier = Math.floor(Math.pow(1.08, elapsedSeconds) * 100) / 100;
      
      if (state.currentMultiplier >= state.crashPoint) {
        state.currentMultiplier = state.crashPoint;
        state.status = GameStatus.CRASHED;
        state.startTime = now;
        state.history = [state.crashPoint, ...state.history];
        if (state.history.length >= 50) {
          state.history = [];
        }
      }
    } else if (state.status === GameStatus.CRASHED) {
      state.timer = Math.max(0, 3 - Math.floor((now - state.startTime) / 1000));
      if (state.timer === 0) {
        state.status = GameStatus.WAITING;
        state.startTime = now;
        state.currentMultiplier = 1.0;
      }
    }
  }

  setInterval(gameLoop, 33); // 30 FPS for high-speed responsiveness

  app.get('/api/game-state', (req, res) => {
    res.json(state);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
