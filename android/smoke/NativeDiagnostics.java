package dev.susfs.studio.smoke;

import android.util.Log;
import android.webkit.JavascriptInterface;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.TimeUnit;

public final class NativeDiagnostics {
    private static final int MAX_BYTES = 4096;
    private final File executable;

    NativeDiagnostics(String libraryDir) {
        executable = new File(libraryDir, "libstudioctl.so");
    }

    @JavascriptInterface public String hello() { return run("hello"); }
    @JavascriptInterface public String status() { return run("status"); }

    private String run(String action) {
        Process process = null;
        try {
            process = new ProcessBuilder(executable.getAbsolutePath(), action)
                .redirectErrorStream(true)
                .start();
            process.getOutputStream().close();
            if (!process.waitFor(2, TimeUnit.SECONDS) || process.exitValue() != 0) return "";

            try (InputStream input = process.getInputStream()) {
                ByteArrayOutputStream output = new ByteArrayOutputStream();
                byte[] buffer = new byte[1024];
                for (int count; (count = input.read(buffer)) != -1;) {
                    if (output.size() + count > MAX_BYTES) return "";
                    output.write(buffer, 0, count);
                }
                String response = StandardCharsets.UTF_8.newDecoder()
                    .decode(ByteBuffer.wrap(output.toByteArray())).toString();
                Log.i("StudioSmoke", "studioctl " + action + " completed");
                return response;
            }
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            return "";
        } catch (IOException error) {
            Log.w("StudioSmoke", "studioctl could not complete");
            return "";
        } finally {
            if (process != null) {
                if (process.isAlive()) process.destroyForcibly();
                try {
                    process.getInputStream().close();
                } catch (IOException ignored) {
                }
            }
        }
    }
}
