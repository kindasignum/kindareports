// ==UserScript==
// @name         CatWar Reports
// @namespace    https://github.com/YOUR_USER/catwar-reports
// @version      0.1.3
// @description  Автоматизация отчётов в блогах CatWar (модульная система)
// @author       you
// @match        https://catwar.net/*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      raw.githubusercontent.com
// @connect      localhost
// @connect      cdn.jsdelivr.net
// @updateURL    https://cdn.jsdelivr.net/gh/YOUR_USER/catwar-reports@main/catwar-reports.user.js
// @downloadURL  https://cdn.jsdelivr.net/gh/YOUR_USER/catwar-reports@main/catwar-reports.user.js
//
// Порядок @require важен: сначала ядро, потом модули блогов.
// Для стабильности закрепляйте версию тегом (@v0.1.0) или хэшем коммита —
// ссылки на ветку (@main) jsDelivr кэширует до ~12 часов.
// @require      https://cdn.jsdelivr.net/gh/YOUR_USER/catwar-reports@v0.1.0/src/core.js
// @require      https://cdn.jsdelivr.net/gh/YOUR_USER/catwar-reports@v0.1.0/src/modules/blog49798.js
// ==/UserScript==

(function () {
  'use strict';
  window.CWReports.start();
})();
