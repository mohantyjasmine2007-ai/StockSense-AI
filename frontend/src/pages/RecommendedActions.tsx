import React, { useState, useEffect } from 'react';
import {
  GlobalFilterState,
  SystemMeta,
  RebalanceRecommendationsResponse,
  RecommendedActionItem,
} from '../types';
import { api } from '../api/client';
import { Card } from '../components/common/Card';
import { Badge } from '../components/common/Badge';
import { StatCard } from '../components/common/StatCard';
import { LoadingState } from '../components/common/LoadingState';
import { ErrorState } from '../components/common/ErrorState';
import {
  CheckSquare,
  ShieldCheck,
  Check,
  X,
  ArrowRight,
  Clock,
  ArrowLeftRight,
  Truck,
  RotateCcw,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Info,
  Calendar,
  Layers,
  Sparkles,
  Store,
  DollarSign,
  AlertCircle,
} from 'lucide-react';

interface RecommendedActionsProps {
  filterState: GlobalFilterState;
  meta: SystemMeta | null;
}

export const RecommendedActions: React.FC<RecommendedActionsProps> = ({
  filterState,
  meta,
}) => {
  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [recommendationsData, setRecommendationsData] = useState<RebalanceRecommendationsResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Expanded evidence drawers
  const [expandedActionId, setExpandedActionId] = useState<string | null>(null);

  // Action in-flight loading IDs
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Reject modal / reason state
  const [rejectingAction, setRejectingAction] = useState<RecommendedActionItem | null>(null);
  const [rejectReason, setRejectReason] = useState<string>('Holding stock for store VIP demand');

  const fetchRecommendations = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getRebalanceRecommendations({
        store_id: filterState.selectedStore !== 'ALL' ? filterState.selectedStore : undefined,
        product_id: filterState.selectedProduct !== 'ALL' ? filterState.selectedProduct : undefined,
      });
      setRecommendationsData(res);
    } catch (err: any) {
      console.error('Failed to load recommended actions:', err);
      setError(err?.message || 'Failed to fetch recommendations.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecommendations();
  }, [filterState.selectedStore, filterState.selectedProduct]);

  const handleApprove = async (actionId: string) => {
    setProcessingId(actionId);
    try {
      await api.approveAction(actionId, 'Authorized by inventory manager');
      // Update local state smoothly
      if (recommendationsData) {
        const updated = recommendationsData.recommendations.map((r) =>
          r.id === actionId
            ? { ...r, status: 'approved' as const, approved_at: new Date().toISOString() }
            : r
        );
        const totalPending = updated.filter((r) => r.status === 'pending').length;
        const totalApproved = updated.filter((r) => r.status === 'approved').length;
        const totalRejected = updated.filter((r) => r.status === 'rejected').length;
        setRecommendationsData({
          ...recommendationsData,
          recommendations: updated,
          total_pending: totalPending,
          total_approved: totalApproved,
          total_rejected: totalRejected,
        });
      }
    } catch (err: any) {
      alert(`Approval error: ${err?.message || 'Failed to approve'}`);
    } finally {
      setProcessingId(null);
    }
  };

  const handleRejectConfirm = async () => {
    if (!rejectingAction) return;
    const actionId = rejectingAction.id;
    setProcessingId(actionId);
    try {
      await api.rejectAction(actionId, rejectReason);
      if (recommendationsData) {
        const updated = recommendationsData.recommendations.map((r) =>
          r.id === actionId
            ? {
                ...r,
                status: 'rejected' as const,
                rejected_at: new Date().toISOString(),
                rejection_reason: rejectReason,
              }
            : r
        );
        const totalPending = updated.filter((r) => r.status === 'pending').length;
        const totalApproved = updated.filter((r) => r.status === 'approved').length;
        const totalRejected = updated.filter((r) => r.status === 'rejected').length;
        setRecommendationsData({
          ...recommendationsData,
          recommendations: updated,
          total_pending: totalPending,
          total_approved: totalApproved,
          total_rejected: totalRejected,
        });
      }
      setRejectingAction(null);
    } catch (err: any) {
      alert(`Rejection error: ${err?.message || 'Failed to reject'}`);
    } finally {
      setProcessingId(null);
    }
  };

  const handleResetAll = async () => {
    if (!window.confirm('Reset all action statuses back to pending?')) return;
    try {
      await api.resetActions();
      fetchRecommendations();
    } catch (err: any) {
      alert(`Reset error: ${err?.message}`);
    }
  };

  const handleApproveAllPendingTransfers = async () => {
    if (!recommendationsData) return;
    const pendingTransfers = recommendationsData.recommendations.filter(
      (r) => r.status === 'pending' && r.action_type === 'transfer'
    );
    if (pendingTransfers.length === 0) return;

    for (const tr of pendingTransfers) {
      await api.approveAction(tr.id, 'Batch authorized inter-store transfer');
    }
    fetchRecommendations();
  };

  const displayedActions = React.useMemo(() => {
    if (!recommendationsData) return [];
    let list = recommendationsData.recommendations.filter((r) => r.status === activeTab);
    if (selectedType !== 'all') {
      list = list.filter((r) => r.action_type === selectedType);
    }
    return list;
  }, [recommendationsData, activeTab, selectedType]);

  return (
    <div className="space-y-6">
      {/* Workflow Rule Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-sm">
        <div>
          <div className="flex items-center space-x-2">
            <h3 className="text-sm font-semibold text-slate-100">Human-in-the-Loop Operational Decisions</h3>
            <Badge variant="teal" size="sm">Phase 4 Authorization Queue</Badge>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Every inventory movement requires explicit manager authorization or adheres to pre-set policy limits.
          </p>
        </div>

        <div className="flex items-center space-x-3 text-xs text-slate-300">
          <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-teal-500/10 border border-teal-500/20 text-teal-300">
            <ShieldCheck className="w-4 h-4 text-teal-400" />
            <span>Audit Trail & Rationale Guard</span>
          </div>

          <button
            onClick={handleResetAll}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors border border-slate-700"
            title="Reset All Approvals"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Persistent Execution Status Disclaimer Banner */}
      <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 flex items-start space-x-3 text-xs text-slate-400">
        <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          <strong className="text-slate-200">Execution Notice:</strong> Approvals update the application’s
          persistent action status record. In accordance with retail audit standards, approved recommendations
          are staged for operations and are not represented as executed physical inventory movements until an active
          WMS/ERP adapter completes delivery.
        </p>
      </div>

      {loading && !recommendationsData && (
        <LoadingState message="Fetching multi-store transfer recommendations and persistent authorization status..." />
      )}

      {error && !loading && (
        <ErrorState message={error} onRetry={fetchRecommendations} />
      )}

      {recommendationsData && (
        <>
          {/* Tabs and Quick Actions */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-2">
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setActiveTab('pending')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  activeTab === 'pending'
                    ? 'bg-teal-500/10 text-teal-300 border border-teal-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Pending Authorization ({recommendationsData.total_pending})
              </button>
              <button
                onClick={() => setActiveTab('approved')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  activeTab === 'approved'
                    ? 'bg-teal-500/10 text-teal-300 border border-teal-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Approved Staged Queue ({recommendationsData.total_approved})
              </button>
              <button
                onClick={() => setActiveTab('rejected')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  activeTab === 'rejected'
                    ? 'bg-rose-500/10 text-rose-300 border border-rose-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Declined Suggestions ({recommendationsData.total_rejected})
              </button>
            </div>

            <div className="flex items-center space-x-3 text-xs">
              {/* Type Filter */}
              <div className="flex items-center space-x-1 bg-slate-950 border border-slate-800 rounded-lg p-1">
                <button
                  onClick={() => setSelectedType('all')}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                    selectedType === 'all' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  All Types
                </button>
                <button
                  onClick={() => setSelectedType('transfer')}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                    selectedType === 'transfer' ? 'bg-teal-500/20 text-teal-300' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Transfers Only
                </button>
                <button
                  onClick={() => setSelectedType('reorder')}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                    selectedType === 'reorder' ? 'bg-amber-500/20 text-amber-300' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Reorders Only
                </button>
              </div>

              {activeTab === 'pending' && recommendationsData.transfers_count > 0 && (
                <button
                  onClick={handleApproveAllPendingTransfers}
                  className="px-3 py-1 rounded-lg text-xs font-medium text-white bg-teal-600 hover:bg-teal-500 transition-colors shadow-sm"
                >
                  Approve All Transfers
                </button>
              )}
            </div>
          </div>

          {/* Action Cards Queue */}
          <div className="space-y-4">
            {displayedActions.length === 0 ? (
              <div className="p-12 text-center border border-dashed border-slate-800 rounded-xl bg-slate-950/40">
                <CheckSquare className="w-8 h-8 mx-auto text-slate-600 mb-2" />
                <h4 className="text-sm font-semibold text-slate-300">No actions in this queue</h4>
                <p className="text-xs text-slate-500 mt-1">
                  {activeTab === 'pending'
                    ? 'All recommendations have been authorized or reviewed.'
                    : `No items marked as ${activeTab}.`}
                </p>
              </div>
            ) : (
              displayedActions.map((action) => {
                const isTransfer = action.action_type === 'transfer';
                const isExpanded = expandedActionId === action.id;

                return (
                  <div
                    key={action.id}
                    className={`rounded-xl border transition-all ${
                      action.status === 'approved'
                        ? 'border-emerald-500/30 bg-emerald-950/10'
                        : action.status === 'rejected'
                        ? 'border-rose-500/30 bg-rose-950/10 opacity-75'
                        : isTransfer
                        ? 'border-teal-500/40 bg-slate-900/80 shadow-md'
                        : 'border-slate-800 bg-slate-900/60'
                    }`}
                  >
                    {/* Header Row */}
                    <div className="p-4 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center space-x-3">
                        <div
                          className={`p-2 rounded-lg ${
                            isTransfer
                              ? 'bg-teal-500/10 border border-teal-500/30 text-teal-400'
                              : 'bg-amber-500/10 border border-amber-500/30 text-amber-400'
                          }`}
                        >
                          {isTransfer ? <ArrowLeftRight className="w-5 h-5" /> : <Truck className="w-5 h-5" />}
                        </div>

                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="text-[11px] font-mono font-bold text-slate-400">
                              {action.product_id}
                            </span>
                            <Badge variant={isTransfer ? 'teal' : 'warning'} size="sm">
                              {isTransfer ? 'Inter-Store Transfer' : 'Supplier Reorder'}
                            </Badge>
                            <Badge
                              variant={
                                action.urgency === 'CRITICAL'
                                  ? 'critical'
                                  : action.urgency === 'HIGH'
                                  ? 'warning'
                                  : 'neutral'
                              }
                              size="sm"
                            >
                              {action.urgency}
                            </Badge>
                          </div>
                          <h4 className="text-sm font-bold text-white mt-0.5">{action.product_name}</h4>
                        </div>
                      </div>

                      {/* Route & Quantity Summary */}
                      <div className="flex items-center space-x-4">
                        <div className="text-right">
                          <span className="text-xs font-mono font-bold text-white block">
                            {action.recommended_quantity} units (${action.total_cost.toFixed(2)})
                          </span>
                          <span className="text-[11px] text-slate-400">
                            {action.lead_time_days}d Lead Time
                          </span>
                        </div>

                        {/* Route display */}
                        <div className="hidden sm:flex items-center space-x-2 bg-slate-950/80 px-3 py-1.5 rounded-lg border border-slate-800 text-xs">
                          <span className="text-slate-300 font-medium">{action.source_store_name}</span>
                          <ArrowRight className="w-3.5 h-3.5 text-teal-400" />
                          <span className="text-slate-300 font-medium">{action.destination_store_name}</span>
                        </div>
                      </div>

                      {/* Action Approval Buttons */}
                      <div className="flex items-center space-x-2">
                        {action.status === 'pending' ? (
                          <>
                            <button
                              onClick={() => handleApprove(action.id)}
                              disabled={processingId === action.id}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-teal-600 hover:bg-teal-500 transition-colors flex items-center space-x-1 shadow-sm disabled:opacity-50"
                            >
                              <Check className="w-3.5 h-3.5 mr-0.5" />
                              <span>{processingId === action.id ? 'Approving...' : 'Approve'}</span>
                            </button>

                            <button
                              onClick={() => setRejectingAction(action)}
                              disabled={processingId === action.id}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-rose-900/50 transition-colors border border-slate-700 hover:border-rose-700/60"
                            >
                              <X className="w-3.5 h-3.5 mr-0.5 text-rose-400" />
                              <span>Decline</span>
                            </button>
                          </>
                        ) : action.status === 'approved' ? (
                          <Badge variant="success" size="sm">
                            <Check className="w-3 h-3 mr-1" />
                            Approved (Authorization Staged)
                          </Badge>
                        ) : (
                          <Badge variant="critical" size="sm">
                            <X className="w-3 h-3 mr-1" />
                            Declined
                          </Badge>
                        )}

                        <button
                          onClick={() => setExpandedActionId(isExpanded ? null : action.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                          title="Toggle Evidence Details"
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {/* Rationale Narrative */}
                    <div className="px-4 pb-3">
                      <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/40 p-2.5 rounded-lg border border-slate-800/80">
                        <strong className="text-teal-400 font-semibold mr-1">Rationale:</strong>
                        {action.reason}
                      </p>
                    </div>

                    {/* Expanded Quantitative Evidence Drawer */}
                    {isExpanded && (
                      <div className="p-4 border-t border-slate-800 bg-slate-950/80 rounded-b-xl space-y-3 text-xs">
                        <div className="flex items-center space-x-2 text-slate-200 font-semibold border-b border-slate-800 pb-2">
                          <Layers className="w-4 h-4 text-teal-400" />
                          <span>Quantitative Evidence &amp; Forecast Verification</span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* Receiving Store Proof */}
                          <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 space-y-1.5 font-mono">
                            <span className="font-sans font-semibold text-rose-300 text-xs block mb-1">
                              Receiver Proof ({action.destination_store_name})
                            </span>
                            <div className="flex justify-between text-slate-400">
                              <span>Stock On Hand:</span>
                              <span className="text-white font-bold">{action.evidence.receiving_stock_on_hand} units</span>
                            </div>
                            <div className="flex justify-between text-slate-400">
                              <span>14-Day Forecast Demand:</span>
                              <span className="text-slate-200">{action.evidence.receiving_forecast_demand_14d} units</span>
                            </div>
                            <div className="flex justify-between text-slate-400">
                              <span>Target Safety Stock:</span>
                              <span className="text-amber-300">{action.evidence.receiving_safety_stock} units</span>
                            </div>
                            <div className="flex justify-between text-slate-400 pt-1 border-t border-slate-800">
                              <span>Time to Stockout:</span>
                              <span className="text-rose-400 font-bold">
                                {action.time_to_stockout_days ? `${action.time_to_stockout_days} days` : 'Within Horizon'}
                              </span>
                            </div>
                          </div>

                          {/* Donor Store Proof (if transfer) or Supplier lead time */}
                          {isTransfer ? (
                            <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 space-y-1.5 font-mono">
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-sans font-semibold text-teal-300 text-xs">
                                  Donor Protection ({action.source_store_name})
                                </span>
                                <Badge variant="teal" size="sm">
                                  Buffer Protected
                                </Badge>
                              </div>
                              <div className="flex justify-between text-slate-400">
                                <span>Donor Stock On Hand:</span>
                                <span className="text-white font-bold">{action.evidence.donor_stock_on_hand} units</span>
                              </div>
                              <div className="flex justify-between text-slate-400">
                                <span>Donor 14-Day Forecast:</span>
                                <span className="text-slate-200">{action.evidence.donor_forecast_demand_14d} units</span>
                              </div>
                              <div className="flex justify-between text-slate-400">
                                <span>Surplus Before Transfer:</span>
                                <span className="text-teal-400 font-bold">+{action.evidence.donor_surplus_before_transfer} units</span>
                              </div>
                              <div className="flex justify-between text-slate-400 pt-1 border-t border-slate-800">
                                <span>Surplus After Transfer:</span>
                                <span className="text-teal-300 font-bold">+{action.evidence.donor_surplus_after_transfer} units</span>
                              </div>
                            </div>
                          ) : (
                            <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 space-y-1.5 font-mono">
                              <span className="font-sans font-semibold text-amber-300 text-xs block mb-1">
                                Supplier Procurement Parameters
                              </span>
                              <div className="flex justify-between text-slate-400">
                                <span>Supplier Lead Time:</span>
                                <span className="text-white font-bold">{action.evidence.supplier_lead_time_days} days</span>
                              </div>
                              <div className="flex justify-between text-slate-400">
                                <span>Unit Purchase Cost:</span>
                                <span className="text-slate-200">${action.unit_cost.toFixed(2)}</span>
                              </div>
                              <div className="flex justify-between text-slate-400">
                                <span>Total Procurement Order Value:</span>
                                <span className="text-white font-bold">${action.total_cost.toFixed(2)}</span>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Audit Details */}
                        <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-800/80">
                          <div>
                            Execution Policy: <span className="text-slate-400">{action.execution_note}</span>
                          </div>
                          {action.rejection_reason && (
                            <div className="text-rose-400">
                              Reason for Declining: {action.rejection_reason}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </>
      )}

      {/* Decline Reason Modal */}
      {rejectingAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center space-x-2 text-rose-400">
              <AlertCircle className="w-5 h-5" />
              <h4 className="text-sm font-bold text-white">Decline Inventory Recommendation</h4>
            </div>

            <p className="text-xs text-slate-300">
              Please specify the audit rationale for declining the recommended action for{' '}
              <strong>{rejectingAction.product_name}</strong>:
            </p>

            <div className="space-y-2">
              <label className="text-[11px] text-slate-400 font-medium">Decline Rationale:</label>
              <select
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:outline-none"
              >
                <option value="Holding stock for store VIP demand / anticipated event">
                  Holding stock for store VIP demand / anticipated event
                </option>
                <option value="Alternative supplier replenishment already initiated manually">
                  Alternative supplier replenishment already initiated manually
                </option>
                <option value="Inter-store transfer volume does not meet minimum freight shipment">
                  Inter-store transfer volume does not meet minimum freight shipment
                </option>
                <option value="Shortage acceptable under current business priority">
                  Shortage acceptable under current business priority
                </option>
              </select>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setRejectingAction(null)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={handleRejectConfirm}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500"
              >
                Confirm Decline
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
