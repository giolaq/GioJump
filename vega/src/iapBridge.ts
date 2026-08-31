import {
  endConnection,
  fetchProducts,
  finishTransaction,
  getAvailablePurchases,
  initConnection,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestPurchase,
  type EventSubscription,
  type Purchase,
} from 'react-native-iap';

const CHANNEL = 'giojump:iap';
const PRODUCT_ID = 'com.giolaq.giojump.skin.aurora';

type BridgeRequest = {
  channel: string;
  id: string;
  method: string;
  params?: {purchase?: Purchase};
};

type BridgeResponse = Record<string, unknown>;

function errorPayload(error: unknown) {
  const candidate = error as {code?: unknown; message?: unknown};
  return {
    code: String(candidate?.code ?? 'unknown'),
    message: String(candidate?.message ?? 'The store request failed.'),
    platform: 'vega',
  };
}

export class VegaOpenIapBridge {
  private readonly purchases = new Map<string, Purchase>();
  private readonly updatedSubscription: EventSubscription;
  private readonly errorSubscription: EventSubscription;

  constructor(private readonly send: (payload: BridgeResponse) => void) {
    this.updatedSubscription = purchaseUpdatedListener((purchase) => {
      this.remember(purchase);
      this.send({channel: CHANNEL, event: 'purchaseUpdated', purchase});
    });
    this.errorSubscription = purchaseErrorListener((error) => {
      this.send({
        channel: CHANNEL,
        event: 'purchaseError',
        error: errorPayload(error),
      });
    });
  }

  handle(rawMessage: string): boolean {
    let request: BridgeRequest;
    try {
      request = JSON.parse(rawMessage) as BridgeRequest;
    } catch {
      return false;
    }
    if (request.channel !== CHANNEL) return false;
    void this.dispatch(request);
    return true;
  }

  private async dispatch(request: BridgeRequest) {
    try {
      const result = await this.invoke(request);
      this.send({channel: CHANNEL, id: request.id, result});
    } catch (error) {
      this.send({
        channel: CHANNEL,
        id: request.id,
        error: errorPayload(error),
      });
    }
  }

  private async invoke(request: BridgeRequest): Promise<unknown> {
    switch (request.method) {
      case 'initConnection':
        return initConnection();
      case 'fetchProducts':
        return fetchProducts({skus: [PRODUCT_ID], type: 'in-app'});
      case 'getAvailablePurchases': {
        const purchases = await getAvailablePurchases();
        purchases.forEach((purchase) => this.remember(purchase));
        return purchases;
      }
      case 'requestPurchase':
        await requestPurchase({
          request: {google: {skus: [PRODUCT_ID]}},
          type: 'in-app',
        });
        return {dispatched: true};
      case 'finishTransaction':
        return this.finish(request.params?.purchase);
      case 'endConnection':
        return endConnection();
      default:
        throw new Error(`Unsupported OpenIAP method: ${request.method}`);
    }
  }

  private async finish(requestPurchase?: Purchase) {
    const token = requestPurchase?.purchaseToken ?? requestPurchase?.id;
    let purchase = token ? this.purchases.get(token) : undefined;
    if (!purchase) {
      const purchases = await getAvailablePurchases();
      purchases.forEach((item) => this.remember(item));
      purchase = purchases.find((item) => item.productId === PRODUCT_ID);
    }
    if (!purchase || purchase.productId !== PRODUCT_ID) {
      const error = new Error('Aurora Skin is not owned.') as Error & {code: string};
      error.code = 'item-not-owned';
      throw error;
    }
    await finishTransaction({purchase, isConsumable: false});
    return true;
  }

  private remember(purchase: Purchase) {
    if (purchase.productId !== PRODUCT_ID) return;
    this.purchases.set(purchase.purchaseToken ?? purchase.id, purchase);
  }

  dispose() {
    this.updatedSubscription.remove();
    this.errorSubscription.remove();
    void endConnection().catch(() => {});
  }
}
