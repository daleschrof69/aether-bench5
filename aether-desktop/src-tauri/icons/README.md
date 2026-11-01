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

## Quick placeholder (until you have proper artwork)

If you just want to test the build pipeline, you can use the Aether logo PNG
from the web app:

```bash
curl -L -o src-tauri/icons/source.png \
  "https://static.prod-images.emergentagent.com/jobs/540cc9df-c50a-4a07-a460-6c88ca22b1a7/images/2d4119f8e681e91c440e01928176b55e52818652e44fd72f5f424ba935136d9c.png"
```

That image is ~512×512 — Tauri will upscale, but the result will be slightly soft. Replace with proper 1024² artwork before shipping.
