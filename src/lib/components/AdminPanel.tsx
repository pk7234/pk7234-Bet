import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Shield, Clock, CheckCircle, ArrowUpCircle, ArrowDownCircle, ExternalLink, Filter, Search, Image as ImageIcon } from 'lucide-react';
import { db } from '../firebase';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, increment, getDoc, where } from 'firebase/firestore';

interface AdminPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ isOpen, onClose }) => {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'pending' | 'deposit' | 'withdrawal'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    
    // Listen to all transactions, sorted by time
    const q = query(collection(db, 'transactions'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setRequests(docs);
      setLoading(false);
    }, (err) => {
      console.error("Snapshot error:", err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [isOpen]);

  const handleApprove = async (req: any) => {
    if (req.status !== 'pending') return;
    try {
      const transRef = doc(db, 'transactions', req.id);
      
      // If it's a deposit, add balance. If withdrawal, balance was already deducted during submission.
      if (req.type === 'deposit') {
        const userRef = doc(db, 'users', req.userId);
        await updateDoc(userRef, {
          balance: increment(req.amount)
        });
      }

      await updateDoc(transRef, {
        status: 'approved',
        processedAt: new Date(),
        seen: true // Approve implies seen
      });
    } catch (err) {
      console.error("Approve error:", err);
      alert('Failed to approve transaction.');
    }
  };

  const handleReject = async (req: any) => {
    if (req.status !== 'pending') return;
    try {
      const transRef = doc(db, 'transactions', req.id);
      
      // If withdrawal rejected, refund the balance
      if (req.type === 'withdrawal') {
        const userRef = doc(db, 'users', req.userId);
        await updateDoc(userRef, {
          balance: increment(req.amount)
        });
      }

      await updateDoc(transRef, {
        status: 'rejected',
        processedAt: new Date(),
        seen: true
      });
    } catch (err) {
      console.error("Reject error:", err);
      alert('Failed to reject transaction.');
    }
  };

  const markAsSeen = async (req: any) => {
    if (req.seen) return;
    try {
      const transRef = doc(db, 'transactions', req.id);
      await updateDoc(transRef, { seen: true });
    } catch (err) {
      console.error("Mark as seen error:", err);
    }
  };

  const filteredRequests = requests.filter(req => {
    const matchesFilter = filter === 'all' || 
                         (filter === 'pending' && req.status === 'pending') ||
                         req.type === filter;
    const matchesSearch = !searchQuery || 
                         req.userId.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         req.transactionId?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (req.userEmail && req.userEmail.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesFilter && matchesSearch;
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] bg-[#0c0c10] flex flex-col font-sans overflow-hidden">
      {/* Heavy-duty backdrop for full image */}
      <AnimatePresence>
        {selectedImage && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] bg-black/95 flex items-center justify-center p-4 backdrop-blur-3xl"
            onClick={() => setSelectedImage(null)}
          >
            <X className="absolute top-8 right-8 w-10 h-10 text-white cursor-pointer hover:rotate-90 transition-transform" />
            <img 
              src={selectedImage} 
              alt="Transaction Proof" 
              className="max-w-full max-h-full object-contain rounded-2xl shadow-[0_0_100px_rgba(255,255,255,0.1)]" 
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="min-h-20 bg-black/40 border-b border-white/5 px-4 md:px-8 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 md:p-3 bg-accent-blue/10 rounded-xl md:rounded-2xl">
            <Shield className="w-5 h-5 md:w-8 md:h-8 text-accent-blue" />
          </div>
          <div>
            <h1 className="text-lg md:text-2xl font-black italic tracking-tighter text-white uppercase leading-none">ADMIN PANEL</h1>
            <p className="text-[8px] md:text-[10px] text-gray-500 font-bold tracking-widest uppercase mt-1">Payment Management</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2 md:gap-4">
           {searchQuery === '' && (
             <button 
               onClick={() => setSearchQuery(' ')} 
               className="md:hidden p-2 text-gray-400"
             >
               <Search className="w-5 h-5" />
             </button>
           )}
           <div className={`${searchQuery !== '' ? 'flex' : 'hidden'} md:flex bg-black/40 border border-white/10 rounded-xl px-4 py-2 items-center gap-2`}>
             <Search className="w-4 h-4 text-gray-500" />
             <input 
              type="text" 
              placeholder="Search..."
              value={searchQuery.trim()}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent border-none outline-none text-xs text-white placeholder:text-gray-600 w-24 md:w-48"
             />
             {searchQuery !== '' && <X className="w-4 h-4 text-gray-500 md:hidden" onClick={() => setSearchQuery('')} />}
           </div>
           <button 
            onClick={onClose}
            className="p-2 md:p-3 bg-white/5 hover:bg-white/10 rounded-xl md:rounded-2xl text-gray-400 hover:text-white transition-all border border-white/5"
           >
             <X className="w-5 h-5 md:w-6 md:h-6" />
           </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="px-4 md:px-8 py-3 bg-black/20 flex flex-nowrap overflow-x-auto gap-2 shrink-0 border-b border-white/5 no-scrollbar">
         {(['all', 'pending', 'deposit', 'withdrawal'] as const).map((f) => (
           <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 md:px-6 py-2 rounded-lg md:rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all border shrink-0 ${
              filter === f 
                ? 'bg-accent-blue text-white border-accent-blue shadow-[0_5px_15px_rgba(52,152,219,0.3)]' 
                : 'bg-white/5 text-gray-400 border-white/5 hover:bg-white/10'
            }`}
           >
             {f}
           </button>
         ))}
         <div className="ml-auto hidden sm:flex items-center gap-4 px-4 py-2 rounded-xl bg-white/5">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 md:w-3 md:h-3 bg-red-500 rounded-full animate-pulse" />
              <span className="text-[9px] md:text-[10px] font-black text-gray-400 uppercase">New</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 md:w-3 md:h-3 bg-green-500 rounded-full" />
              <span className="text-[9px] md:text-[10px] font-black text-gray-400 uppercase">Seen</span>
            </div>
         </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-gradient-to-b from-[#0c0c10] to-[#121218]">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full opacity-50">
             <div className="w-10 h-10 border-4 border-accent-blue border-t-transparent rounded-full animate-spin mb-4" />
             <span className="text-[10px] font-black text-white uppercase tracking-[0.3em]">Syncing...</span>
          </div>
        ) : filteredRequests.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full opacity-20">
             <Filter className="w-16 h-16 mb-4" />
             <span className="text-lg font-black uppercase italic tracking-widest">No Requests Found</span>
          </div>
        ) : (
          <div className="max-w-6xl mx-auto space-y-4 md:space-y-6">
            {filteredRequests.map((req) => (
              <motion.div
                layout
                key={req.id}
                onClick={() => markAsSeen(req)}
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className={`group relative overflow-hidden flex flex-col lg:flex-row gap-4 md:gap-6 p-5 md:p-8 rounded-2xl md:rounded-[2rem] border transition-all duration-500 cursor-default ${
                  req.type === 'deposit' 
                    ? 'bg-[#2ecc71]/5 border-[#2ecc71]/10 hover:border-[#2ecc71]/30' 
                    : 'bg-accent-red/5 border-accent-red/10 hover:border-accent-red/30'
                } ${!req.seen ? 'shadow-2xl border-accent-blue/20 bg-accent-blue/5' : ''}`}
              >
                {/* Status Dot */}
                <div className={`absolute top-4 right-4 md:top-8 md:left-8 w-3 h-3 rounded-full z-10 ${
                  !req.seen ? 'bg-red-500 animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.8)]' : 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.3)]'
                }`} />

                {/* Vertical Accent */}
                <div className={`absolute top-0 left-0 bottom-0 w-1.5 md:w-2 ${
                  req.type === 'deposit' ? 'bg-[#2ecc71]' : 'bg-accent-red'
                }`} />

                {/* Info Section */}
                <div className="flex-1 md:pl-6">
                  <div className="flex items-center gap-3 mb-4 md:mb-6">
                    <div className={`p-3 md:p-4 rounded-xl md:rounded-2xl ${req.type === 'deposit' ? 'bg-[#2ecc71]/20 text-[#2ecc71]' : 'bg-accent-red/20 text-accent-red'}`}>
                      {req.type === 'deposit' ? <ArrowUpCircle className="w-6 h-6 md:w-8 md:h-8" /> : <ArrowDownCircle className="w-6 h-6 md:w-8 md:h-8" />}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                         <h3 className="text-xl md:text-2xl font-black italic tracking-tighter text-white uppercase italic">{req.type} REQUEST</h3>
                         <span className={`px-2 md:px-4 py-1 rounded-full text-[8px] md:text-[10px] font-black uppercase tracking-widest ${
                           req.status === 'pending' ? 'bg-yellow-500/20 text-yellow-500' :
                           req.status === 'approved' ? 'bg-[#2ecc71]/20 text-[#2ecc71]' : 'bg-accent-red/20 text-accent-red'
                         }`}>
                           {req.status}
                         </span>
                      </div>
                      <div className="text-[9px] font-bold text-gray-500 mt-1 uppercase tracking-widest truncate max-w-[200px]">
                         ID: <span className="text-gray-300 font-mono select-all ml-1">{req.transactionId || req.id}</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-8">
                    <div className="space-y-1">
                      <div className="text-[9px] md:text-[10px] font-black text-gray-600 uppercase tracking-widest">Amount</div>
                      <div className={`text-2xl md:text-3xl font-black italic tracking-tighter ${req.type === 'deposit' ? 'text-[#2ecc71]' : 'text-accent-red'}`}>
                        Rs. {req.amount.toLocaleString()}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-[9px] md:text-[10px] font-black text-gray-600 uppercase tracking-widest">Method</div>
                      <div className="text-sm md:text-lg font-black text-white uppercase">{req.method}</div>
                    </div>
                    <div className="space-y-1 col-span-1 sm:col-span-2">
                       <div className="text-[9px] md:text-[10px] font-black text-gray-600 uppercase tracking-widest">Account Details</div>
                       <div className="text-xs md:text-sm font-bold text-gray-400 font-mono leading-relaxed">
                          {req.type === 'withdrawal' ? (
                            <div className="space-y-0.5">
                               <div>Num: <span className="text-white select-all">{req.accountNumber}</span></div>
                               <div>Name: <span className="text-white uppercase truncate block">{req.accountHolder}</span></div>
                            </div>
                          ) : (
                            <div className="text-white truncate">{req.userEmail || req.userId}</div>
                          )}
                       </div>
                    </div>
                  </div>

                  <div className="mt-6 md:mt-8 pt-4 md:pt-6 border-t border-white/5 flex flex-wrap items-center justify-between gap-4">
                     <div className="flex items-center gap-2 text-gray-500">
                        <Clock className="w-3 h-3 md:w-4 md:h-4" />
                        <span className="text-[9px] md:text-[10px] font-bold uppercase tracking-widest">
                           {req.createdAt?.toDate ? req.createdAt.toDate().toLocaleString() : 'Just now'}
                        </span>
                     </div>
                     <div className="text-[9px] font-bold text-gray-600 uppercase tracking-tighter truncate max-w-[150px]">
                        User ID: <span className="text-gray-500 font-mono">{req.userId}</span>
                     </div>
                  </div>
                </div>

                {/* Media & Actions */}
                <div className="lg:w-72 shrink-0 flex flex-col gap-4">
                  {req.screenshotUrl && (
                    <div 
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedImage(req.screenshotUrl);
                      }}
                      className="group/img relative aspect-video rounded-xl md:rounded-3xl overflow-hidden border border-white/10 bg-black cursor-zoom-in"
                    >
                      <img 
                        src={req.screenshotUrl} 
                        className="w-full h-full object-cover opacity-80 group-hover/img:opacity-100 transition-all duration-700" 
                        alt="Proof"
                      />
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-100 lg:opacity-0 lg:group-hover/img:opacity-100 transition-opacity">
                         <div className="flex flex-col items-center gap-2">
                            <div className="p-2 md:p-3 bg-white/10 backdrop-blur-md rounded-full text-white">
                               <ImageIcon className="w-4 h-4 md:w-6 md:h-6" />
                            </div>
                            <span className="text-[10px] font-black text-white uppercase tracking-widest">View Proof</span>
                         </div>
                      </div>
                    </div>
                  )}

                  {req.status === 'pending' && (
                    <div className="flex flex-col sm:flex-row lg:flex-col gap-3 mt-auto">
                       <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleApprove(req);
                        }}
                        className="flex-1 lg:flex-none bg-[#2ecc71] hover:bg-[#27ae60] text-white py-4 md:py-5 rounded-xl md:rounded-[1.25rem] font-black uppercase text-[10px] md:text-xs tracking-widest italic shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2"
                       >
                         <CheckCircle className="w-4 h-4 md:w-5 md:h-5" /> Approve
                       </button>
                       <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleReject(req);
                        }}
                        className="flex-1 lg:flex-none bg-accent-red hover:bg-red-700 text-white py-4 md:py-5 rounded-xl md:rounded-[1.25rem] font-black uppercase text-[10px] md:text-xs tracking-widest italic shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2"
                       >
                         <X className="w-4 h-4 md:w-5 md:h-5" /> Reject
                       </button>
                    </div>
                  )}

                  {req.status !== 'pending' && (
                    <div className="mt-auto p-4 rounded-xl md:rounded-3xl bg-white/5 border border-white/5 flex flex-col items-center justify-center text-center opacity-50">
                       <div className={`p-2 md:p-3 rounded-full mb-2 md:mb-3 ${req.status === 'approved' ? 'bg-[#2ecc71]/20 text-[#2ecc71]' : 'bg-red-500/20 text-red-500'}`}>
                          {req.status === 'approved' ? <CheckCircle className="w-5 h-5 md:w-6 md:h-6" /> : <X className="w-5 h-5 md:w-6 md:h-6" />}
                       </div>
                       <span className="text-[9px] md:text-[10px] font-black text-white uppercase tracking-[0.2em]">{req.status}</span>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
