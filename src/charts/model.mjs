// The same model validates the editor preview and the server's export payload.
const schema = (name, headers, kinds, method, rows) => ({
  name,
  headers,
  kinds,
  method,
  rows,
});
export const types = {
  'bar-graph': schema(
    'Bar graph',
    ['Channel', 'Orders'],
    ['text', 'number'],
    'Each bar is measured from zero.',
    [
      ['Online', 32],
      ['Phone', 18],
      ['Store', 28],
    ],
  ),
  'pie-chart': schema(
    'Pie chart',
    ['Category', 'Count'],
    ['text', 'positive'],
    'Slices use the sum of all entered counts.',
    [
      ['Walk', 26],
      ['Bus', 18],
      ['Bike', 12],
    ],
  ),
  'line-chart': schema(
    'Line chart',
    ['Week', 'Hours'],
    ['text', 'optional'],
    'Rows define the order. Empty values leave a gap.',
    [
      ['Week 1', 18],
      ['Week 2', 24],
      ['Week 3', 21],
      ['Week 4', 28],
    ],
  ),
  'area-chart': schema(
    'Area chart',
    ['Day', 'Visitors'],
    ['text', 'optional'],
    'The filled area spans the value and zero. Missing values leave gaps.',
    [
      ['Mon', 17],
      ['Tue', 26],
      ['Wed', 21],
      ['Thu', 29],
      ['Fri', 34],
    ],
  ),
  'stacked-bar-chart': schema(
    'Stacked bar chart',
    ['Week', 'Walk-ins', 'Appointments'],
    ['text', 'number', 'number'],
    'Positive and negative contributions stack independently from zero.',
    [
      ['Week 1', 32, 19],
      ['Week 2', 25, 28],
      ['Week 3', 31, 24],
    ],
  ),
  'scatter-plot': schema(
    'Scatter plot',
    ['Travel time (min)', 'Distance (mi)'],
    ['number', 'number'],
    'Both axes use numeric spacing.',
    [
      [12, 3.2],
      [24, 7.1],
      [16, 5.5],
      [37, 10.8],
      [41, 9.6],
    ],
  ),
  'bubble-chart': schema(
    'Bubble chart',
    ['Cost (USD)', 'Duration (days)', 'Requests'],
    ['number', 'number', 'positive'],
    'Bubble area is proportional to the third column.',
    [
      [12, 3, 12],
      [24, 7, 24],
      [17, 5, 18],
      [37, 10, 32],
    ],
  ),
  histogram: schema(
    'Histogram',
    ['Wait (min)'],
    ['number'],
    'Equal-width bins include the left edge. The last bin also includes its right edge.',
    [[1], [4], [5], [6], [6], [7], [10], [12], [15]],
  ),
  'box-and-whisker-plot': schema(
    'Box-and-whisker plot',
    ['Elapsed time (min)'],
    ['number'],
    'Inclusive linear quartiles. Whiskers reach the outermost observations within 1.5 IQR of the box.',
    [[12], [14], [15], [17], [18], [20], [36]],
  ),
  heatmap: schema(
    'Heatmap',
    ['Team', 'Mon', 'Tue', 'Wed'],
    ['text', 'optional', 'optional', 'optional'],
    'All cells share one color scale. Missing values have a separate mark.',
    [
      ['North', 12, 15, 10],
      ['West', 18, 9, 16],
      ['South', 5, 11, 7],
    ],
  ),
  'pareto-chart': schema(
    'Pareto chart',
    ['Reason', 'Count'],
    ['text', 'positive'],
    'Categories are grouped, sorted by total, and accumulated to 100%.',
    [
      ['Late pickup', 12],
      ['Wrong size', 7],
      ['Box damage', 4],
      ['Other', 2],
    ],
  ),
  'radar-chart': schema(
    'Radar chart',
    ['Criterion', 'Score'],
    ['text', 'positive'],
    'Compare dimensions in the same units on a common radial scale.',
    [
      ['Speed', 7],
      ['Accuracy', 9],
      ['Comfort', 5],
      ['Capacity', 8],
      ['Reach', 6],
    ],
  ),
  'combo-chart': schema(
    'Combo chart',
    ['Month', 'Actual (units)', 'Plan (units)'],
    ['text', 'number', 'number'],
    'Bars and the dashed line use one shared axis. Use comparable units.',
    [
      ['Jan', 35, 32],
      ['Feb', 41, 38],
      ['Mar', 36, 40],
      ['Apr', 45, 43],
    ],
  ),
  'funnel-chart': schema(
    'Funnel chart',
    ['Stage', 'Count'],
    ['text', 'positive'],
    'Stage widths are proportional to counts in the order entered.',
    [
      ['Inquiries', 120],
      ['Visits', 89],
      ['Trials', 62],
      ['Orders', 41],
    ],
  ),
  'slope-chart': schema(
    'Slope chart',
    ['Team', 'Start', 'Finish'],
    ['text', 'number', 'number'],
    'Each line compares the same category at two ordered endpoints.',
    [
      ['East', 17, 23],
      ['West', 26, 24],
      ['South', 13, 18],
    ],
  ),
  'bullet-chart': schema(
    'Bullet chart',
    ['Team', 'Actual', 'Target', 'Range limit'],
    ['text', 'positive', 'positive', 'positive'],
    'Bars show actuals, diamonds show targets, and the pale tracks show the stated range limits.',
    [
      ['A', 67, 75, 100],
      ['B', 74, 65, 90],
      ['C', 58, 70, 85],
    ],
  ),
  'cash-flow-chart': schema(
    'Cash-flow chart',
    ['Month', 'Inflows (USD)', 'Outflows (USD)'],
    ['text', 'positive', 'positive'],
    'Net equals inflows less outflows. The line carries forward the opening balance.',
    [
      ['Jan', 4200, 3600],
      ['Feb', 3950, 4300],
      ['Mar', 4750, 3700],
      ['Apr', 4550, 4100],
    ],
  ),
  'dot-plot': schema(
    'Dot plot',
    ['Desk', 'Wait (min)'],
    ['text', 'number'],
    'Compare one measured value per category on a shared horizontal scale.',
    [
      ['Intake', 7],
      ['Dispatch', 3],
      ['Returns', 12],
      ['Pickup', 5],
    ],
  ),
  'population-pyramid': schema(
    'Population pyramid',
    ['Age range', 'Group A', 'Group B'],
    ['text', 'positive', 'positive'],
    'Positive counts use a shared scale on either side of the center.',
    [
      ['0–17', 34, 30],
      ['18–34', 48, 51],
      ['35–54', 44, 46],
      ['55+', 29, 32],
    ],
  ),
  '2027-calendar-heatmap': schema(
    '2027 calendar heatmap',
    ['Date', 'Check-ins'],
    ['date', 'positive'],
    'Each cell is a 2027 date. Missing dates and measured zeroes are drawn separately.',
    [
      ['2027-01-01', 0],
      ['2027-01-02', 4],
      ['2027-01-04', 10],
      ['2027-01-05', 7],
    ],
  ),
  'burndown-chart': schema(
    'Burndown chart',
    ['Day', 'Remaining (points)', 'Plan (points)'],
    ['text', 'optionalPositive', 'optionalPositive'],
    'The ideal plan is explicit. Change the remaining-work column when scope changes.',
    [
      ['Day 1', 40, 40],
      ['Day 2', 38, 30],
      ['Day 3', 25, 20],
      ['Day 4', 9, 10],
      ['Day 5', null, 0],
    ],
  ),
  'cohort-retention-chart': schema(
    'Cohort retention chart',
    ['Cohort', 'Starting users', 'Month 1', 'Month 2', 'Month 3'],
    [
      'text',
      'denominator',
      'optionalPositive',
      'optionalPositive',
      'optionalPositive',
    ],
    'Each cell divides retained users by that cohort’s starting population. Blank means unobserved.',
    [
      ['January', 40, 32, 28, 23],
      ['February', 50, 36, 29, null],
      ['March', 45, 35, null, null],
    ],
  ),
  'treemap-chart': schema(
    'Treemap chart',
    ['Group', 'Item', 'Weight'],
    ['text', 'text', 'positive'],
    'Leaf area is proportional to weight. Group totals sum their children.',
    [
      ['Travel', 'Transit', 12],
      ['Travel', 'Parking', 8],
      ['Office', 'Supplies', 15],
      ['Office', 'Postage', 5],
    ],
  ),
  'sunburst-chart': schema(
    'Sunburst chart',
    ['Group', 'Item', 'Weight'],
    ['text', 'text', 'positive'],
    'Inner rings represent groups. Outer rings divide each group by child weight.',
    [
      ['Projects', 'Design', 24],
      ['Projects', 'Build', 32],
      ['Support', 'Intake', 12],
      ['Support', 'Follow-up', 8],
    ],
  ),
  'sankey-diagram': schema(
    'Sankey diagram',
    ['Source', 'Target', 'Flow'],
    ['text', 'text', 'positive'],
    'Link widths share one scale. Cycles are unsupported. Nodes may retain or supply excess flow.',
    [
      ['Intake', 'Review', 36],
      ['Intake', 'Resolve', 14],
      ['Review', 'Resolve', 24],
      ['Review', 'Archive', 12],
    ],
  ),
  'waterfall-chart': schema(
    'Waterfall chart',
    ['Change', 'Amount'],
    ['text', 'number'],
    'Each bar spans the previous and resulting cumulative balance.',
    [
      ['Opening', 120],
      ['Orders', 52],
      ['Returns', -18],
      ['Fees', -9],
    ],
  ),
  'control-chart': schema(
    'X-bar and R control chart',
    ['Subgroup', 'Unit 1', 'Unit 2', 'Unit 3', 'Unit 4', 'Unit 5'],
    ['text', 'number', 'number', 'number', 'number', 'number'],
    'For subgroups of five: A2 = 0.577, D3 = 0 and D4 = 2.115. Limits describe process variation.',
    [
      ['Group 1', 14, 15, 15, 16, 15],
      ['Group 2', 14, 13, 15, 16, 15],
      ['Group 3', 15, 14, 16, 15, 15],
      ['Group 4', 16, 14, 14, 16, 15],
    ],
  ),
};
export function numberUS(raw) {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || Math.abs(raw) > 1e12)
      throw Error('Enter a finite number between −1 trillion and 1 trillion.');
    return raw;
  }
  const t = String(raw).trim();
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+|\d{1,3}(?:,\d{3})+(?:\.\d*)?)$/.test(t))
    throw Error(
      'Enter a number using a decimal point and optional US thousands separators.',
    );
  const n = Number(t.replaceAll(',', ''));
  if (!Number.isFinite(n) || Math.abs(n) > 1e12)
    throw Error('Enter a number between −1 trillion and 1 trillion.');
  return n;
}
export function csvRows(raw) {
  if (typeof raw !== 'string' || raw.length > 150000)
    throw Error('Use a CSV file under 150 KB.');
  const t = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  let rows = [],
    row = [],
    cell = '',
    quoted = false,
    closed = false;
  const delim = t.split('\n')[0].includes('\t') ? '\t' : ',';
  for (let i = 0; i < t.length; i++) {
    let c = t[i];
    if (quoted) {
      if (c === '"' && t[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
        closed = true;
      } else cell += c;
      continue;
    }
    if (c === delim || c === '\n') {
      row.push(cell);
      cell = '';
      closed = false;
      if (c === '\n') {
        if (row.some((v) => v !== '')) rows.push(row);
        row = [];
      }
      continue;
    }
    if (c === '"' && !cell && !closed) {
      quoted = true;
      continue;
    }
    if (closed || c === '"')
      throw Error('Fix the quotation marks in the CSV data.');
    cell += c;
  }
  if (quoted) throw Error('Close the quoted CSV field.');
  row.push(cell);
  if (row.some((v) => v !== '')) rows.push(row);
  if (rows.length < 2)
    throw Error('Include a header row and at least one data row.');
  return rows;
}
export function initial(type = 'line-chart') {
  if (!Object.hasOwn(types, type))
    throw Error('Choose a supported chart type.');
  const d = types[type];
  return {
    type,
    title: d.name,
    headers: [...d.headers],
    rows: d.rows.map((r) => [...r]),
    sample: true,
    palette: 'ledger',
    legend: true,
    revision: 1,
    bins: 5,
    weekStart: 'Sunday',
    opening: 0,
    connectMissing: false,
    axisTitle: '',
  };
}
export function calendarCells(weekStart = 'Sunday') {
  const shift = weekStart === 'Monday' ? 4 : 5;
  return Array.from({ length: 365 }, (_, i) => ({
    date: new Date(Date.UTC(2027, 0, i + 1)).toISOString().slice(0, 10),
    week: Math.floor((shift + i) / 7),
    day: (i + shift) % 7,
  }));
}
export function validate(input) {
  if (!input || !Object.hasOwn(types, input.type))
    throw Error('Choose a supported chart type.');
  const d = types[input.type];
  const headers = input.headers;
  if (
    !Array.isArray(headers) ||
    headers.length !== d.kinds.length ||
    headers.some((v) => typeof v !== 'string' || !v.trim() || v.length > 48) ||
    new Set(headers.map((v) => v.trim().toLowerCase())).size !== headers.length
  )
    throw Error('Use a distinct heading of 1–48 characters for every column.');
  if (
    !Array.isArray(input.rows) ||
    !input.rows.length ||
    input.rows.length > 500
  )
    throw Error('Enter between 1 and 500 rows.');
  const rows = input.rows.map((row, i) => {
    if (!Array.isArray(row) || row.length !== headers.length)
      throw Error('Check the column count in row ' + (i + 1) + '.');
    return row.map((raw, j) => {
      const kind = d.kinds[j];
      const loc = 'Row ' + (i + 1) + ', ' + headers[j] + '. ';
      if (!['string', 'number'].includes(typeof raw) && raw !== null)
        throw Error(loc + 'Enter a value.');
      const s = String(raw ?? '').trim();
      if (!s) {
        if (kind.startsWith('optional')) return null;
        throw Error(loc + 'A value is required.');
      }
      if (kind === 'date') {
        if (!/^2027-\d\d-\d\d$/.test(s) || !calendarDateSet.has(s))
          throw Error(loc + 'Enter a real 2027 date as YYYY-MM-DD.');
        return s;
      }
      if (kind === 'text') {
        if (s.length > 100) throw Error(loc + 'Use 100 characters or fewer.');
        return s;
      }
      let n;
      try {
        n = numberUS(typeof raw === 'number' ? raw : s);
      } catch (e) {
        throw Error(loc + e.message);
      }
      if (
        ['positive', 'optionalPositive', 'denominator'].includes(kind) &&
        n < 0
      )
        throw Error(loc + 'Use a nonnegative number.');
      if (kind === 'denominator' && n === 0)
        throw Error(loc + 'Starting users must exceed zero.');
      return n;
    });
  });
  if (
    typeof input.title !== 'string' ||
    !input.title.trim() ||
    input.title.length > 100
  )
    throw Error('Use a chart title of 1–100 characters.');
  if (!Number.isSafeInteger(input.revision) || input.revision < 1)
    throw Error('The chart revision is invalid.');
  if (!Number.isInteger(input.bins) || input.bins < 1 || input.bins > 25)
    throw Error('Choose 1–25 histogram bins.');
  if (
    input.type === '2027-calendar-heatmap' &&
    new Set(rows.map((r) => r[0])).size !== rows.length
  )
    throw Error('Use one observation per date.');
  if (input.type === 'radar-chart' && (rows.length < 3 || rows.length > 16))
    throw Error('Use 3–16 comparable dimensions.');
  if (
    input.type === 'cohort-retention-chart' &&
    rows.some((r) => r.slice(2).some((n) => n !== null && n > r[1]))
  )
    throw Error('Retained users cannot exceed the starting population.');
  if (input.type === 'sankey-diagram') graphLayout(rows);
  if (
    [
      'pie-chart',
      'funnel-chart',
      'pareto-chart',
      'treemap-chart',
      'sunburst-chart',
      'sankey-diagram',
    ].includes(input.type) &&
    !rows.some((r) => r.at(-1) > 0)
  )
    throw Error('Add at least one positive value. The total is zero.');
  return {
    type: input.type,
    title: input.title.trim(),
    headers: headers.map((h) => h.trim()),
    rows,
    revision: input.revision,
    bins: input.bins,
    opening: numberUS(input.opening ?? 0),
    sample: input.sample === true,
    palette: input.palette === 'ocean' ? 'ocean' : 'ledger',
    legend: input.legend !== false,
    weekStart: input.weekStart === 'Monday' ? 'Monday' : 'Sunday',
    connectMissing: input.connectMissing === true,
    axisTitle: String(input.axisTitle ?? '').slice(0, 60),
  };
}
const calendarDateSet = new Set(calendarCells().map((c) => c.date));
export function histogram(values, edges) {
  return edges
    .slice(1)
    .map((max, i) => ({
      min: edges[i],
      max,
      count: values.filter(
        (v) =>
          v >= edges[i] && (v < max || (i === edges.length - 2 && v === max)),
      ).length,
    }));
}
export function quartiles(values) {
  const v = [...values].sort((a, b) => a - b);
  const q = (p) => {
    let n = p * (v.length - 1),
      i = Math.floor(n);
    return v[i] + (n - i) * (v[Math.ceil(n)] - v[i]);
  };
  const q1 = q(0.25),
    median = q(0.5),
    q3 = q(0.75),
    iqr = q3 - q1,
    low = q1 - 1.5 * iqr,
    high = q3 + 1.5 * iqr;
  return {
    q1,
    median,
    q3,
    iqr,
    low,
    high,
    w1: v.find((n) => n >= low),
    w2: v.findLast((n) => n <= high),
    outliers: v.filter((n) => n < low || n > high),
  };
}
export function pareto(rows) {
  const groups = new Map();
  for (const [k, v] of rows) groups.set(k, (groups.get(k) ?? 0) + v);
  const total = [...groups.values()].reduce((a, b) => a + b, 0);
  let running = 0;
  return [...groups]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'en-US'))
    .map(([k, n]) => [k, n, ((running += n) / total) * 100]);
}
export function graphLayout(rows) {
  const nodes = new Map();
  const get = (n) => {
    if (!nodes.has(n))
      nodes.set(n, { name: n, depth: 0, in: 0, out: 0, parents: 0, next: [] });
    return nodes.get(n);
  };
  for (const [s, t, w] of rows) {
    const a = get(s),
      b = get(t);
    a.next.push(b);
    a.out += w;
    b.in += w;
    b.parents++;
  }
  const queue = [...nodes.values()].filter((n) => !n.parents);
  let i = 0;
  while (i < queue.length) {
    const n = queue[i++];
    for (const next of n.next) {
      next.depth = Math.max(next.depth, n.depth + 1);
      if (--next.parents === 0) queue.push(next);
    }
  }
  if (i !== nodes.size)
    throw Error('Remove the flow cycle. Sankey links must point downstream.');
  return nodes;
}
export const chartSeedType = Object.fromEntries(
  Object.keys(types).map((type) => ['ta-' + type + '-001', type]),
);
