// тонкая обёртка над BX24
export function call(method, params) {
  return new Promise((resolve, reject) => {
    window.BX24.callMethod(method, params, r => {
      if (r.error()) reject(new Error(r.error_description()));
      else resolve(r.data());
    });
  });
}
export function callBatch(calls) {
  return new Promise((resolve) => {
    window.BX24.callBatch(calls, res => resolve(res), true);
  });
}
