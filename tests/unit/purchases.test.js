import assert from "node:assert/strict";
import test from "node:test";
import {
  AURORA_SKIN_PRODUCT_ID,
  OpenIapSkinPurchase,
} from "../../src/purchases.js";

const PRODUCT = {
  id: AURORA_SKIN_PRODUCT_ID,
  displayPrice: "£1.99",
  title: "Aurora Skin",
  type: "in-app",
};

const PURCHASE = {
  id: "transaction-1",
  productId: AURORA_SKIN_PRODUCT_ID,
  purchaseState: "purchased",
  purchaseToken: "purchase-token-1",
};

function createStoreHarness({owned = false, productError = false} = {}) {
  const target = {};
  const requests = [];
  const transport = (rawPayload) => {
    const request = JSON.parse(rawPayload);
    requests.push(request);
    queueMicrotask(() => {
      if (request.method === "fetchProducts" && productError) {
        target.__GIO_JUMP_IAP_RECEIVE(JSON.stringify({
          channel: "giojump:iap",
          id: request.id,
          error: {code: "query-product", message: "Catalog unavailable"},
        }));
        return;
      }
      let result;
      if (request.method === "initConnection") result = true;
      if (request.method === "fetchProducts") result = [PRODUCT];
      if (request.method === "getAvailablePurchases") result = owned ? [PURCHASE] : [];
      if (request.method === "requestPurchase") result = { dispatched: true };
      if (request.method === "finishTransaction") result = true;
      target.__GIO_JUMP_IAP_RECEIVE(JSON.stringify({
        channel: "giojump:iap",
        id: request.id,
        result,
      }));
      if (request.method === "requestPurchase") {
        target.__GIO_JUMP_IAP_RECEIVE(JSON.stringify({
          channel: "giojump:iap",
          event: "purchaseUpdated",
          purchase: PURCHASE,
        }));
      }
    });
  };
  return { target, transport, requests };
}

test("restores and finishes an owned Aurora Skin purchase", async () => {
  const harness = createStoreHarness({ owned: true });
  const entitlements = [];
  const service = new OpenIapSkinPurchase({
    target: harness.target,
    transport: harness.transport,
    onEntitlement: (entitlement) => entitlements.push(entitlement),
  });

  await service.initialize();

  assert.equal(service.state.phase, "owned");
  assert.equal(entitlements[0].skin, "aurora");
  assert.deepEqual(
    harness.requests.map((request) => request.method).sort(),
    ["fetchProducts", "finishTransaction", "getAvailablePurchases", "initConnection"].sort(),
  );
  service.destroy();
});

test("restores ownership even when product metadata is temporarily unavailable", async () => {
  const harness = createStoreHarness({ owned: true, productError: true });
  const service = new OpenIapSkinPurchase({
    target: harness.target,
    transport: harness.transport,
  });

  await service.initialize();

  assert.equal(service.state.phase, "owned");
  service.destroy();
});

test("uses the OpenIAP event result to unlock a newly purchased skin", async () => {
  const harness = createStoreHarness();
  let resolveOwned;
  const owned = new Promise((resolve) => {
    resolveOwned = resolve;
  });
  const service = new OpenIapSkinPurchase({
    target: harness.target,
    transport: harness.transport,
    onState: (state) => {
      if (state.phase === "owned") resolveOwned();
    },
  });

  await service.initialize();
  assert.equal(service.state.phase, "available");
  await service.purchase();
  await owned;

  assert.equal(service.state.phase, "owned");
  assert.equal(
    harness.requests.find((request) => request.method === "requestPurchase")
      .params.request.google.skus[0],
    AURORA_SKIN_PRODUCT_ID,
  );
  assert.ok(harness.requests.some((request) => request.method === "finishTransaction"));
  service.destroy();
});

test("does not expose the purchase flow without a native store", async () => {
  const service = new OpenIapSkinPurchase({ target: {}, transport: null });
  await service.initialize();
  assert.equal(service.supported, false);
  assert.equal(service.state.phase, "unavailable");
  service.destroy();
});
