import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { state } from './state.js';
import { hideTooltip, highlight3DPoint, clearHighlight3D, repositionTooltip3D, threeToScreen, fetchAnimeInfo } from './tooltip.js';
import { applyClusterFilter } from './clusters.js';

let onExit3DCallback = null;

export function setOnExit3DCallback(cb) { onExit3DCallback = cb; }

export function initMap3D() {
    // Mode toggle
    state.modeToggle.addEventListener('click', () => {
        state.is3DMode ? exit3DMode() : enter3DMode();
    });

    // 3D click
    state.canvasContainer.addEventListener('click', (event) => {
        if (!state.is3DMode || !state.threePoints) return;
        const rect = state.threeRenderer.domElement.getBoundingClientRect();
        state.threeMouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        state.threeMouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        state.threeRaycaster.setFromCamera(state.threeMouse, state.threeCamera);
        const intersects = state.threeRaycaster.intersectObject(state.threePoints);

        if (intersects.length > 0) {
            const slug = state.threeSlugIndex[intersects[0].index];
            if (!slug) return;
            if (state.selectedPointSlug === slug) { hideTooltip(); clearHighlight3D(); return; }
            clearHighlight3D();
            state.selectedPointSlug = slug;
            highlight3DPoint(slug);
            const screenPos = threeToScreen(intersects[0].point);
            fetchAnimeInfo(slug, screenPos.x, screenPos.y - 15);
        } else {
            hideTooltip();
            clearHighlight3D();
        }
    });

    state.canvasContainer.addEventListener('pointermove', (e) => {
        state.threeLastPointerX = e.clientX;
        state.threeLastPointerY = e.clientY;
    });

    // Zoom buttons (3D)
    state.zoomInBtn.addEventListener('click', () => {
        if (!state.is3DMode) return;
        state.threeCamera.position.lerp(state.threeControls.target, 0.15);
        updateMapInfo3D();
    });
    state.zoomOutBtn.addEventListener('click', () => {
        if (!state.is3DMode) return;
        const dir = state.threeCamera.position.clone().sub(state.threeControls.target).normalize();
        state.threeCamera.position.add(dir.multiplyScalar(50));
        updateMapInfo3D();
    });

    state.resetBtn.addEventListener('click', () => {
        if (!state.is3DMode) return;
        state.threeCamera.position.set(0, 200, 300);
        state.threeControls.target.set(0, 0, 0);
        state.threeControls.update(); updateMapInfo3D();
    });

    window.addEventListener('resize', () => {
        if (!state.is3DMode) return;
        state.threeCamera.aspect = window.innerWidth / window.innerHeight;
        state.threeCamera.updateProjectionMatrix();
        state.threeRenderer.setSize(window.innerWidth, window.innerHeight);
        updateMapInfo3D();
        hideTooltip();
    });
}

function initThreeJS() {
    if (state.threeScene) return;

    state.threeRaycaster = new THREE.Raycaster();
    state.threeMouse = new THREE.Vector2();

    state.threeScene = new THREE.Scene();
    state.threeScene.background = new THREE.Color(0x080808);

    state.threeCamera = new THREE.PerspectiveCamera(
        60, window.innerWidth / window.innerHeight, 0.1, 100000
    );
    state.threeCamera.position.set(0, 200, 300);

    state.threeRenderer = new THREE.WebGLRenderer({ antialias: true });
    state.threeRenderer.setSize(window.innerWidth, window.innerHeight);
    state.threeRenderer.setPixelRatio(window.devicePixelRatio);
    state.canvasContainer.appendChild(state.threeRenderer.domElement);

    state.threeControls = new OrbitControls(state.threeCamera, state.threeRenderer.domElement);
    state.threeControls.enableDamping = true;
    state.threeControls.dampingFactor = 0.08;
    state.threeControls.rotateSpeed = 0.6;
    state.threeControls.panSpeed = 0.8;
    state.threeControls.zoomSpeed = 1.2;
    state.threeControls.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN
    };
    state.threeControls.target.set(0, 0, 0);
    state.threeControls.update();

    const gridHelper = new THREE.GridHelper(600, 30, 0x222222, 0x151515);
    state.threeScene.add(gridHelper);
    state.threeScene.add(new THREE.AmbientLight(0xffffff, 1.0));

    state.threeControls.addEventListener('start', () => {
        state.threeIsOrbiting = true;
        state.threeOrbitStartX = state.threeLastPointerX;
        state.threeOrbitStartY = state.threeLastPointerY;
    });
    state.threeControls.addEventListener('change', () => {
        if (state.is3DMode) updateMapInfo3D();
    });
    state.threeControls.addEventListener('end', () => {
        state.threeIsOrbiting = false;
        const dx = state.threeLastPointerX - state.threeOrbitStartX;
        const dy = state.threeLastPointerY - state.threeOrbitStartY;
        if (Math.sqrt(dx * dx + dy * dy) > 8) {
            hideTooltip();
            clearHighlight3D();
        }
    });
}

function buildThreeData() {
    state.threeSlugIndex = [];
    state.threeSlugToPoint = {};
    for (const p of state.allPoints) {
        state.threeSlugIndex.push(p.slug);
        state.threeSlugToPoint[p.slug] = { x3d: p.x3d || 0, y3d: p.y3d || 0, z3d: p.z3d || 0 };
    }
}

function createThreePoints() {
    if (state.threePoints) {
        state.threeScene.remove(state.threePoints);
        state.threePoints.geometry.dispose();
        state.threePoints.material.dispose();
    }

    const n = state.allPoints.length;
    const positions = new Float32Array(n * 3);
    const colors = new Float32Array(n * 3);
    const tempColor = new THREE.Color();

    // Store base colors for cluster filtering
    state.threeBaseColors = new Array(n);

    for (let i = 0; i < n; i++) {
        const p = state.allPoints[i];
        positions[i * 3]     = (p.x3d || 0) * state.THREE_SCALE;
        positions[i * 3 + 1] = (p.y3d || 0) * state.THREE_SCALE;
        positions[i * 3 + 2] = (p.z3d || 0) * state.THREE_SCALE;

        const hex = state.clusterColors[p.cluster] || '#E779C1';
        tempColor.set(hex);
        colors[i * 3]     = tempColor.r;
        colors[i * 3 + 1] = tempColor.g;
        colors[i * 3 + 2] = tempColor.b;
        state.threeBaseColors[i] = { r: tempColor.r, g: tempColor.g, b: tempColor.b };
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    state.threePoints = new THREE.Points(geometry, new THREE.PointsMaterial({
        size: 3,
        sizeAttenuation: false,
        vertexColors: true,
    }));
    state.threeScene.add(state.threePoints);

    // Highlight marker for selected point
    if (state.threeSelectedPoint) {
        state.threeScene.remove(state.threeSelectedPoint);
        state.threeSelectedPoint.geometry.dispose();
        state.threeSelectedPoint.material.dispose();
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
    state.threeSelectedPoint = new THREE.Points(highlightGeo, highlightMat);
    state.threeSelectedPoint.visible = false;
    state.threeSelectedPoint.renderOrder = 999;
    state.threeScene.add(state.threeSelectedPoint);
}

function startThreeRenderLoop() {
    if (state.threeAnimating) return;
    state.threeAnimating = true;
    (function animate() {
        if (!state.is3DMode) { state.threeAnimating = false; return; }
        requestAnimationFrame(animate);
        state.threeControls.update();
        if (state.threeSelectedPoint && state.threeSelectedPoint.visible) {
            state.threeSelectedPoint.material.opacity = 0.65 + 0.35 * Math.sin(performance.now() * 0.004);
        }
        repositionTooltip3D();
        state.threeRenderer.render(state.threeScene, state.threeCamera);
    })();
}

function stopThreeRenderLoop() { state.threeAnimating = false; }

function enter3DMode() {
    state.is3DMode = true;
    initThreeJS();
    buildThreeData();
    createThreePoints();
    applyClusterFilter();
    state.map.classList.add('hidden');
    state.canvasContainer.classList.remove('hidden');
    state.modeLabel.textContent = '2D';
    state.threeRenderer.setSize(window.innerWidth, window.innerHeight);
    state.threeCamera.aspect = window.innerWidth / window.innerHeight;
    state.threeCamera.updateProjectionMatrix();
    hideTooltip();
    clearHighlight3D();
    updateMapInfo3D();
    startThreeRenderLoop();
}

function exit3DMode() {
    state.is3DMode = false;
    state.canvasContainer.classList.add('hidden');
    state.map.classList.remove('hidden');
    state.modeLabel.textContent = '3D';
    hideTooltip();
    stopThreeRenderLoop();
    onExit3DCallback?.();
}

export function updateMapInfo3D() {
    if (!state.threeCamera || !state.threeControls) return;
    const dist = state.threeCamera.position.distanceTo(state.threeControls.target);
    const azimuth = THREE.MathUtils.radToDeg(state.threeControls.getAzimuthalAngle()).toFixed(0);
    const polar = THREE.MathUtils.radToDeg(state.threeControls.getPolarAngle()).toFixed(0);
    state.mapInfo.textContent = `Azimuth: ${azimuth}\u00B0 Polar: ${polar}\u00B0 Dist: ${dist.toFixed(0)}`;
}

// Called from main.js for search result navigation
export function navigateToPoint3D(p) {
    if (!state.is3DMode || !state.threeCamera) return;

    const target = new THREE.Vector3((p.x3d || 0) * state.THREE_SCALE, (p.y3d || 0) * state.THREE_SCALE, (p.z3d || 0) * state.THREE_SCALE);
    const camTarget = target.clone().add(new THREE.Vector3(0, 80, 100));
    const sp = state.threeCamera.position.clone(), st = state.threeControls.target.clone();
    const dur = 600, t0 = performance.now();
    (function anim(now) {
        const t = Math.min((now - t0) / dur, 1);
        const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
        state.threeCamera.position.lerpVectors(sp, camTarget, ease);
        state.threeControls.target.lerpVectors(st, target, ease);
        state.threeControls.update();
        if (t < 1) requestAnimationFrame(anim);
        else updateMapInfo3D();
    })(performance.now());
    setTimeout(() => {
        highlight3DPoint(p.slug);
        state.selectedPointSlug = p.slug;
        const scr = threeToScreen(target);
        fetchAnimeInfo(p.slug, scr.x, scr.y - 15);
    }, 700);
}
