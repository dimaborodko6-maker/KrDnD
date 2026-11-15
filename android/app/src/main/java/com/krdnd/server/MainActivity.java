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

public class MainActivity extends AppCompatActivity {
    private WebView webView;
    private View headerBar;
    private View btnShowHeader;
    private TextView tvServerIp;
    private String serverUrl = "http://127.0.0.1:3000/";
    private String friendIpUrl = "";

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
            if (!friendIpUrl.isEmpty()) {
                ClipboardManager clipboard = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                ClipData clip = ClipData.newPlainText("KrDnD URL", friendIpUrl);
                clipboard.setPrimaryClip(clip);
                Toast.makeText(this, "Адрес скопирован в буфер!", Toast.LENGTH_SHORT).show();
            }
        });

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
        String ip = NetworkUtils.getPrimaryIpAddress();
        friendIpUrl = "http://" + ip + ":3000/";
        tvServerIp.setText("Игроки: " + friendIpUrl);
        webView.loadUrl(serverUrl);
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
