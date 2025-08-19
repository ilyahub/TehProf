// assets/app/config.js
// Единая точка правды для кодов сущностей, полей и настроек UI.

// --- Идентификаторы сущностей ---
export const SMART_ENTITY_TYPE_ID = 1032;                  // ID смарт-процесса "Лицензии"

// В СДЕЛКЕ (crm.deal) поле, где хранятся связанные ID лицензий.
// Ты писал, что это UF_CRM_1755533553 — оставляю его:
export const DEAL_FIELD_CODE = 'UF_CRM_1755533553';

// --- Коды стандартных полей элемента смарт-процесса ---
export const F = {
  ID: 'id',
  TITLE: 'title',
  ASSIGNED_BY_ID: 'assignedById',
  STAGE_ID: 'stageId',

  // Пользовательские поля смарт-процесса (то, что приходит как ufCrm10_*)
  UF: {
    DEAL_ORIGIN_ID:   'ufCrm10_1717328665682', // ID исходной сделки
    LICENSE_KEY:      'ufCrm10_1717328730625', // Лицензионный ключ
    PORTAL_URL:       'ufCrm10_1717328814784', // Адрес портала (url)
    TARIFF:           'ufCrm10_1717329015552', // Текущий тариф (enumeration)
    TARIFF_END_DATE:  'ufCrm10_1717329087589', // Дата окончания тарифа (date)
    MARKET_END_DATE:  'ufCrm10_1717329109963', // Дата окончания подписки (date)
    PRODUCT:          'ufCrm10_1717329453779', // Продукт (enumeration)
  },
};

// Карта “красивых” колонок → фактические поля (для ui/main)
export const COL_TO_FIELD = {
  id:       F.ID,
  title:    F.TITLE,
  ass:      F.ASSIGNED_BY_ID,
  stage:    F.STAGE_ID,

  deal:     F.UF.DEAL_ORIGIN_ID,
  key:      F.UF.LICENSE_KEY,
  url:      F.UF.PORTAL_URL,
  tariff:   F.UF.TARIFF,
  tEnd:     F.UF.TARIFF_END_DATE,
  mEnd:     F.UF.MARKET_END_DATE,
  product:  F.UF.PRODUCT,
};

// По этим UF строим словари перечислений (enum) и форматирование дат
export const ENUM_FIELDS = [ F.UF.TARIFF, F.UF.PRODUCT ];
export const DATE_FIELDS = [ F.UF.TARIFF_END_DATE, F.UF.MARKET_END_DATE ];

// --- Пагинация/видимость ---
export const PAGE_SIZES = [10, 30, 50, 100];
export const DEFAULT_PAGE_SIZE = 30;

// Колонки, которые показываем по умолчанию (но порядок потом
// может переупорядочить reorder.js / UI)
export const DEFAULT_COLUMNS = [
  'id', 'title', 'ass',          // «шапочные» три
  'stage', 'deal', 'key', 'url',
  'tariff', 'tEnd', 'mEnd', 'product', 'act',
];

// Какие колонки вообще существуют (для окна «Колонки»)
export const ALL_COLUMNS = [
  'id', 'title', 'ass',
  'stage', 'deal', 'key', 'url',
  'tariff', 'tEnd', 'mEnd', 'product', 'act',
];

// Человекочитаемые заголовки для UI
export const COL_TITLES = {
  id: 'ID',
  title: 'Название',
  ass: 'Ответственный',
  stage: 'Стадия',
  deal: 'ID исходной сделки',
  key: 'Лицензионный ключ',
  url: 'Адрес портала',
  tariff: 'Текущий тариф',
  tEnd: 'Окончание тарифа',
  mEnd: 'Окончание подписки',
  product: 'Продукт',
  act: 'Действия',
};
