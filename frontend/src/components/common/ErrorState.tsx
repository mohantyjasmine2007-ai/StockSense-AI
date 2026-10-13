import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'System Error Encountered',
  message,
  onRetry,
}) => {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center rounded-xl border border-rose-500/30 bg-rose-950/20">
      <div className="p-3 rounded-full bg-rose-900/40 border border-rose-500/40 text-rose-300 mb-3">
        <AlertTriangle className="w-6 h-6" />
      </div>
      <h4 className="text-sm font-semibold text-rose-200">{title}</h4>
      <p className="mt-1 text-xs text-rose-300/80 max-w-md">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 inline-flex items-center space-x-2 px-3.5 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-lg transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5 mr-1" />
          <span>Retry Operation</span>
        </button>
      )}
    </div>
  );
};
