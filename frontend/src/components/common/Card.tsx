import React from 'react';

interface CardProps {
  title?: string;
  subtitle?: string;
  badge?: React.ReactNode;
  headerAction?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  accent?: boolean;
}

export const Card: React.FC<CardProps> = ({
  title,
  subtitle,
  badge,
  headerAction,
  children,
  className = '',
  accent = false,
}) => {
  return (
    <div
      className={`rounded-xl border transition-all ${
        accent
          ? 'bg-gradient-to-br from-slate-900 via-slate-900 to-teal-950/20 border-teal-500/25 shadow-lg shadow-teal-950/20'
          : 'bg-slate-900/90 border-slate-800 shadow-md'
      } ${className}`}
    >
      {(title || headerAction) && (
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800/80">
          <div className="flex items-center space-x-3">
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-sm font-semibold tracking-tight text-slate-100">{title}</h3>
                {badge}
              </div>
              {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
            </div>
          </div>
          {headerAction && <div className="flex items-center space-x-2">{headerAction}</div>}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
};
