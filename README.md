# Gio Jump

Gio Jump is a colorful side-scrolling platform game built with Three.js for the
web and Amazon Fire TV. Guide Gio across Cloudberry Kingdom, collect stars,
activate checkpoints, avoid enemies, and reach the finish flag.

![Gio Jump gameplay on a television](docs/images/gio-jump-fire-tv.png)

## Features

- Play a complete platforming course with 18 collectibles and two checkpoints.
- Use keyboard, gamepad, or Fire TV remote controls.
- Run the same game in a browser or an Android WebView.
- Scale rendering automatically for lower-power Android and Fire TV devices.
- Preserve responsive layouts across television, desktop, and mobile screens.
- Generate music and sound effects with the Web Audio API.

## Get started

### Prerequisites

Install the following tools:

| Tool | Requirement |
| --- | --- |
| Node.js | 20 or later |
| npm | 10 or later |
| Browser | WebGL-capable browser |

To build the Android app, also install:

| Tool | Requirement |
| --- | --- |
| JDK | 17 |
| Android SDK | API level 35 |
| ADB | Required to deploy to a Fire TV device |

The repository includes the Gradle wrapper. You don't need to install Gradle
separately.

### Run the web game

1. Install the dependencies:

   ```bash
   npm ci
   ```

2. Start the development server:

   ```bash
   npm run dev
   ```

3. Open the URL shown by Vite. The default local URL is
   `http://localhost:5173`.

### Create a production build

Run:

```bash
npm run build
```

Vite writes the optimized web bundle to `dist/`.

## Controls

| Action | Keyboard or remote | Gamepad |
| --- | --- | --- |
| Move | Left or Right arrow | Left stick or D-pad |
| Jump | Up arrow, Enter, or Space | D-pad Up or primary button |
| Fast fall | Down arrow | D-pad Down |
| Pause | Escape or media Play/Pause | Start |
| Select menu item | Enter or Space | Primary button |
| Go back | Escape or Back | Secondary button |

The game is designed so you can complete the course with a Fire TV directional
remote.

## Build the Android app

The Android application packages the production web bundle in a
hardware-accelerated `WebView`.

1. Set `ANDROID_HOME` to your Android SDK directory.

2. Build the debug APK:

   ```bash
   npm run android:apk
   ```

3. Find the APK at:

   ```text
   android/app/build/outputs/apk/debug/app-debug.apk
   ```

The build command first runs Vite, copies `dist/` into the Android assets
directory, and then runs `assembleDebug`.

## Deploy to Fire TV

1. Enable developer options and ADB debugging on the Fire TV.

2. Confirm that ADB can see the device:

   ```bash
   adb devices
   ```

3. Install the debug APK:

   ```bash
   adb -s <device-serial> install -r \
     android/app/build/outputs/apk/debug/app-debug.apk
   ```

4. Launch Gio Jump:

   ```bash
   adb -s <device-serial> shell am start \
     -n com.giojump.tv.debug/com.giojump.tv.MainActivity
   ```

## Test the game

Run the unit tests:

```bash
npm test
```

Install the Playwright browser once, then run the end-to-end tests:

```bash
npx playwright install chromium
npm run test:e2e
```

The end-to-end suite verifies WebGL rendering, keyboard and remote navigation,
responsive television layouts, mobile fallback behavior, and full course
completion.

## Project structure

| Path | Purpose |
| --- | --- |
| `src/game.js` | Three.js scene, game loop, collisions, camera, and effects |
| `src/level.js` | Platforms, collectibles, enemies, and checkpoints |
| `src/input.js` | Keyboard, remote, and gamepad input mapping |
| `src/audio.js` | Web Audio music and sound effects |
| `src/textures.js` | Procedurally generated character textures |
| `src/main.js` | UI state and game integration |
| `android/` | Native Android and Fire TV wrapper |
| `tests/unit/` | Unit tests for input and level helpers |
| `tests/e2e/` | Playwright gameplay and visual smoke tests |

## Performance

Gio Jump uses a fixed 60 Hz simulation and an adaptive renderer. The renderer
uses a balanced profile on Android and Fire TV, lowers render resolution when
frame time exceeds the target, batches particle effects, and limits menu
rendering to reduce idle GPU use.

Force a renderer profile during browser testing:

```text
http://localhost:5173/?quality=high
http://localhost:5173/?quality=low
```

## Troubleshooting

### The browser shows a WebGL error

Enable hardware acceleration in the browser and confirm that the device
supports WebGL 2.

### ADB doesn't list the Fire TV

Confirm that ADB debugging is enabled, accept the authorization prompt on the
television, and reconnect with `adb connect <device-ip>` when using network
debugging.

### Gradle uses the wrong Java version

Run `java -version` and verify that the active JDK is version 17.

### Android changes don't appear

Run `npm run android:apk` again. This command refreshes the generated WebView
assets before Gradle packages the APK.
