let _context = null;
let _listeners = [];

export function setContext(ctx) {
  _context = ctx;
  _listeners.forEach(fn => fn(ctx));
}

export function getContext() {
  return _context;
}

export function subscribe(fn) {
  _listeners.push(fn);
  return () => {
    _listeners = _listeners.filter(f => f !== fn);
  };
}
