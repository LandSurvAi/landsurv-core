(function () {
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = window.gtag || gtag;
  gtag('js', new Date());
  gtag('config', 'G-467H2YZ5E4');

  var page = document.documentElement.getAttribute('data-page') || window.location.pathname;
  gtag('event', 'arabic_landing_view', { event_category: 'growth', page: page });

  document.querySelectorAll('[data-cta]').forEach(function (link) {
    link.addEventListener('click', function () {
      gtag('event', 'arabic_landing_cta_click', {
        event_category: 'growth',
        page: page,
        placement: link.getAttribute('data-cta') || 'unknown'
      });
    });
  });
})();
