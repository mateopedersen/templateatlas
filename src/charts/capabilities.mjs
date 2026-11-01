const native = new Set([
  'line-chart',
  'area-chart',
  'bar-graph',
  'stacked-bar-chart',
  'pie-chart',
  'scatter-plot',
  'bubble-chart',
  'radar-chart',
  'burndown-chart',
]);
export const chartFormats = (type, canRender = false) => [
  ...(native.has(type) ? ['svg', 'xlsx'] : ['svg']),
  ...(canRender ? ['pdf', 'jpg'] : []),
];
