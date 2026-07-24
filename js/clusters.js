import { state } from './state.js';

export function initClusters() {
    // Initialize selectedClusters with all cluster IDs
    for (const key of Object.keys(state.clusterColors)) {
        state.selectedClusters.add(Number(key));
    }

    setupClusterPanel();
}

function setupClusterPanel() {
    const toggle = document.getElementById('cluster-toggle');
    state.clusterPanel = document.getElementById('cluster-panel');
    state.clusterGrid = document.getElementById('cluster-grid');
    state.clusterCount = document.getElementById('cluster-count');
    state.clusterSearchInput = document.getElementById('cluster-search');
    const selectAllBtn = document.getElementById('cluster-select-all');
    const selectNoneBtn = document.getElementById('cluster-select-none');

    toggle.addEventListener('click', () => {
        state.clusterPanel.classList.toggle('hidden');
    });

    selectAllBtn.addEventListener('click', selectAllClusters);
    selectNoneBtn.addEventListener('click', deselectAllClusters);

    state.clusterSearchInput.addEventListener('input', () => {
        filterClusterGrid(state.clusterSearchInput.value);
    });

    buildClusterGrid();
    updateClusterCount();
}

function buildClusterGrid() {
    const clusterIds = Object.keys(state.clusterColors)
        .map(Number)
        .sort((a, b) => a - b);

    const fragment = document.createDocumentFragment();

    for (const id of clusterIds) {
        const color = state.clusterColors[id];
        const chip = document.createElement('div');
        chip.className = 'cluster-chip selected';
        chip.dataset.cluster = id;
        chip.style.setProperty('--chip-color', color);
        chip.title = `Cluster ${id}`;
        chip.innerHTML = `
            <span class="cluster-chip-dot" style="background-color: ${color}"></span>
            <span class="cluster-chip-label">${id}</span>
        `;
        chip.addEventListener('click', () => toggleCluster(id, chip));
        fragment.appendChild(chip);
    }

    state.clusterGrid.innerHTML = '';
    state.clusterGrid.appendChild(fragment);
}

function toggleCluster(id, chipEl) {
    if (state.selectedClusters.has(id)) {
        state.selectedClusters.delete(id);
        chipEl.classList.remove('selected');
    } else {
        state.selectedClusters.add(id);
        chipEl.classList.add('selected');
    }

    state.allClustersSelected = state.selectedClusters.size === Object.keys(state.clusterColors).length;
    updateClusterCount();
    applyClusterFilter();
}

function selectAllClusters() {
    state.selectedClusters.clear();
    for (const key of Object.keys(state.clusterColors)) {
        state.selectedClusters.add(Number(key));
    }
    state.allClustersSelected = true;
    state.clusterGrid.querySelectorAll('.cluster-chip').forEach(c => c.classList.add('selected'));
    updateClusterCount();
    applyClusterFilter();
}

function deselectAllClusters() {
    state.selectedClusters.clear();
    state.allClustersSelected = false;
    state.clusterGrid.querySelectorAll('.cluster-chip').forEach(c => c.classList.remove('selected'));
    updateClusterCount();
    applyClusterFilter();
}

function updateClusterCount() {
    const total = Object.keys(state.clusterColors).length;
    state.clusterCount.textContent = `${state.selectedClusters.size} / ${total} clusters`;
}

function filterClusterGrid(query) {
    const chips = state.clusterGrid.querySelectorAll('.cluster-chip');
    const q = query.trim().toLowerCase();
    chips.forEach(chip => {
        const id = chip.dataset.cluster;
        chip.style.display = (!q || id.includes(q)) ? '' : 'none';
    });
}

export function applyClusterFilter() {
    if (!state.allClustersSelected) {
        // 2D
        for (const [slug, el] of state.visiblePoints) {
            const info = state.slugToCluster.get(slug);
            if (info) {
                el.classList.toggle('cluster-dimmed', !state.selectedClusters.has(info.id));
            }
        }
        // 3D
        updateThreeColors();
    } else {
        // 2D
        for (const [, el] of state.visiblePoints) {
            el.classList.remove('cluster-dimmed');
        }
        // 3D
        updateThreeColors();
    }
}

export function applyClusterFilterToElement(el, cluster) {
    if (!state.allClustersSelected) {
        el.classList.toggle('cluster-dimmed', !state.selectedClusters.has(cluster));
    } else {
        el.classList.remove('cluster-dimmed');
    }
}

function updateThreeColors() {
    if (!state.threePoints) return;
    const colors = state.threePoints.geometry.attributes.color;
    const n = state.allPoints.length;
    for (let i = 0; i < n; i++) {
        const p = state.allPoints[i];
        const base = state.threeBaseColors[i];
        const selected = state.allClustersSelected || state.selectedClusters.has(p.cluster);
        const factor = selected ? 1.0 : 0.12;
        colors.array[i * 3] = base.r * factor;
        colors.array[i * 3 + 1] = base.g * factor;
        colors.array[i * 3 + 2] = base.b * factor;
    }
    colors.needsUpdate = true;
}
