import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plane, History, Wallet, TrendingUp, Users, Settings, Info, Menu, LogOut, Shield, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';
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
  const [betAmount1, setBetAmount1] = useState(10);
  const [bet1, setBet1] = useState<{ amount: number; active: boolean } | null>(null);
  
  // Bet 2 States
  const [betAmount2, setBetAmount2] = useState(5);
  const [bet2, setBet2] = useState<{ amount: number; active: boolean } | null>(null);
  
  const [lastWin, setLastWin] = useState<number | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [showTransModal, setShowTransModal] = useState<{ open: boolean, type: 'deposit' | 'withdrawal' }>({ open: false, type: 'deposit' });
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const userRef = doc(db, 'users', u.uid);
        const userSnap = await getDoc(userRef);
        
        if (!userSnap.exists()) {
          await setDoc(userRef, {
            email: u.email,
            phoneNumber: '',
            balance: 1000,
            role: 'user',
            createdAt: serverTimestamp()
          });
          setBalance(1000);
          setIsAdmin(false);
        } else {
          setBalance(userSnap.data().balance);
          setIsAdmin(userSnap.data().role === 'admin');
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
            crashPoint: 1.0 + Math.pow(Math.random(), 2) * 50,
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
          const newMultiplier = Math.pow(1.06, elapsed); 
          
          if (newMultiplier >= prev.crashPoint) {
            const newHistory = [prev.crashPoint, ...prev.history].slice(0, 50);
            return {
              ...prev,
              status: GameStatus.CRASHED,
              currentMultiplier: prev.crashPoint,
              startTime: now,
              history: newHistory
            };
          }
          return { ...prev, currentMultiplier: newMultiplier };
        }

        if (prev.status === GameStatus.CRASHED) {
          if (elapsed >= 3) {
            return {
              ...prev,
              status: GameStatus.WAITING,
              currentMultiplier: 1.0,
              startTime: now,
              crashPoint: 1.0 + Math.pow(Math.random(), 3) * 100,
              timer: 5
            };
          }
        }

        return prev;
      });
    };

    const poll = async () => {
      if (!apiAvailable) {
        runEngine();
        return;
      }

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
      }
    };

    interval = setInterval(poll, 100);
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

    if (balance >= amount) {
      if (user) {
        const userRef = doc(db, 'users', user.uid);
        await updateDoc(userRef, {
          balance: increment(-amount)
        });
      } else {
        setBalance(prev => prev - amount);
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

    setTimeout(async () => {
      if (gameState?.status !== GameStatus.FLYING) return;

      const bet = num === 1 ? bet1 : bet2;
      if (!bet?.active) return;

      const win = Math.floor(bet.amount * gameState.currentMultiplier * 100) / 100;
      
      if (user) {
        const userRef = doc(db, 'users', user.uid);
        await updateDoc(userRef, {
          balance: increment(win)
        });
      } else {
        setBalance(prev => prev + win);
      }

      if (num === 1) setBet1(null);
      else if (num === 2) setBet2(null);

      setLastWin(win);
      setTimeout(() => setLastWin(null), 3000);
    }, 150);
  };

  // Reset bets on crash
  useEffect(() => {
    if (gameState?.status === GameStatus.CRASHED) {
      setBet1(null);
      setBet2(null);
    }
  }, [gameState?.status]);

  if (!gameState) return <div className="min-h-screen bg-[#0b0c0f] flex items-center justify-center text-white font-mono tracking-tighter uppercase">Initializing Engine...</div>;

  const isInWaiting = gameState.status === GameStatus.WAITING;
  const isFlying = gameState.status === GameStatus.FLYING;
  const isCrashed = gameState.status === GameStatus.CRASHED;

  // Path Calculation
  const progress = Math.min(100, Math.max(0, (gameState.currentMultiplier - 1) * 12)); 
  const planeX = Math.min(92, 5 + (progress * 0.85));
  const planeY = Math.max(12, 85 - (Math.pow(progress / 10, 1.7) * 4.2)); 
  // flightRotation: Points more horizontally towards the right corner
  const flightRotation = -5 - (progress / 12); 

  return (
    <div className="min-h-screen bg-[#0a0a0b] text-[#e2e2e7] font-sans selection:bg-accent-red/30">
      {/* Top Bar */}
      <header className="h-[50px] glass flex items-center justify-between px-6 sticky top-0 z-50 rounded-none border-t-0 border-x-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-accent-red rounded flex items-center justify-center shadow-[0_0_15px_rgba(255,59,59,0.4)]">
            <Plane className="w-5 h-5 text-white fill-current" />
          </div>
          <span className="font-black text-xl italic tracking-tighter uppercase text-white">AVIATOR PR0</span>
        </div>

        <div className="flex items-center gap-4">
          {!user ? (
            <button 
              onClick={() => setShowAuthModal(true)}
              className="px-4 py-1.5 bg-accent-red text-white text-xs font-black rounded-lg hover:bg-accent-red/80 transition-all uppercase tracking-widest shadow-[0_5px_15px_rgba(255,59,59,0.3)]"
            >
              Sign Up / Login
            </button>
          ) : (
            <div className="flex items-center gap-3">
              {isAdmin && (
                <button 
                  onClick={() => setShowAdminPanel(true)}
                  className="p-1.5 bg-accent-blue/10 text-accent-blue rounded-lg border border-accent-blue/20 hover:bg-accent-blue/20"
                  title="Admin Panel"
                >
                  <Shield className="w-4 h-4" />
                </button>
              )}
              <div className="flex items-center gap-2 px-3 py-1 bg-black/40 rounded-full border border-white/10 group relative cursor-pointer" onClick={() => signOut(auth)}>
                <div className="w-2 h-2 rounded-full bg-accent-blue" />
                <span className="text-[10px] font-bold text-gray-300 uppercase tracking-widest">{user.email.split('@')[0]}</span>
                <div className="absolute -bottom-8 left-0 w-full hidden group-hover:block bg-black/80 rounded px-2 py-1 text-[8px] text-white text-center">Logout</div>
              </div>
            </div>
          )}
          <div className="flex items-center gap-2 pl-4 pr-2 py-1 bg-black/40 rounded-full border border-white/10">
            <div className="flex flex-col items-end mr-2">
               <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest leading-none mb-1">Balance</span>
               <span className="text-sm font-bold text-[#2ecc71] tracking-tight leading-none">{formatCurrency(balance)}</span>
            </div>
            {user && (
              <div className="flex gap-1 border-l border-white/5 pl-2">
                <button 
                  onClick={() => setShowTransModal({ open: true, type: 'deposit' })}
                  className="p-1 text-[#2ecc71] hover:bg-[#2ecc71]/10 rounded transition-colors"
                >
                  <ArrowUpCircle className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => setShowTransModal({ open: true, type: 'withdrawal' })}
                  className="p-1 text-accent-red hover:bg-accent-red/10 rounded transition-colors"
                >
                  <ArrowDownCircle className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs font-bold px-3 py-1 bg-accent-blue/10 rounded-lg text-accent-blue border border-accent-blue/20">
             <span className="animate-pulse">●</span>
             <span>LIVE</span>
          </div>
          <Settings className="w-5 h-5 text-gray-500 cursor-pointer hover:text-white transition-colors" />
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-[1400px] mx-auto p-2 grid grid-cols-1 lg:grid-cols-4 gap-2">
        
        {/* Center - Game Display (Now first for mobile "Top" layout) */}
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
          <div className="relative aspect-video lg:aspect-auto lg:flex-1 bg-[#0d0d10] rounded-xl border border-white/5 overflow-hidden flex flex-col items-center justify-center shadow-[inset_0_0_80px_rgba(255,59,59,0.03)] min-h-[440px]">
            {/* Grid Background */}
            <div className="absolute inset-0 opacity-[0.05] pointer-events-none" 
                 style={{ 
                   backgroundImage: `radial-gradient(#ffffff 1px, transparent 1px)`, 
                   backgroundSize: '40px 40px' 
                 }} 
            />

            {/* Flying Multiplier */}
            <div className="z-10 text-center select-none">
              <AnimatePresence mode="wait">
                {isInWaiting && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 1.1 }}
                    className="flex flex-col items-center gap-2"
                  >
                    <span className="text-gray-500 text-[10px] font-bold uppercase tracking-[0.5em] mb-4 opacity-50">Next Flight Path Calculating</span>
                    <span className="text-8xl lg:text-9xl font-black text-white italic drop-shadow-[0_0_30px_rgba(255,255,255,0.15)]">{gameState.timer}</span>
                  </motion.div>
                )}
                
                {isFlying && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col items-center"
                  >
                    <span className="text-8xl lg:text-[120px] font-extrabold text-white tracking-tighter drop-shadow-[0_0_40px_rgba(255,59,59,0.4)] italic">
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
                    <div className="bg-accent-red px-8 py-2 rounded-xl mb-6 shadow-[0_10px_30px_rgba(255,59,59,0.5)]">
                       <span className="text-white text-base font-black uppercase tracking-widest italic">FLEW AWAY!</span>
                    </div>
                    <span className="text-8xl lg:text-9xl font-extrabold text-accent-red italic drop-shadow-[0_0_30px_rgba(255,59,59,0.4)]">
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {/* Bet Panel 1 */}
            <div className="bg-[#1b1b21] rounded-2xl p-4 border border-[#2a2a32] shadow-2xl relative overflow-hidden flex gap-4">
               <div className="absolute top-0 left-0 w-1 h-full bg-accent-red" />
               <div className="flex flex-col gap-3 w-32 shrink-0">
                  <div className="flex gap-1">
                    <button onClick={() => setBetAmount1(b => Math.max(1, b - 1))} className="bg-black/40 text-gray-400 p-1 rounded-md w-full text-[10px] border border-white/5 hover:text-white">-</button>
                    <button onClick={() => setBetAmount1(b => b + 1)} className="bg-black/40 text-gray-400 p-1 rounded-md w-full text-[10px] border border-white/5 hover:text-white">+</button>
                  </div>
                  <div className="bg-[#0d0d10] border border-[#32323d] rounded-lg p-2 text-center font-bold text-xl text-white">
                    {betAmount1.toFixed(2)}
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    {[1, 5, 10, 50].map(v => (
                      <button key={v} onClick={() => setBetAmount1(v)} className={`bg-white/5 rounded py-1.5 text-[10px] font-bold transition-all ${betAmount1 === v ? 'bg-accent-red text-white' : 'text-gray-400 hover:bg-white/10'}`}>
                        {v.toFixed(2)}
                      </button>
                    ))}
                  </div>
               </div>
                {!bet1?.active ? (
                  <button 
                    disabled={!isInWaiting || balance < betAmount1} 
                    onClick={() => handlePlaceBet(1)} 
                    className={`flex-1 rounded-xl font-black text-2xl flex flex-col items-center justify-center transition-all active:scale-90 active:bg-[#1e7e34] ${
                      isInWaiting && balance >= betAmount1 
                        ? 'bg-[#28a745] text-white shadow-[0_10px_20px_rgba(40,167,69,0.3)] cursor-pointer' 
                        : 'bg-white/5 text-gray-600 cursor-not-allowed'
                    }`}
                  >
                    BET
                    <span className="text-[12px] opacity-60 font-normal uppercase tracking-widest">{formatCurrency(betAmount1)}</span>
                  </button>
                ) : (
                  <button 
                    disabled={!isFlying} 
                    onClick={() => handleCashOut(1)}
                    className={`flex-1 rounded-xl font-black text-2xl flex flex-col items-center justify-center transition-all active:scale-95 ${
                      isFlying 
                        ? 'bg-[#f39c12] text-white shadow-[0_10px_20px_rgba(243,156,18,0.3)] cursor-pointer' 
                        : 'bg-white/5 text-gray-600'
                    }`}
                  >
                    OUT
                    {isFlying && (
                      <motion.span 
                        animate={{ scale: [1, 1.1, 1] }} 
                        transition={{ repeat: Infinity, duration: 0.5 }}
                        className="text-[12px] text-white font-bold mt-1"
                      >
                        {formatCurrency(bet1.amount * gameState.currentMultiplier)}
                      </motion.span>
                    )}
                  </button>
                )}
            </div>

            {/* Bet Panel 2 */}
            <div className="bg-[#1b1b21] rounded-2xl p-4 border border-[#2a2a32] shadow-2xl relative overflow-hidden flex gap-4">
               <div className="absolute top-0 left-0 w-1 h-full bg-accent-blue" />
               <div className="flex flex-col gap-3 w-32 shrink-0">
                  <div className="flex gap-1">
                    <button onClick={() => setBetAmount2(b => Math.max(1, b - 1))} className="bg-black/40 text-gray-400 p-1 rounded-md w-full text-[10px] border border-white/5 hover:text-white">-</button>
                    <button onClick={() => setBetAmount2(b => b + 1)} className="bg-black/40 text-gray-400 p-1 rounded-md w-full text-[10px] border border-white/5 hover:text-white">+</button>
                  </div>
                  <div className="bg-[#0d0d10] border border-[#32323d] rounded-lg p-2 text-center font-bold text-xl text-white">
                    {betAmount2.toFixed(2)}
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    {[1, 5, 10, 50].map(v => (
                      <button key={v} onClick={() => setBetAmount2(v)} className={`bg-white/5 rounded py-1.5 text-[10px] font-bold transition-all ${betAmount2 === v ? 'bg-accent-blue text-white' : 'text-gray-400 hover:bg-white/10'}`}>
                        {v.toFixed(2)}
                      </button>
                    ))}
                  </div>
               </div>
                {!bet2?.active ? (
                  <button 
                    disabled={!isInWaiting || balance < betAmount2} 
                    onClick={() => handlePlaceBet(2)} 
                    className={`flex-1 rounded-xl font-black text-2xl flex flex-col items-center justify-center transition-all active:scale-90 active:bg-[#1e7e34] ${
                      isInWaiting && balance >= betAmount2 
                        ? 'bg-[#28a745] text-white shadow-[0_10px_20px_rgba(40,167,69,0.3)] cursor-pointer' 
                        : 'bg-white/5 text-gray-600 cursor-not-allowed'
                    }`}
                  >
                    BET
                    <span className="text-[12px] opacity-60 font-normal uppercase tracking-widest">{formatCurrency(betAmount2)}</span>
                  </button>
                ) : (
                  <button 
                    disabled={!isFlying} 
                    onClick={() => handleCashOut(2)}
                    className={`flex-1 rounded-xl font-black text-2xl flex flex-col items-center justify-center transition-all active:scale-95 ${
                      isFlying 
                        ? 'bg-[#f39c12] text-white shadow-[0_10px_20px_rgba(243,156,18,0.3)] cursor-pointer' 
                        : 'bg-white/5 text-gray-600'
                    }`}
                  >
                    OUT
                    {isFlying && (
                      <motion.span 
                        animate={{ scale: [1, 1.1, 1] }} 
                        transition={{ repeat: Infinity, duration: 0.5 }}
                        className="text-[12px] text-white font-bold mt-1"
                      >
                        {formatCurrency(bet2.amount * gameState.currentMultiplier)}
                      </motion.span>
                    )}
                  </button>
                )}
            </div>
          </div>

        </div>

        {/* Sidebar - History & Leaderboard (Now after game for mobile "Bottom" layout) */}
        <div className="lg:col-span-1 order-2 lg:order-1 flex flex-col gap-2">
          <div className="glass rounded-xl overflow-hidden flex flex-col h-[400px] lg:h-[720px]">
             <div className="p-3 border-b border-white/5 flex justify-between items-center bg-black/20">
                <span className="text-xs font-bold uppercase tracking-wider text-gray-400">All Bets</span>
                <span className="text-[10px] bg-white/10 px-2 py-0.5 rounded-full text-white">458</span>
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
                    {[...Array(30)].map((_, i) => (
                      <tr key={i} className="hover:bg-white/5 transition-colors group">
                        <td className="p-2 pl-3 font-medium group-hover:text-white">m***{400 + i}</td>
                        <td className="text-right p-2 text-white/80">{formatCurrency(10 + i * 2.5)}</td>
                        <td className="text-right p-2">
                          {i % 4 === 0 ? <span className="text-accent-blue font-bold italic">1.{20 + i}x</span> : <span className="opacity-20">-</span>}
                        </td>
                        <td className="text-right p-2">
                          {i % 4 === 0 ? <span className="text-[#2ecc71] font-bold">{formatCurrency((10 + i * 2.5) * (1 + (20+i)/100))}</span> : <span className="opacity-20">-</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
             </div>
          </div>
        </div>
      </main>

      <footer className="max-w-[1400px] mx-auto p-4 lg:px-8 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-4 mt-4">
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
