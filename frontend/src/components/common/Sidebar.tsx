import React from 'react';
import { PageId, HealthStatus } from '../../types';
import {
  LayoutDashboard,
  TrendingUp,
  ArrowLeftRight,
  CloudSun,
  CheckSquare,
  BarChart3,
  Database,
  Sparkles,
  Server,
} from 'lucide-react';

interface SidebarProps {
  currentPage: PageId;
  onPageChange: (page: PageId) => void;
  health: HealthStatus | null;
  healthLoading: boolean;
}

interface NavItem {
  id: PageId;
  label: string;
  icon: React.ElementType;
  badge?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentPage,
  onPageChange,
  health,
  healthLoading,
}) => {
  const navItems: NavItem[] = [
    { id: 'dashboard', label: 'Executive Dashboard', icon: LayoutDashboard },
    { id: 'forecasting', label: 'Demand Forecasting', icon: TrendingUp },
    { id: 'rebalance', label: 'Store Re-balancing', icon: ArrowLeftRight },
    { id: 'signals', label: 'External Signals', icon: CloudSun },
    { id: 'actions', label: 'Recommended Actions', icon: CheckSquare, badge: 'Phase 3' },
    { id: 'simulator', label: 'Impact Simulator', icon: BarChart3, badge: 'Phase 4' },
    { id: 'data-settings', label: 'Data & Settings', icon: Database },
  ];

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col h-screen shrink-0 select-none">
      {/* Brand Header */}
      <div className="p-5 border-b border-slate-800 flex items-center space-x-3">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-teal-600 to-teal-400 flex items-center justify-center text-slate-950 font-bold shadow-md shadow-teal-500/20">
          <Sparkles className="w-5 h-5 text-slate-950" />
        </div>
        <div>
          <div className="flex items-center space-x-1.5">
            <h1 className="text-base font-bold text-white tracking-tight">StockSense</h1>
            <span className="text-xs px-1.5 py-0.2 bg-teal-500/10 text-teal-400 border border-teal-500/30 rounded font-semibold">
              AI
            </span>
          </div>
          <p className="text-[11px] text-slate-400 font-medium">Inventory Copilot</p>
        </div>
      </div>

      {/* Navigation List */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Navigation
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onPageChange(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-all ${
                isActive
                  ? 'bg-teal-500/10 text-teal-300 border border-teal-500/30 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-center space-x-3">
                <Icon
                  className={`w-4 h-4 ${
                    isActive ? 'text-teal-400' : 'text-slate-400'
                  }`}
                />
                <span>{item.label}</span>
              </div>
              {item.badge && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Backend Status Card */}
      <div className="p-3 border-t border-slate-800 bg-slate-950/60">
        <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <Server className="w-4 h-4 text-slate-400" />
            <div>
              <p className="text-xs font-semibold text-slate-200">FastAPI Backend</p>
              <p className="text-[10px] text-slate-400">
                {healthLoading
                  ? 'Checking...'
                  : health?.status === 'ok'
                  ? `Online (v${health.version})`
                  : 'Disconnected'}
              </p>
            </div>
          </div>
          <div
            className={`w-2.5 h-2.5 rounded-full ${
              health?.status === 'ok'
                ? 'bg-teal-400 shadow-sm shadow-teal-400/50'
                : 'bg-rose-500 shadow-sm shadow-rose-500/50'
            }`}
          />
        </div>
      </div>
    </aside>
  );
};
