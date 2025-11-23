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
let selectedAreaId = null; // Currently selected area ID

// Translation state
let translations = {};
let currentLanguage = 'fr'; // Default language, will be overridden by config

// Application config
let config = {};

// DOM elements
const viewerContainer = document.getElementById('viewer-container');
const loadingElement = document.getElementById('loading');
const errorElement = document.getElementById('error');
const levelButtons = document.getElementById('level-buttons');
const levelLabel = document.getElementById('level-label');
const floorPlanCanvas = document.getElementById('floor-plan-canvas');
const floorPlanTitle = document.getElementById('floor-plan-title');
const floorPlanContainer = document.getElementById('floor-plan-container');
const generalDescriptionBtn = document.getElementById('general-description-btn');
const helpBtn = document.getElementById('help-btn');
let initialImageContainer = null;

// SVG elements for floor plan
let floorPlanSvg = null;
let floorPlanSvgContainer = null;
let floorPlanOverlayGroup = null;
let areasOverlayGroup = null;

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
  loadingElement.textContent = t('loading');
  generalDescriptionBtn.textContent = t('generalDescription');

  // Update controls
  populateLevelButtons();

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

// Initialize SVG-based floor plan
function initializeFloorPlanSvg() {
  // Hide the canvas
  floorPlanCanvas.style.display = 'none';

  // Create SVG container
  floorPlanSvgContainer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  floorPlanSvgContainer.id = 'floor-plan-svg';
  floorPlanSvgContainer.style.cssText = `
    max-width: 100%;
    max-height: 100%;
    width: auto;
    height: auto;
    border: 1px solid rgba(255, 255, 255, 0.2);
    cursor: crosshair;
  `;

  // Create overlay groups for interactive elements
  areasOverlayGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  areasOverlayGroup.id = 'areas-overlay';

  floorPlanOverlayGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  floorPlanOverlayGroup.id = 'markers-overlay';

  floorPlanSvgContainer.appendChild(areasOverlayGroup);
  floorPlanSvgContainer.appendChild(floorPlanOverlayGroup);

  // Add to container
  floorPlanContainer.appendChild(floorPlanSvgContainer);

  console.log('SVG-based floor plan initialized');
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

    // Initialize SVG-based floor plan
    initializeFloorPlanSvg();

    // Load walking person icon first
    await loadWalkingPersonIconAsync();

    // Populate controls
    populateLevelButtons();

    // Setup event listeners
    setupLevelButtonsListener();
    setupFloorPlanClickListener();
    setupGeneralDescriptionListener();
    setupHelpButtonListener();

    // Initialize UI text
    updateUIText();

    // Load default floor plan (first level)
    if (validPanoramas.length > 0 && validPanoramas[0].level) {
      currentLevel = validPanoramas[0].level;
      loadFloorPlan(currentLevel);
    }

    // Show initial image instead of loading first panorama
    showInitialImage();

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
        // Add unique internal ID to each area (to handle duplicate area_ids)
        const areasWithUniqueIds = results.data.map((area, index) => ({
          ...area,
          _uniqueId: `${area.area_id}_${index}`
        }));
        console.log(`Loaded ${areasWithUniqueIds.length} areas`);
        resolve(areasWithUniqueIds);
      },
      error: (error) => {
        console.warn('areas.csv not found or failed to load');
        resolve([]); // Return empty array if file doesn't exist
      }
    });
  });
}

// Populate level buttons
function populateLevelButtons() {
  // Get unique levels from valid panoramas
  const levels = [...new Set(validPanoramas.map(p => p.level))].sort();

  // Clear and repopulate
  levelButtons.innerHTML = '';

  levels.forEach(level => {
    const button = document.createElement('button');
    button.className = 'level-button';
    button.dataset.level = level;

    // Try to translate the level name (e.g., "Level0", "Level1", "Level2")
    const levelKey = level.charAt(0).toUpperCase() + level.slice(1);
    const translatedLevel = translations[currentLanguage] && translations[currentLanguage][levelKey]
                            ? t(levelKey)
                            : levelKey;
    button.textContent = translatedLevel;

    // Mark as active if it's the current level
    if (level === currentLevel || (currentLevel === null && validPanoramas[currentPanoramaIndex]?.level === level)) {
      button.classList.add('active');
    }

    levelButtons.appendChild(button);
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

// Setup level buttons listener
function setupLevelButtonsListener() {
  levelButtons.addEventListener('click', (event) => {
    const button = event.target.closest('.level-button');
    if (!button) return;

    const selectedLevel = button.dataset.level;

    // Remove active class from all buttons
    levelButtons.querySelectorAll('.level-button').forEach(btn => {
      btn.classList.remove('active');
    });

    // Add active class to clicked button
    button.classList.add('active');

    // Deselect any area when switching levels
    selectedAreaId = null;

    // Set current level and load floor plan
    currentLevel = selectedLevel;
    loadFloorPlan(currentLevel);
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

// Setup general description button listener
function setupGeneralDescriptionListener() {
  generalDescriptionBtn.addEventListener('click', () => {
    loadGeneralDescription();
  });
}

// Setup help button listener
function setupHelpButtonListener() {
  helpBtn.addEventListener('click', () => {
    loadHelpDescription();
  });
}

// Load and display general description from main.md
async function loadGeneralDescription() {
  console.log('Loading general description');
  currentViewMode = 'area';

  // Deselect any selected area
  selectedAreaId = null;

  // Hide viewer and initial image, show markdown container
  hideInitialImage();
  viewerContainer.style.display = 'none';

  // Create or get markdown container
  let markdownContainer = document.getElementById('markdown-container');
  if (!markdownContainer) {
    markdownContainer = document.createElement('div');
    markdownContainer.id = 'markdown-container';
    markdownContainer.style.cssText = `
      width: 100%;
      height: 100%;
      padding: 30px 40px;
      overflow-y: auto;
      box-sizing: border-box;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      font-size: 16px;
      line-height: 1.6;
      color: #333;
    `;
    viewerContainer.parentElement.appendChild(markdownContainer);
  }
  markdownContainer.style.display = 'block';

  // Add close button if it doesn't exist
  if (!markdownContainer.querySelector('.markdown-close-btn')) {
    const closeBtn = document.createElement('button');
    closeBtn.className = 'markdown-close-btn';
    closeBtn.innerHTML = '×';
    closeBtn.onclick = () => {
      selectedAreaId = null;
      currentViewMode = 'panorama';
      markdownContainer.style.display = 'none';
      viewerContainer.style.display = 'block';
      if (currentFloorPlanLevel && floorPlanSvg) {
        drawFloorPlan(currentFloorPlanLevel);
      }
    };
    markdownContainer.appendChild(closeBtn);
  }

  // Load main.md file
  try {
    const response = await fetch('descriptions/main.md');
    if (response.ok) {
      const markdown = await response.text();
      // Enhanced markdown rendering with styling
      const html = convertMarkdownToHTML(markdown, 'descriptions/');
      markdownContainer.innerHTML = `
        <div class="markdown-content">
          ${html}
        </div>
      `;
    } else {
      markdownContainer.innerHTML = `<p>${t('area.descriptionNotFound', { file: 'descriptions/main.md' })}</p>`;
    }
  } catch (error) {
    console.error('Failed to load main description:', error);
    markdownContainer.innerHTML = `<p>${t('area.errorLoading')}</p>`;
  }
}

// Load and display help description from help.md
async function loadHelpDescription() {
  console.log('Loading help description');
  currentViewMode = 'area';

  // Deselect any selected area
  selectedAreaId = null;

  // Hide viewer and initial image, show markdown container
  hideInitialImage();
  viewerContainer.style.display = 'none';

  // Create or get markdown container
  let markdownContainer = document.getElementById('markdown-container');
  if (!markdownContainer) {
    markdownContainer = document.createElement('div');
    markdownContainer.id = 'markdown-container';
    markdownContainer.style.cssText = `
      width: 100%;
      height: 100%;
      padding: 30px 40px;
      overflow-y: auto;
      box-sizing: border-box;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      font-size: 16px;
      line-height: 1.6;
      color: #333;
    `;
    viewerContainer.parentElement.appendChild(markdownContainer);
  }
  markdownContainer.style.display = 'block';

  // Add close button if it doesn't exist
  if (!markdownContainer.querySelector('.markdown-close-btn')) {
    const closeBtn = document.createElement('button');
    closeBtn.className = 'markdown-close-btn';
    closeBtn.innerHTML = '×';
    closeBtn.onclick = () => {
      selectedAreaId = null;
      currentViewMode = 'panorama';
      markdownContainer.style.display = 'none';
      viewerContainer.style.display = 'block';
      if (currentFloorPlanLevel && floorPlanSvg) {
        drawFloorPlan(currentFloorPlanLevel);
      }
    };
    markdownContainer.appendChild(closeBtn);
  }

  // Load help.md file
  try {
    const response = await fetch('descriptions/help.md');
    if (response.ok) {
      const markdown = await response.text();
      // Enhanced markdown rendering with styling
      const html = convertMarkdownToHTML(markdown, 'descriptions/');
      markdownContainer.innerHTML = `
        <div class="markdown-content">
          ${html}
        </div>
      `;
    } else {
      markdownContainer.innerHTML = `<p>${t('area.descriptionNotFound', { file: 'descriptions/help.md' })}</p>`;
    }
  } catch (error) {
    console.error('Failed to load help description:', error);
    markdownContainer.innerHTML = `<p>${t('area.errorLoading')}</p>`;
  }
}

// Setup floor plan SVG click listener
function setupFloorPlanClickListener() {
  floorPlanContainer.addEventListener('click', (event) => {
    if (!floorPlanSvgContainer) return;

    // Get SVG coordinates
    const pt = floorPlanSvgContainer.createSVGPoint();
    pt.x = event.clientX;
    pt.y = event.clientY;

    // Transform to SVG coordinate system
    const svgP = pt.matrixTransform(floorPlanSvgContainer.getScreenCTM().inverse());
    const x = svgP.x;
    const y = svgP.y;

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
      // Deselect any area when loading a panorama
      selectedAreaId = null;
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
      // Toggle selection: if clicking the same area, deselect it; otherwise select the new one
      if (selectedAreaId === clickedArea._uniqueId) {
        selectedAreaId = null;
      } else {
        selectedAreaId = clickedArea._uniqueId;
      }

      // Redraw floor plan to show selection change
      drawFloorPlan(level);

      // Load area description
      loadAreaDescription(clickedArea);
    } else {
      // Clicked on empty space - deselect area if one was selected
      if (selectedAreaId !== null) {
        selectedAreaId = null;
        drawFloorPlan(level);
      }
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

  // Hide viewer and initial image, show markdown container
  hideInitialImage();
  viewerContainer.style.display = 'none';

  // Create or get markdown container
  let markdownContainer = document.getElementById('markdown-container');
  if (!markdownContainer) {
    markdownContainer = document.createElement('div');
    markdownContainer.id = 'markdown-container';
    markdownContainer.style.cssText = `
      width: 100%;
      height: 100%;
      padding: 30px 40px;
      overflow-y: auto;
      box-sizing: border-box;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      font-size: 16px;
      line-height: 1.6;
      color: #333;
    `;
    viewerContainer.parentElement.appendChild(markdownContainer);
  }
  markdownContainer.style.display = 'block';

  // Add close button if it doesn't exist
  if (!markdownContainer.querySelector('.markdown-close-btn')) {
    const closeBtn = document.createElement('button');
    closeBtn.className = 'markdown-close-btn';
    closeBtn.innerHTML = '×';
    closeBtn.onclick = () => {
      selectedAreaId = null;
      currentViewMode = 'panorama';
      markdownContainer.style.display = 'none';
      viewerContainer.style.display = 'block';
      if (currentFloorPlanLevel && floorPlanSvg) {
        drawFloorPlan(currentFloorPlanLevel);
      }
    };
    markdownContainer.appendChild(closeBtn);
  }

  // Load markdown file
  if (area.description_file && area.description_file.trim() !== '') {
    try {
      const response = await fetch(area.description_file);
      if (response.ok) {
        const markdown = await response.text();
        // Get the directory path of the markdown file for relative image paths
        const markdownDir = area.description_file.substring(0, area.description_file.lastIndexOf('/') + 1);
        // Enhanced markdown rendering with styling and path adjustment
        const html = convertMarkdownToHTML(markdown, markdownDir);
        markdownContainer.innerHTML = `
          <div class="markdown-content">
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
    markdownContainer.innerHTML = `
      <div style="max-width: 100%; text-align: left;">
        <p>${t('area.noDescription')}</p>
      </div>
    `;
  }
}

// Enhanced markdown to HTML converter with image and link support
function convertMarkdownToHTML(markdown, basePath = '') {
  return markdown
    // Images: ![alt](url) - adjust relative paths
    .replace(/!\[(.*?)\]\((.*?)\)/g, (match, alt, url) => {
      // If URL doesn't start with http://, https://, or /, treat as relative
      if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('/')) {
        url = basePath + url;
      }
      return `<img src="${url}" alt="${alt}" class="markdown-image">`;
    })
    // Links: [text](url)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    // Headings
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    // Bold and italic
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // Lines starting with 📐 - special styling
    .replace(/^📐(.+)$/gim, '<p class="area-measurement">📐$1</p>')
    // Unordered lists
    .replace(/^\* (.+)$/gim, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
    // Paragraphs
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>')
    .replace(/^(.+)$/gim, '<p>$1</p>')
    // Clean up
    .replace(/<p><h/g, '<h')
    .replace(/<\/h(\d)><\/p>/g, '</h$1>')
    .replace(/<p><img/g, '<img')
    .replace(/<\/p><\/p>/g, '</p>')
    .replace(/<p><ul>/g, '<ul>')
    .replace(/<\/ul><\/p>/g, '</ul>')
    // Clean up double-wrapped area-measurement paragraphs
    .replace(/<p><p class="area-measurement">/g, '<p class="area-measurement">')
    .replace(/<\/p><\/p>/g, '</p>');
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

// Show initial image on page load
function showInitialImage() {
  // Create initial image container if it doesn't exist
  if (!initialImageContainer) {
    initialImageContainer = document.createElement('div');
    initialImageContainer.id = 'initial-image-container';
    initialImageContainer.style.cssText = `
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      background-color: #000;
      overflow: hidden;
    `;

    const img = document.createElement('img');
    img.src = './assets/ext.png';
    img.style.cssText = `
      max-width: 100%;
      max-height: 100%;
      width: auto;
      height: auto;
      object-fit: contain;
    `;

    initialImageContainer.appendChild(img);
    viewerContainer.parentElement.appendChild(initialImageContainer);
  }

  // Hide viewer, show initial image
  viewerContainer.style.display = 'none';
  initialImageContainer.style.display = 'flex';
}

// Hide initial image
function hideInitialImage() {
  if (initialImageContainer) {
    initialImageContainer.style.display = 'none';
  }
}

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
  hideInitialImage();
  viewerContainer.style.display = 'block';

  currentPanoramaIndex = index;
  const panorama = validPanoramas[index];

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

    if (currentFloorPlanLevel && floorPlanSvg) {
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
async function loadFloorPlan(level) {
  // Don't reload if same level
  if (currentFloorPlanLevel === level && floorPlanSvg) {
    drawFloorPlan(level);
    return;
  }

  currentFloorPlanLevel = level;
  const floorPlanPath = `assets/${level}.svg`;

  // Translate level name
  const levelKey = level.charAt(0).toUpperCase() + level.slice(1);
  const levelName = translations[currentLanguage] && translations[currentLanguage][levelKey]
                    ? t(levelKey)
                    : levelKey;
  floorPlanTitle.textContent = t('floorPlanTitle', { level: levelName });

  try {
    // Fetch the SVG file
    const response = await fetch(floorPlanPath);
    if (!response.ok) {
      throw new Error(`Failed to load: ${floorPlanPath}`);
    }

    const svgText = await response.text();

    // Parse the SVG
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
    const loadedSvg = svgDoc.documentElement;

    // Get SVG dimensions
    const width = loadedSvg.getAttribute('width');
    const height = loadedSvg.getAttribute('height');
    const viewBox = loadedSvg.getAttribute('viewBox');

    // Remove old floor plan if exists
    if (floorPlanSvg && floorPlanSvg.parentNode) {
      floorPlanSvg.parentNode.removeChild(floorPlanSvg);
    }

    // Create a group for the floor plan
    floorPlanSvg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    floorPlanSvg.id = 'floor-plan-base';

    // Copy the content from loaded SVG
    while (loadedSvg.firstChild) {
      floorPlanSvg.appendChild(loadedSvg.firstChild);
    }

    // Insert floor plan as first child (below overlays)
    floorPlanSvgContainer.insertBefore(floorPlanSvg, floorPlanSvgContainer.firstChild);

    // Set SVG container dimensions
    if (width && height) {
      floorPlanSvgContainer.setAttribute('width', width);
      floorPlanSvgContainer.setAttribute('height', height);
    }
    if (viewBox) {
      floorPlanSvgContainer.setAttribute('viewBox', viewBox);
    }

    console.log(`Floor plan loaded: ${floorPlanPath}`);

    // Draw overlays
    drawFloorPlan(level);

  } catch (error) {
    console.error('Error loading floor plan:', error);
    // Show error in SVG
    floorPlanSvgContainer.setAttribute('width', '400');
    floorPlanSvgContainer.setAttribute('height', '300');
    floorPlanSvgContainer.setAttribute('viewBox', '0 0 400 300');

    const errorText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    errorText.setAttribute('x', '200');
    errorText.setAttribute('y', '150');
    errorText.setAttribute('text-anchor', 'middle');
    errorText.setAttribute('fill', '#fff');
    errorText.textContent = t('floorPlanNotAvailable');
    floorPlanSvgContainer.appendChild(errorText);
  }
}

// Parse WKT POLYGON format
function parseWKTPolygon(wkt) {
  // Extract coordinates from "POLYGON((x1 y1, x2 y2, ...))" or "POLYGON ((x1 y1, x2 y2, ...))"
  // Allow optional whitespace between POLYGON and the parentheses
  const match = wkt.match(/POLYGON\s*\(\((.*?)\)\)/);
  if (!match) return null;

  const points = match[1].split(',').map(pair => {
    const [x, y] = pair.trim().split(/\s+/).map(v => parseFloat(v));
    return [x, y];
  });

  return points;
}

// Draw area polygons on floor plan (SVG version)
function drawAreaPolygonsSvg(areas) {
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

    // Check if this area is selected (use unique ID to handle duplicate area_ids)
    const isSelected = selectedAreaId === area._uniqueId;

    // Only draw if selected
    if (isSelected) {
      // Create SVG path
      const pathData = points.map((point, index) => {
        const command = index === 0 ? 'M' : 'L';
        return `${command} ${point[0]} ${point[1]}`;
      }).join(' ') + ' Z';

      const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      polygon.setAttribute('d', pathData);

      // Fill with semi-transparent color
      const fillColor = area.fill_color || 'rgba(100, 150, 200, 0.3)';
      polygon.setAttribute('fill', fillColor);

      // Border
      const borderColor = area.border_color || area.color || '#4299e1';
      polygon.setAttribute('stroke', borderColor);
      polygon.setAttribute('stroke-width', '3');
      polygon.setAttribute('data-area-id', area._uniqueId);

      areasOverlayGroup.appendChild(polygon);
    }
    // When not selected: no fill, no border (fully transparent)
  });
}

// Draw area polygons on floor plan (Canvas version - kept for reference)
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

    // Check if this area is selected (use unique ID to handle duplicate area_ids)
    const isSelected = selectedAreaId === area._uniqueId;

    // Only draw if selected
    if (isSelected) {
      // Fill with semi-transparent color
      const fillColor = area.fill_color || 'rgba(100, 150, 200, 0.3)';
      ctx.fillStyle = fillColor;
      ctx.fill();

      // Border
      const borderColor = area.border_color || area.color || '#4299e1';
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    // When not selected: no fill, no border (fully transparent)
  });
}

// Draw floor plan with panorama markers (SVG version)
function drawFloorPlan(level) {
  if (!floorPlanSvg) return;

  // Clear overlay groups
  while (areasOverlayGroup.firstChild) {
    areasOverlayGroup.removeChild(areasOverlayGroup.firstChild);
  }
  while (floorPlanOverlayGroup.firstChild) {
    floorPlanOverlayGroup.removeChild(floorPlanOverlayGroup.firstChild);
  }

  // Draw area polygons for this level (below markers)
  const areasOnLevel = allAreas.filter(a => a.level === level);
  console.log(`Drawing ${areasOnLevel.length} areas for level ${level}`, areasOnLevel);
  drawAreaPolygonsSvg(areasOnLevel);

  // Draw panorama markers for this level
  const panoramasOnLevel = validPanoramas.filter(p => p.level === level);

  panoramasOnLevel.forEach((panorama) => {
    const x = parseInt(panorama.position_x);
    const y = parseInt(panorama.position_y);
    // Don't highlight any panorama as current if an area is selected
    const isCurrentPanorama = selectedAreaId === null && validPanoramas[currentPanoramaIndex] === panorama;

    // Draw marker using walking person icon or fallback to circle
    const useIcon = walkingPersonIcon && walkingPersonIcon.complete && walkingPersonIcon.naturalWidth > 0;

    if (useIcon) {
      const iconSize = isCurrentPanorama ? 60 : 48;

      // Add highlight for current panorama
      if (isCurrentPanorama) {
        const highlight = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        highlight.setAttribute('cx', x);
        highlight.setAttribute('cy', y);
        highlight.setAttribute('r', iconSize * 0.7);
        highlight.setAttribute('fill', 'rgba(66, 153, 225, 0.3)');
        highlight.setAttribute('stroke', '#4299e1');
        highlight.setAttribute('stroke-width', '2');
        floorPlanOverlayGroup.appendChild(highlight);
      }

      // Get orientation and current viewer yaw (for current panorama only)
      let rotation = 0;
      if (panorama.orientation && panorama.orientation.trim() !== '') {
        // Convert orientation from degrees to radians, then to degrees for SVG
        rotation = parseFloat(panorama.orientation);
      }

      // Add current viewer rotation for the active panorama
      if (isCurrentPanorama && viewer) {
        const position = viewer.getPosition();
        rotation += (position.yaw * 180) / Math.PI;
      }

      // Draw the walking person icon with rotation
      const iconImg = document.createElementNS('http://www.w3.org/2000/svg', 'image');
      iconImg.setAttributeNS('http://www.w3.org/1999/xlink', 'href', walkingPersonIcon.src);
      iconImg.setAttribute('x', x - iconSize / 2);
      iconImg.setAttribute('y', y - iconSize / 2);
      iconImg.setAttribute('width', iconSize);
      iconImg.setAttribute('height', iconSize);
      iconImg.setAttribute('transform', `rotate(${rotation}, ${x}, ${y})`);
      iconImg.setAttribute('data-panorama-index', validPanoramas.indexOf(panorama));
      floorPlanOverlayGroup.appendChild(iconImg);
    } else {
      // Fallback to circle if icon not loaded
      const marker = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      marker.setAttribute('cx', x);
      marker.setAttribute('cy', y);
      marker.setAttribute('r', isCurrentPanorama ? 20 : 16);
      marker.setAttribute('fill', isCurrentPanorama ? '#4299e1' : '#48bb78');
      marker.setAttribute('stroke', '#fff');
      marker.setAttribute('stroke-width', '2');
      marker.setAttribute('data-panorama-index', validPanoramas.indexOf(panorama));
      floorPlanOverlayGroup.appendChild(marker);
    }

    // Draw label (optional - only for current panorama)
    if (isCurrentPanorama) {
      const label = (currentLanguage === 'fr' ? panorama.name_fr : panorama.name_en)
                    || panorama.name_en || panorama.name_fr || '';
      if (label) {
        const labelGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');

        const labelBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        labelBg.setAttribute('x', x + 15);
        labelBg.setAttribute('y', y - 10);
        labelBg.setAttribute('width', label.length * 7 + 10);
        labelBg.setAttribute('height', 20);
        labelBg.setAttribute('fill', 'rgba(0, 0, 0, 0.7)');
        labelGroup.appendChild(labelBg);

        const labelText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        labelText.setAttribute('x', x + 20);
        labelText.setAttribute('y', y + 4);
        labelText.setAttribute('fill', '#fff');
        labelText.setAttribute('font-size', '12');
        labelText.setAttribute('font-family', 'sans-serif');
        labelText.textContent = label;
        labelGroup.appendChild(labelText);

        floorPlanOverlayGroup.appendChild(labelGroup);
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
