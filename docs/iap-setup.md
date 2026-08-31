# Aurora Skin purchase setup

Gio Jump implements one durable, non-consumable OpenIAP product:

| Field | Value |
| --- | --- |
| Product ID / SKU | `com.giolaq.giojump.skin.aurora` |
| Suggested title | Aurora Skin |
| Type | One-time product / entitlement |
| Consumable | No |
| Entitlement | Equips the Aurora palette for Gio |

The game follows the OpenIAP lifecycle: initialize the store, fetch the product,
restore available purchases, listen for purchase updates, grant the skin only for
a completed purchase, and finish the transaction as non-consumable. The Android
TV and Fire OS wrappers use OpenIAP Android 3.5.0. The Vega wrapper uses
`react-native-iap` 16.5.0 and its Amazon Vega adapter. See the
[OpenIAP repository](https://github.com/hyodotdev/openiap) for the protocol and
platform implementation sources.

## Google Play for Android TV

1. Create the app with package name `com.giojump.tv` in Play Console.
2. Under **Monetize > Products > In-app products**, create and activate
   `com.giolaq.giojump.skin.aurora` as a one-time product.
3. Add the signed app to an internal test track and add the purchasing Google
   accounts as license testers. Google Play product lookup does not work for an
   arbitrary sideload whose signing identity or package does not match Play.
4. Compile-check the Play adapter with the debug variant:

   ```bash
   npm run android:apk:play
   ```

   The debug APK is written to
   `android/app/build/outputs/apk/play/debug/app-play-debug.apk`. Its application
   ID is `com.giojump.tv.debug`, so it does not match the production catalog.
5. For a real purchase test, configure release signing, run
   `npm run android:sync`, build `bundlePlayRelease`, upload the resulting app
   bundle to the internal track, and install it through Google Play. That build
   uses the catalog application ID `com.giojump.tv`.

## Amazon Appstore for Fire OS

1. Create the Fire TV Android app in the Amazon Developer Console with package
   name `com.giojump.tv`.
2. Add an entitlement with SKU `com.giolaq.giojump.skin.aurora` and make it
   available for the app's supported marketplaces.
3. Configure Amazon App Tester or Live App Testing for the test account and
   device. Product metadata must use the exact SKU above.
4. Compile-check the Amazon adapter with the debug variant:

   ```bash
   npm run android:apk:amazon
   ```

   The debug APK is written to
   `android/app/build/outputs/apk/amazon/debug/app-amazon-debug.apk`. Its
   application ID is `com.giojump.tv.debug`.
5. For Live App Testing, configure release signing and build
   `assembleAmazonRelease` after `npm run android:sync`. Upload the signed APK
   whose application ID is `com.giojump.tv`. If you test the debug APK through
   App Tester instead, its test catalog must target `com.giojump.tv.debug`.

## Amazon Appstore for Vega

1. In the Vega app whose package ID is `com.giolaq.giojump`, add an entitlement
   with SKU `com.giolaq.giojump.skin.aurora`.
2. Install the current Vega SDK, then install the wrapper dependencies and run
   its compatibility check:

   ```bash
   npm run vega:install
   npm run vega:doctor
   ```

3. Build with `npm run vega:build`. The manifest already requests the Appstore
   IAP core and tester services required by the OpenIAP Vega adapter.

## Entitlement and verification behavior

Gio Jump is a static, offline-capable game. It treats the authenticated store
SDK's completed purchase or restored purchase list as the local entitlement
authority; it never writes an owned flag to `localStorage`. An unfinished
transaction is reconciled again on the next launch, and finishing is idempotent.

For a release where resistance to a modified client is required, add server-side
verification (for example, OpenIAP IAPKit or your own Google Play / Amazon RVS
backend) between the purchase update and `finishTransaction`, and grant the skin
only after the backend confirms that the product ID matches the expected SKU.
