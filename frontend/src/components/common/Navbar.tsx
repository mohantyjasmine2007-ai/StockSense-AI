import React from 'react';
import { PageId, HealthStatus } from '../../types';
import { Activity, ShieldCheck, Database } from 'lucide-react';
import { Badge } from './Badge';

interface NavbarProps {
  currentPage: PageId;
  health: HealthStatus | null;
}

const pageTitles: Record<PageId, { title: string; subtitle: string }> = {
  dashboard: {
    title: 'Executive Dashboard',
    subtitle: 'Cross-store inventory health, active alerts, and AI intervention overview',
  },
  forecasting: {
    title: 'Demand Forecasting Engine',
    subtitle: '7 & 14-day chronological projections with uncertainty intervals and baseline comparison',
  },
  rebalance: {
    title: 'Inventory & Store Re-balancing',
    subtitle: 'Safety stock tracking, shortage prevention, and cross-store stock transfer recommendations',
  },
  signals: {
    title: 'External Market Signals',
    subtitle: 'Hyper-local weather forecasts, regional holiday events, and demand sensitivity modeling',
  },
  actions: {
    title: 'Recommended Operational Actions',
    subtitle: 'Human-in-the-loop approval workflow for inter-store transfers and supplier reorders',
  },
  simulator: {
    title: 'Impact Simulator & Reports',
    subtitle: 'Dual-policy chronological backtesting: Traditional ERP rules vs StockSense AI policy',
  },
  'data-settings': {
    title: 'Data Management & System Settings',
    subtitle: 'Upload custom retail CSV datasets, configure parameters, or reset to calibrated benchmark',
  },
};

export const Navbar: React.FC<NavbarProps> = ({ currentPage, health }) => {
  const current = pageTitles[currentPage];

  return (
    <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between">
      <div>
        <h2 className="text-lg font-bold text-white tracking-tight">{current.title}</h2>
        <p className="text-xs text-slate-400 mt-0.5">{current.subtitle}</p>
      </div>

      <div className="flex items-center space-x-3">
        {health?.status === 'ok' ? (
          <div className="flex items-center space-x-2 bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-300">
            <Database className="w-3.5 h-3.5 text-teal-400" />
            <span>
              {health.stores_count} Stores · {health.products_count} SKUs · {health.sales_records_count} Sales Rows
            </span>
          </div>
        ) : (
          <Badge variant="warning" size="sm">
            <Activity className="w-3 h-3 mr-1" /> Connecting Backend...
          </Badge>
        )}

        <div className="hidden sm:flex items-center space-x-1.5 bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-300">
          <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
          <span>No-Leakage Guard Active</span>
        </div>
      </div>
    </header>
  );
};
