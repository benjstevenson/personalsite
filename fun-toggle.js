document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('fun-toggle-btn');
  const label = document.getElementById('fun-toggle-label');
  if (!btn) return;

  const activate = () => {
    if (btn.classList.contains('is-on')) return;
    btn.classList.add('is-on');
    btn.setAttribute('aria-checked', 'true');
    setTimeout(() => {
      window.location.href = btn.dataset.target;
    }, 320);
  };

  btn.addEventListener('click', activate);
  if (label) label.addEventListener('click', activate);
});
