
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

## **4. Navigation Behavior**

### **Top Menu**

* A top menu must include a dropdown allowing the user to directly jump to any panorama or switch between floor levels.

### **Left Panel: Floor Plan with Panorama Positions**

* Images named `level0.png`, `level1.png`, `level2.png`, `level3.png`, `level4.png`, etc. represent different floors.
* The left panel must display the floor plan corresponding to the current panorama’s level.
* Panorama positions must be plotted on the floor plan. use /equirectangular/icons/Walking_person_top_view.svg to represent each panorama.
* the initial orientation of the icon must reflect the `orientation` field from the CSV.
* use the rotation from the `orientation` field to rotate the icon representing the current panorama on the floor plan.
* when the user rotates the panorama, the icon representing the current panorama on the floor plan must rotate accordingly to reflect the current orientation.
* When the user clicks a panorama marker on the floor plan, the corresponding panorama must be loaded.
* when the user unselect one Walking_person_top_view.svg, I want it keep the orientation it had before being unselected.
* display the area polygons from `areas.csv` on the floor plan. with transparent fill and colored border and put them bellow the svg icons.
* when the use click on an area polygon, load and display the corresponding markdown description in the right panel, instead of the panorama.


### **Right Panel: 360° Viewer with Navigation Hotspots**

* When a panorama is displayed, the application must check which directional links are available.
* For each available direction, the viewer must create a **navigation hotspot** or arrow.
* Clicking a hotspot loads the linked panorama.
* Transitions should be smooth (fade or default Photo Sphere Viewer behavior).
* A dropdown menu must also be available to jump directly to any panorama.
* The zoom must be the lower by default when loading a panorama.








## **6. Application Logic (Expected Behavior)**

### **6.1 Initialization**

* Load `assets.csv` using fetch().
* Parse the CSV to JSON.
* Build an internal dictionary of panoramas keyed by ID or path.
* Load the first panorama in the list.

### **6.2 Panorama Rendering**

* Use **Photo Sphere Viewer** to create a viewer instance inside a container.
* Load the current panorama’s `path` as the source.





---

## **7. Deployment Requirements**

* The project must run from **static hosting** (GitHub Pages).
* All scripts and assets must use **relative** paths.
* No server-side code is allowed.

---

## **8. Constraints**

* No TypeScript unless compiled manually beforehand (not recommended).
* No package managers, bundlers, or containerized runtimes.
* Only **vanilla JavaScript**, HTML, CSS + allowed CDN libraries.

---

## **9. Deliverables Expected from the AI Tool**

The AI tool must be able to generate:

1. **A complete `index.html`** including CDN imports.
2. **A complete `app.js`** handling:

   * CSV loading
   * Image rendering
   * Hotspot navigation
3. **A template `assets.csv`**
4. **Basic CSS styling (`style.css`)**
5. Optional: README explaining usage and setup.

