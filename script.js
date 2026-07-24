document.addEventListener('DOMContentLoaded', async () => {
    const map = document.getElementById('map');
    const loading = document.getElementById('loading');
    const pointLoading = document.getElementById('point-loading');
    const tooltip = document.getElementById('tooltip');
    const tooltipContent = document.getElementById('tooltip-content');
    const zoomInBtn = document.getElementById('zoom-in');
    const zoomOutBtn = document.getElementById('zoom-out');
    const resetBtn = document.getElementById('reset');
    const mapInfo = document.getElementById('map-info');

    const mapWidth = 6000;
    const mapHeight = 6000;
    const mapCenterX = mapWidth / 2;
    const mapCenterY = mapHeight / 2;
    const scaleCoordinates = 20;
    const viewportBuffer = 500; // px buffer around viewport for culling

    let isDragging = false;
    let startPos = { x: 0, y: 0 };
    let currentPos = { x: 0, y: 0 };
    let scale = 1;
    const maxScale = 5;
    const minScale = 0.1;
    let activePointSlug = null;
    let selectedPointSlug = null;
    let tooltipVisible = false;
    let tooltipTimer = null;
    let animeCache = {};
    let allPoints = [];       // full dataset, sorted by x
    let visiblePoints = new Map(); // slug -> DOM element, currently in DOM
    let transformPending = false;

    currentPos = {
        x: window.innerWidth / 2 - mapWidth / 2,
        y: window.innerHeight / 2 - mapHeight / 2
    };
    updateMapTransform();
    addCoordinateMarkers();

    try {
        const response = await fetch('anime_map.json');
        allPoints = await response.json();
        // Pre-sort by x for fast viewport range queries
        allPoints.sort((a, b) => a.x - b.x);
        updateVisiblePoints(true);
    } catch (error) {
        console.error('Error loading anime points:', error);
        allPoints = [];
    }

    function addCoordinateMarkers() {
        const step = 500;
        const fragment = document.createDocumentFragment();
        for (let x = 0; x <= mapWidth; x += step) {
            if (x === mapCenterX) continue;
            const xValue = (x - mapCenterX) / scaleCoordinates;
            const marker = document.createElement('div');
            marker.className = 'coordinate-marker';
            marker.textContent = xValue;
            marker.style.left = `${x}px`;
            marker.style.top = `${mapCenterY + 15}px`;
            fragment.appendChild(marker);
        }
        for (let y = 0; y <= mapHeight; y += step) {
            if (y === mapCenterY) continue;
            const yValue = -((y - mapCenterY) / scaleCoordinates);
            const marker = document.createElement('div');
            marker.className = 'coordinate-marker';
            marker.textContent = yValue;
            marker.style.left = `${mapCenterX + 15}px`;
            marker.style.top = `${y}px`;
            fragment.appendChild(marker);
        }
        const centerMarker = document.createElement('div');
        centerMarker.className = 'coordinate-marker';
        centerMarker.textContent = '0,0';
        centerMarker.style.left = `${mapCenterX}px`;
        centerMarker.style.top = `${mapCenterY}px`;
        fragment.appendChild(centerMarker);
        map.appendChild(fragment);
    }

    // Viewport culling — only render points visible in the viewport
    function updateVisiblePoints(forceUpdate = false) {
        // Calculate viewport bounds in map coordinates
        const viewportLeft = -currentPos.x / scale - viewportBuffer;
        const viewportTop = -currentPos.y / scale - viewportBuffer;
        const viewportRight = (window.innerWidth - currentPos.x) / scale + viewportBuffer;
        const viewportBottom = (window.innerHeight - currentPos.y) / scale + viewportBuffer;

        // Binary search for the first point whose screenX >= viewportLeft
        let lo = 0;
        let hi = allPoints.length;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            const screenX = mapCenterX + allPoints[mid].x * scaleCoordinates;
            if (screenX < viewportLeft) lo = mid + 1;
            else hi = mid;
        }

        // Collect visible slugs
        const newVisibleSlugs = new Set();
        for (let i = lo; i < allPoints.length; i++) {
            const p = allPoints[i];
            const screenX = mapCenterX + p.x * scaleCoordinates;
            if (screenX > viewportRight) break;
            const screenY = mapCenterY + p.y * scaleCoordinates;
            if (screenY >= viewportTop && screenY <= viewportBottom) {
                newVisibleSlugs.add(p.slug);
            }
        }

        // Skip DOM work if nothing changed
        if (!forceUpdate && setsEqual(newVisibleSlugs, visiblePoints.keys())) {
            return;
        }

        // Remove points that are no longer visible
        for (const [slug, el] of visiblePoints) {
            if (!newVisibleSlugs.has(slug)) {
                el.remove();
                visiblePoints.delete(slug);
            }
        }

        // Add points that are newly visible (batched via DocumentFragment)
        const fragment = document.createDocumentFragment();
        for (const p of allPoints) {
            if (!newVisibleSlugs.has(p.slug)) continue;
            if (visiblePoints.has(p.slug)) continue;

            const screenX = mapCenterX + p.x * scaleCoordinates;
            const screenY = mapCenterY + p.y * scaleCoordinates;

            const pointElement = document.createElement('div');
            pointElement.className = 'point';
            pointElement.style.left = `${screenX}px`;
            pointElement.style.top = `${screenY}px`;
            pointElement.dataset.slug = p.slug;
            pointElement.dataset.x = p.x;
            pointElement.dataset.y = p.y;

            fragment.appendChild(pointElement);
            visiblePoints.set(p.slug, pointElement);
        }
        map.appendChild(fragment);
    }

    function setsEqual(a, b) {
        if (a.size !== b.size) return false;
        for (const v of a) {
            if (!b.has(v)) return false;
        }
        return true;
    }

    // rAF-batched transform + visibility update
    function requestUpdateTransform() {
        if (!transformPending) {
            transformPending = true;
            requestAnimationFrame(() => {
                updateMapTransform();
                updateVisiblePoints();
                transformPending = false;
            });
        }
    }

    function updateMapTransform() {
        map.style.transform = `translate(${currentPos.x}px, ${currentPos.y}px) scale(${scale})`;
    }

    async function fetchAnimeInfo(slug, x, y) {
        pointLoading.style.left = `${x}px`;
        pointLoading.style.top = `${y}px`;
        pointLoading.style.display = 'block';

        if (animeCache[slug]) {
            pointLoading.style.display = 'none';
            renderTooltip(animeCache[slug], x, y);
            return;
        }
        try {
            const response = await fetch(`https://corsproxy.io/?url=https://api.hikka.io/anime/${slug}`, {
                headers: {
                    'accept': 'application/json'
                }
            });
            if (!response.ok) {
                throw new Error(`API request failed with status ${response.status}`);
            }
            const data = await response.json();
            animeCache[slug] = data;
            renderTooltip(data, x, y);
        } catch (error) {
            console.error('Error fetching anime info:', error);
            const demoData = {
                "title_ua": "This wonderful world, blessed by God!",
                "title_en": "KonoSuba: God's Blessing on This Wonderful World!",
                "title_ja": "Kono Subarashii Sekai ni Shukufuku wo!",
                "image": "https://cdn.hikka.io/hikka.jpg",
                "synopsis_en": "After dying a laughable and pathetic death on his way back from buying a game, high school student and recluse Kazuma Satou finds himself sitting before a beautiful but obnoxious goddess named Aqua...",
                "episodes_total": 10,
                "episodes_released": 10,
                "status": "finished",
                "media_type": "tv",
                "score": 8.11,
                "genres": [
                    {
                        "name_en": "Comedy",
                        "name_ua": "Comedy"
                    }
                ]
            };
            animeCache[slug] = demoData;
            renderTooltip(demoData, x, y);
        } finally {
            pointLoading.style.display = 'none';
        }
    }

    function renderTooltip(data, x, y) {
        tooltipContent.innerHTML = `
            <a href="https://hikka.io/anime/${data.slug}" target="_blank" class="tooltip-title-link">
                <img class="tooltip-img" src="${data.image}" alt="${data.title_en}" onerror="this.src='https://via.placeholder.com/300x150?text=No+Image'">
                <h3 class="tooltip-title">${data.title_ua || data.title_en || data.title_ja}</h3>
            </a>
            ${data.title_ja ? `<p class="tooltip-subtitle">${data.title_ja}</p>` : ''}
            ${data.synopsis_ua ? `<div class="tooltip-desc">${data.synopsis_ua.slice(0, 150)}${data.synopsis_ua.length > 150 ? '...' : ''}</div>` : ''}
            <div class="tooltip-info">
                ${data.score ? `<span>⭐ ${data.score}</span>` : ''}
                ${data.media_type ? `<span>${formatMediaType(data.media_type)}</span>` : ''}
                ${data.episodes_total ? `<span>${data.episodes_released}/${data.episodes_total} eps.</span>` : ''}
            </div>
        `;
        tooltip.style.left = `${x}px`;
        tooltip.style.top = `${y}px`;
        tooltip.style.transform = 'translate(-50%, -100%)';
        tooltip.style.display = 'block';
        tooltipVisible = true;
        setTimeout(() => {
            const tooltipRect = tooltip.getBoundingClientRect();
            const windowWidth = window.innerWidth;
            const windowHeight = window.innerHeight;

            let transformX = '-50%';
            let transformY = '-100%';

            if (tooltipRect.right > windowWidth) {
                const newLeft = windowWidth - tooltipRect.width - 10;
                tooltip.style.left = `${newLeft}px`;
                transformX = '0';
            }
            else if (tooltipRect.left < 0) {
                tooltip.style.left = '10px';
                transformX = '0';
            }
            const updatedTooltipRect = tooltip.getBoundingClientRect();
            if (updatedTooltipRect.top < 0) {
                tooltip.style.top = `${y + 20}px`;
                transformY = '0';
            }
            tooltip.style.transform = `translate(${transformX}, ${transformY})`;
        }, 0);
    }

    function hideTooltip() {
        tooltip.style.display = 'none';
        tooltipVisible = false;
        selectedPointSlug = null;
    }

    function formatMediaType(type) {
        const types = {
            'tv': 'TV',
            'movie': 'Movie',
            'ova': 'OVA',
            'ona': 'ONA',
            'special': 'Special',
            'music': 'Music Video'
        };
        return types[type] || type;
    }

    // Event delegation for point clicks — one listener instead of 10K
    map.addEventListener('click', (e) => {
        const pointEl = e.target.closest('.point');
        if (pointEl) {
            e.stopPropagation();
            const slug = pointEl.dataset.slug;
            const pointRect = pointEl.getBoundingClientRect();
            const centerX = pointRect.left + pointRect.width / 2;
            const centerY = pointRect.top - 15;

            if (selectedPointSlug === slug) {
                hideTooltip();
                return;
            }

            selectedPointSlug = slug;
            fetchAnimeInfo(slug, centerX, centerY);
            return;
        }
    });

    map.addEventListener('mousedown', (e) => {
        if (e.target === map ||
            e.target.classList.contains('axis-x') || e.target.classList.contains('axis-y')) {
            isDragging = true;
            map.classList.add('grabbing');
            startPos = { x: e.clientX, y: e.clientY };
            if (!e.target.closest('.tooltip')) {
                hideTooltip();
            }
        }
    });
    document.addEventListener('mousemove', (e) => {
        if (isDragging) {
            const dx = e.clientX - startPos.x;
            const dy = e.clientY - startPos.y;
            currentPos.x += dx;
            currentPos.y += dy;
            updateMapInfo();
            startPos = { x: e.clientX, y: e.clientY };
            requestUpdateTransform();
        }
    });
    document.addEventListener('mouseup', () => {
        isDragging = false;
        map.classList.remove('grabbing');
    });

    map.addEventListener('touchstart', (e) => {
        if (e.target === map ||
            e.target.classList.contains('axis-x') || e.target.classList.contains('axis-y')) {
            isDragging = true;
            const touch = e.touches[0];
            startPos = { x: touch.clientX, y: touch.clientY };
            hideTooltip();
            e.preventDefault();
        }
    });
    document.addEventListener('touchmove', (e) => {
        if (isDragging) {
            const touch = e.touches[0];
            const dx = touch.clientX - startPos.x;
            const dy = touch.clientY - startPos.y;
            currentPos.x += dx;
            currentPos.y += dy;
            updateMapInfo();
            startPos = { x: touch.clientX, y: touch.clientY };
            requestUpdateTransform();
            e.preventDefault();
        }
    });
    document.addEventListener('touchend', () => {
        isDragging = false;
    });

    document.addEventListener('click', (e) => {
        if (!e.target.classList.contains('point') &&
            !e.target.closest('.tooltip')) {
            hideTooltip();
        }
    });
    map.addEventListener('wheel', (e) => {
        e.preventDefault();
        const zoomSpeed = 0.1;
        const delta = e.deltaY > 0 ? -zoomSpeed : zoomSpeed;
        const newScale = Math.max(minScale, Math.min(maxScale, scale + delta));

        const mouseX = e.clientX;
        const mouseY = e.clientY;

        if (newScale !== scale) {
            const scaleRatio = newScale / scale;

            currentPos.x -= (mouseX - currentPos.x) * (scaleRatio - 1);
            currentPos.y -= (mouseY - currentPos.y) * (scaleRatio - 1);
            scale = newScale;
            updateMapInfo();
            requestUpdateTransform();
        }
    });

    zoomInBtn.addEventListener('click', () => {
        if (scale < maxScale) {
            const newScale = Math.min(maxScale, scale + 0.2);
            zoomTowardsCenter(newScale);
        }
    });
    zoomOutBtn.addEventListener('click', () => {
        if (scale > minScale) {
            const newScale = Math.max(minScale, scale - 0.2);
            zoomTowardsCenter(newScale);
        }
    });

    function zoomTowardsCenter(newScale) {
        const scaleRatio = newScale / scale;

        const viewportCenterX = window.innerWidth / 2;
        const viewportCenterY = window.innerHeight / 2;

        currentPos.x -= (viewportCenterX - currentPos.x) * (scaleRatio - 1);
        currentPos.y -= (viewportCenterY - currentPos.y) * (scaleRatio - 1);
        scale = newScale;
        updateMapInfo();
        requestUpdateTransform();
    }
    resetBtn.addEventListener('click', () => {
        scale = 1;
        currentPos = {
            x: window.innerWidth / 2 - mapWidth / 2,
            y: window.innerHeight / 2 - mapHeight / 2
        };
        updateMapInfo();
        requestUpdateTransform();
    });

    function updateMapInfo() {
        const viewportCenterX = (window.innerWidth / 2 - currentPos.x) / scale;
        const viewportCenterY = (window.innerHeight / 2 - currentPos.y) / scale;

        const centerX = mapWidth / 2;
        const centerY = mapHeight / 2;
        const coordX = ((viewportCenterX - centerX) / scaleCoordinates).toFixed(1);
        const coordY = (-((viewportCenterY - centerY) / scaleCoordinates)).toFixed(1);
        mapInfo.textContent = `X: ${coordX} Y: ${coordY} Scale: ${scale.toFixed(1)}`;
    }

    updateMapInfo();

    window.addEventListener('resize', () => {
        currentPos = {
            x: window.innerWidth / 2 - mapWidth / 2,
            y: window.innerHeight / 2 - mapHeight / 2
        };
        updateMapInfo();
        requestUpdateTransform();
        hideTooltip();
    });

    // --- Search ---
    const searchInput = document.getElementById('search-input');
    const searchResults = document.getElementById('search-results');
    let slugSet = new Set();
    let slugToCoords = {};
    let searchTimeout = null;
    let searchAbort = null;
    let selectedSearchIndex = -1;

    // Build lookup after data loads
    function buildSearchIndex() {
        slugSet = new Set(allPoints.map(p => p.slug));
        slugToCoords = {};
        for (const p of allPoints) {
            slugToCoords[p.slug] = p;
        }
    }

    // Rebuild index after the data loads
    const _dataLoadedCheck = setInterval(() => {
        if (allPoints.length > 0) {
            buildSearchIndex();
            clearInterval(_dataLoadedCheck);
        }
    }, 200);

    searchInput.addEventListener('input', () => {
        const query = searchInput.value.trim();
        clearTimeout(searchTimeout);
        if (query.length < 2) {
            searchResults.classList.remove('visible');
            searchResults.innerHTML = '';
            selectedSearchIndex = -1;
            return;
        }
        searchTimeout = setTimeout(() => doSearch(query), 300);
    });

    searchInput.addEventListener('keydown', (e) => {
        const items = searchResults.querySelectorAll('.search-result-item');
        if (!items.length) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedSearchIndex = Math.min(selectedSearchIndex + 1, items.length - 1);
            updateSearchSelection(items);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedSearchIndex = Math.max(selectedSearchIndex - 1, 0);
            updateSearchSelection(items);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (selectedSearchIndex >= 0 && selectedSearchIndex < items.length) {
                items[selectedSearchIndex].click();
            }
        } else if (e.key === 'Escape') {
            searchInput.blur();
            searchResults.classList.remove('visible');
        }
    });

    function updateSearchSelection(items) {
        items.forEach((item, i) => {
            item.classList.toggle('selected', i === selectedSearchIndex);
        });
        if (selectedSearchIndex >= 0 && items[selectedSearchIndex]) {
            items[selectedSearchIndex].scrollIntoView({ block: 'nearest' });
        }
    }

    async function doSearch(query) {
        if (searchAbort) searchAbort.abort();
        searchAbort = new AbortController();

        searchResults.innerHTML = '';
        searchResults.classList.add('visible');
        selectedSearchIndex = -1;

        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'search-empty';
        loadingDiv.textContent = 'Searching...';
        searchResults.appendChild(loadingDiv);

        try {
            const url = `https://corsproxy.io/?url=${encodeURIComponent('https://api.hikka.io/anime?page=1&size=15')}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    query: query,
                    sort: ['score:desc', 'scored_by:desc', 'native_score:desc', 'native_scored_by:desc']
                }),
                signal: searchAbort.signal
            });

            if (!response.ok) throw new Error(`API ${response.status}`);
            const data = await response.json();
            renderSearchResults(data.list || [], query);
        } catch (err) {
            if (err.name === 'AbortError') return;
            console.error('Search error:', err);
            searchResults.innerHTML = '<div class="search-empty">Search failed. Try again.</div>';
        }
    }

    function renderSearchResults(list, query) {
        searchResults.innerHTML = '';

        // Sort: on-map first, then by score desc
        const enriched = list.map(item => ({
            ...item,
            onMap: slugSet.has(item.slug)
        }));
        enriched.sort((a, b) => {
            if (a.onMap !== b.onMap) return a.onMap ? -1 : 1;
            return (b.score || 0) - (a.score || 0);
        });

        if (enriched.length === 0) {
            searchResults.innerHTML = '<div class="search-empty">No results found</div>';
            return;
        }

        const fragment = document.createDocumentFragment();
        for (const item of enriched) {
            const el = document.createElement('div');
            el.className = `search-result-item${item.onMap ? '' : ' not-on-map'}`;
            el.dataset.slug = item.slug;
            el.dataset.onMap = item.onMap ? '1' : '0';

            const title = item.title_ua || item.title_en || item.title_ja || 'Unknown';
            const subtitle = [item.title_en, item.title_ja].filter(t => t && t !== title).join(' / ');
            const mediaType = formatMediaType(item.media_type);
            const score = item.score ? `⭐ ${item.score}` : '';
            const eps = item.episodes_total ? `${item.episodes_released}/${item.episodes_total} ep` : '';

            el.innerHTML = `
                <img class="search-result-img" src="${item.image || ''}" alt="" onerror="this.style.display='none'">
                <div class="search-result-info">
                    <div class="search-result-title">${escapeHtml(title)}</div>
                    <div class="search-result-meta">${[subtitle, mediaType, score, eps].filter(Boolean).join(' · ')}</div>
                </div>
                <span class="search-result-badge ${item.onMap ? 'on-map' : 'off-map'}">${item.onMap ? 'On map' : 'Off map'}</span>
            `;

            el.addEventListener('click', () => handleSearchResultClick(item));
            fragment.appendChild(el);
        }
        searchResults.appendChild(fragment);
        searchResults.classList.add('visible');
    }

    function handleSearchResultClick(item) {
        if (item.onMap && slugToCoords[item.slug]) {
            const p = slugToCoords[item.slug];
            const targetScale = 2;
            const screenX = mapCenterX + p.x * scaleCoordinates;
            const screenY = mapCenterY + p.y * scaleCoordinates;

            scale = targetScale;
            currentPos.x = window.innerWidth / 2 - screenX * scale;
            currentPos.y = window.innerHeight / 2 - screenY * scale;

            updateMapInfo();
            requestUpdateTransform();

            // Show tooltip for the found point
            setTimeout(() => {
                const el = visiblePoints.get(p.slug);
                if (el) {
                    const rect = el.getBoundingClientRect();
                    selectedPointSlug = p.slug;
                    fetchAnimeInfo(p.slug, rect.left + rect.width / 2, rect.top - 15);
                }
            }, 100);
        } else {
            window.open(`https://hikka.io/anime/${item.slug}`, '_blank');
        }

        searchResults.classList.remove('visible');
        searchInput.value = '';
        searchInput.blur();
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // Close search on click outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-container')) {
            searchResults.classList.remove('visible');
        }
    });

    // Re-focus search on "/" key
    document.addEventListener('keydown', (e) => {
        if (e.key === '/' && document.activeElement !== searchInput && !e.target.closest('.search-container')) {
            e.preventDefault();
            searchInput.focus();
        }
    });
});