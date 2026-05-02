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
    timer: 10, // 10 seconds betting time
  };

  function generateCrashPoint() {
    // Standard Aviator/Crash Algorithm
    // Lower chance for high multipliers, 3% house edge
    const r = Math.random();
    if (r < 0.03) return 1.0; // 3% chance of instant crash at 1.00
    const crash = 0.99 / (1 - Math.random());
    return Math.max(1, Math.floor(crash * 100) / 100);
  }

  function gameLoop() {
    const now = Date.now();

    if (state.status === GameStatus.WAITING) {
      state.timer = Math.max(0, 10 - Math.floor((now - state.startTime) / 1000));
      if (state.timer === 0) {
        state.status = GameStatus.FLYING;
        state.startTime = now;
        state.crashPoint = generateCrashPoint();
        state.currentMultiplier = 1.0;
      }
    } else if (state.status === GameStatus.FLYING) {
      const elapsedSeconds = (now - state.startTime) / 1000;
      // Real Aviator growth: starts slow, accelerates slightly
      // Standard formula: multiplier = 1.00 * e^(0.1 * t)
      state.currentMultiplier = Math.floor(Math.pow(Math.E, 0.12 * elapsedSeconds) * 100) / 100;
      
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

  setInterval(gameLoop, 100);

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
