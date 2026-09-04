// Metadata behaviour that belongs to the document rather than to a view.
//
//  1. `?q=term` opens the command palette pre-filled. This is what the
//     SearchAction in the JSON-LD points at, so the declared site search is a
//     real one rather than a claim.
//  2. While the app is driven by the hash, the canonical link, og:url and the
//     document title follow the route, so a shared `#/academic` URL still
//     names the page it is showing. On a prerendered page (a path, no hash)
//     the server-rendered values are already correct and are left alone.
//
// Everything here is best-effort: metadata must never break the page.

const ORIGIN = 'https://global-distillation.com';

const routeFromHash = () => {
  const id = (location.hash || '').replace(/^#\/?/, '').split('/')[0];
  return id && /^[a-z-]+$/.test(id) ? id : '';
};

const labelFor = (id) => {
  const link = document.querySelector('a.nav__link[data-route="' + id + '"], a[data-route="' + id + '"] .rail__name');
  const text = link && link.textContent && link.textContent.trim();
  return text || id.charAt(0).toUpperCase() + id.slice(1);
};

function syncRouteMeta() {
  try {
    const id = routeFromHash();
    if (!id) return; // no hash: whatever the server sent is canonical
    const url = ORIGIN + (id === 'overview' ? '/' : '/' + id);
    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) canonical.setAttribute('href', url);
    const og = document.querySelector('meta[property="og:url"]');
    if (og) og.setAttribute('content', url);
    document.title = id === 'overview'
      ? 'Global Distillation — a compendium of AI model distillation'
      : labelFor(id) + ' — Global Distillation';
  } catch { /* metadata is never worth an error */ }
}

function openSearch() {
  try {
    const url = new URL(location.href);
    const q = url.searchParams.get('q');
    if (!q) return;
    url.searchParams.delete('q');
    history.replaceState(null, '', url.pathname + url.search + url.hash);

    const button = document.getElementById('open-palette');
    const input = document.getElementById('palette-input');
    if (!button || !input) return;
    button.click();
    input.value = q;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
  } catch { /* the palette is still reachable by hand */ }
}

window.addEventListener('hashchange', syncRouteMeta);
syncRouteMeta();
window.addEventListener('load', openSearch);
