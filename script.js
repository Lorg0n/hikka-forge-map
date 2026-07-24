import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

document.addEventListener('DOMContentLoaded', async () => {
    const map = document.getElementById('map');
    const canvasContainer = document.getElementById('canvas-container');
    const loading = document.getElementById('loading');
    const pointLoading = document.getElementById('point-loading');
    const tooltip = document.getElementById('tooltip');
    const tooltipContent = document.getElementById('tooltip-content');
    const zoomInBtn = document.getElementById('zoom-in');
    const zoomOutBtn = document.getElementById('zoom-out');
    const resetBtn = document.getElementById('reset');
    const mapInfo = document.getElementById('map-info');
    const modeToggle = document.getElementById('mode-toggle');
    const modeLabel = document.getElementById('mode-label');

    const mapWidth = 6000;
    const mapHeight = 6000;
    const mapCenterX = mapWidth / 2;
    const mapCenterY = mapHeight / 2;
    const scaleCoordinates = 20;
    const viewportBuffer = 500;

    let isDragging = false;
    let startPos = { x: 0, y: 0 };
    let currentPos = { x: 0, y: 0 };
    let scale = 1;
    const maxScale = 5;
    const minScale = 0.1;
    let activePointSlug = null;
    let selectedPointSlug = null;
    let selectedPointEl = null;
    let tooltipVisible = false;
    let tooltipTimer = null;
    let animeCache = {};
    let allPoints = [];
    let visiblePoints = new Map();
    let clusterColors = {};
    let transformPending = false;

    // --- 3D mode state ---
    let is3DMode = false;
    let threeScene = null;
    let threeCamera = null;
    let threeRenderer = null;
    let threeControls = null;
    let threePoints = null;
    let threeRaycaster = new THREE.Raycaster();
    let threeMouse = new THREE.Vector2();
    let threeSlugIndex = [];
    let threeSlugToPoint = {};
    let threeAnimating = false;
    let threeSelectedPoint = null;
    let threeSelectedSlug = null;
    let threeIsOrbiting = false;
    let threeOrbitStartX = 0;
    let threeOrbitStartY = 0;
    let threeLastPointerX = 0;
    let threeLastPointerY = 0;
    const THREE_SCALE = 3;

    currentPos = {
        x: window.innerWidth / 2 - mapWidth / 2,
        y: window.innerHeight / 2 - mapHeight / 2
    };
    updateMapTransform();
    addCoordinateMarkers();

    try {
        const [mapResponse, colorsResponse] = await Promise.all([
            fetch('anime_map.json'),
            fetch('cluster_colors.json')
        ]);
        allPoints = await mapResponse.json();
        clusterColors = await colorsResponse.json();
        allPoints.sort((a, b) => a.x - b.x);
        updateVisiblePoints(true);
        buildThreeData();
    } catch (error) {
        console.error('Error loading anime points:', error);
        allPoints = [];
    }

    // =========================================================
    // 3D MODE — Three.js
    // =========================================================

    function initThreeJS() {
        if (threeScene) return;

        threeScene = new THREE.Scene();
        threeScene.background = new THREE.Color(0x080808);

        threeCamera = new THREE.PerspectiveCamera(
            60, window.innerWidth / window.innerHeight, 0.1, 100000
        );
        threeCamera.position.set(0, 200, 300);

        threeRenderer = new THREE.WebGLRenderer({ antialias: true });
        threeRenderer.setSize(window.innerWidth, window.innerHeight);
        threeRenderer.setPixelRatio(window.devicePixelRatio);
        canvasContainer.appendChild(threeRenderer.domElement);

        threeControls = new OrbitControls(threeCamera, threeRenderer.domElement);
        threeControls.enableDamping = true;
        threeControls.dampingFactor = 0.08;
        threeControls.rotateSpeed = 0.6;
        threeControls.panSpeed = 0.8;
        threeControls.zoomSpeed = 1.2;
        threeControls.mouseButtons = {
            LEFT: THREE.MOUSE.ROTATE,
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT: THREE.MOUSE.PAN
        };
        threeControls.target.set(0, 0, 0);
        threeControls.update();

        const gridHelper = new THREE.GridHelper(600, 30, 0x222222, 0x151515);
        threeScene.add(gridHelper);
        threeScene.add(new THREE.AmbientLight(0xffffff, 1.0));

        threeControls.addEventListener('start', () => {
            threeIsOrbiting = true;
            threeOrbitStartX = threeLastPointerX;
            threeOrbitStartY = threeLastPointerY;
        });
        threeControls.addEventListener('change', () => {
            if (is3DMode) updateMapInfo3D();
        });
        threeControls.addEventListener('end', () => {
            threeIsOrbiting = false;
            const dx = threeLastPointerX - threeOrbitStartX;
            const dy = threeLastPointerY - threeOrbitStartY;
            if (Math.sqrt(dx * dx + dy * dy) > 8) {
                hideTooltip();
                clearHighlight3D();
            }
        });
    }

    function buildThreeData() {
        threeSlugIndex = [];
        threeSlugToPoint = {};
        for (const p of allPoints) {
            threeSlugIndex.push(p.slug);
            threeSlugToPoint[p.slug] = { x3d: p.x3d || 0, y3d: p.y3d || 0, z3d: p.z3d || 0 };
        }
    }

    function createThreePoints() {
        if (threePoints) {
            threeScene.remove(threePoints);
            threePoints.geometry.dispose();
            threePoints.material.dispose();
        }

        const n = allPoints.length;
        const positions = new Float32Array(n * 3);
        const colors = new Float32Array(n * 3);
        const tempColor = new THREE.Color();

        for (let i = 0; i < n; i++) {
            const p = allPoints[i];
            positions[i * 3]     = (p.x3d || 0) * THREE_SCALE;
            positions[i * 3 + 1] = (p.y3d || 0) * THREE_SCALE;
            positions[i * 3 + 2] = (p.z3d || 0) * THREE_SCALE;

            const hex = clusterColors[p.cluster] || '#E779C1';
            tempColor.set(hex);
            colors[i * 3]     = tempColor.r;
            colors[i * 3 + 1] = tempColor.g;
            colors[i * 3 + 2] = tempColor.b;
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        threePoints = new THREE.Points(geometry, new THREE.PointsMaterial({
            size: 3,
            sizeAttenuation: false,
            vertexColors: true,
        }));
        threeScene.add(threePoints);

        // Highlight marker for selected point (circular, always on top)
        if (threeSelectedPoint) {
            threeScene.remove(threeSelectedPoint);
            threeSelectedPoint.geometry.dispose();
            threeSelectedPoint.material.dispose();
        }
        const circleSize = 64;
        const circleCanvas = document.createElement('canvas');
        circleCanvas.width = circleSize;
        circleCanvas.height = circleSize;
        const circleCtx = circleCanvas.getContext('2d');
        circleCtx.beginPath();
        circleCtx.arc(circleSize / 2, circleSize / 2, circleSize / 2, 0, Math.PI * 2);
        circleCtx.fillStyle = '#ffffff';
        circleCtx.fill();
        const circleTexture = new THREE.CanvasTexture(circleCanvas);

        const highlightGeo = new THREE.BufferGeometry();
        highlightGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));
        const highlightMat = new THREE.PointsMaterial({
            size: 12,
            sizeAttenuation: false,
            map: circleTexture,
            transparent: true,
            opacity: 0.9,
            depthTest: false,
            depthWrite: false,
        });
        threeSelectedPoint = new THREE.Points(highlightGeo, highlightMat);
        threeSelectedPoint.visible = false;
        threeSelectedPoint.renderOrder = 999;
        threeScene.add(threeSelectedPoint);
    }

    function startThreeRenderLoop() {
        if (threeAnimating) return;
        threeAnimating = true;
        (function animate() {
            if (!is3DMode) { threeAnimating = false; return; }
            requestAnimationFrame(animate);
            threeControls.update();
            if (threeSelectedPoint && threeSelectedPoint.visible) {
                threeSelectedPoint.material.opacity = 0.65 + 0.35 * Math.sin(performance.now() * 0.004);
            }
            repositionTooltip3D();
            threeRenderer.render(threeScene, threeCamera);
        })();
    }

    function stopThreeRenderLoop() { threeAnimating = false; }

    function enter3DMode() {
        is3DMode = true;
        initThreeJS();
        createThreePoints();
        map.classList.add('hidden');
        canvasContainer.classList.remove('hidden');
        modeLabel.textContent = '2D';
        threeRenderer.setSize(window.innerWidth, window.innerHeight);
        threeCamera.aspect = window.innerWidth / window.innerHeight;
        threeCamera.updateProjectionMatrix();
        hideTooltip();
        clearHighlight3D();
        updateMapInfo3D();
        startThreeRenderLoop();
    }

    function exit3DMode() {
        is3DMode = false;
        canvasContainer.classList.add('hidden');
        map.classList.remove('hidden');
        modeLabel.textContent = '3D';
        hideTooltip();
        stopThreeRenderLoop();
        updateMapInfo();
    }

    modeToggle.addEventListener('click', () => {
        is3DMode ? exit3DMode() : enter3DMode();
    });

    // =========================================================
    // 3D click + tooltip
    // =========================================================

    canvasContainer.addEventListener('click', (event) => {
        if (!is3DMode || !threePoints) return;
        const rect = threeRenderer.domElement.getBoundingClientRect();
        threeMouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        threeMouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        threeRaycaster.setFromCamera(threeMouse, threeCamera);
        const intersects = threeRaycaster.intersectObject(threePoints);

        if (intersects.length > 0) {
            const slug = threeSlugIndex[intersects[0].index];
            if (!slug) return;
            if (selectedPointSlug === slug) { hideTooltip(); clearHighlight3D(); return; }
            clearHighlight3D();
            selectedPointSlug = slug;
            highlight3DPoint(slug);
            const screenPos = threeToScreen(intersects[0].point);
            fetchAnimeInfo(slug, screenPos.x, screenPos.y - 15);
        } else {
            hideTooltip();
            clearHighlight3D();
        }
    });

    canvasContainer.addEventListener('pointermove', (e) => {
        threeLastPointerX = e.clientX;
        threeLastPointerY = e.clientY;
    });

    function threeToScreen(worldPos) {
        const v = worldPos.clone().project(threeCamera);
        return {
            x: (v.x * 0.5 + 0.5) * window.innerWidth,
            y: (-v.y * 0.5 + 0.5) * window.innerHeight
        };
    }

    function highlight3DPoint(slug) {
        const pt = threeSlugToPoint[slug];
        if (!pt || !threeSelectedPoint) return;
        const pos = threeSelectedPoint.geometry.attributes.position;
        pos.setXYZ(0, (pt.x3d || 0) * THREE_SCALE, (pt.y3d || 0) * THREE_SCALE, (pt.z3d || 0) * THREE_SCALE);
        pos.needsUpdate = true;
        threeSelectedPoint.visible = true;
        threeSelectedSlug = slug;
    }

    function clearHighlight3D() {
        if (threeSelectedPoint) threeSelectedPoint.visible = false;
        threeSelectedSlug = null;
    }

    function repositionTooltip3D() {
        if (!tooltipVisible || !threeSelectedSlug || !is3DMode) return;
        const pt = threeSlugToPoint[threeSelectedSlug];
        if (!pt) return;
        const worldPos = new THREE.Vector3(
            (pt.x3d || 0) * THREE_SCALE,
            (pt.y3d || 0) * THREE_SCALE,
            (pt.z3d || 0) * THREE_SCALE
        );
        const screenPos = threeToScreen(worldPos);
        tooltip.style.left = `${screenPos.x}px`;
        tooltip.style.top = `${screenPos.y - 15}px`;
        tooltip.style.transform = 'translate(-50%, -100%)';
        const tr = tooltip.getBoundingClientRect();
        let tx = '-50%', ty = '-100%';
        if (tr.right > window.innerWidth) { tooltip.style.left = `${window.innerWidth - tr.width - 10}px`; tx = '0'; }
        else if (tr.left < 0) { tooltip.style.left = '10px'; tx = '0'; }
        const ur = tooltip.getBoundingClientRect();
        if (ur.top < 0) { tooltip.style.top = `${screenPos.y + 20}px`; ty = '0'; }
        else if (ur.bottom > window.innerHeight) { tooltip.style.top = `${screenPos.y - 15}px`; ty = '-100%'; }
        tooltip.style.transform = `translate(${tx}, ${ty})`;
    }

    function updateMapInfo3D() {
        if (!threeCamera || !threeControls) return;
        const dist = threeCamera.position.distanceTo(threeControls.target);
        const azimuth = THREE.MathUtils.radToDeg(threeControls.getAzimuthalAngle()).toFixed(0);
        const polar = THREE.MathUtils.radToDeg(threeControls.getPolarAngle()).toFixed(0);
        mapInfo.textContent = `Azimuth: ${azimuth}\u00B0 Polar: ${polar}\u00B0 Dist: ${dist.toFixed(0)}`;
    }

    // =========================================================
    // 2D MAP
    // =========================================================

    function addCoordinateMarkers() {
        const step = 500;
        const fragment = document.createDocumentFragment();
        for (let x = 0; x <= mapWidth; x += step) {
            if (x === mapCenterX) continue;
            const marker = document.createElement('div');
            marker.className = 'coordinate-marker';
            marker.textContent = (x - mapCenterX) / scaleCoordinates;
            marker.style.left = `${x}px`;
            marker.style.top = `${mapCenterY + 15}px`;
            fragment.appendChild(marker);
        }
        for (let y = 0; y <= mapHeight; y += step) {
            if (y === mapCenterY) continue;
            const marker = document.createElement('div');
            marker.className = 'coordinate-marker';
            marker.textContent = -((y - mapCenterY) / scaleCoordinates);
            marker.style.left = `${mapCenterX + 15}px`;
            marker.style.top = `${y}px`;
            fragment.appendChild(marker);
        }
        const c = document.createElement('div');
        c.className = 'coordinate-marker';
        c.textContent = '0,0';
        c.style.left = `${mapCenterX}px`;
        c.style.top = `${mapCenterY}px`;
        fragment.appendChild(c);
        map.appendChild(fragment);
    }

    function updateVisiblePoints(forceUpdate = false) {
        const vL = -currentPos.x / scale - viewportBuffer;
        const vT = -currentPos.y / scale - viewportBuffer;
        const vR = (window.innerWidth - currentPos.x) / scale + viewportBuffer;
        const vB = (window.innerHeight - currentPos.y) / scale + viewportBuffer;

        let lo = 0, hi = allPoints.length;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (mapCenterX + allPoints[mid].x * scaleCoordinates < vL) lo = mid + 1;
            else hi = mid;
        }

        const newVisibleSlugs = new Set();
        for (let i = lo; i < allPoints.length; i++) {
            const p = allPoints[i];
            const sx = mapCenterX + p.x * scaleCoordinates;
            if (sx > vR) break;
            const sy = mapCenterY + p.y * scaleCoordinates;
            if (sy >= vT && sy <= vB) newVisibleSlugs.add(p.slug);
        }

        if (!forceUpdate && setsEqual(newVisibleSlugs, visiblePoints.keys())) return;

        for (const [slug, el] of visiblePoints) {
            if (!newVisibleSlugs.has(slug)) { el.remove(); visiblePoints.delete(slug); }
        }

        const fragment = document.createDocumentFragment();
        for (const p of allPoints) {
            if (!newVisibleSlugs.has(p.slug) || visiblePoints.has(p.slug)) continue;
            const el = document.createElement('div');
            el.className = 'point';
            el.style.left = `${mapCenterX + p.x * scaleCoordinates}px`;
            el.style.top = `${mapCenterY + p.y * scaleCoordinates}px`;
            el.dataset.slug = p.slug;
            el.dataset.x = p.x;
            el.dataset.y = p.y;
            el.style.setProperty('--cluster-color', clusterColors[p.cluster] || '#E779C1');
            fragment.appendChild(el);
            visiblePoints.set(p.slug, el);
        }
        map.appendChild(fragment);
    }

    function setsEqual(a, b) {
        if (a.size !== b.size) return false;
        for (const v of a) if (!b.has(v)) return false;
        return true;
    }

    function requestUpdateTransform() {
        if (!transformPending) {
            transformPending = true;
            requestAnimationFrame(() => {
                updateMapTransform();
                updateVisiblePoints();
                repositionTooltip();
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
                headers: { 'accept': 'application/json' }
            });
            if (!response.ok) throw new Error(`API ${response.status}`);
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
                "synopsis_en": "After dying a laughable and pathetic death on his way back from buying a game...",
                "episodes_total": 10, "episodes_released": 10,
                "status": "finished", "media_type": "tv", "score": 8.11,
                "genres": [{ "name_en": "Comedy", "name_ua": "Comedy" }]
            };
            animeCache[slug] = demoData;
            renderTooltip(demoData, x, y);
        } finally {
            pointLoading.style.display = 'none';
        }
    }

    function renderTooltip(data, x, y) {
        tooltipContent.innerHTML = `
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
            </div>
        `;
        tooltip.style.left = `${x}px`;
        tooltip.style.top = `${y}px`;
        tooltip.style.transform = 'translate(-50%, -100%)';
        tooltip.style.display = 'block';
        tooltipVisible = true;
        setTimeout(() => {
            const tr = tooltip.getBoundingClientRect();
            let tx = '-50%', ty = '-100%';
            if (tr.right > window.innerWidth) {
                tooltip.style.left = `${window.innerWidth - tr.width - 10}px`; tx = '0';
            } else if (tr.left < 0) {
                tooltip.style.left = '10px'; tx = '0';
            }
            const ur = tooltip.getBoundingClientRect();
            if (ur.top < 0) { tooltip.style.top = `${y + 20}px`; ty = '0'; }
            tooltip.style.transform = `translate(${tx}, ${ty})`;
        }, 0);
    }

    function hideTooltip() {
        tooltip.style.display = 'none';
        tooltipVisible = false;
        if (selectedPointEl) { selectedPointEl.classList.remove('selected'); selectedPointEl = null; }
        selectedPointSlug = null;
        if (is3DMode) clearHighlight3D();
    }

    function repositionTooltip() {
        if (!tooltipVisible || !selectedPointEl) return;
        const rect = selectedPointEl.getBoundingClientRect();
        const x = rect.left + rect.width / 2, y = rect.top - 15;
        tooltip.style.left = `${x}px`;
        tooltip.style.top = `${y}px`;
        const tr = tooltip.getBoundingClientRect();
        let tx = '-50%', ty = '-100%';
        if (tr.right > window.innerWidth) { tooltip.style.left = `${window.innerWidth - tr.width - 10}px`; tx = '0'; }
        else if (tr.left < 0) { tooltip.style.left = '10px'; tx = '0'; }
        const ur = tooltip.getBoundingClientRect();
        if (ur.top < 0) { tooltip.style.top = `${rect.bottom + 15}px`; ty = '0'; }
        else if (ur.bottom > window.innerHeight) { tooltip.style.top = `${rect.top - 15}px`; ty = '-100%'; }
        tooltip.style.transform = `translate(${tx}, ${ty})`;
    }

    function formatMediaType(type) {
        return ({ 'tv':'TV', 'movie':'Movie', 'ova':'OVA', 'ona':'ONA', 'special':'Special', 'music':'Music Video' })[type] || type;
    }

    // =========================================================
    // 2D event listeners
    // =========================================================

    map.addEventListener('click', (e) => {
        if (is3DMode) return;
        const pointEl = e.target.closest('.point');
        if (pointEl) {
            e.stopPropagation();
            const slug = pointEl.dataset.slug;
            const r = pointEl.getBoundingClientRect();
            if (selectedPointSlug === slug) { hideTooltip(); return; }
            if (selectedPointEl) selectedPointEl.classList.remove('selected');
            selectedPointSlug = slug;
            selectedPointEl = pointEl;
            selectedPointEl.classList.add('selected');
            fetchAnimeInfo(slug, r.left + r.width / 2, r.top - 15);
        }
    });

    map.addEventListener('mousedown', (e) => {
        if (is3DMode) return;
        if (e.target === map || e.target.classList.contains('axis-x') || e.target.classList.contains('axis-y')) {
            isDragging = true; map.classList.add('grabbing');
            startPos = { x: e.clientX, y: e.clientY };
            if (!e.target.closest('.tooltip')) hideTooltip();
        }
    });
    document.addEventListener('mousemove', (e) => {
        if (is3DMode || !isDragging) return;
        currentPos.x += e.clientX - startPos.x;
        currentPos.y += e.clientY - startPos.y;
        updateMapInfo(); startPos = { x: e.clientX, y: e.clientY }; requestUpdateTransform();
    });
    document.addEventListener('mouseup', () => { if (!is3DMode) { isDragging = false; map.classList.remove('grabbing'); } });

    map.addEventListener('touchstart', (e) => {
        if (is3DMode) return;
        if (e.target === map || e.target.classList.contains('axis-x') || e.target.classList.contains('axis-y')) {
            isDragging = true; startPos = { x: e.touches[0].clientX, y: e.touches[0].clientY }; hideTooltip(); e.preventDefault();
        }
    });
    document.addEventListener('touchmove', (e) => {
        if (is3DMode || !isDragging) return;
        currentPos.x += e.touches[0].clientX - startPos.x;
        currentPos.y += e.touches[0].clientY - startPos.y;
        updateMapInfo(); startPos = { x: e.touches[0].clientX, y: e.touches[0].clientY }; requestUpdateTransform(); e.preventDefault();
    });
    document.addEventListener('touchend', () => { if (!is3DMode) isDragging = false; });

    document.addEventListener('click', (e) => {
        if (!e.target.classList.contains('point') && !e.target.closest('.tooltip') && !e.target.closest('.canvas-container')) hideTooltip();
    });

    map.addEventListener('wheel', (e) => {
        if (is3DMode) return;
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        const ns = Math.max(minScale, Math.min(maxScale, scale + delta));
        if (ns !== scale) {
            const r = ns / scale;
            currentPos.x -= (e.clientX - currentPos.x) * (r - 1);
            currentPos.y -= (e.clientY - currentPos.y) * (r - 1);
            scale = ns; updateMapInfo(); requestUpdateTransform();
        }
    });

    // Zoom buttons
    zoomInBtn.addEventListener('click', () => {
        if (is3DMode) {
            threeCamera.position.lerp(threeControls.target, 0.15);
            updateMapInfo3D();
        } else if (scale < maxScale) {
            zoomTowardsCenter(Math.min(maxScale, scale + 0.2));
        }
    });
    zoomOutBtn.addEventListener('click', () => {
        if (is3DMode) {
            const dir = threeCamera.position.clone().sub(threeControls.target).normalize();
            threeCamera.position.add(dir.multiplyScalar(50));
            updateMapInfo3D();
        } else if (scale > minScale) {
            zoomTowardsCenter(Math.max(minScale, scale - 0.2));
        }
    });

    function zoomTowardsCenter(ns) {
        const r = ns / scale, cx = window.innerWidth / 2, cy = window.innerHeight / 2;
        currentPos.x -= (cx - currentPos.x) * (r - 1);
        currentPos.y -= (cy - currentPos.y) * (r - 1);
        scale = ns; updateMapInfo(); requestUpdateTransform();
    }

    resetBtn.addEventListener('click', () => {
        if (is3DMode) {
            threeCamera.position.set(0, 200, 300);
            threeControls.target.set(0, 0, 0);
            threeControls.update(); updateMapInfo3D();
        } else {
            scale = 1;
            currentPos = { x: window.innerWidth / 2 - mapWidth / 2, y: window.innerHeight / 2 - mapHeight / 2 };
            updateMapInfo(); requestUpdateTransform();
        }
    });

    function updateMapInfo() {
        const cx = (window.innerWidth / 2 - currentPos.x) / scale;
        const cy = (window.innerHeight / 2 - currentPos.y) / scale;
        mapInfo.textContent = `X: ${((cx - mapCenterX) / scaleCoordinates).toFixed(1)} Y: ${(-((cy - mapCenterY) / scaleCoordinates)).toFixed(1)} Scale: ${scale.toFixed(1)}`;
    }

    updateMapInfo();

    window.addEventListener('resize', () => {
        if (is3DMode) {
            threeCamera.aspect = window.innerWidth / window.innerHeight;
            threeCamera.updateProjectionMatrix();
            threeRenderer.setSize(window.innerWidth, window.innerHeight);
            updateMapInfo3D();
        } else {
            currentPos = { x: window.innerWidth / 2 - mapWidth / 2, y: window.innerHeight / 2 - mapHeight / 2 };
            updateMapInfo(); requestUpdateTransform();
        }
        hideTooltip();
    });

    // =========================================================
    // Search
    // =========================================================

    const searchInput = document.getElementById('search-input');
    const searchResults = document.getElementById('search-results');
    let slugSet = new Set();
    let slugToCoords = {};
    let searchTimeout = null;
    let searchAbort = null;
    let selectedSearchIndex = -1;

    function buildSearchIndex() {
        slugSet = new Set(allPoints.map(p => p.slug));
        slugToCoords = {};
        for (const p of allPoints) slugToCoords[p.slug] = p;
    }

    const _dataLoadedCheck = setInterval(() => {
        if (allPoints.length > 0) { buildSearchIndex(); clearInterval(_dataLoadedCheck); }
    }, 200);

    searchInput.addEventListener('input', () => {
        const q = searchInput.value.trim();
        clearTimeout(searchTimeout);
        if (q.length < 2) { searchResults.classList.remove('visible'); searchResults.innerHTML = ''; selectedSearchIndex = -1; return; }
        searchTimeout = setTimeout(() => doSearch(q), 300);
    });

    searchInput.addEventListener('keydown', (e) => {
        const items = searchResults.querySelectorAll('.search-result-item');
        if (!items.length) return;
        if (e.key === 'ArrowDown') { e.preventDefault(); selectedSearchIndex = Math.min(selectedSearchIndex + 1, items.length - 1); updateSearchSelection(items); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); selectedSearchIndex = Math.max(selectedSearchIndex - 1, 0); updateSearchSelection(items); }
        else if (e.key === 'Enter') { e.preventDefault(); if (selectedSearchIndex >= 0) items[selectedSearchIndex].click(); }
        else if (e.key === 'Escape') { searchInput.blur(); searchResults.classList.remove('visible'); }
    });

    function updateSearchSelection(items) {
        items.forEach((item, i) => item.classList.toggle('selected', i === selectedSearchIndex));
        if (selectedSearchIndex >= 0 && items[selectedSearchIndex]) items[selectedSearchIndex].scrollIntoView({ block: 'nearest' });
    }

    async function doSearch(query) {
        if (searchAbort) searchAbort.abort();
        searchAbort = new AbortController();
        searchResults.innerHTML = '';
        searchResults.classList.add('visible');
        selectedSearchIndex = -1;
        const ld = document.createElement('div');
        ld.className = 'search-empty'; ld.textContent = 'Searching...';
        searchResults.appendChild(ld);

        try {
            const url = `https://corsproxy.io/?url=${encodeURIComponent('https://api.hikka.io/anime?page=1&size=15')}`;
            const r = await fetch(url, {
                method: 'POST',
                headers: { 'accept': 'application/json', 'Content-Type': 'application/json' },
                body: JSON.stringify({ query, sort: ['score:desc', 'scored_by:desc', 'native_score:desc', 'native_scored_by:desc'] }),
                signal: searchAbort.signal
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
        const enriched = list.map(item => ({ ...item, onMap: slugSet.has(item.slug) }));
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
        if (item.onMap && slugToCoords[item.slug]) {
            const p = slugToCoords[item.slug];
            if (is3DMode) {
                const target = new THREE.Vector3((p.x3d || 0) * THREE_SCALE, (p.y3d || 0) * THREE_SCALE, (p.z3d || 0) * THREE_SCALE);
                const camTarget = target.clone().add(new THREE.Vector3(0, 80, 100));
                const sp = threeCamera.position.clone(), st = threeControls.target.clone();
                const dur = 600, t0 = performance.now();
                (function anim(now) {
                    const t = Math.min((now - t0) / dur, 1);
                    const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
                    threeCamera.position.lerpVectors(sp, camTarget, ease);
                    threeControls.target.lerpVectors(st, target, ease);
                    threeControls.update();
                    if (t < 1) requestAnimationFrame(anim);
                    else updateMapInfo3D();
                })(performance.now());
                setTimeout(() => {
                    highlight3DPoint(p.slug);
                    selectedPointSlug = p.slug;
                    const scr = threeToScreen(target);
                    fetchAnimeInfo(p.slug, scr.x, scr.y - 15);
                }, 700);
            } else {
                scale = 2;
                currentPos.x = window.innerWidth / 2 - (mapCenterX + p.x * scaleCoordinates) * scale;
                currentPos.y = window.innerHeight / 2 - (mapCenterY + p.y * scaleCoordinates) * scale;
                updateMapInfo(); requestUpdateTransform();
                setTimeout(() => {
                    const el = visiblePoints.get(p.slug);
                    if (el) {
                        if (selectedPointEl) selectedPointEl.classList.remove('selected');
                        selectedPointSlug = p.slug; selectedPointEl = el; selectedPointEl.classList.add('selected');
                        const r = el.getBoundingClientRect();
                        fetchAnimeInfo(p.slug, r.left + r.width / 2, r.top - 15);
                    }
                }, 100);
            }
        } else {
            window.open(`https://hikka.io/anime/${item.slug}`, '_blank');
        }
        searchResults.classList.remove('visible');
        searchInput.value = ''; searchInput.blur();
    }

    function escapeHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-container')) searchResults.classList.remove('visible');
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === '/' && document.activeElement !== searchInput && !e.target.closest('.search-container')) {
            e.preventDefault(); searchInput.focus();
        }
    });
});