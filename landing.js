(() => {
  'use strict';
  const fields = ['company', 'model', 'process', 'sources'];
  const preview = document.getElementById('brief-text');
  const status = document.getElementById('brief-status');
  const builder = document.querySelector('.brief-builder');
  const getValue = (name, fallback) => document.getElementById(`brief-${name}`)?.value.trim() || fallback;
  const brief = () => [
    'EXO one-machine pilot brief',
    `Company: ${getValue('company', '[optional]')}`,
    `Equipment model/revision: ${getValue('model', '[to discuss]')}`,
    `Current parts process: ${getValue('process', '[to discuss]')}`,
    `Available source formats: ${getValue('sources', '[to discuss]')}`,
    '',
    'Please help scope one model revision, useful service coverage, an existing parts destination and a reviewer. Please separate setup and ongoing fees and define maintenance and exit terms.'
  ].join('\n');
  function refresh() {
    if (preview) preview.value = brief();
    const email = builder?.dataset.contactEmail?.trim();
    const emailLink = document.getElementById('email-brief');
    if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && emailLink) {
      emailLink.hidden = false;
      emailLink.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent('EXO one-machine pilot')}&body=${encodeURIComponent(brief())}`;
    }
  }
  fields.forEach((name) => document.getElementById(`brief-${name}`)?.addEventListener('input', refresh));
  document.getElementById('download-brief')?.addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([brief()], {type: 'text/plain;charset=utf-8'}));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'EXO-one-machine-pilot-brief.txt';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.textContent = 'Brief prepared for download. Nothing has been sent to EXO.';
  });
  document.getElementById('copy-brief')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(brief());
      status.textContent = 'Brief copied. Paste it into an email to Blake Grove at AionForgestudios@gmail.com; nothing has been sent.';
    } catch {
      const details = preview?.closest('details');
      if (details) details.open = true;
      preview?.focus();
      preview?.select();
      status.textContent = 'Automatic copy is unavailable. The brief is selected below so you can copy it. Nothing has been sent.';
    }
  });
  document.getElementById('email-brief')?.addEventListener('click', () => {
    status.textContent = 'Opening an email draft. Review it in your mail app before sending.';
  });
  refresh();
  if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, {threshold: 0.08});
    document.querySelectorAll('.section-heading, .trust-band > div, .price-columns').forEach((element) => {
      element.classList.add('reveal-ready');
      observer.observe(element);
    });
  }
})();
