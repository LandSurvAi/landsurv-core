/**
 * Platform Detection Utilities
 * Identifies OS, browser, and device type for platform-specific PWA features.
 */

export enum Platform {
  ANDROID = 'android',
  IOS = 'ios',
  WINDOWS = 'windows',
  MACOS = 'macos',
  LINUX = 'linux',
  UNKNOWN = 'unknown',
}

export enum Browser {
  CHROME = 'chrome',
  SAFARI = 'safari',
  FIREFOX = 'firefox',
  EDGE = 'edge',
  SAMSUNG = 'samsung',
  UNKNOWN = 'unknown',
}

export enum DisplayMode {
  STANDALONE = 'standalone',
  FULLSCREEN = 'fullscreen',
  MINIMAL_UI = 'minimal-ui',
  BROWSER = 'browser',
  UNKNOWN = 'unknown',
}

export interface PlatformInfo {
  platform: Platform;
  browser: Browser;
  displayMode: DisplayMode;
  isInstalled: boolean;
  isMobile: boolean;
  isTablet: boolean;
  supportsWebInstallPrompt: boolean;
}

/**
 * Detect current platform from user agent and navigator properties.
 */
export const detectPlatform = (): Platform => {
  const ua = navigator.userAgent.toLowerCase();

  if (/android/.test(ua)) return Platform.ANDROID;
  if (/iphone|ipad|ipod/.test(ua)) return Platform.IOS;
  if (/windows/.test(ua)) return Platform.WINDOWS;
  if (/macintosh|macintel|macppc|macosx/.test(ua)) return Platform.MACOS;
  if (/linux|x11/.test(ua)) return Platform.LINUX;

  return Platform.UNKNOWN;
};

/**
 * Detect current browser from user agent.
 */
export const detectBrowser = (): Browser => {
  const ua = navigator.userAgent.toLowerCase();

  // Order matters: check Samsung first (it reports Chrome too)
  if (/samsungbrowser/.test(ua)) return Browser.SAMSUNG;
  if (/chrome|chromium|crios/.test(ua) && !/edge|edg/.test(ua)) return Browser.CHROME;
  if (/safari/.test(ua) && !/chrome|chromium|crios/.test(ua)) return Browser.SAFARI;
  if (/firefox|fxios/.test(ua)) return Browser.FIREFOX;
  if (/edge|edg|edga|edgios/.test(ua)) return Browser.EDGE;

  return Browser.UNKNOWN;
};

/**
 * Detect current display mode (installed vs browser tab).
 */
export const detectDisplayMode = (): DisplayMode => {
  if (window.matchMedia('(display-mode: standalone)').matches) {
    return DisplayMode.STANDALONE;
  }
  if (window.matchMedia('(display-mode: fullscreen)').matches) {
    return DisplayMode.FULLSCREEN;
  }
  if (window.matchMedia('(display-mode: minimal-ui)').matches) {
    return DisplayMode.MINIMAL_UI;
  }
  if (window.matchMedia('(display-mode: browser)').matches) {
    return DisplayMode.BROWSER;
  }
  return DisplayMode.UNKNOWN;
};

/**
 * Check if app is installed (running in standalone/fullscreen mode).
 */
export const isAppInstalled = (): boolean => {
  const mode = detectDisplayMode();
  return mode === DisplayMode.STANDALONE || mode === DisplayMode.FULLSCREEN;
};

/**
 * Detect device type based on screen size and user agent.
 */
export const detectDeviceType = (): { isMobile: boolean; isTablet: boolean } => {
  const ua = navigator.userAgent.toLowerCase();
  const viewport = window.innerWidth;

  // Check user agent for explicit device type indicators
  const isMobileUA = /android|iphone|ipod|mobile|opera mini|blackberry|webos|windows phone/i.test(ua);
  const isTabletUA = /ipad|android|tablet|playbook|silk|nexus 7|nexus 10|xoom|kindle|playbook|sony tablet/i.test(ua);

  // If explicitly a tablet, prefer that classification
  if (isTabletUA && !/iphone|ipod|windows phone/.test(ua)) {
    return { isMobile: false, isTablet: true };
  }

  // Use viewport width as fallback
  const isMobile = viewport < 768;
  const isTablet = viewport >= 768 && viewport < 1024;

  return { isMobile: isMobileUA || isMobile, isTablet: isTabletUA || isTablet };
};

/**
 * Check if browser supports beforeinstallprompt event.
 */
export const supportsWebInstallPrompt = (): boolean => {
  return 'onbeforeinstallprompt' in window;
};

/**
 * Get comprehensive platform information.
 */
export const getPlatformInfo = (): PlatformInfo => {
  const { isMobile, isTablet } = detectDeviceType();

  return {
    platform: detectPlatform(),
    browser: detectBrowser(),
    displayMode: detectDisplayMode(),
    isInstalled: isAppInstalled(),
    isMobile,
    isTablet,
    supportsWebInstallPrompt: supportsWebInstallPrompt(),
  };
};

/**
 * Check if running on specific platform.
 */
export const isAndroid = (): boolean => detectPlatform() === Platform.ANDROID;
export const isIOS = (): boolean => detectPlatform() === Platform.IOS;
export const isWindows = (): boolean => detectPlatform() === Platform.WINDOWS;
export const isMacOS = (): boolean => detectPlatform() === Platform.MACOS;
export const isLinux = (): boolean => detectPlatform() === Platform.LINUX;

/**
 * Check if running in specific browser.
 */
export const isChrome = (): boolean => detectBrowser() === Browser.CHROME;
export const isSafari = (): boolean => detectBrowser() === Browser.SAFARI;
export const isFirefox = (): boolean => detectBrowser() === Browser.FIREFOX;
export const isEdge = (): boolean => detectBrowser() === Browser.EDGE;

/**
 * Listen for changes in display mode (installation event).
 */
export const onDisplayModeChange = (callback: (mode: DisplayMode) => void): (() => void) => {
  const mediaQueryLists = [
    { mode: DisplayMode.STANDALONE, mql: window.matchMedia('(display-mode: standalone)') },
    { mode: DisplayMode.FULLSCREEN, mql: window.matchMedia('(display-mode: fullscreen)') },
    { mode: DisplayMode.MINIMAL_UI, mql: window.matchMedia('(display-mode: minimal-ui)') },
    { mode: DisplayMode.BROWSER, mql: window.matchMedia('(display-mode: browser)') },
  ];

  const handleChange = () => {
    const currentMode = detectDisplayMode();
    callback(currentMode);
  };

  mediaQueryLists.forEach(({ mql }) => {
    mql.addEventListener('change', handleChange);
  });

  return () => {
    mediaQueryLists.forEach(({ mql }) => {
      mql.removeEventListener('change', handleChange);
    });
  };
};
