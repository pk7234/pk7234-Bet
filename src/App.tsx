import { useState, useEffect } from 'react';
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

export default function App() {
  const [gameState, setGameState] = useState<GameState | null>(null);
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

  // Dynamic Live Bets State
  const [liveBets, setLiveBets] = useState<any[]>([]);
  const [lastStatus, setLastStatus] = useState<GameStatus | null>(null);

  useEffect(() => {
    if (!gameState) return;

    if (gameState.status === GameStatus.WAITING && lastStatus !== GameStatus.WAITING) {
      // Generate new fake live bets ONCE per round
      const newBets = Array.from({ length: 15 + Math.floor(Math.random() * 10) }, (_, i) => ({
        user: `${['m', 'a', 'x', 'p', 'z'][Math.floor(Math.random() * 5)]}***${100 + Math.floor(Math.random() * 900)}`,
        amount: 16 + Math.floor(Math.random() * 500),
        cashOutAt: 1.1 + Math.pow(Math.random(), 2) * 5, // More realistic cashouts
        cashedOut: false,
        win: 0
      }));
      setLiveBets(newBets);
      setLastStatus(GameStatus.WAITING);
    } else if (gameState.status === GameStatus.FLYING) {
      setLastStatus(GameStatus.FLYING);

      // Periodically add new bets during flight if it's early
      if (gameState.currentMultiplier < 1.5 && Math.random() > 0.8) {
        setLiveBets(prev => [
           ...prev,
           {
            user: `${['u', 'r', 'k', 'q'][Math.floor(Math.random() * 4)]}***${100 + Math.floor(Math.random() * 900)}`,
            amount: 16 + Math.floor(Math.random() * 300),
            cashOutAt: gameState.currentMultiplier + 1 + Math.random() * 3,
            cashedOut: false,
            win: 0
           }
        ].slice(-40));
      }

      // Update bets that cash out at current multiplier
      setLiveBets(prev => {
        const hasChanges = prev.some(bet => !bet.cashedOut && gameState.currentMultiplier >= bet.cashOutAt);
        if (!hasChanges) return prev;
        
        return prev.map(bet => {
          if (!bet.cashedOut && gameState.currentMultiplier >= bet.cashOutAt) {
            return {
              ...bet,
              cashedOut: true,
              win: Math.floor(bet.amount * bet.cashOutAt * 100) / 100
            };
          }
          return bet;
        });
      });
    } else if (gameState.status === GameStatus.CRASHED && lastStatus !== GameStatus.CRASHED) {
      setLastStatus(GameStatus.CRASHED);
    }
  }, [gameState?.status, gameState?.currentMultiplier]);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        // Special Admin Logic
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
          
          // Auto-update role if it's the specific admin email
          if (IS_SPECIFIC_ADMIN && userSnap.data().role !== 'admin') {
            await updateDoc(userRef, { role: 'admin' });
          }
        }

        const unsubBalance = onSnapshot(userRef, (docSnap) => {
          if (docSnap.exists()) {
            setBalance(docSnap.data().balance);
            setIsAdmin(docSnap.data().role === 'admin');
          }
        });
        return () => unsubBalance();
      } else {
        setBalance(1000);
        setIsAdmin(false);
      }
    });
    return () => unsubscribe();
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
        const now = Date.now();
        
        // Initial state
        if (!prev) {
          return {
            status: GameStatus.WAITING,
            currentMultiplier: 1.0,
            startTime: now,
            crashPoint: generateCrashPoint(),
            history: [],
            timer: 5
          };
        }

        const elapsed = (now - prev.startTime) / 1000;

        if (prev.status === GameStatus.WAITING) {
          const remaining = Math.max(0, 5 - Math.floor(elapsed));
          if (remaining === 0) {
            return {
              ...prev,
              status: GameStatus.FLYING,
              startTime: now,
              timer: 0,
              currentMultiplier: 1.0
            };
          }
          return { ...prev, timer: remaining };
        }

        if (prev.status === GameStatus.FLYING) {
          // Faster curve
          const newMultiplier = 1.0 + Math.pow(elapsed / 10, 1.25) * 10; 
          const actualMult = Math.max(1.0, Math.pow(1.08, elapsed)); // Matches server 1.08x rate
          
          const displayedMultiplier = actualMult;

          if (displayedMultiplier >= prev.crashPoint) {
            const newHistory = [prev.crashPoint, ...prev.history].slice(0, 50);
            return {
              ...prev,
              status: GameStatus.CRASHED,
              currentMultiplier: prev.crashPoint,
              startTime: now,
              history: newHistory
            };
          }
          return { ...prev, currentMultiplier: displayedMultiplier };
        }

        if (prev.status === GameStatus.CRASHED) {
          if (elapsed >= 3) {
            return {
              ...prev,
              status: GameStatus.WAITING,
              currentMultiplier: 1.0,
              startTime: now,
              crashPoint: generateCrashPoint(),
              timer: 5
            };
          }
        }

        return prev;
      });
    };

    let isPolling = false;
    const poll = async () => {
      if (!apiAvailable) {
        runEngine();
        return;
      }

      if (isPolling) return;
      isPolling = true;

      try {
        const res = await fetch('/api/game-state');
        if (res.ok) {
          const data = await res.json();
          setGameState(data);
        } else {
          setApiAvailable(false);
          runEngine();
        }
      } catch (err) {
        setApiAvailable(false);
        runEngine();
      } finally {
        isPolling = false;
      }
    };

    interval = setInterval(poll, 33); // Match server frequency
    return () => clearInterval(interval);
  }, [apiAvailable]);

  // Reset bets on crash
  useEffect(() => {
    if (gameState?.status === GameStatus.CRASHED) {
      setBet1(null);
      setBet2(null);
    }
  }, [gameState?.status]);

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

  if (!gameState) return <div className="min-h-screen bg-[#0b0c0f] flex items-center justify-center text-white font-mono tracking-tighter uppercase">Initializing Engine...</div>;

  const isInWaiting = gameState.status === GameStatus.WAITING;
  const isFlying = gameState.status === GameStatus.FLYING;
  const isCrashed = gameState.status === GameStatus.CRASHED;

  // Better Randomness for Crash Points (with house edge)
  const generateCrashPoint = () => {
    const r = Math.random();
    if (r < 0.05) return 1.0; // 5% chance of instant crash
    if (r < 0.5) return 1.0 + Math.random() * 1.5; // High frequency low crash
    if (r < 0.9) return 2.0 + Math.pow(Math.random(), 2) * 8; // Mid crash
    return 10.0 + Math.pow(Math.random(), 3) * 90; // Rare high fly
  };

  // Path Calculation - Adjusted for high-speed feel
  const progress = Math.min(100, Math.max(0, (gameState.currentMultiplier - 1) * 15)); 
  const planeX = Math.min(96, 5 + (progress * 0.95));
  const planeY = Math.max(8, 88 - (Math.pow(progress / 7, 2.0) * 8)); 
  // flightRotation: More aggressive tilt
  const flightRotation = -15 - (progress / 8); 

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
          <div className="glass rounded-xl p-2 flex items-center gap-3 overflow-hidden">
            <div className="flex items-center gap-1.5 text-gray-500 border-r border-white/5 pr-3 shrink-0">
               <History className="w-4 h-4" />
               <span className="text-[10px] font-black uppercase tracking-tighter">History</span>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
              {gameState.history.map((h, i) => (
                <motion.div 
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  key={i} 
                  className={`history-pill px-3 py-1 rounded-full text-[11px] font-bold shrink-0 shadow-sm border ${
                    h >= 10.0 ? 'text-pink-400 border-pink-400/30' :
                    h >= 2.0 ? 'text-accent-blue border-accent-blue/30' : 
                    'text-gray-400 border-white/10'
                  }`}
                >
                  {h.toFixed(2)}x
                </motion.div>
              ))}
            </div>
          </div>

          {/* Game Area */}
          <div className="relative aspect-[16/10] sm:aspect-video lg:flex-1 bg-[#0d0d10] rounded-xl border border-white/5 overflow-hidden flex flex-col items-center justify-center shadow-[inset_0_0_80px_rgba(255,59,59,0.03)] min-h-[220px] lg:min-h-[440px]">
            {/* Grid Background */}
            <div className="absolute inset-0 opacity-[0.05] pointer-events-none" 
                 style={{ 
                   backgroundImage: `radial-gradient(#ffffff 1px, transparent 1px)`, 
                   backgroundSize: '40px 40px' 
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
                     d={`M 0 90 Q 20 85 ${planeX} ${planeY}`}
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
                     initial={{ x: "0%", y: "90%", rotate: -25 }}
                     animate={isFlying ? { 
                       left: `${planeX}%`, 
                       top: `${planeY}%`,
                       rotate: flightRotation
                     } : {
                        left: ["80%", "150%"],
                        top: ["10%", "-50%"],
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
                        https://aviator.pro/ref/{user?.uid?.slice(0, 8) || 'signup'}
                      </div>
                   </div>
                   <button 
                     onClick={() => {
                        navigator.clipboard.writeText(`https://aviator.pro/ref/${user?.uid?.slice(0, 8) || 'signup'}`);
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
