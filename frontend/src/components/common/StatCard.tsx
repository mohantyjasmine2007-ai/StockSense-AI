import React from 'react';
import { LucideIcon } from 'lucide-react';
import { Badge } from './Badge';

interface StatCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  icon: LucideIcon;
  trend?: {
    value: string;
    isPositive: boolean;
  };
  isDesignSample?: boolean;
  badge?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  subtext,
  icon: Icon,
  trend,
  isDesignSample = false,
  badge,
}) => {
  return (
    <div className="analytics-card p-5 relative overflow-hidden group">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
              {label}
            </span>
            {isDesignSample && (
              <Badge variant="neutral" size="sm" className="opacity-70 text-[10px] py-0 px-1.5">
                Layout Placeholder
              </Badge>
            )}
            {badge && (
              <Badge variant="teal" size="sm" className="text-[10px] py-0 px-1.5">
                {badge}
              </Badge>
            )}
          </div>
          <div className="text-2xl font-bold tracking-tight text-white mt-1">
            {value}
          </div>
        </div>
        <div className="p-2.5 rounded-lg bg-slate-800/80 border border-slate-700/60 text-teal-400 group-hover:border-teal-500/40 group-hover:text-teal-300 transition-colors">
          <Icon className="w-5 h-5" />
        </div>
      </div>

      {(subtext || trend) && (
        <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
          <span>{subtext}</span>
          {trend && (
            <span
              className={`font-semibold ${
                trend.isPositive ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {trend.value}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
