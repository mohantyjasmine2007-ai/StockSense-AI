import React from 'react';
import { GlobalFilterState, SystemMeta } from '../types';
import { Card } from '../components/common/Card';
import { Badge } from '../components/common/Badge';
import { StatCard } from '../components/common/StatCard';
import { BarChart3, Download, Play, Sliders, ShieldAlert, Award } from 'lucide-react';

interface ImpactSimulatorProps {
  filterState: GlobalFilterState;
  meta: SystemMeta | null;
}

export const ImpactSimulator: React.FC<ImpactSimulatorProps> = ({
  filterState,
  meta,
}) => {
  return (
    <div className="space-y-6">
      {/* Simulation Concept Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h3 className="text-sm font-semibold text-slate-100">Historical Policy Backtest Simulator</h3>
            <Badge variant="teal" size="sm">Phase 4 Target</Badge>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Replaying the past 90 days under both inventory paradigms to validate reduction in stockout incidents.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            disabled
            className="inline-flex items-center space-x-2 px-3.5 py-1.5 text-xs font-semibold text-slate-400 bg-slate-800/60 border border-slate-700/60 rounded-lg cursor-not-allowed"
          >
            <Play className="w-3.5 h-3.5" />
            <span>Run Simulation (Phase 4)</span>
          </button>
          <button
            disabled
            className="inline-flex items-center space-x-2 px-3 py-1.5 text-xs font-medium text-slate-400 bg-slate-800/60 border border-slate-700/60 rounded-lg cursor-not-allowed"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Report</span>
          </button>
        </div>
      </div>

      {/* Target & Guardrail Notice */}
      <div className="p-4 rounded-xl border border-teal-500/20 bg-teal-950/15 flex items-start space-x-3">
        <Award className="w-5 h-5 text-teal-400 shrink-0 mt-0.5" />
        <div className="text-xs space-y-1">
          <h5 className="font-semibold text-teal-200">The 30% Stockout Reduction Verification Standard</h5>
          <p className="text-slate-300 leading-relaxed">
            Per the hackathon specification, the 30% reduction goal is an <strong>evaluated target</strong>,
            never a hardcoded assumption. In Phase 4, the simulator replays historical sales day-by-day,
            firing orders under traditional ERP rules versus AI-transfers, calculating the exact realized stockout
            delta and carrying cost impact dynamically.
          </p>
        </div>
      </div>

      {/* Side-by-Side Policy Metrics Shell */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Baseline ERP Card */}
        <Card
          title="Policy A: Traditional ERP Rules"
          subtitle="Fixed reorder points · Moving average · Siloed stores"
          badge={<Badge variant="neutral" size="sm">Baseline</Badge>}
        >
          <div className="space-y-3 text-xs">
            <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 flex justify-between">
              <span className="text-slate-400">Total Stockout Days:</span>
              <span className="font-mono text-slate-300">Phase 4 Replay</span>
            </div>
            <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 flex justify-between">
              <span className="text-slate-400">Inventory Holding Cost:</span>
              <span className="font-mono text-slate-300">Phase 4 Replay</span>
            </div>
            <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 flex justify-between">
              <span className="text-slate-400">Customer Fill Rate:</span>
              <span className="font-mono text-slate-300">Phase 4 Replay</span>
            </div>
          </div>
        </Card>

        {/* StockSense AI Policy Card */}
        <Card
          title="Policy B: StockSense AI"
          subtitle="Dynamic uncertainty buffers · External signals · Network re-balancing"
          badge={<Badge variant="teal" size="sm">AI Assisted</Badge>}
        >
          <div className="space-y-3 text-xs">
            <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 flex justify-between">
              <span className="text-slate-400">Target Stockout Reduction:</span>
              <span className="font-mono text-teal-300">Evaluating ~30% Target</span>
            </div>
            <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 flex justify-between">
              <span className="text-slate-400">Holding Cost Delta:</span>
              <span className="font-mono text-teal-300">Constrained (Non-inflating)</span>
            </div>
            <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 flex justify-between">
              <span className="text-slate-400">Optimized Fill Rate:</span>
              <span className="font-mono text-teal-300">Evaluated in Phase 4</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Simulator Timeline Shell */}
      <Card
        title="Chronological Cumulative Comparison Graph"
        subtitle="Daily tracking of stockout occurrences and cumulative holding cost"
      >
        <div className="h-64 flex flex-col items-center justify-center border border-dashed border-slate-800 rounded-lg bg-slate-950/40 text-center p-6">
          <BarChart3 className="w-8 h-8 text-teal-400 mb-2" />
          <h4 className="text-sm font-semibold text-slate-200">Backtest Replay Visualizer Shell</h4>
          <p className="text-xs text-slate-400 max-w-md mt-1">
            Visual dual-curve trajectory comparing daily out-of-stock events under both policies will render here.
          </p>
        </div>
      </Card>
    </div>
  );
};
