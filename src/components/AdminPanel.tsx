import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Shield, Clock, CheckCircle, ArrowUpCircle, ArrowDownCircle, ExternalLink } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, increment, getDoc } from 'firebase/firestore';

interface AdminPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ isOpen, onClose }) => {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen) return;
    
    const q = query(collection(db, 'transactions'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setRequests(docs);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [isOpen]);

  const handleApprove = async (req: any) => {
    try {
      const userRef = doc(db, 'users', req.userId);
      const transRef = doc(db, 'transactions', req.id);

      if (req.status !== 'pending') return;

      if (req.type === 'deposit') {
        await updateDoc(userRef, {
          balance: increment(req.amount)
        });
      } else if (req.type === 'withdrawal') {
        // Balance already subtracted during request
      }

      await updateDoc(transRef, {
        status: 'approved',
        processedAt: new Date()
      });
    } catch (err) {
      console.error(err);
      alert('Failed to approve');
    }
  };

  const handleReject = async (req: any) => {
    try {
      const transRef = doc(db, 'transactions', req.id);
      
      if (req.type === 'withdrawal') {
        const userRef = doc(db, 'users', req.userId);
        await updateDoc(userRef, {
          balance: increment(req.amount)
        });
      }

      await updateDoc(transRef, {
        status: 'rejected',
        processedAt: new Date()
      });
    } catch (err) {
      console.error(err);
      alert('Failed to reject');
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
          />
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="relative w-full max-w-5xl bg-[#1b1b21] rounded-3xl border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
          >
            <div className="absolute top-0 left-0 w-full h-1 bg-accent-blue" />
            
            <div className="p-6 border-b border-white/5 flex justify-between items-center bg-black/20">
              <div className="flex items-center gap-3">
                <Shield className="w-6 h-6 text-accent-blue" />
                <h2 className="text-xl font-black italic tracking-tighter text-white uppercase italic">
                  Admin Command Center
                </h2>
              </div>
              <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {loading ? (
                <div className="flex justify-center py-20">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-accent-blue"></div>
                </div>
              ) : requests.length === 0 ? (
                <div className="text-center py-20 text-gray-500">No pending requests</div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {requests.map((req) => (
                    <div key={req.id} className="bg-black/40 border border-white/5 rounded-2xl p-6 flex flex-col lg:flex-row gap-6">
                       <div className="flex-1">
                          <div className="flex items-center gap-3 mb-4">
                             {req.type === 'deposit' ? (
                               <ArrowUpCircle className="w-8 h-8 text-[#2ecc71]" />
                             ) : (
                               <ArrowDownCircle className="w-8 h-8 text-accent-red" />
                             )}
                             <div>
                                <div className="text-sm font-black text-white uppercase tracking-wider">{req.type} REQUEST</div>
                                <div className="text-xs text-gray-500 font-mono italic">{req.id}</div>
                             </div>
                             <div className={`ml-auto px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                               req.status === 'pending' ? 'bg-[#f39c12]/20 text-[#f39c12]' :
                               req.status === 'approved' ? 'bg-[#2ecc71]/20 text-[#2ecc71]' : 'bg-accent-red/20 text-accent-red'
                             }`}>
                                {req.status}
                             </div>
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                             <div>
                                <div className="text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-1">Amount</div>
                                <div className="text-lg font-black text-white italic">${req.amount.toFixed(2)}</div>
                             </div>
                             <div>
                                <div className="text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-1">User ID</div>
                                <div className="text-xs font-medium text-gray-400 font-mono truncate">{req.userId}</div>
                             </div>
                             <div>
                                <div className="text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-1">Date</div>
                                <div className="text-xs font-medium text-gray-400">{req.createdAt?.toDate().toLocaleString() || 'Just now'}</div>
                             </div>
                          </div>

                          {req.transactionId && (
                            <div className="mt-4 p-3 bg-white/5 rounded-xl border border-white/5">
                               <div className="text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-1">Transaction Link / ID</div>
                               <div className="text-xs text-accent-blue font-mono break-all">{req.transactionId}</div>
                            </div>
                          )}
                       </div>

                       <div className="lg:w-64 flex flex-col gap-3">
                          {req.screenshotUrl && (
                            <a href={req.screenshotUrl} target="_blank" rel="noreferrer" className="relative group rounded-xl overflow-hidden aspect-video border border-white/10 bg-black">
                               <img src={req.screenshotUrl} className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" alt="Screenshot" />
                               <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
                                  <ExternalLink className="w-5 h-5 text-white" />
                               </div>
                            </a>
                          )}
                          
                          {req.status === 'pending' && (
                             <div className="flex gap-2 mt-auto">
                                <button
                                  onClick={() => handleApprove(req)}
                                  className="flex-1 bg-[#28a745] text-white text-xs font-black py-3 rounded-xl uppercase tracking-widest shadow-[0_5px_15px_rgba(40,167,69,0.2)] hover:scale-[1.02] active:scale-[0.98]"
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={() => handleReject(req)}
                                  className="flex-1 bg-accent-red text-white text-xs font-black py-3 rounded-xl uppercase tracking-widest shadow-[0_5px_15px_rgba(255,59,59,0.2)] hover:scale-[1.02] active:scale-[0.98]"
                                >
                                  Reject
                                </button>
                             </div>
                          )}
                       </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
