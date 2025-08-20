// Рендер и привязка UI
import { COL_LABEL } from './config.js';
import { $, fmtDate, UF, enumText, parseStage } from './utils.js';

export function fitToIframe() {
  if (!window.BX24) return;
  let raf;
  const apply = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const h = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight) + 12;
      try { BX24.resizeWindow(h); } catch(e) {}
    });
  };
  new ResizeObserver(apply).observe(document.body);
  apply();
}

export function applyVisibleColumns(S) {
  document.querySelectorAll('[data-col]').forEach(th => {
    const key = th.getAttribute('data-col');
    th.style.display = S.cols.includes(key) ? '' : 'none';
    const w = S.widths[key];
    if (w) th.style.width = w;
  });
}

export function enableResizers(S) {
  document.querySelectorAll('th .resizer').forEach(handle => {
    const th = handle.parentElement;
    const key= th.getAttribute('data-col');
    let startX, startW;
    handle.onmousedown = e => {
      startX = e.clientX;
      startW = th.offsetWidth;
      th.classList.add('resizing');
      document.onmousemove = ev => {
        const w = Math.max(60, startW + (ev.clientX - startX));
        th.style.width = w + 'px';
        S.widths[key] = th.style.width;
      };
      document.onmouseup = () => {
        document.onmousemove = null;
        document.onmouseup = null;
        th.classList.remove('resizing');
        localStorage.setItem('widths_v1', JSON.stringify(S.widths));
      };
    };
  });
}

function stageBarHtml(S, item) {
  const st = getStageObj(S, item);
  const cid = Number(item.categoryId) || st.categoryId || 0;
  const max = S.cats[cid]?.maxSort || 100;
  const pct = Math.max(0, Math.min(100, Math.round(((st.sort || 0) / max) * 100)));
  const list = S.catStages[cid] || [];
  const opts = list.map(s => `<option value="${s.id}" ${s.id===st.id?'selected':''}>${s.name}</option>`).join('');
  return `
    <div class="stage">
      <div class="bar"><i style="width:${pct}%"></i></div>
      <span>${st.name}</span>
      <select class="stageSel" data-item="${item.id}" data-cur="${st.id}">${opts}</select>
    </div>
  `;
}

function getStageObj(S, item) {
  const sid = item.stageId;
  const {categoryId, statusId} = parseStage(sid);
  return S.stagesByFull[sid] || S.stagesByCatStatus[(categoryId + ':' + statusId)] || { id:sid, name:sid, sort:0, categoryId };
}

// сорт + фильтр + пагинация
export function filteredSortedSlice(S) {
  const f = S.filter;
  let arr = S.items.filter(it => {
    const title = String(it.title||'').toLowerCase();
    const uid   = Number(it.assignedById)||null;
    const ass   = uid && S.users[uid] ? S.users[uid].name.toLowerCase() : '';
    const st    = getStageObj(S, it).name.toLowerCase();
    const deal  = String(UF(it, S.F.dealIdSource) || '').toLowerCase();
    const key   = String(UF(it, S.F.licenseKey) || '').toLowerCase();
    const url   = String(UF(it, S.F.portalUrl) || '').toLowerCase();
    const tariff= String(enumText(S.ufEnums, S.F.tariff, UF(it, S.F.tariff)) || '').toLowerCase();
    const prod  = String(enumText(S.ufEnums, S.F.product, UF(it, S.F.product)) || '').toLowerCase();
    return (!f.title || title.includes(f.title))
      && (!f.ass || ass.includes(f.ass))
      && (!f.stage || st.includes(f.stage))
      && (!f.deal || deal.includes(f.deal))
      && (!f.key || key.includes(f.key))
      && (!f.url || url.includes(f.url))
      && (!f.tariff || tariff.includes(f.tariff))
      && (!f.product || prod.includes(f.product));
  });

  const dir = S.view.sortDir === 'asc' ? 1 : -1;
  const key = S.view.sortKey;

  const val = (x,y,k) => {
    if (k==='id') return (Number(x.id)||0) - (Number(y.id)||0);
    if (k==='title') return String(x.title||'').localeCompare(String(y.title||''),'ru',{sensitivity:'base'});
    if (k==='ass') {
      const ax = S.users[Number(x.assignedById)]?.name||'';
      const ay = S.users[Number(y.assignedById)]?.name||'';
      return ax.localeCompare(ay,'ru',{sensitivity:'base'});
    }
    if (k==='stage') return (getStageObj(S,x).sort||0) - (getStageObj(S,y).sort||0);
    if (k==='dealid') return String(UF(x,S.F.dealIdSource)||'').localeCompare(String(UF(y,S.F.dealIdSource)||''),'ru',{numeric:true});
    if (k==='key') return String(UF(x,S.F.licenseKey)||'').localeCompare(String(UF(y,S.F.licenseKey)||''),'ru',{sensitivity:'base'});
    if (k==='url') return String(UF(x,S.F.portalUrl)||'').localeCompare(String(UF(y,S.F.portalUrl)||''),'ru',{sensitivity:'base'});
    if (k==='tariff') {
      const tx = String(enumText(S.ufEnums,S.F.tariff,UF(x,S.F.tariff))||'');
      const ty = String(enumText(S.ufEnums,S.F.tariff,UF(y,S.F.tariff))||'');
      return tx.localeCompare(ty,'ru',{sensitivity:'base'});
    }
    if (k==='tEnd') return String(UF(x,S.F.tariffEnd)||'').localeCompare(String(UF(y,S.F.tariffEnd)||''),'ru',{numeric:true});
    if (k==='mEnd') return String(UF(x,S.F.marketEnd)||'').localeCompare(String(UF(y,S.F.marketEnd)||''),'ru',{numeric:true});
    if (k==='product') {
      const px = String(enumText(S.ufEnums,S.F.product,UF(x,S.F.product))||'');
      const py = String(enumText(S.ufEnums,S.F.product,UF(y,S.F.product))||'');
      return px.localeCompare(py,'ru',{sensitivity:'base'});
    }
    return 0;
  };

  arr.sort((x,y)=>val(x,y, key));
  if (dir < 0) arr.reverse();

  const total = arr.length;
  const pages = Math.max(1, Math.ceil(total/S.view.size));
  if (S.view.page > pages) S.view.page = pages;
  const start = (S.view.page-1)*S.view.size;

  return {
    total, pages,
    slice: arr.slice(start, start + S.view.size)
  };
}

export function renderTable(S, handlers) {
  const ui = {
    rows: $('#rows'),
    pgInfo: $('#pgInfo'),
    pgPrev: $('#pgPrev'),
    pgNext: $('#pgNext'),
    pageSize: $('#pageSize')
  };

  const { slice, total, pages } = filteredSortedSlice(S);

  ui.pgInfo.textContent = `${S.view.page}/${pages}`;
  ui.pgPrev.disabled = (S.view.page <= 1);
  ui.pgNext.disabled = (S.view.page >= pages);

  if (!slice.length) {
    ui.rows.innerHTML = `<tr><td colspan="12" class="muted">Ничего не найдено</td></tr>`;
    return;
  }

  ui.rows.innerHTML = '';
  slice.forEach(it => {
    const uid = Number(it.assignedById)||null;
    const u = uid ? S.users[uid] : null;
    const assHtml = u
      ? `<a href="#" onclick="BX24.openPath('/company/personal/user/${uid}/');return false;">${u.name}</a>`
      : (uid ? ('ID '+uid) : '—');

    const tEnd = fmtDate(UF(it, S.F.tariffEnd));
    const mEnd = fmtDate(UF(it, S.F.marketEnd));

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td data-col="id">${it.id}</td>
      <td class="wrap-title" data-col="title"><a href="#" data-open="${it.id}">${it.title || ('#'+it.id)}</a></td>
      <td data-col="ass">${assHtml}</td>
      <td data-col="stage">${stageBarHtml(S, it)}</td>
      <td data-col="deal">${UF(it, S.F.dealIdSource) ?? '—'}</td>
      <td data-col="key">${UF(it, S.F.licenseKey) ?? '—'}</td>
      <td data-col="url" class="wrap-title">${
        (UF(it, S.F.portalUrl) || '')
          ? `<a href="${UF(it, S.F.portalUrl)}" target="_blank" rel="noopener">${UF(it, S.F.portalUrl)}</a>`
          : '—'
      }</td>
      <td data-col="tariff">${enumText(S.ufEnums, S.F.tariff, UF(it, S.F.tariff))}</td>
      <td data-col="tEnd">${tEnd}</td>
      <td data-col="mEnd">${mEnd}</td>
      <td data-col="product">${enumText(S.ufEnums, S.F.product, UF(it, S.F.product))}</td>
      <td data-col="act">
        <button class="btn" data-open="${it.id}">Открыть</button>
      </td>
    `;
    tr.querySelectorAll('[data-col]').forEach(td => {
      const key = td.getAttribute('data-col');
      td.style.display = S.cols.includes(key) ? '' : 'none';
    });
    ui.rows.appendChild(tr);
  });

  // события внутри строк
  ui.rows.querySelectorAll('[data-open]').forEach(n => {
    n.onclick = e => {
      e.preventDefault();
      const id = n.getAttribute('data-open');
      handlers.openItem(id);
    };
  });
  ui.rows.querySelectorAll('.stageSel').forEach(sel => {
    sel.onchange = () => {
      const newStageId = sel.value;
      const itemId = Number(sel.getAttribute('data-item'));
      handlers.changeStage(itemId, newStageId);
    };
  });
}

export function bindToolbar(S, handlers) {
  // Кнопки
  $('#btnRefresh')?.addEventListener('click', handlers.reload);
  $('#btnCreate')?.addEventListener('click', () => handlers.openItem(0));

  // Пагинация
  $('#pgPrev')?.addEventListener('click', () => { if (S.view.page>1){ S.view.page--; handlers.render(); } });
  $('#pgNext')?.addEventListener('click', () => {
    const info = filteredSortedSlice(S);
    if (S.view.page < info.pages){ S.view.page++; handlers.render(); }
  });
  $('#pageSize')?.addEventListener('change', e => {
    S.view.size = Number(e.target.value) || 10;
    S.view.page = 1;
    handlers.render();
  });

  // Фильтры
  const fs = {
    fTitle:'title', fAss:'ass', fStage:'stage', fDeal:'deal',
    fKey:'key', fUrl:'url', fTariff:'tariff', fProduct:'product'
  };
  Object.keys(fs).forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
      S.filter[fs[id]] = String(el.value || '').toLowerCase();
      S.view.page = 1;
      handlers.render();
    });
  });

  // Сортировка по шапке
  const head = document.querySelector('tr.head');
  head?.addEventListener('click', e => {
    const th = e.target.closest('th[data-col]');
    if (!th || e.target.classList.contains('resizer')) return;
    const map = { deal:'dealid', key:'key', url:'url', tariff:'tariff', tEnd:'tEnd', mEnd:'mEnd', product:'product' };
    const key = th.getAttribute('data-col');
    const sortKey = ({id:'id', title:'title', ass:'ass', stage:'stage', act:'id'})[key] || map[key] || 'id';
    S.view.sortKey === sortKey
      ? (S.view.sortDir = (S.view.sortDir === 'asc' ? 'desc' : 'asc'))
      : (S.view.sortKey = sortKey, S.view.sortDir = 'asc');
    handlers.render();
  });
}

export function applyColsModal(S) {
  // модал "колонки"
  const list = $('#colList');
  const modal = $('#colModal');
  const cancel = $('#colCancel');
  const apply = $('#colApply');
  if (!list || !modal) return;

  $('#btnCols')?.addEventListener('click', () => {
    list.innerHTML = '';
    const all = Object.keys(COL_LABEL);
    all.forEach(k => {
      const id = 'col_' + k;
      const row = document.createElement('label');
      row.innerHTML = `<input type="checkbox" id="${id}" ${S.cols.includes(k)?'checked':''}> ${COL_LABEL[k]}`;
      list.appendChild(row);
    });
    modal.style.display = 'flex';
  });

  cancel?.addEventListener('click', () => modal.style.display = 'none');
  apply?.addEventListener('click', () => {
    const boxes = [...list.querySelectorAll('input[type="checkbox"]')];
    const next = boxes.filter(b => b.checked).map(b => b.id.replace('col_',''));
    if (!next.length) return;
    S.cols = next;
    localStorage.setItem('cols_v1', JSON.stringify(S.cols));
    modal.style.display = 'none';
    applyVisibleColumns(S);
  });
}
