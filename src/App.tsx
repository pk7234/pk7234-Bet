import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plane, History, Wallet, TrendingUp, Users, Settings, Info, Menu, LogOut, Shield, ArrowUpCircle, ArrowDownCircle, Home, Share2, User as UserIcon, ChevronRight, Copy, Heart } from 'lucide-react';
import { auth, db } from './lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, updateDoc, increment, serverTimestamp, collection, query, where, orderBy, limit } from 'firebase/firestore';
import { AuthModal } from './lib/components/AuthModal';
import { AdminPanel } from './lib/components/AdminPanel';
import { TransactionModal } from './lib/components/TransactionModal';

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

const generateCrashPoint = () => {
  const r = Math.random();
  if (r < 0.15) return 1.00;
  if (r < 0.68) return Math.floor((1.01 + Math.random() * 0.79) * 100) / 100;
  if (r < 0.92) return Math.floor((1.81 + Math.pow(Math.random(), 2) * 12) * 100) / 100;
  return Math.floor((10.0 + Math.pow(Math.random(), 4) * 90) * 100) / 100;
};


function TransactionList({ userId }: { userId: string }) {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, 'transactions'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(10)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setTransactions(docs);
      setLoading(false);
    }, (err) => {
      console.error("Failed to fetch transactions:", err);
      setLoading(false);
    });

    return unsubscribe;
  }, [userId]);

  if (loading) return <div className="text-center py-4 text-gray-500 font-bold animate-pulse uppercase text-[10px] tracking-widest">Loading History...</div>;

  if (transactions.length === 0) {
    return <div className="text-center py-8 text-gray-600 font-bold uppercase text-[10px] tracking-widest border border-white/5 rounded-xl bg-black/20">No transactions yet</div>;
  }

  return (
    <div className="space-y-2">
      {transactions.map((t) => (
        <div key={t.id} className="p-4 bg-black/60 rounded-xl border border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${t.type === 'deposit' ? 'bg-[#2ecc71]/10 text-[#2ecc71]' : 'bg-accent-red/10 text-accent-red'}`}>
              {t.type === 'deposit' ? <ArrowUpCircle className="w-4 h-4" /> : <ArrowDownCircle className="w-4 h-4" />}
            </div>
            <div>
              <div className="text-xs font-black uppercase tracking-tighter">{t.type}</div>
              <div className="text-[10px] text-gray-600 font-bold uppercase">{t.createdAt?.toDate ? t.createdAt.toDate().toLocaleString() : 'Recent'}</div>
            </div>
          </div>
          <div className="text-right">
            <div className={`text-sm font-black ${t.type === 'deposit' ? 'text-[#2ecc71]' : 'text-accent-red'}`}>
              {t.type === 'deposit' ? '+' : '-'}Rs. {t.amount}
            </div>
            <div className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full inline-block ${
              t.status === 'pending' ? 'bg-yellow-500/10 text-yellow-500 border border-yellow-500/20' :
              t.status === 'approved' ? 'bg-[#2ecc71]/10 text-[#2ecc71] border border-[#2ecc71]/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'
            }`}>
              {t.status === 'approved' ? 'SUCCESSFUL' : t.status}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

const getMultColor = (val: number) => {
  if (val < 1.2) return 'text-[#34b6db]'; // Light Blue
  if (val < 2) return 'text-[#9b59b6]'; // Purple
  if (val < 10) return 'text-[#34b6db]'; // Most Aviator apps use cyan for low, then purple, then pink/red
  return 'text-[#c0392b]'; // Dark Red
};

// Based on standard Aviator colors
const getHistoryColor = (val: number) => {
  if (val < 2) return 'text-[#34b6db]'; // Blue
  if (val < 10) return 'text-[#913dff]'; // Purple
  return 'text-[#c01d2e]'; // Red
};

const PlaneIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 100 100" className={className} xmlns="http://www.w3.org/2000/svg">
    {/* Body */}
    <path 
      d="M10 50 Q 30 40 85 45 Q 95 48 85 55 Q 30 60 10 50" 
      fill="#ff3b3b" 
      stroke="#7b1414"
      strokeWidth="0.5"
    />
    {/* Tail */}
    <path d="M12 50 L 5 40 L 15 40 Z" fill="#ff3b3b" stroke="#7b1414" strokeWidth="0.5" />
    <path d="M12 50 L 5 60 L 15 60 Z" fill="#ff3b3b" stroke="#7b1414" strokeWidth="0.5" />
    {/* Upper Wing */}
    <path d="M40 45 L 35 20 L 55 25 L 60 45 Z" fill="#d32f2f" stroke="#7b1414" strokeWidth="0.5" />
    {/* Lower Wing */}
    <path d="M40 55 L 35 80 L 55 75 L 60 55 Z" fill="#d32f2f" stroke="#7b1414" strokeWidth="0.5" />
    {/* Propeller Blur */}
    <motion.g
      animate={{ rotate: 360 }}
      transition={{ duration: 0.05, repeat: Infinity, ease: "linear" }}
      style={{ originX: '88px', originY: '49.5px' }}
    >
      <circle cx="88" cy="49.5" r="15" fill="none" stroke="white" strokeWidth="0.5" strokeDasharray="2 4" opacity="0.3" />
    </motion.g>
    {/* Propeller Hub */}
    <circle cx="88" cy="49.5" r="2.5" fill="white" />
  </svg>
);

export default function App() {
  const [gameState, setGameState] = useState<GameState>({
    status: GameStatus.WAITING,
    currentMultiplier: 1.0,
    startTime: Date.now(),
    crashPoint: 0,
    history: [], // Clear mock history
    timer: 0
  });

  const [initialLoading, setInitialLoading] = useState(true);
  const [timeOffset, setTimeOffset] = useState(0);
  const [balance, setBalance] = useState(0);
  const [isSynced, setIsSynced] = useState(false);
  
  // Bet 1 States
  const [betAmount1, setBetAmount1] = useState(16);
  const [bet1, setBet1] = useState<{ amount: number; active: boolean } | null>(null);
  
  // Bet 2 States
  const [betAmount2, setBetAmount2] = useState(16);
  const [bet2, setBet2] = useState<{ amount: number; active: boolean } | null>(null);
  
  const [notification, setNotification] = useState<string | null>(null);
  const [lastWin, setLastWin] = useState<number | null>(null);
  const [queuedBet1, setQueuedBet1] = useState<number | null>(null);
  const [queuedBet2, setQueuedBet2] = useState<number | null>(null);
  const [winMessage, setWinMessage] = useState<{ amount: number, mult: number } | null>(null);
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);

  const triggerNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };
  const [showTransModal, setShowTransModal] = useState<{ open: boolean, type: 'deposit' | 'withdrawal' }>({ open: false, type: 'deposit' });
  const [activeTab, setActiveTab] = useState<'home' | 'history' | 'wallet' | 'invite' | 'profile'>('home');
  const [showFullHistory, setShowFullHistory] = useState(false);

  // Dynamic Live Bets State
  const [liveBets, setLiveBets] = useState<any[]>([]);
  const lastStatusRef = useRef<GameStatus | null>(null);
  const gameStateRef = useRef<GameState>(gameState);
  const isPollingRef = useRef(false);

  // Keep Ref in sync with state for use in interval
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  // Sync State Logic
  useEffect(() => {
    // 1. First, try to get initial state via API for fast offset calculation
    const initialSync = async () => {
      try {
        const res = await fetch('/api/game-state');
        if (res.ok) {
          const data = await res.json();
          if (data.serverTime) {
            setTimeOffset(data.serverTime - Date.now());
          }
          setGameState(prev => ({ ...prev, ...data }));
          setIsSynced(true);
        }
      } catch (e) {
        console.warn("API sync failed, relying on Firestore");
      }
    };
    initialSync();

    // 3. Absolute Fallback: If no sync happens in 3s, start local
    const fallbackTimer = setTimeout(() => {
      setInitialLoading(false);
      setIsSynced(true);
    }, 3000);

    // 2. Real-time Firestore sync for the shared state
    const unsubscribe = onSnapshot(doc(db, 'game', 'state'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setGameState(prev => {
          // If status changed or we haven't synced yet, take the whole state
          if (prev.status !== data.status) {
            return {
              ...prev,
              ...data,
              history: data.history || prev.history
            };
          }

          // Performance: only sync multiplier if drift is significant (> 0.2)
          // This prevents fighting between local engine and Firestore updates
          const drift = Math.abs(prev.currentMultiplier - (data.currentMultiplier || 1.0));
          if (drift > 0.2) {
            return {
              ...prev,
              ...data,
              history: data.history || prev.history
            };
          }

          // If no significant change, return prev to bail out of re-render
          return prev;
        });
        
        setIsSynced(prev => prev ? prev : true);
        setInitialLoading(prev => prev ? false : prev);
        clearTimeout(fallbackTimer);
      }
    }, (err) => {
      console.error('Firestore Error:', err);
      // Even on error, allow local engine to start
      setInitialLoading(false);
      setIsSynced(true);
    });

    return () => {
      unsubscribe();
      clearTimeout(fallbackTimer);
    };
  }, []);

  // Engine Animation & Bots Logic Consolidated
  useEffect(() => {
    if (!isSynced) return;
    
    const interval = setInterval(() => {
      const now = Date.now() + timeOffset;

      // 1. Update Game State (LOCAL INTERPOLATION ONLY)
      setGameState(prev => {
        const elapsed = (now - prev.startTime) / 1000;

        if (prev.status === GameStatus.WAITING) {
          const remaining = Math.max(0, 5 - Math.floor(elapsed));
          if (prev.timer === remaining) return prev;
          return { ...prev, timer: remaining };
        }

        if (prev.status === GameStatus.FLYING) {
          const actualMult = Math.max(1.0, Math.pow(1.08, elapsed)); 
          
          // Local Transition to CRASHED to avoid the "pause" tell
          if (prev.crashPoint > 0 && actualMult >= prev.crashPoint) {
            return { 
              ...prev, 
              status: GameStatus.CRASHED,
              currentMultiplier: prev.crashPoint,
              startTime: now,
              timer: 3
            };
          }
          
          // Avoid tiny updates that don't change the UI display significantly
          if (Math.abs(prev.currentMultiplier - actualMult) < 0.001) return prev;
          return { ...prev, currentMultiplier: actualMult };
        }

        if (prev.status === GameStatus.CRASHED) {
          const remaining = Math.max(0, 3 - Math.floor(elapsed));
          if (prev.timer === remaining) return prev;
          return { ...prev, timer: remaining };
        }
        return prev;
      });

      // 2. Update Bots / Live Bets based on the state update above
      setLiveBets(prev => {
        const currentStatus = gameStateRef.current.status;
        const currentMult = gameStateRef.current.currentMultiplier; 
        
        if (currentStatus === GameStatus.WAITING && lastStatusRef.current !== GameStatus.WAITING) {
          lastStatusRef.current = GameStatus.WAITING;
          return Array.from({ length: 15 + Math.floor(Math.random() * 10) }, (_, i) => ({
            user: `${['m', 'a', 'x', 'p', 'z'][Math.floor(Math.random() * 5)]}***${100 + Math.floor(Math.random() * 900)}`,
            user_id: `bot_${i}_${Date.now()}`,
            amount: 16 + Math.floor(Math.random() * 500),
            cashOutAt: 1.1 + Math.pow(Math.random(), 2) * 5,
            cashedOut: false,
            win: 0
          }));
        }

        if (lastStatusRef.current === GameStatus.FLYING) {
          let hasChange = false;
          const updated = prev.map(bet => {
            if (!bet.cashedOut && currentMult >= bet.cashOutAt) {
              hasChange = true;
              return { ...bet, cashedOut: true, win: Math.floor(bet.amount * bet.cashOutAt * 100) / 100 };
            }
            return bet;
          });
          
          if (currentStatus !== GameStatus.FLYING) {
             lastStatusRef.current = currentStatus;
          }
          
          return hasChange ? updated : prev;
        }

        lastStatusRef.current = currentStatus;
        return prev;
      });

    }, 33);

    return () => clearInterval(interval);
  }, [isSynced, timeOffset]);
 // Only runs when sync status or timeOffset changes


  // Auth Listener
  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;
    
    const unsubscribeAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
      
      // Proactive admin check based on email
      const isEmailAdmin = u?.email === 'pkr4065806@gmail.com' || u?.email === 'fast8585100@gmail.com';
      setIsAdmin(!!isEmailAdmin);

      // Cleanup previous profile listener if any
      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = null;
      }

      if (u) {
        const userRef = doc(db, 'users', u.uid);
        unsubscribeProfile = onSnapshot(userRef, (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            // Use functional updates to ensure we only re-render if value actually changed
            setBalance(prev => prev === data.balance ? prev : data.balance);
            setIsAdmin(prev => {
              const isEmailAdmin = u?.email === 'pkr4065806@gmail.com' || u?.email === 'fast8585100@gmail.com';
              // We intentionally ignore data.role here for absolute security against role injection
              return isEmailAdmin === prev ? prev : isEmailAdmin;
            });
          }
        }, (err) => {
          console.error("User profile sync error:", err);
        });
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) unsubscribeProfile();
    };
  }, []);

  // Automatically process queued bets when game starts waiting
  useEffect(() => {
    if (gameState.status === GameStatus.WAITING) {
      // Clear active bets from previous round (they lost if still active)
      setBet1(null);
      setBet2(null);

      // Process queued bets
      if (queuedBet1 !== null) {
        setBet1({ amount: queuedBet1, active: true });
        setQueuedBet1(null);
      }
      if (queuedBet2 !== null) {
        setBet2({ amount: queuedBet2, active: true });
        setQueuedBet2(null);
      }
    } else if (gameState.status === GameStatus.CRASHED) {
      setBet1(null);
      setBet2(null);
    }
  }, [gameState.status]);

  const handlePlaceBet = async (num: 1 | 2) => {
    const amount = num === 1 ? betAmount1 : betAmount2;
    
    if (!user) {
      triggerNotification("PLEASE LOGIN FIRST TO PLACE BET");
      setShowAuthModal(true);
      return;
    }

    if (balance < amount) {
      triggerNotification("INSUFFICIENT BALANCE. PLEASE RECHARGE");
      return;
    }

    // If not waiting, queue it for next round
    if (gameState.status !== GameStatus.WAITING) {
      setBalance(prev => prev - amount);
      if (user) {
        const userRef = doc(db, 'users', user.uid);
        await updateDoc(userRef, { balance: increment(-amount) });
      }

      if (num === 1) setQueuedBet1(amount);
      else setQueuedBet2(amount);
      return;
    }

    setBalance(prev => prev - amount);
    if (num === 1) setBet1({ amount, active: true });
    else setBet2({ amount, active: true });

    if (user) {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, { balance: increment(-amount) });
    }
  };

  const handleCancelBet = async (num: 1 | 2) => {
    const qAmount = num === 1 ? queuedBet1 : queuedBet2;
    const bet = num === 1 ? bet1 : bet2;
    
    if (qAmount !== null) {
      setBalance(prev => prev + qAmount);
      if (user) {
        const userRef = doc(db, 'users', user.uid);
        await updateDoc(userRef, { balance: increment(qAmount) });
      }
      if (num === 1) setQueuedBet1(null);
      else setQueuedBet2(null);
    } else if (bet && gameState.status === GameStatus.WAITING) {
      setBalance(prev => prev + bet.amount);
      if (user) {
        const userRef = doc(db, 'users', user.uid);
        await updateDoc(userRef, { balance: increment(bet.amount) });
      }
      if (num === 1) setBet1(null);
      else setBet2(null);
    }
  };

  const handleCashOut = async (num: 1 | 2) => {
    if (gameState.status !== GameStatus.FLYING) return;
    const bet = num === 1 ? bet1 : bet2;
    if (!bet?.active) return;

    const mult = gameState.currentMultiplier;
    const win = Math.floor(bet.amount * mult * 100) / 100;
    
    setBalance(prev => prev + win);
    if (user) {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, { balance: increment(win) });
    }

    if (num === 1) setBet1(null);
    else setBet2(null);

    setWinMessage({ amount: win, mult });
    setTimeout(() => setWinMessage(null), 2500);
    
    setLastWin(win);
    setTimeout(() => setLastWin(null), 3000);
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setBalance(0); // Reset for guest
      setIsAdmin(false);
      setUser(null);
    } catch (e) {
      console.error("Logout failed:", e);
    }
  };

  const formatCurrency = (val: number) => (
    <div className="flex items-center gap-1">
      <span className="text-[#2ecc71] font-black text-sm italic tracking-tighter">{val.toFixed(2)}</span>
      <span className="text-gray-500 font-bold text-[9px] uppercase">PKR</span>
    </div>
  );

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0a0a0b] text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-accent-red border-t-transparent rounded-full animate-spin"></div>
          <span className="font-black text-xl italic tracking-tighter uppercase text-white leading-none text-accent-red animate-pulse">EASY AVIATOR SYNCING...</span>
        </div>
      </div>
    );
  }

  const planeCoords = (mult: number) => {
    // Determine progress based on multiplier
    // It should reach the "end" of its initial path around 5x-10x
    const progress = Math.min(100, Math.max(0, (mult - 1) * 15));
    
    // Smoothly curve towards the top-right
    // Clamp X at 85% and Y at 15% to keep the plane visible
    const x = Math.min(85, 10 + (progress * 0.8));
    const y = Math.max(15, 88 - (Math.pow(progress / 10, 1.3) * 12));
    
    return { x, y };
  };
  const coords = planeCoords(gameState.currentMultiplier);

  return (
    <div className="min-h-screen bg-[#0a0a0b] text-[#e2e2e7] font-sans selection:bg-accent-red/30 pb-20 lg:pb-0">
      <header className="h-[50px] lg:h-[60px] glass flex items-center justify-between px-4 lg:px-6 sticky top-0 z-[100] border-b border-white/5 bg-black/80 backdrop-blur-xl">
        <div className="flex items-center gap-3" onClick={() => setActiveTab('home')}>
          <div className="w-8 h-8 bg-accent-red rounded flex items-center justify-center shadow-[0_0_15px_rgba(255,59,59,0.4)]">
            <Plane className="w-5 h-5 text-white fill-current -rotate-45" />
          </div>
          <span className="font-black text-xl italic tracking-tighter uppercase text-white leading-none text-accent-red">EASY AVIATOR</span>
        </div>

        <div className="flex items-center gap-4">
          {!user ? (
            <button onClick={() => setShowAuthModal(true)} className="px-5 py-2 bg-accent-red hover:bg-red-600 text-white text-[10px] font-black rounded-lg uppercase tracking-widest transition-all shadow-[0_5px_15px_rgba(255,59,59,0.3)]">SIGN UP</button>
          ) : (
            <div className="flex items-center gap-3">
              {isAdmin && (
                <button 
                  onClick={() => setShowAdminPanel(true)} 
                  className="px-4 py-2 bg-accent-blue/10 hover:bg-accent-blue/20 text-accent-blue rounded-lg border border-accent-blue/20 flex items-center gap-2 transition-all animate-pulse hover:animate-none"
                >
                  <Shield className="w-4 h-4" />
                  <span className="text-[10px] font-black uppercase tracking-widest hidden sm:inline">Admin Panel</span>
                </button>
              )}
              <div className="px-4 py-2 bg-black/40 rounded-lg border border-white/10 flex items-center gap-2">
                <Wallet className="w-3 h-3 text-[#2ecc71]" />
                <span className="text-xs font-black text-[#2ecc71] tracking-tighter">{formatCurrency(balance)}</span>
              </div>
              <button 
                onClick={handleLogout}
                className="p-2 bg-white/5 text-gray-400 hover:text-accent-red rounded-lg border border-white/10 transition-colors"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="min-h-[calc(100vh-120px)]">
        {activeTab === 'home' && (
          <main className="max-w-[1400px] mx-auto p-2 grid grid-cols-1 lg:grid-cols-4 gap-2">
            <div className="lg:col-span-3 flex flex-col gap-2">
              <div className="glass rounded-xl px-3 h-[32px] flex items-center gap-4 overflow-x-auto no-scrollbar">
                {gameState.history.map((h, i) => (
                  <span key={i} className={`text-[11px] font-black italic tracking-tighter ${getMultColor(h)} hover:bg-white/5 px-1 rounded transition-colors cursor-default`}>
                    {h.toFixed(2)}x
                  </span>
                ))}
                {gameState.history.length === 0 && <span className="text-[10px] text-gray-600 font-bold uppercase tracking-widest">History empty</span>}
              </div>

              <div className="relative aspect-video bg-[#000000] rounded-xl border border-white/5 overflow-hidden flex items-center justify-center">
                {/* Dynamic Background Elements */}
                <div className="absolute inset-0 pointer-events-none">
                  {/* Radial Sunburst Rays - Deep and cinematic */}
                  <div className="absolute inset-0 bg-[#0c0c14]" />
                  
                  {gameState.status === GameStatus.FLYING && (
                    <motion.div 
                      key="rays"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 0.35 }}
                      className="absolute bottom-0 left-0 w-[200%] h-[200%] origin-bottom-left"
                      style={{
                        background: `conic-gradient(from -30deg at 0% 100%, transparent 0deg, rgba(255,59,59,0.3) 15deg, transparent 30deg, rgba(255,59,59,0.2) 45deg, transparent 60deg, rgba(255,59,59,0.1) 75deg, transparent 90deg)`,
                        filter: 'blur(30px)'
                      }}
                    />
                  )}
                  
                  {/* Secondary Rays */}
                  {gameState.status === GameStatus.FLYING && (
                    <motion.div 
                      className="absolute inset-0 opacity-10"
                      style={{
                        background: `conic-gradient(from 0deg at 50% 50%, transparent 0deg, #ff3b3b 2deg, transparent 15deg, #ff3b3b 17deg, transparent 30deg)`,
                      }}
                      animate={{ rotate: 360 }}
                      transition={{ duration: 40, repeat: Infinity, ease: "linear" }}
                    />
                  )}
                  
                  {/* Scrolling Grid */}
                  <div 
                    className="absolute inset-0 opacity-[0.04]"
                    style={{
                      backgroundImage: `linear-gradient(to right, #444444 1px, transparent 1px), linear-gradient(to bottom, #444444 1px, transparent 1px)`,
                      backgroundSize: '80px 80px',
                      transform: gameState.status === GameStatus.FLYING 
                        ? `translate(-${(gameState.currentMultiplier * 50) % 80}px, ${(gameState.currentMultiplier * 50) % 80}px)` 
                        : 'none',
                    }}
                  />
                </div>

                <AnimatePresence mode="wait">
                  {winMessage && (
                    <motion.div 
                      initial={{ scale: 0.5, opacity: 0, y: 50 }} 
                      animate={{ scale: 1, opacity: 1, y: 0 }} 
                      exit={{ scale: 1.5, opacity: 0, y: -50 }}
                      className="absolute inset-0 z-[60] flex items-center justify-center pointer-events-none"
                    >
                      <div className="bg-[#2ecc71] px-8 py-4 rounded-[2rem] shadow-[0_0_50px_rgba(46,204,113,0.5)] border-2 border-white/20 flex flex-col items-center">
                        <span className="text-[10px] font-black text-white uppercase tracking-[0.3em] mb-1">Success!</span>
                        <div className="text-4xl font-black text-white italic tracking-tighter">Rs. {winMessage.amount.toFixed(2)}</div>
                        <div className="text-xs font-bold text-white/80">At {winMessage.mult.toFixed(2)}x</div>
                      </div>
                    </motion.div>
                  )}

                  {gameState.status === GameStatus.WAITING && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center z-10">
                      <div className="text-gray-500 text-[10px] font-black uppercase tracking-[0.4em] mb-4">Wait for Next Round</div>
                      <div className="text-7xl font-black text-white italic">{gameState.timer}</div>
                    </motion.div>
                  )}
                  {gameState.status === GameStatus.FLYING && (
                    <motion.div 
                      key="multiplier"
                      initial={{ opacity: 0, scale: 0.9 }} 
                      animate={{ opacity: 1, scale: 1 }} 
                      className="text-center z-20 select-none pointer-events-none"
                    >
                      <div className="text-[100px] sm:text-[140px] font-black text-white italic tracking-tighter drop-shadow-[0_15px_60px_rgba(0,0,0,1)] leading-none uppercase">
                        {gameState.currentMultiplier.toFixed(2)}x
                      </div>
                    </motion.div>
                  )}
                  {gameState.status === GameStatus.CRASHED && (
                    <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="text-center z-10">
                      <div className="bg-accent-red px-6 py-2 rounded-full mb-4 text-white font-black uppercase tracking-[0.2em] italic text-xs shadow-lg">Flew Away!</div>
                      <div className="text-8xl font-black text-accent-red italic drop-shadow-[0_0_20px_rgba(255,59,59,0.3)]">{gameState.currentMultiplier.toFixed(2)}x</div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="absolute inset-0 pointer-events-none z-0">
                  <svg className="w-full h-full" preserveAspectRatio="none">
                    {gameState.status === GameStatus.FLYING && (
                      <g>
                        {/* Red wedge fill - Deeper and more saturated like screenshot */}
                        <path
                          d={`M 0 100 Q ${coords.x / 2} 100 ${coords.x} ${coords.y} L ${coords.x} 100 L 0 100 Z`}
                          fill="url(#flightGradient)"
                          className="opacity-80"
                        />
                        {/* Top curve line - Bright and glowy */}
                        <path
                          d={`M 0 100 Q ${coords.x / 2} 100 ${coords.x} ${coords.y}`}
                          fill="none"
                          stroke="#ff1e1e"
                          strokeWidth="5"
                          strokeLinecap="round"
                          className="drop-shadow-[0_0_10px_rgba(255,59,59,0.8)]"
                        />
                        <defs>
                          <linearGradient id="flightGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stopColor="#ff0000" stopOpacity="0.7" />
                            <stop offset="60%" stopColor="#800000" stopOpacity="0.3" />
                            <stop offset="100%" stopColor="#000000" stopOpacity="0" />
                          </linearGradient>
                        </defs>
                      </g>
                    )}
                  </svg>
                </div>

                <div className="absolute inset-0 pointer-events-none z-20">
                  {(gameState.status === GameStatus.FLYING || gameState.status === GameStatus.CRASHED) && (
                    <motion.div 
                      animate={gameState.status === GameStatus.FLYING 
                        ? { 
                            left: `${coords.x}%`, 
                            top: `${coords.y}%`,
                            rotate: -10 + (Math.sin(Date.now() / 200) * 3) // Slight oscillation
                          } 
                        : { 
                            scale: 0, 
                            opacity: 0,
                            rotate: 0,
                            x: 100,
                            y: -100
                          }
                      }
                      transition={{ 
                        type: "spring", 
                        stiffness: 80, 
                        damping: 15
                      }}
                      className="absolute -translate-x-1/2 -translate-y-1/2"
                    >
                      <PlaneIcon className="w-16 h-16 sm:w-20 sm:h-20 drop-shadow-[0_0_25px_rgba(255,59,59,0.8)]" />
                      
                      {/* Flight smoke trail */}
                      {gameState.status === GameStatus.FLYING && (
                        <div className="absolute top-1/2 right-full h-1 w-20 bg-gradient-to-l from-accent-red/40 to-transparent blur-sm -translate-y-1/2" />
                      )}
                    </motion.div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[1, 2].map(num => (
                  <div key={num} className={`bg-[#1b1b21] rounded-2xl p-4 border-l-4 ${num === 1 ? 'border-accent-red' : 'border-accent-blue'} flex items-center gap-4`}>
                    <div className="flex flex-col gap-2 w-32">
                      <input 
                        type="number" 
                        value={num === 1 ? betAmount1 : betAmount2} 
                        onChange={e => num === 1 ? setBetAmount1(Number(e.target.value)) : setBetAmount2(Number(e.target.value))}
                        className="bg-black/40 border border-white/5 rounded-lg p-2 text-center font-bold text-white outline-none"
                      />
                      <div className="grid grid-cols-2 gap-1">
                        {[16, 50, 100, 500].map(v => (
                          <button key={v} onClick={() => num === 1 ? setBetAmount1(v) : setBetAmount2(v)} className="bg-white/5 rounded py-1 text-[10px] font-bold text-gray-400 hover:bg-white/10">{v}</button>
                        ))}
                      </div>
                    </div>
                    <div className="flex-1 h-full">
                      {!(num === 1 ? (bet1 || queuedBet1) : (bet2 || queuedBet2)) ? (
                        <button 
                          onClick={() => handlePlaceBet(num as 1 | 2)} 
                          className="w-full h-full bg-[#28a745] hover:bg-[#2ecc71] text-white rounded-xl font-black text-2xl flex flex-col items-center justify-center shadow-lg transition-all active:scale-95"
                        >
                          <span className="text-xs font-normal opacity-70 uppercase tracking-widest">BET</span>
                          {formatCurrency(num === 1 ? betAmount1 : betAmount2)}
                        </button>
                      ) : (num === 1 ? queuedBet1 : queuedBet2) ? (
                        <button 
                          onClick={() => handleCancelBet(num as 1 | 2)}
                          className="w-full h-full bg-accent-blue/10 border-2 border-accent-blue/30 text-accent-blue rounded-xl font-black text-xl flex flex-col items-center justify-center shadow-[0_0_20px_rgba(52,152,219,0.3)] transition-all active:scale-95 group hover:bg-accent-red/20 hover:border-accent-red/30 hover:text-accent-red"
                        >
                          <span className="text-[10px] font-black uppercase tracking-[0.3em] mb-1 group-hover:hidden">QUEUED</span>
                          <span className="text-[10px] font-black uppercase tracking-[0.3em] mb-1 hidden group-hover:block text-accent-red">CANCEL</span>
                          <span className="text-[8px] opacity-60 font-bold uppercase group-hover:hidden">Ready for Next Round</span>
                          <span className="text-[8px] opacity-60 font-bold uppercase hidden group-hover:block">Withdraw Bet</span>
                        </button>
                      ) : (num === 1 ? bet1 : bet2) && gameState.status === GameStatus.WAITING ? (
                        <button 
                          onClick={() => handleCancelBet(num as 1 | 2)}
                          className="w-full h-full bg-accent-blue/10 border-2 border-accent-blue/30 text-accent-blue rounded-xl font-black text-xl flex flex-col items-center justify-center shadow-[0_0_20px_rgba(52,152,219,0.3)] transition-all active:scale-95 group hover:bg-accent-red/20 hover:border-accent-red/30 hover:text-accent-red"
                        >
                          <span className="text-[10px] font-black uppercase tracking-[0.3em] mb-1 group-hover:hidden">WAITING...</span>
                          <span className="text-[10px] font-black uppercase tracking-[0.3em] mb-1 hidden group-hover:block text-accent-red">CANCEL</span>
                          <span className="text-[8px] opacity-60 font-bold uppercase group-hover:hidden">Round starts soon</span>
                          <span className="text-[8px] opacity-60 font-bold uppercase hidden group-hover:block">Withdraw Bet</span>
                        </button>
                      ) : (
                        <button 
                          onClick={() => handleCashOut(num as 1 | 2)}
                          disabled={gameState.status !== GameStatus.FLYING}
                          className="w-full h-full bg-[#f39c12] hover:bg-[#e67e22] text-white rounded-xl font-black text-2xl flex flex-col items-center justify-center shadow-lg transition-all active:scale-95 disabled:opacity-50"
                        >
                          <span className="text-xs font-normal opacity-70 uppercase tracking-widest text-[#000000]/60">CASH OUT</span>
                          {gameState.status === GameStatus.FLYING && formatCurrency(((num === 1 ? bet1 : bet2)?.amount || 0) * gameState.currentMultiplier)}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col h-[600px] glass rounded-xl overflow-hidden">
              <div className="p-3 border-b border-white/5 bg-black/20 text-xs font-bold uppercase tracking-widest text-gray-500">Live Bets</div>
              <div className="flex-1 overflow-y-auto custom-scrollbar">
                <table className="w-full text-[11px]">
                  <thead className="sticky top-0 bg-[#0a0a0b] text-gray-600 uppercase border-b border-white/5">
                    <tr>
                      <th className="text-left p-2">User</th>
                      <th className="text-right p-2">Bet</th>
                      <th className="text-right p-2">Mult</th>
                      <th className="text-right p-2">Win</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {liveBets.map((bet, i) => (
                      <tr key={i} className={bet.cashedOut ? 'bg-[#2ecc71]/5' : ''}>
                        <td className="p-2 text-gray-400">{bet.user}</td>
                        <td className="p-2 text-right text-white/80">{formatCurrency(bet.amount)}</td>
                        <td className="p-2 text-right font-bold text-accent-blue">{bet.cashedOut ? bet.cashOutAt.toFixed(2) + 'x' : '-'}</td>
                        <td className="p-2 text-right font-black text-[#2ecc71]">{bet.cashedOut ? formatCurrency(bet.win) : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </main>
        )}

        {activeTab === 'wallet' && (
          <div className="max-w-xl mx-auto p-4 flex flex-col gap-4">
             <div className="glass rounded-2xl p-8 bg-black/40 shadow-2xl">
                <div className="flex items-center gap-4 mb-8">
                   <div className="w-14 h-14 bg-[#2ecc71]/20 rounded-2xl flex items-center justify-center text-[#2ecc71] shadow-lg"><Wallet className="w-8 h-8" /></div>
                   <h2 className="text-2xl font-black italic tracking-tighter uppercase">Wallet</h2>
                </div>
                <div className="grid gap-4">
                   <button onClick={() => setShowTransModal({ open: true, type: 'deposit' })} className="w-full bg-black/60 border border-white/5 p-6 rounded-xl flex items-center justify-between hover:border-[#2ecc71]/50 transition-all">
                      <div className="flex items-center gap-4">
                        <ArrowUpCircle className="w-6 h-6 text-[#2ecc71]" />
                        <span className="font-bold uppercase tracking-tight">Deposit Funds</span>
                      </div>
                      <ChevronRight className="w-5 h-5 text-gray-700" />
                   </button>
                   <button onClick={() => setShowTransModal({ open: true, type: 'withdrawal' })} className="w-full bg-black/60 border border-white/5 p-6 rounded-xl flex items-center justify-between hover:border-accent-red/50 transition-all">
                      <div className="flex items-center gap-4">
                        <ArrowDownCircle className="w-6 h-6 text-accent-red" />
                        <span className="font-bold uppercase tracking-tight">Withdraw Funds</span>
                      </div>
                      <ChevronRight className="w-5 h-5 text-gray-700" />
                   </button>
                </div>
             </div>

             {user && (
               <div className="glass rounded-2xl p-6 bg-black/40 shadow-2xl">
                 <h3 className="text-sm font-bold uppercase tracking-widest text-gray-500 mb-4">Recent Transactions</h3>
                 <TransactionList userId={user.uid} />
               </div>
             )}
          </div>
        )}

        {activeTab === 'profile' && (
          <div className="max-w-xl mx-auto p-4 flex flex-col gap-4">
            <div className="glass rounded-2xl p-8 bg-black/40 shadow-2xl">
              <div className="flex items-center gap-4 mb-8">
                <div className="w-14 h-14 bg-accent-red/20 rounded-2xl flex items-center justify-center text-accent-red shadow-lg">
                  <UserIcon className="w-8 h-8" />
                </div>
                <div>
                  <h2 className="text-2xl font-black italic tracking-tighter uppercase leading-tight">My Profile</h2>
                  <p className="text-xs text-gray-500 font-bold tracking-widest uppercase">{user?.email || 'Guest User'}</p>
                </div>
              </div>
              
              <div className="space-y-4">
                <div className="p-4 bg-black/60 rounded-xl border border-white/5">
                  <div className="text-[10px] font-black text-gray-600 uppercase tracking-widest mb-1">Current Balance</div>
                  <div className="text-2xl font-black text-[#2ecc71]">{formatCurrency(balance)}</div>
                </div>

                {user ? (
                  <button 
                    onClick={handleLogout}
                    className="w-full flex items-center justify-center gap-3 p-4 bg-accent-red/10 text-accent-red border border-accent-red/20 rounded-xl font-black uppercase tracking-widest hover:bg-accent-red hover:text-white transition-all shadow-lg"
                  >
                    <LogOut className="w-5 h-5" />
                    Logout Account
                  </button>
                ) : (
                  <button 
                    onClick={() => setShowAuthModal(true)}
                    className="w-full flex items-center justify-center gap-3 p-4 bg-accent-blue/10 text-accent-blue border border-accent-blue/20 rounded-xl font-black uppercase tracking-widest hover:bg-accent-blue hover:text-white transition-all shadow-lg"
                  >
                    <UserIcon className="w-5 h-5" />
                    Log In / Sign Up
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <nav className="fixed bottom-0 left-0 right-0 h-16 bg-black/90 backdrop-blur-xl border-t border-white/10 z-[100] flex items-center justify-around px-4">
        {[
          { icon: Home, id: 'home', label: 'Home' },
          { icon: Wallet, id: 'wallet', label: 'Wallet' },
          { icon: Share2, id: 'invite', label: 'Invite' },
          { icon: UserIcon, id: 'profile', label: 'Profile' }
        ].map(item => (
          <button key={item.id} onClick={() => setActiveTab(item.id as any)} className={`flex flex-col items-center gap-1 transition-all ${activeTab === item.id ? 'text-accent-red' : 'text-gray-500'}`}>
            <item.icon className="w-5 h-5" />
            <span className="text-[9px] font-black uppercase italic">{item.label}</span>
          </button>
        ))}
      </nav>

      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: -100 }}
            animate={{ opacity: 1, y: 30 }}
            exit={{ opacity: 0, y: -100 }}
            className="fixed top-20 left-0 right-0 z-[500] flex justify-center px-4 pointer-events-none"
          >
            <div className="bg-accent-red px-6 py-3 rounded-full shadow-[0_10px_40px_rgba(255,59,59,0.5)] border border-white/20 flex items-center gap-3">
              <Shield className="w-5 h-5 text-white" />
              <span className="text-[10px] md:text-xs font-black text-white uppercase tracking-widest">{notification}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AdminPanel isOpen={showAdminPanel} onClose={() => setShowAdminPanel(false)} />
      {user && <TransactionModal isOpen={showTransModal.open} onClose={() => setShowTransModal({ ...showTransModal, open: false })} type={showTransModal.type} userId={user.uid} />}
    </div>
  );
}
