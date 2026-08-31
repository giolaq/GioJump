# Gio Jump on Amazon Vega OS

Research snapshot: 2026-08-31. Sources are limited to Amazon's official developer documentation and official Amazon sample repositories.

## Executive conclusion

Gio Jump has a viable, officially supported Vega porting path: keep the existing Vite/Three.js game as web content and package it inside a full-screen React Native for Vega `WebView` app. Do **not** attempt to install the existing Android APK on Vega; Vega apps are React Native/native packages built as `.vpkg` files, not Android packages. Amazon explicitly positions WebView as the way to reuse HTML, JavaScript, and CSS on Vega, and its current WebView supports WebGL 2.0, Web Audio, and WASM. Amazon does not certify Three.js itself, so final compatibility still requires a real Vega build and performance testing on a physical Fire TV device. Sources: [Vega Web Apps overview](https://developer.amazon.com/docs/vega/0.24/overview-of-webview), [Vega SDK 0.24 release notes](https://developer.amazon.com/docs/vega/0.24/vega-release-notes), [WebGL best practices](https://developer.amazon.com/docs/vega/0.24/webview-webgl-best-practices).

The lowest-risk architecture is:

```text
existing Vite source
    -> vite build
    -> relative HTML/JS/CSS in dist/
    -> copy into vega/assets/
    -> file:///pkg/assets/index.html
    -> full-screen @amazon-devices/webview
    -> React Native for Vega 0.83 wrapper
    -> armv7/aarch64/x86_64 .vpkg
```

This repository is already close on the web side:

- `vite.config.js` sets `base: "./"`, which is the correct direction for relative packaged asset URLs.
- Vite targets ES2017; SDK 0.24 WebView is Chromium 144, so that language target is conservative.
- Three.js renders through `WebGLRenderer`; Vega WebView documents WebGL 2.0 on OpenGL ES 3.0.
- Audio is synthesized with `AudioContext`; WebView 4.0.x explicitly adds Web Audio support.
- Keyboard input already covers arrows, Enter, and `MediaPlayPause`, but Vega Back needs an additional `GoBack` / key code `27` mapping and an exit path.
- The host initially had Vega SDK `0.22.5875`; SDK `0.24.9914` was installed for scaffolding, validation, and runtime testing.

## Exact application and runtime model

A Vega application package has a root `manifest.toml`, one or more components, and optional services/tasks. The launcher starts the single interactive component whose categories contain `com.amazon.category.main`. React Native for Vega is delivered by Vega OS and app code links to its runtime; for the current RN 0.83 track the interactive runtime module is `/com.amazon.kepler.runtime.react_native_kepler_4@IReactNativeKepler_0`. Sources: [manifest overview](https://developer.amazon.com/docs/vega/0.24/app-manifest), [component manifest](https://developer.amazon.com/docs/vega/0.24/manifest-components), [runtime modules](https://developer.amazon.com/docs/vega/0.24/vega-runtime-module).

There are two JavaScript environments in the proposed package:

1. The small outer app is React Native for Vega 0.83. Its only meaningful UI is the native Vega WebView component.
2. Gio Jump runs inside the WebView's Chromium 144 engine as normal HTML/CSS/JavaScript. That is where the DOM, Canvas, Web Audio, and Three.js/WebGL APIs exist.

SDK 0.24 ships `@amazon-devices/webview` 4.0.2 for RN 0.83. RN 0.72/WebView 3.5.7 remains supported for existing apps but Amazon says that track will be deprecated, so a new wrapper should use RN 0.83/WebView 4.0.2. The WebView overview currently contains one inconsistent snippet naming `@amazon/webview`, but its install/import examples and the release notes use `@amazon-devices/webview`; use the generated `vegaWebview` template and the release-note package name as the source of truth. Source: [SDK 0.24 release notes](https://developer.amazon.com/docs/vega/0.24/vega-release-notes).

## Recommended repository layout

Keep the current web and Android builds intact and add a sibling `vega/` wrapper:

```text
GioJump/
  src/                       existing web game
  dist/                      generated Vite output; do not hand-edit
  android/                   existing Fire OS/Android wrapper
  vega/
    App.tsx                  full-screen WebView wrapper
    manifest.toml
    package.json
    assets/
      index.html             copied from dist/
      assets/...             copied hashed JS/CSS files
      image/gio_jump.png     512x512 manifest icon
    ...template-generated Vega files
  scripts/sync-vega.mjs      recommended: build/copy dist into vega/assets
```

Generate `vega/` from the current SDK's `vegaWebview` template instead of hand-authoring its native and Metro configuration. Amazon states that SDK templates contain the required manifest, native modules, and directory structure. Source: [Build Your App](https://developer.amazon.com/docs/vega/0.24/build-an-app).

## WebView wrapper

The wrapper should be approximately the following, while retaining the template's own registration/export shape:

```tsx
import React from 'react';
import {BackHandler, StyleSheet, View} from 'react-native';
import {WebView} from '@amazon-devices/webview';

export const App = () => (
  <View style={styles.root}>
    <WebView
      style={styles.webview}
      hasTVPreferredFocus={true}
      source={{uri: 'file:///pkg/assets/index.html'}}
      javaScriptEnabled={true}
      allowJavaScriptInBackground={false}
      allowSystemKeyEvents={true}
      domStorageEnabled={false}
      mediaPlaybackRequiresUserAction={true}
      allowsDefaultMediaControl={false}
      onMessage={({nativeEvent}) => {
        if (nativeEvent.data === 'giojump:exit') BackHandler.exitApp();
      }}
    />
  </View>
);

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#000'},
  webview: {flex: 1},
});
```

`hasTVPreferredFocus` is required for correct TV focus. `allowSystemKeyEvents` is what sends Back into web JavaScript. `allowsDefaultMediaControl` should remain false for this game because Amazon notes that enabling default media control can capture the remote Menu key. `domStorageEnabled` can remain false because the current game does not use DOM storage. The game already begins audio after the Play action, so keeping the user-action requirement is appropriate. Sources: [WebView overview](https://developer.amazon.com/docs/vega/0.24/overview-of-webview), [WebView component reference](https://developer.amazon.com/docs/vega-api/0.24/webview-component-reference), [web-app developer guide](https://developer.amazon.com/docs/vega/0.24/develop-your-app-with-webview), [triage notes](https://developer.amazon.com/docs/vega/0.24/triage-guidelines).

## Local assets and serving

Amazon's documented offline mechanism is a file URL, not an embedded localhost server:

```text
WebView source: file:///pkg/assets/index.html
project source: <vega-project>/assets/index.html
installed path: /pkg/assets/index.html
```

`/pkg` and `/pkg/assets` are read-only. `/data` is app-private, writable, and persistent across reboot/upgrade. `/tmp` is app-private, writable, and nonpersistent. `allowFileAccess={true}` is only needed when loading outside the default `/pkg/assets` directory, such as `/data`; it should not be enabled for this design. Source: [Load local files in WebView](https://developer.amazon.com/docs/vega/0.24/develop-your-app-with-webview).

`vite.config.js` already uses `base: "./"`, so generated subresource URLs should resolve under `/pkg/assets`. Keep that setting. Asset changes are not delivered by Vega Fast Refresh or the IDE Run button: Amazon says local `/assets` changes require rebuilding the VPKG, and sometimes clearing the Vega build folder before rebuilding. Source: [Vega triage guidelines](https://developer.amazon.com/docs/vega/0.24/triage-guidelines).

One item needs an actual Vega smoke test: Amazon documents loading a local HTML file but does not explicitly guarantee every ES-module/CORS pattern under `file:`. Verify that Vite's generated `<script type="module">` loads from `/pkg/assets`. If it does not, change only the web production output to a classic single-bundle/IIFE form; do not introduce a production HTTP server as a workaround. WebView 4.0.2 disables cleartext HTTP by default, and Amazon recommends HTTPS or packaged files. Sources: [WebView local-file guide](https://developer.amazon.com/docs/vega/0.24/develop-your-app-with-webview), [SDK 0.24 release notes](https://developer.amazon.com/docs/vega/0.24/vega-release-notes).

## Manifest requirements

Use the generated template manifest and let `vega project update-manifest` manage OS/module entries. The following shows the relevant core rather than a replacement for the full generated file:

```toml
schema-version = 1

[package]
id = "com.giojump.tv"
title = "Gio Jump"
version = "1.0.0"
icon = "@image/gio_jump.png"

[os.version]
target = "1.2"
min = "1.2"

[components]
[[components.interactive]]
id = "com.giojump.tv.main"
runtime-module = "/com.amazon.kepler.runtime.react_native_kepler_4@IReactNativeKepler_0"
launch-type = "singleton"
categories = ["com.amazon.category.main"]

# Generated by Vega tooling; do not maintain by hand.
[[needs.module]]
id = "/com.amazon.vega.os@IVega_1_2"

[wants]
# Gio Jump audio/Web Audio integration.
[[wants.service]]
id = "com.amazon.audio.stream"
[[wants.service]]
id = "com.amazon.audio.control"

# Preserve the WebView template's generated/declared services, including
# group IPC where present.
[[wants.service]]
id = "com.amazon.gipc.uuid.*"

[offers]
[[offers.service]]
id = "com.amazon.gipc.uuid.*"
```

The package ID `com.giojump.tv` matches this repository's existing Android `applicationId`, which is preferable if the two binaries are to represent one Amazon Appstore product. It also satisfies the physical-device sideload rule because it does not begin with `com.amazon`. The icon must be a PNG at 512x512, at most 1 MB, stored under `assets/image`. The package ID must remain stable across updates. Sources: [package manifest](https://developer.amazon.com/docs/vega/0.24/manifest-package), [component manifest](https://developer.amazon.com/docs/vega/0.24/manifest-components), [Developer Mode](https://developer.amazon.com/docs/vega/0.24/developer-mode).

SDK 0.24 requires both `[os.version].min` and `.target`; OS 1.2 is currently the only minted target for SDK 0.24. The build fails without them. Source: [OS version manifest](https://developer.amazon.com/docs/vega/0.24/manifest-os-version).

The WebView overview lists optional services for keyboard, video, DRM, audio, accessibility, and group IPC. Gio Jump should request only what it uses, while preserving whatever the current `vegaWebview` template generates. It needs audio stream/control. It does not need video or DRM services. `com.amazon.inputmethod.service` is for an on-screen text keyboard, not ordinary D-pad key events, so it is unnecessary unless text entry is later added. Source: [WebView overview and service list](https://developer.amazon.com/docs/vega/0.24/overview-of-webview).

## Remote and controller input

Vega WebView's documented remote-to-web key events are:

| Remote action | Web event/key code | Extra wrapper setting |
| --- | ---: | --- |
| Select | `Enter`, 13 | none |
| Left / Up / Right / Down | `ArrowLeft` 37 / `ArrowUp` 38 / `ArrowRight` 39 / `ArrowDown` 40 | none |
| Back | `GoBack`, 27 | `allowSystemKeyEvents={true}` |
| Play/Pause | `MediaPlayPause`, 179 | none |
| Rewind | `MediaRewind`, 227 | none |
| Fast Forward | `MediaFastForward`, 228 | none |

Sources: [web-app developer guide](https://developer.amazon.com/docs/vega/0.24/develop-your-app-with-webview), [TV web-app best practices](https://developer.amazon.com/docs/vega/0.24/webview-development-best-practices-tv).

The current game should add `GoBack -> BACK` and key code `27 -> BACK`. It already calls `preventDefault()` and performs its own focus/menu navigation, which is correct: Vega WebView has spatial navigation enabled by default, and Amazon says custom navigation should prevent the default key action to avoid a conflict.

Back needs one additional lifecycle rule. With `allowSystemKeyEvents`, WebView consumes Back even when the page does not. While playing, Back can keep pausing the game; while paused it can keep resuming. At the top/start screen, the page should call:

```js
window.ReactNativeWebView?.postMessage('giojump:exit');
```

and the wrapper can call `BackHandler.exitApp()` as shown above. The native/web message bridge is officially supported through `injectJavaScript` in the native-to-web direction and `window.ReactNativeWebView.postMessage(string)` in the web-to-native direction. Sources: [WebView component reference](https://developer.amazon.com/docs/vega-api/0.24/webview-component-reference), [web-app developer guide](https://developer.amazon.com/docs/vega/0.24/develop-your-app-with-webview).

Do not treat `navigator.getGamepads()` as a required Vega capability: Amazon's WebView docs do not promise the browser Gamepad API. The present code already makes that path optional. If game-controller support becomes a release requirement, use the native React Native for Vega `useGamepadEventHandler` API and forward actions through the message bridge. Source: [Vega gamepad input](https://developer.amazon.com/docs/react-native-vega/0.83/useGamepadEventHandler).

## Three.js, WebGL, audio, and performance

Vega WebView officially supplies WebGL 2.0 over OpenGL ES 3.0, GLSL ES 3.00, WebAssembly, hardware acceleration, and a documented set of extensions including ASTC/ETC texture compression and `WEBGL_multi_draw`. WebGPU is unsupported. This is sufficient in principle for Three.js `WebGLRenderer`, but it is not a Three.js compatibility guarantee. Source: [WebGL best practices](https://developer.amazon.com/docs/vega/0.24/webview-webgl-best-practices).

Amazon's relevant performance guidance is to:

- stay under 500 draw calls per frame;
- render from `requestAnimationFrame`;
- batch/instance repeated objects and use texture atlases;
- reduce texture resolution and use compressed formats/mipmaps where useful;
- simplify shaders, lights, and shadows;
- use frustum/occlusion culling and level of detail;
- dispose of unused WebGL resources and avoid per-frame allocation;
- avoid synchronous WebGL queries on the main thread.

Gio Jump already has quality-selection logic and uses `requestAnimationFrame`; verify draw calls, memory, and frame time on the physical 1 GB device. The Fire TV Stick 4K Select has 1 GB RAM and a Mali G310-class GPU. Sources: [WebGL best practices](https://developer.amazon.com/docs/vega/0.24/webview-webgl-best-practices), [Fire TV device specifications](https://developer.amazon.com/docs/device-specs/device-specifications-fire-tv-streaming-media-player.html).

WebView 4.0.x explicitly supports the Web Audio API. The current synthesized PCM tones avoid external asset loading, but the manifest still needs the audio services above and audio focus/interruption should be tested for Home, Alexa, and app backgrounding. Source: [SDK 0.24 release notes](https://developer.amazon.com/docs/vega/0.24/vega-release-notes).

The browser Fullscreen API is not part of Amazon's documented WebView API surface. A Vega app WebView already fills the TV app surface, so hide or disable Gio Jump's fullscreen button for the packaged Vega build rather than depending on it. This is an inference from the documented WebView surface, not an explicit Amazon prohibition.

## Tool installation and availability

Current Vega Developer Tools requirements are:

- macOS 10.15+ or native Ubuntu 20.04/22.04/24.04;
- Node.js 18+;
- approximately 20 GB free disk space;
- Apple Silicon recommended on macOS;
- Windows and WSL unsupported;
- Intel Mac SDK support ends 2026-12-15.

The current host meets the CPU, Node, OS, and disk requirements, but its active SDK is old (`0.22.5875`). Source: [Install Vega Developer Tools](https://developer.amazon.com/docs/vega/0.24/install-vega-sdk).

Official first-time installer:

```bash
curl -fsSL https://sdk-installer.vega.labcollab.net/get_vvm.sh \
  | bash && source ~/vega/env
```

For this already-installed host, update without guessing a numeric SDK build:

```bash
vega update
vega sdk list-remote
vega sdk install <latest-0.24-build-listed>
vega sdk use <latest-0.24-build-listed>
vega --version
```

The SDK documentation is still marked Open Beta/pre-release, while the 0.24 release notes say Amazon is transitioning out of Open Beta and removing experimental APIs. Treat documented WebView/WebGL as platform features, but pin and re-test against each SDK/OS release. Sources: [Build overview](https://developer.amazon.com/docs/vega/0.24/build-apps-overview), [SDK 0.24 release notes](https://developer.amazon.com/docs/vega/0.24/vega-release-notes).

Physical Developer Mode requires a valid Amazon Developer Account and CLI authentication. Only packages whose IDs do not begin with `com.amazon` may be sideloaded. Source: [Enable Developer Mode](https://developer.amazon.com/docs/vega/0.24/developer-mode).

## Build, package, validate, and run

### 1. Scaffold once

From the repository root, with SDK 0.24 active:

```bash
vega project list-templates
vega project generate \
  --template vegaWebview \
  --name GioJump \
  --packageId com.giojump.tv \
  --outputDir vega
```

The exact template spelling in current Amazon documentation is `vegaWebview`. Source: [Build Your App](https://developer.amazon.com/docs/vega/0.24/build-an-app).

### 2. Build and sync the web game

```bash
npm ci
npm run build
node scripts/sync-vega.mjs
```

The sync script should copy the contents of root `dist/` into `vega/assets/` while preserving Vega-owned resources such as `vega/assets/image/gio_jump.png`, analogous to the repository's Android sync script.

### 3. Align dependencies and build the VPKG

From `vega/`:

```bash
vega project update-manifest --os-min 1.2 --os-version 1.2
vega project install --fix
npm install
vega project doctor
npx react-native build-vega --build-type Release \
  --build-version 1.0.0 --build-number 1
```

Amazon's canonical dependency/build chain is `vega project install --fix`, package-manager install, `vega project doctor`, then `npx react-native build-vega`. `npm run build:app` is the template-provided short form. Sources: [package management](https://developer.amazon.com/docs/vega-api/0.24/package-management), [app versioning](https://developer.amazon.com/docs/vega/0.24/app-version), [Build Your App](https://developer.amazon.com/docs/vega/0.24/build-an-app).

Expected outputs:

```text
build/aarch64-release/<app>_aarch64.vpkg   # VVD on Apple Silicon
build/x86_64-release/<app>_x86_64.vpkg     # VVD on x86_64 host
build/armv7-release/<app>_armv7.vpkg       # physical Vega Fire TV
```

### 4. Validate

```bash
vega exec vpt validate build/armv7-release/<app>_armv7.vpkg
vega exec vpt info build/armv7-release/<app>_armv7.vpkg --json
```

Strict ABI/package validation is required before Appstore submission. Sources: [VPT](https://developer.amazon.com/docs/vega/0.24/vpt), [Strict ABI check](https://developer.amazon.com/docs/vega/0.24/abi-check).

### 5. Run on Apple Silicon VVD

```bash
vega virtual-device start
vega run-app \
  build/aarch64-release/<app>_aarch64.vpkg \
  com.giojump.tv.main \
  -d VirtualDevice
```

Use the x86_64 VPKG on an x86_64 host. Source: [Run apps](https://developer.amazon.com/docs/vega/0.24/run-apps).

### 6. Run on physical Vega Fire TV

First enable Developer Mode:

```bash
vega devmode login
vega devmode enable-device --code <six-digit-code-shown-on-TV>
vega device list
```

Then install and launch the armv7 package:

```bash
vega device -d <device-serial> install-app \
  --packagePath build/armv7-release/<app>_armv7.vpkg
vega device -d <device-serial> launch-app \
  --appName com.giojump.tv.main
```

Source: [Run apps on Fire TV](https://developer.amazon.com/docs/vega/0.24/run-apps).

### 7. Distribution

The Amazon Developer Console accepts a Vega ARM VPKG for Live App Testing and selects Vega OS devices for that binary. An APK/AAB can coexist in the same listing for mutually exclusive Fire OS/AOSP devices. Source: [Live App Testing for Vega](https://developer.amazon.com/docs/vega/0.24/live-app-testing).

## Device and debugging limitations

- SDK 0.24 requires OS 1.2 (`2101020054720`) on the physical stick. Amazon's public device tables still describe the shipping Fire TV Stick 4K Select and Fire TV Stick HD as OS 1.1, so confirm that the particular test device has received the OS 1.2 update before promising that an SDK 0.24 VPKG can run on it. Sources: [SDK 0.24 release notes](https://developer.amazon.com/docs/vega/0.24/vega-release-notes), [Fire TV device table](https://developer.amazon.com/docs/device-specs/identify-fire-tv-devices.html).
- Current Run documentation names Fire TV Stick HD, Fire TV Stick 4K Select, and Fire TV Streaming Media Player as examples of Vega devices. Vega support does not extend to older Fire OS sticks merely because they run Fire TV. Source: [Run apps](https://developer.amazon.com/docs/vega/0.24/run-apps).
- Chrome DevTools is listed as unsupported for RN 0.83 in SDK 0.24; Amazon directs RN debugging to React Native DevTools. Older WebView documentation describes attaching Chrome DevTools to WebView content, so the exact 0.24 WebView debugging workflow is currently ambiguous and must be tested. Sources: [SDK 0.24 known issues](https://developer.amazon.com/docs/vega/0.24/vega-release-notes), [older WebView debugging guide](https://developer.amazon.com/docs/vega/0.21/debugging-webview-apps-with-vega-studio).
- The Vega Virtual Device is useful for function and focus tests, but it is not a substitute for the armv7 stick's 1 GB RAM/GPU performance. Amazon explicitly describes physical-device execution as essential before Appstore submission. Source: [Run apps](https://developer.amazon.com/docs/vega/0.24/run-apps).

## Acceptance checklist

The port should not be called compatible until all of these pass:

1. Root `npm test` and browser E2E tests still pass.
2. `dist/index.html` and all hashed JS/CSS load from `file:///pkg/assets/` with no network server.
3. `vega project doctor` and `vega exec vpt validate` pass.
4. The aarch64 VPKG launches on Apple Silicon VVD.
5. Arrow/Enter/PlayPause/Back work on both the VVD virtual remote and a physical remote.
6. Back pauses/resumes in-game and exits from the top screen through the native message bridge.
7. Web Audio starts only after Play, survives pause/resume, and yields correctly to system/Alexa audio.
8. Gameplay remains responsive at 1080p on the physical armv7 device, with measured draw calls, frame time, and memory.
9. Home/background/foreground and device sleep/resume do not leak audio, animation frames, WebGL resources, or input state.
10. The physical device is actually on OS 1.2 before testing an SDK 0.24 package.

## Remaining uncertainties

- Amazon documents WebGL 2.0, not Three.js as a tested library. A successful build is not proof of acceptable frame rate.
- Local HTML is documented, but Vite's precise ES-module behavior under Vega's packaged `file:` origin must be verified.
- The browser Gamepad API is not documented; native gamepad bridging is the supported fallback.
- The browser Fullscreen API is undocumented and unnecessary in a full-screen TV app.
- Current RN 0.83 release notes and older WebView debugging guidance conflict on Chrome DevTools availability.
- Public device-spec pages and SDK 0.24 disagree at a glance on shipping OS 1.1 versus required OS 1.2; the actual device software version is authoritative.

These uncertainties are testable and do not change the recommended architecture.
