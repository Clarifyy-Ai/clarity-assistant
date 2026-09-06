<?php
/**
 * Same-origin Windows installer proxy.
 * Users download from /download/Career-Pilot-Setup.exe — product CTAs never hard-code GitHub.
 *
 * Primary source: Supabase Storage public object (npm run publish:desktop-installer).
 * Optional override: public/download-windows.config.php returning ['upstreams' => string[]].
 * Emergency fallback: GitHub Releases asset (same filename).
 *
 * Fail soft: never fatal/500 empty downloads — return 503 text when no upstream is healthy.
 */
declare(strict_types=1);

try {
  set_time_limit(300);

  $filename = "Career-Pilot-Setup.exe";
  $minBytes = 1_000_000;

  $defaultUpstreams = [
    "https://qzgvjrvtkwlzxpmlddkx.supabase.co/storage/v1/object/public/desktop-releases/Career-Pilot-Setup.exe",
    "https://github.com/Clarifyy-Ai/career-pilot-releases/releases/latest/download/Career-Pilot-Setup.exe",
  ];

  $configPath = __DIR__ . "/download-windows.config.php";
  $upstreams = $defaultUpstreams;
  if (is_readable($configPath)) {
    $cfg = include $configPath;
    if (is_array($cfg) && isset($cfg["upstreams"]) && is_array($cfg["upstreams"])) {
      $custom = array_values(array_filter($cfg["upstreams"], static function ($u) {
        return is_string($u) && $u !== "";
      }));
      if (count($custom) > 0) {
        $upstreams = $custom;
      }
    }
  }

  if (!function_exists("curl_init")) {
    http_response_code(503);
    header("Content-Type: text/plain; charset=utf-8");
    header("Cache-Control: no-store");
    header("X-Desktop-Installer: unavailable");
    echo "Desktop installer proxy requires curl. The Windows desktop app is not available yet.";
    exit;
  }

  $method = strtoupper((string) ($_SERVER["REQUEST_METHOD"] ?? "GET"));
  if ($method === "HEAD") {
    foreach ($upstreams as $url) {
      if (!is_string($url) || $url === "") {
        continue;
      }
      if (!upstream_looks_like_installer($url, $minBytes)) {
        continue;
      }
      $ch = curl_init($url);
      if ($ch === false) {
        continue;
      }
      curl_setopt_array($ch, [
        CURLOPT_NOBODY => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS => 8,
        CURLOPT_FAILONERROR => false,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_USERAGENT => "CareerPilot-Installer-Proxy/1.2",
        CURLOPT_CONNECTTIMEOUT => 15,
        CURLOPT_TIMEOUT => 30,
      ]);
      curl_exec($ch);
      $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
      $length = (int) curl_getinfo($ch, CURLINFO_CONTENT_LENGTH_DOWNLOAD);
      curl_close($ch);
      if ($status >= 200 && $status < 400 && $length >= $minBytes) {
        http_response_code(200);
        header("Content-Type: application/octet-stream");
        header('Content-Disposition: attachment; filename="' . $filename . '"');
        header("Content-Length: " . $length);
        header("Cache-Control: private, max-age=300");
        exit;
      }
    }
    http_response_code(503);
    header("Content-Type: text/plain; charset=utf-8");
    header("Cache-Control: no-store");
    header("X-Desktop-Installer: unavailable");
    echo "Desktop installer not published. The Windows desktop app is not available yet.";
    exit;
  }

  /**
   * HEAD (then Range GET) — only stream when upstream looks like a real installer binary.
   */
  function upstream_looks_like_installer(string $url, int $minBytes): bool
  {
    $ch = curl_init($url);
    if ($ch === false) {
      return false;
    }
    curl_setopt_array($ch, [
      CURLOPT_NOBODY => true,
      CURLOPT_FOLLOWLOCATION => true,
      CURLOPT_MAXREDIRS => 8,
      CURLOPT_FAILONERROR => false,
      CURLOPT_RETURNTRANSFER => true,
      CURLOPT_USERAGENT => "CareerPilot-Installer-Proxy/1.2",
      CURLOPT_CONNECTTIMEOUT => 15,
      CURLOPT_TIMEOUT => 30,
    ]);
    curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $length = (int) curl_getinfo($ch, CURLINFO_CONTENT_LENGTH_DOWNLOAD);
    $type = strtolower((string) curl_getinfo($ch, CURLINFO_CONTENT_TYPE));
    curl_close($ch);

    $okStatus = $status >= 200 && $status < 400;
    $okType = $type === "" || !(
      strpos($type, "text/html") !== false ||
      strpos($type, "text/plain") !== false ||
      strpos($type, "application/json") !== false
    );
    $okLength = $length <= 0 || $length >= $minBytes;

    if ($okStatus && $okType && $okLength && $length >= $minBytes) {
      return true;
    }

    // GitHub / some CDNs omit length on HEAD — confirm with a 1-byte Range GET.
    $ch = curl_init($url);
    if ($ch === false) {
      return false;
    }
    curl_setopt_array($ch, [
      CURLOPT_HTTPGET => true,
      CURLOPT_FOLLOWLOCATION => true,
      CURLOPT_MAXREDIRS => 8,
      CURLOPT_FAILONERROR => false,
      CURLOPT_RETURNTRANSFER => true,
      CURLOPT_USERAGENT => "CareerPilot-Installer-Proxy/1.2",
      CURLOPT_CONNECTTIMEOUT => 15,
      CURLOPT_TIMEOUT => 30,
      CURLOPT_HTTPHEADER => ["Range: bytes=0-0"],
      CURLOPT_HEADER => true,
      CURLOPT_NOBODY => false,
    ]);
    $raw = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $type = strtolower((string) curl_getinfo($ch, CURLINFO_CONTENT_TYPE));
    curl_close($ch);

    if ($status < 200 || $status >= 400) {
      return false;
    }
    if ($type !== "" && (
      strpos($type, "text/html") !== false ||
      strpos($type, "text/plain") !== false ||
      strpos($type, "application/json") !== false
    )) {
      return false;
    }
    if (!is_string($raw)) {
      return false;
    }
    if (preg_match('/^Content-Range:\s*bytes\s+\d+-\d+\/(\d+)/im', $raw, $m)) {
      $total = (int) $m[1];
      return $total >= $minBytes;
    }
    // Redirected asset without Content-Range but 206/200 — allow stream attempt.
    return $status === 206 || $status === 200;
  }

  function stream_installer(string $url, string $filename): bool
  {
    $status = 0;
    $headersSent = false;
    $ch = curl_init($url);
    if ($ch === false) {
      return false;
    }

    curl_setopt_array($ch, [
      CURLOPT_FOLLOWLOCATION => true,
      CURLOPT_MAXREDIRS => 8,
      CURLOPT_FAILONERROR => false,
      CURLOPT_RETURNTRANSFER => false,
      CURLOPT_HEADER => false,
      CURLOPT_BUFFERSIZE => 262144,
      CURLOPT_USERAGENT => "CareerPilot-Installer-Proxy/1.2",
      CURLOPT_CONNECTTIMEOUT => 20,
      CURLOPT_TIMEOUT => 180,
      CURLOPT_WRITEFUNCTION => static function ($ch, string $chunk) use (&$status, &$headersSent, $filename): int {
        if ($status === 0) {
          $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        }
        if ($status < 200 || $status >= 300) {
          return strlen($chunk);
        }
        if (!$headersSent) {
          header("Content-Type: application/octet-stream");
          header('Content-Disposition: attachment; filename="' . $filename . '"');
          header("X-Content-Type-Options: nosniff");
          header("Cache-Control: private, max-age=300");
          header("X-Accel-Buffering: no");
          $headersSent = true;
        }
        echo $chunk;
        return strlen($chunk);
      },
    ]);

    $ok = curl_exec($ch);
    if ($status === 0) {
      $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    }
    curl_close($ch);

    return $ok !== false && $headersSent && $status >= 200 && $status < 300;
  }

  foreach ($upstreams as $url) {
    if (!is_string($url) || $url === "") {
      continue;
    }
    if (!upstream_looks_like_installer($url, $minBytes)) {
      continue;
    }
    if (stream_installer($url, $filename)) {
      exit;
    }
  }

  http_response_code(503);
  header("Content-Type: text/plain; charset=utf-8");
  header("Cache-Control: no-store");
  header("X-Desktop-Installer: unavailable");
  echo "Desktop installer not published. The Windows desktop app is not available yet.";
  exit;
} catch (Throwable $e) {
  http_response_code(503);
  header("Content-Type: text/plain; charset=utf-8");
  header("Cache-Control: no-store");
  header("X-Desktop-Installer: error");
  echo "Desktop installer temporarily unavailable.";
  exit;
}
