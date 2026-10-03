type RecaptchaClient = {
  ready: (callback: () => void) => void;
  execute: (siteKey: string, options: { action: string }) => Promise<string>;
};

declare global {
  interface Window {
    grecaptcha?: RecaptchaClient;
  }
}

let scriptPromise: Promise<void> | null = null;
let siteKeyPromise: Promise<string> | null = null;

async function getRecaptchaSiteKey(): Promise<string> {
  if (!siteKeyPromise) {
    siteKeyPromise = fetch('/api/billing/config')
      .then(async (response) => {
        if (!response.ok) throw new Error('Security verification configuration is unavailable');
        const config = await response.json();
        if (typeof config.recaptchaSiteKey !== 'string' || !config.recaptchaSiteKey.trim()) {
          throw new Error('Security verification is not configured');
        }
        return config.recaptchaSiteKey.trim();
      })
      .catch((error) => {
        siteKeyPromise = null;
        throw error;
      });
  }
  return siteKeyPromise;
}

function loadRecaptcha(siteKey: string): Promise<void> {
  if (window.grecaptcha) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => {
        scriptPromise = null;
        reject(new Error('Security verification could not be loaded'));
      };
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}

export async function executeRecaptcha(action: string): Promise<string> {
  const siteKey = await getRecaptchaSiteKey();
  await loadRecaptcha(siteKey);
  const client = window.grecaptcha;
  if (!client) throw new Error('Security verification is unavailable');

  await new Promise<void>((resolve) => client.ready(resolve));
  const token = await client.execute(siteKey, { action });
  if (!token) throw new Error('Security verification failed');
  return token;
}

export async function executeCheckoutRecaptcha(): Promise<string> {
  return executeRecaptcha('stripe_checkout');
}

export async function executeContactRecaptcha(): Promise<string> {
  return executeRecaptcha('contact-form');
}