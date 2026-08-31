import { expect, test } from "@playwright/test";
import { PNG } from "pngjs";

function expectRenderedPixels(buffer) {
  const png = PNG.sync.read(buffer);
  const buckets = new Set();
  let samples = 0;
  let luminanceTotal = 0;
  let luminanceSquaredTotal = 0;

  for (let index = 0; index < png.data.length; index += 64) {
    const red = png.data[index];
    const green = png.data[index + 1];
    const blue = png.data[index + 2];
    const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
    buckets.add(`${red >> 4}-${green >> 4}-${blue >> 4}`);
    luminanceTotal += luminance;
    luminanceSquaredTotal += luminance * luminance;
    samples += 1;
  }

  const mean = luminanceTotal / samples;
  const variance = luminanceSquaredTotal / samples - mean * mean;
  expect(buckets.size).toBeGreaterThan(45);
  expect(Math.sqrt(variance)).toBeGreaterThan(18);
}

test.describe("Gio Jump television flow", () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test("renders WebGL and plays with directional controls", async ({ page }, testInfo) => {
    await page.goto("/");
    await expect(page).toHaveTitle("Gio Jump");
    await expect(page.locator("#game-title")).toBeVisible();
    await expect(page.locator("#play-button")).toBeFocused();
    await expect(page.locator("#hud")).toBeHidden();
    await expect(page.locator("#star-total")).toHaveText("18");
    await page.waitForFunction(() => window.__GIO_JUMP__.state?.renderer.triangles > 100);

    const startFramePath = testInfo.outputPath("desktop-start.png");
    await page.screenshot({ path: startFramePath });
    await testInfo.attach("desktop start", { path: startFramePath, contentType: "image/png" });

    await page.keyboard.press("Enter");
    await expect(page.locator("#start-screen")).not.toBeVisible();

    const initial = await page.evaluate(() => window.__GIO_JUMP__.state);
    expect(initial.state).toBe("playing");
    expect(initial.renderer.triangles).toBeGreaterThan(100);
    expect(initial.renderer.calls).toBeGreaterThan(10);
    expect(initial.renderer.pixelRatio).toBeLessThanOrEqual(1.5);

    await page.keyboard.down("ArrowRight");
    await page.waitForTimeout(750);
    await page.keyboard.press("ArrowUp");
    await page.waitForTimeout(250);
    await page.keyboard.up("ArrowRight");

    const moved = await page.evaluate(() => window.__GIO_JUMP__.state);
    expect(moved.player.x).toBeGreaterThan(initial.player.x + 1);
    expect(moved.player.y).toBeGreaterThan(0.5);
    expect(moved.playerScreen.visible).toBe(true);
    expect(moved.playerScreen.x).toBeGreaterThan(0.08);
    expect(moved.playerScreen.x).toBeLessThan(0.92);

    const canvasFrame = await page.locator("#game-canvas").screenshot();
    expectRenderedPixels(canvasFrame);
    const gameplayFramePath = testInfo.outputPath("desktop-gameplay.png");
    await page.screenshot({ path: gameplayFramePath });
    await testInfo.attach("desktop gameplay", {
      path: gameplayFramePath,
      contentType: "image/png",
    });

    await page.keyboard.press("Escape");
    await expect(page.locator("#pause-screen")).toBeVisible();
    await expect(page.locator("#resume-button")).toBeFocused();

    await page.keyboard.press("ArrowDown");
    await expect(page.locator("#restart-button")).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Enter");
    await expect(page.locator("#pause-screen")).not.toBeVisible();
  });

  test("keeps TV-safe controls inside a 720p viewport", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/");

    const layout = await page.evaluate(() => {
      const play = document.querySelector("#play-button").getBoundingClientRect();
      const title = document.querySelector("#game-title").getBoundingClientRect();
      return {
        play: { x: play.x, y: play.y, width: play.width, height: play.height },
        title: { x: title.x, y: title.y, width: title.width, height: title.height },
        viewport: { width: innerWidth, height: innerHeight },
      };
    });

    expect(layout.play.height).toBeGreaterThanOrEqual(64);
    expect(layout.title.x).toBeGreaterThanOrEqual(0);
    expect(layout.title.y).toBeGreaterThanOrEqual(0);
    expect(layout.play.y + layout.play.height).toBeLessThan(layout.viewport.height);

    const framePath = testInfo.outputPath("tv-720p-start.png");
    await page.screenshot({ path: framePath });
    await testInfo.attach("720p start", { path: framePath, contentType: "image/png" });

    await page.keyboard.press("Enter");
    const sound = await page.locator("#sound-button").boundingBox();
    expect(sound.width).toBeGreaterThanOrEqual(52);
    expect(sound.x + sound.width).toBeLessThan(layout.viewport.width);
  });

  test("stays nonblank and playable in a narrow fallback viewport", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(page.locator("#game-title")).toBeVisible();
    await expect(page.locator("#play-button")).toBeInViewport();

    const startPath = testInfo.outputPath("mobile-start.png");
    await page.screenshot({ path: startPath });
    await testInfo.attach("mobile start", { path: startPath, contentType: "image/png" });

    await page.keyboard.press("Enter");
    const initialX = await page.evaluate(() => window.__GIO_JUMP__.state.player.x);
    await page.keyboard.down("ArrowRight");
    await page.waitForTimeout(500);
    await page.keyboard.up("ArrowRight");
    const moved = await page.evaluate(() => window.__GIO_JUMP__.state);
    expect(moved.player.x).toBeGreaterThan(initialX + 0.5);
    expect(moved.playerScreen.visible).toBe(true);
    expect(moved.playerScreen.x).toBeGreaterThan(0.08);
    expect(moved.playerScreen.x).toBeLessThan(0.92);

    const canvasFrame = await page.locator("#game-canvas").screenshot();
    expectRenderedPixels(canvasFrame);
    const gameplayPath = testInfo.outputPath("mobile-gameplay.png");
    await page.screenshot({ path: gameplayPath });
    await testInfo.attach("mobile gameplay", {
      path: gameplayPath,
      contentType: "image/png",
    });
  });

  test("handles Vega WebView quality and remote back events", async ({ page }) => {
    await page.addInitScript(() => {
      window.__GIO_JUMP_PLATFORM__ = "vega";
      window.__nativeMessages = [];
      window.ReactNativeWebView = {
        postMessage(message) {
          window.__nativeMessages.push(message);
        },
      };
    });
    await page.goto("/");
    await page.waitForFunction(() => window.__GIO_JUMP__.state?.renderer.triangles > 100);

    const renderer = await page.evaluate(() => window.__GIO_JUMP__.state.renderer);
    expect(renderer.quality).toBe("balanced");
    expect(renderer.shadows).toBe(false);

    await page.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", {
        key: "GoBack",
        keyCode: 27,
        bubbles: true,
      }));
    });
    expect(await page.evaluate(() => window.__nativeMessages)).toEqual(["giojump:exit"]);

    await page.keyboard.press("Enter");
    await page.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", {
        key: "GoBack",
        keyCode: 27,
        bubbles: true,
      }));
    });
    await expect(page.locator("#pause-screen")).toBeVisible();
  });

  test("buys and equips the Aurora Skin through the OpenIAP bridge", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.addInitScript(() => {
      const productId = "com.giolaq.giojump.skin.aurora";
      window.__iapRequests = [];
      window.GioJumpIAP = {
        postMessage(rawMessage) {
          const request = JSON.parse(rawMessage);
          window.__iapRequests.push(request);
          setTimeout(() => {
            const results = {
              initConnection: true,
              fetchProducts: [{
                id: productId,
                displayPrice: "£1.99",
                title: "Aurora Skin",
                type: "in-app",
              }],
              getAvailablePurchases: [],
              requestPurchase: { dispatched: true },
              finishTransaction: true,
            };
            window.__GIO_JUMP_IAP_RECEIVE(JSON.stringify({
              channel: "giojump:iap",
              id: request.id,
              result: results[request.method],
            }));
            if (request.method === "requestPurchase") {
              window.__GIO_JUMP_IAP_RECEIVE(JSON.stringify({
                channel: "giojump:iap",
                event: "purchaseUpdated",
                purchase: {
                  id: "tv-transaction-1",
                  productId,
                  purchaseState: "purchased",
                  purchaseToken: "tv-purchase-token-1",
                },
              }));
            }
          }, 0);
        },
      };
    });
    await page.goto("/");

    await expect(page.locator("#skin-button")).toBeVisible();
    await expect(page.locator("#skin-button")).toBeInViewport();
    await expect(page.locator("#skin-button-label")).toHaveText(
      "Buy Aurora Skin · £1.99",
    );
    await page.keyboard.press("ArrowDown");
    await expect(page.locator("#skin-button")).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(page.locator("#skin-button-label")).toHaveText(
      "Aurora Skin equipped",
    );
    await expect.poll(
      () => page.evaluate(() => window.__GIO_JUMP__.state.player.skin),
    ).toBe("aurora");
    const methods = await page.evaluate(() =>
      window.__iapRequests.map((request) => request.method),
    );
    expect(methods).toEqual(expect.arrayContaining([
      "initConnection",
      "fetchProducts",
      "getAvailablePurchases",
      "requestPurchase",
      "finishTransaction",
    ]));
  });

  test("can clear the course using only the directional cross", async ({ page }, testInfo) => {
    test.setTimeout(55_000);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/");
    await page.keyboard.press("Enter");
    await page.keyboard.down("ArrowRight");

    const deadline = Date.now() + 44_000;
    let finalState = await page.evaluate(() => window.__GIO_JUMP__.state);
    while (Date.now() < deadline && finalState.state === "playing") {
      await page.keyboard.down("ArrowUp");
      await page.waitForTimeout(350);
      await page.keyboard.up("ArrowUp");
      await page.waitForTimeout(35);
      finalState = await page.evaluate(() => window.__GIO_JUMP__.state);
    }
    await page.keyboard.up("ArrowRight");

    expect(finalState.state, JSON.stringify(finalState)).toBe("won");
    expect(finalState.player.x).toBeGreaterThanOrEqual(172);
    await expect(page.locator("#win-screen")).toBeVisible();
    const winPath = testInfo.outputPath("tv-win.png");
    await page.screenshot({ path: winPath });
    await testInfo.attach("TV win", { path: winPath, contentType: "image/png" });
  });
});
