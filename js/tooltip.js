import * as THREE from 'three';
import { state } from './state.js';
import { formatMediaType } from './utils.js';

export async function fetchAnimeInfo(slug, x, y) {
    state.pointLoading.style.left = `${x}px`;
    state.pointLoading.style.top = `${y}px`;
    state.pointLoading.style.display = 'block';

    if (state.animeCache[slug]) {
        state.pointLoading.style.display = 'none';
        renderTooltip(state.animeCache[slug], x, y);
        return;
    }
    try {
        const response = await fetch(`https://corsproxy.io/?url=https://api.hikka.io/anime/${slug}`, {
            headers: { accept: 'application/json' }
        });
        if (!response.ok) throw new Error(`API ${response.status}`);
        const data = await response.json();
        state.animeCache[slug] = data;
        renderTooltip(data, x, y);
    } catch (error) {
        console.error('Error fetching anime info:', error);
        const demoData = {
            title_ua: 'This wonderful world, blessed by God!',
            title_en: 'KonoSuba: God\'s Blessing on This Wonderful World!',
            title_ja: 'Kono Subarashii Sekai ni Shukufuku wo!',
            image: 'https://cdn.hikka.io/hikka.jpg',
            synopsis_en: 'After dying a laughable and pathetic death on his way back from buying a game...',
            episodes_total: 10, episodes_released: 10,
            status: 'finished', media_type: 'tv', score: 8.11,
            genres: [{ name_en: 'Comedy', name_ua: 'Comedy' }]
        };
        state.animeCache[slug] = demoData;
        renderTooltip(demoData, x, y);
    } finally {
        state.pointLoading.style.display = 'none';
    }
}

export function renderTooltip(data, x, y) {
    const clusterInfo = state.slugToCluster.get(data.slug);
    const clusterBadge = clusterInfo
        ? `<div class="tooltip-cluster-badge" style="--badge-color: ${clusterInfo.color}">
               <span class="tooltip-cluster-dot"></span>
               Cluster ${clusterInfo.id}
           </div>`
        : '';

    state.tooltipContent.innerHTML = `
        <a href="https://hikka.io/anime/${data.slug}" target="_blank" class="tooltip-img-link">
            <div class="tooltip-img-skeleton"></div>
            <img class="tooltip-img" src="${data.image}" alt="${data.title_en}"
                 onload="this.classList.add('loaded'); this.previousElementSibling.style.display='none'"
                 onerror="this.src='https://via.placeholder.com/300x150?text=No+Image'">
        </a>
        <div class="tooltip-info-col">
            <a href="https://hikka.io/anime/${data.slug}" target="_blank" class="tooltip-title-link">
                <h3 class="tooltip-title">${data.title_ua || data.title_en || data.title_ja}</h3>
            </a>
            ${data.title_ja ? `<p class="tooltip-subtitle">${data.title_ja}</p>` : ''}
            ${data.synopsis_ua ? `<div class="tooltip-desc">${data.synopsis_ua.slice(0, 150)}${data.synopsis_ua.length > 150 ? '...' : ''}</div>` : ''}
            <div class="tooltip-info">
                ${data.score ? `<span>${data.score}</span>` : ''}
                ${data.media_type ? `<span>${formatMediaType(data.media_type)}</span>` : ''}
                ${data.episodes_total ? `<span>${data.episodes_released}/${data.episodes_total} eps.</span>` : ''}
            </div>
            ${clusterBadge}
        </div>
    `;
    state.tooltip.style.left = `${x}px`;
    state.tooltip.style.top = `${y}px`;
    state.tooltip.style.transform = 'translate(-50%, -100%)';
    state.tooltip.style.display = 'block';
    state.tooltipVisible = true;
    setTimeout(() => {
        const tr = state.tooltip.getBoundingClientRect();
        let tx = '-50%', ty = '-100%';
        if (tr.right > window.innerWidth) {
            state.tooltip.style.left = `${window.innerWidth - tr.width - 10}px`; tx = '0';
        } else if (tr.left < 0) {
            state.tooltip.style.left = '10px'; tx = '0';
        }
        const ur = state.tooltip.getBoundingClientRect();
        if (ur.top < 0) { state.tooltip.style.top = `${y + 20}px`; ty = '0'; }
        state.tooltip.style.transform = `translate(${tx}, ${ty})`;
    }, 0);
}

export function hideTooltip() {
    state.tooltip.style.display = 'none';
    state.tooltipVisible = false;
    if (state.selectedPointEl) { state.selectedPointEl.classList.remove('selected'); state.selectedPointEl = null; }
    state.selectedPointSlug = null;
    if (state.is3DMode) clearHighlight3D();
}

export function repositionTooltip() {
    if (!state.tooltipVisible || !state.selectedPointEl) return;
    const rect = state.selectedPointEl.getBoundingClientRect();
    const x = rect.left + rect.width / 2, y = rect.top - 15;
    state.tooltip.style.left = `${x}px`;
    state.tooltip.style.top = `${y}px`;
    const tr = state.tooltip.getBoundingClientRect();
    let tx = '-50%', ty = '-100%';
    if (tr.right > window.innerWidth) { state.tooltip.style.left = `${window.innerWidth - tr.width - 10}px`; tx = '0'; }
    else if (tr.left < 0) { state.tooltip.style.left = '10px'; tx = '0'; }
    const ur = state.tooltip.getBoundingClientRect();
    if (ur.top < 0) { state.tooltip.style.top = `${rect.bottom + 15}px`; ty = '0'; }
    else if (ur.bottom > window.innerHeight) { state.tooltip.style.top = `${rect.top - 15}px`; ty = '-100%'; }
    state.tooltip.style.transform = `translate(${tx}, ${ty})`;
}

export function highlight3DPoint(slug) {
    const pt = state.threeSlugToPoint[slug];
    if (!pt || !state.threeSelectedPoint) return;
    const pos = state.threeSelectedPoint.geometry.attributes.position;
    pos.setXYZ(0, (pt.x3d || 0) * state.THREE_SCALE, (pt.y3d || 0) * state.THREE_SCALE, (pt.z3d || 0) * state.THREE_SCALE);
    pos.needsUpdate = true;
    state.threeSelectedPoint.visible = true;
    state.threeSelectedSlug = slug;
}

export function clearHighlight3D() {
    if (state.threeSelectedPoint) state.threeSelectedPoint.visible = false;
    state.threeSelectedSlug = null;
}

export function repositionTooltip3D() {
    if (!state.tooltipVisible || !state.threeSelectedSlug || !state.is3DMode) return;
    const pt = state.threeSlugToPoint[state.threeSelectedSlug];
    if (!pt) return;
    const worldPos = new THREE.Vector3(
        (pt.x3d || 0) * state.THREE_SCALE,
        (pt.y3d || 0) * state.THREE_SCALE,
        (pt.z3d || 0) * state.THREE_SCALE
    );
    const screenPos = threeToScreen(worldPos);
    state.tooltip.style.left = `${screenPos.x}px`;
    state.tooltip.style.top = `${screenPos.y - 15}px`;
    state.tooltip.style.transform = 'translate(-50%, -100%)';
    const tr = state.tooltip.getBoundingClientRect();
    let tx = '-50%', ty = '-100%';
    if (tr.right > window.innerWidth) { state.tooltip.style.left = `${window.innerWidth - tr.width - 10}px`; tx = '0'; }
    else if (tr.left < 0) { state.tooltip.style.left = '10px'; tx = '0'; }
    const ur = state.tooltip.getBoundingClientRect();
    if (ur.top < 0) { state.tooltip.style.top = `${screenPos.y + 20}px`; ty = '0'; }
    else if (ur.bottom > window.innerHeight) { state.tooltip.style.top = `${screenPos.y - 15}px`; ty = '-100%'; }
    state.tooltip.style.transform = `translate(${tx}, ${ty})`;
}

function threeToScreen(worldPos) {
    const v = worldPos.clone().project(state.threeCamera);
    return {
        x: (v.x * 0.5 + 0.5) * window.innerWidth,
        y: (-v.y * 0.5 + 0.5) * window.innerHeight
    };
}

export { threeToScreen };
