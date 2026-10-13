import re
from datetime import datetime
from typing import Dict, Any, List, Set, Optional, Tuple
import pandas as pd
import numpy as np

# Column aliases for flexible user CSV uploads
COLUMN_ALIASES = {
    "location_id": "store_id",
    "store": "store_id",
    "product": "product_id",
    "sku": "product_id",
    "sales": "units_sold",
    "quantity": "units_sold",
    "current_stock": "stock_on_hand",
    "stock": "stock_on_hand",
    "incoming_orders": "incoming_quantity",
    "lead_time": "supplier_lead_time_days",
    "lead_time_days": "supplier_lead_time_days",
    "price": "unit_price",
    "cost": "unit_cost",
    "promo": "promotion_active",
    "is_holiday": "holiday_flag",
    "holiday": "holiday_flag",
    "event": "event_flag",
    "temp": "temperature",
    "rain": "rainfall",
    "precipitation_mm": "rainfall",
}

REQUIRED_SCHEMAS = {
    "sales": ["date", "store_id", "product_id", "units_sold", "unit_price", "promotion_active"],
    "inventory": ["store_id", "product_id", "stock_on_hand", "incoming_quantity", "supplier_lead_time_days", "unit_cost"],
    "signals": ["date", "store_id", "holiday_flag", "event_flag"],
}

PRIMARY_KEYS = {
    "sales": ["date", "store_id", "product_id"],
    "inventory": ["store_id", "product_id"],
    "signals": ["date", "store_id"],
}

def normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Standardizes column names using lowercase, stripped whitespaces, and standard aliases."""
    normalized_cols = {}
    for col in df.columns:
        clean_col = str(col).strip().lower().replace(" ", "_").replace("-", "_")
        canonical_name = COLUMN_ALIASES.get(clean_col, clean_col)
        normalized_cols[col] = canonical_name
    return df.rename(columns=normalized_cols)

class DataValidator:
    @staticmethod
    def validate_csv(
        df: pd.DataFrame,
        dataset_type: str,
        valid_store_ids: Optional[Set[str]] = None,
        valid_product_ids: Optional[Set[str]] = None,
        max_errors_to_report: int = 50
    ) -> Dict[str, Any]:
        """
        Validates an uploaded DataFrame according to StockSense AI integrity rules:
        - Missing required columns
        - Invalid date formats
        - Negative quantities
        - Negative or zero unit prices / costs
        - Duplicates across primary keys
        - Missing / null / empty values
        - Incompatible types
        - Unknown store_id or product_id referential integrity
        """
        dataset_type = dataset_type.lower().strip()
        if dataset_type not in REQUIRED_SCHEMAS:
            return {
                "is_valid": False,
                "total_rows": len(df),
                "error_count": 1,
                "summary": f"Unsupported dataset type '{dataset_type}'. Supported: sales, inventory, signals.",
                "errors": [{"category": "SCHEMA_ERROR", "row": 0, "column": "dataset_type", "message": f"Unknown dataset type '{dataset_type}'"}],
                "warnings": []
            }

        df_norm = normalize_columns(df.copy())
        required_cols = REQUIRED_SCHEMAS[dataset_type]
        missing_cols = [col for col in required_cols if col not in df_norm.columns]

        errors: List[Dict[str, Any]] = []
        warnings: List[Dict[str, Any]] = []

        # 1. Missing Required Columns Check
        if missing_cols:
            return {
                "is_valid": False,
                "total_rows": len(df_norm),
                "error_count": len(missing_cols),
                "summary": f"Missing required column(s): {', '.join(missing_cols)}.",
                "errors": [
                    {
                        "category": "MISSING_COLUMN",
                        "row": 0,
                        "column": col,
                        "message": f"Required column '{col}' is missing from the uploaded file."
                    }
                    for col in missing_cols
                ],
                "warnings": []
            }

        if len(df_norm) == 0:
            return {
                "is_valid": False,
                "total_rows": 0,
                "error_count": 1,
                "summary": "Uploaded CSV file contains 0 data rows.",
                "errors": [{"category": "EMPTY_FILE", "row": 0, "column": "all", "message": "CSV file contains headers but no data rows."}],
                "warnings": []
            }

        # 2. Duplicate Composite Key Check
        pk_cols = PRIMARY_KEYS.get(dataset_type, [])
        if all(c in df_norm.columns for c in pk_cols):
            duplicates = df_norm[df_norm.duplicated(subset=pk_cols, keep=False)]
            if not duplicates.empty:
                dup_indices = duplicates.index.tolist()
                for idx in dup_indices[:10]:
                    key_vals = ", ".join(f"{col}={df_norm.at[idx, col]}" for col in pk_cols)
                    errors.append({
                        "category": "DUPLICATE_KEY",
                        "row": int(idx) + 2, # 1-based line number (+1 for header)
                        "column": "/".join(pk_cols),
                        "message": f"Row {idx + 2}: Duplicate entry for primary key ({key_vals})."
                    })

        # 3. Row-by-Row Checks (Values, Nulls, Negative, Foreign Keys, Types)
        for idx, row in df_norm.iterrows():
            row_num = int(idx) + 2 # CSV 1-indexed row number with header

            # Check nulls in required columns
            for col in required_cols:
                val = row[col]
                if pd.isna(val) or val is None or (isinstance(val, str) and val.strip() == ""):
                    errors.append({
                        "category": "NULL_VALUE",
                        "row": row_num,
                        "column": col,
                        "message": f"Row {row_num}: Column '{col}' cannot be null or empty."
                    })

            # Date format validation
            if "date" in df_norm.columns:
                date_val = str(row["date"]).strip()
                if not re.match(r"^\d{4}-\d{2}-\d{2}$", date_val):
                    errors.append({
                        "category": "INVALID_DATE",
                        "row": row_num,
                        "column": "date",
                        "message": f"Row {row_num}: Invalid date format '{date_val}'. Expected YYYY-MM-DD."
                    })
                else:
                    try:
                        datetime.strptime(date_val, "%Y-%m-%d")
                    except ValueError:
                        errors.append({
                            "category": "INVALID_DATE",
                            "row": row_num,
                            "column": "date",
                            "message": f"Row {row_num}: Date '{date_val}' is not a valid calendar date."
                        })

            # Store ID referential check
            if "store_id" in df_norm.columns and valid_store_ids:
                store_id_val = str(row["store_id"]).strip()
                if store_id_val not in valid_store_ids:
                    errors.append({
                        "category": "UNKNOWN_STORE_ID",
                        "row": row_num,
                        "column": "store_id",
                        "message": f"Row {row_num}: Store ID '{store_id_val}' is not in registered store network ({', '.join(sorted(valid_store_ids))})."
                    })

            # Product ID referential check
            if "product_id" in df_norm.columns and valid_product_ids:
                prod_id_val = str(row["product_id"]).strip()
                if prod_id_val not in valid_product_ids:
                    errors.append({
                        "category": "UNKNOWN_PRODUCT_ID",
                        "row": row_num,
                        "column": "product_id",
                        "message": f"Row {row_num}: Product ID '{prod_id_val}' is not in registered product catalog."
                    })

            # Numeric & quantity checks
            if dataset_type == "sales":
                # units_sold: integer >= 0
                try:
                    units = float(row["units_sold"])
                    if units < 0:
                        errors.append({
                            "category": "NEGATIVE_VALUE",
                            "row": row_num,
                            "column": "units_sold",
                            "message": f"Row {row_num}: units_sold cannot be negative ({units})."
                        })
                except (ValueError, TypeError):
                    errors.append({
                        "category": "TYPE_MISMATCH",
                        "row": row_num,
                        "column": "units_sold",
                        "message": f"Row {row_num}: units_sold must be a numeric integer, got '{row['units_sold']}'."
                    })

                # unit_price: float > 0
                try:
                    price = float(row["unit_price"])
                    if price <= 0:
                        errors.append({
                            "category": "INVALID_PRICE",
                            "row": row_num,
                            "column": "unit_price",
                            "message": f"Row {row_num}: unit_price must be positive, got {price}."
                        })
                except (ValueError, TypeError):
                    errors.append({
                        "category": "TYPE_MISMATCH",
                        "row": row_num,
                        "column": "unit_price",
                        "message": f"Row {row_num}: unit_price must be a positive number, got '{row['unit_price']}'."
                    })

            elif dataset_type == "inventory":
                # stock_on_hand: int >= 0
                try:
                    stock = float(row["stock_on_hand"])
                    if stock < 0:
                        errors.append({
                            "category": "NEGATIVE_VALUE",
                            "row": row_num,
                            "column": "stock_on_hand",
                            "message": f"Row {row_num}: stock_on_hand cannot be negative ({stock})."
                        })
                except (ValueError, TypeError):
                    errors.append({
                        "category": "TYPE_MISMATCH",
                        "row": row_num,
                        "column": "stock_on_hand",
                        "message": f"Row {row_num}: stock_on_hand must be numeric, got '{row['stock_on_hand']}'."
                    })

                # incoming_quantity: int >= 0
                try:
                    incoming = float(row["incoming_quantity"])
                    if incoming < 0:
                        errors.append({
                            "category": "NEGATIVE_VALUE",
                            "row": row_num,
                            "column": "incoming_quantity",
                            "message": f"Row {row_num}: incoming_quantity cannot be negative ({incoming})."
                        })
                except (ValueError, TypeError):
                    errors.append({
                        "category": "TYPE_MISMATCH",
                        "row": row_num,
                        "column": "incoming_quantity",
                        "message": f"Row {row_num}: incoming_quantity must be numeric, got '{row['incoming_quantity']}'."
                    })

                # supplier_lead_time_days: int >= 0
                try:
                    lead = float(row["supplier_lead_time_days"])
                    if lead < 0:
                        errors.append({
                            "category": "NEGATIVE_VALUE",
                            "row": row_num,
                            "column": "supplier_lead_time_days",
                            "message": f"Row {row_num}: supplier_lead_time_days cannot be negative ({lead})."
                        })
                except (ValueError, TypeError):
                    errors.append({
                        "category": "TYPE_MISMATCH",
                        "row": row_num,
                        "column": "supplier_lead_time_days",
                        "message": f"Row {row_num}: supplier_lead_time_days must be an integer, got '{row['supplier_lead_time_days']}'."
                    })

                # unit_cost: float > 0
                try:
                    cost = float(row["unit_cost"])
                    if cost <= 0:
                        errors.append({
                            "category": "INVALID_PRICE",
                            "row": row_num,
                            "column": "unit_cost",
                            "message": f"Row {row_num}: unit_cost must be positive, got {cost}."
                        })
                except (ValueError, TypeError):
                    errors.append({
                        "category": "TYPE_MISMATCH",
                        "row": row_num,
                        "column": "unit_cost",
                        "message": f"Row {row_num}: unit_cost must be a positive number, got '{row['unit_cost']}'."
                    })

            elif dataset_type == "signals":
                # rainfall >= 0
                if "rainfall" in df_norm.columns and not pd.isna(row.get("rainfall")):
                    try:
                        rain = float(row["rainfall"])
                        if rain < 0:
                            errors.append({
                                "category": "NEGATIVE_VALUE",
                                "row": row_num,
                                "column": "rainfall",
                                "message": f"Row {row_num}: rainfall cannot be negative ({rain} mm)."
                            })
                    except (ValueError, TypeError):
                        errors.append({
                            "category": "TYPE_MISMATCH",
                            "row": row_num,
                            "column": "rainfall",
                            "message": f"Row {row_num}: rainfall must be a numeric value, got '{row.get('rainfall')}'."
                        })

            if len(errors) >= max_errors_to_report:
                warnings.append({
                    "category": "ERROR_LIMIT",
                    "message": f"Reached maximum error limit ({max_errors_to_report}). Remaining errors truncated."
                })
                break

        is_valid = len(errors) == 0
        summary = (
            f"Validation successful: {len(df_norm)} valid records verified."
            if is_valid
            else f"Validation failed: Found {len(errors)} error(s) across {len(df_norm)} records."
        )

        return {
            "is_valid": is_valid,
            "total_rows": len(df_norm),
            "error_count": len(errors),
            "summary": summary,
            "errors": errors,
            "warnings": warnings,
            "cleaned_dataframe": df_norm if is_valid else None
        }
