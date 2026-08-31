# Implement OpenIAP in Gio Jump

Gio Jump needs one purchase contract, not three store-specific versions of the
game. The web game owns the product state and equips the skin. Each native shell
only translates that contract into the store API available on Android TV,
Fire OS, or Vega OS.

This guide is for a maintainer who can edit the JavaScript, Kotlin, and
TypeScript in this repository. When you finish, a player can buy the durable
Aurora Skin, keep it after restarting or reinstalling the game, and use the
same remote-control flow on all three targets.

OpenIAP defines the lifecycle used here:
`initConnection` → listen → `fetchProducts` → `requestPurchase` → verify and
grant → `finishTransaction`. Its
[lifecycle documentation](https://www.openiap.dev/docs/lifecycle) is the source
of truth for the order and meaning of those operations.

## Before you start

You need:

- Node.js and the root dependencies installed with `npm ci`.
- JDK 17 and Android SDK 36 for the Android wrappers.
- Vega SDK 0.24 for the Vega package.
- Access to Google Play Console and both Amazon Appstore catalogs.
- One exact SKU in every store: `com.giolaq.giojump.skin.aurora`.

Treat the skin as a non-consumable entitlement. A player buys it once, so
finishing the transaction must acknowledge it without consuming it.

| Field | Value |
| --- | --- |
| Product ID | `com.giolaq.giojump.skin.aurora` |
| Product type | In-app product / entitlement |
| Consumable | No |
| Game result | Equip the `aurora` player palette |
| Android application ID | `com.giojump.tv` |
| Vega package ID | `com.giolaq.giojump` |

## How the pieces fit

The store SDK cannot run inside Gio Jump's HTML bundle. A small message bridge
keeps the game code shared while native code owns store access.

| Layer | Responsibility |
| --- | --- |
| `src/purchases.js` | Own the OpenIAP lifecycle, product state, restore logic, and entitlement decision. |
| `src/main.js` and `src/game.js` | Render the TV-safe buy state and equip the skin. |
| Android `OpenIapWebBridge.kt` | Call the Google Play or Amazon Appstore OpenIAP implementation. |
| Vega `iapBridge.ts` | Call `react-native-iap` through its Vega adapter. |
| Native WebView shell | Carry JSON requests to native code and return responses and purchase events. |

The shared request envelope is:

```json
{
  "channel": "giojump:iap",
  "id": "1",
  "method": "fetchProducts",
  "params": {}
}
```

Android receives it through `window.GioJumpIAP.postMessage`. Vega receives it
through `window.ReactNativeWebView.postMessage`. Both return JSON to
`window.__GIO_JUMP_IAP_RECEIVE`. The request ID resolves ordinary calls;
`purchaseUpdated` and `purchaseError` arrive as events because a store purchase
does not complete when the player presses the buy button.

## 1. Add the skin as a game entitlement

Start with the result the player receives. In
[`src/textures.js`](../src/textures.js), define the palette under a stable game
ID:

```js
const PLAYER_SKINS = Object.freeze({
  classic: Object.freeze({ /* existing colors */ }),
  aurora: Object.freeze({
    body: "#6574e8",
    bodyDark: "#4948a9",
    inner: "#9be9d1",
    badge: "#9be9d1",
    shoes: "#e8e5ff",
  }),
});
```

Make texture creation accept the skin ID, then let
[`src/game.js`](../src/game.js) replace the player's textures without replacing
the player object:

```js
setPlayerSkin(skin) {
  if (!new Set(["classic", "aurora"]).has(skin)) return false;
  if (skin === this.playerSkin) return true;

  const previousTextures = this.playerTextures;
  this.playerTextures = createPlayerTextures(skin);
  this.playerSkin = skin;
  this.updatePlayerAnimation();
  Object.values(previousTextures).forEach((texture) => texture.dispose());
  return true;
}
```

Disposing the old Three.js textures matters on a television: repeatedly
equipping skins must not leak GPU memory.

## 2. Implement the shared purchase state machine

Keep the store SKU beside the game entitlement in
[`src/purchases.js`](../src/purchases.js):

```js
export const AURORA_SKIN_ID = "aurora";
export const AURORA_SKIN_PRODUCT_ID =
  "com.giolaq.giojump.skin.aurora";
```

The module resolves a transport instead of importing a platform SDK:

```js
function resolveNativeTransport(target) {
  if (typeof target.GioJumpIAP?.postMessage === "function") {
    return (message) => target.GioJumpIAP.postMessage(message);
  }

  if (
    target.__GIO_JUMP_IAP_ENABLED__ === true &&
    typeof target.ReactNativeWebView?.postMessage === "function"
  ) {
    return (message) => target.ReactNativeWebView.postMessage(message);
  }

  return null;
}
```

The explicit Vega flag prevents an unrelated React Native WebView from exposing
the purchase UI. With no native transport, a normal browser build stays
playable and hides the buy button.

During initialization, connect first, then fetch the product and restore owned
purchases in parallel:

```js
await this.request("initConnection");
const [products, purchases] = await Promise.all([
  this.request("fetchProducts", {
    skus: [AURORA_SKIN_PRODUCT_ID],
    type: "in-app",
  }),
  this.request("getAvailablePurchases"),
]);
```

Restoration is part of startup, not a separate button. It lets the store remain
the source of ownership after an app reinstall. Do not write `auroraOwned=true`
to `localStorage`; a user could set that value without buying the product, and
it would not survive a clean reinstall reliably.

When the player buys the skin, request the store flow and wait for the event:

```js
await this.request("requestPurchase", {
  request: {
    google: {skus: [AURORA_SKIN_PRODUCT_ID]},
  },
  type: "in-app",
});
```

`requestPurchase` only says that the store flow was dispatched. The
[OpenIAP React Native documentation](https://www.openiap.dev/docs/setup/react-native)
requires the app to receive the result through `purchaseUpdatedListener` or
`purchaseErrorListener`.

Accept only a completed purchase for the exact SKU:

```js
if (
  purchase?.productId !== AURORA_SKIN_PRODUCT_ID ||
  !["purchased", "completed"].includes(
    String(purchase?.purchaseState ?? "").toLowerCase(),
  )
) {
  return false;
}

this.onEntitlement({skin: AURORA_SKIN_ID, purchase});
await this.request("finishTransaction", {
  purchase,
  isConsumable: false,
});
```

The real class also correlates responses by request ID, times out abandoned
requests after 30 seconds, converts cancellation into a recoverable UI state,
and restores ownership even when product metadata is temporarily unavailable.

## 3. Connect purchase state to the TV interface

Add a hidden, focusable button to the start menu in
[`index.html`](../index.html). Native initialization reveals it only when a store
transport exists:

```html
<button
  id="skin-button"
  class="secondary-action skin-action"
  type="button"
  aria-describedby="skin-status"
  data-menu-item
  hidden
>
  <span class="skin-action__swatch" aria-hidden="true"></span>
  <span id="skin-button-label">Checking Aurora Skin…</span>
</button>
<p id="skin-status" class="skin-status" aria-live="polite"></p>
```

`data-menu-item` includes the button in Gio Jump's D-pad navigation. Keep the
status in an `aria-live` element so loading, cancellation, and ownership changes
are announced without moving focus.

In [`src/main.js`](../src/main.js), map the purchase phases to visible states:

- `loading`: disable the button and show “Checking Aurora Skin…”.
- `available`: show the store's `displayPrice`, never a hard-coded price.
- `purchasing`: disable repeated input while the store UI is open.
- `owned`: equip the skin, disable the button, and move focus back to Play.
- `error`: let the player retry initialization or purchase.

Finally, connect entitlement delivery to the game:

```js
skinPurchase = createSkinPurchase({
  onState: updateSkinPurchase,
  onEntitlement() {
    game?.setPlayerSkin("aurora");
  },
});

if (skinPurchase.supported) {
  elements.skinButton.hidden = false;
  void skinPurchase.initialize();
}
```

## 4. Add Google Play and Amazon Android variants

The same Android wrapper can target two stores, but it must link only the
adapter for the APK being built. In
[`android/app/build.gradle`](../android/app/build.gradle), create a store flavor
dimension and use flavor-specific dependencies:

```groovy
flavorDimensions "store"
productFlavors {
    play { dimension "store" }
    amazon { dimension "store" }
}

dependencies {
    playImplementation "io.github.hyochan.openiap:openiap-google:3.5.0"
    amazonImplementation "io.github.hyochan.openiap:openiap-google-amazon:3.5.0"
    implementation "org.jetbrains.kotlinx:kotlinx-coroutines-android:1.11.0"
}
```

The project pins Kotlin 2.1.20, compiles against Android SDK 36, and targets JVM
17. Keep the OpenIAP versions aligned across the two flavors.

Build each target independently:

```bash
npm run android:apk:play
npm run android:apk:amazon
```

The scripts build the Vite app, copy `dist/` into the Android assets directory,
then produce:

```text
android/app/build/outputs/apk/play/debug/app-play-debug.apk
android/app/build/outputs/apk/amazon/debug/app-amazon-debug.apk
```

These debug APKs use the application ID `com.giojump.tv.debug` because the
debug build type adds `.debug`. Use them to check compilation and the local
bridge. A real catalog test must use a signed build whose application ID matches
the store app, `com.giojump.tv`, or a separate store app and catalog created for
the debug ID. For the normal release path, configure signing, run
`npm run android:sync`, then build `bundlePlayRelease` for Google Play and
`assembleAmazonRelease` for Amazon.

## 5. Expose OpenIAP to the Android WebView

[`OpenIapWebBridge.kt`](../android/app/src/main/java/com/giojump/tv/OpenIapWebBridge.kt)
owns one `OpenIapStore`. Register the listeners as soon as the bridge is created:

```kotlin
private val purchaseUpdateListener = OpenIapPurchaseUpdateListener { purchase ->
    cachePurchase(purchase)
    emitEvent("purchaseUpdated", "purchase", purchase.toJson())
}

private val purchaseErrorListener = OpenIapPurchaseErrorListener { error ->
    emitEvent("purchaseError", "error", error.toJSON())
}
```

Expose one `@JavascriptInterface` method and allowlist the supported operations:

```kotlin
private suspend fun handle(method: String): Any? = when (method) {
    "initConnection" -> store.initConnection()
    "fetchProducts" -> fetchProducts()
    "getAvailablePurchases" -> getAvailablePurchases()
    "requestPurchase" -> requestPurchase()
    "finishTransaction" -> finishTransaction()
    "endConnection" -> store.endConnection()
    else -> throw IllegalArgumentException("Unsupported OpenIAP method: $method")
}
```

Do not trust a SKU sent by the WebView. The bridge hard-codes the single allowed
product in every native call:

```kotlin
private companion object {
    const val CHANNEL = "giojump:iap"
    const val PRODUCT_ID = "com.giolaq.giojump.skin.aurora"
}
```

That boundary prevents modified web content from asking the native wrapper to
buy or finish an arbitrary product. `finishTransaction` retrieves the matching
native `Purchase` from its cache or from `getAvailablePurchases`, then calls:

```kotlin
store.finishTransaction(purchase, false)
```

`false` acknowledges this entitlement without consuming it. The official
[`finishTransaction` reference](https://www.openiap.dev/docs/apis/finish-transaction)
explains why the original native purchase object must be retained and why an
Android purchase must be finished.

In
[`MainActivity.java`](../android/app/src/main/java/com/giojump/tv/MainActivity.java),
attach the bridge before loading the local game:

```java
iapBridge = new OpenIapWebBridge(this, webView);
webView.addJavascriptInterface(iapBridge, "GioJumpIAP");
webView.loadUrl("https://appassets.androidplatform.net/index.html");
```

The activity blocks navigation away from the packaged asset host. Keep that
restriction: a JavaScript interface should never be exposed to untrusted web
content. On destruction, remove the interface, detach both store listeners, call
`endConnection`, and destroy the WebView.

## 6. Add the Vega OpenIAP adapter

Vega is a separate React Native for Vega package, not another Android flavor.
Install the dependencies in [`vega/package.json`](../vega/package.json):

```json
{
  "dependencies": {
    "@amazon-devices/keplerscript-appstore-iap-lib": "~2.13.0",
    "react-native-iap": "16.5.0",
    "react-native-nitro-modules": "^0.36.5"
  }
}
```

The Vega manifest must request the Appstore IAP purchase module, library, core
service, and tester service. See the exact entries in
[`vega/manifest.toml`](../vega/manifest.toml); omitting them can make the package
compile while leaving the purchase service unavailable at runtime.

[`vega/src/iapBridge.ts`](../vega/src/iapBridge.ts) uses the root
`react-native-iap` API because the WebView already owns UI state:

```ts
this.updatedSubscription = purchaseUpdatedListener((purchase) => {
  this.remember(purchase);
  this.send({channel: CHANNEL, event: 'purchaseUpdated', purchase});
});

this.errorSubscription = purchaseErrorListener((error) => {
  this.send({channel: CHANNEL, event: 'purchaseError', error: errorPayload(error)});
});
```

Its method switch mirrors Android: initialize, fetch, restore, request, finish,
and disconnect. The Vega adapter expects the SKU in
`request.google.skus`; `google` is the Android-side field name in the shared
request type, even though the selected runtime store is Amazon.

In [`vega/src/App.tsx`](../vega/src/App.tsx), enable the transport before the
page loads:

```ts
const VEGA_BOOTSTRAP =
  `window.__GIO_JUMP_PLATFORM__ = 'vega'; ` +
  `window.__GIO_JUMP_IAP_ENABLED__ = true; true;`;
```

Route WebView messages to `VegaOpenIapBridge`, then inject responses into the
same receiver used by Android:

```ts
webRef.current?.injectJavaScript(
  `window.__GIO_JUMP_IAP_RECEIVE&&` +
  `window.__GIO_JUMP_IAP_RECEIVE(${serialized});true;`,
);
```

Remove both event subscriptions and call `endConnection` when the React
component unmounts.

## 7. Create the product in all three catalogs

Code cannot make a store return a product that has not been configured. Create
the exact same SKU as a non-consumable entitlement in:

1. Google Play Console for the `com.giojump.tv` Android TV app.
2. Amazon Developer Console for the `com.giojump.tv` Fire OS app.
3. Amazon Developer Console for the `com.giolaq.giojump` Vega app.

Use a signed test build and an approved tester account. The build's application
ID must match its catalog. Google Play product lookup also depends on the
signing identity and active test track. The exact console and device-testing steps are in
[`docs/iap-setup.md`](iap-setup.md).

## 8. Decide where purchase verification belongs

The current game is static and offline-capable. It grants the skin after the
authenticated store SDK reports a completed purchase or restores it through
`getAvailablePurchases`. That is enough to test the full local lifecycle, but a
modified client could bypass the local check.

For a production release that must resist client tampering, insert IAPKit or
your own verification backend before `onEntitlement` and
`finishTransaction`:

```text
purchaseUpdated
  → send the purchase token and expected SKU to the backend
  → verify store, app, product, state, and environment
  → grant Aurora only when verification succeeds
  → finishTransaction(purchase, false)
```

Do not put store credentials in the game bundle or either WebView bridge. The
[OpenIAP example](https://www.openiap.dev/docs/example) shows the same
verify-then-finish boundary.

## 9. Test the behavior before store submission

Run the shared purchase state tests:

```bash
npm test
```

They cover a new purchase, restoration, metadata failure during restoration,
transaction finishing, and the browser-without-store fallback.

Run the browser integration test:

```bash
npx playwright install chromium
npm run test:e2e
```

The Playwright store double proves that D-pad focus reaches the buy button, the
display price comes from the store response, `purchaseUpdated` equips Aurora,
and `finishTransaction` follows the grant.

Check both Android adapters at compile time:

```bash
npm run android:apk:play
npm run android:apk:amazon
```

Check and build Vega:

```bash
npm run vega:install
npm run vega:doctor
npm --prefix vega test -- --runInBand
npm run vega:build
```

Then perform one sandbox purchase and one restore on a physical device for each
store. A browser mock proves the bridge contract; it cannot prove catalog
visibility, the store sheet, account eligibility, acknowledgement, or restore
behavior on a real store.

## Failure guide

| Symptom | Check |
| --- | --- |
| The buy button is hidden | In a browser this is expected. On Android, confirm `GioJumpIAP` is attached before `loadUrl`. On Vega, confirm the bootstrap flag and `ReactNativeWebView` transport exist. |
| “Aurora Skin is not configured in this store” | Match the SKU exactly, activate the product, and confirm the installed app uses the correct package, signature, test track, and store flavor. |
| The button stays on “Waiting for the store…” | Register purchase listeners before starting the purchase and confirm the device's tester account can open the store sheet. |
| Play works but Fire OS does not | Build `amazonDebug` or `amazonRelease`; the Play flavor does not contain the Amazon OpenIAP adapter. |
| Vega reports that its IAP module is unavailable | Install the Kepler Appstore library and keep the required IAP modules and services in `manifest.toml`. |
| The skin restores but its price is missing | Ownership comes from `getAvailablePurchases`; catalog metadata can fail independently. Keep the entitlement and retry product lookup later. |
| A completed Android purchase is refunded | Confirm verification and `finishTransaction(purchase, false)` completed within the store's acknowledgement window. |

The implementation is complete when the store—not a local flag—can restore the
Aurora entitlement and the same `purchaseUpdated` event equips the skin on all
three targets.
