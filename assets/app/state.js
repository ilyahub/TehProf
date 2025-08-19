import { CONFIG } from './config.js';
import { pick } from './utils.js';
import { call, callBatch } from './api.js';

export const S = {
  dealId: null,
  field: CONFIG.DEAL_FIELD_CODE,
  typeId: CONFIG.SMART_ENTITY_TYPE_ID,
  mode: 'ids',
  bindings: [],
  ids: [],
  items: [],
  users: {},
  ufEnums: {},
  stagesByFull: {},
  stagesByCatStatus: {},
  catStages: {},
  cats: {},
  view:{page:1,size:10,sortKey:'id',sortDir:'asc'},
  filter:{title:'',ass:'',stage:'',deal:'',key:'',url:'',tariff:'',product:''},
  cols: JSON.parse(localStorage.getItem('cols_v1')||'null')
      || ['stage','deal','key','url','tariff','tEnd','mEnd','product','act'],
  widths: JSON.parse(localStorage.getItem('widths_v1')||'{}'),
};

export function detectMode(raw){
  const a = Array.isArray(raw)?raw:[raw].filter(Boolean);
  return a.some(v => typeof v==='string' && v.startsWith('DYNAMIC_')) ? 'bindings' : 'ids';
}

// заглушки загрузчиков — наполним позже
export async function loadDealAndItems() { /* TODO: перенесём сюда вашу load() */ }
export async function buildUFEnums(){ /* TODO */ }
export async function buildUsers(items){ /* TODO */ }
export async function buildStages(items){ /* TODO */ }
