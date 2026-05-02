import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Wallet, Camera, Link as LinkIcon, Send } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, addDoc, serverTimestamp, doc, updateDoc, increment, getDoc } from 'firebase/firestore';

interface TransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'deposit' | 'withdrawal';
  userId: string;
}

export const TransactionModal: React.FC<TransactionModalProps> = ({ isOpen, onClose, type, userId }) => {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [screenshotUrl, setScreenshotUrl] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [accountNumber, setAccountNumber] = useState('');
  const [accountHolder, setAccountHolder] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        return setError('Image size should be less than 2MB');
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setScreenshotUrl(base64String);
        setImagePreview(base64String);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || parseFloat(amount) <= 0) return setError('Please enter a valid amount');
    if (!method) return setError('Please select a payment method');
    
    if (type === 'deposit') {
      if (!transactionId) return setError('Please enter transaction ID');
      if (!screenshotUrl) return setError('Please upload payment screenshot');
    } else {
      if (!accountNumber) return setError('Please enter account number');
      if (!accountHolder) return setError('Please enter account holder name');
    }

    setError('');
    setLoading(true);

    try {
      if (type === 'withdrawal') {
        const userRef = doc(db, 'users', userId);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists() && userSnap.data().balance < parseFloat(amount)) {
          throw new Error('Insufficient balance');
        }

        await updateDoc(userRef, {
          balance: increment(-parseFloat(amount))
        });
      }

      await addDoc(collection(db, 'transactions'), {
        userId,
        type,
        amount: parseFloat(amount),
        method,
        transactionId: type === 'deposit' ? transactionId : null,
        screenshotUrl: type === 'deposit' ? screenshotUrl : null,
        accountNumber: type === 'withdrawal' ? accountNumber : null,
        accountHolder: type === 'withdrawal' ? accountHolder : null,
        status: 'pending',
        seen: false,
        createdAt: serverTimestamp()
      });

      onClose();
      alert('Request sent successfully!');
      setAmount('');
      setMethod('');
      setTransactionId('');
      setScreenshotUrl('');
      setImagePreview(null);
      setAccountNumber('');
      setAccountHolder('');
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
                {type === 'deposit' ? 'Deposit Funds' : 'Withdrawal Request'}
              </h2>
              <button 
                onClick={onClose}
                className="text-gray-500 hover:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {type === 'deposit' && (
                <div className="bg-accent-blue/10 border border-accent-blue/20 rounded-xl p-4 mb-4">
                  <div className="text-[10px] font-black text-accent-blue uppercase tracking-widest mb-2">Send Money To:</div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-gray-400">EasyPaisa:</span>
                      <span className="text-white font-bold font-mono">03001234567</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-gray-400">JazzCash:</span>
                      <span className="text-white font-bold font-mono">03001234567</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-gray-400">Holder:</span>
                      <span className="text-white font-bold uppercase">AHMAD REZA</span>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 ml-1">Payment Method</label>
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                  className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-accent-blue transition-colors appearance-none"
                  required
                >
                  <option value="" className="bg-[#1b1b21]">Select Method</option>
                  <option value="EasyPaisa" className="bg-[#1b1b21]">EasyPaisa</option>
                  <option value="JazzCash" className="bg-[#1b1b21]">JazzCash</option>
                  <option value="Bank" className="bg-[#1b1b21]">Bank Transfer</option>
                  <option value="Crypto" className="bg-[#1b1b21]">Crypto (USDT)</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 ml-1">Amount</label>
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

              {type === 'deposit' ? (
                <>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 ml-1">Transaction ID</label>
                    <div className="relative">
                      <LinkIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                      <input
                        type="text"
                        value={transactionId}
                        onChange={(e) => setTransactionId(e.target.value)}
                        className="w-full bg-black/40 border border-white/5 rounded-xl pl-12 pr-4 py-3 text-white font-mono text-xs focus:outline-none focus:border-accent-blue transition-colors"
                        placeholder="Enter Transaction ID"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 ml-1">Screenshot (Upload Proof)</label>
                    <div className="relative group">
                      <div className="w-full bg-black/40 border-2 border-dashed border-white/5 rounded-xl p-4 flex flex-col items-center justify-center hover:border-accent-blue/30 transition-all relative overflow-hidden">
                        {imagePreview ? (
                          <div className="relative w-full aspect-video">
                            <img src={imagePreview} className="w-full h-full object-cover rounded-lg" alt="Preview" />
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                              <Camera className="w-6 h-6 text-white" />
                            </div>
                          </div>
                        ) : (
                          <>
                            <Camera className="w-8 h-8 text-gray-600 mb-2" />
                            <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Browse Gallery / Click Photo</span>
                          </>
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleImageChange}
                          className="absolute inset-0 opacity-0 cursor-pointer"
                          required={!screenshotUrl}
                        />
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-1.5 ml-1">Account Number</label>
                    <input
                      type="text"
                      value={accountNumber}
                      onChange={(e) => setAccountNumber(e.target.value)}
                      className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-accent-blue transition-colors"
                      placeholder="Account or Wallet Number"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-1.5 ml-1">Account Holder Name</label>
                    <input
                      type="text"
                      value={accountHolder}
                      onChange={(e) => setAccountHolder(e.target.value)}
                      className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-accent-blue transition-colors"
                      placeholder="Your Full Name"
                      required
                    />
                  </div>
                </>
              )}

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
