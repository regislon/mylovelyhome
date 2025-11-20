
# 📄 **Project Documentation for the AI Tool (in English)**

## **1. Project Goal**

The goal of this project is to build a **fully client-side web application** capable of displaying **equirectangular (360°) images** and allowing the user to navigate between them, similarly to Google Street View.

The application must:

* Load a **CSV file (`assets.csv`)** containing a list of image paths and optional navigation links.
* Display each image as an interactive **360° panorama**.
* Allow navigation between panoramas using hotspots or directional arrows.
* Run entirely in the browser with **no installation, no build steps, and no bundlers**.
* Be deployable directly on **GitHub Pages**.

---

## **2. Technical Requirements**

### **2.1 Environment**

* No NPM, no Node.js, no bundlers.
* All dependencies must be loaded via **CDN**.
* Only modern native browser APIs (ES6 modules allowed).
* Must run offline once deployed (no server required).

### **2.2 Allowed Libraries (CDN Only)**

You may use the following libraries:

1. **Photo Sphere Viewer (v5+)**

   * Provides the 360° panorama viewer.
   * Requires `three.js`.

2. **three.js**

   * Required dependency for the viewer.

3. **PapaParse** or similar lightweight CSV parsing library

   * Used to read and parse `assets.csv`.

No other external library should be used unless it is CDN-based and installation-free.

---

## **3. CSV Structure**


### **3.1 assets CSV Structure**

The application must load a file named **`assets.csv`** located at the project root.

Only panoramas whose `file_path`, `position_x`, `position_y`, and `level` columns are **not empty** should be displayed.


| Column       | Description                                            |
| ------------ | ------------------------------------------------------ |
| `file_path`  | Relative path to the equirectangular image (JPEG/PNG). |
| `position_x` | X-coordinate of the panorama within the floor plan.    |
| `position_y` | Y-coordinate of the panorama within the floor plan.    |
| `level`      | Floor number associated with the panorama.             |
| `orientation`      | Orientation of the panorama in degree from the north.             |



### **3.2 Areas CSV Structure**

The application may optionally load a second file named **`areas.csv`** located at the project root.

| Column | Description |
| ------ | ----------- |
| `level` | Floor number associated with the area. |
| `polygon_wkt` | Polygon in Well-Known Text format representing the area on the floor plan. |
| `description_file` | Relative path to a markdown file containing the description of the area. |
| `area_id` | Unique identifier for the area. |
| `name_en` | Name of the area in English. |
| `name_fr` | Name of the area in French. |



---

## **4. Configuration and Internationalization**

### **4.1 Application Configuration (`config.json`)**

The application loads a configuration file **`config.json`** at startup to configure application settings.

**Structure:**

```json
{
  "language": "fr",
  "defaultZoomLevel": 0,
  "pitchLimitDegrees": 60,
  "transitionDuration": 1000,
  "floorPlanIconSize": {
    "current": 30,
    "other": 24
  }
}
```

**Configuration Parameters:**

| Parameter | Description | Default |
| --------- | ----------- | ------- |
| `language` | Application language code (`"fr"` or `"en"`) | `"fr"` |
| `defaultZoomLevel` | Initial zoom level for panoramas | `0` |
| `pitchLimitDegrees` | Maximum pitch angle (up/down) in degrees | `60` |
| `transitionDuration` | Panorama transition duration in milliseconds | `1000` |
| `floorPlanIconSize` | Icon sizes for floor plan markers | `{ current: 30, other: 24 }` |

**Important:** The language setting is **not** exposed to the user via UI. It must be configured in `config.json` only.

### **4.2 Translations (`translations.json`)**

The application supports multiple languages through a **`translations.json`** file.

**Structure:**

```json
{
  "en": {
    "floor": "Floor",
    "Level0": "Entrance",
    "Level1": "1st Floor",
    "Level2": "Attic",
    ...
  },
  "fr": {
    "floor": "Étage",
    "Level0": "Entrée",
    "Level1": "1er étage",
    "Level2": "Attique",
    ...
  }
}
```

**Translation Keys:**

* **UI Labels:** `floor`, `jumpTo`, `allLevels`, `selectLocation`
* **Level Names:** `Level0`, `Level1`, `Level2`, etc. (customizable per project)
* **Messages:** `loading`, `noValidPanoramas`, `failedToInitialize`, `failedToLoadPanorama`
* **Floor Plan:** `floorPlan`, `floorPlanTitle`, `floorPlanNotAvailable`
* **Navigation:** `navigation.north`, `navigation.east`, `navigation.south`, `navigation.west`, `navigation.goTo`
* **Areas:** `area.information`, `area.noDescription`, `area.descriptionNotFound`, `area.errorLoading`

**Placeholder Support:**

Translation strings support placeholders using `{variable}` syntax:
* `"floorPlanTitle": "Floor Plan - {level}"`
* `"failedToInitialize": "Failed to initialize: {error}"`

**Language-Aware Content:**

* Panorama names use `name_fr` or `name_en` based on current language
* Area names use `name_fr` or `name_en` based on current language
* Level names in dropdowns are translated using the configured language

---

## **5. Navigation Behavior**

### **Top Menu**

* A top menu must include one button for each floor level found in the CSV. only one floor can be selected at a time.


### **Left Panel: Floor Plan with Panorama Positions**

* Images named `level0.png`, `level1.png`, `level2.png`, `level3.png`, `level4.png`, etc. represent different floors.
* The left panel must display the floor plan corresponding to the current panorama’s level.
* the plan should be display at a height that avoid scrollbars, but as large ad the page allow it.
* Panorama positions must be plotted on the floor plan. use /equirectangular/icons/Walking_person_top_view.svg to represent each panorama.
* the initial orientation of the icon must reflect the `orientation` field from the CSV.
* use the rotation from the `orientation` field to rotate the icon representing the current panorama on the floor plan.
* when the user rotates the panorama, the icon representing the current panoram1
a on the floor plan must rotate accordingly to reflect the current orientation.
* When the user clicks a panorama marker on the floor plan, the corresponding panorama must be loaded.
* when the user unselect one Walking_person_top_view.svg, I want it keep the orientation it had before being unselected.
* display the area polygons from `areas.csv` on the floor plan. with transparent fill and colored border and put them bellow the svg icons.
* when the use click on an area polygon, load and display the corresponding markdown description in the right panel, instead of the panorama.
* when the use click on the  Walking_person_top_view.svg that is on top of an area polygon, load the panorama as usual (do not load the area description). 

### **Right Panel: 360° Viewer with Navigation Hotspots**

* When a panorama is displayed, the application must check which directional links are available.
* For each available direction, the viewer must create a **navigation hotspot** or arrow.
* Clicking a hotspot loads the linked panorama.
* Transitions should be smooth (fade or default Photo Sphere Viewer behavior).
* A dropdown menu must also be available to jump directly to any panorama.
* The zoom must be the lower by default when loading a panorama.
* limit the pitch to avoid bottom poles of the equirectangular images.








## **7. Application Logic (Expected Behavior)**

### **7.1 Initialization**

* Load `config.json` to get application settings (especially language).
* Load `translations.json` for internationalization.
* Load `assets.csv` using fetch().
* Load `areas.csv` (optional).
* Parse the CSVs to JSON.
* Build an internal dictionary of panoramas keyed by ID or path.
* Initialize UI text with translations.
* Load the first valid panorama in the list.

### **7.2 Panorama Rendering**

* Use **Photo Sphere Viewer** to create a viewer instance inside a container.
* Load the current panorama's `path` as the source.
* Apply configuration settings (zoom level, pitch limits, transition duration).





---

## **8. Deployment Requirements**

* The project must run from **static hosting** (GitHub Pages).
* All scripts and assets must use **relative** paths.
* No server-side code is allowed.

---

## **9. Constraints**

* No TypeScript unless compiled manually beforehand (not recommended).
* No package managers, bundlers, or containerized runtimes.
* Only **vanilla JavaScript**, HTML, CSS + allowed CDN libraries.

---

## **10. Deliverables Expected from the AI Tool**

The AI tool must be able to generate:

1. **A complete `index.html`** including CDN imports.
2. **A complete `app.js`** handling:

   * Configuration loading (`config.json`)
   * Translation loading (`translations.json`)
   * CSV loading (`assets.csv`, `areas.csv`)
   * Image rendering
   * Hotspot navigation
   * Internationalization
3. **A `config.json`** configuration file
4. **A `translations.json`** translations file with English and French support
5. **Template CSV files** (`assets.csv`, `areas.csv`)
6. **Basic CSS styling (`style.css`)**
7. Optional: README explaining usage and setup.

