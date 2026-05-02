import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plane, History, Wallet, TrendingUp, Users, Settings, Info, Menu, LogOut, Shield, ArrowUpCircle, ArrowDownCircle, Home, Share2, User as UserIcon, ChevronRight, Copy, Heart } from 'lucide-react';
import { auth, db } from './lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, updateDoc, increment, serverTimestamp } from 'firebase/firestore';
import { AuthModal } from './components/AuthModal';
import { AdminPanel } from './components/AdminPanel';
import { TransactionModal } from './components/TransactionModal';

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

// 68% house advantage logic (32% win rate for users)
const generateCrashPoint = () => {
  const r = Math.random();
  if (r < 0.15) return 1.00; // 15% Instant crash (House)
  if (r < 0.68) return Math.floor((1.01 + Math.random() * 0.79) * 100) / 100; // 53% Low range < 1.80x (House)
  
  // Remaining 32% are User winning rounds
  if (r < 0.92) return Math.floor((1.81 + Math.pow(Math.random(), 2) * 12) * 100) / 100; // 24% Mid range
  return Math.floor((10.0 + Math.pow(Math.random(), 4) * 90) * 100) / 100; // 8% Moon rounds
};

export default function App() {
  const [gameState, setGameState] = useState<GameState>(() => {
    // Try to load history from local storage as a fallback for screen refreshes
    let savedHistory: number[] = [];
    try {
      const stored = typeof window !== 'undefined' ? localStorage.getItem('aviator_history') : null;
      if (stored) savedHistory = JSON.parse(stored);
      if (!Array.isArray(savedHistory)) savedHistory = [];
    } catch (e) {
      console.error("Failed to parse history", e);
      savedHistory = [];
    }

    return {
      status: GameStatus.WAITING,
      currentMultiplier: 1.0,
      startTime: Date.now(),
      crashPoint: generateCrashPoint(),
      history: savedHistory,
      timer: 5
    };
  });
  const [isSynced, setIsSynced] = useState(false);
  const [timeOffset, setTimeOffset] = useState(0);
  const [balance, setBalance] = useState(1000);
  
  // Bet 1 States
  const [betAmount1, setBetAmount1] = useState(16);
  const [bet1, setBet1] = useState<{ amount: number; active: boolean } | null>(null);
  
  // Bet 2 States
  const [betAmount2, setBetAmount2] = useState(16);
  const [bet2, setBet2] = useState<{ amount: number; active: boolean } | null>(null);
  
  const [lastWin, setLastWin] = useState<number | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [showTransModal, setShowTransModal] = useState<{ open: boolean, type: 'deposit' | 'withdrawal' }>({ open: false, type: 'deposit' });
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [activeTab, setActiveTab] = useState<'home' | 'history' | 'wallet' | 'invite' | 'profile'>('home');
  const [showFullHistory, setShowFullHistory] = useState(false);

  // Dynamic Live Bets State
  const [liveBets, setLiveBets] = useState<any[]>([]);
  const lastStatusRef = useRef<GameStatus | null>(null);
  const isPollingRef = useRef(false);

  // Consolidate live bets logic into a single effect to prevent ripple updates
  useEffect(() => {
    if (!gameState) return;
    const currentStatus = gameState.status;
    const lastStatus = lastStatusRef.current;
    
    // Reset/Initialize bets only on status change
    if (currentStatus === GameStatus.WAITING && lastStatus !== GameStatus.WAITING) {
      const newBets = Array.from({ length: 15 + Math.floor(Math.random() * 10) }, (_, i) => ({
        user: `${['m', 'a', 'x', 'p', 'z'][Math.floor(Math.random() * 5)]}***${100 + Math.floor(Math.random() * 900)}`,
        user_id: `bot_${i}_${Date.now()}`,
        amount: 16 + Math.floor(Math.random() * 500),
        cashOutAt: 1.1 + Math.pow(Math.random(), 2) * 5,
        cashedOut: false,
        win: 0
      }));
      setLiveBets(newBets);
    } 

    lastStatusRef.current = currentStatus;
  }, [gameState.status]);

  // Handle bot cashouts and new bet injections in a separate effect
  useEffect(() => {
    if (gameState.status !== GameStatus.FLYING) return;
    
    const currentMult = gameState.currentMultiplier;
    
    setLiveBets(prev => {
      let changed = false;
      const updatedBets = prev.map(bet => {
        if (!bet.cashedOut && currentMult >= bet.cashOutAt) {
          changed = true;
          return {
            ...bet,
            cashedOut: true,
            win: Math.floor(bet.amount * bet.cashOutAt * 100) / 100
          };
        }
        return bet;
      });

      // Randomized injection
      if (currentMult < 1.3 && Math.random() > 0.99) {
        changed = true;
        updatedBets.push({
          user: `${['u', 'r', 'k', 'q'][Math.floor(Math.random() * 4)]}***${100 + Math.floor(Math.random() * 900)}`,
          user_id: `bot_extra_${Date.now()}`,
          amount: 16 + Math.floor(Math.random() * 300),
          cashOutAt: currentMult + 1 + Math.random() * 3,
          cashedOut: false,
          win: 0
        });
        if (updatedBets.length > 30) updatedBets.shift();
      }

      return changed ? updatedBets : prev;
    });
  }, [gameState.currentMultiplier, gameState.status]);

  // Auth Listener
  useEffect(() => {
    let unsubBalance: (() => void) | null = null;
    
    const unsubscribeAuth = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      
      // Cleanup previous balance listener if any
      if (unsubBalance) {
        unsubBalance();
        unsubBalance = null;
      }

      if (u) {
        const IS_SPECIFIC_ADMIN = u.email === 'fast8585100@gmail.com';
        const userRef = doc(db, 'users', u.uid);
        const userSnap = await getDoc(userRef);
        
        if (!userSnap.exists()) {
          await setDoc(userRef, {
            email: u.email,
            phoneNumber: '',
            balance: 1000,
            role: IS_SPECIFIC_ADMIN ? 'admin' : 'user',
            createdAt: serverTimestamp()
          });
          setBalance(1000);
          setIsAdmin(IS_SPECIFIC_ADMIN);
        } else {
          setBalance(userSnap.data().balance);
          setIsAdmin(IS_SPECIFIC_ADMIN || userSnap.data().role === 'admin');
          if (IS_SPECIFIC_ADMIN && userSnap.data().role !== 'admin') {
            await updateDoc(userRef, { role: 'admin' });
          }
        }

        unsubBalance = onSnapshot(userRef, (docSnap) => {
          if (docSnap.exists()) {
            setBalance(docSnap.data().balance);
            setIsAdmin(docSnap.data().role === 'admin');
          }
        });
      } else {
        setBalance(1000);
        setIsAdmin(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubBalance) unsubBalance();
    };
  }, []);

  // Currency Detection
  const [currency, setCurrency] = useState('Rs.');
  
  useEffect(() => {
    try {
      // Try to determine currency from locale or default to PKR for this user context
      const locale = navigator.language;
      const formatted = new Intl.NumberFormat(locale, { style: 'currency', currency: 'PKR' }).formatToParts(1);
      const symbol = formatted.find(p => p.type === 'currency')?.value || 'Rs.';
      setCurrency(symbol);
    } catch (e) {
      setCurrency('Rs.');
    }
  }, []);

  const formatCurrency = (val: number) => `${currency} ${val.toFixed(2)}`;

  // Client-Side Engine Fallback (for static platforms like Cloudflare)
  const [apiAvailable, setApiAvailable] = useState(true);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    const runEngine = () => {
      setGameState(prev => {
        const now = Date.now() + timeOffset;
        const elapsed = (now - prev.startTime) / 1000;

        if (prev.status === GameStatus.WAITING) {
          const remaining = Math.max(0, 5 - Math.floor(elapsed));
          if (remaining === 0) {
            return {
              ...prev,
              status: GameStatus.FLYING,
              startTime: now,
              timer: 0,
              currentMultiplier: 1.0,
              crashPoint: generateCrashPoint()
            };
          }
          if (prev.timer === remaining) return prev;
          return { ...prev, timer: remaining };
        }

        if (prev.status === GameStatus.FLYING) {
          const actualMult = Math.max(1.0, Math.pow(1.08, elapsed)); 
          
          if (actualMult >= prev.crashPoint) {
            const newHistory = [prev.crashPoint, ...prev.history].slice(0, 50);
            if (typeof window !== 'undefined') {
              localStorage.setItem('aviator_history', JSON.stringify(newHistory));
            }
            return {
              ...prev,
              status: GameStatus.CRASHED,
              currentMultiplier: prev.crashPoint,
              startTime: now,
              history: newHistory
            };
          }
          // Avoid tiny micro-updates that don't visualy matter but trigger effects
          if (Math.abs(prev.currentMultiplier - actualMult) < 0.001) return prev;
          return { ...prev, currentMultiplier: actualMult };
        }

        if (prev.status === GameStatus.CRASHED) {
          const remaining = Math.max(0, 3 - Math.floor(elapsed));
          if (remaining === 0) {
            return {
              ...prev,
              status: GameStatus.WAITING,
              currentMultiplier: 1.0,
              startTime: now,
              crashPoint: generateCrashPoint(),
              timer: 5
            };
          }
          if (prev.timer === remaining) return prev;
          return { ...prev, timer: remaining };
        }

        return prev;
      });
    };

    const poll = async () => {
      // If we switched to local engine, don't attempt fetch
      if (!apiAvailable) {
        runEngine();
        setIsSynced(true);
        return;
      }

      if (isPollingRef.current) return;
      isPollingRef.current = true;

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000); // Increased timeout
        
        const res = await fetch('/api/game-state', { 
          signal: controller.signal,
          headers: { 'Accept': 'application/json' }
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          const contentType = res.headers.get("content-type");
          if (contentType && contentType.indexOf("application/json") !== -1) {
            const data = await res.json();
            if (data && data.status) {
              if (data.serverTime) {
                setTimeOffset(data.serverTime - Date.now());
              }
              setGameState(prev => {
                const statusChanged = prev.status !== data.status;
                const multChanged = Math.abs(prev.currentMultiplier - data.currentMultiplier) > 0.001;
                const timerChanged = prev.timer !== data.timer;
                
                const serverHistory = data.history || [];
                let mergedHistory = prev.history;
                let historyUpdated = false;

                if (serverHistory.length > 0) {
                  if (mergedHistory.length === 0 || serverHistory[0] !== mergedHistory[0]) {
                    const newItems: number[] = [];
                    for (const h of serverHistory) {
                      if (mergedHistory.length > 0 && h === mergedHistory[0]) break;
                      newItems.push(h);
                    }
                    
                    if (newItems.length > 0) {
                      mergedHistory = [...newItems, ...mergedHistory].slice(0, 50);
                      historyUpdated = true;
                    }
                  }
                }

                if (historyUpdated) {
                  localStorage.setItem('aviator_history', JSON.stringify(mergedHistory));
                }

                if (!statusChanged && !multChanged && !timerChanged && !historyUpdated && isSynced) {
                  return prev;
                }

                return {
                  ...data,
                  history: mergedHistory
                };
              });
              setIsSynced(true);
            }
          } else {
            console.warn("API returned non-JSON response");
            setApiAvailable(false);
            setIsSynced(true);
          }
        } else {
          setApiAvailable(false);
          setIsSynced(true);
        }
      } catch (err) {
        console.error("Polling error:", err);
        setApiAvailable(false);
        setIsSynced(true);
      } finally {
        isPollingRef.current = false;
      }
    };

    interval = setInterval(poll, 1000); // Poll once per second for server state correction
    return () => clearInterval(interval);
  }, [apiAvailable]);

  // Reset bets on crash
  useEffect(() => {
    if (gameState.status === GameStatus.CRASHED) {
      setBet1(prev => prev ? null : null);
      setBet2(prev => prev ? null : null);
    }
  }, [gameState.status]);

  const handlePlaceBet = async (num: 1 | 2) => {
    if (gameState?.status !== GameStatus.WAITING) return;
    
    const amount = num === 1 ? betAmount1 : betAmount2;

    if (amount < 16) return alert('Minimum bet is Rs 16.00');

    if (balance >= amount) {
      // Optimistic Update
      setBalance(prev => prev - amount);
      
      if (user) {
        const userRef = doc(db, 'users', user.uid);
        updateDoc(userRef, {
          balance: increment(-amount)
        }).catch(() => {
          setBalance(prev => prev + amount); // Rollback on failure
        });
      }

      if (num === 1) {
        setBet1({ amount: betAmount1, active: true });
      } else if (num === 2) {
        setBet2({ amount: betAmount2, active: true });
      }
    }
  };

  const handleCashOut = async (num: 1 | 2) => {
    if (gameState?.status !== GameStatus.FLYING) return;

    // Remove artificial delay for "Full Fast" responsiveness
    const bet = num === 1 ? bet1 : bet2;
    if (!bet?.active) return;

    const win = Math.floor(bet.amount * gameState.currentMultiplier * 100) / 100;
    
    // Optimistic Update
    setBalance(prev => prev + win);

    if (user) {
      const userRef = doc(db, 'users', user.uid);
      updateDoc(userRef, {
        balance: increment(win)
      }).catch(() => {
        setBalance(prev => prev - win); // Rollback on failure
      });
    }

    if (num === 1) setBet1(null);
    else if (num === 2) setBet2(null);

    setLastWin(win);
    setTimeout(() => setLastWin(null), 3000);
  };

  if (!gameState || !gameState.status) return <div className="min-h-screen bg-[#0b0c0f] flex items-center justify-center text-white font-mono tracking-tighter uppercase">Initializing Engine...</div>;

  const isInWaiting = gameState.status === GameStatus.WAITING;
  const isFlying = gameState.status === GameStatus.FLYING;
  const isCrashed = gameState.status === GameStatus.CRASHED;

  // Path Calculation - Enhanced for Dynamic Rotation and Speed
  const calcCoords = (mult: number) => {
    const p = Math.min(100, Math.max(0, (mult - 1) * 32));
    const x = 10 + (p * 0.82);
    const y = 88 - (Math.pow(p / 10, 1.85) * 15);
    return { x, y };
  };

  const coords = calcCoords(gameState.currentMultiplier);
  const nextCoords = calcCoords(gameState.currentMultiplier + 0.05);
  
  // Dynamic rotation using atan2 for precise "nose-forward" direction
  const dx = nextCoords.x - coords.x;
  const dy = nextCoords.y - coords.y;
  // Adjustment: Lucide Plane icon points ~45 deg by default. 
  // atan2 returns ~ -30deg for common flight. We adjust so nose follows line.
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  
  const planeX = Math.min(88, coords.x);
  const planeY = Math.max(12, coords.y);
  const flightRotation = isFlying ? (angle + 45) : 0; // +45 to normalize Lucide icon

  return (
    <div className="min-h-screen bg-[#0a0a0b] text-[#e2e2e7] font-sans selection:bg-accent-red/30 pb-20 lg:pb-0">
      {/* Top Bar */}
      <header className="h-[50px] lg:h-[60px] glass flex items-center justify-between px-2 lg:px-6 sticky top-0 z-[100] rounded-none border-t-0 border-x-0 border-b border-white/5 bg-black/80 backdrop-blur-xl">
        <div className="flex items-center gap-1.5 lg:gap-3" onClick={() => setActiveTab('home')}>
          <div className="w-7 h-7 lg:w-9 lg:h-9 bg-accent-red rounded flex items-center justify-center shadow-[0_0_15px_rgba(255,59,59,0.4)] shrink-0 cursor-pointer">
            <Plane className="w-4 h-4 lg:w-5 lg:h-5 text-white fill-current -rotate-45" />
          </div>
          <div className="flex flex-col lg:flex-row lg:items-baseline lg:gap-2 cursor-pointer">
            <span className="font-black text-xs lg:text-xl italic tracking-tighter uppercase text-white leading-none">AVIATOR</span>
            <span className="text-[7px] lg:text-[10px] font-black text-accent-red uppercase tracking-[0.2em] leading-none">PRO</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 lg:gap-4 shrink-0">
          {!user ? (
            <button 
              onClick={() => setShowAuthModal(true)}
              className="px-4 py-1.5 bg-accent-red text-white text-[9px] lg:text-xs font-black rounded-md hover:bg-accent-red/80 transition-all uppercase tracking-widest whitespace-nowrap shadow-[0_5px_15px_rgba(255,59,59,0.2)]"
            >
              SIGN UP
            </button>
          ) : (
            <div className="flex items-center gap-1.5 lg:gap-3">
              {isAdmin && (
                <button 
                  onClick={() => setShowAdminPanel(true)}
                  className="p-1.5 bg-accent-blue/10 text-accent-blue rounded-md border border-accent-blue/20 hover:bg-accent-blue/20"
                >
                  <Shield className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
                </button>
              )}
              <div className="flex items-center gap-1.5 lg:gap-2 px-3 py-1 bg-black/40 rounded-lg border border-white/10">
                <span className="text-[6px] lg:text-[8px] font-bold text-gray-500 uppercase tracking-widest mb-0.5">Balance</span>
                <span className="text-[10px] lg:text-sm font-bold text-[#2ecc71] tracking-tight whitespace-nowrap">
                  {formatCurrency(balance)}
                </span>
              </div>
            </div>
          )}
          <div className="hidden xs:flex items-center gap-1 text-[9px] lg:text-xs font-bold px-1.5 lg:px-3 py-1 bg-accent-blue/10 rounded-lg text-accent-blue border border-accent-blue/20">
             <span className="animate-pulse">●</span>
             <span>LIVE</span>
          </div>
        </div>
      </header>

      {/* View Switcher */}
      <div className="min-h-[calc(100vh-120px)]">
        {activeTab === 'home' && (
          <main className="max-w-[1400px] mx-auto p-2 grid grid-cols-1 lg:grid-cols-4 gap-2">
            {/* Center - Game Display */}
            <div className="lg:col-span-3 order-1 lg:order-2 flex flex-col gap-2">
              
              {/* History Bar */}
              <div className="glass rounded-xl p-1 flex sm:p-1.5 items-center gap-1 sm:gap-2 overflow-hidden relative">
                <div className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto no-scrollbar py-0.5 flex-1">
                  {gameState.history.map((h, i) => (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      key={i} 
                      className={`px-1.5 py-0.5 rounded-full text-[9px] sm:text-[11px] font-bold shrink-0 shadow-sm border ${
                        h >= 10.0 ? 'text-pink-400 border-pink-400/30 bg-pink-400/5' :
                        h >= 2.0 ? 'text-accent-blue border-accent-blue/30 bg-accent-blue/5' : 
                        'text-gray-400 border-white/10 bg-white/5'
                      }`}
                    >
                      {h.toFixed(2)}x
                    </motion.div>
                  ))}
                  {gameState.history.length === 0 && (
                    <div className="text-[9px] font-bold text-gray-600 uppercase tracking-widest px-2">Waiting for results...</div>
                  )}
                </div>
                <button 
                  onClick={() => setShowFullHistory(true)}
                  className="p-1 px-2 bg-white/10 hover:bg-white/20 rounded-lg text-white/80 transition-colors shrink-0 flex items-center gap-1 border border-white/5 ml-1"
                >
                  <History className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  <span className="text-[9px] sm:text-[10px] font-black uppercase">MORE</span>
                </button>
              </div>

              {/* Full History Modal */}
              <AnimatePresence>
                {showFullHistory && (
                  <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      onClick={() => setShowFullHistory(false)}
                      className="absolute inset-0 bg-black/80 backdrop-blur-md" 
                    />
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95, y: 20 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: 20 }}
                      className="relative w-full max-w-md bg-[#16171d] rounded-2xl border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[75vh]"
                    >
                      <div className="p-4 border-b border-white/5 flex items-center justify-between bg-black/20">
                        <div className="flex items-center gap-2">
                           <History className="w-4 h-4 text-gray-400" />
                           <span className="font-black text-xs uppercase tracking-widest text-white">Full Crash History</span>
                        </div>
                        <button onClick={() => setShowFullHistory(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/5 text-gray-400 hover:text-white transition-colors">&times;</button>
                      </div>
                      <div className="p-4 overflow-y-auto grid grid-cols-4 sm:grid-cols-5 gap-2 custom-scrollbar">
                        {gameState.history.map((h, i) => (
                          <div 
                            key={i} 
                            className={`px-2 py-2.5 rounded-xl text-[10px] font-black text-center border shadow-sm ${
                              h >= 10.0 ? 'bg-pink-400/10 text-pink-400 border-pink-400/20' :
                              h >= 2.0 ? 'bg-accent-blue/10 text-accent-blue border-accent-blue/20' : 
                              'bg-white/5 text-gray-400 border-white/5'
                            }`}
                          >
                            {h.toFixed(2)}x
                          </div>
                        ))}
                        {gameState.history.length === 0 && (
                          <div className="col-span-full py-20 text-center text-gray-500 font-bold uppercase tracking-widest text-[10px]">No history yet</div>
                        )}
                      </div>
                      <div className="p-4 bg-black/20 border-t border-white/5 text-center">
                         <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">Last 50 Rounds</span>
                      </div>
                    </motion.div>
                  </div>
                )}
              </AnimatePresence>

          {/* Game Area */}
          <div className="relative aspect-[16/10] sm:aspect-video lg:flex-1 bg-[#0d0d10] rounded-xl border border-white/5 overflow-hidden flex flex-col items-center justify-center shadow-[inset_0_0_100px_rgba(255,20,20,0.05)] min-h-[240px] lg:min-h-[460px]">
            {!isSynced && (
              <div className="absolute inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                  <div className="w-8 h-8 border-4 border-accent-red border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-[10px] font-black tracking-widest text-white/50 uppercase">Syncing Engine...</span>
                </div>
              </div>
            )}
            {/* Speed Parallax Background Layers */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
               {/* Distant Stars/Dots */}
               <motion.div 
                 className="absolute inset-0 opacity-[0.1]"
                 animate={isFlying ? { backgroundPosition: ['0px 0px', '-400px 0px'] } : {}}
                 transition={{ duration: 15 / Math.sqrt(gameState.currentMultiplier), repeat: Infinity, ease: "linear" }}
                 style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '100px 100px' }}
               />
               
               {/* Moving Speed Lines */}
               {isFlying && [...Array(12)].map((_, i) => (
                 <motion.div
                   key={i}
                   initial={{ x: '120%', y: `${Math.random() * 100}%` }}
                   animate={{ x: '-20%' }}
                   transition={{ 
                     duration: 1 / (0.5 + gameState.currentMultiplier * 0.4), 
                     repeat: Infinity, 
                     ease: "linear",
                     delay: Math.random() * 1.5
                   }}
                   className="absolute h-[1px] bg-gradient-to-r from-transparent via-white/40 to-transparent"
                   style={{ width: `${80 + Math.random() * 150}px` }}
                 />
               ))}

               {/* Atmospheric "Clouds" or Glow blobs for speed depth */}
               {isFlying && [...Array(4)].map((_, i) => (
                 <motion.div
                   key={`cloud-${i}`}
                   initial={{ x: '150%', y: `${10 + Math.random() * 80}%` }}
                   animate={{ x: '-50%' }}
                   transition={{ 
                     duration: 3 / Math.sqrt(gameState.currentMultiplier), 
                     repeat: Infinity, 
                     ease: "linear",
                     delay: i * 0.8
                   }}
                   className="absolute w-64 h-32 bg-accent-red/5 blur-[80px] rounded-full"
                 />
               ))}
            </div>

            {/* Grid Background - With perspective-like movement */}
            <motion.div 
              className="absolute inset-0 opacity-[0.03] pointer-events-none" 
              animate={isFlying ? { backgroundPosition: ['0px 0px', '-200px 200px'] } : {}}
              transition={{ duration: 3 / Math.sqrt(gameState.currentMultiplier), repeat: Infinity, ease: "linear" }}
              style={{ 
                backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`, 
                backgroundSize: '60px 60px' 
              }} 
            />

            {/* Flying Multiplier */}
            <div className="z-10 text-center select-none px-4">
              <AnimatePresence mode="wait">
                {isInWaiting && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 1.1 }}
                    className="flex flex-col items-center gap-2"
                  >
                    <span className="text-gray-500 text-[8px] lg:text-[10px] font-bold uppercase tracking-[0.5em] mb-1 lg:mb-4 opacity-50">Next Flight</span>
                    <span className="text-5xl lg:text-9xl font-black text-white italic drop-shadow-[0_0_30px_rgba(255,255,255,0.15)]">{gameState.timer}</span>
                  </motion.div>
                )}
                
                {isFlying && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col items-center"
                  >
                    <span className="text-5xl lg:text-[120px] font-extrabold text-white tracking-tighter drop-shadow-[0_0_40px_rgba(255,59,59,0.4)] italic">
                      {gameState.currentMultiplier.toFixed(2)}x
                    </span>
                  </motion.div>
                )}

                {isCrashed && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col items-center"
                  >
                    <div className="bg-accent-red px-4 lg:px-8 py-1 lg:py-2 rounded-lg lg:rounded-xl mb-3 lg:mb-6 shadow-[0_10px_30px_rgba(255,59,59,0.5)]">
                       <span className="text-white text-[10px] lg:text-base font-black uppercase tracking-widest italic leading-none block py-1">FLEW AWAY!</span>
                    </div>
                    <span className="text-6xl lg:text-9xl font-extrabold text-accent-red italic drop-shadow-[0_0_30px_rgba(255,59,59,0.4)]">
                      {gameState.currentMultiplier.toFixed(2)}x
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Flight Graphics */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
               {/* Curved Path SVG */}
               <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                 {isFlying && (
                   <motion.path
                     d={`M 10 88 Q ${10 + (planeX - 10) * 0.3} 88 ${planeX} ${planeY}`}
                     fill="none"
                     stroke="url(#pathGradient)"
                     strokeWidth="1.5"
                     strokeLinecap="round"
                     initial={{ pathLength: 0 }}
                     animate={{ pathLength: 1 }}
                     transition={{ duration: 0.1 }}
                   />
                 )}
                 <defs>
                   <linearGradient id="pathGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                     <stop offset="0%" stopColor="transparent" />
                     <stop offset="100%" stopColor="var(--color-accent-red)" />
                   </linearGradient>
                 </defs>
               </svg>

               {/* Plane Icon */}
               <AnimatePresence>
                 {(isFlying || isCrashed) && (
                   <motion.div
                     initial={{ left: "10%", top: "85%", rotate: -25 }}
                     animate={isFlying ? { 
                       left: `${planeX}%`, 
                       top: `${planeY}%`,
                       rotate: flightRotation
                     } : {
                        left: `${planeX + 50}%`,
                        top: `${planeY - 50}%`,
                        opacity: [1, 0]
                     }}
                     transition={isFlying ? { duration: 0.1, ease: "linear" } : { duration: 1, ease: "easeIn" }}
                     className="absolute"
                     style={{ transform: 'translate(-50%, -50%)' }}
                   >
                     <div className="relative">
                        {/* Red Aviator Style Plane */}
                        <Plane className="w-12 h-12 lg:w-24 lg:h-24 text-accent-red fill-current drop-shadow-[0_0_20px_rgba(255,59,59,0.9)]" />
                        
                        {/* More intense exhaust trail */}
                        {isFlying && (
                          <motion.div 
                            animate={{ opacity: [0.4, 0.8, 0.4] }}
                            transition={{ duration: 0.2, repeat: Infinity }}
                            className="absolute top-1/2 right-[100%] w-32 h-2 bg-gradient-to-l from-accent-red to-transparent opacity-60 blur-[2px] rounded-full" 
                            style={{ transform: 'translateY(-50%) rotate(5deg)', transformOrigin: 'right center' }}
                          />
                        )}
                     </div>
                   </motion.div>
                 )}
               </AnimatePresence>
            </div>

            {/* Algorithm Info */}
            <div className="absolute bottom-4 right-6 flex items-center gap-3 bg-black/60 px-4 py-2 rounded-xl border border-white/10 backdrop-blur-md">
              <div className="flex flex-col items-end">
                <span className="text-[8px] text-gray-500 font-bold uppercase tracking-widest">Algorithm Pro V2</span>
                <code className="text-[10px] text-accent-blue font-mono">HASH: {Math.random().toString(16).slice(2, 10)}...</code>
              </div>
            </div>

            {/* Win Toast */}
             <AnimatePresence>
              {lastWin && (
                <motion.div
                  initial={{ opacity: 0, y: 50, scale: 0.5 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -50, scale: 0.8 }}
                  className="absolute bottom-32 z-50 px-10 py-5 bg-[#2ecc71] rounded-3xl shadow-[0_20px_50px_rgba(40,204,113,0.4)] text-white flex flex-col items-center"
                >
                  <span className="text-[10px] font-black uppercase tracking-[.4em] mb-2 text-white/70 italic">Nice Catch!</span>
                  <span className="font-black italic text-4xl tracking-tighter">+{formatCurrency(lastWin)}</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Dual Controls Panel */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 lg:gap-4">
            {/* Bet Panel 1 */}
            <div className="bg-[#1b1b21] rounded-xl lg:rounded-2xl p-2 lg:p-6 border-l-4 border-accent-red shadow-2xl relative overflow-hidden flex flex-row gap-2 lg:gap-6 items-center">
               <div className="absolute top-0 left-0 w-1 h-full bg-accent-red" />
               <div className="flex flex-col gap-2 lg:gap-4 w-24 lg:w-44 shrink-0">
                  <div className="flex gap-1 lg:gap-2">
                    <button onClick={() => setBetAmount1(b => Math.max(16, b - 1))} className="bg-black/40 text-gray-400 p-1 lg:p-2 rounded-md w-full text-[10px] lg:text-xs border border-white/5 hover:text-white transition-colors">-</button>
                    <button onClick={() => setBetAmount1(b => b + 1)} className="bg-black/40 text-gray-400 p-1 lg:p-2 rounded-md w-full text-[10px] lg:text-xs border border-white/5 hover:text-white transition-colors">+</button>
                  </div>
                  <input 
                    type="number"
                    value={betAmount1}
                    onChange={(e) => setBetAmount1(Math.max(0, Number(e.target.value)))}
                    className="bg-[#0d0d10] border border-[#32323d] rounded-lg p-1.5 lg:p-3 text-center font-bold text-base lg:text-2xl text-white w-full outline-none focus:border-accent-red/50"
                  />
                  <div className="grid grid-cols-2 gap-1 lg:gap-2">
                    {[16, 32, 64, 100].map(v => (
                      <button key={v} onClick={() => setBetAmount1(v)} className={`bg-white/5 rounded py-1 lg:py-2 text-[8px] lg:text-xs font-bold transition-all ${betAmount1 === v ? 'bg-accent-red text-white shadow-[0_0_10px_rgba(255,59,59,0.3)]' : 'text-gray-400 hover:bg-white/10'}`}>
                        {v}
                      </button>
                    ))}
                  </div>
               </div>
               
               <div className="flex-1 self-stretch flex flex-col">
                {!bet1?.active ? (
                  <button 
                    disabled={!isInWaiting || balance < betAmount1} 
                    onClick={() => handlePlaceBet(1)} 
                    className={`flex-1 rounded-xl font-black text-lg lg:text-3xl flex flex-col items-center justify-center transition-all active:scale-90 ${
                      isInWaiting && balance >= betAmount1 
                        ? 'bg-[#28a745] text-white shadow-[0_10px_20px_rgba(40,167,69,0.3)] cursor-pointer hover:bg-[#2ecc71]' 
                        : 'bg-white/5 text-gray-600 cursor-not-allowed opacity-50'
                    }`}
                  >
                    <span className="leading-none mb-0.5 lg:mb-1">BET</span>
                    <span className="text-[8px] lg:text-[14px] opacity-60 font-normal uppercase tracking-widest leading-none">
                      {formatCurrency(betAmount1)}
                    </span>
                  </button>
                ) : (
                  <button 
                    disabled={!isFlying} 
                    onClick={() => handleCashOut(1)}
                    className={`flex-1 rounded-xl font-black text-lg lg:text-3xl flex flex-col items-center justify-center transition-all active:scale-95 ${
                      isFlying 
                        ? 'bg-[#f39c12] text-white shadow-[0_10px_20px_rgba(243,156,18,0.3)] cursor-pointer' 
                        : 'bg-white/5 text-gray-600'
                    }`}
                  >
                    <span className="leading-none mb-0.5 lg:mb-1">OUT</span>
                    {isFlying && (
                      <motion.span 
                        animate={{ scale: [1, 1.1, 1] }} 
                        transition={{ repeat: Infinity, duration: 0.5 }}
                        className="text-[8px] lg:text-[14px] text-white font-bold"
                      >
                        {formatCurrency(bet1.amount * gameState.currentMultiplier)}
                      </motion.span>
                    )}
                  </button>
                )}
               </div>
            </div>

            {/* Bet Panel 2 */}
            <div className="bg-[#1b1b21] rounded-xl lg:rounded-2xl p-2 lg:p-6 border-l-4 border-accent-blue shadow-2xl relative overflow-hidden flex flex-row gap-2 lg:gap-6 items-center">
               <div className="absolute top-0 left-0 w-1 h-full bg-accent-blue" />
               <div className="flex flex-col gap-2 lg:gap-4 w-24 lg:w-44 shrink-0">
                  <div className="flex gap-1 lg:gap-2">
                    <button onClick={() => setBetAmount2(b => Math.max(16, b - 1))} className="bg-black/40 text-gray-400 p-1 lg:p-2 rounded-md w-full text-[10px] lg:text-xs border border-white/5 hover:text-white transition-colors">-</button>
                    <button onClick={() => setBetAmount2(b => b + 1)} className="bg-black/40 text-gray-400 p-1 lg:p-2 rounded-md w-full text-[10px] lg:text-xs border border-white/5 hover:text-white transition-colors">+</button>
                  </div>
                  <input 
                    type="number"
                    value={betAmount2}
                    onChange={(e) => setBetAmount2(Math.max(0, Number(e.target.value)))}
                    className="bg-[#0d0d10] border border-[#32323d] rounded-lg p-1.5 lg:p-3 text-center font-bold text-base lg:text-2xl text-white w-full outline-none focus:border-accent-blue/50"
                  />
                  <div className="grid grid-cols-2 gap-1 lg:gap-2">
                    {[16, 32, 64, 100].map(v => (
                      <button key={v} onClick={() => setBetAmount2(v)} className={`bg-white/5 rounded py-1 lg:py-2 text-[8px] lg:text-xs font-bold transition-all ${betAmount2 === v ? 'bg-accent-blue text-white shadow-[0_0_10px_rgba(52,152,219,0.3)]' : 'text-gray-400 hover:bg-white/10'}`}>
                        {v}
                      </button>
                    ))}
                  </div>
               </div>
               
               <div className="flex-1 self-stretch flex flex-col">
                {!bet2?.active ? (
                  <button 
                    disabled={!isInWaiting || balance < betAmount2} 
                    onClick={() => handlePlaceBet(2)} 
                    className={`flex-1 self-stretch rounded-xl font-black text-lg lg:text-3xl flex flex-col items-center justify-center transition-all active:scale-90 ${
                      isInWaiting && balance >= betAmount2 
                        ? 'bg-[#28a745] text-white shadow-[0_10px_20px_rgba(40,167,69,0.3)] cursor-pointer hover:bg-[#2ecc71]' 
                        : 'bg-white/5 text-gray-600 cursor-not-allowed opacity-50'
                    }`}
                  >
                    <span className="leading-none mb-0.5 lg:mb-1">BET</span>
                    <span className="text-[8px] lg:text-[14px] opacity-60 font-normal uppercase tracking-widest leading-none">
                      {formatCurrency(betAmount2)}
                    </span>
                  </button>
                ) : (
                  <button 
                    disabled={!isFlying} 
                    onClick={() => handleCashOut(2)}
                    className={`flex-1 self-stretch rounded-xl font-black text-lg lg:text-3xl flex flex-col items-center justify-center transition-all active:scale-95 ${
                      isFlying 
                        ? 'bg-[#f39c12] text-white shadow-[0_10px_20px_rgba(243,156,18,0.3)] cursor-pointer' 
                        : 'bg-white/5 text-gray-600'
                    }`}
                  >
                    <span className="leading-none mb-0.5 lg:mb-1">OUT</span>
                    {isFlying && (
                      <motion.span 
                        animate={{ scale: [1, 1.1, 1] }} 
                        transition={{ repeat: Infinity, duration: 0.5 }}
                        className="text-[8px] lg:text-[14px] text-white font-bold"
                      >
                        {formatCurrency(bet2.amount * gameState.currentMultiplier)}
                      </motion.span>
                    )}
                  </button>
                )}
               </div>
            </div>
          </div>

        </div>

        {/* Sidebar - History & Leaderboard (Now after game for mobile "Bottom" layout) */}
        <div className="lg:col-span-1 order-2 lg:order-1 flex flex-col gap-2">
          <div className="glass rounded-xl overflow-hidden flex flex-col h-[400px] lg:h-[720px]">
             <div className="p-3 border-b border-white/5 flex justify-between items-center bg-black/20">
                <span className="text-xs font-bold uppercase tracking-wider text-gray-400">All Bets</span>
                <span className="text-[10px] bg-white/10 px-2 py-0.5 rounded-full text-white">{400 + liveBets.length}</span>
             </div>
             <div className="flex-1 overflow-y-auto custom-scrollbar bg-black/10">
                <table className="w-full text-[11px] border-collapse">
                  <thead>
                    <tr className="text-gray-500 border-b border-white/5 sticky top-0 bg-[#0a0a0b] z-10">
                      <th className="text-left p-3 font-semibold uppercase tracking-wider">User</th>
                      <th className="text-right p-3 font-semibold uppercase tracking-wider">Bet</th>
                      <th className="text-right p-3 font-semibold uppercase tracking-wider">Mult</th>
                      <th className="text-right p-3 font-semibold uppercase tracking-wider">Win</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-gray-400">
                    {/* User's Current Bets */}
                    {(bet1?.active || bet2?.active) && (
                      <>
                        {bet1?.active && (
                          <tr className="bg-accent-red/10 border-l-2 border-accent-red">
                            <td className="p-2 pl-3 font-bold text-white">YOU</td>
                            <td className="text-right p-2 text-white/90">{formatCurrency(bet1.amount)}</td>
                            <td className="text-right p-2">-</td>
                            <td className="text-right p-2">-</td>
                          </tr>
                        )}
                        {bet2?.active && (
                          <tr className="bg-accent-blue/10 border-l-2 border-accent-blue">
                            <td className="p-2 pl-3 font-bold text-white">YOU</td>
                            <td className="text-right p-2 text-white/90">{formatCurrency(bet2.amount)}</td>
                            <td className="text-right p-2">-</td>
                            <td className="text-right p-2">-</td>
                          </tr>
                        )}
                      </>
                    )}

                    {liveBets.map((bet, i) => (
                      <tr key={i} className={`hover:bg-white/5 transition-colors group ${bet.cashedOut ? 'bg-[#2ecc71]/5' : ''}`}>
                        <td className="p-2 pl-3 font-medium group-hover:text-white">{bet.user}</td>
                        <td className="text-right p-2 text-white/80">{formatCurrency(bet.amount)}</td>
                        <td className="text-right p-2">
                          {bet.cashedOut ? (
                            <span className="text-accent-blue font-bold italic">{bet.cashOutAt.toFixed(2)}x</span>
                          ) : (
                            <span className="opacity-20">-</span>
                          )}
                        </td>
                        <td className="text-right p-2 font-bold">
                          {bet.cashedOut ? (
                            <span className="text-[#2ecc71]">{formatCurrency(bet.win)}</span>
                          ) : (
                            <span className="opacity-20">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
             </div>
          </div>
        </div>
      </main>
        )}

        {activeTab === 'history' && (
          <div className="max-w-2xl mx-auto p-4">
             <div className="glass rounded-2xl overflow-hidden shadow-2xl">
                <div className="p-6 border-b border-white/5 bg-black/40 flex items-center gap-3">
                  <div className="w-10 h-10 bg-accent-blue/20 rounded-xl flex items-center justify-center text-accent-blue shadow-[0_0_20px_rgba(52,152,219,0.3)]">
                    <History className="w-6 h-6" />
                  </div>
                  <h2 className="text-xl font-black italic tracking-tighter uppercase">Global History</h2>
                </div>
                <div className="p-4 overflow-y-auto max-h-[60vh] custom-scrollbar">
                   <table className="w-full text-sm">
                      <thead className="text-gray-500 uppercase text-[10px] font-black tracking-widest">
                        <tr className="border-b border-white/5">
                           <th className="text-left py-3">Round</th>
                           <th className="text-right py-3">Multiplier</th>
                           <th className="text-right py-3">Hash</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {gameState.history.map((h, i) => (
                           <tr key={i} className="hover:bg-white/5 transition-colors">
                              <td className="py-3 text-gray-400 font-mono text-xs">#{5000 - i}</td>
                              <td className={`py-3 text-right font-black italic ${h >= 2 ? 'text-accent-blue' : 'text-accent-red'}`}>{h.toFixed(2)}x</td>
                              <td className="py-3 text-right text-gray-600 font-mono text-[9px] uppercase">{(i * 12345678).toString(16).padEnd(10, '0')}</td>
                           </tr>
                        ))}
                      </tbody>
                   </table>
                </div>
             </div>
          </div>
        )}

        {activeTab === 'wallet' && (
          <div className="max-w-xl mx-auto p-4 flex flex-col gap-4">
             <div className="glass rounded-2xl p-6 bg-gradient-to-br from-black/40 to-black/20 shadow-2xl">
                <div className="flex items-center gap-3 mb-8">
                   <div className="w-12 h-12 bg-[#2ecc71]/20 rounded-2xl flex items-center justify-center text-[#2ecc71] shadow-[0_0_20px_rgba(46,204,113,0.3)]">
                      <Wallet className="w-7 h-7" />
                   </div>
                   <div>
                      <h2 className="text-xl font-black italic tracking-tighter uppercase leading-none">Wallet</h2>
                      <p className="text-[10px] text-gray-500 uppercase tracking-widest mt-1">Manage your funds</p>
                   </div>
                </div>

                <div className="grid grid-cols-1 gap-4">
                   <div className="p-6 bg-black/40 rounded-xl border border-white/5 group hover:border-[#2ecc71]/50 transition-all cursor-pointer" onClick={() => setShowTransModal({ open: true, type: 'deposit' })}>
                      <div className="flex items-center justify-between">
                         <div className="flex items-center gap-4">
                            <div className="p-3 bg-[#2ecc71]/10 text-[#2ecc71] rounded-xl group-hover:scale-110 transition-transform">
                               <ArrowUpCircle className="w-6 h-6" />
                            </div>
                            <div>
                               <h3 className="font-bold text-white uppercase tracking-tight">Deposit Funds</h3>
                               <p className="text-[10px] text-gray-500 uppercase tracking-widest">Instant funding via Crypto/UPI</p>
                            </div>
                         </div>
                         <ChevronRight className="w-5 h-5 text-gray-700" />
                      </div>
                   </div>

                   <div className="p-6 bg-black/40 rounded-xl border border-white/5 group hover:border-accent-red/50 transition-all cursor-pointer" onClick={() => setShowTransModal({ open: true, type: 'withdrawal' })}>
                      <div className="flex items-center justify-between">
                         <div className="flex items-center gap-4">
                            <div className="p-3 bg-accent-red/10 text-accent-red rounded-xl group-hover:scale-110 transition-transform">
                               <ArrowDownCircle className="w-6 h-6" />
                            </div>
                            <div>
                               <h3 className="font-bold text-white uppercase tracking-tight">Withdraw Funds</h3>
                               <p className="text-[10px] text-gray-500 uppercase tracking-widest">Fast withdrawal to your account</p>
                            </div>
                         </div>
                         <ChevronRight className="w-5 h-5 text-gray-700" />
                      </div>
                   </div>
                </div>
             </div>

             <div className="glass rounded-2xl p-6 shadow-xl">
                 <h3 className="text-xs font-black uppercase tracking-widest text-gray-400 mb-4 px-2">Recent Transactions</h3>
                 <div className="space-y-2">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/5 opacity-50">
                         <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-white/5 rounded-lg flex items-center justify-center text-gray-500">
                               <History className="w-4 h-4" />
                            </div>
                            <div>
                               <div className="text-[11px] font-bold text-white uppercase">Withdrawal</div>
                               <div className="text-[8px] text-gray-600 uppercase tracking-widest">May {i+1}, 2024</div>
                            </div>
                         </div>
                         <div className="text-right">
                            <div className="text-[11px] font-bold text-accent-red">-Rs 500.00</div>
                            <div className="text-[8px] text-accent-red uppercase font-bold tracking-widest">Processing</div>
                         </div>
                      </div>
                    ))}
                 </div>
             </div>
          </div>
        )}

        {activeTab === 'invite' && (
          <div className="max-w-xl mx-auto p-4 flex flex-col gap-4">
             <div className="glass rounded-2xl p-8 bg-gradient-to-br from-[#2ecc71]/10 to-transparent border-[#2ecc71]/20 shadow-2xl text-center">
                <div className="w-20 h-20 bg-[#2ecc71]/20 text-[#2ecc71] rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-[0_20px_40px_rgba(46,204,113,0.2)]">
                  <Heart className="w-10 h-10 fill-current" />
                </div>
                <h2 className="text-3xl font-black italic tracking-tighter uppercase mb-2">Refer & Earn</h2>
                <p className="text-gray-400 text-sm mb-8 px-8">Invite your friends to Aviator Pro and earn up to 5% of their total bets for life!</p>
                
                <div className="bg-black/40 rounded-xl p-3 lg:p-4 border border-white/5 flex flex-col sm:sm:row items-stretch sm:items-center gap-3 group">
                   <div className="flex-1 text-left min-w-0">
                      <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1 px-1">Your Referral Link</span>
                      <div className="text-[10px] sm:text-xs font-mono text-[#2ecc71] truncate bg-black/60 px-3 py-2.5 rounded-lg border border-white/5 select-all overflow-hidden whitespace-nowrap">
                        https://pk7234-bet.pages.dev/r/{user?.uid?.slice(0, 8) || 'signup'}
                      </div>
                   </div>
                   <button 
                     onClick={() => {
                        navigator.clipboard.writeText(`https://pk7234-bet.pages.dev/r/${user?.uid?.slice(0, 8) || 'signup'}`);
                        alert('Link copied to clipboard!');
                     }}
                     className="bg-accent-blue p-2.5 sm:p-3 rounded-xl text-white shadow-lg hover:bg-accent-blue/80 active:scale-95 transition-all flex items-center justify-center gap-2 shrink-0"
                   >
                      <Copy className="w-4 h-4 sm:w-5 sm:h-5" />
                      <span className="sm:hidden text-[10px] font-bold uppercase tracking-[0.2em]">Copy Link</span>
                   </button>
                </div>

                <div className="grid grid-cols-3 gap-2 mt-8">
                   <div className="bg-black/20 p-4 rounded-xl border border-white/5">
                      <span className="text-xl font-black text-white block">0</span>
                      <span className="text-[8px] text-gray-500 uppercase tracking-widest font-black">Referrals</span>
                   </div>
                   <div className="bg-black/20 p-4 rounded-xl border border-white/5">
                      <span className="text-xl font-black text-[#2ecc71] block">Rs 0</span>
                      <span className="text-[8px] text-gray-500 uppercase tracking-widest font-black">Earned</span>
                   </div>
                   <div className="bg-black/20 p-4 rounded-xl border border-white/5">
                      <span className="text-xl font-black text-accent-blue block">5%</span>
                      <span className="text-[8px] text-gray-500 uppercase tracking-widest font-black">Commission</span>
                   </div>
                </div>
             </div>
          </div>
        )}

        {activeTab === 'profile' && (
          <div className="max-w-xl mx-auto p-4 flex flex-col gap-4">
             <div className="glass rounded-2xl overflow-hidden shadow-2xl">
                <div className="h-24 bg-gradient-to-r from-accent-red to-[#2ecc71] opacity-20" />
                <div className="px-8 pb-8 -mt-12 text-center">
                   <div className="w-24 h-24 bg-[#1b1b21] rounded-3xl border-4 border-[#0a0a0b] mx-auto flex items-center justify-center mb-4 overflow-hidden relative group">
                      <div className="w-full h-full bg-accent-blue flex items-center justify-center text-3xl font-black italic text-white group-hover:scale-110 transition-transform">
                         {user?.email?.charAt(0).toUpperCase()}
                      </div>
                   </div>
                   <h2 className="text-xl font-black italic tracking-tighter uppercase text-white">{user?.email?.split('@')[0]}</h2>
                   <p className="text-xs text-gray-500 font-mono mt-1">{user?.email}</p>

                   <div className="mt-8 grid grid-cols-2 gap-4">
                      <div className="bg-black/40 p-4 rounded-xl border border-white/5 text-left">
                         <span className="text-[9px] text-gray-500 uppercase tracking-widest font-black block mb-1">Total Profits</span>
                         <span className="text-lg font-black text-[#2ecc71] italic tracking-tighter">Rs 12,450.00</span>
                      </div>
                      <div className="bg-black/40 p-4 rounded-xl border border-white/5 text-left">
                         <span className="text-[9px] text-gray-500 uppercase tracking-widest font-black block mb-1">Rank</span>
                         <span className="text-lg font-black text-accent-blue italic tracking-tighter">Silver Elite</span>
                      </div>
                   </div>

                   <div className="mt-8 space-y-2">
                       <button className="w-full bg-white/5 hover:bg-white/10 p-4 rounded-xl flex items-center justify-between group transition-all text-sm font-bold border border-white/5 uppercase tracking-tighter italic">
                          <span className="flex items-center gap-3">
                            <Settings className="w-4 h-4 text-gray-400 group-hover:rotate-45 transition-transform" />
                            Security Settings
                          </span>
                          <ChevronRight className="w-4 h-4 text-gray-700" />
                       </button>
                       <button 
                         onClick={() => signOut(auth)}
                         className="w-full bg-accent-red/10 hover:bg-accent-red/20 p-4 rounded-xl flex items-center gap-3 transition-all text-sm font-bold border border-accent-red/20 text-accent-red uppercase tracking-tighter italic"
                       >
                          <LogOut className="w-4 h-4" />
                          Sign Out Account
                       </button>
                   </div>
                </div>
             </div>
          </div>
        )}
      </div>

      {/* Bottom Navbar */}
      <nav className="fixed bottom-0 left-0 right-0 h-16 bg-black/80 backdrop-blur-2xl border-t border-white/10 z-[100] px-4 flex items-center justify-between lg:justify-center lg:gap-12">
        <button onClick={() => setActiveTab('home')} className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'home' ? 'text-accent-red' : 'text-gray-500 hover:text-white'}`}>
           <Home className={`w-5 h-5 ${activeTab === 'home' ? 'fill-current' : ''}`} />
           <span className="text-[9px] font-black uppercase tracking-tighter italic">Home</span>
        </button>
        <button onClick={() => setActiveTab('history')} className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'history' ? 'text-accent-blue' : 'text-gray-500 hover:text-white'}`}>
           <History className="w-5 h-5" />
           <span className="text-[9px] font-black uppercase tracking-tighter italic">History</span>
        </button>
        <div className="relative -top-3 lg:top-0">
          <button onClick={() => setActiveTab('wallet')} className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all bg-[#0a0a0b] border-2 shadow-2xl ${activeTab === 'wallet' ? 'text-[#2ecc71] border-[#2ecc71] shadow-[#2ecc71]/30' : 'text-gray-500 border-white/10 hover:border-white/20'}`}>
             <Wallet className="w-7 h-7" />
          </button>
        </div>
        <button onClick={() => setActiveTab('invite')} className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'invite' ? 'text-[#2ecc71]' : 'text-gray-500 hover:text-white'}`}>
           <Share2 className="w-5 h-5" />
           <span className="text-[9px] font-black uppercase tracking-tighter italic">Invite</span>
        </button>
        <button onClick={() => setActiveTab('profile')} className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'profile' ? 'text-accent-blue' : 'text-gray-500 hover:text-white'}`}>
           <UserIcon className={`w-5 h-5 ${activeTab === 'profile' ? 'fill-current' : ''}`} />
           <span className="text-[9px] font-black uppercase tracking-tighter italic">Profile</span>
        </button>
      </nav>

      <footer className="max-w-[1400px] mx-auto p-4 lg:px-8 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-4 mt-4 pb-24">
         <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
               <div className="w-2 h-2 rounded-full bg-[#2ecc71] animate-pulse" />
               <span className="text-[10px] font-bold uppercase text-gray-500 tracking-widest">Random Seed Verified</span>
            </div>
            <span className="text-[10px] font-medium text-gray-600 uppercase">
              Hash Protocol Enabled ● AES-256 Security
            </span>
         </div>
         <div className="text-[10px] font-black text-gray-700 uppercase tracking-[0.4em]">
            PRO ENGINE v2.5.4
         </div>
      </footer>

      {/* Modals */}
      <AuthModal 
        isOpen={showAuthModal} 
        onClose={() => setShowAuthModal(false)} 
      />
      <AdminPanel 
        isOpen={showAdminPanel} 
        onClose={() => setShowAdminPanel(false)} 
      />
      {user && (
        <TransactionModal 
          isOpen={showTransModal.open} 
          onClose={() => setShowTransModal({ ...showTransModal, open: false })}
          type={showTransModal.type}
          userId={user.uid}
        />
      )}
    </div>
  );
}
