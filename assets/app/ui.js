// assets/app/ui.js
import { S, loadDealAndItems } from './state.js';
import { CONFIG } from './config.js';
import { $, UF, parseStage } from './utils.js';
import { call } from './api.js';

// ----- локальные ссылки на DOM
const ui = {
  rows: $('#rows'),
  ref: $('#btnRefresh'),
  create: $('#btnCreate'),
  pick: $('#btnPick'),
  colsBtn: $('#btnCols'),
  pageSize: $('#pageSize'),
  pgPrev: $('#pgPrev'),
  pgNext: $('#pgNext'),
  pgInfo: $('#pgInfo'),
  fTitle: $('#fTitle'),
  fAss: $('#fAss'),
  fStage: $('#fStage'),
  fDeal: $('#fDeal'),
  fKey: $('#fKey'),
  fUrl: $('#fUrl'),
  fTariff: $('#fTariff'),
  fProduct: $('#fProduct'),
  head: document.querySelector('tr.head'),
  filters: document.querySelector('tr.filters'),
  colModal: $('#colModal'),
  colList: $('#colList'),
  colCancel: $('#colCancel'),
  colApply: $('#colApply'),
};

// ----- утилиты рендера
const fit = (() => {
  let raf;
  return function () {
    if (!window.BX24) return;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const h = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight) + 12;
      try { BX24.resizeWindow(h); } catch (e) {}
    });
  };
})();
new ResizeObserver(() => fit()).observe(document.body);

const enumText = (code, val) => {
  if (val === null || val === undefined || val === '') return '—';
  const dict = S.ufEnums[code] || {};
  return dict[val] || val;
};

export function getStageObject(item){
  const sid=item.stageId;
  const {categoryId,statusId}=parseStage(sid);
  return S.stagesByFull[sid] || S.stagesByCatStatus[(categoryId+':'+statusId)] || {id:sid,name:sid,sort:0,categoryId};
}
function stageUi(item){
  const st=getStageObject(item);
  const cid=Number(item.categoryId)||st.categoryId||0;
  const max=S.cats[cid]?.maxSort||100;
  const pct=Math.max(0,Math.min(100,Math.round(((st.sort||0)/max)*100)));
  const list=S.catStages[cid]||[];
  const opts=list.map(s=>`<option value="${s.id}" ${s.id===st.id?'selected':''}>${s.name}</option>`).join('');
  return `<div class="stage"><div class="bar"><i style="width:${pct}%"></i></div><span>${st.name}</span><select class="stageSel" data-item="${item.id}" data-cur="${st.id}">${opts}</select></div>`;
}

// ----- фильтрация/сортировка
function filteredAndSorted(){
  const f=S.filter;
  let arr=S.items.filter(it=>{
    const title=String(it.title||'').toLowerCase();
    const uid=Number(it.assignedById)||null;
    const ass=uid&&S.users[uid]?S.users[uid].name.toLowerCase():'';
    const st=getStageObject(it).name.toLowerCase();

    const deal = String(UF(it, CONFIG.F.dealIdSource)||'').toLowerCase();
    const key  = String(UF(it, CONFIG.F.licenseKey)||'').toLowerCase();
    const url  = String(UF(it, CONFIG.F.portalUrl)||'').toLowerCase();
    const tariff = String(enumText(CONFIG.F.tariff, UF(it, CONFIG.F.tariff))||'').toLowerCase();
    const prod   = String(enumText(CONFIG.F.product, UF(it, CONFIG.F.product))||'').toLowerCase();

    return (!f.title || title.includes(f.title))
        && (!f.ass   || ass.includes(f.ass))
        && (!f.stage || st.includes(f.stage))
        && (!f.deal  || deal.includes(f.deal))
        && (!f.key   || key.includes(f.key))
        && (!f.url   || url.includes(f.url))
        && (!f.tariff|| tariff.includes(f.tariff))
        && (!f.product|| prod.includes(f.product));
  });

  const dir=S.view.sortDir==='asc'?1:-1, key=S.view.sortKey;
  arr.sort((x,y)=>{
    const get=(k)=>{
      if(k==='id') return (Number(x.id)||0)-(Number(y.id)||0);
      if(k==='title') return String(x.title||'').localeCompare(String(y.title||''),'ru',{sensitivity:'base'});
      if(k==='ass'){ const ax=S.users[Number(x.assignedById)]?.name||'', ay=S.users[Number(y.assignedById)]?.name||''; return ax.localeCompare(ay,'ru',{sensitivity:'base'}); }
      if(k==='stage') return (getStageObject(x).sort||0)-(getStageObject(y).sort||0);
      if(k==='dealid') return String(UF(x,CONFIG.F.dealIdSource)||'').localeCompare(String(UF(y,CONFIG.F.dealIdSource)||''),'ru',{numeric:true});
      if(k==='key') return String(UF(x,CONFIG.F.licenseKey)||'').localeCompare(String(UF(y,CONFIG.F.licenseKey)||''),'ru',{sensitivity:'base'});
      if(k==='url') return String(UF(x,CONFIG.F.portalUrl)||'').localeCompare(String(UF(y,CONFIG.F.portalUrl)||''),'ru',{sensitivity:'base'});
      if(k==='tariff') return String(enumText(CONFIG.F.tariff,UF(x,CONFIG.F.tariff))||'').localeCompare(String(enumText(CONFIG.F.tariff,UF(y,CONFIG.F.tariff))||''),'ru',{sensitivity:'base'});
      if(k==='tEnd') return String(UF(x,CONFIG.F.tariffEnd)||'').localeCompare(String(UF(y,CONFIG.F.tariffEnd)||''),'ru',{numeric:true});
      if(k==='mEnd') return String(UF(x,CONFIG.F.marketEnd)||'').localeCompare(String(UF(y,CONFIG.F.marketEnd)||''),'ru',{numeric:true});
      if(k==='product') return String(enumText(CONFIG.F.product,UF(x,CONFIG.F.product))||'').localeCompare(String(enumText(CONFIG.F.product,UF(y,CONFIG.F.product))||''),'ru',{sensitivity:'base'});
      return 0;
    };
    const v=get(key); return v===0 ? ((Number(x.id)||0)-(Number(y.id)||0))*dir : v*dir;
  });
  if(dir<0) arr.reverse();
  return arr;
}

// ----- сохранение связей сделки
async function save(next){
  const f={}; f[S.field]=next;
  try{ await call('crm.deal.update',{id:S.dealId,fields:f}); }
  catch(e){ alert('Ошибка: '+e.message); }
  await loadDealAndItems(); render(); fit();
}
function bcode(t,id){ return `DYNAMIC_${t}_${id}`; }
function attach(ids){
  if(S.mode==='bindings'){
    const add=ids.map(id=>bcode(S.typeId,id));
    const next = Array.from(new Set([...(S.bindings||[]), ...add]));
    save(next);
  }else{
    const base = (Array.isArray(S.bindings)?S.bindings:[S.bindings]).map(Number).filter(Boolean);
    const next = Array.from(new Set([...base, ...ids]));
    save(next);
  }
}
function detach(id){
  if(S.mode==='bindings'){
    const code=bcode(S.typeId,id);
    save((S.bindings||[]).filter(c=>c!==code));
  }else{
    const base = (Array.isArray(S.bindings)?S.bindings:[S.bindings]).map(Number).filter(Boolean);
    save(base.filter(v=>v!==id));
  }
}

// ----- основной рендер
export function render(){
  // видимость столбцов
  document.querySelectorAll('[data-col]').forEach(th=>{
    const key=th.getAttribute('data-col');
    th.style.display = S.cols.includes(key)?'':'none';
    const w=S.widths[key]; if(w) th.style.width=w;
  });
  ui.filters.querySelectorAll('[data-col]').forEach(td=>{
    const key=td.getAttribute('data-col');
    td.style.display = S.cols.includes(key)?'':'none';
  });

  const full=filteredAndSorted(), total=full.length;
  const pages=Math.max(1,Math.ceil(total/S.view.size));
  if(S.view.page>pages) S.view.page=pages;
  const start=(S.view.page-1)*S.view.size, slice=full.slice(start,start+S.view.size);

  ui.pgInfo.textContent=S.view.page+'/'+pages;
  ui.pgPrev.disabled=(S.view.page<=1); ui.pgNext.disabled=(S.view.page>=pages);

  if(!slice.length){ ui.rows.innerHTML='<tr><td colspan="12" class="muted">Ничего не найдено</td></tr>'; return; }
  ui.rows.innerHTML='';
  slice.forEach(it=>{
    const id=it.id, title=it.title||('#'+id);
    const uid=Number(it.assignedById)||null, u=uid?S.users[uid]:null;
    const assHtml=u? `<a href="#" onclick="BX24.openPath('/company/personal/user/${uid}/');return false;">${u.name}</a>` : (uid?('ID '+uid):'—');
    const stage=stageUi(it);
    const deal = UF(it, CONFIG.F.dealIdSource) ?? '—';
    const key  = UF(it, CONFIG.F.licenseKey) ?? '—';
    const urlR = UF(it, CONFIG.F.portalUrl) ?? '';
    const url  = urlR ? `<a href="${urlR}" target="_blank" rel="noopener">${urlR}</a>` : '—';
    const tariff = enumText(CONFIG.F.tariff, UF(it, CONFIG.F.tariff));
    const tEnd = (function(v){ try{ const d=new Date(v); if(isNaN(d)) return '—'; const z=n=>String(n).padStart(2,'0'); return `${z(d.getDate())}.${z(d.getMonth()+1)}.${d.getFullYear()}`;}catch{return '—';} })(UF(it, CONFIG.F.tariffEnd));
    const mEnd = (function(v){ try{ const d=new Date(v); if(isNaN(d)) return '—'; const z=n=>String(n).padStart(2,'0'); return `${z(d.getDate())}.${z(d.getMonth()+1)}.${d.getFullYear()}`;}catch{return '—';} })(UF(it, CONFIG.F.marketEnd));
    const product = enumText(CONFIG.F.product, UF(it, CONFIG.F.product));

    const tr=document.createElement('tr');
    tr.innerHTML = `
      <td data-col="stage">${stage}</td>
      <td data-col="deal">${deal}</td>
      <td data-col="key">${key}</td>
      <td data-col="url" class="wrap-title">${url}</td>
      <td data-col="tariff">${tariff}</td>
      <td data-col="tEnd">${tEnd}</td>
      <td data-col="mEnd">${mEnd}</td>
      <td data-col="product">${product}</td>
      <td data-col="act">
        <button class="btn" data-open="${id}">Открыть</button>
        <button class="btn" data-del="${id}">Удалить</button>
      </td>
      <td data-col="id" style="display:none">${id}</td>
      <td class="wrap-title" data-col="title" style="display:none"><a href="#" onclick="BX24.openPath('/crm/type/${S.typeId}/details/${id}/');return false;">${title}</a></td>
      <td data-col="ass" style="display:none">${assHtml}</td>
    `;
    tr.querySelectorAll('[data-col]').forEach(td=>{
      const key=td.getAttribute('data-col'); td.style.display = S.cols.includes(key)?'':'none';
    });
    ui.rows.appendChild(tr);
  });

  // события
  ui.rows.querySelectorAll('[data-open]').forEach(n=>n.onclick=()=>BX24.openPath(`/crm/type/${S.typeId}/details/${n.getAttribute('data-open')}/`));
  ui.rows.querySelectorAll('.stageSel').forEach(sel=>{
    sel.onchange=async ()=>{
      const newStageId=sel.value, itemId=Number(sel.getAttribute('data-item'));
      try{
        await call('crm.item.update',{entityTypeId:S.typeId,id:itemId,fields:{stageId:newStageId}});
        const it=S.items.find(i=>i.id===itemId); if(it) it.stageId=newStageId; render();
      }catch(e){
        alert('Ошибка смены стадии: '+e.message);
        sel.value=sel.getAttribute('data-cur');
      }
    };
  });
  ui.rows.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>detach(Number(b.getAttribute('data-del'))));
}

// ----- ресайз хедеров
export function enableResizers(){
  document.querySelectorAll('th .resizer').forEach(handle=>{
    const th = handle.parentElement;
    const key= th.getAttribute('data-col');
    let startX, startW;
    handle.onmousedown = e=>{
      startX = e.clientX; startW = th.offsetWidth;
      th.classList.add('resizing');
      document.onmousemove = ev=>{
        const w = Math.max(60, startW + (ev.clientX-startX));
        th.style.width = w+'px';
        S.widths[key]=th.style.width;
      };
      document.onmouseup = ()=>{
        document.onmousemove=null; document.onmouseup=null;
        th.classList.remove('resizing');
        localStorage.setItem('widths_v1', JSON.stringify(S.widths));
      };
    };
  });
}

// ----- модал «Колонки»
export function openCols(){
  ui.colList.innerHTML='';
  const all=['stage','deal','key','url','tariff','tEnd','mEnd','product','act','id','title','ass'];
  all.forEach(k=>{
    const id='col_'+k;
    const row=document.createElement('label');
    row.innerHTML=`<input type="checkbox" id="${id}" ${S.cols.includes(k)?'checked':''}> ${({
      id:'ID',title:'Название',ass:'Ответственный',stage:'Стадия',
      deal:'ID исходной сделки',key:'Лицензионный ключ',url:'Адрес портала',
      tariff:'Текущий тариф',tEnd:'Окончание тарифа',mEnd:'Окончание подписки',product:'Продукт',act:'Действия'
    })[k]}`;
    ui.colList.appendChild(row);
  });
  ui.colModal.style.display='flex';
}
function closeCols(){ ui.colModal.style.display='none'; }

// ----- пикер элементов
export function openPicker(){
  const PK={page:0,pageSize:50,query:'',total:0,selected:new Set(),loading:false};

  const modal=document.createElement('div');
  modal.className='modal'; modal.style.display='flex';
  modal.innerHTML=`
    <div class="card" style="width:min(920px,95vw)">
      <div class="card-h">Выбор элементов</div>
      <div class="card-b" style="display:flex;gap:8px">
        <input id="q" style="flex:1;border:1px solid var(--line);border-radius:10px;padding:10px 12px" placeholder="Поиск по названию…">
        <button class="btn" id="btnSearch">Найти</button>
        <button class="btn" id="btnReset">Сброс</button>
        <span class="muted" style="margin-left:auto" id="pgInfoPick"></span>
      </div>
      <div class="card-b" style="height:60vh;overflow:auto">
        <table style="width:100%;border-collapse:collapse">
          <thead><tr><th style="border-bottom:1px solid var(--line);padding:10px 12px;width:48px"><input type="checkbox" id="pickAll"></th><th style="border-bottom:1px solid var(--line);padding:10px 12px;width:80px">ID</th><th style="border-bottom:1px solid var(--line);padding:10px 12px">Название</th></tr></thead>
          <tbody id="pickRows"><tr><td colspan="3" class="muted" style="padding:10px 12px">Загрузка…</td></tr></tbody>
        </table>
      </div>
      <div class="card-f">
        <button class="btn" id="btnMore">Загрузить ещё</button>
        <button class="btn" id="btnClose">Отмена</button>
        <button class="btn primary" id="btnAttach">Добавить выбранные</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  const q=modal.querySelector('#q'), pickRows=modal.querySelector('#pickRows'), pickAll=modal.querySelector('#pickAll');
  const btnSearch=modal.querySelector('#btnSearch'), btnReset=modal.querySelector('#btnReset');
  const btnMore=modal.querySelector('#btnMore'), btnClose=modal.querySelector('#btnClose'), btnAttach=modal.querySelector('#btnAttach');
  const info=modal.querySelector('#pgInfoPick');

  function loadPage(reset=false){
    if(PK.loading) return; PK.loading=true;
    if(reset){ PK.page=0; PK.total=0; pickRows.innerHTML='<tr><td colspan="3" class="muted" style="padding:10px 12px">Загрузка…</td></tr>'; }
    const start=PK.page*PK.pageSize; const filter=PK.query?{'%title':PK.query}:{};
    BX24.callMethod('crm.item.list',{entityTypeId:S.typeId,filter,order:{'id':'DESC'},select:['id','title'],start}, r=>{
      PK.loading=false;
      if(r.error()){ pickRows.innerHTML='<tr><td colspan="3" class="err" style="padding:10px 12px">'+r.error_description()+'</td></tr>'; return; }
      const items=r.data().items||[]; if(reset) pickRows.innerHTML='';
      if(!items.length && reset){ pickRows.innerHTML='<tr><td colspan="3" class="muted" style="padding:10px 12px">Ничего не найдено</td></tr>'; info.textContent=''; return; }
      items.forEach(it=>{
        const tr=document.createElement('tr');
        tr.innerHTML=`<td style="border-bottom:1px solid var(--line);padding:10px 12px"><input type="checkbox" data-id="${it.id}"></td><td style="border-bottom:1px solid var(--line);padding:10px 12px">${it.id}</td><td style="border-bottom:1px solid var(--line);padding:10px 12px">${it.title||('#'+it.id)}</td>`;
        pickRows.appendChild(tr);
      });
      PK.total+=items.length; info.textContent='Показано: '+PK.total; PK.page++;
    });
  }
  pickAll.onchange=()=>{ pickRows.querySelectorAll('input[type="checkbox"][data-id]').forEach(ch=>{ ch.checked=pickAll.checked; const id=Number(ch.getAttribute('data-id')); if(ch.checked) PK.selected.add(id); else PK.selected.delete(id); });};
  pickRows.addEventListener('change',e=>{const t=e.target;if(t&&t.matches('input[type="checkbox"][data-id]')){const id=Number(t.getAttribute('data-id')); if(t.checked) PK.selected.add(id); else PK.selected.delete(id);}});
  btnMore.onclick=()=>loadPage(false);
  btnSearch.onclick=()=>{ PK.query=q.value.trim(); loadPage(true); };
  btnReset.onclick =()=>{ q.value=''; PK.query=''; loadPage(true); };
  btnClose.onclick =()=>{ modal.remove(); };
  btnAttach.onclick=()=>{ const ids=Array.from(PK.selected); if(ids.length) attach(ids); modal.remove(); };
  loadPage(true);
}

// ----- события верхней панели/фильтров/сортировки
export function initUIEvents(){
  ui.ref.onclick = async ()=>{ await loadDealAndItems(); render(); fit(); };
  ui.create.onclick = ()=> BX24.openPath(`/crm/type/${S.typeId}/details/0/`);
  ui.pick.onclick   = openPicker;
  ui.colsBtn.onclick= openCols;
  ui.colCancel && (ui.colCancel.onclick = ()=>{ closeCols(); });
  ui.colApply && (ui.colApply.onclick  = ()=>{ 
    const boxes=[...ui.colList.querySelectorAll('input[type="checkbox"]')];
    const list=boxes.filter(b=>b.checked).map(b=>b.id.replace('col_',''));
    if(!list.length) return; S.cols=list; localStorage.setItem('cols_v1', JSON.stringify(S.cols)); closeCols(); render(); fit();
  });

  ui.pageSize.onchange=()=>{ S.view.size=Number(ui.pageSize.value)||10; S.view.page=1; render(); fit(); };
  ui.pgPrev.onclick=()=>{ if(S.view.page>1){ S.view.page--; render(); fit(); } };
  ui.pgNext.onclick=()=>{ const pages=Math.max(1,Math.ceil(filteredAndSorted().length/S.view.size)); if(S.view.page<pages){ S.view.page++; render(); fit(); } };

  [ui.fTitle,ui.fAss,ui.fStage,ui.fDeal,ui.fKey,ui.fUrl,ui.fTariff,ui.fProduct].forEach(inp=>{
    if(!inp) return;
    inp.addEventListener('input',()=>{
      S.filter={ title:ui.fTitle?.value?.toLowerCase()||'', ass:ui.fAss?.value?.toLowerCase()||'', stage:ui.fStage?.value?.toLowerCase()||'', deal:ui.fDeal?.value?.toLowerCase()||'',
                 key:ui.fKey?.value?.toLowerCase()||'', url:ui.fUrl?.value?.toLowerCase()||'', tariff:ui.fTariff?.value?.toLowerCase()||'', product:ui.fProduct?.value?.toLowerCase()||'' };
      S.view.page=1; render(); fit();
    });
  });

  ui.head.addEventListener('click',e=>{
    const th=e.target.closest('th[data-col]'); if(!th||e.target.classList.contains('resizer')) return;
    const map={deal:'dealid',key:'key',url:'url',tariff:'tariff',tEnd:'tEnd',mEnd:'mEnd',product:'product'};
    const key=th.getAttribute('data-col'); const sortKey = ({id:'id',title:'title',ass:'ass',stage:'stage',act:'id'})[key] || map[key] || 'id';
    S.view.sortKey===sortKey ? (S.view.sortDir=S.view.sortDir==='asc'?'desc':'asc') : (S.view.sortKey=sortKey,S.view.sortDir='asc');
    render(); fit();
  });
}

