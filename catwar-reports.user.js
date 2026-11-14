// ==UserScript==
// @name         CatWar Reports
// @namespace    https://github.com/kindasignum/kindareports
// @version      0.1.6
// @description  Автоматизация отчётов в блогах CatWar (модульная система)
// @author       kindasignum / 207302
// @match        https://catwar.net/*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      raw.githubusercontent.com
// @connect      localhost
// @connect      cdn.jsdelivr.net
// @updateURL    https://cdn.jsdelivr.net/gh/kindasignum/kindareports@main/catwar-reports.user.js
// @downloadURL  https://cdn.jsdelivr.net/gh/kindasignum/kindareports@main/catwar-reports.user.js
//
// @require      https://cdn.jsdelivr.net/gh/kindasignum/kindareports@v0.1.6/src/core.js
// @require      https://cdn.jsdelivr.net/gh/kindasignum/kindareports@v0.1.6/src/modules/blog49798.js
// @require      https://cdn.jsdelivr.net/gh/kindasignum/kindareports@v0.1.6/src/modules/cw3.js
// ==/UserScript==

(function () {
  'use strict';
  window.CWReports.start();
})();