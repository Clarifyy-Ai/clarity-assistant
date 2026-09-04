<?php
/**
 * Optional override for download-windows.php upstreams.
 * Copy to download-windows.config.php on the host (do not commit secrets).
 *
 * return [
 *   'upstreams' => [
 *     'https://YOUR_PROJECT.supabase.co/storage/v1/object/public/desktop-releases/Career-Pilot-Setup.exe',
 *     'https://github.com/Clarifyy-Ai/career-pilot-releases/releases/latest/download/Career-Pilot-Setup.exe',
 *   ],
 * ];
 */
return [
  "upstreams" => [
    "https://qzgvjrvtkwlzxpmlddkx.supabase.co/storage/v1/object/public/desktop-releases/Career-Pilot-Setup.exe",
    "https://github.com/Clarifyy-Ai/career-pilot-releases/releases/latest/download/Career-Pilot-Setup.exe",
  ],
];
