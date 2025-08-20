// ожидание BX24 SDK без падений
export async function waitBX24(maxMs = 6000) {
  const started = Date.now();
  while (typeof window.BX24 === 'undefined') {
    if (Date.now() - started > maxMs) throw new Error('BX24 SDK not loaded');
    await new Promise(r => setTimeout(r, 50));
  }
  return window.BX24;
}
export function waitBX24(timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    (function tick() {
      if (window.BX24 && typeof BX24.callMethod === 'function') return resolve();
      if (Date.now() - start > timeoutMs) return reject(new Error('BX24 SDK timeout'));
      setTimeout(tick, 50);
    })();
  });
}
