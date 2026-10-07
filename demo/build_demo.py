"""Builds the messy demo workspace and the expected answers for eval.

Run from repo root: python demo/build_demo.py
Planted traps: $/EUR mixed in one column, exact duplicate rows, ambiguous DD/MM vs MM/DD dates,
missing amounts, and customer regions that contradict between orders.csv and customers.xlsx.
"""

import csv
import json
from pathlib import Path

from openpyxl import Workbook

HERE = Path(__file__).parent
EUR_TO_USD = 1.10

# order_id, date, customer_id, region (as typed by sales rep), product, quantity, amount
ORDERS = [
    ("O-1001", "2024-01-05", "C01", "North", "Widget", 3, "$120.00"),
    ("O-1002", "2024-01-09", "C02", "South", "Gadget", 1, "€80.00"),
    ("O-1003", "2024-01-15", "C03", "East", "Widget", 2, "$80.00"),
    ("O-1004", "2024-01-22", "C04", "West", "Gizmo", 5, "$250.00"),
    ("O-1005", "2024-01-30", "C05", "North", "Gadget", 2, "€160.00"),
    ("O-1006", "2024-02-03", "C06", "South", "Widget", 4, "$160.00"),
    ("O-1007", "2024-02-11", "C01", "North", "Gizmo", 1, "$50.00"),
    ("O-1008", "2024-02-17", "C07", "East", "Widget", 6, ""),
    ("O-1009", "2024-02-24", "C02", "South", "Gizmo", 2, "€90.00"),
    ("O-1010", "2024-02-28", "C08", "West", "Gadget", 3, "$240.00"),
    ("O-1011", "02/03/2024", "C03", "East", "Gadget", 1, "$80.00"),
    ("O-1012", "2024-03-08", "C04", "West", "Widget", 2, "$80.00"),
    ("O-1013", "05/03/2024", "C09", "North", "Gizmo", 3, "€135.00"),
    ("O-1014", "2024-03-19", "C05", "North", "Widget", 5, "$200.00"),
    ("O-1015", "25/03/2024", "C06", "South", "Gadget", 2, "$160.00"),
    ("O-1016", "2024-03-29", "C10", "East", "Gizmo", 1, "N/A"),
    ("O-1017", "04/04/2024", "C07", "East", "Widget", 3, "$120.00"),
    ("O-1018", "2024-04-12", "C08", "West", "Gizmo", 4, "€180.00"),
    ("O-1019", "2024-04-18", "C01", "North", "Gadget", 2, "$160.00"),
    ("O-1020", "2024-04-25", "C09", "North", "Widget", 1, "$40.00"),
    ("O-1021", "2024-05-02", "C02", "South", "Widget", 2, "€70.00"),
    ("O-1022", "2024-05-10", "C03", "East", "Gizmo", 6, "$300.00"),
    ("O-1023", "2024-05-16", "C04", "West", "Gadget", 1, "$80.00"),
    ("O-1024", "2024-05-23", "C10", "East", "Widget", 4, ""),
    ("O-1025", "2024-05-30", "C05", "North", "Gizmo", 2, "€90.00"),
    ("O-1026", "2024-06-04", "C06", "South", "Widget", 3, "$120.00"),
    ("O-1027", "2024-06-13", "C07", "East", "Gadget", 2, "$160.00"),
    ("O-1028", "2024-06-21", "C08", "West", "Widget", 5, "€175.00"),
    ("O-1029", "2024-06-27", "C09", "North", "Gadget", 1, "$80.00"),
    ("O-1030", "2024-06-30", "C01", "North", "Widget", 2, "$80.00"),
]
DUPLICATED = ["O-1004", "O-1014", "O-1022", "O-1027"]  # re-imported rows, exact copies

# Canonical customer master. C03, C07, C10 disagree with the region typed on orders.
CUSTOMERS = [
    ("C01", "Acme Corp", "North", "Enterprise"),
    ("C02", "Bolt Ltd", "South", "SMB"),
    ("C03", "Cobalt Inc", "South", "SMB"),
    ("C04", "Delta LLC", "West", "Enterprise"),
    ("C05", "Echo GmbH", "North", "SMB"),
    ("C06", "Fable SA", "South", "Enterprise"),
    ("C07", "Garnet Co", "West", "SMB"),
    ("C08", "Helix Ltd", "West", "Enterprise"),
    ("C09", "Iris AG", "North", "SMB"),
    ("C10", "Juno Inc", "North", "SMB"),
]
TARGETS = [("North", 2000), ("South", 1500), ("East", 1200), ("West", 1800)]

POLICY = """# Finance reporting policy (excerpt)

1. All revenue is reported in **USD**. Amounts recorded in EUR are converted at a fixed
   rate of **1 EUR = 1.10 USD**.
2. The fiscal year starts on **1 April**.
3. The customer master (`customers.xlsx`, sheet `Customers`) is the **authoritative source
   for a customer's region**. The `region` typed on individual orders is informational only.
4. Orders without a recorded amount are excluded from revenue figures.
5. The order system occasionally re-imports orders; an order ID represents one sale.
"""


def usd(amount: str) -> float | None:
    if amount in ("", "N/A"):
        return None
    value = float(amount[1:])
    return value * EUR_TO_USD if amount.startswith("€") else value


def main() -> None:
    rows = list(ORDERS) + [row for row in ORDERS if row[0] in DUPLICATED]
    rows.sort(key=lambda r: r[0])
    with (HERE / "orders.csv").open("w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        writer.writerow(["order_id", "order_date", "customer_id", "region", "product",
                         "quantity", "amount"])
        writer.writerows(rows)

    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Customers"
    sheet.append(["customer_id", "customer_name", "region", "segment"])
    for customer in CUSTOMERS:
        sheet.append(customer)
    targets = workbook.create_sheet("Targets")
    targets.append(["region", "h1_2024_target_usd"])
    for target in TARGETS:
        targets.append(target)
    workbook.save(HERE / "customers.xlsx")
    (HERE / "policy.md").write_text(POLICY, encoding="utf-8")

    # Reference answers, computed from the unique order list per policy.
    region = {c[0]: c[2] for c in CUSTOMERS}
    revenue = [(o, usd(o[6])) for o in ORDERS]
    valued = [(o, v) for o, v in revenue if v is not None]
    by_region: dict[str, float] = {}
    for o, v in valued:
        by_region[region[o[2]]] = by_region.get(region[o[2]], 0.0) + v
    eur = [float(o[6][1:]) for o in ORDERS if o[6].startswith("€")]
    questions = [
        {"q": "How many unique orders are there?", "expect": "answer", "value": len(ORDERS)},
        {"q": "What is the total revenue in USD?", "expect": "answer",
         "value": round(sum(v for _, v in valued), 2)},
        {"q": "What was the total revenue in USD in March 2024?", "expect": "ambiguous"},
        {"q": "Which region generated the most revenue in USD?", "expect": "answer",
         "value": max(by_region, key=lambda k: by_region[k])},
        {"q": "How many orders have no recorded amount?", "expect": "answer",
         "value": sum(1 for _, v in revenue if v is None)},
        {"q": "What is the average order amount in EUR for orders paid in EUR?",
         "expect": "answer", "value": round(sum(eur) / len(eur), 2)},
        {"q": "How many Widgets were sold in total?", "expect": "answer",
         "value": sum(o[5] for o in ORDERS if o[4] == "Widget")},
        {"q": "What was the revenue on February 30, 2024?", "expect": "refuse"},
        {"q": "What is our total profit margin?", "expect": "refuse"},
        {"q": "How much revenue did we make in 2023?", "expect": "refuse"},
        {"q": "What will revenue be next quarter?", "expect": "refuse"},
    ]
    (HERE / "questions.json").write_text(json.dumps(questions, indent=2), encoding="utf-8")
    print(f"wrote {len(rows)} order rows, {len(questions)} questions; by_region={by_region}")


if __name__ == "__main__":
    main()
