// ожидание BX24 SDK без падений
export async function waitBX24(maxMs = 6000) {
  const started = Date.now();
  while (typeof window.BX24 === 'undefined') {
    if (Date.now() - started > maxMs) throw new Error('BX24 SDK not loaded');
    await new Promise(r => setTimeout(r, 50));
  }
  return window.BX24;
}
