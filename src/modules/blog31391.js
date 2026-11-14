/**
 * Блог «Блог добытчиков» — https://catwar.net/blog31391
 * Отчёт об охоте.
 *
 * Шаблон:
 *   [b]ЧЧ:ММ, дд.мм.гг
 *   Ходили на охоту:[/b] [catID] (обычные + упитанные), ...
 *
 * Роли: охотник, носильщик, пара тамаши (ведущий + [ведомый]), ИС, БС, гость.
 * Игроки берутся из списка CWReports.players (его наполняет модуль cw3).
 */
(function () {
  'use strict';
  const R = window.CWReports;
  if (!R) { console.error('[blog31391] не найден CWReports — проверьте порядок @require'); return; }

  const BLOG_ID = 31391;
  const { el, dateUtils, storage } = R;
  const SEPARATOR = ', ';

  // Время охот (МСК), в порядке показа
  const SLOT_HOURS = [10, 12, 14, 17, 20, 22, 0, 1, 2, 3, 4, 5, 6];
  const SLOTS = SLOT_HOURS.map(h => h * 60);
  const pad2 = n => String(n).padStart(2, '0');
  const fmtTime = m => `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;

  /** Текущие дата и минуты суток по Москве. */
  function mskNow() {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date());
    const g = t => parts.find(p => p.type === t).value;
    return { iso: `${g('year')}-${g('month')}-${g('day')}`, minutes: Number(g('hour')) * 60 + Number(g('minute')) };
  }

  /** Ближайший слот (по кругу суток) и сдвиг даты, если слот попал на соседние сутки. */
  function nearestSlot(now) {
    let best = null;
    for (const s of SLOTS) {
      const diff = ((s - now + 720 + 1440) % 1440) - 720; // (-720; 720]
      if (!best || Math.abs(diff) < Math.abs(best.diff)) best = { slot: s, diff };
    }
    const t = now + best.diff;
    return { slot: best.slot, dayShift: t >= 1440 ? 1 : t < 0 ? -1 : 0 };
  }

  /* ---------- стили ---------- */
  const CSS = `
  .cwh-hunt{display:grid;grid-template-columns:200px 1fr;gap:12px;margin-top:4px}
  @media(max-width:700px){.cwh-hunt{grid-template-columns:1fr}}
  .cwh-zone{margin:0 0 10px;padding:6px 8px;border:2px dashed rgba(0,0,0,.35);border-radius:8px;min-height:44px;box-sizing:border-box}
  .cwh-zone.is-over{border-color:var(--cwr-link-hover);background:rgba(255,255,255,.25)}
  .cwh-zone__title{font-weight:bold;margin-bottom:4px}
  .cwh-zone__body{display:flex;flex-wrap:wrap;gap:6px}
  .cwh-note{opacity:.6;font-size:.85em;padding:2px 0}
  .cwh-chip{border:1px solid var(--cwr-primary);border-radius:8px;background:rgba(255,255,255,.4);padding:3px 6px;box-sizing:border-box}
  .cwh-chip.is-selected{outline:2px solid var(--cwr-link-hover);background:rgba(255,255,255,.7)}
  .cwh-chip__head{display:flex;align-items:center;gap:6px;cursor:grab;user-select:none;font-weight:bold}
  .cwh-chip__name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .cwh-chip__x{width:18px;height:18px;padding:0;border:0;border-radius:50%;background:var(--cwr-danger);color:var(--cwr-on-accent);font-weight:bold;line-height:18px;cursor:pointer}
  .cwh-chip__row{display:flex;align-items:center;gap:4px;margin-top:3px}
  .cwh-num,.cwh-sel,.cwh-id{padding:3px 4px;border:1px solid var(--cwr-primary);border-radius:6px;background:var(--cwr-input-bg);color:var(--cwr-input-text);font:inherit;box-sizing:border-box}
  .cwh-num{width:48px}
  .cwh-id{width:100px}
  .cwh-pair{display:flex;flex-wrap:wrap;gap:6px;align-items:flex-start;margin-bottom:6px;padding-bottom:6px;border-bottom:1px solid rgba(0,0,0,.2)}
  .cwh-slot{flex:1;min-width:150px;padding:4px;border:2px dashed rgba(0,0,0,.3);border-radius:8px;min-height:40px;box-sizing:border-box}
  .cwh-slot.is-over{border-color:var(--cwr-link-hover);background:rgba(255,255,255,.25)}
  .cwh-slot__label{font-size:.8em;opacity:.7;margin-bottom:2px}
  .cwh-preview{margin:0;padding:8px;border:1px solid rgba(0,0,0,.35);border-radius:8px;background:rgba(255,255,255,.25);white-space:pre-wrap;word-break:break-word;font-family:inherit;font-size:.95em}
  .cwh-check{display:flex;align-items:center;gap:6px;margin:10px 0 0;font-weight:bold;cursor:pointer}
  `;
  function injectStyle() {
    if (document.getElementById('cwr-b31391-style')) return;
    document.head.append(el('style', { id: 'cwr-b31391-style', text: CSS }));
  }

  const ZONES = [
    { key: 'hunter', title: 'Охотники', mode: 'catch' },
    { key: 'carrier', title: 'Носильщики', mode: 'carrier' },
    { key: 'is', title: 'ИС (переходящие)', mode: 'catch' },
    { key: 'bs', title: 'БС (отрабатывают баллы тьмы)', mode: 'catch' },
    { key: 'guest', title: 'Гости (в отчёте — просто «гость»)', mode: 'plain' },
  ];

  /* ---------- форма ---------- */
  function openForm() {
    injectStyle();
    const now = mskNow();
    const near = nearestSlot(now.minutes);
    const state = {
      date: dateUtils.addDays(now.iso, near.dayShift),
      time: near.slot,
      all: (R.players ? R.players.list() : []).map(p => ({ id: String(p.id), name: p.name })),
      zones: { hunter: [], carrier: [], is: [], bs: [], guest: [] },
      pairs: [{ lead: null, follow: null }],
      catches: {},
      genders: storage.get('carrierGender', {}),
      selected: null,
    };
    let dragId = null;

    const byId = id => state.all.find(p => p.id === id);
    const catchOf = id => state.catches[id] || (state.catches[id] = { n: 0, f: 0 });
    const genderOf = id => state.genders[id] || 'относил';
    const placedIds = () => [
      ...Object.values(state.zones).flat(),
      ...state.pairs.flatMap(p => [p.lead, p.follow]).filter(Boolean),
    ];

    function detach(id) {
      for (const k in state.zones) state.zones[k] = state.zones[k].filter(x => x !== id);
      state.pairs.forEach(p => { if (p.lead === id) p.lead = null; if (p.follow === id) p.follow = null; });
    }
    /** target: {zone:'pool'|ключ роли} или {pair:индекс, slot:'lead'|'follow'} */
    function place(id, target) {
      detach(id);
      if (target.zone && target.zone !== 'pool') state.zones[target.zone].push(id);
      else if (target.pair != null) state.pairs[target.pair][target.slot] = id;
      state.selected = null;
      renderAll();
    }

    /* --- текст отчёта --- */
    const tag = id => `[cat${id}]`;
    const nums = id => { const c = catchOf(id); return `(${c.n} + ${c.f})`; };
    function collect() {
      const out = [];
      state.zones.hunter.forEach(id => out.push(`${tag(id)} ${nums(id)}`));
      state.zones.carrier.forEach(id => out.push(`${tag(id)} (${genderOf(id)})`));
      state.pairs.forEach(p => {
        if (p.lead) out.push(`${tag(p.lead)} ${nums(p.lead)}` + (p.follow ? ` [${tag(p.follow)} ${nums(p.follow)}]` : ''));
      });
      state.zones.is.forEach(id => out.push(`${tag(id)} ${nums(id)} [ИС]`));
      state.zones.bs.forEach(id => out.push(`${tag(id)} ${nums(id)} [БС]`));
      state.zones.guest.forEach(() => out.push('гость'));
      return out;
    }
    const buildReport = entries =>
      `[b]${fmtTime(state.time)}, ${dateUtils.format(state.date)}\nХодили на охоту:[/b] ${entries.join(SEPARATOR)}`;

    /* --- дата и время --- */
    const dateInput = el('input', { type: 'date', value: state.date, onchange: e => { if (e.target.value) state.date = e.target.value; updatePreview(); } });
    const setDate = iso => { state.date = iso; dateInput.value = iso; updatePreview(); };
    const timeSel = el('select', { class: 'cwh-sel', onchange: e => { state.time = Number(e.target.value); updatePreview(); } },
      SLOTS.map(s => el('option', { value: s, text: fmtTime(s), selected: s === state.time })));
    const whenField = el('div', { class: 'cwr-field' }, [
      el('label', { text: 'Дата и время (МСК)' }),
      el('div', { class: 'cwr-row' }, [
        el('button', { type: 'button', class: 'cwr-btn', text: '−1 день', onclick: () => setDate(dateUtils.addDays(state.date, -1)) }),
        dateInput,
        el('button', { type: 'button', class: 'cwr-btn', text: '+1 день', onclick: () => setDate(dateUtils.addDays(state.date, 1)) }),
        el('button', { type: 'button', class: 'cwr-btn', text: 'Сегодня', onclick: () => setDate(mskNow().iso) }),
        timeSel,
      ]),
    ]);

    /* --- drag & drop + запасной клик (выбрать игрока → клик по роли) --- */
    function makeDrop(node, target) {
      node.addEventListener('dragover', e => { if (dragId) { e.preventDefault(); node.classList.add('is-over'); } });
      node.addEventListener('dragleave', () => node.classList.remove('is-over'));
      node.addEventListener('drop', e => {
        e.preventDefault(); node.classList.remove('is-over');
        const id = dragId; dragId = null;
        if (id) place(id, target);
      });
      node.addEventListener('click', e => {
        if (state.selected && !e.target.closest('.cwh-chip')) place(state.selected, target);
      });
      return node;
    }

    function chip(id, mode, inPool) {
      const p = byId(id);
      const head = el('div', { class: 'cwh-chip__head', draggable: 'true', title: `ID ${id}` }, [
        el('span', { class: 'cwh-chip__name', text: p.name }),
        inPool ? null : el('button', { type: 'button', class: 'cwh-chip__x', title: 'Вернуть в список', text: '×', onclick: e => { e.stopPropagation(); place(id, { zone: 'pool' }); } }),
      ]);
      head.addEventListener('dragstart', e => { dragId = id; e.dataTransfer.setData('text/plain', id); e.dataTransfer.effectAllowed = 'move'; });
      head.addEventListener('dragend', () => { dragId = null; });

      const c = el('div', { class: 'cwh-chip' + (state.selected === id ? ' is-selected' : '') }, head);
      c.addEventListener('click', e => {
        if (e.target.closest('input,select,button')) return;
        e.stopPropagation();
        state.selected = state.selected === id ? null : id;
        renderAll();
      });

      if (mode === 'catch') {
        const cn = catchOf(id);
        const num = (key, title) => {
          const inp = el('input', { type: 'number', min: 0, class: 'cwh-num', title, value: cn[key] });
          inp.addEventListener('input', () => { cn[key] = Math.max(0, parseInt(inp.value, 10) || 0); updatePreview(); });
          return inp;
        };
        c.append(el('div', { class: 'cwh-chip__row' }, [num('n', 'Обычные'), ' + ', num('f', 'Упитанные')]));
      } else if (mode === 'carrier') {
        const sel = el('select', { class: 'cwh-sel', onchange: e => {
          state.genders[id] = e.target.value; storage.set('carrierGender', state.genders); updatePreview();
        } }, ['относил', 'относила'].map(g => el('option', { value: g, text: g, selected: g === genderOf(id) })));
        c.append(el('div', { class: 'cwh-chip__row' }, sel));
      }
      return c;
    }

    /* --- отрисовка --- */
    const root = el('div');
    const preview = el('pre', { class: 'cwh-preview' });
    const hint = el('div', { class: 'cwr-hint' });
    const idAdd = el('input', { type: 'text', class: 'cwh-id', inputmode: 'numeric', placeholder: 'ID кота' });
    const removeChk = el('input', { type: 'checkbox', id: 'cwh-remove' });
    removeChk.checked = storage.get('removeUsed', true) !== false;

    function updatePreview() {
      const entries = collect();
      preview.textContent = entries.length ? buildReport(entries) : '— (добавьте игроков в роли) —';
    }

    function renderPool() {
      const placed = new Set(placedIds());
      const free = state.all.filter(p => !placed.has(p.id));
      const body = el('div', { class: 'cwh-zone__body', style: 'flex-direction:column' },
        free.length ? free.map(p => chip(p.id, 'pool', true))
          : el('div', { class: 'cwh-note', text: state.all.length ? 'Все игроки распределены.' : 'Список пуст — добавьте игроков кнопкой (+) в Игровой или по ID ниже.' }));
      const add = () => {
        const id = idAdd.value.trim();
        if (!/^\d+$/.test(id)) { idAdd.style.borderColor = '#c0392b'; return; }
        if (!byId(id)) state.all.push({ id, name: `#${id}` });
        idAdd.value = '';
        renderAll();
      };
      return makeDrop(el('div', { class: 'cwh-zone' }, [
        el('div', { class: 'cwh-zone__title', text: `Игроки (${free.length})` }),
        body,
        el('div', { class: 'cwh-chip__row', style: 'margin-top:6px' }, [idAdd, el('button', { type: 'button', class: 'cwr-btn', text: '+', title: 'Добавить по ID', onclick: add })]),
      ]), { zone: 'pool' });
    }

    function renderPairs() {
      const slot = (i, key, label) => {
        const id = state.pairs[i][key];
        return makeDrop(el('div', { class: 'cwh-slot' }, [
          el('div', { class: 'cwh-slot__label', text: label }),
          id ? chip(id, 'catch') : el('div', { class: 'cwh-note', text: 'перетащите сюда' }),
        ]), { pair: i, slot: key });
      };
      const rows = state.pairs.map((_, i) => el('div', { class: 'cwh-pair' }, [
        slot(i, 'lead', 'Ведущий'),
        slot(i, 'follow', 'Ведомый → [в скобках]'),
        state.pairs.length > 1 ? el('button', { type: 'button', class: 'cwh-chip__x', title: 'Удалить пару', text: '×', onclick: () => {
          state.pairs.splice(i, 1); state.selected = null; renderAll();
        } }) : null,
      ]));
      return el('div', { class: 'cwh-zone' }, [
        el('div', { class: 'cwh-zone__title', text: 'Пары тамаши' }),
        ...rows,
        el('button', { type: 'button', class: 'cwr-btn', text: '+ пара', onclick: () => { state.pairs.push({ lead: null, follow: null }); renderAll(); } }),
      ]);
    }

    function renderZones() {
      const box = el('div');
      ZONES.forEach(z => {
        const ids = state.zones[z.key];
        box.append(makeDrop(el('div', { class: 'cwh-zone' }, [
          el('div', { class: 'cwh-zone__title', text: z.title }),
          el('div', { class: 'cwh-zone__body' },
            ids.length ? ids.map(id => chip(id, z.mode)) : el('div', { class: 'cwh-note', text: 'перетащите игроков сюда' })),
        ]), { zone: z.key }));
        if (z.key === 'hunter') box.append(renderPairs());
      });
      return box;
    }

    function renderAll() {
      root.replaceChildren(el('div', { class: 'cwh-hunt' }, [renderPool(), renderZones()]));
      updatePreview();
    }
    renderAll();

    const body = [
      whenField,
      el('span', { class: 'cwr-label', text: 'Участники (перетащите в нужную роль или кликните игрока, затем — роль)' }),
      root,
      el('span', { class: 'cwr-label', style: 'margin-top:10px', text: 'Предпросмотр' }),
      preview,
      el('label', { class: 'cwh-check', for: 'cwh-remove' }, [removeChk, ' Удалить использованных игроков из списка участников']),
      hint,
    ];

    R.ui.openModal({
      title: 'Отчёт об охоте',
      body,
      applyLabel: 'Применить',
      onApply() {
        hint.textContent = '';
        if (state.pairs.some(p => p.follow && !p.lead)) { hint.textContent = 'В паре тамаши указан ведомый без ведущего.'; return false; }
        const entries = collect();
        if (!entries.length) { hint.textContent = 'Добавьте хотя бы одного игрока в роли.'; return false; }
        if (!R.ui.insertIntoComment(buildReport(entries))) { hint.textContent = 'Поле комментария не найдено.'; return false; }
        storage.set('removeUsed', removeChk.checked);
        if (removeChk.checked && R.players) placedIds().forEach(id => R.players.remove(id));
      },
    });
    const modal = document.querySelector('.cwr-modal');
    if (modal) modal.style.maxWidth = '900px';
  }

  R.register({
    id: `blog-${BLOG_ID}`,
    match: loc => loc.pathname.replace(/\/+$/, '') === `/blog${BLOG_ID}`,
    mount() {
      R.ui.addCommentButton({ id: `cwr-btn-${BLOG_ID}`, label: '📝 Отчёт: охота', onClick: openForm });
    },
  });
})();
