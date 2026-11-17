package com.krdnd.server;

import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.TextView;
import android.widget.Toast;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;

public class MainActivity extends AppCompatActivity {
    private WebView webView;
    private View headerBar;
    private View btnShowHeader;
    private TextView tvServerIp;
    private Button btnToggleOnline;
    private String serverUrl = "http://127.0.0.1:3000/";
    private String friendInvite = "";
    private boolean isOnlineActive = false;

    private final BroadcastReceiver serverReadyReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            runOnUiThread(() -> onServerReady());
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        setContentView(R.layout.activity_main);

        headerBar = findViewById(R.id.headerBar);
        btnShowHeader = findViewById(R.id.btnShowHeader);
        tvServerIp = findViewById(R.id.tvServerIp);
        btnToggleOnline = findViewById(R.id.btnToggleOnline);
        webView = findViewById(R.id.webView);

        setupWebView();
        setupButtons();
        checkPermissionsAndStartService();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(serverReadyReceiver,
                    new IntentFilter(NodeServerService.ACTION_SERVER_READY),
                    Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(serverReadyReceiver,
                    new IntentFilter(NodeServerService.ACTION_SERVER_READY));
        }

        if (NodeServerService.isServerRunning()) {
            onServerReady();
        }
    }

    private void checkPermissionsAndStartService() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(this,
                        new String[]{Manifest.permission.POST_NOTIFICATIONS}, 101);
            }
        }

        Intent serviceIntent = new Intent(this, NodeServerService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(serviceIntent);
        } else {
            startService(serviceIntent);
        }
    }

    private void setupWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setSupportZoom(true);
        settings.setBuiltInZoomControls(true);
        settings.setDisplayZoomControls(false);

        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient());
    }

    private void setupButtons() {
        Button btnCopy = findViewById(R.id.btnCopyIp);
        btnCopy.setOnClickListener(v -> {
            if (!friendInvite.isEmpty()) {
                ClipboardManager clipboard = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                ClipData clip = ClipData.newPlainText("KrDnD Invite", friendInvite);
                clipboard.setPrimaryClip(clip);
                Toast.makeText(this, "Ссылка для игроков скопирована!", Toast.LENGTH_SHORT).show();
            }
        });

        btnToggleOnline.setOnClickListener(v -> toggleOnlineMode());

        Button btnReload = findViewById(R.id.btnReload);
        btnReload.setOnClickListener(v -> webView.reload());

        Button btnHide = findViewById(R.id.btnHideHeader);
        btnHide.setOnClickListener(v -> {
            headerBar.setVisibility(View.GONE);
            btnShowHeader.setVisibility(View.VISIBLE);
        });

        btnShowHeader.setOnClickListener(v -> {
            headerBar.setVisibility(View.VISIBLE);
            btnShowHeader.setVisibility(View.GONE);
        });
    }

    private void onServerReady() {
        fetchNetworkStatus();
    }

    private void fetchNetworkStatus() {
        new Thread(() -> {
            try {
                URL url = new URL("http://127.0.0.1:3000/api/network-status");
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setConnectTimeout(1000);
                conn.setReadTimeout(1000);
                if (conn.getResponseCode() == 200) {
                    BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream()));
                    StringBuilder sb = new StringBuilder();
                    String line;
                    while ((line = reader.readLine()) != null) sb.append(line);
                    reader.close();

                    JSONObject json = new JSONObject(sb.toString());
                    runOnUiThread(() -> updateNetworkUI(json));
                }
                conn.disconnect();
            } catch (Exception ignored) {
            }
        }).start();
    }

    private void updateNetworkUI(JSONObject json) {
        try {
            isOnlineActive = json.optBoolean("onlineActive", false);
            String onlineUrl = json.optString("onlineUrl", "");
            String roomPin = json.optString("roomPin", "");
            String masterUrl = json.optString("masterUrl", "http://127.0.0.1:3000/");
            String ip = NetworkUtils.getPrimaryIpAddress();

            if (isOnlineActive && !onlineUrl.isEmpty()) {
                btnToggleOnline.setText("🛑 Офлайн");
                friendInvite = onlineUrl + "/player.html" + (roomPin.isEmpty() ? "" : "?pin=" + roomPin);
                tvServerIp.setText("🌐 " + onlineUrl + (roomPin.isEmpty() ? "" : " [PIN: " + roomPin + "]"));
            } else {
                btnToggleOnline.setText("🌐 Онлайн");
                friendInvite = "http://" + ip + ":3000/player.html" + (roomPin.isEmpty() ? "" : "?pin=" + roomPin);
                tvServerIp.setText("🏠 " + ip + ":3000" + (roomPin.isEmpty() ? "" : " [PIN: " + roomPin + "]"));
            }

            if (webView.getUrl() == null || webView.getUrl().equals("about:blank")) {
                serverUrl = masterUrl;
                webView.loadUrl(serverUrl);
            }
        } catch (Exception ignored) {
        }
    }

    private void toggleOnlineMode() {
        btnToggleOnline.setEnabled(false);
        btnToggleOnline.setText("⏳ ...");
        new Thread(() -> {
            try {
                URL url = new URL("http://127.0.0.1:3000/api/tunnel/toggle");
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("POST");
                conn.setConnectTimeout(10000);
                conn.setReadTimeout(10000);
                conn.getResponseCode();
                conn.disconnect();
            } catch (Exception ignored) {
            }
            try { Thread.sleep(1500); } catch (InterruptedException ignored) {}
            runOnUiThread(() -> {
                btnToggleOnline.setEnabled(true);
                fetchNetworkStatus();
            });
        }).start();
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        try {
            unregisterReceiver(serverReadyReceiver);
        } catch (Exception ignored) {}
        super.onDestroy();
    }
}
