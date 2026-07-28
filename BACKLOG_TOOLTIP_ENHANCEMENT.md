# Backlog: Per-Horizon Tooltip Enhancement

## Status
Reverted from main. Saved here for future implementation.

## What Was Reverted

### Frontend: Custom tooltip overlay
- Replaced native `title` attribute with React state-based tooltip overlay (`position: fixed`, `z-index: 9999`)
- Used `onMouseEnter`/`onMouseMove`/`onMouseLeave` event handlers instead of `title`
- Tooltip content included per-horizon max_high/low with % return from entry price
- Caused P1 regression: `onMouseMove` called `setState` on every mousemove, triggering full component re-renders

### Backend: 22 new SignalResult fields
- `max_high_7d`, `max_high_date_7d`, `max_low_7d`, `max_low_date_7d`
- `max_high_14d`, `max_high_date_14d`, `max_low_14d`, `max_low_date_14d`
- `max_high_30d`, `max_high_date_30d`, `max_low_30d`, `max_low_date_30d`
- `max_high_45d`, `max_high_date_45d`, `max_low_45d`, `max_low_date_45d`
- `max_high_60d`, `max_high_date_60d`, `max_low_60d`, `max_low_date_60d`
- `max_high_date_90d`, `max_low_date_90d` (aliases for existing `max_high_date`/`max_low_date`)
- Per-horizon max/low computation inside `for h in horizons:` loop in `backtester.py`
- `_build_results_json` in `persistence.py` serialized all 22 fields

## Lesson Learned
**Performance:** Never use React `setState` on `onMouseMove`. Always use DOM refs + direct style manipulation for cursor-tracked tooltips.

## Implementation Guidance (for future)
1. Use `useRef` for tooltip DOM element, update `style.left`/`style.top` directly via `ref.current.style`
2. Keep only show/hide in React state; store content in ref
3. Backend fields and per-horizon computation are ready to add back as-is
4. Test with slow connections / large trade tables to verify no re-render lag
