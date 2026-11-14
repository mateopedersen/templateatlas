// Retry only the requested preview, then its own verified full-size original.
export function installImageRecovery(root = document, schedule = setTimeout) {
  const attempts = new WeakMap();
  const recover = (event) => {
    const img = event.target;
    if (img?.tagName !== 'IMG') return;
    const current = img.currentSrc || img.src;
    if (!/^https?:/i.test(current || '')) return;
    const attempt = attempts.get(img) || 0;
    const original = img.dataset.previewOriginal;
    if (attempt >= 3 || (attempt >= 2 && !original)) {
      img.classList.remove('is-image-recovering');
      return;
    }
    attempts.set(img, attempt + 1);
    img.classList.add('is-image-recovering');
    schedule(() => {
      if (!root.contains(img)) return;
      const url = new URL(attempt === 2 ? original : current, root.baseURI);
      url.searchParams.set('__ta_retry', String(attempt + 1));
      img.removeAttribute('srcset');
      img.src = url.href;
    }, attempt === 0 ? 150 : 500);
  };
  const loaded = event => {
    if (event.target?.tagName !== 'IMG') return;
    event.target.classList.remove('is-image-recovering');
    attempts.delete(event.target);
  };
  root.addEventListener('error', recover, true);
  root.addEventListener('load', loaded, true);
  for (const img of root.querySelectorAll('img')) if (img.complete && !img.naturalWidth && img.currentSrc) recover({target:img});
  return () => { root.removeEventListener('error', recover, true); root.removeEventListener('load', loaded, true); };
}
