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
      <div className="h-20 bg-black/40 border-b border-white/5 px-8 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-accent-blue/10 rounded-2xl">
            <Shield className="w-8 h-8 text-accent-blue" />
          </div>
          <div>
            <h1 className="text-2xl font-black italic tracking-tighter text-white uppercase italic leading-none">ADMIN PANEL</h1>
            <p className="text-[10px] text-gray-500 font-bold tracking-widest uppercase mt-1">Real-time Payment Management</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
           <div className="hidden md:flex bg-black/40 border border-white/10 rounded-xl px-4 py-2 items-center gap-2">
             <Search className="w-4 h-4 text-gray-500" />
             <input 
              type="text" 
              placeholder="Search User or Trans ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent border-none outline-none text-xs text-white placeholder:text-gray-600 w-48"
             />
           </div>
           <button 
            onClick={onClose}
            className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl text-gray-400 hover:text-white transition-all border border-white/5"
           >
             <X className="w-6 h-6" />
           </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="px-8 py-4 bg-black/20 flex flex-wrap gap-3 shrink-0 border-b border-white/5">
         {(['all', 'pending', 'deposit', 'withdrawal'] as const).map((f) => (
           <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${
              filter === f 
                ? 'bg-accent-blue text-white border-accent-blue shadow-[0_5px_15px_rgba(52,152,219,0.3)]' 
                : 'bg-white/5 text-gray-400 border-white/5 hover:bg-white/10'
            }`}
           >
             {f}
           </button>
         ))}
         <div className="ml-auto flex items-center gap-4 px-4 py-2 rounded-xl bg-white/5">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
              <span className="text-[10px] font-black text-gray-400 uppercase">New</span>
            </div>
            <div className="w-px h-3 bg-white/10" />
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-green-500 rounded-full" />
              <span className="text-[10px] font-black text-gray-400 uppercase">Seen</span>
            </div>
         </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-8 bg-gradient-to-b from-[#0c0c10] to-[#121218]">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full opacity-50">
             <div className="w-12 h-12 border-4 border-accent-blue border-t-transparent rounded-full animate-spin mb-4" />
             <span className="text-xs font-black text-white uppercase tracking-[0.3em]">Synchronizing Data...</span>
          </div>
        ) : filteredRequests.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full opacity-20">
             <Filter className="w-20 h-20 mb-4" />
             <span className="text-xl font-black uppercase italic tracking-widest">No Requests Found</span>
          </div>
        ) : (
          <div className="max-w-6xl mx-auto grid grid-cols-1 gap-6">
            {filteredRequests.map((req) => (
              <motion.div
                layout
                key={req.id}
                onClick={() => markAsSeen(req)}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className={`group relative overflow-hidden flex flex-col md:flex-row gap-6 p-8 rounded-[2rem] border transition-all duration-500 cursor-default ${
                  req.type === 'deposit' 
                    ? 'bg-[#2ecc71]/5 border-[#2ecc71]/10 hover:border-[#2ecc71]/30' 
                    : 'bg-accent-red/5 border-accent-red/10 hover:border-accent-red/30'
                } ${!req.seen ? 'shadow-[0_20px_50px_rgba(0,0,0,0.3)] shadow-accent-blue/5 border-accent-blue/20' : ''}`}
              >
                {/* Status Dot */}
                <div className={`absolute top-8 left-8 w-3 h-3 rounded-full z-10 ${
                  !req.seen ? 'bg-red-500 animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.8)]' : 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.3)]'
                }`} />

                {/* Vertical Accent */}
                <div className={`absolute top-0 left-0 bottom-0 w-2 ${
                  req.type === 'deposit' ? 'bg-[#2ecc71]' : 'bg-accent-red'
                }`} />

                {/* Info Section */}
                <div className="flex-1 pl-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className={`p-4 rounded-2xl ${req.type === 'deposit' ? 'bg-[#2ecc71]/20 text-[#2ecc71]' : 'bg-accent-red/20 text-accent-red'}`}>
                      {req.type === 'deposit' ? <ArrowUpCircle className="w-8 h-8" /> : <ArrowDownCircle className="w-8 h-8" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-3">
                         <h3 className="text-2xl font-black italic tracking-tighter text-white uppercase italic">{req.type} REQUEST</h3>
                         <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${
                           req.status === 'pending' ? 'bg-yellow-500/20 text-yellow-500' :
                           req.status === 'approved' ? 'bg-[#2ecc71]/20 text-[#2ecc71]' : 'bg-accent-red/20 text-accent-red'
                         }`}>
                           {req.status}
                         </span>
                      </div>
                      <div className="text-[10px] font-bold text-gray-500 mt-1 uppercase tracking-widest">
                         Transaction ID: <span className="text-gray-300 font-mono select-all ml-1">{req.transactionId || req.id}</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
                    <div className="space-y-1">
                      <div className="text-[10px] font-black text-gray-600 uppercase tracking-widest">Amount</div>
                      <div className={`text-3xl font-black italic tracking-tighter ${req.type === 'deposit' ? 'text-[#2ecc71]' : 'text-accent-red'}`}>
                        Rs. {req.amount.toLocaleString()}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-[10px] font-black text-gray-600 uppercase tracking-widest">Payment Method</div>
                      <div className="text-lg font-black text-white uppercase">{req.method}</div>
                    </div>
                    <div className="space-y-1 col-span-2">
                       <div className="text-[10px] font-black text-gray-600 uppercase tracking-widest">Account Details</div>
                       <div className="text-sm font-bold text-gray-400 font-mono">
                          {req.type === 'withdrawal' ? (
                            <div className="space-y-1">
                               <div>Num: <span className="text-white select-all">{req.accountNumber}</span></div>
                               <div>Name: <span className="text-white uppercase">{req.accountHolder}</span></div>
                            </div>
                          ) : (
                            <div className="text-white truncate max-w-[200px]">{req.userEmail || req.userId}</div>
                          )}
                       </div>
                    </div>
                  </div>

                  <div className="mt-8 pt-6 border-t border-white/5 flex items-center justify-between">
                     <div className="flex items-center gap-2 text-gray-500">
                        <Clock className="w-4 h-4" />
                        <span className="text-[10px] font-bold uppercase tracking-widest">
                           {req.createdAt?.toDate ? req.createdAt.toDate().toLocaleString() : 'Just now'}
                        </span>
                     </div>
                     <div className="text-[10px] font-bold text-gray-600 uppercase tracking-tighter">
                        User ID: <span className="text-gray-500 font-mono">{req.userId}</span>
                     </div>
                  </div>
                </div>

                {/* Media & Actions */}
                <div className="md:w-72 shrink-0 flex flex-col gap-4">
                  {req.screenshotUrl && (
                    <div 
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedImage(req.screenshotUrl);
                      }}
                      className="group/img relative aspect-video rounded-3xl overflow-hidden border border-white/10 bg-black cursor-zoom-in"
                    >
                      <img 
                        src={req.screenshotUrl} 
                        className="w-full h-full object-cover opacity-60 group-hover/img:opacity-100 transition-all duration-700 group-hover/img:scale-110" 
                        alt="Proof"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
                         <div className="flex flex-col items-center gap-2">
                            <ImageIcon className="w-6 h-6 text-white" />
                            <span className="text-[10px] font-black text-white uppercase tracking-widest">View Full Proof</span>
                         </div>
                      </div>
                    </div>
                  )}

                  {req.status === 'pending' && (
                    <div className="flex flex-col gap-3 mt-auto">
                       <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleApprove(req);
                        }}
                        className="w-full bg-[#2ecc71] hover:bg-[#27ae60] text-white py-5 rounded-[1.25rem] font-black uppercase text-xs tracking-widest italic shadow-[0_10px_30px_rgba(46,204,113,0.3)] hover:shadow-[#2ecc71]/40 hover:-translate-y-1 active:translate-y-0 transition-all flex items-center justify-center gap-2"
                       >
                         <CheckCircle className="w-5 h-5" /> Approve
                       </button>
                       <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleReject(req);
                        }}
                        className="w-full bg-accent-red hover:bg-red-700 text-white py-5 rounded-[1.25rem] font-black uppercase text-xs tracking-widest italic shadow-[0_10px_30px_rgba(255,59,59,0.3)] hover:shadow-accent-red/40 hover:-translate-y-1 active:translate-y-0 transition-all flex items-center justify-center gap-2"
                       >
                         <X className="w-5 h-5" /> Reject
                       </button>
                    </div>
                  )}

                  {req.status !== 'pending' && (
                    <div className="mt-auto p-4 rounded-3xl bg-white/5 border border-white/5 flex flex-col items-center justify-center text-center opacity-50">
                       <div className={`p-3 rounded-full mb-3 ${req.status === 'approved' ? 'bg-[#2ecc71]/20 text-[#2ecc71]' : 'bg-red-500/20 text-red-500'}`}>
                          {req.status === 'approved' ? <CheckCircle className="w-6 h-6" /> : <X className="w-6 h-6" />}
                       </div>
                       <span className="text-[10px] font-black text-white uppercase tracking-[0.2em]">{req.status}</span>
                       <span className="text-[9px] text-gray-500 font-bold uppercase mt-1">Processed: {req.processedAt?.toDate ? req.processedAt.toDate().toLocaleString() : 'Recently'}</span>
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
