import csv
import os
import re
import sys
from collections import OrderedDict

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))


def extract_screener_name(filename):
    name = filename
    if '.' in name:
        name = name.rsplit('.', 1)[0]

    name = re.sub(
        r'-\s*\d+\s*(?:[Yy]ears?|[Mm]onths?)\s*_?[Dd]ata?\s*-?\d*$',
        '', name
    )
    name = re.sub(r'_data-\d{8}$', '', name)
    name = re.sub(r'-\d{8}$', '', name)
    name = re.sub(r'[-_\s]+$', '', name)
    return name.strip()


def detect_screener_groups(files):
    groups = OrderedDict()
    for f in sorted(files):
        if f.startswith('master_') or f == os.path.basename(__file__):
            continue
        lower = f.lower()
        if lower.startswith('master_'):
            continue

        screener = extract_screener_name(f)
        if screener not in groups:
            groups[screener] = []
        groups[screener].append(f)
    return groups


def count_rows(filepath):
    try:
        with open(filepath, 'r', encoding='utf-8-sig') as f:
            return sum(1 for line in f) - 1
    except Exception:
        return 0


def ask_order(files, screener):
    print(f'\nFound {len(files)} files for screener "{screener}":\n')
    for i, f in enumerate(files, 1):
        row_count = count_rows(os.path.join(SCRIPT_DIR, f))
        print(f'  [{i}] {f}  ({row_count:,} rows)')

    print(
        '\nAssign priority order (1 = first to process, first occurrence wins on conflict).'
    )
    print('Enter comma-separated numbers matching the desired order,')
    print(f'or press Enter to keep current order (1,2,3...{len(files)}): ')

    try:
        raw = input('> ').strip()
    except (EOFError, OSError):
        raw = ''
    if not raw:
        return list(files)

    try:
        indices = [int(x.strip()) for x in raw.split(',')]
        if set(indices) != set(range(1, len(files) + 1)):
            print(f'  [!] Invalid indices. Using default order.')
            return list(files)
        ordered = [files[i - 1] for i in indices]
        return ordered
    except (ValueError, IndexError):
        print(f'  [!] Could not parse. Using default order.')
        return list(files)


def ask_confirmation(screener, ordered_files, output_name, existing_master):
    print(f'\n=== PRE-FLIGHT SUMMARY ===')
    print(f'Screener: {screener}\n')
    print(f'{"Order":<6} {"File":<60} {"Rows":<10} {"Est. New":<10}')
    print('-' * 86)

    seen = set()
    total_unique = 0
    for rank, f in enumerate(ordered_files, 1):
        row_count = count_rows(os.path.join(SCRIPT_DIR, f))
        est_new = 0
        try:
            with open(os.path.join(SCRIPT_DIR, f), 'r', encoding='utf-8-sig') as fh:
                reader = csv.DictReader(fh)
                for row in reader:
                    key = (row.get('Date', '').strip(), row.get('Symbol', '').strip().upper())
                    if key not in seen:
                        est_new += 1
                        seen.add(key)
        except Exception:
            est_new = row_count if not seen else 0

        total_unique += est_new
        print(f'{rank:<6} {f[:58]:<60} {row_count:<10,} {est_new:<10,}')

    print(f'\nOutput: {output_name}')
    print(f'Total unique rows (est): {total_unique:,}')
    if existing_master:
        print(f'\n  [Warning] Output file already exists. It will be overwritten.')

    try:
        answer = input('\nProceed with merge? (Y/n): ').strip().lower()
    except (EOFError, OSError):
        answer = 'y'
    return answer in ('', 'y', 'yes')


def validate_columns(files):
    cols = None
    for f in files:
        try:
            with open(os.path.join(SCRIPT_DIR, f), 'r', encoding='utf-8-sig') as fh:
                reader = csv.DictReader(fh)
                if cols is None:
                    cols = set(reader.fieldnames)
                elif set(reader.fieldnames) != cols:
                    return False, reader.fieldnames, cols
        except Exception:
            pass
    return True, None, None


def merge_screener(screener, files, output_name):
    seen = set()
    total_read = 0
    total_kept = 0
    total_skipped = 0
    file_stats = []

    output_path = os.path.join(SCRIPT_DIR, output_name)

    for rank, fname in enumerate(files):
        filepath = os.path.join(SCRIPT_DIR, fname)
        file_read = 0
        file_kept = 0
        file_skipped = 0

        try:
            with open(filepath, 'r', encoding='utf-8-sig') as f:
                reader = csv.DictReader(f)
                cols = reader.fieldnames
                is_first = rank == 0

                mode = 'w' if is_first else 'a'
                write_header = is_first
                file_exists = os.path.isfile(output_path)

                with open(output_path, mode, newline='', encoding='utf-8') as out:
                    writer = csv.DictWriter(out, fieldnames=cols)
                    if write_header or not file_exists:
                        writer.writeheader()

                    for row in reader:
                        file_read += 1
                        date = row.get('Date', '').strip()
                        symbol = row.get('Symbol', '').strip().upper()
                        key = (date, symbol)

                        if key in seen:
                            file_skipped += 1
                            continue

                        seen.add(key)
                        writer.writerow(row)
                        file_kept += 1

        except Exception as e:
            print(f'  [!] Error reading {fname}: {e}')
            file_stats.append((fname, 0, 0, 0))
            continue

        total_read += file_read
        total_kept += file_kept
        total_skipped += file_skipped
        file_stats.append((fname, file_read, file_kept, file_skipped))
        print(
            f'  [{rank+1}/{len(files)}] {fname[:60]:<60} '
            f'{file_read:>6,} read -> {file_kept:>6,} kept, {file_skipped:>6,} dups skipped'
        )

    return file_stats, total_read, total_kept, total_skipped


def main():
    print('=' * 60)
    print('  ChartInk CSV Merger')
    print('=' * 60)

    all_csvs = [f for f in os.listdir(SCRIPT_DIR) if f.lower().endswith('.csv')]
    groups = detect_screener_groups(all_csvs)

    if not groups:
        print('\n  No CSV files found to merge (excluding master files).')
        sys.exit(0)

    for screener, files in groups.items():
        if len(files) < 2:
            print(f'\nOnly 1 file found for "{screener}" - nothing to merge.')
            continue

        ordered = ask_order(files, screener)

        safe_name = re.sub(r'[^\w\s-]', '', screener).strip()
        safe_name = re.sub(r'[-\s]+', '_', safe_name)
        output_name = f'master_{safe_name}.csv'
        existing_master = os.path.isfile(os.path.join(SCRIPT_DIR, output_name))

        col_ok, bad_cols, expected_cols = validate_columns(ordered)
        if not col_ok:
            print(f'\n  [Warning] Column mismatch in "{screener}":')
            print(f'    Expected: {sorted(expected_cols)}')
            print(f'    Found:    {sorted(bad_cols)}')
            print('  Proceeding with merge (only common columns will align).')

        if not ask_confirmation(screener, ordered, output_name, existing_master):
            print(f'  Skipped "{screener}".')
            continue

        print(f'\nMerging "{screener}"...\n')
        stats, total_read, total_kept, total_skipped = merge_screener(
            screener, ordered, output_name
        )

        print(f'\n  ** Done ** {output_name} ({total_kept:,} unique rows)')
        print(f'     {total_skipped:,} total duplicates skipped across {len(ordered)} files\n')

    print('All screeners processed.')


if __name__ == '__main__':
    main()
