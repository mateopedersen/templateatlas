import { calculate, tools } from '../lib/tools.mjs';
import { invoice, money } from '../lib/invoice.mjs';

function input(parent, label, value, type = 'text', options = []) {
  const wrap = document.createElement('label');
  wrap.textContent = label;
  const el = document.createElement(
    type === 'select' ? 'select' : type === 'textarea' ? 'textarea' : 'input',
  );
  if (type === 'select') {
    for (const choice of options) {
      const opt = document.createElement('option');
      opt.value = String(choice);
      opt.textContent = String(choice);
      el.append(opt);
    }
  } else if (type !== 'textarea') el.type = type;
  el.value = String(value ?? '');
  wrap.append(el);
  parent.append(wrap);
  return el;
}
function inlineButton(parent, label, run) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'secondary';
  b.textContent = label;
  b.onclick = run;
  parent.append(b);
  return b;
}
export function savedInputs(parent, doc) {
  if (doc.kind !== 'invoice') {
    const spec = tools[doc.kind];
    if (!spec) return null;
    const inputs = new Map(
      spec.fields.map((f) => [
        f.name,
        input(parent, f.label, doc.data[f.name], f.type, f.options),
      ]),
    );
    return () => {
      const data = Object.fromEntries(
        [...inputs].map(([name, el]) => [name, el.value]),
      );
      calculate(doc.kind, data);
      return data;
    };
  }
  const header = {};
  for (const [key, label, type] of [
    ['seller', 'Business name'],
    ['buyer', 'Bill to'],
    ['number', 'Invoice number'],
    ['date', 'Issue date', 'date'],
  ]) {
    header[key] = input(parent, label, doc.data[key], type);
  }
  const items = document.createElement('div');
  parent.append(items);
  const readers = [];
  function addRow(item) {
    if (readers.length >= 60) return;
    const row = document.createElement('fieldset'),
      legend = document.createElement('legend');
    legend.textContent = 'Line item';
    row.append(legend);
    items.append(row);
    const description = input(row, 'Description', item.description),
      quantity = input(row, 'Quantity', item.quantity),
      rate = input(row, 'Unit price (USD)', item.rate);
    const taxable = input(
      row,
      'Taxable',
      item.taxable ? 'Yes' : 'No',
      'select',
      ['Yes', 'No'],
    );
    const read = () => ({
      description: description.value,
      quantity: quantity.value,
      rate: rate.value,
      taxable: taxable.value === 'Yes',
    });
    readers.push(read);
    inlineButton(row, 'Remove item', () => {
      if (readers.length > 1) {
        readers.splice(readers.indexOf(read), 1);
        row.remove();
      }
    });
  }
  for (const item of doc.data.items || []) addRow(item);
  inlineButton(parent, 'Add line item', () =>
    addRow({ description: '', quantity: '1', rate: '0.00', taxable: true }),
  );
  for (const [key, label] of [
    ['discount', 'Discount (%)'],
    ['tax', 'Tax (%)'],
    ['paid', 'Payments received (USD)'],
  ])
    header[key] = input(parent, label, doc.data[key] ?? '0');
  const preview = document.createElement('p');
  parent.append(preview);
  const data = () => ({
    ...Object.fromEntries(
      Object.entries(header).map(([key, el]) => [key, el.value]),
    ),
    items: readers.map((read) => read()),
  });
  function refresh() {
    try {
      preview.textContent = 'Balance due · ' + money(invoice(data()).balance);
    } catch {
      preview.textContent =
        'Complete the invoice fields to calculate the balance.';
    }
  }
  parent.addEventListener('input', refresh);
  parent.addEventListener('click', refresh);
  refresh();
  return () => {
    const values = data();
    invoice(values);
    return values;
  };
}
