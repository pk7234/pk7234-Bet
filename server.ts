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
    // Improved logic for house edge and excitement balance
    if (r < 0.08) return 1.0; // 8% instant crash
    if (r < 0.6) return 1.0 + Math.random() * 1.6; // High frequency low crash (1x - 2.6x)
    if (r < 0.95) return 2.0 + Math.pow(Math.random(), 1.5) * 15; // Mid crash (2x - 17x)
    return 15.0 + Math.pow(Math.random(), 2.5) * 85; // Rare high fly (15x - 100x)
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
