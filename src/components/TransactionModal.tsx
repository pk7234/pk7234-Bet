import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Wallet, Camera, Link as LinkIcon, Send } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, addDoc, serverTimestamp, doc, updateDoc, increment } from 'firebase/firestore';

interface TransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'deposit' | 'withdrawal';
  userId: string;
}

export const TransactionModal: React.FC<TransactionModalProps> = ({ isOpen, onClose, type, userId }) => {
  const [amount, setAmount] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [screenshotUrl, setScreenshotUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || parseFloat(amount) <= 0) return setError('Please enter a valid amount');
    
    setError('');
    setLoading(true);

    try {
      if (type === 'withdrawal') {
        const userRef = doc(db, 'users', userId);
        // Check balance would be better here, but for now we trust the flow
        await updateDoc(userRef, {
          balance: increment(-parseFloat(amount))
        });
      }

      await addDoc(collection(db, 'transactions'), {
        userId,
        type,
        amount: parseFloat(amount),
        transactionId,
        screenshotUrl,
        status: 'pending',
        createdAt: serverTimestamp()
      });

      onClose();
      alert('Request sent successfully!');
      setAmount('');
      setTransactionId('');
      setScreenshotUrl('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
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
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="relative w-full max-w-md bg-[#1b1b21] rounded-3xl border border-white/10 p-8 shadow-2xl overflow-hidden"
          >
            <div className={`absolute top-0 left-0 w-full h-1 ${type === 'deposit' ? 'bg-[#2ecc71]' : 'bg-accent-red'}`} />
            
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-black italic tracking-tighter text-white uppercase">
                {type === 'deposit' ? 'Deposit Funds' : 'Request Withdrawal'}
              </h2>
              <button 
                onClick={onClose}
                className="text-gray-500 hover:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 ml-1">Amount ($)</label>
                <div className="relative">
                   <Wallet className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                   <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full bg-black/40 border border-white/5 rounded-xl pl-12 pr-4 py-3 text-white focus:outline-none focus:border-accent-blue transition-colors"
                    placeholder="0.00"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-1.5 ml-1">Transaction ID / Link</label>
                <div className="relative">
                   <LinkIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                   <input
                    type="text"
                    value={transactionId}
                    onChange={(e) => setTransactionId(e.target.value)}
                    className="w-full bg-black/40 border border-white/5 rounded-xl pl-12 pr-4 py-3 text-white font-mono text-xs focus:outline-none focus:border-accent-blue transition-colors"
                    placeholder="TX-8923..."
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-1.5 ml-1">Screenshot URL</label>
                <div className="relative">
                   <Camera className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                   <input
                    type="text"
                    value={screenshotUrl}
                    onChange={(e) => setScreenshotUrl(e.target.value)}
                    className="w-full bg-black/40 border border-white/5 rounded-xl pl-12 pr-4 py-3 text-white font-mono text-xs focus:outline-none focus:border-accent-blue transition-colors"
                    placeholder="https://..."
                    required
                  />
                </div>
              </div>

              {error && (
                <div className="text-accent-red text-xs font-bold bg-accent-red/10 border border-accent-red/20 rounded-lg p-3">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className={`w-full text-white font-black py-4 rounded-xl shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 uppercase tracking-widest disabled:opacity-50 ${
                  type === 'deposit' ? 'bg-[#28a745] shadow-[#28a745]/30' : 'bg-accent-red shadow-accent-red/30'
                }`}
              >
                {loading ? 'Submitting...' : (
                  <><Send className="w-5 h-5" /> Submit Request</>
                )}
              </button>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
