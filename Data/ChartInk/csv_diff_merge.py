import os
import sys
import pandas as pd
import numpy as np
from datetime import datetime

KEY_COLS = ["Date", "Symbol"]
DATA_COLS = ["Marketcapname", "Sector"]
ALL_COLS = KEY_COLS + DATA_COLS


def read_csv_safe(path: str) -> pd.DataFrame:
    if os.path.getsize(path) == 0:
        print(f"Warning: {path} is empty.")
        return pd.DataFrame(columns=ALL_COLS)

    encodings = ["utf-8-sig", "latin1"]
    df = None
    for enc in encodings:
        try:
            df = pd.read_csv(path, encoding=enc, dtype=str)
            break
        except (UnicodeDecodeError, UnicodeError):
            continue
    if df is None:
        print(f"Could not decode {path} with utf-8-sig or latin1. Trying latin1 as last resort...")
        df = pd.read_csv(path, encoding="latin1", dtype=str)

    df.columns = df.columns.str.strip()
    df = df.map(lambda x: x.strip() if isinstance(x, str) else x)

    col_map = {c.lower(): c for c in df.columns}
    needed_lower = [c.lower() for c in ALL_COLS]
    missing = [c for c in needed_lower if c not in col_map]
    if missing:
        print(f"Error: {path} is missing columns: {missing}")
        print(f"Found columns: {list(df.columns)}")
        sys.exit(1)

    rename = {col_map[c.lower()]: c for c in ALL_COLS}
    df = df.rename(columns=rename)
    df = df[ALL_COLS]

    return df


def main() -> None:
    print("=== CSV Diff & Merge Tool ===\n")

    file_a = input("Enter path for File A: ").strip().strip('"').strip("'")
    file_b = input("Enter path for File B: ").strip().strip('"').strip("'")

    for label, path in [("A", file_a), ("B", file_b)]:
        if not os.path.isfile(path):
            print(f"Error: File {label} ('{path}') does not exist.")
            sys.exit(1)

    print(f"\nReading File A: {file_a}")
    df_a = read_csv_safe(file_a)
    print(f"  -> {len(df_a)} rows")

    print(f"Reading File B: {file_b}")
    df_b = read_csv_safe(file_b)
    print(f"  -> {len(df_b)} rows")

    if df_a.empty and df_b.empty:
        print("\nBoth files are empty. Nothing to merge.")
        sys.exit(0)

    for label, df in [("A", df_a), ("B", df_b)]:
        dups = df[df.duplicated(subset=KEY_COLS, keep=False)]
        if not dups.empty:
            dup_keys = dups.drop_duplicates(subset=KEY_COLS)[KEY_COLS]
            print(f"\nWarning: File {label} has {len(dup_keys)} duplicate Date+Symbol rows.")
            print(f"  Keeping first occurrence for: {dup_keys.to_string(index=False, header=False)}")
            df_a = df_a.drop_duplicates(subset=KEY_COLS, keep="first") if label == "A" else df_a
            df_b = df_b.drop_duplicates(subset=KEY_COLS, keep="first") if label == "B" else df_b

    df_a = df_a.drop_duplicates(subset=KEY_COLS, keep="first").reset_index(drop=True)
    df_b = df_b.drop_duplicates(subset=KEY_COLS, keep="first").reset_index(drop=True)

    keys_a = set(zip(df_a["Date"], df_a["Symbol"]))
    keys_b = set(zip(df_b["Date"], df_b["Symbol"]))

    only_a_keys = keys_a - keys_b
    only_b_keys = keys_b - keys_a
    common_keys = keys_a & keys_b

    df_a_idx = df_a.set_index(KEY_COLS)
    df_b_idx = df_b.set_index(KEY_COLS)

    common_keys_list = list(common_keys)
    common_a = df_a_idx.loc[common_keys_list].reset_index()
    common_b = df_b_idx.loc[common_keys_list].reset_index()

    conflict_mask = (common_a[DATA_COLS[0]] != common_b[DATA_COLS[0]]) | (
        common_a[DATA_COLS[1]] != common_b[DATA_COLS[1]]
    )
    conflict_keys = set(
        zip(common_a.loc[conflict_mask, "Date"], common_a.loc[conflict_mask, "Symbol"])
    )
    identical_keys = common_keys - conflict_keys

    count_only_a = len(only_a_keys)
    count_only_b = len(only_b_keys)
    count_conflicts = len(conflict_keys)
    count_identical = len(identical_keys)

    print(f"\n=== Comparison Summary ===")
    print(f"  Rows only in File A:  {count_only_a:>6}")
    print(f"  Rows only in File B:  {count_only_b:>6}")
    print(f"  Conflicting rows:     {count_conflicts:>6}")
    print(f"  Identical rows:       {count_identical:>6}")
    print(f"  Total unique rows:    {count_only_a + count_only_b + count_identical + count_conflicts:>6}")
    print(f"  Total in union:       {len(keys_a | keys_b):>6}")

    if count_conflicts > 0:
        show = input(f"\nView details of {count_conflicts} conflicting rows? (y/N): ").strip().lower()
        if show == "y":
            conflict_rows_a = common_a[conflict_mask].copy()
            conflict_rows_b = common_b[conflict_mask].copy()
            print(f"\n{'='*80}")
            print(f"{'Conflicting Rows - File A vs File B':^80}")
            print(f"{'='*80}")
            for i, (_, ra) in enumerate(conflict_rows_a.iterrows()):
                rb = conflict_rows_b.iloc[i]
                key_str = f"{ra['Date']} | {ra['Symbol']}"
                val_a = f"{ra[DATA_COLS[0]]} | {ra[DATA_COLS[1]]}"
                val_b = f"{rb[DATA_COLS[0]]} | {rb[DATA_COLS[1]]}"
                print(f"  {i+1}. {key_str}")
                print(f"     File A: {val_a}")
                print(f"     File B: {val_b}")
            print(f"{'='*80}\n")

    while True:
        master = input("Pick master file for conflict resolution (A/B): ").strip().upper()
        if master in ("A", "B"):
            break
        print("Please enter 'A' or 'B'.")

    default_out = f"merged_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    out_path = input(f"Output path (default: {default_out}): ").strip().strip('"').strip("'")
    if not out_path:
        out_path = default_out
    elif os.path.isdir(out_path):
        out_path = os.path.join(out_path, default_out)
        print(f"  (Directory given — saving as: {out_path})")

    only_a_rows = df_a_idx.loc[list(only_a_keys)].reset_index() if only_a_keys else pd.DataFrame(columns=ALL_COLS)
    only_b_rows = df_b_idx.loc[list(only_b_keys)].reset_index() if only_b_keys else pd.DataFrame(columns=ALL_COLS)

    if master == "A":
        master_common = common_a.copy()
    else:
        master_common = common_b.copy()

    result = pd.concat([only_a_rows, only_b_rows, master_common], ignore_index=True)
    result = result.drop_duplicates(subset=KEY_COLS, keep="first")
    result = result.fillna("")

    result.to_csv(out_path, index=False, encoding="utf-8-sig")
    print(f"\nMerged CSV written to: {out_path}")
    print(f"  Total rows in output: {len(result)}")
    print(f"  Rows from File A:     {len(only_a_rows) + len(master_common)}")
    print(f"  Rows from File B:     {len(only_b_rows) + len(master_common)}")


if __name__ == "__main__":
    main()
