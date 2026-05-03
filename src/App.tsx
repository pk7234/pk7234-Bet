import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plane, History, Wallet, TrendingUp, Users, Settings, Info, Menu, LogOut, Shield, ArrowUpCircle, ArrowDownCircle, Home, Share2, User as UserIcon, ChevronRight, Copy, Heart } from 'lucide-react';
import { auth, db } from './lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, updateDoc, increment, serverTimestamp } from 'firebase/firestore';
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

export default function App() {
  const [gameState, setGameState] = useState<GameState>({
    status: GameStatus.WAITING,
    currentMultiplier: 1.0,
    startTime: Date.now(),
    crashPoint: generateCrashPoint(),
    history: [1.2, 5.4, 1.0, 2.3, 10.5],
    timer: 5
  });

  const [initialLoading, setInitialLoading] = useState(true);
  const [timeOffset, setTimeOffset] = useState(0);
  const [balance, setBalance] = useState(1000);
  const [isSynced, setIsSynced] = useState(false);
  
  // Bet 1 States
  const [betAmount1, setBetAmount1] = useState(16);
  const [bet1, setBet1] = useState<{ amount: number; active: boolean } | null>(null);
  
  // Bet 2 States
  const [betAmount2, setBetAmount2] = useState(16);
  const [bet2, setBet2] = useState<{ amount: number; active: boolean } | null>(null);
  
  const [lastWin, setLastWin] = useState<number | null>(null);
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [showTransModal, setShowTransModal] = useState<{ open: boolean, type: 'deposit' | 'withdrawal' }>({ open: false, type: 'deposit' });
  const [activeTab, setActiveTab] = useState<'home' | 'history' | 'wallet' | 'invite' | 'profile'>('home');
  const [showFullHistory, setShowFullHistory] = useState(false);

  // Dynamic Live Bets State
  const [liveBets, setLiveBets] = useState<any[]>([]);
  const lastStatusRef = useRef<GameStatus | null>(null);
  const isPollingRef = useRef(false);

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
      if (!isSynced) {
        console.warn("Global sync timed out. Starting local-only engine.");
        setIsSynced(true);
        setInitialLoading(false);
      }
    }, 3000);

    // 2. Real-time Firestore sync for the shared state
    const unsubscribe = onSnapshot(doc(db, 'game', 'state'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setGameState(prev => {
          // If we receive a status change or we haven't synced yet, take the whole state
          if (!isSynced || prev.status !== data.status) {
            return {
              ...prev,
              ...data,
              history: data.history || prev.history
            };
          }

          // If flying, only sync if drift is large to avoid jitter
          if (data.status === GameStatus.FLYING) {
            const drift = Math.abs(prev.currentMultiplier - data.currentMultiplier);
            if (drift > 0.5) { // Larger threshold for Firestore sync
              return { ...prev, ...data };
            }
          }

          // Otherwise just update history if it changed
          return {
            ...prev,
            history: data.history || prev.history
          };
        });
        setIsSynced(true);
        setInitialLoading(false);
        clearTimeout(fallbackTimer);
      }
    }, (err) => {
      const errInfo = {
        error: err.message || String(err),
        operationType: 'get',
        path: 'game/state',
        authInfo: {
          userId: auth.currentUser?.uid,
          email: auth.currentUser?.email,
          emailVerified: auth.currentUser?.emailVerified
        }
      };
      console.error('Firestore Error:', JSON.stringify(errInfo));
    });

    return () => {
      unsubscribe();
      clearTimeout(fallbackTimer);
    };
  }, [isSynced]);

  // Engine Animation Loop (Local prediction between syncs)
  useEffect(() => {
    if (!isSynced) return;
    
    const interval = setInterval(() => {
      setGameState(prev => {
        const now = Date.now() + timeOffset;
        const elapsed = (now - prev.startTime) / 1000;

        if (prev.status === GameStatus.WAITING) {
          const remaining = Math.max(0, 5 - Math.floor(elapsed));
          if (remaining <= 0) {
            // Local fallback transition if synced but server didn't push status change
            return {
              ...prev,
              status: GameStatus.FLYING,
              startTime: now,
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
            return {
              ...prev,
              status: GameStatus.CRASHED,
              currentMultiplier: prev.crashPoint,
              history: [prev.crashPoint, ...prev.history].slice(0, 10),
              startTime: now,
              timer: 3
            };
          }
          return { ...prev, currentMultiplier: actualMult };
        }

        if (prev.status === GameStatus.CRASHED) {
          const remaining = Math.max(0, 3 - Math.floor(elapsed));
          if (remaining <= 0) {
            return {
              ...prev,
              status: GameStatus.WAITING,
              startTime: now,
              timer: 5,
              currentMultiplier: 1.0
            };
          }
          if (prev.timer === remaining) return prev;
          return { ...prev, timer: remaining };
        }
        return prev;
      });
    }, 33);

    return () => clearInterval(interval);
  }, [isSynced, timeOffset]);

  // Live Bets Logic
  useEffect(() => {
    if (gameState.status !== GameStatus.FLYING) {
      if (gameState.status === GameStatus.WAITING && lastStatusRef.current !== GameStatus.WAITING) {
        setLiveBets(Array.from({ length: 15 + Math.floor(Math.random() * 10) }, (_, i) => ({
          user: `${['m', 'a', 'x', 'p', 'z'][Math.floor(Math.random() * 5)]}***${100 + Math.floor(Math.random() * 900)}`,
          user_id: `bot_${i}_${Date.now()}`,
          amount: 16 + Math.floor(Math.random() * 500),
          cashOutAt: 1.1 + Math.pow(Math.random(), 2) * 5,
          cashedOut: false,
          win: 0
        })));
      }
      lastStatusRef.current = gameState.status;
      return;
    }
    
    setLiveBets(prev => {
      let changed = false;
      const currentMult = gameState.currentMultiplier;
      const updatedBets = prev.map(bet => {
        if (!bet.cashedOut && currentMult >= bet.cashOutAt) {
          changed = true;
          return { ...bet, cashedOut: true, win: Math.floor(bet.amount * bet.cashOutAt * 100) / 100 };
        }
        return bet;
      });
      return changed ? updatedBets : prev;
    });
    lastStatusRef.current = gameState.status;
  }, [gameState.status, gameState.currentMultiplier]);

  // Auth Listener
  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const userRef = doc(db, 'users', u.uid);
        onSnapshot(userRef, (docSnap) => {
          if (docSnap.exists()) {
            setBalance(docSnap.data().balance);
            setIsAdmin(docSnap.data().role === 'admin');
          }
        }, (err) => {
          console.error("User profile sync error:", err);
        });
      }
    });
  }, []);

  const handlePlaceBet = async (num: 1 | 2) => {
    if (gameState.status !== GameStatus.WAITING) return;
    const amount = num === 1 ? betAmount1 : betAmount2;
    if (balance < amount) return alert('Insufficient balance');
    
    setBalance(prev => prev - amount);
    if (user) {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, { balance: increment(-amount) });
    }

    if (num === 1) setBet1({ amount, active: true });
    else setBet2({ amount, active: true });
  };

  const handleCashOut = async (num: 1 | 2) => {
    if (gameState.status !== GameStatus.FLYING) return;
    const bet = num === 1 ? bet1 : bet2;
    if (!bet?.active) return;

    const win = Math.floor(bet.amount * gameState.currentMultiplier * 100) / 100;
    setBalance(prev => prev + win);
    if (user) {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, { balance: increment(win) });
    }

    if (num === 1) setBet1(null);
    else setBet2(null);

    setLastWin(win);
    setTimeout(() => setLastWin(null), 3000);
  };

  const formatCurrency = (val: number) => `Rs. ${val.toFixed(2)}`;

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0a0a0b] text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-accent-red border-t-transparent rounded-full animate-spin"></div>
          <span className="font-black text-xl italic tracking-tighter uppercase text-white leading-none">AVIATOR SYNCING...</span>
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
          <span className="font-black text-xl italic tracking-tighter uppercase text-white leading-none">AVIATOR</span>
        </div>

        <div className="flex items-center gap-4">
          {!user ? (
            <button onClick={() => setShowAuthModal(true)} className="px-4 py-1.5 bg-accent-red text-white text-xs font-black rounded uppercase tracking-widest">SIGN UP</button>
          ) : (
            <div className="flex items-center gap-3">
              {isAdmin && <button onClick={() => setShowAdminPanel(true)} className="p-2 bg-accent-blue/10 text-accent-blue rounded-lg border border-accent-blue/20"><Shield className="w-4 h-4" /></button>}
              <div className="px-4 py-1.5 bg-black/40 rounded-lg border border-white/10">
                <span className="text-xs font-bold text-[#2ecc71]">{formatCurrency(balance)}</span>
              </div>
            </div>
          )}
        </div>
      </header>

      <div className="min-h-[calc(100vh-120px)]">
        {activeTab === 'home' && (
          <main className="max-w-[1400px] mx-auto p-2 grid grid-cols-1 lg:grid-cols-4 gap-2">
            <div className="lg:col-span-3 flex flex-col gap-2">
              <div className="glass rounded-xl p-2 flex items-center gap-2 overflow-x-auto no-scrollbar">
                {gameState.history.map((h, i) => (
                  <span key={i} className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${h >= 2 ? 'text-accent-blue border-accent-blue/30' : 'text-gray-400 border-white/10'}`}>{h.toFixed(2)}x</span>
                ))}
              </div>

              <div className="relative aspect-video bg-[#0a0a0c] rounded-xl border border-white/5 overflow-hidden flex items-center justify-center">
                {/* Dynamic Background Elements */}
                <div className="absolute inset-0 pointer-events-none">
                  {/* Scrolling Grid */}
                  <div 
                    className="absolute inset-0 opacity-10"
                    style={{
                      backgroundImage: `linear-gradient(to right, #3498db 1px, transparent 1px), linear-gradient(to bottom, #3498db 1px, transparent 1px)`,
                      backgroundSize: '40px 40px',
                      transform: gameState.status === GameStatus.FLYING 
                        ? `translate(-${(gameState.currentMultiplier * 50) % 40}px, ${(gameState.currentMultiplier * 50) % 40}px)` 
                        : 'none',
                      transition: gameState.status === GameStatus.FLYING ? 'none' : 'transform 0.5s ease-out'
                    }}
                  />
                  
                  {/* Speed lines or stars */}
                  <AnimatePresence>
                    {gameState.status === GameStatus.FLYING && (
                      <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 overflow-hidden"
                      >
                        {[...Array(15)].map((_, i) => (
                          <motion.div
                            key={i}
                            className="absolute h-[1px] bg-white opacity-20"
                            style={{
                              width: Math.random() * 100 + 50,
                              left: Math.random() * 120 - 10 + '%',
                              top: Math.random() * 100 + '%',
                              transform: 'rotate(-45deg)',
                            }}
                            animate={{
                              x: [-200, 200],
                              y: [200, -200],
                            }}
                            transition={{
                              duration: 1.5 / (gameState.currentMultiplier * 0.5 + 1),
                              repeat: Infinity,
                              ease: "linear",
                              delay: Math.random() * 1,
                            }}
                          />
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Red Glow when flying */}
                  {gameState.status === GameStatus.FLYING && (
                    <div className="absolute inset-0 bg-gradient-to-tr from-accent-red/0 via-transparent to-accent-red/5" />
                  )}
                </div>

                <AnimatePresence mode="wait">
                  {gameState.status === GameStatus.WAITING && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center">
                      <div className="text-gray-500 text-xs font-black uppercase tracking-[0.4em] mb-4">Next Round In</div>
                      <div className="text-7xl font-black text-white italic">{gameState.timer}</div>
                    </motion.div>
                  )}
                  {gameState.status === GameStatus.FLYING && (
                    <motion.div 
                      key="multiplier"
                      initial={{ opacity: 0, scale: 0.8 }} 
                      animate={{ opacity: 1, scale: 1 }} 
                      className="text-center z-10"
                    >
                      <div className="text-7xl sm:text-8xl font-black text-white italic drop-shadow-[0_0_30px_rgba(255,255,255,0.2)]">{gameState.currentMultiplier.toFixed(2)}x</div>
                    </motion.div>
                  )}
                  {gameState.status === GameStatus.CRASHED && (
                    <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="text-center z-10">
                      <div className="bg-accent-red px-6 py-2 rounded-xl mb-4 text-white font-black uppercase tracking-[0.2em] italic">Flew Away!</div>
                      <div className="text-8xl font-black text-accent-red italic">{gameState.currentMultiplier.toFixed(2)}x</div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="absolute inset-0 pointer-events-none z-0">
                  <svg className="w-full h-full">
                    {gameState.status === GameStatus.FLYING && (
                      <motion.path
                        d={`M 10 90 Q ${coords.x / 2} 90 ${coords.x} ${coords.y}`}
                        fill="none"
                        stroke="rgba(255, 59, 59, 0.4)"
                        strokeWidth="3"
                        strokeDasharray="8 4"
                      />
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
                            rotate: 45 + (Math.sin(Date.now() / 200) * 5) // Pointing top-right
                          } 
                        : { 
                            scale: 0, 
                            opacity: 0,
                            rotate: 0
                          }
                      }
                      transition={{ 
                        type: "spring", 
                        stiffness: 100, 
                        damping: 20,
                        rotate: { 
                          repeat: Infinity, 
                          duration: 0.4, 
                          ease: "linear" 
                        }
                      }}
                      className="absolute -translate-x-1/2 -translate-y-1/2"
                    >
                      <Plane className="w-12 h-12 sm:w-16 sm:h-16 text-accent-red fill-current drop-shadow-[0_0_20px_rgba(255,59,59,0.9)]" />
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
                      {!(num === 1 ? bet1 : bet2) ? (
                        <button 
                          onClick={() => handlePlaceBet(num as 1 | 2)} 
                          className="w-full h-full bg-[#28a745] hover:bg-[#2ecc71] text-white rounded-xl font-black text-2xl flex flex-col items-center justify-center shadow-lg transition-all active:scale-95"
                        >
                          <span className="text-xs font-normal opacity-70 uppercase">BET</span>
                          {formatCurrency(num === 1 ? betAmount1 : betAmount2)}
                        </button>
                      ) : (
                        <button 
                          onClick={() => handleCashOut(num as 1 | 2)}
                          disabled={gameState.status !== GameStatus.FLYING}
                          className="w-full h-full bg-[#f39c12] hover:bg-[#e67e22] text-white rounded-xl font-black text-2xl flex flex-col items-center justify-center shadow-lg transition-all active:scale-95 disabled:opacity-50"
                        >
                          <span className="text-xs font-normal opacity-70 uppercase">CASH OUT</span>
                          {gameState.status === GameStatus.FLYING && formatCurrency((num === 1 ? bet1! : bet2!).amount * gameState.currentMultiplier)}
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
      <AdminPanel isOpen={showAdminPanel} onClose={() => setShowAdminPanel(false)} />
      {user && <TransactionModal isOpen={showTransModal.open} onClose={() => setShowTransModal({ ...showTransModal, open: false })} type={showTransModal.type} userId={user.uid} />}
    </div>
  );
}
