/**
 * Блог «Покорители глубин» — https://catwar.net/blog49798
 * Отчёт о подводной охоте.
 *
 * Шаблон:
 *   [b]Подводная охота | дд.мм.гг[/b]
 *   [b]Охотник:[/b] [catID] / ID
 *   [b]Находка:[/b] ...
 */
(function () {
  'use strict';
  const R = window.CWReports;
  if (!R) { console.error('[blog49798] не найден CWReports — проверьте порядок @require'); return; }

  const BLOG_ID = 49798;
  const DATA_FILE = 'blog49798.json'; // лежит в data/ репозитория

  // Запасной вариант, если JSON не загрузился и сохранённой копии ещё нет.
  const DEFAULT_CONFIG = { title: 'Подводная охота', columns: 5, items: [{ id: 565, name: 'Крепкая ветка' }] };

  const imgUrl = item => item.img || `https://catwar.net/cw3/things/${item.id}.png`;

  function validate(cfg) {
    if (!cfg || !Array.isArray(cfg.items) || !cfg.items.length) throw new Error('items: ожидается непустой массив');
    cfg.items.forEach((i, n) => {
      if (!/^\d+$/.test(String(i.id))) throw new Error(`items[${n}].id: ожидается число`);
      if (typeof i.name !== 'string' || !i.name.trim()) throw new Error(`items[${n}].name: ожидается строка`);
    });
  }

  let configPromise = null;
  /** Загружается один раз за страницу; никогда не отклоняется. */
  function ensureConfig() {
    if (!configPromise) {
      configPromise = R.data.loadJSON(DATA_FILE, validate)
        .then(({ json, source }) => ({ config: json, source }))
        .catch(e => { console.warn('[blog49798] используется встроенный список:', e.message); return { config: DEFAULT_CONFIG, source: 'default' }; });
    }
    return configPromise;
  }

  /** Формат строки о находке: «Крепкая ветка ×3, Кораллы» */
  function formatFinds(items, counts, other) {
    const parts = items
      .filter(i => counts[i.id] > 0)
      .map(i => (counts[i.id] > 1 ? `${i.name} ×${counts[i.id]}` : i.name));
    if (other) parts.push(other);
    return parts.length ? parts.join(', ') : 'ничего';
  }

  function buildReport({ date, hunterId, items, counts, other }) {
    return [
      `[b]Подводная охота | ${R.dateUtils.format(date)}[/b]`,
      `[b]Охотник:[/b] [cat${hunterId}] / ${hunterId}`,
      `[b]Находка:[/b] ${formatFinds(items, counts, other)}`,
    ].join('\n');
  }

  async function openForm() {
    const { config, source } = await ensureConfig();
    const ITEMS = config.items;
    const COLUMNS = Number(config.columns) || 5;
    const { el, dateUtils } = R;
    const state = {
      date: dateUtils.toISO(new Date()),
      counts: Object.fromEntries(ITEMS.map(i => [i.id, 0])),
    };

    /* --- дата --- */
    const dateInput = el('input', { type: 'date', value: state.date, onchange: e => { if (e.target.value) state.date = e.target.value; } });
    const shift = delta => { state.date = dateUtils.addDays(state.date, delta); dateInput.value = state.date; };
    const dateField = el('div', { class: 'cwr-field' }, [
      el('label', { text: 'Дата' }),
      el('div', { class: 'cwr-row' }, [
        el('button', { type: 'button', class: 'cwr-btn', title: 'Предыдущий день', text: '−1 день', onclick: () => shift(-1) }),
        dateInput,
        el('button', { type: 'button', class: 'cwr-btn', title: 'Следующий день', text: '+1 день', onclick: () => shift(1) }),
        el('button', { type: 'button', class: 'cwr-btn', text: 'Сегодня', onclick: () => { state.date = dateUtils.toISO(new Date()); dateInput.value = state.date; } }),
      ]),
    ]);

    /* --- охотник --- */
    const idInput = el('input', { type: 'text', size: 12, inputmode: 'numeric', value: R.getUserId() || '' });
    const hunterField = el('div', { class: 'cwr-field' }, [
      el('label', { text: 'Охотник (ID)' }),
      idInput,
      R.getUserId() ? null : el('div', { class: 'cwr-hint', text: 'ID не найден. Откройте главную страницу catwar.net или введите ID вручную.' }),
    ]);

    /* --- находка --- */
    const cells = ITEMS.map(item => {
      const count = el('span', { class: 'cwr-item__count' });
      const minus = el('button', {
        type: 'button', class: 'cwr-item__minus', title: 'Убавить на 1', text: '−',
        onclick: e => { e.stopPropagation(); state.counts[item.id] = Math.max(0, state.counts[item.id] - 1); render(); },
      });
      const wrap = el('div', {
        class: 'cwr-item', title: item.name,
        onclick: () => { state.counts[item.id]++; render(); },
      }, [el('img', { src: imgUrl(item), width: 70, height: 70, alt: item.name, draggable: 'false' }), minus, count]);

      const render = () => {
        const n = state.counts[item.id];
        count.textContent = n;
        count.style.display = minus.style.display = n > 0 ? '' : 'none';
        wrap.classList.toggle('is-active', n > 0);
      };
      render();
      return el('td', {}, wrap);
    });

    const rows = [];
    for (let i = 0; i < cells.length; i += COLUMNS) rows.push(el('tr', {}, cells.slice(i, i + COLUMNS)));
    const itemsTable = el('table', { class: 'cwr-items' }, el('tbody', {}, rows));

    const otherInput = el('input', { type: 'text', size: 30, placeholder: 'Другое (необязательно)' });
    const findField = el('div', { class: 'cwr-field' }, [
      el('span', { class: 'cwr-label', text: 'Находка (клик — добавить, красная кнопка — убрать)' }),
      source === 'network' ? null : el('div', { class: 'cwr-hint', text: source === 'cache' ? 'Не удалось обновить список предметов — использована сохранённая копия.' : 'Не удалось загрузить список предметов — использован встроенный.' }),
      itemsTable,
      otherInput,
    ]);

    R.ui.openModal({
      title: config.title || 'Подводная охота',
      body: [dateField, hunterField, findField],
      applyLabel: 'Применить',
      onApply() {
        const hunterId = idInput.value.trim();
        if (!/^\d+$/.test(hunterId)) { idInput.focus(); idInput.style.borderColor = '#c0392b'; return false; }
        const text = buildReport({ date: state.date, hunterId, items: ITEMS, counts: state.counts, other: otherInput.value.replace(/\s+/g, ' ').trim() });
        if (!R.ui.insertIntoComment(text)) { alert('Поле комментария не найдено'); return false; }
      },
    });
  }

  R.register({
    id: `blog-${BLOG_ID}`,
    match: loc => loc.pathname.replace(/\/+$/, '') === `/blog${BLOG_ID}`,
    mount() {
      ensureConfig(); // прогрев: к моменту клика список обычно уже загружен
      R.ui.addCommentButton({ id: `cwr-btn-${BLOG_ID}`, label: '📝 Отчёт: подводная охота', onClick: openForm });
    },
  });
})();
