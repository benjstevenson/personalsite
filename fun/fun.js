/* ============================================
   FUN MODE — shared behavior
   fade-ins, marquee, char/word reveal, magnet,
   sticky stacking cards, exit toggle
   ============================================ */

(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Fade-in on scroll ---------- */
  const fadeEls = document.querySelectorAll('[data-fade]');
  if (fadeEls.length) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      });
    }, { rootMargin: '50px 0px', threshold: 0 });
    fadeEls.forEach((el) => io.observe(el));
  }

  /* ---------- Scroll-driven marquee ---------- */
  const marqueeSection = document.querySelector('.marquee-section');
  const marqueeRows = document.querySelectorAll('.marquee-row');
  if (marqueeSection && marqueeRows.length && !reduceMotion) {
    let ticking = false;
    const update = () => {
      ticking = false;
      const rect = marqueeSection.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > window.innerHeight) return;
      const sectionTop = rect.top + window.scrollY;
      const offset = (window.scrollY - sectionTop + window.innerHeight) * 0.3;
      marqueeRows.forEach((row, i) => {
        const dir = i % 2 === 0 ? 1 : -1;
        row.style.transform = `translateX(${dir * (offset - 200) - (dir === 1 ? 800 : 0)}px)`;
      });
    };
    window.addEventListener('scroll', () => {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    update();
  }

  /* ---------- Character reveal (short text) ---------- */
  const charTargets = document.querySelectorAll('.reveal-text');
  charTargets.forEach((el) => {
    const text = el.textContent;
    el.textContent = '';
    const frag = document.createDocumentFragment();
    for (const ch of text) {
      const span = document.createElement('span');
      span.className = 'ch';
      span.textContent = ch;
      frag.appendChild(span);
    }
    el.appendChild(frag);
  });

  /* ---------- Word reveal (long text, story page) ---------- */
  const wordTargets = document.querySelectorAll('.story-flow p, .story-flow li');
  wordTargets.forEach((el) => {
    const words = el.textContent.split(/(\s+)/);
    el.textContent = '';
    const frag = document.createDocumentFragment();
    words.forEach((w) => {
      if (/^\s+$/.test(w)) {
        frag.appendChild(document.createTextNode(w));
      } else if (w.length) {
        const span = document.createElement('span');
        span.className = 'w';
        span.textContent = w;
        frag.appendChild(span);
      }
    });
    el.appendChild(frag);
  });

  /* Short blocks (about page): per-block character sweep */
  const revealBlocks = [...charTargets].map((el) => ({
    el,
    spans: el.querySelectorAll('.ch'),
  })).filter((b) => b.spans.length);

  if (revealBlocks.length) {
    if (reduceMotion) {
      revealBlocks.forEach((b) => b.spans.forEach((s) => { s.style.opacity = '1'; }));
    } else {
      let rTicking = false;
      const updateReveal = () => {
        rTicking = false;
        const vh = window.innerHeight;
        revealBlocks.forEach((b) => {
          const rect = b.el.getBoundingClientRect();
          if (rect.top > vh || rect.bottom < 0) {
            if (rect.top > vh) b.spans.forEach((s) => { s.style.opacity = ''; });
            return;
          }
          // progress 0 → 1 as element travels from 80% to 20% of viewport
          const start = vh * 0.8;
          const end = vh * 0.2;
          const p = Math.min(Math.max((start - rect.top) / (rect.height + (start - end)), 0), 1);
          const n = b.spans.length;
          b.spans.forEach((s, i) => {
            const local = Math.min(Math.max(p * n - i, 0), 1);
            s.style.opacity = String(0.2 + 0.8 * local);
          });
        });
      };
      window.addEventListener('scroll', () => {
        if (!rTicking) { rTicking = true; requestAnimationFrame(updateReveal); }
      }, { passive: true });
      updateReveal();
    }
  }

  /* Story page: ONE reveal across the whole story. Every word brightens as
     it crosses a fixed line (~68% down the viewport), so the text lights up
     line by line regardless of paragraph breaks. */
  const storyWords = [...document.querySelectorAll('.story-flow .w')];
  if (storyWords.length) {
    if (reduceMotion) {
      storyWords.forEach((s) => { s.style.opacity = '1'; });
    } else {
      // Cache each word's document-space Y once (and again on resize/font load)
      let wordTops = [];
      const cachePositions = () => {
        const scrollY = window.scrollY;
        wordTops = storyWords.map((s) => s.getBoundingClientRect().top + scrollY);
      };

      const RAMP = 120; // px past the trigger line over which a word fades in
      let lastApplied = [];
      const updateStory = () => {
        wTicking = false;
        const triggerY = window.scrollY + window.innerHeight * 0.68;
        storyWords.forEach((s, i) => {
          const o = Math.min(Math.max((triggerY - wordTops[i]) / RAMP, 0), 1);
          const val = (0.15 + 0.85 * o).toFixed(3);
          if (lastApplied[i] !== val) {
            lastApplied[i] = val;
            s.style.opacity = val;
          }
        });
      };

      let wTicking = false;
      const requestStoryUpdate = () => {
        if (!wTicking) { wTicking = true; requestAnimationFrame(updateStory); }
      };

      cachePositions();
      updateStory();
      window.addEventListener('scroll', requestStoryUpdate, { passive: true });
      window.addEventListener('resize', () => { cachePositions(); requestStoryUpdate(); }, { passive: true });
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(() => { cachePositions(); requestStoryUpdate(); });
      }
    }
  }

  /* ---------- Magnet effect (hero portrait) ---------- */
  const magnet = document.querySelector('[data-magnet]');
  if (magnet && !reduceMotion && window.matchMedia('(pointer: fine)').matches) {
    const PADDING = 150;
    const STRENGTH = 3;
    let active = false;
    window.addEventListener('mousemove', (e) => {
      const rect = magnet.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const within =
        e.clientX > rect.left - PADDING && e.clientX < rect.right + PADDING &&
        e.clientY > rect.top - PADDING && e.clientY < rect.bottom + PADDING;
      if (within) {
        if (!active) { active = true; magnet.style.transition = 'transform 0.3s ease-out'; }
        const dx = (e.clientX - cx) / STRENGTH;
        const dy = (e.clientY - cy) / STRENGTH;
        magnet.style.transform = `translateX(-50%) translate3d(${dx}px, ${dy}px, 0)`;
      } else if (active) {
        active = false;
        magnet.style.transition = 'transform 0.6s ease-in-out';
        magnet.style.transform = 'translateX(-50%) translate3d(0, 0, 0)';
      }
    }, { passive: true });
  }

  /* ---------- Sticky stacking project cards ---------- */
  const slots = document.querySelectorAll('.stack-slot');
  if (slots.length && !reduceMotion) {
    const total = slots.length;
    let sTicking = false;
    const updateStack = () => {
      sTicking = false;
      slots.forEach((slot, i) => {
        const card = slot.querySelector('.stack-card');
        if (!card) return;
        const rect = slot.getBoundingClientRect();
        // progress: how far the NEXT content has scrolled over this card
        const p = Math.min(Math.max(-rect.top / (rect.height * 0.85), 0), 1);
        const target = 1 - (total - 1 - i) * 0.03;
        const scale = 1 - (1 - target) * p;
        card.style.transform = `scale(${scale})`;
      });
    };
    window.addEventListener('scroll', () => {
      if (!sTicking) { sTicking = true; requestAnimationFrame(updateStack); }
    }, { passive: true });
    updateStack();
  }

  /* ---------- Exit toggle (starts ON, slides OFF, then navigates) ---------- */
  const btn = document.getElementById('fun-toggle-btn');
  const label = document.getElementById('fun-toggle-label');
  if (btn) {
    const deactivate = () => {
      if (!btn.classList.contains('is-on')) return;
      btn.classList.remove('is-on');
      btn.setAttribute('aria-checked', 'false');
      setTimeout(() => { window.location.href = btn.dataset.target; }, 320);
    };
    btn.addEventListener('click', deactivate);
    if (label) label.addEventListener('click', deactivate);
  }
})();
