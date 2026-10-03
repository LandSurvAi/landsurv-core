// Browser and OS detection utilities

export interface BrowserInfo {
  os: 'windows' | 'mac' | 'linux' | 'ios' | 'android' | 'unknown';
  browser: 'chrome' | 'firefox' | 'safari' | 'edge' | 'opera' | 'unknown';
  isMobile: boolean;
  isTablet: boolean;
}

export function detectBrowser(): BrowserInfo {
  const ua = navigator.userAgent.toLowerCase();
  const platform = navigator.platform?.toLowerCase() || '';

  // Detect OS
  let os: BrowserInfo['os'] = 'unknown';
  if (/iphone|ipad|ipod/.test(ua)) {
    os = 'ios';
  } else if (/android/.test(ua)) {
    os = 'android';
  } else if (/mac/.test(platform) || /macintosh/.test(ua)) {
    os = 'mac';
  } else if (/win/.test(platform) || /windows/.test(ua)) {
    os = 'windows';
  } else if (/linux/.test(platform) || /x11/.test(ua)) {
    os = 'linux';
  }

  // Detect browser
  let browser: BrowserInfo['browser'] = 'unknown';
  if (/edg/.test(ua)) {
    browser = 'edge';
  } else if (/chrome/.test(ua) && !/edg/.test(ua)) {
    browser = 'chrome';
  } else if (/safari/.test(ua) && !/chrome/.test(ua)) {
    browser = 'safari';
  } else if (/firefox/.test(ua)) {
    browser = 'firefox';
  } else if (/opera|opr/.test(ua)) {
    browser = 'opera';
  }

  // Detect mobile/tablet
  const isMobile = /mobile/.test(ua) || os === 'ios' || os === 'android';
  const isTablet = /tablet|ipad/.test(ua) || (os === 'android' && !/mobile/.test(ua));

  return { os, browser, isMobile, isTablet };
}

export function getRefreshInstructions(): string {
  const info = detectBrowser();

  if (info.isMobile || info.isTablet) {
    if (info.os === 'ios') {
      return 'On iPhone/iPad:\n1. Tap the Safari refresh button\n2. Pull down from the top to refresh\n3. If issues persist, go to Settings > Safari > Clear History and Website Data';
    } else if (info.os === 'android') {
      return 'On Android:\n1. Tap the menu (⋮) in your browser\n2. Select "Refresh" or pull down from the top\n3. If issues persist, tap menu > Settings > Privacy > Clear browsing data';
    }
    return 'On Mobile:\n1. Pull down from the top of the page to refresh\n2. If issues persist, clear your browser cache in Settings';
  }

  if (info.os === 'mac') {
    return 'Press Cmd+Shift+R (or Cmd+R) to hard refresh the page';
  }

  return 'Press Ctrl+Shift+R (or Ctrl+F5) to hard refresh the page';
}

export function getShortRefreshInstruction(): string {
  const info = detectBrowser();
  
  if (info.isMobile || info.isTablet) {
    return 'Pull down to refresh or clear browser cache';
  }
  
  if (info.os === 'mac') {
    return 'Press Cmd+Shift+R';
  }
  
  return 'Press Ctrl+Shift+R';
}
