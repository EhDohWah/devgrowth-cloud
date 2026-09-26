import { describe, test, expect } from 'vitest';
import { deviceLabel } from '../src/deviceLabel.js';

describe('deviceLabel', () => {
  test.each([
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36', 'Web · Chrome on Windows'],
    ['Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/128.0 Safari/537.36 Edg/128.0', 'Web · Edge on Windows'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15', 'Web · Safari on macOS'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile Safari/604.1', 'Web · Safari on iOS'],
    ['Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0', 'Web · Firefox on Linux'],
    ['curl/8.0', 'Web · Browser']
  ])('%s', (ua, expected) => {
    expect(deviceLabel(ua)).toBe(expected);
  });
});
