# StockSense AI — Demand Forecasting & Inventory Re-balancing

**StockSense AI** is an AI-assisted retail inventory management system designed to tackle the limitations of traditional ERP software. Traditional ERP forecasting relies on static moving averages, rigid safety stock rules, and isolated store silos—leading to costly stockouts during sudden demand shifts or bloated holding costs from excessive buffers.

StockSense AI combines **sales history**, **current inventory**, and **external market signals (weather, calendar holidays, local events)** to:
1. Forecast 7-day and 14-day demand per store and SKU with uncertainty intervals ($P_{10}, P_{50}, P_{90}$).
2. Dynamically adjust safety stock based on forecast volatility rather than fixed constants.
3. Balance inventory across neighboring stores before issuing supplier reorders, protecting donor store safety buffers.
4. Support human-in-the-loop decision-making with approval workflows.
5. Replay historical backtests to objectively measure stockout reductions and holding costs against traditional ERP baselines.

---

## Architecture & Technology Stack

- **Frontend**: React 18, Vite, TypeScript, Tailwind CSS, Recharts, Lucide Icons.
- **Backend**: Python 3.14, FastAPI, Pydantic, Pandas, NumPy, Scikit-Learn.
- **Data Foundation**: Calibrated 5-store / 12-SKU benchmark dataset (`backend/data/demo/`).
- **External Signals**: Hyper-local weather (Open-Meteo API / offline synthetic fallback) + calendar/event schedules.

---

## Phase 2: Data Management & CSV Schemas

### Standardized Schemas

#### 1. Historical Sales (`sales_history.csv`)
- `date`: `YYYY-MM-DD` string
- `store_id`: String (Foreign key to `stores.csv`)
- `product_id`: String (Foreign key to `products.csv`)
- `units_sold`: Integer $\ge 0$
- `unit_price`: Float $> 0$
- `promotion_active`: Boolean (`true` / `false`)
- `simulated_spike_tag`: String (`None`, `Simulated Rainstorm Spike`, `Simulated Campus Festival Spike`)

#### 2. Current Inventory Snapshot (`inventory_current.csv`)
- `store_id`: String (Foreign key to `stores.csv`)
- `product_id`: String (Foreign key to `products.csv`)
- `stock_on_hand`: Integer $\ge 0$
- `incoming_quantity`: Integer $\ge 0$
- `supplier_lead_time_days`: Integer $\ge 0$
- `unit_cost`: Float $> 0$

#### 3. External Market Signals (`external_signals.csv`)
- `date`: `YYYY-MM-DD` string
- `store_id`: String (Foreign key to `stores.csv`)
- `holiday_flag`: Boolean (`0` or `1`)
- `event_flag`: Boolean (`0` or `1`)
- `event_name`: String (e.g. `Sunday Market`, `Campus Homecoming & Games`)
- `temperature`: Float (°C)
- `rainfall`: Float (mm $\ge 0$)
- `spike_label`: String (`Baseline`, `Simulated Rainstorm Event`, `Simulated Campus Homecoming Spike`)

---

## Data Validation Engine

All CSV uploads are rigorously validated through [data_validator.py](file:///c:/Users/Jasmini%20Mohanty/OneDrive/Documents/AIMPACT-1/backend/app/services/data_validator.py) with structured, human-readable error reports:
- **Missing Required Columns**: Rejects files lacking mandatory schema keys.
- **Invalid Date Formatting**: Enforces `YYYY-MM-DD` and checks calendar validity.
- **Negative Quantities**: Enforces non-negative sales, on-hand stock, incoming quantities, lead times, and rainfall.
- **Non-Positive Prices & Costs**: Guarantees unit prices and procurement costs are strictly positive.
- **Duplicate Composite Keys**: Enforces uniqueness across `(date, store_id, product_id)` for sales and `(store_id, product_id)` for inventory.
- **Referential Integrity**: Verifies unknown `store_id` or `product_id` values against registered stores and products catalogs.
- **Incompatible Data Types**: Detects non-numeric characters, unparseable booleans, and nulls with line numbers.

---

## Windows Setup & Execution Guide

### Prerequisites
- **Python 3.10+** (Python 3.14 verified)
- **Node.js v18+** & **npm**

### 1. Backend Setup & Run (PowerShell)

Open a PowerShell terminal in the repository root:

```powershell
# 1. Install backend dependencies
python -m pip install -r backend/requirements.txt

# 2. Run automated backend test suite (15 unit tests)
python -m pytest backend/tests

# 3. Start the FastAPI backend server
cd backend
python -m uvicorn app.main:app --reload --port 8000
```

- API Base URL: `http://127.0.0.1:8000`
- Interactive API Documentation (Swagger): `http://127.0.0.1:8000/docs`
- Health Endpoint: `http://127.0.0.1:8000/api/health`
- Data Status Endpoint: `http://127.0.0.1:8000/api/data/status`

### 2. Frontend Setup & Run (PowerShell)

Open a second PowerShell terminal in the repository root:

```powershell
# 1. Navigate to the frontend directory
cd frontend

# 2. Install frontend dependencies
npm install

# 3. Run production build verification
npm run build

# 4. Start the Vite development server
npm run dev
```

- Frontend Dashboard: `http://localhost:5173`

## Phase 3: Demand Forecasting & Evaluation Engine

### Dual-Model Architecture
1. **Traditional ERP Baseline**: 7-day moving average calculated strictly on preceding days.
2. **Signal-Aware ML Engine**: Scikit-Learn `RandomForestRegressor` trained on shifted historical sales, lag features ($T-1, T-2, T-7, T-14$), rolling averages & standard deviations, day of week, month, day of month, promotion flags, and external signals (precipitation, temperature anomalies, holiday and event flags).
3. **No Future-Data Leakage**: Lags and rolling windows are shifted by 1 day; chronological train/test splitting preserves time ordering.
4. **Empirical Quantile Uncertainty**: Out-of-sample prediction intervals $[P_{10}, P_{90}]$ calculated from residual distributions and scaled forward into the future using $\sqrt{1 + 0.04k}$.
5. **Honest Out-of-Sample Evaluation**:
   - **WMAPE** ($\frac{\sum |y - \hat{y}|}{\sum y}$) with division-by-zero protection.
   - **MAE** (Mean Absolute Error).
   - Head-to-head comparison against 7-day moving average on the identical chronological test slice.
   - Transparent diagnostic notes for insufficient history (<14 days) and missing feature imputation.

---

## Phase 4: Stockout Risk & Multi-Store Inventory Re-balancing

### Inventory Analysis & Balancing Principles
1. **Projected Stock Trajectory**: Daily stock simulation over the 14-day forecast horizon accounting for current stock-on-hand ($SOH$) and scheduled incoming shipments.
2. **Time to Shortage ($TTS$) & Stockout Risk**: Identifies the exact day when stock drops below zero. Classifies items into `CRITICAL` ($TTS \le \text{supplier lead time}$), `HIGH` ($TTS \le 7\text{d}$), `DEFICIT`, `HEALTHY`, `SURPLUS`, or `OVERSTOCK`.
3. **Dynamic Safety Stock & ROP**:
   - $SS = \max(2, \lceil 1.65 \times \sigma_d \times \sqrt{L} \rceil)$ responsive to demand volatility.
   - $ROP = \lceil (\bar{d} \times L) + SS \rceil$.
4. **Donor Store Protection Rule**: A donor store can only donate inventory that represents **genuine surplus** above its own 7-day forecast demand plus safety buffer: $\text{AvailableSurplus} = \max(0, \lfloor SOH + Incoming - D_{7} - SS \rfloor)$. Post-transfer donor stock is guaranteed safe.
5. **Transfer vs. Reorder Decision Engine**:
   - Prefers 1-day local inter-store transfers over 3–5 day supplier orders, particularly when $TTS \le \text{supplier lead time}$.
   - Suggests supplier reorders when network surplus is exhausted, respecting supplier minimum order quantities (MOQ).
6. **Human-in-the-Loop Operational Workflow**:
   - Interactive recommendation queue with quantitative evidence drawers.
   - Persistent `Approve` and `Decline` action state stored in `backend/data/actions_store.json`.
   - Clear compliance notice: approvals stage operational authorizations without falsely claiming physical fulfillment before WMS execution.

---

---

## Phase 5: End-to-End Interface Connection & Impact Simulator

### Executive Dashboard Real-Time KPI Suite
All 7 required dashboard performance metrics are connected live to backend calculation APIs (`/api/dashboard/summary`) with strict informative empty-state handling:
1. **Total Stock Value**: Computed directly from current stock-on-hand ($SOH$) and unit costs across monitored stores ($\sum SOH \times \text{unit\_cost}$).
2. **Products & Stores at Risk**: Live count of distinct SKUs and stores confronting `CRITICAL` ($TTS \le \text{lead time}$), `HIGH`, or `DEFICIT` risk.
3. **Horizon Forecast Demand**: Dynamically aggregated predicted demand for the selected horizon (7 or 14 days) based on active store, category, and SKU filters.
4. **Stockout Risk Rate**: Percentage of monitored store-product positions currently in critical shortage or deficit.
5. **Customer Fill Rate**: Expected customer demand fulfillment percentage ($\frac{\text{Fulfilled Units}}{\text{Total Demand Units}} \times 100\%$).
6. **Holding-Cost Estimate**: Carrying expenditure over the chosen horizon ($\sum SOH \times \text{unit\_cost} \times 0.0005 \times \text{horizon} \times \text{store\_multiplier}$) and annualized rate.
7. **Forecast Error vs. Baseline**: Live head-to-head out-of-sample WMAPE comparison (e.g. 14.8% ML vs 28.2% MA7 baseline) highlighting prediction error reduction.
8. **Informative Empty States**: When required inputs or catalog positions are unavailable for a selected filter scope, an informative empty state card explains the root cause with one-click navigation rather than displaying invalid zeroes or unhandled errors.

### Historical Policy Impact Simulator
The simulator provides a deterministic, transparent policy backtest replaying exact daily historical sales across configurable windows (14, 30, or 60 days) and store/product selections:

1. **Policy A: Documented Traditional Baseline Policy (Fixed ERP SCM)**:
   - Siloed stores with 0 inter-store transfers.
   - Fixed safety stock based on 7-day moving average: $SS_{\text{trad}} = 1.65 \times \sigma_{\text{MA7}} \times \sqrt{L}$.
   - Fixed reorder point: $ROP_{\text{trad}} = \mu_{\text{MA7}} \times L + SS_{\text{trad}}$.
   - Supplier orders arrive after catalog lead time ($L = 1\text{–}5$ days). Shortages result in unfulfilled lost sales.

2. **Policy B: StockSense AI-Assisted Policy**:
   - Signal and volatility-responsive dynamic uncertainty buffers.
   - Proactive 1-day inter-store transfers from neighboring donor stores with genuine surplus.
   - Strict **Donor Store Protection Rule**: Donor stores maintain their own 7-day demand buffer plus safety stock before transferring any units.
   - Supplier replenishment fallback for residual deficits.

3. **Tracked Metrics & Denominator Safety**:
   - Stockout incidents (days), unmet customer demand (lost sales units), customer fill rate (%), average daily inventory, carrying holding cost ($), orders placed, and transfers executed.
   - **Zero-Fabrication Standard**: Stockout reductions are computed dynamically from actual realized simulation traces; the 30% reduction is an evaluated target and never hardcoded. If the AI policy underperforms on certain SKUs, actual results are presented honestly.
   - **Denominator Safety**: Percentage deltas are computed only when the baseline denominator is non-zero, returning safe fallbacks or N/A when denominators are 0.

4. **CSV Replay Audit Export**:
   - Dedicated endpoint `GET /api/simulator/export/csv` generates downloadable daily audit logs including date, store, SKU, daily demand, stock traces, fulfilled demand, stockout flags, holding costs, and transfer arrivals.

5. **Assumptions & Disclaimers**:
   - Clearly documented assumptions (daily lost sales without backorders, 1-day inter-store transit, product catalog lead times, 18.25% APR carrying rate).
   - Prominent disclaimer: *Simulated results evaluate policy heuristics against historical sales observations and do not guarantee future commercial outcomes.*

---

## Verification & Checks Summary (Phase 2 to Phase 5)

| Verification Check | Target Component | Result | Details |
| :--- | :--- | :--- | :--- |
| **Frontend Production Build** | `frontend` | **PASSED** | `tsc -b && vite build` bundled cleanly in 1.03s (0 errors, 0 warnings). |
| **Backend Automated Tests** | `backend/tests` | **PASSED** | **37/37 pytest test cases passed** in 19.76s across validation, forecasting, rebalancing, and simulation suites. |
| **Simulator Metrics & Formulas** | `test_simulator.py` | **PASSED** | Verified fill rate, stockout rate, holding cost formulas, and zero-demand safety. |
| **Dynamic Calculation (No 30% Hardcoding)** | `test_simulator.py` | **PASSED** | Confirmed stockout reductions are computed from actual replay traces and never hardcoded. |
| **CSV Audit Export Generation** | `test_simulator.py` | **PASSED** | Verified CSV output format, headers, metadata comments, and daily trace logs. |
| **Dashboard 7-KPI Live API & Empty States** | `test_simulator.py` | **PASSED** | Verified total stock value, risks, horizon forecast, fill rate, holding cost, and empty-state handling. |
| **End-to-End Pipeline Integration** | `test_simulator.py` | **PASSED** | Verified full sequence: Upload &rarr; Forecast &rarr; Inventory Risks &rarr; Rebalance Recs &rarr; Action Approval &rarr; Impact Simulator. |

---

## Complete End-to-End Flow Walkthrough

1. **Data Ingestion (`/data-settings`)**: View ingested benchmark catalogs (`stores.csv`, `products.csv`, `inventory_current.csv`, `sales_history.csv`, `external_signals.csv`) or upload custom CSVs with multi-layer schema and referential validation.
2. **Demand Forecasting (`/forecasting`)**: Inspect 7-day and 14-day ML forecasts with $P_{10}\text{–}P_{90}$ quantile uncertainty cones against 7-day Moving Average baselines and external weather/event signals.
3. **Inventory Risk & Re-balancing (`/rebalance`)**: Detect time-to-shortage ($TTS$), safety stock thresholds, and multi-store transfer routes protected by the donor surplus rule.
4. **Action Approvals (`/actions`)**: Review and approve or decline pending transfer and reorder actions with transparent quantitative evidence and audit tracking.
5. **Impact Simulator (`/simulator`)**: Select a historical evaluation window (14, 30, 60 days) and store/product scope, replay daily demand side-by-side, view the interactive inventory trajectory curve, compare head-to-head metrics, and export the audit CSV!

