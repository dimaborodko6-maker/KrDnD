package com.krdnd.server;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.util.Log;
import androidx.core.app.NotificationCompat;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

public class NodeServerService extends Service {
    private static final String TAG = "NodeServerService";
    public static final String CHANNEL_ID = "krdnd_server_channel";
    public static final int NOTIFICATION_ID = 4040;
    public static final String ACTION_SERVER_READY = "com.krdnd.server.ACTION_SERVER_READY";

    private static boolean isRunning = false;
    private PowerManager.WakeLock wakeLock;
    private Thread nodeThread;

    static {
        try {
            System.loadLibrary("node");
            System.loadLibrary("native-lib");
        } catch (UnsatisfiedLinkError e) {
            Log.e(TAG, "Failed to load native node libraries", e);
        }
    }

    public native int startNodeWithArguments(String[] arguments, String workingDir);

    public static boolean isServerRunning() {
        return isRunning;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        startForegroundServiceWithNotification("Запуск игрового сервера KrDnD...");

        PowerManager powerManager = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (powerManager != null) {
            wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "KrDnD::ServerWakeLock");
            wakeLock.acquire(12 * 60 * 60 * 1000L); // 12 hours max
        }

        startServerThread();
    }

    private void startServerThread() {
        if (isRunning) return;

        nodeThread = new Thread(() -> {
            try {
                File nodeDir = new File(getFilesDir(), "nodejs-project");
                prepareProjectFiles(nodeDir);

                isRunning = true;
                startHealthCheck();

                File serverScript = new File(nodeDir, "server.js");
                String[] args = new String[]{"node", serverScript.getAbsolutePath()};
                startNodeWithArguments(args, nodeDir.getAbsolutePath());
            } catch (Exception e) {
                Log.e(TAG, "Server thread error", e);
            } finally {
                isRunning = false;
            }
        });
        nodeThread.setName("NodeJSServerThread");
        nodeThread.start();
    }

    private void prepareProjectFiles(File targetDir) {
        if (!targetDir.exists()) {
            targetDir.mkdirs();
        }

        try (InputStream is = getAssets().open("nodejs-project.zip");
             ZipInputStream zis = new ZipInputStream(is)) {
            ZipEntry entry;
            byte[] buffer = new byte[8192];
            while ((entry = zis.getNextEntry()) != null) {
                File outFile = new File(targetDir, entry.getName());
                if (entry.isDirectory()) {
                    outFile.mkdirs();
                } else {
                    // Do NOT overwrite existing user save games or custom catalogs
                    if (outFile.exists() && (entry.getName().equals("gamestate_save.json")
                            || entry.getName().equals("gamecatalog.json")
                            || entry.getName().equals("scenes.json"))) {
                        zis.closeEntry();
                        continue;
                    }
                    File parent = outFile.getParentFile();
                    if (parent != null && !parent.exists()) parent.mkdirs();
                    try (FileOutputStream fos = new FileOutputStream(outFile)) {
                        int count;
                        while ((count = zis.read(buffer)) != -1) {
                            fos.write(buffer, 0, count);
                        }
                    }
                }
                zis.closeEntry();
            }
        } catch (Exception e) {
            Log.w(TAG, "Archive unpack skipped or not found: " + e.getMessage());
        }
    }

    private void startHealthCheck() {
        new Thread(() -> {
            int attempts = 0;
            while (isRunning && attempts < 30) {
                try {
                    URL url = new URL("http://127.0.0.1:3000/");
                    HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                    conn.setConnectTimeout(600);
                    conn.setReadTimeout(600);
                    int code = conn.getResponseCode();
                    conn.disconnect();
                    if (code == 200) {
                        String ip = NetworkUtils.getPrimaryIpAddress();
                        updateNotification("Сервер активен! Подключение: http://" + ip + ":3000");
                        sendBroadcast(new Intent(ACTION_SERVER_READY));
                        return;
                    }
                } catch (Exception ignored) {
                }
                attempts++;
                try { Thread.sleep(500); } catch (InterruptedException ignored) {}
            }
        }).start();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "KrDnD Игровой Сервер",
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Фоновая служба игрового сервера KrDnD");
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(channel);
        }
    }

    private void startForegroundServiceWithNotification(String statusText) {
        Notification notification = buildNotification(statusText);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    private void updateNotification(String statusText) {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) {
            nm.notify(NOTIFICATION_ID, buildNotification(statusText));
        }
    }

    private Notification buildNotification(String text) {
        Intent intent = new Intent(this, MainActivity.class);
        PendingIntent pi = PendingIntent.getActivity(this, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("KrDnD Сервер")
                .setContentText(text)
                .setSmallIcon(android.R.drawable.ic_media_play)
                .setContentIntent(pi)
                .setOngoing(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .build();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        isRunning = false;
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }
        super.onDestroy();
    }
}
