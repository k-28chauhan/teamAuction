import React from 'react';
import { AlertCircle, CheckCircle, Info, RefreshCw } from 'lucide-react';

interface AlertProps {
  message: string;
  variant?: 'error' | 'info' | 'warning' | 'reconnecting';
  className?: string;
  onDismiss?: () => void;
}

export function Alert({ message, variant = 'error', className = '', onDismiss }: AlertProps) {
  if (!message) return null;

  const variantStyles = {
    error: 'bg-rose-50 border-rose-200 text-rose-800',
    info: 'bg-slate-100 border-slate-200 text-slate-800',
    warning: 'bg-amber-50 border-amber-200 text-amber-800',
    reconnecting: 'bg-amber-50 border-amber-300 text-amber-900 font-medium',
  };

  return (
    <div
      className={`flex items-center justify-between rounded-lg border px-3.5 py-2.5 text-sm ${variantStyles[variant]} ${className}`}
      role="alert"
    >
      <div className="flex items-center gap-2.5">
        {variant === 'error' && <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />}
        {variant === 'reconnecting' && <RefreshCw className="w-4 h-4 text-amber-600 animate-spin shrink-0" />}
        {variant === 'info' && <Info className="w-4 h-4 text-slate-600 shrink-0" />}
        <span>{message}</span>
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="text-slate-400 hover:text-slate-700 p-1 text-xs leading-none transition-colors"
          aria-label="Dismiss"
        >
          ✕
        </button>
      )}
    </div>
  );
}
