/* ============================================================
   AuRAS Workshop — script.js
   ============================================================ */

// ---- AUTOMOTIVE RADAR ANIMATION ---------------------------------------------
// Forward-looking sensor view: an ego vehicle steers a beam across a fan-shaped
// field of view, detecting other cars ahead and measuring their Doppler velocity.
(function () {
  const canvas = document.getElementById('radarCanvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  let animId = null;
  let dpr = 1;

  const reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const FOV       = (52 * Math.PI) / 180;  // half field-of-view (azimuth)
  const BEAM_HALF = 0.085;                 // beam width for a detection (rad)
  let   beamPhase = 0;                     // drives the steered sweep
  let   dash      = 0;                     // scrolling lane markings

  // Traffic in lanes: -1 left, 0 ego lane, 1 right. dist is fraction of range.
  const LANES = [-1, 0, 1];
  const vehicles = Array.from({ length: 7 }, () => {
    const lane  = LANES[Math.floor(Math.random() * LANES.length)];
    const speed = 0.0004 + Math.random() * 0.0011;
    return {
      lane,
      dist:  0.2 + Math.random() * 0.8,
      // left lane is oncoming (moves down / approaches); center & right recede (move up)
      vrel:  lane === -1 ? -speed : speed,   // range-rate: + recedes, − approaches
      alpha: 0,                              // detection brightness
      len:   0.12 + Math.random() * 0.05,    // car length (fraction of R)
    };
  });

  function resize() {
    const parent = canvas.parentElement;
    const size = Math.min(parent.offsetWidth, 460);
    dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
    canvas.width  = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width  = size + 'px';
    canvas.style.height = size + 'px';
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawCar(x, y, cw, cl, fill, stroke) {
    roundRect(x - cw / 2, y - cl / 2, cw, cl, Math.min(cw, cl) * 0.28);
    if (fill)   { ctx.fillStyle = fill;     ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.4; ctx.stroke(); }
  }

  function drawEgo(x, y, R) {
    const cw = R * 0.18, cl = R * 0.28;
    drawCar(x, y, cw, cl, 'rgba(13,27,42,0.95)', 'rgba(0,212,255,0.85)');
    // windshield hint
    roundRect(x - cw * 0.3, y - cl * 0.34, cw * 0.6, cl * 0.3, cw * 0.15);
    ctx.fillStyle = 'rgba(0,212,255,0.18)';
    ctx.fill();
    // glowing bumper radar sensor
    const sy = y - cl / 2;
    const grd = ctx.createRadialGradient(x, sy, 0, x, sy, 10);
    grd.addColorStop(0, 'rgba(0,212,255,0.9)');
    grd.addColorStop(1, 'rgba(0,212,255,0)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(x, sy, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#00d4ff';
    ctx.beginPath();
    ctx.arc(x, sy, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W  = canvas.width / dpr;
    const H  = canvas.height / dpr;
    const cx = W / 2, cy = H / 2;
    const R  = Math.min(cx, cy) * 0.9;        // disc radius

    const ox = cx, oy = cy + R * 0.72;        // sensor origin (bottom, looking up)
    const maxRange = R * 1.62;                // forward reach (clipped by disc)
    const laneW = R * 0.40;

    // azimuth `az` (from straight ahead, + to the right) and range → screen point
    const fwdAngle = -Math.PI / 2;
    const px = (az, rng) => ox + Math.sin(az) * rng;
    const py = (az, rng) => oy - Math.cos(az) * rng;

    ctx.clearRect(0, 0, W, H);

    // disc background + circular clip
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R + 2, 0, Math.PI * 2);
    ctx.fillStyle = '#08131e';
    ctx.fill();
    ctx.clip();

    // lane markings (scrolling toward viewer = ego moving forward)
    [-1.5, -0.5, 0.5, 1.5].forEach(m => {
      const x = ox + m * laneW;
      ctx.beginPath();
      if (Math.abs(m) > 1) {                  // outer road edges (solid)
        ctx.setLineDash([]);
        ctx.strokeStyle = 'rgba(0,212,255,0.10)';
      } else {                                // inner lane dividers (dashed)
        ctx.setLineDash([H * 0.06, H * 0.05]);
        ctx.lineDashOffset = dash;
        ctx.strokeStyle = 'rgba(255,255,255,0.10)';
      }
      ctx.lineWidth = 1;
      ctx.moveTo(x, oy);
      ctx.lineTo(x, oy - maxRange);
      ctx.stroke();
    });
    ctx.setLineDash([]);

    // range arcs within the field of view
    for (let i = 1; i <= 4; i++) {
      ctx.beginPath();
      ctx.arc(ox, oy, maxRange * i / 4, fwdAngle - FOV, fwdAngle + FOV);
      ctx.strokeStyle = `rgba(0,212,255,${0.05 + i * 0.018})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // field-of-view edges
    ctx.strokeStyle = 'rgba(0,212,255,0.12)';
    ctx.lineWidth = 1;
    [-FOV, FOV].forEach(s => {
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(px(s, maxRange), py(s, maxRange));
      ctx.stroke();
    });

    // steered beam (eased back-and-forth azimuth scan)
    const beamAz = Math.sin(beamPhase) * FOV;
    const span = 0.16, STEPS = 24;
    for (let i = 0; i < STEPS; i++) {
      const a0 = beamAz - span + (2 * span * i / STEPS);
      const a1 = beamAz - span + (2 * span * (i + 1) / STEPS);
      const tri = 1 - Math.abs((a0 - beamAz) / span);   // bright at the centre
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.arc(ox, oy, maxRange, fwdAngle + a0, fwdAngle + a1);
      ctx.closePath();
      ctx.fillStyle = `rgba(0,212,255,${0.16 * tri})`;
      ctx.fill();
    }
    const bx = px(beamAz, maxRange), by = py(beamAz, maxRange);
    const beamGrad = ctx.createLinearGradient(ox, oy, bx, by);
    beamGrad.addColorStop(0, 'rgba(0,212,255,0.9)');
    beamGrad.addColorStop(1, 'rgba(0,212,255,0)');
    ctx.strokeStyle = beamGrad;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(bx, by);
    ctx.stroke();

    // vehicles + detections
    vehicles.forEach(v => {
      v.dist += v.vrel;
      if (v.dist > 1.05) v.dist = 0.14;       // recede off the top → re-enter near
      if (v.dist < 0.14) v.dist = 1.0;        // approach past us → re-enter far

      const rng = v.dist * maxRange;
      const x = ox + v.lane * laneW;
      const y = oy - rng;
      const az = Math.atan2(x - ox, oy - y);  // azimuth from forward axis
      const inFov = Math.abs(az) < FOV;

      if (inFov && Math.abs(az - beamAz) < BEAM_HALF) v.alpha = 1;
      else v.alpha = Math.max(0, v.alpha - 0.012);

      const carL = v.len * R;
      const carW = carL * 0.52;

      if (inFov) drawCar(x, y, carW, carL, 'rgba(120,170,200,0.10)', null);

      if (v.alpha > 0.02) {
        const grd = ctx.createRadialGradient(x, y, 0, x, y, carL * 0.95);
        grd.addColorStop(0, `rgba(0,255,150,${0.45 * v.alpha})`);
        grd.addColorStop(1, 'rgba(0,255,150,0)');
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(x, y, carL * 0.95, 0, Math.PI * 2);
        ctx.fill();

        drawCar(x, y, carW, carL, null, `rgba(0,255,150,${0.9 * v.alpha})`);

        // Doppler velocity vector: up = receding (green), down = approaching (warm)
        const dir  = v.vrel >= 0 ? -1 : 1;
        const vlen = Math.min(Math.abs(v.vrel) / 0.0016, 1) * carL * 1.2 + 4;
        const vy   = y + dir * vlen;
        const vcol = v.vrel >= 0
          ? `rgba(0,255,150,${v.alpha})`
          : `rgba(255,140,90,${v.alpha})`;
        ctx.strokeStyle = vcol;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, vy);
        ctx.moveTo(x, vy);
        ctx.lineTo(x - 3.5, vy - dir * 3.5);
        ctx.moveTo(x, vy);
        ctx.lineTo(x + 3.5, vy - dir * 3.5);
        ctx.stroke();
      }
    });

    drawEgo(ox, oy, R);

    // subtle rim
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0,212,255,0.15)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.restore();

    if (reduceMotion) { animId = null; return; }
    beamPhase += 0.018;
    dash += 1.6;
    animId = requestAnimationFrame(draw);
  }

  let visible = false;
  resize();

  // Re-measure on any layout change. While animating, the running loop picks up
  // the new canvas dimensions on its next frame; if static/visible, repaint once.
  const onResize = () => { resize(); if (reduceMotion || (visible && !animId)) draw(); };
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);
  // Fonts can reflow the hero after load (esp. on iOS), changing the radar width.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(onResize);

  // Only animate while the hero is visible
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      visible = e.isIntersecting;
      if (e.isIntersecting) {
        resize();                 // ensure correct size right before first paint
        if (!animId) draw();
      } else if (animId) {
        cancelAnimationFrame(animId);
        animId = null;
      }
    });
  });
  io.observe(canvas);
})();


// ---- COUNTDOWN TIMERS -------------------------------------------------------
(function () {
  function pad(n) { return String(n).padStart(2, '0'); }

  function update() {
    const now = Date.now();
    document.querySelectorAll('.countdown[data-date]').forEach(el => {
      const target = new Date(el.dataset.date).getTime();
      const diff   = target - now;

      if (diff <= 0) {
        el.textContent = 'Passed';
        el.classList.add('passed');
        el.classList.remove('urgent');
        return;
      }

      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000)  / 60000);
      const s = Math.floor((diff % 60000)    / 1000);

      el.classList.toggle('urgent', d < 7);

      if (d > 0) {
        el.textContent = `${d}d ${pad(h)}h ${pad(m)}m`;
      } else {
        el.textContent = `${pad(h)}h ${pad(m)}m ${pad(s)}s`;
      }
    });
  }

  update();
  setInterval(update, 1000);
})();


// ---- STICKY NAV SHADOW ------------------------------------------------------
(function () {
  const nav = document.getElementById('navbar');
  if (!nav) return;
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 10);
  }, { passive: true });
})();


// ---- ACTIVE NAV LINKS -------------------------------------------------------
(function () {
  const links    = [...document.querySelectorAll('.nav-links a[href^="#"]')];
  const sections = links.map(a => document.querySelector(a.getAttribute('href'))).filter(Boolean);
  if (!sections.length) return;

  function setActive() {
    const scrollY = window.scrollY + 80;
    let current = sections[0];
    sections.forEach(s => { if (s.offsetTop <= scrollY) current = s; });
    links.forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + current.id));
  }

  window.addEventListener('scroll', setActive, { passive: true });
  setActive();
})();


// ---- MOBILE NAV TOGGLE ------------------------------------------------------
(function () {
  const btn   = document.getElementById('navToggle');
  const links = document.getElementById('navLinks');
  if (!btn || !links) return;

  btn.addEventListener('click', () => {
    const open = links.classList.toggle('open');
    btn.setAttribute('aria-expanded', open);
  });

  links.querySelectorAll('a').forEach(a =>
    a.addEventListener('click', () => {
      links.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
    })
  );
})();
