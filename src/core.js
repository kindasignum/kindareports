/**
 * CatWar Reports — основной модуль.
 *  - хранилище (localStorage, префикс cwr:)
 *  - определение и сохранение ID игрока
 *  - реестр модулей блогов и их монтирование (сайт — SPA, поэтому через MutationObserver)
 *  - общий UI: кнопка под полем комментария, модальное окно, вставка текста в комментарий
 */
(function (global) {
  'use strict';
  if (global.CWReports) return;

  const VERSION = '0.1.5';
  const log = (...a) => console.log('[CWReports]', ...a);
  // Окно самой страницы: при @grant GM_* скрипт работает в песочнице, и глобалы сайта (my) лежат в unsafeWindow.
  const pageWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : global;
  const modules = [];

  /* ---------- storage ---------- */
  const PREFIX = 'cwr:';
  const storage = {
    get(key, def = null) {
      try {
        const v = localStorage.getItem(PREFIX + key);
        return v === null ? def : JSON.parse(v);
      } catch (e) { return def; }
    },
    set(key, value) {
      try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch (e) { /* ignore */ }
    },
    remove(key) {
      try { localStorage.removeItem(PREFIX + key); } catch (e) { /* ignore */ }
    },
  };

  /* ---------- user id ---------- */
  const USER_ID_KEY = 'userId';

  /** Ищет ID: <b id="id_val"> на главной, иначе глобальный my.id (есть на страницах блогов). */
  function detectUserId() {
    let id = null;
    const node = document.getElementById('id_val');
    if (node) id = node.textContent.trim();
    if (!/^\d+$/.test(id || '') && pageWindow.my && pageWindow.my.id) id = String(pageWindow.my.id);
    if (/^\d+$/.test(id || '') && storage.get(USER_ID_KEY) !== id) storage.set(USER_ID_KEY, id);
    return id;
  }
  const getUserId = () => storage.get(USER_ID_KEY);

  /* ---------- data (JSON из репозитория) ---------- */
  // Откуда брать json-файлы. Можно переопределить на время разработки:
  //   CWReports.storage.set('dataBase', 'http://localhost:8000/data/')
  //   CWReports.storage.remove('dataBase')   // вернуть значение по умолчанию
  const DEFAULT_DATA_BASE = 'https://raw.githubusercontent.com/kindasignum/kindareports/main/src/modules/';

  const data = {
    baseUrl: () => storage.get('dataBase') || DEFAULT_DATA_BASE,

    /** GET текста: через GM_xmlhttpRequest (обходит CORS), иначе через fetch. */
    request(url, timeout = 8000) {
      return new Promise((resolve, reject) => {
        const gm = null; // временно: отключаем GM_xmlhttpRequest для проверки
        if (gm) {
          gm({
            method: 'GET', url, timeout,
            onload: r => (r.status >= 200 && r.status < 300 ? resolve(r.responseText) : reject(new Error('HTTP ' + r.status))),
            onerror: () => reject(new Error('network error')),
            ontimeout: () => reject(new Error('timeout')),
          });
        } else {
          fetch(url, { cache: 'no-cache' })
            .then(r => (r.ok ? r.text() : Promise.reject(new Error('HTTP ' + r.status))))
            .then(resolve, reject);
        }
      });
    },

    /**
     * Загружает JSON-файл из data/. При ошибке отдаёт последнюю удачную копию из localStorage.
     * @returns {Promise<{json:any, source:'network'|'cache'}>}  (reject — если нет ни сети, ни копии)
     */
    async loadJSON(name, validate) {
      const url = data.baseUrl() + name;
      const cacheKey = 'cache:' + name;
      try {
        const json = JSON.parse(await data.request(`${url}?t=${Date.now()}`));
        if (validate) validate(json);
        storage.set(cacheKey, json);
        return { json, source: 'network' };
      } catch (e) {
        log(`не удалось загрузить ${url}: ${e.message}`);
        const cached = storage.get(cacheKey);
        if (cached) return { json: cached, source: 'cache' };
        throw e;
      }
    },
  };

  /* ---------- utils ---------- */
  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) node.setAttribute(k, v);
    }
    [].concat(children).forEach(c => c != null && node.append(c));
    return node;
  }

  const pad2 = n => String(n).padStart(2, '0');
  const dateUtils = {
    /** Date -> 'YYYY-MM-DD' (локальное время) */
    toISO: d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
    /** 'YYYY-MM-DD' -> Date (локальное время, без сдвига часовых поясов) */
    fromISO(s) {
      const [y, m, d] = s.split('-').map(Number);
      return new Date(y, m - 1, d);
    },
    addDays(iso, delta) {
      const d = dateUtils.fromISO(iso);
      d.setDate(d.getDate() + delta);
      return dateUtils.toISO(d);
    },
    /** 'YYYY-MM-DD' -> 'дд.мм.гг' */
    format(iso) {
      const d = dateUtils.fromISO(iso);
      return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${pad2(d.getFullYear() % 100)}`;
    },
  };

  /* ---------- styles ---------- */
  const CSS = `
  .cwr-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box}
  .cwr-modal{
    --cwr-rgb:var(--ds-info-rgb,163,134,96);
    --cwr-text:var(--ds-info-text,#000);
    --cwr-primary:var(--ds-primary,#291802);
    --cwr-on-accent:var(--ds-on-accent,#fff);
    --cwr-danger:var(--ds-danger,#B2241F);
    --cwr-input-bg:var(--ds-input-bg,#C0B4A5);
    --cwr-input-text:var(--ds-input-text,#000);
    --cwr-link-hover:var(--ds-info-link-hover,#774503);
    background:rgb(var(--cwr-rgb));color:var(--cwr-text);
    border:2px solid var(--cwr-primary);border-radius:15px;
    width:100%;max-width:520px;max-height:92vh;overflow:auto;box-sizing:border-box;
    box-shadow:0 10px 40px rgba(0,0,0,.5);font-family:Verdana,sans-serif;font-size:.9em;line-height:1.4}
  .cwr-modal__head{display:flex;align-items:center;justify-content:space-between;padding:12px 18px;border-bottom:1px solid rgba(0,0,0,.35);font-weight:bold;font-size:1.15em}
  .cwr-modal__close{border:0;background:none;font-size:24px;line-height:1;cursor:pointer;color:var(--cwr-primary);padding:0 4px}
  .cwr-modal__close:hover{color:var(--cwr-link-hover)}
  .cwr-modal__body{padding:14px 18px}
  .cwr-modal__foot{display:flex;justify-content:flex-end;gap:8px;padding:12px 18px;border-top:1px solid rgba(0,0,0,.35)}
  .cwr-field{margin:0 0 14px}
  .cwr-field>label,.cwr-label{display:block;font-weight:bold;margin-bottom:4px}
  .cwr-modal input[type=text],.cwr-modal input[type=date]{
    padding:5px 8px;border:1px solid var(--cwr-primary);border-radius:6px;box-sizing:border-box;
    background:var(--cwr-input-bg);color:var(--cwr-input-text);font-family:inherit;font-size:1em}
  .cwr-modal input[type=text]:hover,.cwr-modal input[type=date]:hover,
  .cwr-modal input[type=text]:focus,.cwr-modal input[type=date]:focus{border-color:var(--cwr-link-hover);outline:none}
  .cwr-modal input::placeholder{color:rgba(0,0,0,.55)}
  .cwr-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
  .cwr-hint{color:var(--cwr-danger);font-size:.85em;margin-top:4px;font-weight:bold}
  .cwr-btn{padding:5px 12px;border:1px solid var(--cwr-primary);border-radius:6px;background:rgba(255,255,255,.25);color:var(--cwr-primary);font-family:inherit;font-size:1em;cursor:pointer}
  .cwr-btn:hover{background:rgba(255,255,255,.45);color:var(--cwr-link-hover);border-color:var(--cwr-link-hover)}
  .cwr-btn--primary{background:var(--cwr-primary);color:var(--cwr-on-accent)}
  .cwr-btn--primary:hover{background:var(--cwr-link-hover);color:var(--cwr-on-accent)}
  table.cwr-items{border-collapse:separate;border-spacing:6px}
  table.cwr-items td{border:1px solid transparent;padding:0;vertical-align:top;text-align:center}
  .cwr-item{position:relative;width:70px;height:70px;cursor:pointer;user-select:none;border-radius:8px}
  .cwr-item img{width:70px;height:70px;display:block;opacity:.5;transition:opacity .1s}
  .cwr-item:hover img{opacity:.85}
  .cwr-item.is-active img{opacity:1}
  .cwr-item__count{position:absolute;right:2px;bottom:2px;min-width:20px;padding:0 5px;border-radius:10px;background:var(--cwr-primary);color:var(--cwr-on-accent);font-weight:bold;text-align:center}
  .cwr-item__minus{position:absolute;left:2px;top:2px;width:22px;height:22px;padding:0;border:0;border-radius:50%;background:var(--cwr-danger);color:var(--cwr-on-accent);font-weight:bold;line-height:22px;cursor:pointer}
  `;
  function injectStyle() {
    if (document.getElementById('cwr-style')) return;
    document.head.append(el('style', { id: 'cwr-style', text: CSS }));
  }

  /* ---------- UI ---------- */
  const ui = {
    /**
     * Добавляет кнопку справа от «Отправить» в форме комментария. Идемпотентна по id.
     * @returns {HTMLButtonElement|null}
     */
    addCommentButton({ id, label, onClick }) {
      if (document.getElementById(id)) return null;
      const form = document.getElementById('send_comment_form')
        || (document.getElementById('comment') && document.getElementById('comment').closest('form'));
      if (!form) { log('форма комментария не найдена'); return null; }

      const btn = el('button', { id, type: 'button', class: 'ui-btn', text: label, onclick: onClick });
      const submit = form.querySelector('input[type=submit], button[type=submit]');
      if (submit) {
        submit.after(document.createTextNode(' '), btn);
      } else {
        log('кнопка «Отправить» не найдена, добавляю в конец формы');
        form.append(btn);
      }
      log(`кнопка ${id} добавлена`);
      return btn;
    },

    /**
     * Открывает HTML-окно.
     * @param {{title:string, body:Node, applyLabel?:string, onApply:()=>(boolean|void)}} opts
     *        onApply возвращает false — окно остаётся открытым.
     */
    openModal({ title, body, applyLabel = 'Применить', onApply }) {
      injectStyle();
      document.querySelectorAll('.cwr-overlay').forEach(n => n.remove());

      const close = () => {
        overlay.remove();
        document.removeEventListener('keydown', onKey);
      };
      const onKey = e => { if (e.key === 'Escape') close(); };

      const overlay = el('div', {
        class: 'cwr-overlay',
        onmousedown: e => { if (e.target === overlay) close(); },
      }, el('div', { class: 'cwr-modal', role: 'dialog', 'aria-modal': 'true' }, [
        el('div', { class: 'cwr-modal__head' }, [
          el('span', { text: title }),
          el('button', { type: 'button', class: 'cwr-modal__close', title: 'Закрыть', text: '×', onclick: close }),
        ]),
        el('div', { class: 'cwr-modal__body' }, body),
        el('div', { class: 'cwr-modal__foot' }, [
          el('button', { type: 'button', class: 'cwr-btn', text: 'Отмена', onclick: close }),
          el('button', {
            type: 'button', class: 'cwr-btn cwr-btn--primary', text: applyLabel,
            onclick: () => { if (onApply() !== false) close(); },
          }),
        ]),
      ]));

      document.body.append(overlay);
      document.addEventListener('keydown', onKey);
      return close;
    },

    /** Вставляет текст в поле комментария (если там уже есть текст — добавляет с новой строки). */
    insertIntoComment(text) {
      const ta = document.getElementById('comment');
      if (!ta) return false;
      ta.value = ta.value.trim() ? `${ta.value.replace(/\s+$/, '')}\n\n${text}` : text;
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      ta.dispatchEvent(new Event('change', { bubbles: true }));
      ta.focus();
      return true;
    },
  };

  /* ---------- модули и запуск ---------- */
  function register(mod) {
    if (!mod || !mod.id || typeof mod.match !== 'function' || typeof mod.mount !== 'function') {
      console.error('[CWReports] некорректный модуль', mod);
      return;
    }
    modules.push(mod);
  }

  function tick() {
    detectUserId();
    for (const m of modules) {
      try { if (m.match(location)) m.mount(); }
      catch (e) { console.error(`[CWReports] ошибка в модуле ${m.id}`, e); }
    }
  }

  function start() {
    log(`v${VERSION} запущен, модулей: ${modules.length} (${modules.map(m => m.id).join(', ')})`);
    injectStyle();
    tick();
    let timer = null;
    const schedule = () => { clearTimeout(timer); timer = setTimeout(tick, 150); };
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
    addEventListener('popstate', schedule);
    addEventListener('hashchange', schedule);
  }

  global.CWReports = { register, start, storage, data, getUserId, detectUserId, ui, el, dateUtils, modules };
})(window);
