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
    currentPos = {
        x: window.innerWidth / 2 - mapWidth / 2,
        y: window.innerHeight / 2 - mapHeight / 2
    };
    updateMapTransform();
    addCoordinateMarkers();
    let points = [];
    try {
        const response = await fetch('anime_map.json');
        points = await response.json();
        renderPoints(points);
    } catch (error) {
        console.error('Error loading anime points:', error);
        points = [];
        renderPoints(points);
    }
    function addCoordinateMarkers() {
        const step = 500;
        const centerX = mapWidth / 2;
        const centerY = mapHeight / 2;
        for (let x = 0; x <= mapWidth; x += step) {
            if (x === centerX) continue;
            const xValue = (x - centerX) / 20;
            const marker = document.createElement('div');
            marker.className = 'coordinate-marker';
            marker.textContent = xValue;
            marker.style.left = `${x}px`;
            marker.style.top = `${centerY + 15}px`;
            map.appendChild(marker);
        }
        for (let y = 0; y <= mapHeight; y += step) {
            if (y === centerY) continue;
            const yValue = -((y - centerY) / 20);
            const marker = document.createElement('div');
            marker.className = 'coordinate-marker';
            marker.textContent = yValue;
            marker.style.left = `${centerX + 15}px`;
            marker.style.top = `${y}px`;
            map.appendChild(marker);
        }
        const centerMarker = document.createElement('div');
        centerMarker.className = 'coordinate-marker';
        centerMarker.textContent = '0,0';
        centerMarker.style.left = `${centerX}px`;
        centerMarker.style.top = `${centerY}px`;
        map.appendChild(centerMarker);    
    }

    function renderPoints(points) {
        const markers = document.querySelectorAll('.coordinate-marker');
        const markersArray = Array.from(markers);
        const axes = [
            document.querySelector('.axis-x'),
            document.querySelector('.axis-y'),
            document.querySelector('.grid-lines')
        ];

        const existingPoints = document.querySelectorAll('.point');
        existingPoints.forEach(point => point.remove());
        points.forEach(point => {
            const mapCenterX = mapWidth / 2;
            const mapCenterY = mapHeight / 2;

            const scaleCoordinates = 20;
            const screenPointX = mapCenterX + point.x * scaleCoordinates;
            const screenPointY = mapCenterY + point.y * scaleCoordinates;

            const pointElement = document.createElement('div');
            pointElement.className = 'point';

            pointElement.style.left = `${screenPointX}px`;
            pointElement.style.top = `${screenPointY}px`;
            pointElement.dataset.slug = point.slug;
            pointElement.dataset.x = point.x;
            pointElement.dataset.y = point.y;

            pointElement.addEventListener('click', (e) => {
                e.stopPropagation();
                const pointRect = e.target.getBoundingClientRect();
                const centerX = pointRect.left + pointRect.width / 2;
                const centerY = pointRect.top - 15;

                if (selectedPointSlug === point.slug) {
                    hideTooltip();
                    return;
                }
                
                selectedPointSlug = point.slug;

                fetchAnimeInfo(point.slug, centerX, centerY);
            });
            map.appendChild(pointElement);
        });
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

    function formatStatus(status) {
        const statuses = {
            'finished': 'Finished',
            'ongoing': 'Ongoing',
            'upcoming': 'Upcoming',
            'unknown': 'Unknown'
        };
        return statuses[status] || status;
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

    map.addEventListener('mousedown', (e) => {
        if (e.target === map || e.target.classList.contains('grid-lines') ||
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
            updateMapTransform();
            updateMapInfo();
            startPos = { x: e.clientX, y: e.clientY };
        }
    });
    document.addEventListener('mouseup', () => {
        isDragging = false;
        map.classList.remove('grabbing');
    });

    map.addEventListener('touchstart', (e) => {
        if (e.target === map || e.target.classList.contains('grid-lines') ||
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
            updateMapTransform();
            updateMapInfo();
            startPos = { x: touch.clientX, y: touch.clientY };
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

        const rect = map.getBoundingClientRect();
        const mouseX = e.clientX;
        const mouseY = e.clientY;

        if (newScale !== scale) {
            const scaleRatio = newScale / scale;

            const mapMouseX = mouseX - rect.left;
            const mapMouseY = mouseY - rect.top;

            const dx = mapMouseX - (rect.width / 2);
            const dy = mapMouseY - (rect.height / 2);

            currentPos.x -= dx * (scaleRatio - 1);
            currentPos.y -= dy * (scaleRatio - 1);
            scale = newScale;
            updateMapTransform();
            updateMapInfo();
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

        const rect = map.getBoundingClientRect();

        const mapCenterX = viewportCenterX - rect.left;
        const mapCenterY = viewportCenterY - rect.top;

        const dx = mapCenterX - (rect.width / 2);
        const dy = mapCenterY - (rect.height / 2);

        currentPos.x -= dx * (scaleRatio - 1);
        currentPos.y -= dy * (scaleRatio - 1);
        scale = newScale;
        updateMapTransform();
        updateMapInfo();
    }
    resetBtn.addEventListener('click', () => {
        scale = 1;
        currentPos = {
            x: window.innerWidth / 2 - mapWidth / 2,
            y: window.innerHeight / 2 - mapHeight / 2
        };
        updateMapTransform();
        updateMapInfo();
    });

    function updateMapTransform() {
        map.style.transform = `translate(${currentPos.x}px, ${currentPos.y}px) scale(${scale})`;
    }

    function updateMapInfo() {
        const viewportCenterX = (window.innerWidth / 2 - currentPos.x) / scale;
        const viewportCenterY = (window.innerHeight / 2 - currentPos.y) / scale;

        const centerX = mapWidth / 2;
        const centerY = mapHeight / 2;
        const coordX = ((viewportCenterX - centerX) / 20).toFixed(1);
        const coordY = (-((viewportCenterY - centerY) / 20)).toFixed(1);
        mapInfo.textContent = `X: ${coordX} Y: ${coordY} Scale: ${scale.toFixed(1)}`;
    }

    updateMapInfo();

    window.addEventListener('resize', () => {
        currentPos = {
            x: window.innerWidth / 2 - mapWidth / 2,
            y: window.innerHeight / 2 - mapHeight / 2
        };
        updateMapTransform();
        updateMapInfo();

        hideTooltip();
    });
});