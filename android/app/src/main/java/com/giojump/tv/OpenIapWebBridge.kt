package com.giojump.tv

import android.app.Activity
import android.webkit.JavascriptInterface
import android.webkit.WebView
import dev.hyo.openiap.FetchProductsResultAll
import dev.hyo.openiap.FetchProductsResultProducts
import dev.hyo.openiap.FetchProductsResultSubscriptions
import dev.hyo.openiap.OpenIapError
import dev.hyo.openiap.ProductQueryType
import dev.hyo.openiap.ProductRequest
import dev.hyo.openiap.Purchase
import dev.hyo.openiap.RequestPurchaseAndroidProps
import dev.hyo.openiap.RequestPurchaseProps
import dev.hyo.openiap.RequestPurchasePropsByPlatforms
import dev.hyo.openiap.listener.OpenIapPurchaseErrorListener
import dev.hyo.openiap.listener.OpenIapPurchaseUpdateListener
import dev.hyo.openiap.store.OpenIapStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import org.json.JSONObject

/**
 * Restricts the WebView to Gio Jump's single non-consumable product while
 * exposing the OpenIAP purchase lifecycle to the shared web game.
 */
class OpenIapWebBridge(
    activity: Activity,
    private val webView: WebView,
) {
    private val store = OpenIapStore(activity)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val knownPurchases = mutableMapOf<String, Purchase>()
    private var destroyed = false

    private val purchaseUpdateListener = OpenIapPurchaseUpdateListener { purchase ->
        cachePurchase(purchase)
        emitEvent("purchaseUpdated", "purchase", purchase.toJson())
    }

    private val purchaseErrorListener = OpenIapPurchaseErrorListener { error ->
        emitEvent("purchaseError", "error", error.toJSON())
    }

    init {
        store.setActivity(activity)
        store.addPurchaseUpdateListener(purchaseUpdateListener)
        store.addPurchaseErrorListener(purchaseErrorListener)
    }

    fun setActivity(activity: Activity?) {
        store.setActivity(activity)
    }

    @JavascriptInterface
    fun postMessage(rawMessage: String) {
        if (destroyed) return
        val request = runCatching { JSONObject(rawMessage) }.getOrNull() ?: return
        if (request.optString("channel") != CHANNEL) return
        val id = request.optString("id")
        val method = request.optString("method")
        scope.launch {
            runCatching { handle(method) }
                .onSuccess { result -> respond(id, result) }
                .onFailure { error -> respondError(id, error) }
        }
    }

    private suspend fun handle(method: String): Any? = when (method) {
        "initConnection" -> store.initConnection()
        "fetchProducts" -> fetchProducts()
        "getAvailablePurchases" -> getAvailablePurchases()
        "requestPurchase" -> requestPurchase()
        "finishTransaction" -> finishTransaction()
        "endConnection" -> store.endConnection()
        else -> throw IllegalArgumentException("Unsupported OpenIAP method: $method")
    }

    private suspend fun fetchProducts(): List<Map<String, Any?>> {
        val result = store.fetchProducts(
            ProductRequest(
                skus = listOf(PRODUCT_ID),
                type = ProductQueryType.InApp,
            ),
        )
        return when (result) {
            is FetchProductsResultProducts -> result.value.orEmpty().map { it.toJson() }
            is FetchProductsResultSubscriptions -> result.value.orEmpty().map { it.toJson() }
            is FetchProductsResultAll -> result.value.orEmpty().map { it.toJson() }
        }
    }

    private suspend fun getAvailablePurchases(): List<Map<String, Any?>> {
        val purchases = store.getAvailablePurchases(null)
        purchases.forEach(::cachePurchase)
        return purchases.map { it.toJson() }
    }

    private suspend fun requestPurchase(): Map<String, Any> {
        store.requestPurchase(
            RequestPurchaseProps(
                request = RequestPurchaseProps.Request.Purchase(
                    RequestPurchasePropsByPlatforms(
                        google = RequestPurchaseAndroidProps(
                            skus = listOf(PRODUCT_ID),
                        ),
                    ),
                ),
                type = ProductQueryType.InApp,
            ),
        )
        return mapOf("dispatched" to true)
    }

    private suspend fun finishTransaction(): Boolean {
        val purchase = knownPurchases.values.firstOrNull { it.productId == PRODUCT_ID }
            ?: store.getAvailablePurchases(null).firstOrNull { it.productId == PRODUCT_ID }
            ?: throw OpenIapError.ItemNotOwned()
        cachePurchase(purchase)
        store.finishTransaction(purchase, false)
        return true
    }

    private fun cachePurchase(purchase: Purchase) {
        if (purchase.productId != PRODUCT_ID) return
        val key = purchase.purchaseToken ?: purchase.id
        knownPurchases[key] = purchase
    }

    private fun respond(id: String, result: Any?) {
        val payload = JSONObject()
            .put("channel", CHANNEL)
            .put("id", id)
            .put("result", JSONObject.wrap(result))
        send(payload)
    }

    private fun respondError(id: String, error: Throwable) {
        val details = if (error is OpenIapError) {
            error.toJSON()
        } else {
            mapOf(
                "code" to "unknown",
                "message" to (error.message ?: "The store request failed."),
                "platform" to "android",
            )
        }
        val payload = JSONObject()
            .put("channel", CHANNEL)
            .put("id", id)
            .put("error", JSONObject(details))
        send(payload)
    }

    private fun emitEvent(event: String, field: String, value: Any?) {
        val payload = JSONObject()
            .put("channel", CHANNEL)
            .put("event", event)
            .put(field, JSONObject.wrap(value))
        send(payload)
    }

    private fun send(payload: JSONObject) {
        val quotedPayload = JSONObject.quote(payload.toString())
        webView.post {
            if (!destroyed) {
                webView.evaluateJavascript(
                    "window.__GIO_JUMP_IAP_RECEIVE&&window.__GIO_JUMP_IAP_RECEIVE($quotedPayload);true;",
                    null,
                )
            }
        }
    }

    fun destroy() {
        if (destroyed) return
        destroyed = true
        store.removePurchaseUpdateListener(purchaseUpdateListener)
        store.removePurchaseErrorListener(purchaseErrorListener)
        scope.launch {
            try {
                runCatching { store.endConnection() }
            } finally {
                store.clear()
                scope.cancel()
            }
        }
    }

    private companion object {
        const val CHANNEL = "giojump:iap"
        const val PRODUCT_ID = "com.giolaq.giojump.skin.aurora"
    }
}
