/**
 * A human name for the device behind a session — "Chrome على Windows" — so the
 * owner can recognise their own phone in the sessions list and spot one that
 * is not theirs. Deliberately coarse: this is for recognition, not analytics.
 *
 * Isomorphic and pure.
 */

export type DeviceKind = 'mobile' | 'tablet' | 'desktop';

export interface DeviceDescription {
  label: string;
  kind: DeviceKind;
}

const BROWSERS: Array<[RegExp, string]> = [
  [/Edg(?:e|A|iOS)?\//, 'Edge'],
  [/OPR\/|Opera/, 'Opera'],
  [/SamsungBrowser\//, 'متصفح سامسونج'],
  [/CriOS\/|Chrome\//, 'Chrome'],
  [/FxiOS\/|Firefox\//, 'Firefox'],
  [/Version\/[\d.]+.*Safari\//, 'Safari'],
];

const SYSTEMS: Array<[RegExp, string]> = [
  [/iPad/, 'iPad'],
  [/iPhone/, 'iPhone'],
  [/Android/, 'Android'],
  [/Windows NT/, 'Windows'],
  [/Mac OS X|Macintosh/, 'macOS'],
  [/CrOS/, 'Chrome OS'],
  [/Linux/, 'Linux'],
];

export function describeUserAgent(userAgent: string | null | undefined): DeviceDescription {
  if (!userAgent) return { label: 'جهاز غير معروف', kind: 'desktop' };

  const browser = BROWSERS.find(([pattern]) => pattern.test(userAgent))?.[1];
  const system = SYSTEMS.find(([pattern]) => pattern.test(userAgent))?.[1];

  const kind: DeviceKind = /iPad|Tablet/.test(userAgent)
    ? 'tablet'
    : /Mobi|iPhone|Android/.test(userAgent)
      ? 'mobile'
      : 'desktop';

  const label =
    browser && system ? `${browser} على ${system}` : (browser ?? system ?? 'جهاز غير معروف');

  return { label, kind };
}
