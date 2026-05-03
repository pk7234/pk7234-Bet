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

  // Load initial history and state from Firestore
  try {
    const historySnap = await getDoc(doc(db, "game", "history"));
    if (historySnap.exists()) {
      const rawHistory = historySnap.data().values || [];
      // Cleanup duplicates from existing history
      state.history = rawHistory.filter((val: number, idx: number) => idx === 0 || val !== rawHistory[idx - 1]).slice(0, 50);
      
      if (state.history.length !== rawHistory.length) {
        console.log("Cleaned up duplicated history entries");
        await setDoc(doc(db, "game", "history"), { values: state.history });
      }
      console.log("Loaded history from Firestore:", state.history.length, "items");
    }

    const stateSnap = await getDoc(doc(db, "game", "state"));
    if (stateSnap.exists()) {
      const data = stateSnap.data();
      // Only restore if the data is relatively fresh (e.g., within last 30s) or we just want to resume
      state = {
        ...state,
        status: data.status as GameStatus,
        currentMultiplier: data.currentMultiplier || 1.0,
        startTime: data.startTime || Date.now(),
        crashPoint: data.crashPoint || 0,
        timer: data.timer || 0,
      };
      console.log("Restored game state from Firestore:", state.status);
    }
  } catch (e) {
    console.error("Failed to load global state from Firebase:", e);
  }

  function generateCrashPoint() {
    const r = Math.random();
    if (r < 0.15) return 1.00;
    if (r < 0.68) return Math.floor((1.01 + Math.random() * 0.79) * 100) / 100;
    
    if (r < 0.92) return Math.floor((1.81 + Math.pow(Math.random(), 2) * 12) * 100) / 100; 
    return Math.floor((10.0 + Math.pow(Math.random(), 4) * 90) * 100) / 100;
  }

  async function gameLoop() {
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
      state.currentMultiplier = Math.floor(Math.pow(1.08, elapsedSeconds) * 100) / 100;
      
      if (state.currentMultiplier >= state.crashPoint) {
        state.currentMultiplier = state.crashPoint;
        state.status = GameStatus.CRASHED;
        state.startTime = now;
        
        // Only add to history if it's not a duplicate (safety check)
        if (state.history.length === 0 || state.history[0] !== state.crashPoint || (state.history.length > 1 && state.history[1] === state.crashPoint)) {
           state.history = [state.crashPoint, ...state.history].slice(0, 50);
        }
        
        // Persist to Firestore
        try {
          await setDoc(doc(db, "game", "history"), { values: state.history });
          await setDoc(doc(db, "game", "state"), { 
            status: state.status,
            startTime: state.startTime,
            crashPoint: state.crashPoint,
            currentMultiplier: state.currentMultiplier,
            history: state.history,
            timer: 0,
            lastUpdated: serverTimestamp()
          });
        } catch (e) {
          console.error("Failed to save state to Firebase:", e);
        }
      }
    } else if (state.status === GameStatus.CRASHED) {
      state.timer = Math.max(0, 3 - Math.floor((now - state.startTime) / 1000));
      if (state.timer === 0) {
        state.status = GameStatus.WAITING;
        state.startTime = now;
        state.currentMultiplier = 1.0;
        
        // Sync transition start
        try {
          await setDoc(doc(db, "game", "state"), { 
            status: state.status,
            startTime: state.startTime,
            crashPoint: 0,
            timer: 5,
            currentMultiplier: 1.0,
            lastUpdated: serverTimestamp()
          });
        } catch (e) {
          console.error("Failed to sync transition to Firebase:", e);
        }
      }
    }
  }

  setInterval(gameLoop, 33);
  
  // Also sync state occasionally even if no crash happened
  setInterval(async () => {
    try {
      await setDoc(doc(db, "game", "state"), { 
        status: state.status,
        startTime: state.startTime,
        crashPoint: state.crashPoint,
        currentMultiplier: state.currentMultiplier,
        timer: state.timer,
        lastUpdated: serverTimestamp()
      });
    } catch (e) {
      // console.error("Periodic sync failed:", e.message);
    }
  }, 1000);

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
