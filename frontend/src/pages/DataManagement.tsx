import React, { useState, useEffect } from 'react';
import { HealthStatus, SystemMeta, DataStatus, DataPreview, ValidationReport } from '../types';
import { api } from '../api/client';
import { Card } from '../components/common/Card';
import { Badge } from '../components/common/Badge';
import { StatCard } from '../components/common/StatCard';
import { LoadingState } from '../components/common/LoadingState';
import { ErrorState } from '../components/common/ErrorState';
import {
  Database,
  UploadCloud,
  RotateCcw,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Calendar,
  Filter,
  Check,
  X,
  Info,
  ShieldCheck,
} from 'lucide-react';

interface DataManagementProps {
  health: HealthStatus | null;
  meta: SystemMeta | null;
  onRefreshMetadata?: () => void;
}

export const DataManagement: React.FC<DataManagementProps> = ({
  health,
  meta,
  onRefreshMetadata,
}) => {
  const [dataStatus, setDataStatus] = useState<DataStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState<boolean>(true);
  const [statusError, setStatusError] = useState<string | null>(null);

  // Upload state
  const [uploadType, setUploadType] = useState<'sales' | 'inventory' | 'signals'>('sales');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState<boolean>(false);
  const [validationReport, setValidationReport] = useState<ValidationReport | null>(null);
  const [uploadMessage, setUploadMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Preview state
  const [previewType, setPreviewType] = useState<string>('sales');
  const [previewData, setPreviewData] = useState<DataPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);
  const [filterStore, setFilterStore] = useState<string>('ALL');
  const [filterCategory, setFilterCategory] = useState<string>('ALL');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Reset state
  const [resetting, setResetting] = useState<boolean>(false);

  const fetchStatus = async () => {
    setLoadingStatus(true);
    setStatusError(null);
    try {
      const res = await api.getDataStatus();
      setDataStatus(res);
    } catch (err: any) {
      setStatusError(err?.message || 'Failed to fetch dataset status.');
    } finally {
      setLoadingStatus(false);
    }
  };

  const fetchPreview = async () => {
    setPreviewLoading(true);
    try {
      const res = await api.getDatasetPreview(previewType, {
        store_id: filterStore,
        category: filterCategory,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
        limit: 50,
      });
      setPreviewData(res);
    } catch (err: any) {
      console.error('Preview error:', err);
    } finally {
      setPreviewLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  useEffect(() => {
    fetchPreview();
  }, [previewType, filterStore, filterCategory, startDate, endDate]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
      setValidationReport(null);
      setUploadMessage(null);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    setUploadMessage(null);
    setValidationReport(null);

    try {
      const report = await api.uploadCsv(uploadType, selectedFile);
      setValidationReport(report);
      if (report.is_valid) {
        setUploadMessage({
          type: 'success',
          text: `Successfully validated and updated ${report.total_rows} records in ${uploadType}.`,
        });
        await fetchStatus();
        await fetchPreview();
        if (onRefreshMetadata) onRefreshMetadata();
      } else {
        setUploadMessage({
          type: 'error',
          text: `Validation failed with ${report.error_count} error(s). Review issues below.`,
        });
      }
    } catch (err: any) {
      setUploadMessage({
        type: 'error',
        text: err?.message || 'Upload processing failed.',
      });
    } finally {
      setUploading(false);
    }
  };

  const handleResetDemo = async () => {
    if (!window.confirm('Reset all sales, inventory, and signals to the calibrated benchmark demo dataset?')) {
      return;
    }
    setResetting(true);
    try {
      await api.resetDemoData();
      setValidationReport(null);
      setUploadMessage({
        type: 'success',
        text: 'Successfully reset all datasets to the calibrated benchmark demo scenario.',
      });
      await fetchStatus();
      await fetchPreview();
      if (onRefreshMetadata) onRefreshMetadata();
    } catch (err: any) {
      setUploadMessage({
        type: 'error',
        text: err?.message || 'Failed to reset demo data.',
      });
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with Dataset Tag & Reset Action */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-lg bg-teal-500/10 border border-teal-500/30 text-teal-400">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="text-sm font-semibold text-white">Data Management & CSV Validation Engine</h3>
              <Badge variant="teal" size="sm">
                Active: {dataStatus?.current_dataset || 'Calibrated Benchmark'}
              </Badge>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Strict schema validation, foreign key integrity checks, and preview filtering.
            </p>
          </div>
        </div>

        <button
          onClick={handleResetDemo}
          disabled={resetting}
          className="inline-flex items-center space-x-2 px-3.5 py-1.5 text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 active:bg-slate-900 border border-slate-600 rounded-lg transition-colors shadow-sm disabled:opacity-50"
        >
          <RotateCcw className={`w-3.5 h-3.5 text-teal-400 ${resetting ? 'animate-spin' : ''}`} />
          <span>{resetting ? 'Resetting...' : 'Reset to Calibrated Benchmark'}</span>
        </button>
      </div>

      {/* Dataset Statistics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Sales Records"
          value={dataStatus?.sales_records?.toLocaleString() ?? '5,460'}
          subtext={`Date Range: ${dataStatus?.min_sales_date || '90 days'} to ${dataStatus?.max_sales_date || 'Today'}`}
          icon={Layers}
          badge="sales_history.csv"
        />
        <StatCard
          label="Inventory SKUs"
          value={dataStatus?.inventory_records ?? '60'}
          subtext="Store-Product snapshot combinations"
          icon={Database}
          badge="inventory_current.csv"
        />
        <StatCard
          label="Market Signals"
          value={dataStatus?.signals_records ?? '525'}
          subtext="Weather, holidays, and simulated spikes"
          icon={Calendar}
          badge="external_signals.csv"
        />
        <StatCard
          label="Referential Integrity"
          value={`${dataStatus?.stores_count ?? 5} Stores · ${dataStatus?.products_count ?? 12} SKUs`}
          subtext="Foreign keys verified in catalog"
          icon={ShieldCheck}
          badge="Integrity Guard"
        />
      </div>

      {/* Section 1: CSV Upload & Validation */}
      <Card
        title="Upload & Validate Custom CSV Dataset"
        subtitle="Ingest historical sales, current inventory snapshot, or external signals"
        headerAction={
          <div className="flex items-center space-x-2">
            <span className="text-xs text-slate-400">Target Schema:</span>
            <select
              value={uploadType}
              onChange={(e) => setUploadType(e.target.value as any)}
              className="bg-slate-950 border border-slate-700 rounded-md px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-teal-500"
            >
              <option value="sales">Historical Sales (sales_history.csv)</option>
              <option value="inventory">Current Inventory (inventory_current.csv)</option>
              <option value="signals">External Signals (external_signals.csv)</option>
            </select>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Upload Dropzone Container */}
          <div className="p-6 border-2 border-dashed border-slate-700 hover:border-teal-500/50 rounded-xl bg-slate-950/40 text-center transition-colors">
            <UploadCloud className="w-10 h-10 text-teal-400/80 mx-auto mb-2" />
            <h4 className="text-xs font-semibold text-slate-200">
              Select or Drag & Drop a CSV file for {uploadType.toUpperCase()}
            </h4>
            <p className="text-[11px] text-slate-400 mt-1 max-w-md mx-auto">
              The engine checks for missing columns, unparseable dates, negative values, duplicate keys,
              nulls, and foreign key existence before applying changes.
            </p>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
              <input
                type="file"
                id="csvFileInput"
                accept=".csv"
                onChange={handleFileChange}
                className="hidden"
              />
              <label
                htmlFor="csvFileInput"
                className="px-3.5 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-lg cursor-pointer transition-colors"
              >
                {selectedFile ? `Selected: ${selectedFile.name}` : 'Browse CSV File'}
              </label>

              <button
                onClick={handleUpload}
                disabled={!selectedFile || uploading}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-500 disabled:bg-slate-800 disabled:text-slate-500 rounded-lg transition-colors shadow-sm"
              >
                {uploading ? 'Validating...' : 'Upload & Validate'}
              </button>
            </div>
          </div>

          {/* Upload Status Banner */}
          {uploadMessage && (
            <div
              className={`p-3.5 rounded-lg border flex items-center space-x-2.5 text-xs ${
                uploadMessage.type === 'success'
                  ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-950/30 border-rose-500/30 text-rose-300'
              }`}
            >
              {uploadMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              )}
              <span>{uploadMessage.text}</span>
            </div>
          )}

          {/* Detailed Validation Error Report */}
          {validationReport && !validationReport.is_valid && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-950/20 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 text-rose-300 font-semibold text-xs">
                  <X className="w-4 h-4 text-rose-400" />
                  <span>Validation Issues Detected ({validationReport.error_count} errors)</span>
                </div>
                <Badge variant="critical" size="sm">
                  Upload Rejected (Integrity Protected)
                </Badge>
              </div>

              <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
                {validationReport.errors.map((err, i) => (
                  <div
                    key={i}
                    className="p-2 rounded bg-slate-900/80 border border-rose-500/20 text-[11px] text-slate-300 flex items-start space-x-2"
                  >
                    <span className="font-mono text-rose-400 font-semibold shrink-0">
                      [{err.category}]
                    </span>
                    <span className="text-slate-300 leading-tight">{err.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Section 2: Schema Reference Guide */}
      <Card
        title="Accepted CSV Schemas & Integrity Constraints"
        subtitle="Standardized columns expected by the StockSense AI pipeline"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          {/* Sales Schema */}
          <div className="p-3.5 rounded-lg bg-slate-950/60 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between pb-1 border-b border-slate-800">
              <span className="font-semibold text-teal-400">sales_history.csv</span>
              <Badge variant="neutral" size="sm">Required</Badge>
            </div>
            <ul className="space-y-1 text-[11px] text-slate-300 font-mono">
              <li>• date <span className="text-slate-400">(YYYY-MM-DD)</span></li>
              <li>• store_id <span className="text-slate-400">(Foreign Key)</span></li>
              <li>• product_id <span className="text-slate-400">(Foreign Key)</span></li>
              <li>• units_sold <span className="text-slate-400">(Integer &ge; 0)</span></li>
              <li>• unit_price <span className="text-slate-400">(Float &gt; 0)</span></li>
              <li>• promotion_active <span className="text-slate-400">(Bool)</span></li>
            </ul>
          </div>

          {/* Inventory Schema */}
          <div className="p-3.5 rounded-lg bg-slate-950/60 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between pb-1 border-b border-slate-800">
              <span className="font-semibold text-teal-400">inventory_current.csv</span>
              <Badge variant="neutral" size="sm">Required</Badge>
            </div>
            <ul className="space-y-1 text-[11px] text-slate-300 font-mono">
              <li>• store_id <span className="text-slate-400">(Foreign Key)</span></li>
              <li>• product_id <span className="text-slate-400">(Foreign Key)</span></li>
              <li>• stock_on_hand <span className="text-slate-400">(Integer &ge; 0)</span></li>
              <li>• incoming_quantity <span className="text-slate-400">(Integer &ge; 0)</span></li>
              <li>• supplier_lead_time_days <span className="text-slate-400">(Int &ge; 0)</span></li>
              <li>• unit_cost <span className="text-slate-400">(Float &gt; 0)</span></li>
            </ul>
          </div>

          {/* Signals Schema */}
          <div className="p-3.5 rounded-lg bg-slate-950/60 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between pb-1 border-b border-slate-800">
              <span className="font-semibold text-teal-400">external_signals.csv</span>
              <Badge variant="neutral" size="sm">Required</Badge>
            </div>
            <ul className="space-y-1 text-[11px] text-slate-300 font-mono">
              <li>• date <span className="text-slate-400">(YYYY-MM-DD)</span></li>
              <li>• store_id <span className="text-slate-400">(Foreign Key)</span></li>
              <li>• holiday_flag <span className="text-slate-400">(Bool 0/1)</span></li>
              <li>• event_flag <span className="text-slate-400">(Bool 0/1)</span></li>
              <li>• temperature <span className="text-slate-400">(Float °C)</span></li>
              <li>• rainfall <span className="text-slate-400">(Float mm &ge; 0)</span></li>
            </ul>
          </div>
        </div>
      </Card>

      {/* Section 3: Live Filtered Dataset Preview */}
      <Card
        title="Live Dataset Explorer & Preview"
        subtitle="Filter and inspect in-memory tables populated from verified CSVs"
        headerAction={
          <div className="flex flex-wrap items-center gap-2">
            {/* Table Type Selector */}
            <select
              value={previewType}
              onChange={(e) => setPreviewType(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-md px-2.5 py-1 text-xs text-slate-200 focus:outline-none"
            >
              <option value="sales">sales_history ({dataStatus?.sales_records ?? 0} rows)</option>
              <option value="inventory">inventory_current ({dataStatus?.inventory_records ?? 0} rows)</option>
              <option value="signals">external_signals ({dataStatus?.signals_records ?? 0} rows)</option>
              <option value="stores">stores ({dataStatus?.stores_count ?? 0} stores)</option>
              <option value="products">products ({dataStatus?.products_count ?? 0} products)</option>
            </select>
          </div>
        }
      >
        <div className="space-y-4">
          {/* In-table Filter Controls */}
          <div className="flex flex-wrap items-center gap-3 p-3 rounded-lg bg-slate-950/60 border border-slate-800 text-xs">
            <div className="flex items-center space-x-1.5 text-slate-400">
              <Filter className="w-3.5 h-3.5 text-teal-400" />
              <span>Filters:</span>
            </div>

            {/* Store filter */}
            <select
              value={filterStore}
              onChange={(e) => setFilterStore(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 focus:outline-none"
            >
              <option value="ALL">All Stores</option>
              {meta?.stores.map((s) => (
                <option key={s.store_id} value={s.store_id}>
                  {s.name} ({s.store_id})
                </option>
              ))}
            </select>

            {/* Category filter */}
            {['sales', 'inventory', 'products'].includes(previewType) && (
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 focus:outline-none"
              >
                <option value="ALL">All Categories</option>
                {meta?.categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            )}

            {/* Date range filter */}
            {['sales', 'signals'].includes(previewType) && (
              <>
                <div className="flex items-center space-x-1">
                  <span className="text-slate-400 text-[11px]">From:</span>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-slate-200 text-[11px] focus:outline-none"
                  />
                </div>
                <div className="flex items-center space-x-1">
                  <span className="text-slate-400 text-[11px]">To:</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-slate-200 text-[11px] focus:outline-none"
                  />
                </div>
                {(startDate || endDate || filterStore !== 'ALL' || filterCategory !== 'ALL') && (
                  <button
                    onClick={() => {
                      setFilterStore('ALL');
                      setFilterCategory('ALL');
                      setStartDate('');
                      setEndDate('');
                    }}
                    className="text-[11px] text-teal-400 hover:text-teal-300 underline ml-auto"
                  >
                    Clear Filters
                  </button>
                )}
              </>
            )}
          </div>

          {/* Table Container */}
          {previewLoading ? (
            <div className="py-8">
              <LoadingState message="Filtering dataset rows..." subtext="Querying in-memory data tables" />
            </div>
          ) : !previewData || previewData.rows.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400 border border-dashed border-slate-800 rounded-lg">
              No matching records found for the applied filter criteria.
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                <span>
                  Showing {previewData.rows.length} of {previewData.total_count} matching records
                </span>
                <span className="text-[11px] text-slate-400">Display capped at 50 rows for performance</span>
              </div>
              <div className="overflow-x-auto rounded-lg border border-slate-800 max-h-96">
                <table className="data-table-compact">
                  <thead>
                    <tr>
                      {previewData.columns.map((col) => (
                        <th key={col}>{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.rows.map((row, i) => (
                      <tr key={i}>
                        {previewData.columns.map((col) => {
                          const val = row[col];
                          const isSpikeTag = col === 'simulated_spike_tag' || col === 'spike_label';
                          const hasSpike = isSpikeTag && val && val !== 'None' && val !== 'Baseline';

                          return (
                            <td key={col} className="font-mono text-xs">
                              {hasSpike ? (
                                <Badge variant="warning" size="sm">
                                  {String(val)}
                                </Badge>
                              ) : typeof val === 'boolean' ? (
                                <span className={val ? 'text-teal-400 font-semibold' : 'text-slate-400'}>
                                  {String(val)}
                                </span>
                              ) : (
                                String(val ?? '—')
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};
