// Optional Google Analytics 4, loaded ONLY after the visitor opts in, and only when the
// site owner set GA_ID. It never receives text: the page sends no custom events at all,
// just the standard page view with advertising features switched off.
export function start(id, tt) {
  if (!/^G-[A-Z0-9]{4,14}$/.test(id) || window.__plainpenGA) return;
  window.__plainpenGA = true;
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;
  gtag('consent', 'default', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'granted' });
  gtag('js', new Date());
  gtag('config', id, { anonymize_ip: true, allow_google_signals: false, allow_ad_personalization_signals: false, page_location: location.origin + location.pathname, page_referrer: '' });
  const prefix = 'https://www.googletagmanager.com/gtag/js?id=';
  const policy = window.trustedTypes
    ? trustedTypes.createPolicy('plainpen-ga', { createScriptURL: (u) => { if (!u.startsWith(prefix + 'G-')) throw new TypeError('Blocked script URL'); return u; } })
    : { createScriptURL: (u) => u };
  const s = document.createElement('script');
  s.async = true;
  s.src = policy.createScriptURL(prefix + encodeURIComponent(id));
  document.head.append(s);
}
