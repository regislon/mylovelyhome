// Import Photo Sphere Viewer modules
import { Viewer } from '@photo-sphere-viewer/core';
import { MarkersPlugin } from '@photo-sphere-viewer/markers-plugin';

// Application state
let allPanoramas = []; // All panoramas from CSV
let validPanoramas = []; // Only panoramas with complete data
let currentPanoramaIndex = 0;
let currentLevel = null;
let viewer = null;
let floorPlanImage = null;
let walkingPersonIcon = null;
let currentFloorPlanLevel = null;

// DOM elements
const viewerContainer = document.getElementById('viewer-container');
const loadingElement = document.getElementById('loading');
const errorElement = document.getElementById('error');
const panoramaSelect = document.getElementById('panorama-select');
const levelSelect = document.getElementById('level-select');
const floorPlanCanvas = document.getElementById('floor-plan-canvas');
const floorPlanTitle = document.getElementById('floor-plan-title');
const ctx = floorPlanCanvas.getContext('2d');

// Initialize the application
async function init() {
  try {
    showLoading(true);

    // Load and parse CSV
    allPanoramas = await loadPanoramas();

    // Filter to only valid panoramas (with complete data)
    validPanoramas = allPanoramas.filter(p => {
      return p.file_path && p.file_path.trim() !== '' &&
             p.position_x && p.position_x.trim() !== '' &&
             p.position_y && p.position_y.trim() !== '' &&
             p.level && p.level.trim() !== '';
    });

    if (validPanoramas.length === 0) {
      showError('No valid panoramas found. Ensure panoramas have file_path, position_x, position_y, and level fields filled.');
      return;
    }

    // Initialize Photo Sphere Viewer
    initializeViewer();

    // Load walking person icon first
    await loadWalkingPersonIconAsync();

    // Populate controls
    populateLevelSelect();
    populatePanoramaSelect();

    // Setup event listeners
    setupLevelSelectListener();
    setupPanoramaSelectListener();
    setupFloorPlanClickListener();

    // Load first panorama
    loadPanorama(0);

    showLoading(false);
  } catch (error) {
    console.error('Initialization error:', error);
    showError(`Failed to initialize: ${error.message}`);
  }
}

// Load and parse CSV file
function loadPanoramas() {
  return new Promise((resolve, reject) => {
    Papa.parse('assets.csv', {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors.length > 0) {
          console.warn('CSV parsing warnings:', results.errors);
        }
        resolve(results.data);
      },
      error: (error) => {
        reject(new Error(`CSV parsing failed: ${error.message}`));
      }
    });
  });
}

// Populate level dropdown
function populateLevelSelect() {
  // Get unique levels from valid panoramas
  const levels = [...new Set(validPanoramas.map(p => p.level))].sort();

  // Clear and repopulate
  levelSelect.innerHTML = '<option value="">All Levels</option>';

  levels.forEach(level => {
    const option = document.createElement('option');
    option.value = level;
    option.textContent = level.charAt(0).toUpperCase() + level.slice(1);
    levelSelect.appendChild(option);
  });
}

// Populate panorama dropdown
function populatePanoramaSelect() {
  panoramaSelect.innerHTML = '<option value="">Select a location...</option>';

  validPanoramas.forEach((panorama, index) => {
    const option = document.createElement('option');
    option.value = index;
    const displayName = panorama.name_en || panorama.name_fr || panorama.file_path;
    option.textContent = displayName;
    panoramaSelect.appendChild(option);
  });
}

// Setup level select listener
function setupLevelSelectListener() {
  levelSelect.addEventListener('change', (event) => {
    const selectedLevel = event.target.value;
    currentLevel = selectedLevel || null;

    // Load floor plan for selected level
    if (currentLevel) {
      loadFloorPlan(currentLevel);
    } else {
      // Show floor plan for current panorama's level
      if (validPanoramas[currentPanoramaIndex]) {
        loadFloorPlan(validPanoramas[currentPanoramaIndex].level);
      }
    }
  });
}

// Setup panorama select listener
function setupPanoramaSelectListener() {
  panoramaSelect.addEventListener('change', (event) => {
    const selectedIndex = event.target.value;
    if (selectedIndex !== '') {
      loadPanorama(parseInt(selectedIndex, 10));
    }
  });
}

// Setup floor plan canvas click listener
function setupFloorPlanClickListener() {
  floorPlanCanvas.addEventListener('click', (event) => {
    const rect = floorPlanCanvas.getBoundingClientRect();
    const scaleX = floorPlanCanvas.width / rect.width;
    const scaleY = floorPlanCanvas.height / rect.height;
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;

    // Find panorama near click position
    const clickRadius = 15; // pixels
    const level = currentLevel || (validPanoramas[currentPanoramaIndex]?.level);

    const clicked = validPanoramas.find((p, index) => {
      if (p.level !== level) return false;

      const px = parseInt(p.position_x);
      const py = parseInt(p.position_y);
      const distance = Math.sqrt(Math.pow(x - px, 2) + Math.pow(y - py, 2));

      return distance <= clickRadius;
    });

    if (clicked) {
      const index = validPanoramas.indexOf(clicked);
      loadPanorama(index);
    }
  });
}

// Initialize Photo Sphere Viewer
function initializeViewer() {
  viewer = new Viewer({
    container: viewerContainer,
    panorama: '',
    size: {
      width: '100%',
      height: '100%'
    },
    navbar: [
      'zoom',
      'move',
      'fullscreen'
    ],
    plugins: [
      [MarkersPlugin, {
        markers: []
      }]
    ],
    loadingImg: null,
    touchmoveTwoFingers: true,
    mousewheelCtrlKey: false
  });
}

// Load walking person icon for floor plan markers (async version)
function loadWalkingPersonIconAsync() {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      walkingPersonIcon = img;
      console.log('Walking person icon loaded (PNG)');
      resolve();
    };
    img.onerror = () => {
      console.warn('PNG failed, trying SVG...');
      const svgImg = new Image();
      svgImg.onload = () => {
        walkingPersonIcon = svgImg;
        console.log('Walking person icon loaded (SVG)');
        resolve();
      };
      svgImg.onerror = () => {
        console.error('Both PNG and SVG failed to load');
        walkingPersonIcon = null;
        resolve(); // Resolve anyway to continue
      };
      svgImg.src = 'icons/Walking_person_top_view.svg';
    };
    img.src = 'icons/Walking_person_top_view.svg.png';
  });
}

// Load a specific panorama by index
function loadPanorama(index) {
  if (index < 0 || index >= validPanoramas.length) {
    console.warn('Invalid panorama index:', index);
    return;
  }

  currentPanoramaIndex = index;
  const panorama = validPanoramas[index];

  // Update dropdown to reflect current panorama
  panoramaSelect.value = index;

  // Load floor plan for panorama's level
  loadFloorPlan(panorama.level);

  console.log('Loading panorama:', panorama.file_path);

  // Update viewer with new panorama
  viewer.setPanorama(panorama.file_path, {
    transition: 1000,
    showLoader: true
  }).then(() => {
    // Clear existing markers
    const markersPlugin = viewer.getPlugin(MarkersPlugin);
    markersPlugin.clearMarkers();

    // Add navigation markers (if directional data exists)
    addNavigationMarkers(panorama, markersPlugin);

    // Setup real-time rotation updates for floor plan icon
    setupRotationListener();
  }).catch((error) => {
    console.error('Failed to load panorama:', error);
    showError(`Failed to load panorama: ${panorama.file_path}`);
  });
}

// Setup listener for panorama rotation to update floor plan icon
let rotationListenerSetup = false;
function setupRotationListener() {
  if (rotationListenerSetup) return;

  let lastUpdate = 0;
  viewer.addEventListener('position-updated', () => {
    const now = Date.now();
    if (now - lastUpdate < 100) return; // Throttle to 100ms
    lastUpdate = now;

    if (currentFloorPlanLevel && floorPlanImage) {
      drawFloorPlan(currentFloorPlanLevel);
    }
  });

  rotationListenerSetup = true;
}

// Add navigation markers based on available links
function addNavigationMarkers(panorama, markersPlugin) {
  const directions = [
    { key: 'north', position: { yaw: 0, pitch: 0 }, label: 'North ↑' },
    { key: 'east', position: { yaw: Math.PI / 2, pitch: 0 }, label: 'East →' },
    { key: 'south', position: { yaw: Math.PI, pitch: 0 }, label: 'South ↓' },
    { key: 'west', position: { yaw: -Math.PI / 2, pitch: 0 }, label: 'West ←' }
  ];

  directions.forEach((direction) => {
    const linkPath = panorama[direction.key];

    if (linkPath && linkPath.trim() !== '') {
      // Find the index of the linked panorama
      const targetIndex = validPanoramas.findIndex(p => p.file_path === linkPath);

      if (targetIndex !== -1) {
        markersPlugin.addMarker({
          id: direction.key,
          position: direction.position,
          html: `<div class="navigation-marker">${direction.label}</div>`,
          size: { width: 80, height: 40 },
          anchor: 'center center',
          tooltip: {
            content: `Go ${direction.key}`,
            position: 'bottom center'
          },
          data: {
            targetIndex: targetIndex
          }
        });
      }
    }
  });

  // Handle marker clicks
  markersPlugin.addEventListener('select-marker', (e, marker) => {
    if (marker.data && marker.data.targetIndex !== undefined) {
      loadPanorama(marker.data.targetIndex);
    }
  });
}

// Load floor plan for a specific level
function loadFloorPlan(level) {
  // Don't reload if same level
  if (currentFloorPlanLevel === level && floorPlanImage && floorPlanImage.complete) {
    drawFloorPlan(level);
    return;
  }

  currentFloorPlanLevel = level;
  const floorPlanPath = `assets/${level}.png`;

  floorPlanTitle.textContent = `Floor Plan - ${level.charAt(0).toUpperCase() + level.slice(1)}`;

  const img = new Image();
  img.onload = () => {
    floorPlanImage = img;
    floorPlanCanvas.width = img.width;
    floorPlanCanvas.height = img.height;
    drawFloorPlan(level);
  };

  img.onerror = () => {
    console.warn(`Floor plan not found: ${floorPlanPath}`);
    ctx.clearRect(0, 0, floorPlanCanvas.width, floorPlanCanvas.height);
    ctx.fillStyle = '#333';
    ctx.fillRect(0, 0, floorPlanCanvas.width, floorPlanCanvas.height);
    ctx.fillStyle = '#fff';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Floor plan not available', floorPlanCanvas.width / 2, floorPlanCanvas.height / 2);
  };

  img.src = floorPlanPath;
}

// Draw floor plan with panorama markers
function drawFloorPlan(level) {
  if (!floorPlanImage) return;

  // Clear canvas
  ctx.clearRect(0, 0, floorPlanCanvas.width, floorPlanCanvas.height);

  // Draw floor plan image
  ctx.drawImage(floorPlanImage, 0, 0);

  // Draw panorama markers for this level
  const panoramasOnLevel = validPanoramas.filter(p => p.level === level);

  panoramasOnLevel.forEach((panorama, idx) => {
    const x = parseInt(panorama.position_x);
    const y = parseInt(panorama.position_y);
    const isCurrentPanorama = validPanoramas[currentPanoramaIndex] === panorama;

    // Draw marker using walking person icon or fallback to circle
    const useIcon = walkingPersonIcon && walkingPersonIcon.complete && walkingPersonIcon.naturalWidth > 0;

    if (useIcon) {
      const iconSize = isCurrentPanorama ? 30 : 24;

      // Add highlight for current panorama
      if (isCurrentPanorama) {
        ctx.beginPath();
        ctx.arc(x, y, iconSize * 0.7, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(66, 153, 225, 0.3)';
        ctx.fill();
        ctx.strokeStyle = '#4299e1';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Get orientation and current viewer yaw (for current panorama only)
      let rotation = 0;
      if (panorama.orientation && panorama.orientation.trim() !== '') {
        // Convert orientation from degrees to radians
        rotation = (parseFloat(panorama.orientation) * Math.PI) / 180;
      }

      // Add current viewer rotation for the active panorama
      if (isCurrentPanorama && viewer) {
        const position = viewer.getPosition();
        rotation += position.yaw;
      }

      // Draw the walking person icon with rotation
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rotation);
      ctx.drawImage(walkingPersonIcon, -iconSize / 2, -iconSize / 2, iconSize, iconSize);
      ctx.restore();
    } else {
      // Fallback to circle if icon not loaded
      ctx.beginPath();
      ctx.arc(x, y, isCurrentPanorama ? 10 : 8, 0, 2 * Math.PI);
      ctx.fillStyle = isCurrentPanorama ? '#4299e1' : '#48bb78';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Draw label (optional - only for current panorama)
    if (isCurrentPanorama) {
      const label = panorama.name_en || panorama.name_fr || '';
      if (label) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(x + 15, y - 10, ctx.measureText(label).width + 10, 20);
        ctx.fillStyle = '#fff';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(label, x + 20, y + 4);
      }
    }
  });
}

// Utility functions
function showLoading(show) {
  loadingElement.style.display = show ? 'block' : 'none';
  if (!show) {
    document.getElementById('main-content').style.display = 'flex';
    document.getElementById('top-menu').style.display = 'block';
  }
}

function showError(message) {
  errorElement.textContent = message;
  errorElement.style.display = 'block';
  loadingElement.style.display = 'none';
  document.getElementById('main-content').style.display = 'none';
  document.getElementById('top-menu').style.display = 'none';
}

// Start the application when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
