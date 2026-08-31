export const AURORA_SKIN_ID = "aurora";
export const AURORA_SKIN_PRODUCT_ID = "com.giolaq.giojump.skin.aurora";

const CHANNEL = "giojump:iap";
const PURCHASE_TIMEOUT_MS = 30_000;

function errorFromPayload(payload = {}) {
  const error = new Error(payload.message || "The store request failed.");
  error.code = payload.code || "unknown";
  return error;
}

function isCancellation(error) {
  const code = String(error?.code ?? "").toLowerCase();
  return code.includes("cancel");
}

function isCompletedPurchase(purchase) {
  const state = String(purchase?.purchaseState ?? "").toLowerCase();
  return state === "purchased" || state === "completed";
}

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

export class OpenIapSkinPurchase {
  constructor({
    target = globalThis,
    transport = resolveNativeTransport(target),
    onState = () => {},
    onEntitlement = () => {},
    timeoutMs = PURCHASE_TIMEOUT_MS,
  } = {}) {
    this.target = target;
    this.transport = transport;
    this.onState = onState;
    this.onEntitlement = onEntitlement;
    this.timeoutMs = timeoutMs;
    this.pending = new Map();
    this.nextRequestId = 1;
    this.owned = false;
    this.product = null;
    this.state = {
      phase: transport ? "loading" : "unavailable",
      product: null,
      message: "",
    };
    this.previousReceiver = target.__GIO_JUMP_IAP_RECEIVE;
    this.receive = this.receive.bind(this);
    target.__GIO_JUMP_IAP_RECEIVE = this.receive;
  }

  get supported() {
    return Boolean(this.transport);
  }

  emitState(phase, message = "") {
    this.state = { phase, product: this.product, message };
    this.onState(this.state);
  }

  async initialize() {
    if (!this.supported) {
      this.emitState("unavailable");
      return this.state;
    }

    this.emitState("loading", "Checking your purchases…");
    try {
      await this.request("initConnection");
      let productError = null;
      const [products, purchases] = await Promise.all([
        this.request("fetchProducts", {
          skus: [AURORA_SKIN_PRODUCT_ID],
          type: "in-app",
        }).catch((error) => {
          productError = error;
          return [];
        }),
        this.request("getAvailablePurchases"),
      ]);
      this.product = products?.find?.(
        (product) => product.id === AURORA_SKIN_PRODUCT_ID,
      ) ?? null;

      const ownedPurchase = purchases?.find?.(
        (purchase) =>
          purchase.productId === AURORA_SKIN_PRODUCT_ID &&
          isCompletedPurchase(purchase),
      );
      if (ownedPurchase) {
        await this.acceptPurchase(ownedPurchase);
      } else if (this.product) {
        this.emitState("available");
      } else if (productError) {
        throw productError;
      } else {
        this.emitState("error", "Aurora Skin is not configured in this store.");
      }
    } catch (error) {
      this.emitState("error", error.message || "The store is unavailable.");
    }
    return this.state;
  }

  async purchase() {
    if (!this.supported || this.owned || this.state.phase === "purchasing") return;
    this.emitState("purchasing", "Complete the purchase in the store.");
    try {
      await this.request("requestPurchase", {
        request: {
          google: { skus: [AURORA_SKIN_PRODUCT_ID] },
        },
        type: "in-app",
      });
    } catch (error) {
      this.handlePurchaseError(error);
    }
  }

  async acceptPurchase(purchase) {
    if (
      purchase?.productId !== AURORA_SKIN_PRODUCT_ID ||
      !isCompletedPurchase(purchase)
    ) {
      return false;
    }

    this.owned = true;
    this.onEntitlement({ skin: AURORA_SKIN_ID, purchase });
    this.emitState("owned", "Aurora Skin equipped.");

    try {
      await this.request("finishTransaction", {
        purchase,
        isConsumable: false,
      });
    } catch (error) {
      // The entitlement remains store-owned and will be reconciled again on launch.
      console.warn("Unable to finish Aurora Skin transaction", error);
    }
    return true;
  }

  handlePurchaseError(error) {
    if (isCancellation(error)) {
      this.emitState("available", "Purchase cancelled.");
      return;
    }
    this.emitState("error", error.message || "The purchase did not complete.");
  }

  request(method, params = {}) {
    if (!this.transport) {
      return Promise.reject(errorFromPayload({
        code: "not-prepared",
        message: "No native OpenIAP store is available.",
      }));
    }

    const id = String(this.nextRequestId++);
    const payload = JSON.stringify({ channel: CHANNEL, id, method, params });
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(errorFromPayload({
          code: "service-timeout",
          message: `${method} timed out.`,
        }));
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timeout });

      try {
        this.transport(payload);
      } catch (error) {
        clearTimeout(timeout);
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  receive(rawMessage) {
    let message;
    try {
      message = typeof rawMessage === "string" ? JSON.parse(rawMessage) : rawMessage;
    } catch {
      return;
    }
    if (message?.channel !== CHANNEL) return;

    if (message.event === "purchaseUpdated") {
      void this.acceptPurchase(message.purchase);
      return;
    }
    if (message.event === "purchaseError") {
      this.handlePurchaseError(errorFromPayload(message.error));
      return;
    }

    const pending = this.pending.get(String(message.id));
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.pending.delete(String(message.id));
    if (message.error) pending.reject(errorFromPayload(message.error));
    else pending.resolve(message.result);
  }

  destroy() {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(errorFromPayload({
        code: "service-disconnected",
        message: "The store connection closed.",
      }));
    }
    this.pending.clear();
    if (this.target.__GIO_JUMP_IAP_RECEIVE === this.receive) {
      this.target.__GIO_JUMP_IAP_RECEIVE = this.previousReceiver;
    }
  }
}

export function createSkinPurchase(options) {
  return new OpenIapSkinPurchase(options);
}
