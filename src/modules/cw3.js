/**
 * Корневой модуль «Игровая» — https://catwar.net/cw3/
 *  - кнопка (+) в тултипе игрока: добавить / убрать из списка отчёта
 *  - список сохраняется в localStorage (cwr:players)
 *  - кнопка «👥 Игроки (N)» в верхней панели: просмотр, удаление, очистка
 *  - API для модулей блогов: CWReports.players
 */
(function () {
  'use strict';
  const R = window.CWReports;
  if (!R) { console.error('[cw3] не найден CWReports — проверьте порядок @require'); return; }

  const { el, storage } = R;
  const KEY = 'players';

  /* ---------- API списка игроков ---------- */
  const listeners = new Set();
  const players = {
    /** @returns {{id:string,name:string,added:number}[]} */
    list: () => storage.get(KEY, []),
    has: id => players.list().some(p => p.id === String(id)),
    add(id, name) {
      id = String(id);
      const list = players.list();
      if (list.some(p => p.id === id)) return false;
      list.push({ id, name: name || `#${id}`, added: Date.now() });
      storage.set(KEY, list);
      players._emit();
      return true;
    },
    remove(id) {
      storage.set(KEY, players.list().filter(p => p.id !== String(id)));
      players._emit();
    },
    clear() { storage.set(KEY, []); players._emit(); },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    _emit() { listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } }); },
  };
  R.players = players;

  // Синхронизация между вкладками
  addEventListener('storage', e => { if (e.key === 'cwr:' + KEY) players._emit(); });

  /* ---------- стили ---------- */
  const CSS = `
  .cwr-add{margin-left:6px;padding:0 6px;border:1px solid #291802;border-radius:6px;background:rgba(255,255,255,.7);color:#291802;font:bold 12px/18px Verdana,sans-serif;cursor:pointer;vertical-align:middle}
  .cwr-add:hover{background:#fff;color:#774503;border-color:#774503}
  .cwr-add.is-added{background:#659a4e;color:#fff;border-color:#4a7538}
  .cwr-add.is-added:hover{background:#B2241F;border-color:#B2241F}
  .cwr-topbtn{cursor:pointer}
  .cwr-topbtn b{font-weight:bold}
  .cwr-plist{list-style:none;margin:0;padding:0}
  .cwr-plist li{display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid rgba(0,0,0,.2)}
  .cwr-plist li:last-child{border-bottom:0}
  .cwr-plist .cwr-pname{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:bold}
  .cwr-plist .cwr-pname a{color:inherit}
  .cwr-plist .cwr-pid{opacity:.7;font-size:.85em}
  .cwr-plist .cwr-del{width:22px;height:22px;padding:0;border:0;border-radius:50%;background:var(--cwr-danger,#B2241F);color:#fff;font-weight:bold;cursor:pointer}
  .cwr-empty{opacity:.7;text-align:center;padding:12px 0}
  `;
  function injectStyle() {
    if (document.getElementById('cwr-cw3-style')) return;
    document.head.append(el('style', { id: 'cwr-cw3-style', text: CSS }));
  }

  /* ---------- кнопка (+) в тултипе ---------- */
  function parseCat(tooltip) {
    const a = tooltip.querySelector('a[href^="/cat"]');
    const m = a && a.getAttribute('href').match(/^\/cat(\d+)/);
    return m ? { id: m[1], name: a.textContent.trim() } : null;
  }

  function paintButton(btn) {
    const added = players.has(btn.dataset.id);
    btn.classList.toggle('is-added', added);
    btn.textContent = added ? '✓' : '+';
    btn.title = added ? 'В списке отчёта — нажмите, чтобы убрать' : 'Добавить в отчёт';
  }

  function mountButtons() {
    document.querySelectorAll('span.cat_tooltip').forEach(tip => {
      if (tip.querySelector('.cwr-add')) return;
      const cat = parseCat(tip);
      if (!cat) return;
      const btn = el('button', { type: 'button', class: 'cwr-add', 'data-id': cat.id });
      const stop = e => { e.stopPropagation(); };
      btn.addEventListener('mousedown', stop);
      btn.addEventListener('click', e => {
        e.preventDefault(); e.stopPropagation();
        if (players.has(cat.id)) players.remove(cat.id);
        else players.add(cat.id, cat.name);
      });
      paintButton(btn);
      const u = tip.querySelector('u');
      if (u) u.after(btn); else tip.prepend(btn);
    });
  }

  function refreshButtons() {
    document.querySelectorAll('.cwr-add').forEach(paintButton);
  }

  /* ---------- кнопка в верхней панели и окно списка ---------- */
  function openList() {
    const box = el('div');
    const render = () => {
      const list = players.list();
      box.replaceChildren(
        list.length
          ? el('ul', { class: 'cwr-plist' }, list.map(p => el('li', {}, [
              el('span', { class: 'cwr-pname' }, el('a', { href: `/cat${p.id}`, target: '_blank', text: p.name })),
              el('span', { class: 'cwr-pid', text: p.id }),
              el('button', { type: 'button', class: 'cwr-del', title: 'Убрать', text: '×', onclick: () => players.remove(p.id) }),
            ])))
          : el('div', { class: 'cwr-empty', text: 'Список пуст. Наведите на игрока и нажмите (+).' }),
        list.length
          ? el('div', { style: 'margin-top:10px;text-align:right' },
              el('button', { type: 'button', class: 'cwr-btn', text: 'Очистить всё', onclick: () => { if (confirm('Удалить всех игроков из списка?')) players.clear(); } }))
          : null,
      );
    };
    render();
    const off = players.onChange(render);
    const close = R.ui.openModal({ title: 'Игроки для отчёта', body: box, applyLabel: 'Закрыть', onApply() {} });
    // отписка при закрытии окна
    const watcher = new MutationObserver(() => {
      if (!document.body.contains(box)) { off(); watcher.disconnect(); }
    });
    watcher.observe(document.body, { childList: true });
    return close;
  }

  function updateCounter() {
    const c = document.getElementById('cwr-topbtn-count');
    if (c) c.textContent = players.list().length;
  }

  function mountTopbarButton() {
    if (document.getElementById('cwr-topbtn')) return;
    const nav = document.querySelector('.game-topbar-nav');
    if (!nav) return;
    const btn = el('a', { id: 'cwr-topbtn', href: '#', class: 'cwr-topbtn', title: 'Игроки для отчёта', onclick: e => { e.preventDefault(); openList(); } }, [
      document.createTextNode('👥 Игроки ('),
      el('span', { id: 'cwr-topbtn-count', text: String(players.list().length) }),
      document.createTextNode(')'),
    ]);
    nav.append(' ', btn);
  }

  players.onChange(() => { refreshButtons(); updateCounter(); });

  R.register({
    id: 'cw3',
    match: loc => /^\/cw3(\/|$)/.test(loc.pathname),
    mount() {
      injectStyle();
      mountTopbarButton();
      mountButtons();
    },
  });
})();
