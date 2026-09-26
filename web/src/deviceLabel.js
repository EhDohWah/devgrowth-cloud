/** Short human label for this browser, shown in the device list: "Web · Chrome on Windows". */
export function deviceLabel(userAgent = globalThis.navigator?.userAgent ?? '') {
  const browser =
    /Edg\//.test(userAgent) ? 'Edge'
      : /Firefox\//.test(userAgent) ? 'Firefox'
        : /Chrome\//.test(userAgent) ? 'Chrome'
          : /Safari\//.test(userAgent) ? 'Safari'
            : 'Browser';
  const os =
    /Windows/.test(userAgent) ? 'Windows'
      : /iPhone|iPad/.test(userAgent) ? 'iOS'
        : /Mac OS X/.test(userAgent) ? 'macOS'
          : /Android/.test(userAgent) ? 'Android'
            : /Linux/.test(userAgent) ? 'Linux'
              : null;
  return os ? `Web · ${browser} on ${os}` : `Web · ${browser}`;
}
