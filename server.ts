import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Firebase Setup
const firebaseConfig = {
  apiKey: "AIzaSyDaop8dIauOmuiQn5tAFnRS9yflmHgYdWU",
  authDomain: "aviator-fe35c.firebaseapp.com",
  projectId: "aviator-fe35c",
  storageBucket: "aviator-fe35c.firebasestorage.app",
  messagingSenderId: "107662801014",
  appId: "1:107662801014:web:f4ca9571e5ae65229b8757",
  measurementId: "G-T5J56RV4SD"
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

console.log("Firebase initialized for server. Project ID:", firebaseConfig.projectId);

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
    timer: 5,
  };

  // Load initial state from Firestore
  try {
    const stateSnap = await getDoc(doc(db, "game", "state"));
    if (stateSnap.exists()) {
      const data = stateSnap.data();
      
      const toNum = (val: any) => {
        if (!val) return Date.now();
        if (typeof val === 'number') return val;
        if (val.toMillis) return val.toMillis();
        if (val.seconds) return val.seconds * 1000;
        return Date.now();
      };

      state = {
        ...state,
        status: (data.status as GameStatus) || GameStatus.WAITING,
        history: data.history || [],
        startTime: toNum(data.startTime),
        crashPoint: data.crashPoint || 0,
        timer: data.timer || 0,
        currentMultiplier: data.currentMultiplier || 1.0
      };
      
      const now = Date.now();
      if (now - state.startTime > 60000) {
        state.status = GameStatus.WAITING;
        state.startTime = now;
      }

      console.log("Restored game state from Firestore:", state.status, "History:", state.history.length);
    }
  } catch (e) {
    console.error("Failed to restore state:", e);
  }

  function generateCrashPoint() {
    const r = Math.random();
    if (r < 0.15) return 1.00;
    if (r < 0.65) return Math.floor((1.01 + Math.random() * 0.79) * 100) / 100;
    
    if (r < 0.90) return Math.floor((1.81 + Math.pow(Math.random(), 2) * 15) * 100) / 100; 
    return Math.floor((15.0 + Math.pow(Math.random(), 4) * 85) * 100) / 100;
  }

  async function gameLoop() {
    try {
      const now = Date.now();
      let needsSync = false;

      if (state.status === GameStatus.WAITING) {
        const elapsed = (now - state.startTime) / 1000;
        if (elapsed >= 4) { // 4s wait
          state.status = GameStatus.FLYING;
          state.startTime = now;
          state.crashPoint = generateCrashPoint();
          state.currentMultiplier = 1.0;
          needsSync = true;
        }
      } else if (state.status === GameStatus.FLYING) {
        const elapsedSeconds = (now - state.startTime) / 1000;
        state.currentMultiplier = Math.floor(Math.pow(1.08, elapsedSeconds) * 100) / 100;
        
        if (state.currentMultiplier >= state.crashPoint) {
          state.currentMultiplier = state.crashPoint;
          state.status = GameStatus.CRASHED;
          state.startTime = now;
          
          if (state.history.length === 0 || state.history[0] !== state.crashPoint) {
            state.history = [state.crashPoint, ...state.history].slice(0, 50);
          }
          
          needsSync = true;
        }
      } else if (state.status === GameStatus.CRASHED) {
        const elapsed = (now - state.startTime) / 1000;
        if (elapsed >= 2) { // 2s crash screen
          state.status = GameStatus.WAITING;
          state.startTime = now;
          state.currentMultiplier = 1.0;
          needsSync = true;
        }
      }

      if (needsSync) {
        await setDoc(doc(db, "game", "state"), { 
          status: state.status,
          startTime: state.startTime,
          crashPoint: state.crashPoint,
          currentMultiplier: state.currentMultiplier,
          history: state.history,
          lastUpdated: serverTimestamp()
        }, { merge: true });
      }
    } catch (e) {
      // console.error("Game loop error:", e);
    }
  }

  // Frequency reduction to further save resource exhaustion
  setInterval(gameLoop, 200); 
  
  // Remove the redundant 1s sync to avoid overwriting state changes

  app.get('/api/game-state', (req, res) => {
    res.json({
      ...state,
      serverTime: Date.now()
    });
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
