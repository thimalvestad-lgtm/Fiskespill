// Installing the game as an app: registers the service worker (offline play)
// and drives the 📲 button. Chrome and Edge hand us an install prompt; Safari
// on iPhone doesn't, so there the button opens step-by-step instructions.

const $ = (id) => document.getElementById(id);

export function setupInstall({ toast } = {}) {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service worker not registered', e));
  }

  const standalone = matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || navigator.standalone === true;
  if (standalone) return;

  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const android = /Android/.test(ua);
  const os = ios ? 'ios' : android ? 'android' : 'desktop';
  const btn = $('btn-install');
  let prompt = null;

  // Phones always get the button; on a computer it only shows once the
  // browser says the game can be installed.
  const intro = $('intro-install');
  const show = (on) => { btn.hidden = !on; intro.hidden = !on; };
  show(ios || android);

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    prompt = e;
    show(true);
  });
  window.addEventListener('appinstalled', () => {
    prompt = null;
    show(false);
    $('install').hidden = true;
    toast && toast('Riverbend is installed. Find it on your home screen.');
  });

  const open = async () => {
    if (prompt) {
      const p = prompt;
      prompt = null;
      p.prompt();
      const { outcome } = await p.userChoice;
      if (outcome === 'accepted') show(false);
      return;
    }
    document.querySelectorAll('#install .install-steps').forEach((el) => (el.hidden = el.dataset.os !== os));
    $('install').hidden = false;
  };
  btn.addEventListener('click', open);
  intro.addEventListener('click', open);
}
