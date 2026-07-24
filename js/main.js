import { state } from './state.js';
import { initMap2D, updateMapInfo, updateVisiblePoints, navigateToPoint2D } from './map2d.js';
import { initMap3D, setOnExit3DCallback, navigateToPoint3D } from './map3d.js';
import { initClusters, applyClusterFilter } from './clusters.js';
import { initSearch, setSearchCallbacks } from './search.js';

document.addEventListener('DOMContentLoaded', async () => {
    // Cache DOM elements
    state.map = document.getElementById('map');
    state.canvasContainer = document.getElementById('canvas-container');
    state.loading = document.getElementById('loading');
    state.pointLoading = document.getElementById('point-loading');
    state.tooltip = document.getElementById('tooltip');
    state.tooltipContent = document.getElementById('tooltip-content');
    state.zoomInBtn = document.getElementById('zoom-in');
    state.zoomOutBtn = document.getElementById('zoom-out');
    state.resetBtn = document.getElementById('reset');
    state.mapInfo = document.getElementById('map-info');
    state.modeToggle = document.getElementById('mode-toggle');
    state.modeLabel = document.getElementById('mode-label');

    // Initialize modules
    initMap2D();
    initMap3D();
    initSearch();

    // Wire up search callbacks
    setSearchCallbacks({
        onMapSearchClick: (p) => navigateToPoint2D(p),
        on3DSearchClick: (p) => navigateToPoint3D(p),
    });

    // Wire up 3D exit callback
    setOnExit3DCallback(() => {
        applyClusterFilter();
        updateMapInfo();
    });

    // Load data
    try {
        const [mapResponse, colorsResponse] = await Promise.all([
            fetch('anime_map.json'),
            fetch('cluster_colors.json')
        ]);
        state.allPoints = await mapResponse.json();
        state.clusterColors = await colorsResponse.json();
        state.allPoints.sort((a, b) => a.x - b.x);

        // Build slug-to-cluster lookup
        for (const p of state.allPoints) {
            state.slugToCluster.set(p.slug, {
                id: p.cluster,
                color: state.clusterColors[p.cluster] || '#E779C1'
            });
        }

        // Initialize cluster panel (needs clusterColors)
        initClusters();

        updateVisiblePoints(true);
    } catch (error) {
        console.error('Error loading anime points:', error);
        state.allPoints = [];
    }
});
