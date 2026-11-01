const storageKey = 'templateatlas.schedule.v1';
export function mountSchedule(form) {
  const source = form.querySelector('textarea[name="rows"]');
  if (!source) return;
  const create = (tag, text) => {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    return el;
  };
  const section = create('section'),
    list = create('div'),
    remember = create('input');
  remember.type = 'checkbox';
  section.append(
    create('h3', 'Time blocks'),
    create(
      'p',
      'Times are local. Overlapping blocks are flagged and kept in your schedule.',
    ),
    list,
  );
  const action = (label, onClick) => {
    const b = create('button', label);
    b.type = 'button';
    b.onclick = onClick;
    return b;
  };
  const save = () => {
    try {
      if (remember.checked) sessionStorage.setItem(storageKey, source.value);
      else sessionStorage.removeItem(storageKey);
    } catch {
      remember.checked = false;
    }
  };
  function sync() {
    source.value = [...list.querySelectorAll('fieldset')]
      .map((f) =>
        [...f.querySelectorAll('input')]
          .map((i) => i.value.replace(/[\r\n]/g, ' '))
          .join(','),
      )
      .join('\n');
    save();
    source.dispatchEvent(new Event('input', { bubbles: true }));
  }
  function add(vals = [], focus = false) {
    if (list.children.length >= 250) return;
    const fieldset = create('fieldset');
    const legend = create('legend', 'Time block');
    fieldset.append(legend);
    for (const [i, [name, type]] of [
      ['Date', 'date'],
      ['Start time', 'time'],
      ['End time', 'time'],
      ['Activity', 'text'],
    ].entries()) {
      const label = create('label', name),
        input = create('input');
      input.type = type;
      input.value = vals[i] || '';
      if (i === 3) input.maxLength = 160;
      label.append(input);
      fieldset.append(label);
    }
    fieldset.append(
      action('Remove block', () => {
        fieldset.remove();
        sync();
        (list.lastElementChild?.querySelector('input') || addButton).focus();
      }),
    );
    list.append(fieldset);
    if (focus) fieldset.querySelector('input').focus();
  }
  const addButton = action('Add time block', () => {
    add([], true);
    sync();
  });
  const clear = action('Clear schedule', () => {
    if (
      !list.children.length ||
      !confirm('Clear all time blocks from this schedule?')
    )
      return;
    list.replaceChildren();
    sync();
    addButton.focus();
  });
  const keep = create('label');
  keep.append(
    remember,
    document.createTextNode(' Keep this schedule in this tab after a refresh'),
  );
  remember.onchange = save;
  section.append(addButton, clear, keep);
  source.closest('label').hidden = true;
  form.append(section);
  const raw = source.value;
  let saved = null;
  try {
    saved = sessionStorage.getItem(storageKey);
    remember.checked = saved !== null;
  } catch {}
  for (const line of String(saved ?? raw)
    .split(/\r?\n/)
    .filter(Boolean)) {
    const [d, s, e, ...title] = line.split(',');
    add([d, s, e, title.join(',')]);
  }
  list.addEventListener('input', sync);
  sync();
}
