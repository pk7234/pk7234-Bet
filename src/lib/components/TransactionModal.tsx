import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Wallet, Camera, Link as LinkIcon, Send } from 'lucide-react';
import { db } from '../firebase';
import { collection, addDoc, serverTimestamp, doc, updateDoc, increment, getDoc, Timestamp, query, where, orderBy, getDocs, deleteDoc } from 'firebase/firestore';
import { auth } from '../firebase';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  }
  const errorJson = JSON.stringify(errInfo);
  console.error('Firestore Error Details:', errorJson);
  throw new Error(errorJson);
}

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
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [accountNumber, setAccountNumber] = useState('');
  const [accountHolder, setAccountHolder] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        return setError('Image size should be less than 5MB');
      }
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const uploadToImgBB = async (file: File): Promise<string> => {
    const apiKey = (import.meta as any).env.VITE_IMGBB_API_KEY || 'b4d008817c080c65cbe192d0a9f8d808';
    const formData = new FormData();
    formData.append('image', file);
    
    try {
      const response = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, {
        method: 'POST',
        body: formData,
      });
      
      const data = await response.json();
      if (data.success) {
        return data.data.url;
      } else {
        throw new Error(data.error?.message || 'Failed to upload image to ImgBB');
      }
    } catch (err) {
      console.error('ImgBB Upload Error:', err);
      throw new Error('Image upload failed. Please try again.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || parseFloat(amount) <= 0) return setError('Please enter a valid amount');
    if (!method) return setError('Please select a payment method');
    
    if (type === 'deposit') {
      if (!transactionId) return setError('Please enter transaction ID');
      if (!imageFile) return setError('Please upload payment screenshot');
    } else {
      if (!accountNumber) return setError('Please enter account number');
      if (!accountHolder) return setError('Please enter account holder name');
    }

    setError('');
    setLoading(true);

    try {
      let finalScreenshotUrl = '';

      if (type === 'deposit' && imageFile) {
        setLoading(true);
        // Step 1: Upload to ImgBB
        finalScreenshotUrl = await uploadToImgBB(imageFile);
      }

      const currentUid = auth.currentUser?.uid;
      if (!currentUid) throw new Error('Not authenticated');

      let currentBalance = 0;
      try {
        const userRef = doc(db, 'users', currentUid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          currentBalance = userSnap.data().balance;
        }

        if (type === 'withdrawal') {
          if (currentBalance < parseFloat(amount)) {
            throw new Error('Insufficient balance');
          }

          await updateDoc(userRef, {
            balance: increment(-parseFloat(amount))
          });
          // Update the local snapshot variable to reflect the balance AFTER deduction for withdrawal
          currentBalance -= parseFloat(amount);
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users/${currentUid}`);
      }

      try {
        await addDoc(collection(db, 'transactions'), {
          userId: currentUid,
          userEmail: auth.currentUser?.email || '',
          type,
          amount: parseFloat(amount),
          userBalanceSnapshot: currentBalance, // Store the balance snapshot
          method,
          transactionId: type === 'deposit' ? transactionId : null,
          screenshotUrl: type === 'deposit' ? finalScreenshotUrl : null,
          accountNumber: type === 'withdrawal' ? accountNumber : null,
          accountHolder: type === 'withdrawal' ? accountHolder : null,
          status: 'pending',
          seen: false,
          createdAt: serverTimestamp()
        });

        // Cleanup oldest transactions if user has more than 50
        try {
          const trQuery = query(
            collection(db, 'transactions'),
            where('userId', '==', currentUid),
            orderBy('createdAt', 'desc')
          );
          const trSnap = await getDocs(trQuery);
          if (trSnap.size > 50) {
             // Keep the most recent 50
             const toDelete = trSnap.docs.slice(50);
             for (const d of toDelete) {
               await deleteDoc(d.ref);
             }
          }
        } catch (cleanupErr) {
          console.error("History cleanup failed:", cleanupErr);
          // Don't interrupt the main flow if cleanup fails
        }

      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, 'transactions');
      }

      onClose();
      alert('Request sent successfully!');
      setAmount('');
      setMethod('');
      setTransactionId('');
      setImageFile(null);
      setImagePreview(null);
      setAccountNumber('');
      setAccountHolder('');
    } catch (err: any) {
      let displayError = err.message;
      try {
        const parsed = JSON.parse(err.message);
        if (parsed.error && parsed.error.includes('Missing or insufficient permissions')) {
          displayError = "Submission failed: Security rules blocked this request. Please contact support or try again.";
        }
      } catch (e) {
        // Not a JSON error, use raw message
      }
      setError(displayError);
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
                    <div className="relative">
                      {!imagePreview ? (
                        <div className="w-full bg-black/40 border-2 border-dashed border-white/5 rounded-xl p-6 flex flex-col items-center justify-center hover:border-accent-blue/30 transition-all cursor-pointer group">
                           <Camera className="w-8 h-8 text-gray-600 mb-2 group-hover:text-accent-blue transition-colors" />
                           <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Select Payment Proof</span>
                           <input
                            type="file"
                            accept="image/*"
                            onChange={handleImageChange}
                            className="absolute inset-0 opacity-0 cursor-pointer"
                            required={!imageFile}
                          />
                        </div>
                      ) : (
                        <div className="p-3 bg-black/40 border border-white/5 rounded-xl flex items-center gap-4">
                           <div className="w-16 h-16 rounded-lg overflow-hidden border border-white/10 shrink-0">
                              <img src={imagePreview} className="w-full h-full object-cover" alt="Proof" />
                           </div>
                           <div className="flex-1 min-w-0">
                              <div className="text-[10px] font-black text-[#2ecc71] uppercase tracking-widest mb-1">Image Selected</div>
                              <div className="text-[9px] text-gray-500 truncate">payment_proof_shot.jpg</div>
                           </div>
                           <button 
                             type="button"
                             onClick={() => {
                               setImageFile(null);
                               setImagePreview(null);
                             }}
                             className="p-2 hover:bg-accent-red/20 text-accent-red rounded-lg transition-colors"
                           >
                              <X className="w-4 h-4" />
                           </button>
                        </div>
                      )}
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
