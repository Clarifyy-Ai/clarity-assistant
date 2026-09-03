<?php
/**
 * Same-origin Windows installer proxy.
 * Users download from /download/Career-Pilot-Setup.exe — GitHub is never shown.
 */
declare(strict_types=1);

set_time_limit(300);

$filename = "Career-Pilot-Setup.exe";
$upstreams = [
  "https://qzgvjrvtkwlzxpmlddkx.supabase.co/storage/v1/object/public/desktop-releases/Career-Pilot-Setup.exe",
  "https://github.com/Clarifyy-Ai/career-pilot-releases/releases/latest/download/Career-Pilot-Setup.exe",
];

function stream_installer(string $url, string $filename): bool
{
  if (!function_exists("curl_init")) {
    return false;
  }

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
    CURLOPT_USERAGENT => "CareerPilot-Installer-Proxy/1.0",
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
  if (stream_installer($url, $filename)) {
    exit;
  }
}

http_response_code(502);
header("Content-Type: text/plain; charset=utf-8");
header("Cache-Control: no-store");
echo "The Windows installer is temporarily unavailable. Please try again in a few minutes.";
