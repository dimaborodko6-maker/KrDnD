package com.krdnd.server;

import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class NetworkUtils {

    public static List<String> getLocalIpAddresses() {
        List<String> addresses = new ArrayList<>();
        try {
            List<NetworkInterface> interfaces = Collections.list(NetworkInterface.getNetworkInterfaces());
            for (NetworkInterface intf : interfaces) {
                if (intf.isLoopback() || !intf.isUp()) {
                    continue;
                }
                List<InetAddress> inets = Collections.list(intf.getInetAddresses());
                for (InetAddress inet : inets) {
                    if (inet instanceof Inet4Address && !inet.isLoopbackAddress()) {
                        String ip = inet.getHostAddress();
                        if (ip != null && !ip.isEmpty()) {
                            // Put hotspot default IP or Wi-Fi first if matched
                            if (ip.startsWith("192.168.43.") || intf.getName().startsWith("wlan") || intf.getName().startsWith("ap")) {
                                addresses.add(0, ip);
                            } else {
                                addresses.add(ip);
                            }
                        }
                    }
                }
            }
        } catch (Exception ignored) {
        }
        return addresses;
    }

    public static String getPrimaryIpAddress() {
        List<String> list = getLocalIpAddresses();
        return list.isEmpty() ? "127.0.0.1" : list.get(0);
    }
}
