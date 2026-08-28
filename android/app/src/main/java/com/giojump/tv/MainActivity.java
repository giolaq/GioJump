package com.giojump.tv;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.pm.ApplicationInfo;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.util.SparseArray;
import android.view.KeyEvent;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

public class MainActivity extends Activity {
    private static final String APP_HOST = "appassets.androidplatform.net";
    private static final String APP_URL = "https://" + APP_HOST + "/index.html";
    private static final SparseArray<String> BROWSER_KEYS = createBrowserKeys();
    private static final SparseArray<Boolean> BACK_KEYS = createBackKeys();
    private static final Map<String, String> MIME_TYPES = createMimeTypes();

    private WebView webView;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().addFlags(
                WindowManager.LayoutParams.FLAG_FULLSCREEN
                        | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                        | WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED
        );
        enterImmersiveMode();

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(128, 215, 235));
        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        webView.setFocusable(true);
        webView.setFocusableInTouchMode(true);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setUserAgentString(settings.getUserAgentString() + " GioJumpFireTV/1.0");

        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            WebView.setWebContentsDebuggingEnabled(true);
        }

        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new LocalAssetClient());
        setContentView(webView);
        webView.loadUrl(APP_URL);
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        int keyCode = event.getKeyCode();
        if (BACK_KEYS.get(keyCode, false)) {
            if (event.getAction() == KeyEvent.ACTION_DOWN && event.getRepeatCount() == 0) {
                handleBackFromRemote();
            }
            return true;
        }

        String browserKey = BROWSER_KEYS.get(keyCode);
        if (browserKey == null || webView == null) {
            return super.dispatchKeyEvent(event);
        }

        if (isBrowserKeyAction(event)) {
            dispatchBrowserKey(browserKey, event);
            return true;
        }
        return super.dispatchKeyEvent(event);
    }

    @Override
    protected void onPause() {
        if (webView != null) {
            webView.evaluateJavascript(
                    "if(window.__GIO_JUMP__&&window.__GIO_JUMP__.pause){window.__GIO_JUMP__.pause();}",
                    null
            );
            webView.onPause();
        }
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) {
            webView.onResume();
            webView.requestFocus();
        }
        enterImmersiveMode();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            enterImmersiveMode();
            if (webView != null) {
                webView.requestFocus();
            }
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.loadUrl("about:blank");
            webView.stopLoading();
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    private void enterImmersiveMode() {
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
        );
    }

    private boolean isBrowserKeyAction(KeyEvent event) {
        int action = event.getAction();
        return action == KeyEvent.ACTION_DOWN || action == KeyEvent.ACTION_UP;
    }

    private static SparseArray<String> createBrowserKeys() {
        SparseArray<String> keys = new SparseArray<>();
        keys.put(KeyEvent.KEYCODE_DPAD_LEFT, "ArrowLeft");
        keys.put(KeyEvent.KEYCODE_DPAD_RIGHT, "ArrowRight");
        keys.put(KeyEvent.KEYCODE_DPAD_UP, "ArrowUp");
        keys.put(KeyEvent.KEYCODE_DPAD_DOWN, "ArrowDown");
        putAll(keys, "Enter",
                KeyEvent.KEYCODE_DPAD_CENTER,
                KeyEvent.KEYCODE_ENTER,
                KeyEvent.KEYCODE_NUMPAD_ENTER,
                KeyEvent.KEYCODE_BUTTON_A,
                KeyEvent.KEYCODE_BUTTON_SELECT);
        putAll(keys, "MediaPlayPause",
                KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE,
                KeyEvent.KEYCODE_MENU,
                KeyEvent.KEYCODE_BUTTON_START);
        return keys;
    }

    private static SparseArray<Boolean> createBackKeys() {
        SparseArray<Boolean> keys = new SparseArray<>();
        keys.put(KeyEvent.KEYCODE_BACK, true);
        keys.put(KeyEvent.KEYCODE_BUTTON_B, true);
        keys.put(KeyEvent.KEYCODE_ESCAPE, true);
        return keys;
    }

    private static void putAll(SparseArray<String> target, String value, int... keys) {
        for (int key : keys) {
            target.put(key, value);
        }
    }

    private static Map<String, String> createMimeTypes() {
        Map<String, String> types = new HashMap<>();
        types.put("html", "text/html");
        types.put("js", "text/javascript");
        types.put("css", "text/css");
        types.put("json", "application/json");
        types.put("svg", "image/svg+xml");
        types.put("png", "image/png");
        types.put("jpg", "image/jpeg");
        types.put("jpeg", "image/jpeg");
        types.put("webp", "image/webp");
        types.put("woff2", "font/woff2");
        types.put("wasm", "application/wasm");
        return types;
    }

    private void dispatchBrowserKey(String key, KeyEvent event) {
        String type = event.getAction() == KeyEvent.ACTION_DOWN ? "keydown" : "keyup";
        String script = "(function(){"
                + "var e=new KeyboardEvent('" + type + "',{key:'" + key + "',code:'" + key
                + "',bubbles:true,cancelable:true,repeat:" + (event.getRepeatCount() > 0) + "});"
                + "window.dispatchEvent(e);"
                + "})();";
        webView.evaluateJavascript(script, null);
    }

    private void handleBackFromRemote() {
        if (webView == null) {
            finish();
            return;
        }
        String script = "(function(){"
                + "var game=window.__GIO_JUMP__;"
                + "return !!(game&&game.nativeBack&&game.nativeBack());"
                + "})();";
        webView.evaluateJavascript(script, result -> {
            if (!"true".equals(result)) {
                finish();
            }
        });
    }

    private final class LocalAssetClient extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(
                WebView view,
                WebResourceRequest request
        ) {
            Uri uri = request.getUrl();
            if (!APP_HOST.equals(uri.getHost())) {
                return null;
            }

            String path = uri.getPath();
            if (path == null || "/".equals(path)) {
                path = "/index.html";
            }
            String assetPath = "www" + path;
            try {
                InputStream input = getAssets().open(assetPath);
                return new WebResourceResponse(mimeTypeFor(assetPath), "UTF-8", input);
            } catch (IOException error) {
                return null;
            }
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            super.onPageFinished(view, url);
            view.requestFocus();
            enterImmersiveMode();
        }
    }

    private String mimeTypeFor(String path) {
        int separator = path.lastIndexOf('.');
        String extension = separator < 0 ? "" : path.substring(separator + 1);
        return MIME_TYPES.getOrDefault(extension, "application/octet-stream");
    }
}
