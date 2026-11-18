# Source icon

This directory needs **one master icon file** before you can build the desktop bundle:

    /app/aether-desktop/src-tauri/icons/source.png

Requirements:
* PNG, **1024 × 1024**, transparent background, RGBA.
* Use the same green / black Aether palette as the web app.

## Generate the full icon set

Once you've dropped your `source.png` here, run **once**:

```bash
cd aether-desktop
yarn install
yarn tauri icon src-tauri/icons/source.png
```

That command generates every size Tauri needs:

```
icons/
├── 32x32.png
├── 128x128.png
├── 128x128@2x.png
├── icon.icns      # macOS
├── icon.ico       # Windows
└── Square...png   # Windows store
```

Commit them all to git after generation. Done — `yarn build:msi` will work.

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:dc1c2d144eab02e2dfdeffea3386f42cfb4d60012fe40bb5e3f8a03e4b6f64c0 -->

## Use the included artwork

From `aether-desktop/`, copy the locally bundled logo to the icon source path:

```bash
cp ../frontend/public/aether-logo.png src-tauri/icons/source.png
```

The web app includes its own logo file and needs no hosted image service.


<!-- /coderabbit-ai-generated:v1 -->