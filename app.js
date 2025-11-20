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
let allAreas = []; // All areas from areas.csv
let currentViewMode = 'panorama'; // 'panorama' or 'area'

// Translation state
let translations = {};
let currentLanguage = 'fr'; // Default language, will be overridden by config

// Application config
let config = {};

// DOM elements
const viewerContainer = document.getElementById('viewer-container');
const loadingElement = document.getElementById('loading');
const errorElement = document.getElementById('error');
const panoramaSelect = document.getElementById('panorama-select');
const levelSelect = document.getElementById('level-select');
const levelLabel = document.getElementById('level-label');
const panoramaLabel = document.getElementById('panorama-label');
const floorPlanCanvas = document.getElementById('floor-plan-canvas');
const floorPlanTitle = document.getElementById('floor-plan-title');
const ctx = floorPlanCanvas.getContext('2d');

// Translation function with placeholder support
function t(key, placeholders = {}) {
  const keys = key.split('.');
  let value = translations[currentLanguage];

  for (const k of keys) {
    if (value && typeof value === 'object') {
      value = value[k];
    } else {
      console.warn(`Translation key not found: ${key}`);
      return key;
    }
  }

  if (typeof value !== 'string') {
    console.warn(`Translation value is not a string: ${key}`);
    return key;
  }

  // Replace placeholders
  return value.replace(/\{(\w+)\}/g, (match, placeholder) => {
    return placeholders[placeholder] !== undefined ? placeholders[placeholder] : match;
  });
}

// Load configuration from JSON file
async function loadConfig() {
  try {
    const response = await fetch('config.json');
    if (!response.ok) {
      throw new Error('Failed to load config');
    }
    config = await response.json();
    console.log('Configuration loaded:', config);

    // Apply config settings
    if (config.language) {
      currentLanguage = config.language;
      console.log('Language set from config:', currentLanguage);
    }
  } catch (error) {
    console.error('Error loading config:', error);
    // Fallback: use defaults
    config = {
      language: 'fr',
      defaultZoomLevel: 0,
      pitchLimitDegrees: 60,
      transitionDuration: 1000
    };
    currentLanguage = config.language;
  }
}

// Load translations from JSON file
async function loadTranslations() {
  try {
    const response = await fetch('translations.json');
    if (!response.ok) {
      throw new Error('Failed to load translations');
    }
    translations = await response.json();
    console.log('Translations loaded for languages:', Object.keys(translations));
  } catch (error) {
    console.error('Error loading translations:', error);
    // Fallback: use empty translations
    translations = { en: {}, fr: {} };
  }
}

// Update all UI text based on current language
function updateUIText() {
  // Update labels
  levelLabel.textContent = t('floor') + ':';
  panoramaLabel.textContent = t('jumpTo');
  loadingElement.textContent = t('loading');

  // Update dropdowns
  populateLevelSelect();
  populatePanoramaSelect();

  // Update floor plan title if a level is loaded
  if (currentFloorPlanLevel) {
    const levelKey = currentFloorPlanLevel.charAt(0).toUpperCase() + currentFloorPlanLevel.slice(1);
    const levelName = translations[currentLanguage] && translations[currentLanguage][levelKey]
                      ? t(levelKey)
                      : levelKey;
    floorPlanTitle.textContent = t('floorPlanTitle', { level: levelName });
  } else {
    floorPlanTitle.textContent = t('floorPlan');
  }

  // Redraw floor plan to update any text
  if (currentFloorPlanLevel && floorPlanImage) {
    drawFloorPlan(currentFloorPlanLevel);
  }
}

// Initialize the application
async function init() {
  try {
    showLoading(true);

    // Load config first to get language setting
    await loadConfig();

    // Load translations
    await loadTranslations();

    // Load and parse CSV files
    allPanoramas = await loadPanoramas();
    allAreas = await loadAreas();

    // Filter to only valid panoramas (with complete data)
    validPanoramas = allPanoramas.filter(p => {
      return p.file_path && p.file_path.trim() !== '' &&
             p.position_x && p.position_x.trim() !== '' &&
             p.position_y && p.position_y.trim() !== '' &&
             p.level && p.level.trim() !== '';
    });

    if (validPanoramas.length === 0) {
      showError(t('noValidPanoramas'));
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

    // Initialize UI text
    updateUIText();

    // Load first panorama
    loadPanorama(0);

    showLoading(false);
  } catch (error) {
    console.error('Initialization error:', error);
    showError(t('failedToInitialize', { error: error.message }));
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

// Load and parse areas CSV file
function loadAreas() {
  return new Promise((resolve, reject) => {
    Papa.parse('areas.csv', {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors.length > 0) {
          console.warn('Areas CSV parsing warnings:', results.errors);
        }
        console.log(`Loaded ${results.data.length} areas`);
        resolve(results.data);
      },
      error: (error) => {
        console.warn('areas.csv not found or failed to load');
        resolve([]); // Return empty array if file doesn't exist
      }
    });
  });
}

// Populate level dropdown
function populateLevelSelect() {
  // Get unique levels from valid panoramas
  const levels = [...new Set(validPanoramas.map(p => p.level))].sort();

  // Clear and repopulate
  levelSelect.innerHTML = `<option value="">${t('allLevels')}</option>`;

  levels.forEach(level => {
    const option = document.createElement('option');
    option.value = level;
    // Try to translate the level name (e.g., "Level0", "Level1", "Level2")
    const levelKey = level.charAt(0).toUpperCase() + level.slice(1);
    const translatedLevel = translations[currentLanguage] && translations[currentLanguage][levelKey]
                            ? t(levelKey)
                            : levelKey;
    option.textContent = translatedLevel;
    levelSelect.appendChild(option);
  });
}

// Populate panorama dropdown
function populatePanoramaSelect() {
  panoramaSelect.innerHTML = `<option value="">${t('selectLocation')}</option>`;

  validPanoramas.forEach((panorama, index) => {
    const option = document.createElement('option');
    option.value = index;
    // Use language-specific name based on current language
    const displayName = (currentLanguage === 'fr' ? panorama.name_fr : panorama.name_en)
                        || panorama.name_en || panorama.name_fr || panorama.file_path;
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

// Check if point is inside polygon
function isPointInPolygon(x, y, polygonData) {
  // Parse polygon
  let points;
  if (polygonData.startsWith('POLYGON')) {
    points = parseWKTPolygon(polygonData);
    if (!points) return false;
  } else {
    const coords = polygonData.split(',').map(v => parseFloat(v.trim()));
    if (coords.length < 6) return false;
    points = [];
    for (let i = 0; i < coords.length; i += 2) {
      points.push([coords[i], coords[i + 1]]);
    }
  }

  // Point-in-polygon algorithm
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i][0], yi = points[i][1];
    const xj = points[j][0], yj = points[j][1];

    const intersect = ((yi > y) !== (yj > y)) &&
      (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// Setup floor plan canvas click listener
function setupFloorPlanClickListener() {
  floorPlanCanvas.addEventListener('click', (event) => {
    const rect = floorPlanCanvas.getBoundingClientRect();
    const scaleX = floorPlanCanvas.width / rect.width;
    const scaleY = floorPlanCanvas.height / rect.height;
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;

    const level = currentLevel || (validPanoramas[currentPanoramaIndex]?.level);

    // First check for panorama markers (priority over areas)
    const clickRadius = 15; // pixels
    const clicked = validPanoramas.find((p) => {
      if (p.level !== level) return false;

      const px = parseInt(p.position_x);
      const py = parseInt(p.position_y);
      const distance = Math.sqrt(Math.pow(x - px, 2) + Math.pow(y - py, 2));

      return distance <= clickRadius;
    });

    if (clicked) {
      const index = validPanoramas.indexOf(clicked);
      loadPanorama(index);
      return;
    }

    // If not on panorama marker, check if inside an area polygon
    const clickedArea = allAreas.find(area => {
      const polygonData = area.polygon || area.polygon_wkt;
      return area.level === level &&
             polygonData &&
             isPointInPolygon(x, y, polygonData);
    });

    if (clickedArea) {
      loadAreaDescription(clickedArea);
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
    mousewheelCtrlKey: false,
    defaultZoomLvl: 0,
    minFov: 30,
    maxFov: 90,
    defaultLat: 0,
    latRange: [-Math.PI / 3, Math.PI / 3] // Limit pitch to ±60°
  });

  console.log('Viewer initialized with latitude range (pitch limits):', {
    range: [-Math.PI / 3, Math.PI / 3],
    rangeInDegrees: [(-Math.PI / 3 * 180 / Math.PI).toFixed(1) + '°', (Math.PI / 3 * 180 / Math.PI).toFixed(1) + '°']
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

// Load and display area description
async function loadAreaDescription(area) {
  console.log('Loading area description:', area);
  currentViewMode = 'area';

  // Hide viewer, show markdown container
  viewerContainer.style.display = 'none';

  // Create or get markdown container
  let markdownContainer = document.getElementById('markdown-container');
  if (!markdownContainer) {
    markdownContainer = document.createElement('div');
    markdownContainer.id = 'markdown-container';
    markdownContainer.style.cssText = 'width: 100%; height: 100%; padding: 20px; overflow-y: auto; background: white; box-sizing: border-box;';
    viewerContainer.parentElement.appendChild(markdownContainer);
  }
  markdownContainer.style.display = 'block';

  // Load markdown file
  if (area.description_file && area.description_file.trim() !== '') {
    try {
      const response = await fetch(area.description_file);
      if (response.ok) {
        const markdown = await response.text();
        // Simple markdown rendering (convert to HTML)
        const html = convertMarkdownToHTML(markdown);
        const areaName = (currentLanguage === 'fr' ? area.name_fr : area.name_en)
                        || area.name_en || area.name_fr || t('area.information');
        markdownContainer.innerHTML = `
          <div style="max-width: 800px; margin: 0 auto;">
            <h1>${areaName}</h1>
            ${html}
          </div>
        `;
      } else {
        markdownContainer.innerHTML = `<p>${t('area.descriptionNotFound', { file: area.description_file })}</p>`;
      }
    } catch (error) {
      console.error('Failed to load markdown:', error);
      markdownContainer.innerHTML = `<p>${t('area.errorLoading')}</p>`;
    }
  } else {
    const areaName = (currentLanguage === 'fr' ? area.name_fr : area.name_en)
                    || area.name_en || area.name_fr || t('area.information');
    markdownContainer.innerHTML = `
      <h1>${areaName}</h1>
      <p>${t('area.noDescription')}</p>
    `;
  }
}

// Simple markdown to HTML converter
function convertMarkdownToHTML(markdown) {
  return markdown
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
    .replace(/\*(.*)\*/gim, '<em>$1</em>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>')
    .replace(/^(.+)$/gim, '<p>$1</p>')
    .replace(/<p><h/g, '<h')
    .replace(/<\/h(\d)><\/p>/g, '</h$1>');
}

// Close markdown view and return to panorama
window.closeMarkdownView = function() {
  currentViewMode = 'panorama';
  const markdownContainer = document.getElementById('markdown-container');
  if (markdownContainer) {
    markdownContainer.style.display = 'none';
  }
  viewerContainer.style.display = 'block';
};

// Load a specific panorama by index
function loadPanorama(index) {
  if (index < 0 || index >= validPanoramas.length) {
    console.warn('Invalid panorama index:', index);
    return;
  }

  // Switch to panorama mode
  currentViewMode = 'panorama';
  const markdownContainer = document.getElementById('markdown-container');
  if (markdownContainer) {
    markdownContainer.style.display = 'none';
  }
  viewerContainer.style.display = 'block';

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
    showLoader: true,
    zoom: 0 // Reset to lowest zoom level
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
    showError(t('failedToLoadPanorama', { path: panorama.file_path }));
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
    { key: 'north', position: { yaw: 0, pitch: 0 }, label: t('navigation.north') },
    { key: 'east', position: { yaw: Math.PI / 2, pitch: 0 }, label: t('navigation.east') },
    { key: 'south', position: { yaw: Math.PI, pitch: 0 }, label: t('navigation.south') },
    { key: 'west', position: { yaw: -Math.PI / 2, pitch: 0 }, label: t('navigation.west') }
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
            content: t('navigation.goTo', { direction: direction.key }),
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
  markersPlugin.addEventListener('select-marker', (_event, marker) => {
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

  // Translate level name
  const levelKey = level.charAt(0).toUpperCase() + level.slice(1);
  const levelName = translations[currentLanguage] && translations[currentLanguage][levelKey]
                    ? t(levelKey)
                    : levelKey;
  floorPlanTitle.textContent = t('floorPlanTitle', { level: levelName });

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
    ctx.fillText(t('floorPlanNotAvailable'), floorPlanCanvas.width / 2, floorPlanCanvas.height / 2);
  };

  img.src = floorPlanPath;
}

// Parse WKT POLYGON format
function parseWKTPolygon(wkt) {
  // Extract coordinates from "POLYGON((x1 y1, x2 y2, ...))"
  const match = wkt.match(/POLYGON\(\((.*?)\)\)/);
  if (!match) return null;

  const points = match[1].split(',').map(pair => {
    const [x, y] = pair.trim().split(/\s+/).map(v => parseFloat(v));
    return [x, y];
  });

  return points;
}

// Draw area polygons on floor plan
function drawAreaPolygons(areas) {
  areas.forEach(area => {
    console.log('Drawing area:', area.name_en || area.area_id);

    // Support both 'polygon' and 'polygon_wkt' columns
    const polygonData = area.polygon || area.polygon_wkt;
    if (!polygonData || polygonData.trim() === '') {
      console.warn('Area missing polygon:', area);
      return;
    }

    // Parse polygon - either WKT format or comma-separated
    let points;
    if (polygonData.startsWith('POLYGON')) {
      points = parseWKTPolygon(polygonData);
      if (!points) {
        console.warn('Failed to parse WKT polygon:', polygonData);
        return;
      }
    } else {
      // Parse comma-separated: "x1,y1,x2,y2,..."
      const coords = polygonData.split(',').map(v => parseFloat(v.trim()));
      if (coords.length < 6) {
        console.warn('Polygon has too few points:', coords.length);
        return;
      }
      points = [];
      for (let i = 0; i < coords.length; i += 2) {
        points.push([coords[i], coords[i + 1]]);
      }
    }

    console.log('Polygon points:', points);

    // Draw polygon
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i][0], points[i][1]);
    }
    ctx.closePath();

    // Fill with transparent color
    const fillColor = area.fill_color || 'rgba(100, 150, 200, 0.2)';
    ctx.fillStyle = fillColor;
    ctx.fill();

    // Border with color
    const borderColor = area.border_color || area.color || '#4299e1';
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 2;
    ctx.stroke();
  });
}

// Draw floor plan with panorama markers
function drawFloorPlan(level) {
  if (!floorPlanImage) return;

  // Clear canvas
  ctx.clearRect(0, 0, floorPlanCanvas.width, floorPlanCanvas.height);

  // Draw floor plan image
  ctx.drawImage(floorPlanImage, 0, 0);

  // Draw area polygons for this level (below icons)
  const areasOnLevel = allAreas.filter(a => a.level === level);
  console.log(`Drawing ${areasOnLevel.length} areas for level ${level}`, areasOnLevel);
  drawAreaPolygons(areasOnLevel);

  // Draw panorama markers for this level
  const panoramasOnLevel = validPanoramas.filter(p => p.level === level);

  panoramasOnLevel.forEach((panorama) => {
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
      const label = (currentLanguage === 'fr' ? panorama.name_fr : panorama.name_en)
                    || panorama.name_en || panorama.name_fr || '';
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
