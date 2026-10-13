import React from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingStateProps {
  message?: string;
  subtext?: string;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  message = 'Loading system data...',
  subtext = 'Fetching latest model parameters and inventory records',
}) => {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center rounded-xl border border-slate-800 bg-slate-900/50">
      <div className="relative">
        <div className="w-12 h-12 rounded-full border-2 border-teal-500/20 border-t-teal-400 animate-spin flex items-center justify-center">
          <Loader2 className="w-5 h-5 text-teal-400 animate-pulse" />
        </div>
      </div>
      <p className="mt-4 text-sm font-medium text-slate-200">{message}</p>
      {subtext && <p className="mt-1 text-xs text-slate-400 max-w-sm">{subtext}</p>}
    </div>
  );
};
