# 360° Panorama Viewer

A fully client-side web application for displaying and navigating through equirectangular (360°) panoramic images, similar to Google Street View.

## Features

- Interactive 360° panorama viewing
- Navigation between panoramas using directional hotspots
- CSV-based configuration
- No build tools or dependencies to install
- Runs entirely in the browser
- Deployable to GitHub Pages

## Quick Start

### Local Development

1. Clone or download this repository
2. Serve the files using any local web server. For example:

   ```bash
   # Using Python 3
   python3 -m http.server 8000

   # Using Python 2
   python -m SimpleHTTPServer 8000

   # Using Node.js (if you have http-server installed)
   npx http-server
   ```

3. Open your browser and navigate to `http://localhost:8000`

### GitHub Pages Deployment

1. Push this repository to GitHub
2. Go to Settings > Pages
3. Select your branch (usually `main` or `master`)
4. Click Save
5. Your site will be available at `https://yourusername.github.io/repository-name/`

## Project Structure

```
.
├── index.html          # Main HTML file
├── app.js             # Application logic
├── style.css          # Styling
├── assets.csv         # Panorama configuration
├── assets/            # Panorama images
│   ├── entrée.jpg
│   ├── chambre_nord_est.jpg
│   └── ...
└── README.md          # This file
```

## Configuration

### CSV Format

The `assets.csv` file defines the panoramas and navigation links:

```csv
file_path,north,east,south,west,name_fr,name_en
./assets/entrée.jpg,./assets/escalier_entrée.jpg,,,,Entrée,Entrance
./assets/escalier_entrée.jpg,./assets/couloir_1er_nord.jpg,,./assets/entrée.jpg,,Escalier entrée,Entrance staircase
```

#### Required Column

- `file_path`: Path to the equirectangular image (relative to the HTML file)

#### Optional Navigation Columns

- `north`: Path to the panorama to the north
- `east`: Path to the panorama to the east
- `south`: Path to the panorama to the south
- `west`: Path to the panorama to the west

#### Optional Display Columns

- `name_fr`: French name (not currently used in UI)
- `name_en`: English name (not currently used in UI)

Leave navigation cells empty if there's no link in that direction.

### Adding New Panoramas

1. Add your equirectangular images to the `assets/` folder
2. Edit `assets.csv` and add a new row with:
   - The path to your image
   - Paths to connected panoramas (north, east, south, west)
3. Update existing rows to link back to your new panorama

## Technical Details

### Dependencies (loaded via CDN)

- **Photo Sphere Viewer v5.11.1**: 360° panorama viewer
- **Three.js v0.160.0**: 3D rendering library
- **PapaParse v5.4.1**: CSV parsing

### Browser Compatibility

- Chrome/Edge: ✓
- Firefox: ✓
- Safari: ✓
- Mobile browsers: ✓

Requires a modern browser with ES6 module support.

## Controls

- **Mouse drag** or **touch**: Look around
- **Scroll** or **pinch**: Zoom in/out
- **Click hotspots**: Navigate to connected panoramas
- **Fullscreen button**: Enter/exit fullscreen mode

## Troubleshooting

### Images not loading

- Ensure image paths in `assets.csv` are correct and relative
- Check browser console for errors
- Verify images are in equirectangular format (2:1 aspect ratio)

### CSV not loading

- Ensure `assets.csv` is in the root directory
- Check for CSV syntax errors
- View browser console for parsing errors

### CORS errors

- Always run from a web server, not by opening `index.html` directly
- For local development, use `python -m http.server` or similar

## License

This project is open source and available under the MIT License.

## Credits

Built with:
- [Photo Sphere Viewer](https://photo-sphere-viewer.js.org/)
- [Three.js](https://threejs.org/)
- [PapaParse](https://www.papaparse.com/)
