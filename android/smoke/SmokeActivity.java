package dev.susfs.studio.smoke;

import android.app.Activity;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import java.util.Scanner;
import org.json.JSONException;
import org.json.JSONObject;

public final class SmokeActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String HOME = "https://" + HOST + "/index.html#/";
    private static final String OTHER_ORIGIN = "https://studio-navigation.invalid/index.html";
    private static final String UNKNOWN_PATH = "https://" + HOST + "/missing.html";
    private WebView web;

    @Override
    public void onCreate(Bundle state) {
        super.onCreate(state);
        web = new WebView(this);
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        web.getSettings().setAllowFileAccess(false);
        web.getSettings().setAllowContentAccess(false);
        web.getSettings().setBlockNetworkLoads(false);
        String scenario = getIntent().getStringExtra("scenario");
        web.setOnApplyWindowInsetsListener((view, insets) -> {
            view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets;
        });
        web.setWebViewClient(new WebViewClient() {
            private boolean navigationStarted;

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, android.webkit.WebResourceError error) {
                android.util.Log.w("StudioSmoke", "WebView load error " + error.getErrorCode());
            }
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if ("navigation".equals(scenario) && request.isForMainFrame() && HOME.equals(view.getUrl())) {
                    String destination = request.getUrl().toString();
                    if (OTHER_ORIGIN.equals(destination)) {
                        view.post(() -> view.evaluateJavascript("location.href = '" + UNKNOWN_PATH + "'", null));
                    } else if (UNKNOWN_PATH.equals(destination)) {
                        view.post(() -> view.evaluateJavascript(
                            "if (location.href === " + JSONObject.quote(HOME)
                                + ") document.body.append('Navigation checks passed')", null));
                    }
                }
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if ("navigation".equals(scenario) && HOME.equals(url) && !navigationStarted) {
                    navigationStarted = true;
                    view.evaluateJavascript("location.href = '" + OTHER_ORIGIN + "'", null);
                }
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String path = uri.getEncodedPath();
                boolean index = "/index.html".equals(path) && request.isForMainFrame();
                if ("GET".equals(request.getMethod()) && "https".equals(uri.getScheme())
                        && HOST.equals(uri.getEncodedAuthority()) && path != null
                        && (index || (!request.isForMainFrame() && path.matches("/assets/[A-Za-z0-9_-]+\\.(js|css)")))) {
                    String mime = index ? "text/html" : path.endsWith(".js") ? "text/javascript" : "text/css";
                    try {
                        Map<String, String> headers = new HashMap<>();
                        headers.put("Content-Security-Policy", "frame-src 'none'; frame-ancestors 'none'");
                        headers.put("X-Content-Type-Options", "nosniff");
                        return new WebResourceResponse(mime, "UTF-8", 200, "OK", headers,
                            getAssets().open("webroot" + path));
                    } catch (IOException ignored) {
                        android.util.Log.w("StudioSmoke", "Bundled asset unavailable");
                    }
                }
                return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", Collections.emptyMap(),
                    new ByteArrayInputStream(new byte[0]));
            }
        });
        if ("unavailable".equals(scenario)) {
            web.addJavascriptInterface(new Object(), "ksu");
        } else if (!"demo".equals(scenario)) {
            try (InputStream stream = getAssets().open("diagnostic-v1.json");
                    Scanner scanner = new Scanner(stream, "UTF-8").useDelimiter("\\A")) {
                JSONObject fixtures = new JSONObject(scanner.hasNext() ? scanner.next() : "");
                JSONObject hello = fixtures.getJSONObject("hello");
                if ("mismatch".equals(scenario)) hello.put("protocol", 2);
                String status = fixtures.getJSONObject("failed".equals(scenario) ? "failed" : "active").toString();
                web.addJavascriptInterface(new Fixtures(hello.toString(), status), "studioDiagnostics");
            } catch (IOException | JSONException error) {
                throw new IllegalStateException("Missing diagnostic fixtures", error);
            }
        }
        setContentView(web);
        web.loadUrl(HOME);
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        setContentView(new android.widget.FrameLayout(this));
        web.destroy();
        super.onDestroy();
    }

    public static final class Fixtures {
        private final String hello;
        private final String status;

        Fixtures(String hello, String status) {
            this.hello = hello;
            this.status = status;
        }

        @JavascriptInterface public String hello() { return hello; }
        @JavascriptInterface public String status() { return status; }
    }
}
