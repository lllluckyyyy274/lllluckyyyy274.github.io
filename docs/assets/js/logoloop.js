// Vanilla JS LogoLoop — creates a continuous scrolling logo strip.
function createLogoLoop(rootEl, options = {}) {
  const {
    logos = [],
    speed = 120, // px per second
    direction = 'left',
    logoHeight = 48,
    gap = 40,
    hoverSpeed = 0, // on hover
    pauseOnHover = false,
    fadeOut = true,
    fadeOutColor = undefined,
    scaleOnHover = true,
    ariaLabel = 'Partner logos'
  } = options;

  if (!rootEl) return () => {};

  rootEl.classList.add('logoloop');
  if (fadeOut) rootEl.classList.add('logoloop--fade');
  if (scaleOnHover) rootEl.classList.add('logoloop--scale-hover');
  rootEl.setAttribute('role', 'region');
  rootEl.setAttribute('aria-label', ariaLabel);
  rootEl.style.setProperty('--logoloop-gap', `${gap}px`);
  rootEl.style.setProperty('--logoloop-logoHeight', `${logoHeight}px`);
  if (fadeOutColor) rootEl.style.setProperty('--logoloop-fadeColor', fadeOutColor);

  const track = document.createElement('div');
  track.className = 'logoloop__track';
  rootEl.appendChild(track);

  // prepare single sequence
  function createSequence() {
    const ul = document.createElement('ul');
    ul.className = 'logoloop__list';
    logos.forEach(item => {
      const li = document.createElement('li');
      li.className = 'logoloop__item';
      let content;
      if (item.src) {
        const img = document.createElement('img');
        img.src = item.src;
        img.alt = item.alt || '';
        img.loading = 'lazy';
        content = img;
      } else if (item.nodeHtml) {
        const span = document.createElement('span');
        span.innerHTML = item.nodeHtml;
        content = span;
      } else {
        const span = document.createElement('span');
        span.textContent = item.title || '';
        content = span;
      }
      if (item.href) {
        const a = document.createElement('a');
        a.className = 'logoloop__link';
        a.href = item.href;
        a.target = '_blank';
        a.rel = 'noreferrer noopener';
        a.appendChild(content);
        li.appendChild(a);
      } else {
        li.appendChild(content);
      }
      ul.appendChild(li);
    });
    return ul;
  }

  // first sequence reference (set after building copies)
  let firstSeq = null;

  function imagesLoadedWithin(el) {
    const imgs = Array.from(el.querySelectorAll('img'));
    if (imgs.length === 0) return Promise.resolve();
    return new Promise(resolve => {
      let remaining = imgs.length;
      imgs.forEach(img => {
        if (img.complete) {
          remaining -= 1;
        } else {
          img.addEventListener('load', () => { remaining -= 1; if (remaining === 0) resolve(); }, { once: true });
          img.addEventListener('error', () => { remaining -=1; if (remaining === 0) resolve(); }, { once: true });
        }
      });
      if (remaining === 0) resolve();
    });
  }

  let seqWidth = 0;
  let copyCount = 2;
  const baseVelocity = speed * (direction === 'left' || direction === 'up' ? 1 : -1);
  let targetMultiplier = 1; // 0..1, controlled by pointer proximity

  function updateDimensions() {
    const containerWidth = rootEl.clientWidth || rootEl.parentElement?.clientWidth || window.innerWidth;
    if (firstSeq) seqWidth = firstSeq.getBoundingClientRect().width || 0;
    if (seqWidth > 0) {
      copyCount = Math.max(2, Math.ceil(containerWidth / seqWidth) + 1);
    }
  }

  let seqs = [];

  function buildCopies() {
    // remove existing except first
    track.innerHTML = '';
    seqs = [];
    for (let i = 0; i < copyCount; i++) {
      const seq = createSequence();
      if (i === 0) seqs.push(seq);
      else seqs.push(seq);
      track.appendChild(seq);
    }
    // refresh firstSeq reference
    firstSeq = track.querySelector('.logoloop__list');
  }

  // animation
  let raf = null;
  let lastTs = null;
  let offset = 0;
  let velocity = speed * (direction === 'left' || direction === 'up' ? 1 : -1);

  const isVertical = direction === 'up' || direction === 'down';

  function animate(ts) {
    if (!lastTs) lastTs = ts;
    const dt = Math.max(0, ts - lastTs) / 1000;
    lastTs = ts;

    // smooth velocity towards target (baseVelocity * targetMultiplier)
    const desired = baseVelocity * targetMultiplier;
    const smoothing = 0.12;
    velocity += (desired - velocity) * Math.min(1, smoothing * (dt * 60));

    offset += velocity * dt;

    if (seqWidth > 0) {
      const mod = ((offset % seqWidth) + seqWidth) % seqWidth;
      if (isVertical) {
        track.style.transform = `translate3d(0, ${-mod}px, 0)`;
      } else {
        track.style.transform = `translate3d(${-mod}px, 0, 0)`;
      }
    }

    raf = requestAnimationFrame(animate);
  }

  function start() {
    if (raf) cancelAnimationFrame(raf);
    lastTs = null;
    raf = requestAnimationFrame(animate);
  }

  function stop() { if (raf) { cancelAnimationFrame(raf); raf = null; }}

  async function init() {
    // initial build to ensure DOM exists for measurement
    buildCopies();
    firstSeq = track.querySelector('.logoloop__list');
    await imagesLoadedWithin(track);
    // compute dimensions and possibly rebuild with correct copy count
    seqWidth = firstSeq?.getBoundingClientRect().width || 0;
    updateDimensions();
    buildCopies();
    firstSeq = track.querySelector('.logoloop__list');
    seqWidth = firstSeq?.getBoundingClientRect().width || 0;
    start();
  }

  let hover = false;
  // pointer proximity handling: slow down as pointer approaches a logo, stop on top
  function handlePointerMove(e) {
    const rect = rootEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const items = Array.from(track.querySelectorAll('.logoloop__item'));
    if (items.length === 0) { targetMultiplier = 1; return; }

    // compute minimal distance to item centers
    let minDist = Infinity;
    let closest = null;
    items.forEach(it => {
      const r = it.getBoundingClientRect();
      const cx = r.left + r.width / 2 - rect.left;
      const cy = r.top + r.height / 2 - rect.top;
      const dx = cx - x;
      const dy = cy - y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < minDist) { minDist = dist; closest = it; }
    });

    const hoverRadius = Math.max(logoHeight * 1.2, gap * 0.6) + 8; // px
    const normalized = Math.min(1, minDist / hoverRadius);
    targetMultiplier = normalized; // closer => smaller multiplier

    // scale nearest item if pointer is sufficiently close
    const scaleThreshold = Math.min(hoverRadius * 0.5, 80);
    items.forEach(it => it.classList.remove('is-active'));
    if (closest && minDist <= scaleThreshold) {
      closest.classList.add('is-active');
      // when directly over, ensure full stop
      targetMultiplier = 0;
    }
  }

  function handlePointerLeave() {
    targetMultiplier = 1;
    Array.from(track.querySelectorAll('.logoloop__item')).forEach(it => it.classList.remove('is-active'));
  }

  rootEl.addEventListener('pointermove', handlePointerMove);
  rootEl.addEventListener('pointerleave', handlePointerLeave);
  const onResize = () => { updateDimensions(); buildCopies(); };
  window.addEventListener('resize', onResize);

  init().catch(console.error);

  return function destroy() {
    stop();
    rootEl.removeEventListener('pointermove', handlePointerMove);
    rootEl.removeEventListener('pointerleave', handlePointerLeave);
    window.removeEventListener('resize', onResize);
    if (track.parentElement === rootEl) rootEl.removeChild(track);
  };
}

window.createLogoLoop = createLogoLoop;
