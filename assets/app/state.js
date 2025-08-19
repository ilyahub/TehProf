// Единый объект состояния

import { COL_ORDER } from './config.js';

export const S = {
  dealId: null,                    // текущая сделка
  field: null,                     // код UF поля в сделке, где лежат связи/ID
  typeId: null,                    // entityTypeId SPA
  mode: 'ids',                     // 'ids' | 'bindings'
  // данные
  bindings: [],
  ids: [],
  items: [],
  users: {},                       // { [userId]: {name, path} }
  ufEnums: {},                     // словари enumeration по UF коду
  stagesByFull: {},                // id -> {id,name,sort,categoryId,statusId}
  stagesByCatStatus: {},           // "categoryId:statusId" -> stage
  catStages: {},                   // categoryId -> [{id,name,sort,statusId}]
  cats: {},                        // categoryId -> {maxSort}
  // вид и фильтры
  view: { page: 1, size: 10, sortKey: 'id', sortDir: 'asc' },
  filter: { title:'', ass:'', stage:'', deal:'', key:'', url:'', tariff:'', product:'' },
  cols: JSON.parse(localStorage.getItem('cols_v1') || 'null') || COL_ORDER.slice(),
  widths: JSON.parse(localStorage.getItem('widths_v1') || '{}'),
};

// для map UF_* -> ufCrm*
export function setUfKeyMap(map) {
  window.__UF_KEYMAP = map; // простой глобал чтобы util.UF видел
}
