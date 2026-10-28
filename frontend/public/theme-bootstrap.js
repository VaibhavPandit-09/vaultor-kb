// Parser-blocking, same-origin script: runs before CSS and React under desktop CSP.
(() => {
  let preference = 'os';
  try {
    const cached = JSON.parse(localStorage.getItem('vaultor-device-presentation-v1') || 'null');
    if (cached && ['light', 'dark', 'oled'].includes(cached.theme)) preference = cached.theme;
  } catch { /* Missing/corrupt/blocked storage follows the system preference. */ }
  const theme = preference === 'os' ? (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : preference;
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.classList.toggle('dark', theme !== 'light');
  root.classList.toggle('light', theme === 'light');
  root.style.colorScheme = theme === 'light' ? 'light' : 'dark';
  root.style.backgroundColor = `var(--background, ${theme === 'oled' ? '#000000' : theme === 'dark' ? '#020617' : '#f6f7f9'})`;
  void window.vaultorDesktop?.appearance?.(preference);
})();
