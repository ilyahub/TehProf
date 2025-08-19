// assets/app/reorder.js
// Держим первые три колонки: ID → Название → Ответственный
(() => {
  const ORDER = ['id','title','ass'];

  function moveToFront(row) {
    if (!row) return;
    // вставляем по одному, с конца ORDER, чтобы получилось правильное начало
    for (let i = ORDER.length - 1; i >= 0; i--) {
      const k = ORDER[i];
      const cell = row.querySelector(`[data-col="${k}"]`);
      if (cell && row.firstElementChild !== cell) {
        row.insertBefore(cell, row.firstElementChild);
      }
    }
  }

  function reorderHeadAndFilters() {
    document.querySelectorAll('thead tr').forEach(moveToFront);
  }

  function reorderBody() {
    document.querySelectorAll('#rows tr').forEach(moveToFront);
  }

  // следим за заменой строк при каждом render()
  let obs;
  function watchBody() {
    const tbody = document.getElementById('rows');
    if (!tbody) return;
    if (obs) obs.disconnect();
    obs = new MutationObserver(() => reorderBody());
    obs.observe(tbody, { childList: true });
  }

  function start() {
    reorderHeadAndFilters();
    reorderBody();
    watchBody();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
