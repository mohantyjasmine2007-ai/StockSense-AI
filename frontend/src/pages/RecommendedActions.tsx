import React, { useState } from 'react';
import { GlobalFilterState, SystemMeta } from '../types';
import { Card } from '../components/common/Card';
import { Badge } from '../components/common/Badge';
import { CheckSquare, ShieldCheck, Check, X, ArrowRight, Clock } from 'lucide-react';

interface RecommendedActionsProps {
  filterState: GlobalFilterState;
  meta: SystemMeta | null;
}

export const RecommendedActions: React.FC<RecommendedActionsProps> = ({
  filterState,
  meta,
}) => {
  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'rejected'>('pending');

  return (
    <div className="space-y-6">
      {/* Workflow Rule Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h3 className="text-sm font-semibold text-slate-100">Human-in-the-Loop Operational Decisions</h3>
            <Badge variant="teal" size="sm">Phase 3 Approval Engine</Badge>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Every inventory movement requires explicit manager authorization or adheres to pre-set policy limits.
          </p>
        </div>

        <div className="flex items-center space-x-2 text-xs text-slate-300">
          <ShieldCheck className="w-4 h-4 text-teal-400" />
          <span>Audit Trail & Rationale Guard</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center space-x-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab('pending')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            activeTab === 'pending'
              ? 'bg-teal-500/10 text-teal-300 border border-teal-500/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Pending Authorization (0)
        </button>
        <button
          onClick={() => setActiveTab('approved')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            activeTab === 'approved'
              ? 'bg-teal-500/10 text-teal-300 border border-teal-500/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Approved Execution History (0)
        </button>
        <button
          onClick={() => setActiveTab('rejected')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            activeTab === 'rejected'
              ? 'bg-teal-500/10 text-teal-300 border border-teal-500/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Declined Suggestions (0)
        </button>
      </div>

      {/* Action Workflow Container */}
      <Card
        title="Pending Recommendations Queue"
        subtitle="Ranked by stockout urgency and network savings"
        headerAction={
          <Badge variant="neutral" size="sm">
            Phase 3 Ready
          </Badge>
        }
      >
        <div className="p-8 text-center border border-dashed border-slate-800 rounded-lg bg-slate-950/40">
          <div className="w-12 h-12 mx-auto rounded-full bg-slate-800/80 border border-slate-700 flex items-center justify-center text-teal-400 mb-3">
            <CheckSquare className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-semibold text-slate-200">
            Interactive Recommendation Cards Shell
          </h4>
          <p className="text-xs text-slate-400 max-w-lg mx-auto mt-1 leading-relaxed">
            In Phase 3, computed transfers (e.g. <em>"Transfer 40 units of Umbrellas from Store 02 to Store 01"</em>)
            and supplier replenishments will render here with <strong>Approve</strong> and <strong>Reject</strong> action
            buttons, reason logging, and estimated cost impact.
          </p>
        </div>
      </Card>
    </div>
  );
};
