// Константы проекта (SPA "Лицензии")
export const DEAL_LINK_FIELD = 'UF_CRM_1755533553';   // множественное поле связей/ID в сделке
export const SMART_ENTITY_TYPE_ID = 1032;             // entityTypeId смарт-процесса
export const PORTAL_ORIGIN = 'https://tehprof.bitrix24.kz';

// UF-поля смарт-процесса
export const F = {
  dealIdSource: 'UF_CRM_10_1717328665682', // ID исходной сделки (number)
  licenseKey  : 'UF_CRM_10_1717328730625', // Лицензионный ключ (string)
  portalUrl   : 'UF_CRM_10_1717328814784', // Адрес портала (url)
  tariff      : 'UF_CRM_10_1717329015552', // Текущий тариф (list)
  tariffEnd   : 'UF_CRM_10_1717329087589', // Дата окончания тарифа (date)
  marketEnd   : 'UF_CRM_10_1717329109963', // Дата окончания подписки (date)
  product     : 'UF_CRM_10_1717329453779', // Продукт (list)
};

// Метки столбцов и порядок
export const COL_ORDER = [
  'id', 'title', 'ass', 'stage',
  'deal', 'key', 'url', 'tariff', 'tEnd', 'mEnd', 'product', 'act'
];

export const COL_LABEL = {
  id:'ID',
  title:'Название',
  ass:'Ответственный',
  stage:'Стадия',
  deal:'ID исходной сделки',
  key:'Лицензионный ключ',
  url:'Адрес портала',
  tariff:'Текущий тариф',
  tEnd:'Окончание тарифа',
  mEnd:'Окончание подписки',
  product:'Продукт',
  act:'Действия'
};
