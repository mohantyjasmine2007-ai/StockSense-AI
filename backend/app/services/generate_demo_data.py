import os
import random
import csv
from datetime import date, timedelta
from pathlib import Path

random.seed(42)

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "demo"
DATA_DIR.mkdir(parents=True, exist_ok=True)

STORES = [
    ("STORE_01", "Downtown Express", "Seattle", 47.6062, -122.3321, 5000, 1.25),
    ("STORE_02", "Suburban Supercenter", "Bellevue", 47.6101, -122.2015, 18000, 1.00),
    ("STORE_03", "Westside Metro", "Tacoma", 47.2529, -122.4443, 12000, 0.95),
    ("STORE_04", "University Hub", "Seattle", 47.6553, -122.3035, 8000, 1.10),
    ("STORE_05", "Northgate Center", "Shoreline", 47.7560, -122.3456, 10000, 1.05),
]

PRODUCTS = [
    ("PROD_01", "Organic Whole Milk 1 Gal", "Dairy & Fresh", 2.20, 4.50, 0.08, 2, 50, 25),
    ("PROD_02", "Artisan Sourdough Bread", "Bakery & Fresh", 1.40, 3.80, 0.06, 1, 40, 30),
    ("PROD_03", "Greek Yogurt Plain 32oz", "Dairy & Fresh", 2.50, 5.20, 0.07, 3, 30, 18),
    ("PROD_04", "Cold Brew Coffee 32oz", "Beverages", 2.80, 5.99, 0.05, 2, 40, 22),
    ("PROD_05", "Spiced Chai Concentrate 32oz", "Beverages", 2.10, 4.89, 0.04, 3, 30, 14),
    ("PROD_06", "Sparkling Mineral Water 12pk", "Beverages", 3.20, 6.99, 0.04, 4, 50, 20),
    ("PROD_07", "Hearty Lentil Soup 18oz", "Pantry & Soups", 1.30, 3.19, 0.02, 3, 60, 16),
    ("PROD_08", "Organic Tomato Basil Soup 24oz", "Pantry & Soups", 1.80, 4.29, 0.03, 3, 50, 15),
    ("PROD_09", "Avocado Hass 4-Pack", "Produce & Fresh", 1.90, 3.99, 0.09, 2, 40, 24),
    ("PROD_10", "Compact Storm Umbrella", "Seasonal & Essentials", 4.50, 14.99, 0.03, 5, 25, 4),
    ("PROD_11", "Hot Cocoa Mix Deluxe", "Seasonal & Essentials", 2.30, 5.49, 0.02, 4, 35, 10),
    ("PROD_12", "Energy Protein Bar Box", "Pantry & Snacks", 8.50, 16.99, 0.05, 3, 20, 12),
]

def generate_all_datasets():
    today = date.today()
    start_date = today - timedelta(days=90)
    forecast_end = today + timedelta(days=14)

    # 1. Stores CSV
    stores_file = DATA_DIR / "stores.csv"
    with open(stores_file, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["store_id", "name", "city", "latitude", "longitude", "max_capacity", "holding_cost_multiplier"])
        for s in STORES:
            writer.writerow(s)

    # 2. Products CSV
    products_file = DATA_DIR / "products.csv"
    with open(products_file, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["product_id", "name", "category", "unit_cost", "selling_price", "holding_cost_per_day", "lead_time_days", "min_order_qty"])
        for p in PRODUCTS:
            writer.writerow(p[:8])

    # 3. Inventory Current Snapshot CSV
    inventory_rows = []
    for store_id, _, _, _, _, _, _ in STORES:
        for p in PRODUCTS:
            pid = p[0]
            unit_cost = p[3]
            lead_time = p[6]
            base_demand = p[8]

            # Realistic stock distribution:
            if store_id == "STORE_01":
                # Downtown has tight stock, storm umbrellas low
                stock_on_hand = 4 if pid == "PROD_10" else random.randint(8, 35)
                incoming_qty = 60 if pid in ["PROD_01", "PROD_04"] else 0
            elif store_id == "STORE_02":
                # Suburban Supercenter has massive buffer & excess umbrellas/soups
                stock_on_hand = 95 if pid == "PROD_10" else random.randint(70, 140)
                incoming_qty = 80 if pid == "PROD_01" else 0
            elif store_id == "STORE_04":
                # University has high cold brew demand, moderate stock
                stock_on_hand = 8 if pid == "PROD_10" else random.randint(20, 65)
                incoming_qty = 50 if pid == "PROD_07" else 0
            else:
                stock_on_hand = random.randint(25, 75)
                incoming_qty = 40 if random.random() < 0.25 else 0

            inventory_rows.append([
                store_id,
                pid,
                stock_on_hand,
                incoming_qty,
                lead_time,
                unit_cost
            ])

    inv_file = DATA_DIR / "inventory_current.csv"
    with open(inv_file, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["store_id", "product_id", "stock_on_hand", "incoming_quantity", "supplier_lead_time_days", "unit_cost"])
        writer.writerows(inventory_rows)

    # 4. External Signals CSV
    signals_rows = []
    curr = start_date
    while curr <= forecast_end:
        is_weekend = curr.weekday() >= 5
        month = curr.month

        for store_id, _, city, _, _, _, _ in STORES:
            # Base temperatures
            temp = round(16.0 + 7.5 * random.random() - (3.5 if month in [11, 12, 1, 2] else 0.0), 1)

            # Defined Weather Shock Events
            is_rain_storm = (curr >= (today - timedelta(days=12)) and curr <= (today - timedelta(days=9))) and store_id in ["STORE_01", "STORE_04"]
            is_forecast_rain = (curr >= today and curr <= (today + timedelta(days=3))) and store_id in ["STORE_01", "STORE_04"]

            spike_label = "Baseline"
            holiday_flag = False
            event_flag = False
            event_name = "None"

            if is_rain_storm:
                rainfall = round(random.uniform(22.0, 38.0), 1)
                temp = round(temp - 5.0, 1)
                spike_label = "Simulated Rainstorm Event (Historical)"
                event_flag = True
                event_name = "Severe Rain Advisory"
            elif is_forecast_rain:
                rainfall = round(random.uniform(18.0, 30.0), 1)
                temp = round(temp - 4.0, 1)
                spike_label = "Simulated Rainstorm Warning (Forecast)"
                event_flag = True
                event_name = "Upcoming Storm System"
            elif random.random() < 0.18:
                rainfall = round(random.uniform(2.0, 7.5), 1)
            else:
                rainfall = 0.0

            # Holiday & Community Events
            if curr.weekday() == 6:
                event_flag = True
                event_name = "Sunday Market"
            
            # Campus Festival Event
            if store_id == "STORE_04" and curr >= (today - timedelta(days=5)) and curr <= (today - timedelta(days=2)):
                event_flag = True
                event_name = "Campus Homecoming & Games"
                spike_label = "Simulated Campus Homecoming Spike"

            # Holiday flag (Memorial Day / Labor Day approximation)
            if curr.month == 9 and curr.day in [1, 2, 3]:
                holiday_flag = True
                event_name = "Holiday Weekend"
                spike_label = "Simulated Holiday Demand Surge"

            signals_rows.append([
                curr.isoformat(),
                store_id,
                holiday_flag,
                event_flag,
                event_name,
                temp,
                rainfall,
                spike_label
            ])
        curr += timedelta(days=1)

    signals_file = DATA_DIR / "external_signals.csv"
    with open(signals_file, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["date", "store_id", "holiday_flag", "event_flag", "event_name", "temperature", "rainfall", "spike_label"])
        writer.writerows(signals_rows)

    # 5. Historical Sales CSV
    sales_rows = []
    curr = start_date
    while curr <= today:
        dow = curr.weekday()
        for store_id, _, _, _, _, _, _ in STORES:
            for p in PRODUCTS:
                pid = p[0]
                pname = p[1]
                unit_price = p[4]
                base_demand = p[8]

                multiplier = 1.0
                spike_tag = "None"

                # Store footprint multiplier
                if store_id == "STORE_02":
                    multiplier *= 1.75
                elif store_id == "STORE_01":
                    multiplier *= 1.15

                # Weekend seasonality (Fri, Sat, Sun)
                if dow in [4, 5, 6]:
                    multiplier *= 1.28

                # Weather shock spike
                is_rain_storm = (curr >= (today - timedelta(days=12)) and curr <= (today - timedelta(days=9))) and store_id in ["STORE_01", "STORE_04"]
                if is_rain_storm:
                    if pid == "PROD_10": # Umbrellas
                        multiplier *= 6.8
                        spike_tag = "Simulated Rainstorm Spike (Umbrellas)"
                    elif pid in ["PROD_07", "PROD_08", "PROD_11"]: # Soups & Cocoa
                        multiplier *= 2.1
                        spike_tag = "Simulated Rainstorm Spike (Hot Soups)"
                    elif pid == "PROD_04": # Cold Brew
                        multiplier *= 0.60

                # Campus homecoming spike
                is_campus_fest = (store_id == "STORE_04" and curr >= (today - timedelta(days=5)) and curr <= (today - timedelta(days=2)))
                if is_campus_fest:
                    if pid in ["PROD_04", "PROD_12"]: # Cold Brew & Protein Bars
                        multiplier *= 2.4
                        spike_tag = "Simulated Campus Festival Spike (Coffee & Snacks)"

                # Promotion flag
                promo_active = (random.random() < 0.12)
                if promo_active:
                    multiplier *= 1.30

                noise = random.gauss(0, base_demand * 0.12)
                units = max(0, int(round(base_demand * multiplier + noise)))

                sales_rows.append([
                    curr.isoformat(),
                    store_id,
                    pid,
                    units,
                    unit_price,
                    promo_active,
                    spike_tag
                ])
        curr += timedelta(days=1)

    sales_file = DATA_DIR / "sales_history.csv"
    with open(sales_file, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["date", "store_id", "product_id", "units_sold", "unit_price", "promotion_active", "simulated_spike_tag"])
        writer.writerows(sales_rows)

    print(f"Generated {len(stores_file.read_text().splitlines())-1} stores, {len(products_file.read_text().splitlines())-1} products, {len(inventory_rows)} inventory rows, {len(signals_rows)} signal rows, and {len(sales_rows)} sales rows.")

if __name__ == "__main__":
    generate_all_datasets()
