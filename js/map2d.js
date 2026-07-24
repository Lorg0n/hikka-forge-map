import { state } from './state.js';
import { setsEqual } from './utils.js';
import { hideTooltip, repositionTooltip, fetchAnimeInfo } from './tooltip.js';
import { applyClusterFilterToElement } from './clusters.js';

export function initMap2D() {
    state.currentPos = {
        x: window.innerWidth / 2 - state.mapWidth / 2,
        y: window.innerHeight / 2 - state.mapHeight / 2
    };
    updateMapTransform();
    addCoordinateMarkers();
    updateMapInfo();

    // 2D event listeners
    state.map.addEventListener('click', (e) => {
        if (state.is3DMode) return;
        const pointEl = e.target.closest('.point');
        if (pointEl) {
            e.stopPropagation();
            const slug = pointEl.dataset.slug;
            const r = pointEl.getBoundingClientRect();
            if (state.selectedPointSlug === slug) { hideTooltip(); return; }
            if (state.selectedPointEl) state.selectedPointEl.classList.remove('selected');
            state.selectedPointSlug = slug;
            state.selectedPointEl = pointEl;
            state.selectedPointEl.classList.add('selected');
            fetchAnimeInfo(slug, r.left + r.width / 2, r.top - 15);
        }
    });

    state.map.addEventListener('mousedown', (e) => {
        if (state.is3DMode) return;
        if (e.target === state.map || e.target.classList.contains('axis-x') || e.target.classList.contains('axis-y')) {
            state.isDragging = true; state.map.classList.add('grabbing');
            state.startPos = { x: e.clientX, y: e.clientY };
            if (!e.target.closest('.tooltip')) hideTooltip();
        }
    });
    document.addEventListener('mousemove', (e) => {
        if (state.is3DMode || !state.isDragging) return;
        state.currentPos.x += e.clientX - state.startPos.x;
        state.currentPos.y += e.clientY - state.startPos.y;
        updateMapInfo(); state.startPos = { x: e.clientX, y: e.clientY }; requestUpdateTransform();
    });
    document.addEventListener('mouseup', () => { if (!state.is3DMode) { state.isDragging = false; state.map.classList.remove('grabbing'); } });

    state.map.addEventListener('touchstart', (e) => {
        if (state.is3DMode) return;
        if (e.target === state.map || e.target.classList.contains('axis-x') || e.target.classList.contains('axis-y')) {
            state.isDragging = true; state.startPos = { x: e.touches[0].clientX, y: e.touches[0].clientY }; hideTooltip(); e.preventDefault();
        }
    });
    document.addEventListener('touchmove', (e) => {
        if (state.is3DMode || !state.isDragging) return;
        state.currentPos.x += e.touches[0].clientX - state.startPos.x;
        state.currentPos.y += e.touches[0].clientY - state.startPos.y;
        updateMapInfo(); state.startPos = { x: e.touches[0].clientX, y: e.touches[0].clientY }; requestUpdateTransform(); e.preventDefault();
    });
    document.addEventListener('touchend', () => { if (!state.is3DMode) state.isDragging = false; });

    document.addEventListener('click', (e) => {
        if (!e.target.classList.contains('point') && !e.target.closest('.tooltip') && !e.target.closest('.canvas-container')) hideTooltip();
    });

    state.map.addEventListener('wheel', (e) => {
        if (state.is3DMode) return;
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        const ns = Math.max(state.minScale, Math.min(state.maxScale, state.scale + delta));
        if (ns !== state.scale) {
            const r = ns / state.scale;
            state.currentPos.x -= (e.clientX - state.currentPos.x) * (r - 1);
            state.currentPos.y -= (e.clientY - state.currentPos.y) * (r - 1);
            state.scale = ns; updateMapInfo(); requestUpdateTransform();
        }
    });

    // Zoom buttons (2D)
    state.zoomInBtn.addEventListener('click', () => {
        if (state.is3DMode) return;
        if (state.scale < state.maxScale) {
            zoomTowardsCenter(Math.min(state.maxScale, state.scale + 0.2));
        }
    });
    state.zoomOutBtn.addEventListener('click', () => {
        if (state.is3DMode) return;
        if (state.scale > state.minScale) {
            zoomTowardsCenter(Math.max(state.minScale, state.scale - 0.2));
        }
    });

    state.resetBtn.addEventListener('click', () => {
        if (state.is3DMode) return;
        state.scale = 1;
        state.currentPos = { x: window.innerWidth / 2 - state.mapWidth / 2, y: window.innerHeight / 2 - state.mapHeight / 2 };
        updateMapInfo(); requestUpdateTransform();
    });

    window.addEventListener('resize', () => {
        if (state.is3DMode) return;
        state.currentPos = { x: window.innerWidth / 2 - state.mapWidth / 2, y: window.innerHeight / 2 - state.mapHeight / 2 };
        updateMapInfo(); requestUpdateTransform();
        hideTooltip();
    });
}

export function updateMapInfo() {
    const cx = (window.innerWidth / 2 - state.currentPos.x) / state.scale;
    const cy = (window.innerHeight / 2 - state.currentPos.y) / state.scale;
    state.mapInfo.textContent = `X: ${((cx - state.mapCenterX) / state.scaleCoordinates).toFixed(1)} Y: ${(-((cy - state.mapCenterY) / state.scaleCoordinates)).toFixed(1)} Scale: ${state.scale.toFixed(1)}`;
}

export function updateMapTransform() {
    state.map.style.transform = `translate(${state.currentPos.x}px, ${state.currentPos.y}px) scale(${state.scale})`;
}

export function requestUpdateTransform() {
    if (!state.transformPending) {
        state.transformPending = true;
        requestAnimationFrame(() => {
            updateMapTransform();
            updateVisiblePoints();
            repositionTooltip();
            state.transformPending = false;
        });
    }
}

export function updateVisiblePoints(forceUpdate = false) {
    const vL = -state.currentPos.x / state.scale - state.viewportBuffer;
    const vT = -state.currentPos.y / state.scale - state.viewportBuffer;
    const vR = (window.innerWidth - state.currentPos.x) / state.scale + state.viewportBuffer;
    const vB = (window.innerHeight - state.currentPos.y) / state.scale + state.viewportBuffer;

    let lo = 0, hi = state.allPoints.length;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (state.mapCenterX + state.allPoints[mid].x * state.scaleCoordinates < vL) lo = mid + 1;
        else hi = mid;
    }

    const newVisibleSlugs = new Set();
    for (let i = lo; i < state.allPoints.length; i++) {
        const p = state.allPoints[i];
        const sx = state.mapCenterX + p.x * state.scaleCoordinates;
        if (sx > vR) break;
        const sy = state.mapCenterY + p.y * state.scaleCoordinates;
        if (sy >= vT && sy <= vB) newVisibleSlugs.add(p.slug);
    }

    if (!forceUpdate && setsEqual(newVisibleSlugs, state.visiblePoints.keys())) return;

    for (const [slug, el] of state.visiblePoints) {
        if (!newVisibleSlugs.has(slug)) { el.remove(); state.visiblePoints.delete(slug); }
    }

    const fragment = document.createDocumentFragment();
    for (const p of state.allPoints) {
        if (!newVisibleSlugs.has(p.slug) || state.visiblePoints.has(p.slug)) continue;
        const el = document.createElement('div');
        el.className = 'point';
        el.style.left = `${state.mapCenterX + p.x * state.scaleCoordinates}px`;
        el.style.top = `${state.mapCenterY + p.y * state.scaleCoordinates}px`;
        el.dataset.slug = p.slug;
        el.dataset.x = p.x;
        el.dataset.y = p.y;
        el.style.setProperty('--cluster-color', state.clusterColors[p.cluster] || '#E779C1');
        applyClusterFilterToElement(el, p.cluster);
        fragment.appendChild(el);
        state.visiblePoints.set(p.slug, el);
    }
    state.map.appendChild(fragment);
}

function addCoordinateMarkers() {
    const step = 500;
    const fragment = document.createDocumentFragment();
    for (let x = 0; x <= state.mapWidth; x += step) {
        if (x === state.mapCenterX) continue;
        const marker = document.createElement('div');
        marker.className = 'coordinate-marker';
        marker.textContent = (x - state.mapCenterX) / state.scaleCoordinates;
        marker.style.left = `${x}px`;
        marker.style.top = `${state.mapCenterY + 15}px`;
        fragment.appendChild(marker);
    }
    for (let y = 0; y <= state.mapHeight; y += step) {
        if (y === state.mapCenterY) continue;
        const marker = document.createElement('div');
        marker.className = 'coordinate-marker';
        marker.textContent = -((y - state.mapCenterY) / state.scaleCoordinates);
        marker.style.left = `${state.mapCenterX + 15}px`;
        marker.style.top = `${y}px`;
        fragment.appendChild(marker);
    }
    const c = document.createElement('div');
    c.className = 'coordinate-marker';
    c.textContent = '0,0';
    c.style.left = `${state.mapCenterX}px`;
    c.style.top = `${state.mapCenterY}px`;
    fragment.appendChild(c);
    state.map.appendChild(fragment);
}

function zoomTowardsCenter(ns) {
    const r = ns / state.scale, cx = window.innerWidth / 2, cy = window.innerHeight / 2;
    state.currentPos.x -= (cx - state.currentPos.x) * (r - 1);
    state.currentPos.y -= (cy - state.currentPos.y) * (r - 1);
    state.scale = ns; updateMapInfo(); requestUpdateTransform();
}

// Called from main.js for search result navigation
export function navigateToPoint2D(p) {
    state.scale = 2;
    state.currentPos.x = window.innerWidth / 2 - (state.mapCenterX + p.x * state.scaleCoordinates) * state.scale;
    state.currentPos.y = window.innerHeight / 2 - (state.mapCenterY + p.y * state.scaleCoordinates) * state.scale;
    updateMapInfo(); requestUpdateTransform();
    setTimeout(() => {
        const el = state.visiblePoints.get(p.slug);
        if (el) {
            if (state.selectedPointEl) state.selectedPointEl.classList.remove('selected');
            state.selectedPointSlug = p.slug; state.selectedPointEl = el; state.selectedPointEl.classList.add('selected');
            const r = el.getBoundingClientRect();
            fetchAnimeInfo(p.slug, r.left + r.width / 2, r.top - 15);
        }
    }, 100);
}
