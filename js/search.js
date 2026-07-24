import { state } from './state.js';
import { escapeHtml, formatMediaType } from './utils.js';

// Callbacks set by main.js after all modules are initialized
let searchCallbacks = {
    onMapSearchClick: null,
    on3DSearchClick: null,
};

export function setSearchCallbacks(cbs) {
    searchCallbacks = { ...searchCallbacks, ...cbs };
}

export function initSearch() {
    const searchInput = document.getElementById('search-input');
    const searchResults = document.getElementById('search-results');

    function buildSearchIndex() {
        state.slugSet = new Set(state.allPoints.map(p => p.slug));
        state.slugToCoords = {};
        for (const p of state.allPoints) state.slugToCoords[p.slug] = p;
    }

    const _dataLoadedCheck = setInterval(() => {
        if (state.allPoints.length > 0) { buildSearchIndex(); clearInterval(_dataLoadedCheck); }
    }, 200);

    searchInput.addEventListener('input', () => {
        const q = searchInput.value.trim();
        clearTimeout(state.searchTimeout);
        if (q.length < 2) { searchResults.classList.remove('visible'); searchResults.innerHTML = ''; state.selectedSearchIndex = -1; return; }
        state.searchTimeout = setTimeout(() => doSearch(q), 300);
    });

    searchInput.addEventListener('keydown', (e) => {
        const items = searchResults.querySelectorAll('.search-result-item');
        if (!items.length) return;
        if (e.key === 'ArrowDown') { e.preventDefault(); state.selectedSearchIndex = Math.min(state.selectedSearchIndex + 1, items.length - 1); updateSearchSelection(items); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); state.selectedSearchIndex = Math.max(state.selectedSearchIndex - 1, 0); updateSearchSelection(items); }
        else if (e.key === 'Enter') { e.preventDefault(); if (state.selectedSearchIndex >= 0) items[state.selectedSearchIndex].click(); }
        else if (e.key === 'Escape') { searchInput.blur(); searchResults.classList.remove('visible'); }
    });

    function updateSearchSelection(items) {
        items.forEach((item, i) => item.classList.toggle('selected', i === state.selectedSearchIndex));
        if (state.selectedSearchIndex >= 0 && items[state.selectedSearchIndex]) items[state.selectedSearchIndex].scrollIntoView({ block: 'nearest' });
    }

    async function doSearch(query) {
        if (state.searchAbort) state.searchAbort.abort();
        state.searchAbort = new AbortController();
        searchResults.innerHTML = '';
        searchResults.classList.add('visible');
        state.selectedSearchIndex = -1;
        const ld = document.createElement('div');
        ld.className = 'search-empty'; ld.textContent = 'Searching...';
        searchResults.appendChild(ld);

        try {
            const url = `https://corsproxy.io/?url=${encodeURIComponent('https://api.hikka.io/anime?page=1&size=15')}`;
            const r = await fetch(url, {
                method: 'POST',
                headers: { accept: 'application/json', 'Content-Type': 'application/json' },
                body: JSON.stringify({ query, sort: ['score:desc', 'scored_by:desc', 'native_score:desc', 'native_scored_by:desc'] }),
                signal: state.searchAbort.signal
            });
            if (!r.ok) throw new Error(`API ${r.status}`);
            renderSearchResults((await r.json()).list || [], query);
        } catch (err) {
            if (err.name === 'AbortError') return;
            searchResults.innerHTML = '<div class="search-empty">Search failed. Try again.</div>';
        }
    }

    function renderSearchResults(list, query) {
        searchResults.innerHTML = '';
        const enriched = list.map(item => ({ ...item, onMap: state.slugSet.has(item.slug) }));
        enriched.sort((a, b) => a.onMap !== b.onMap ? (a.onMap ? -1 : 1) : (b.score || 0) - (a.score || 0));
        if (!enriched.length) { searchResults.innerHTML = '<div class="search-empty">No results found</div>'; return; }

        const frag = document.createDocumentFragment();
        for (const item of enriched) {
            const el = document.createElement('div');
            el.className = `search-result-item${item.onMap ? '' : ' not-on-map'}`;
            el.dataset.slug = item.slug;
            el.dataset.onMap = item.onMap ? '1' : '0';
            const t = item.title_ua || item.title_en || item.title_ja || 'Unknown';
            const sub = [item.title_en, item.title_ja].filter(x => x && x !== t).join(' / ');
            el.innerHTML = `
                <img class="search-result-img" src="${item.image || ''}" alt="" onerror="this.style.display='none'">
                <div class="search-result-info">
                    <div class="search-result-title">${escapeHtml(t)}</div>
                    <div class="search-result-meta">${[sub, formatMediaType(item.media_type), item.score, item.episodes_total ? `${item.episodes_released}/${item.episodes_total} ep` : ''].filter(Boolean).join(' ')}</div>
                </div>
                <span class="search-result-badge ${item.onMap ? 'on-map' : 'off-map'}">${item.onMap ? 'On map' : 'Off map'}</span>`;
            el.addEventListener('click', () => handleSearchResultClick(item));
            frag.appendChild(el);
        }
        searchResults.appendChild(frag);
        searchResults.classList.add('visible');
    }

    function handleSearchResultClick(item) {
        if (item.onMap && state.slugToCoords[item.slug]) {
            const p = state.slugToCoords[item.slug];
            if (state.is3DMode) {
                searchCallbacks.on3DSearchClick?.(p);
            } else {
                searchCallbacks.onMapSearchClick?.(p);
            }
        } else {
            window.open(`https://hikka.io/anime/${item.slug}`, '_blank');
        }
        searchResults.classList.remove('visible');
        searchInput.value = ''; searchInput.blur();
    }

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-container')) searchResults.classList.remove('visible');
    });
    document.addEventListener('keydown', (e) => {
        const si = document.getElementById('search-input');
        if (e.key === '/' && document.activeElement !== si && !e.target.closest('.search-container')) {
            e.preventDefault(); si.focus();
        }
    });
}
