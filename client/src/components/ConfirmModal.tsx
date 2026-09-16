import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, Flag, X } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmText = 'Confirm Surrender',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="w-full max-w-md bg-slate-900 border-2 border-rose-500/40 rounded-2xl p-6 shadow-2xl text-white flex flex-col items-center text-center relative"
          >
            <button
              onClick={onCancel}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg transition-all"
            >
              <X size={18} />
            </button>

            <div className="w-14 h-14 bg-rose-500/20 text-rose-400 rounded-2xl flex items-center justify-center mb-4 border border-rose-500/30 shadow-lg shadow-rose-900/20">
              <Flag size={28} />
            </div>

            <h2 className="text-xl font-black text-white mb-2 tracking-tight flex items-center gap-2">
              <AlertTriangle size={20} className="text-rose-400" /> {title}
            </h2>

            <p className="text-sm text-slate-300 font-medium mb-6 leading-relaxed">
              {message}
            </p>

            <div className="grid grid-cols-2 gap-3 w-full">
              <button
                onClick={onCancel}
                className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold py-3 rounded-xl transition-all border border-slate-700 text-xs cursor-pointer"
              >
                {cancelText}
              </button>

              <button
                onClick={onConfirm}
                className="w-full bg-rose-600 hover:bg-rose-500 text-white font-black py-3 rounded-xl shadow-lg shadow-rose-600/30 transition-all border border-rose-400 text-xs cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Flag size={14} /> {confirmText}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
