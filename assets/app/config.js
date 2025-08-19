// assets/app/config.js
export const DEAL_FIELD_CODE = 'UF_CRM_1755533553';  // множественное поле связей в сделке
export const SMART_ENTITY_TYPE_ID = 1032;            // ID вашего смарт-процесса

// UF-поля смарт-процесса «Лицензии»
export const F = {
  dealIdSource: 'UF_CRM_10_1717328665682', // ID исходной сделки (number)
  licenseKey  : 'UF_CRM_10_1717328730625', // Лицензионный ключ (string)
  portalUrl   : 'UF_CRM_10_1717328814784', // Адрес портала (url)
  tariff      : 'UF_CRM_10_1717329015552', // Текущий тариф (list)
  tariffEnd   : 'UF_CRM_10_1717329087589', // Дата окончания тарифа (date)
  marketEnd   : 'UF_CRM_10_1717329109963', // Дата окончания подписки (date)
  product     : 'UF_CRM_10_1717329453779', // Продукт (list)
};
