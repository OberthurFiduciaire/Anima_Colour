document.addEventListener('DOMContentLoaded', () => {
  const shapeButtons = document.querySelectorAll('.shape-btn');
  const colorOptions = document.querySelectorAll('.color-option');
  const preview = document.getElementById('animated-preview');
  const resetBtn = document.getElementById('reset-btn');
  const motionBtn = document.getElementById('motion-permission-btn');
  const deviceMode = document.getElementById('device-mode');
  const selectionLabel = document.getElementById('selection-label');
  const motionStatus = document.getElementById('motion-status');

  const FRAME_COUNT = 11;
  const MOBILE_QUERY = window.matchMedia('(max-width: 1180px), (pointer: coarse)');

  let selectedShape = null;
  let selectedColor = null;
  let mobileFrames = [];
  let resolvedFrameCache = new Map();
  let currentIndex = Math.floor(FRAME_COUNT / 2);
  let motionEnabled = false;
  let neutralTilt = null;
  let lastFrameUpdate = 0;
  let lastSensorEventAt = 0;
  let orientationHandlerAttached = false;
  let motionHandlerAttached = false;
  let touchStartY = null;

  function isMobileOrTablet() {
    return MOBILE_QUERY.matches || 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }

  function setDeviceMode() {
    const mobile = isMobileOrTablet();
    deviceMode.textContent = mobile ? 'Mobile / tablet mode' : 'Desktop mode';
    motionBtn.style.display = mobile ? 'inline-flex' : 'none';
    motionStatus.textContent = mobile
      ? 'Select a shape and colour, tap Enable motion, then tilt your phone up and down.'
      : 'Desktop mode uses the animated GIF automatically.';
  }

  function desktopGifPath(shape, color) {
    return `${shape}/${color}_tr.gif`;
  }

  function colorFolderCandidates(color) {
    const lower = color.toLowerCase();
    const upper = color.toUpperCase();
    const candidates = [color, upper, lower];

    // Keeps compatibility with the existing typo in some folders.
    if (color === 'Amethyst') candidates.push('Amethys', 'AMETHYS', 'amethys');

    return [...new Set(candidates)];
  }

  function frameCandidatePaths(shape, color, frameNumber) {
    const folders = colorFolderCandidates(color);
    const numbers = [String(frameNumber), String(frameNumber).padStart(2, '0')];
    const exts = ['png', 'PNG', 'jpg', 'JPG', 'jpeg', 'JPEG', 'webp', 'WEBP'];
    const paths = [];

    folders.forEach((folder) => {
      numbers.forEach((num) => {
        exts.forEach((ext) => {
          paths.push(`${shape}_telephone/${folder}/${num}.${ext}`);
        });
      });
    });

    return paths;
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(src);
      img.onerror = reject;
      img.src = src;
    });
  }

  async function resolveFrame(shape, color, frameNumber) {
    const cacheKey = `${shape}-${color}-${frameNumber}`;
    if (resolvedFrameCache.has(cacheKey)) return resolvedFrameCache.get(cacheKey);

    const candidates = frameCandidatePaths(shape, color, frameNumber);

    for (const src of candidates) {
      try {
        const validSrc = await loadImage(src);
        resolvedFrameCache.set(cacheKey, validSrc);
        return validSrc;
      } catch (error) {
        // Continue with the next possible path.
      }
    }

    resolvedFrameCache.set(cacheKey, null);
    return null;
  }

  async function preloadMobileFrames(shape, color) {
    const frames = [];

    for (let i = 1; i <= FRAME_COUNT; i += 1) {
      frames.push(await resolveFrame(shape, color, i));
    }

    return frames;
  }

  function updateSelectionLabel() {
    selectionLabel.textContent = selectedShape && selectedColor
      ? `${selectedShape} · ${selectedColor}`
      : 'No selection';
  }

  function showEmpty() {
    preview.className = 'animated-preview empty-state';
    preview.innerHTML = '<span class="preview-kicker">Preview</span><p>Select a shape and a colour to see the animation.</p>';
    mobileFrames = [];
    currentIndex = Math.floor(FRAME_COUNT / 2);
    neutralTilt = null;
  }

  function missingMobileMessage() {
    return `
      <div class="empty-state">
        <span class="preview-kicker">Missing mobile frames</span>
        <p>Add your 11 images here:<br><strong>${selectedShape}_telephone/${selectedColor}/1.png</strong> to <strong>11.png</strong></p>
      </div>
    `;
  }

  function missingDesktopMessage() {
    return `
      <div class="empty-state">
        <span class="preview-kicker">Missing GIF</span>
        <p>Add this file:<br><strong>${desktopGifPath(selectedShape, selectedColor)}</strong></p>
      </div>
    `;
  }

  async function showPreview() {
    updateSelectionLabel();

    if (!selectedShape || !selectedColor) {
      showEmpty();
      return;
    }

    preview.className = 'animated-preview has-render';

    if (isMobileOrTablet()) {
      motionStatus.textContent = 'Loading mobile frames…';
      preview.innerHTML = '<div class="empty-state"><span class="preview-kicker">Loading</span><p>Preparing the 11 tilt frames…</p></div>';

      mobileFrames = await preloadMobileFrames(selectedShape, selectedColor);
      const validFrames = mobileFrames.filter(Boolean);

      if (!validFrames.length) {
        mobileFrames = [];
        preview.innerHTML = missingMobileMessage();
        motionStatus.textContent = 'Mobile frames were not found. Check folder names and image names.';
        return;
      }

      for (let i = 0; i < mobileFrames.length; i += 1) {
        if (!mobileFrames[i]) {
          mobileFrames[i] = validFrames[Math.min(validFrames.length - 1, Math.floor(i * validFrames.length / FRAME_COUNT))];
        }
      }

      currentIndex = Math.floor(FRAME_COUNT / 2);
      neutralTilt = null;
      preview.innerHTML = `<img id="anima-effect" src="${mobileFrames[currentIndex]}" alt="${selectedShape} ${selectedColor} tilt animation" class="preview-render phone-render" draggable="false" />`;

      motionBtn.disabled = false;
      motionBtn.textContent = motionEnabled ? 'Recalibrate motion' : 'Enable motion';
      motionStatus.textContent = motionEnabled
        ? 'Motion is enabled. Tilt the phone up and down. Tap the button again to recalibrate.'
        : 'Tap Enable motion, accept the permission, then tilt the phone up and down.';
      return;
    }

    mobileFrames = [];
    preview.innerHTML = `<img src="${desktopGifPath(selectedShape, selectedColor)}" alt="Animated GIF ${selectedShape} ${selectedColor}" class="preview-render" draggable="false" />`;

    const img = preview.querySelector('img');
    img.onerror = () => {
      preview.innerHTML = missingDesktopMessage();
    };
  }

  function setMobileFrame(index) {
    const now = performance.now();
    if (now - lastFrameUpdate < 16) return;
    lastFrameUpdate = now;

    const img = document.getElementById('anima-effect');
    if (!img || !mobileFrames.length) return;

    const safeIndex = Math.max(0, Math.min(FRAME_COUNT - 1, index));
    if (safeIndex === currentIndex) return;

    currentIndex = safeIndex;
    img.src = mobileFrames[currentIndex];

    const center = (FRAME_COUNT - 1) / 2;
    const movement = currentIndex - center;

    // Bigger movement so the effect is actually visible on a phone screen.
    img.style.transform = `translateY(${movement * 6}px) scale(${1 + Math.abs(movement) * 0.01})`;
  }

  function getOrientationTilt(event) {
    const beta = typeof event.beta === 'number' ? event.beta : null;
    const gamma = typeof event.gamma === 'number' ? event.gamma : null;
    const angle = screen.orientation && typeof screen.orientation.angle === 'number'
      ? screen.orientation.angle
      : (typeof window.orientation === 'number' ? window.orientation : 0);

    if (Math.abs(angle) === 90 && gamma !== null) return gamma;
    if (beta !== null) return beta;
    return gamma;
  }

  function frameFromDelta(delta, range) {
    const clamped = Math.max(-range, Math.min(range, delta));
    const normalized = (clamped + range) / (range * 2);
    return Math.round(normalized * (FRAME_COUNT - 1));
  }

  function handleOrientation(event) {
    if (!motionEnabled || !isMobileOrTablet() || !mobileFrames.length) return;

    const tilt = getOrientationTilt(event);
    if (tilt === null || typeof tilt === 'undefined') return;

    lastSensorEventAt = Date.now();

    if (neutralTilt === null) {
      neutralTilt = tilt;
      motionStatus.textContent = 'Motion enabled. Tilt up and down slowly.';
    }

    // Smaller range than before = image changes more easily.
    const delta = tilt - neutralTilt;
    setMobileFrame(frameFromDelta(delta, 18));
  }

  function handleMotion(event) {
    if (!motionEnabled || !isMobileOrTablet() || !mobileFrames.length) return;

    // Orientation is cleaner; motion is fallback only.
    if (Date.now() - lastSensorEventAt < 250) return;

    const gravity = event.accelerationIncludingGravity;
    if (!gravity) return;

    const value = typeof gravity.y === 'number' ? gravity.y : gravity.x;
    if (typeof value !== 'number') return;

    lastSensorEventAt = Date.now();

    if (neutralTilt === null) {
      neutralTilt = value;
      motionStatus.textContent = 'Motion enabled. Tilt up and down slowly.';
    }

    const delta = value - neutralTilt;
    setMobileFrame(frameFromDelta(delta, 3.2));
  }

  async function requestSensorPermission() {
    // iOS Safari requires this request to be launched directly from the button click.
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      const permission = await DeviceOrientationEvent.requestPermission();
      if (permission !== 'granted') return false;
    }

    // Some iOS versions also expose DeviceMotion permission.
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
      try {
        const permission = await DeviceMotionEvent.requestPermission();
        if (permission !== 'granted') return false;
      } catch (error) {
        // Orientation permission is enough for this demo.
      }
    }

    return true;
  }

  function attachSensorHandlers() {
    if (!orientationHandlerAttached) {
      window.addEventListener('deviceorientation', handleOrientation, true);
      orientationHandlerAttached = true;
    }

    if (!motionHandlerAttached) {
      window.addEventListener('devicemotion', handleMotion, true);
      motionHandlerAttached = true;
    }
  }

  async function enableMotion() {
    if (!isMobileOrTablet()) return;

    if (!selectedShape || !selectedColor) {
      motionBtn.textContent = 'Select shape + colour';
      setTimeout(() => {
        motionBtn.textContent = motionEnabled ? 'Recalibrate motion' : 'Enable motion';
      }, 1300);
      return;
    }

    // Permission first, while the click is still considered a user action by iPhone Safari.
    motionBtn.disabled = true;
    motionBtn.textContent = 'Requesting access…';
    motionStatus.textContent = 'Accept the motion permission if Safari asks.';

    try {
      const granted = await requestSensorPermission();

      if (!granted) {
        motionBtn.disabled = false;
        motionBtn.textContent = 'Enable motion';
        motionStatus.textContent = 'Motion permission was denied. Tap Enable motion and allow access.';
        return;
      }

      motionEnabled = true;
      neutralTilt = null;
      lastSensorEventAt = 0;
      attachSensorHandlers();

      if (!mobileFrames.length) {
        await showPreview();
      }

      motionBtn.disabled = false;
      motionBtn.textContent = 'Recalibrate motion';
      motionStatus.textContent = 'Motion enabled. Hold the phone normally, then tilt up and down slowly.';

      setTimeout(() => {
        if (motionEnabled && lastSensorEventAt === 0) {
          motionStatus.textContent = 'No sensor detected yet. On iPhone: Settings > Safari > Motion & Orientation Access must be enabled.';
        }
      }, 2500);
    } catch (error) {
      motionEnabled = false;
      motionBtn.disabled = false;
      motionBtn.textContent = 'Enable motion';
      motionStatus.textContent = 'Motion could not start. On iPhone, check Safari Motion & Orientation Access.';
    }
  }

  function applySelectionScroll() {
    if (!isMobileOrTablet()) return;
    document.querySelector('.preview-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Touch fallback: if the iPhone blocks the gyroscope, swiping the image still changes frames.
  preview.addEventListener('touchstart', (event) => {
    if (!isMobileOrTablet() || !mobileFrames.length) return;
    touchStartY = event.touches[0].clientY;
  }, { passive: true });

  preview.addEventListener('touchmove', (event) => {
    if (!isMobileOrTablet() || !mobileFrames.length || touchStartY === null) return;
    const currentY = event.touches[0].clientY;
    const delta = touchStartY - currentY;
    setMobileFrame(frameFromDelta(delta, 90));
  }, { passive: true });

  preview.addEventListener('touchend', () => {
    touchStartY = null;
  }, { passive: true });

  shapeButtons.forEach((button) => {
    button.addEventListener('click', async () => {
      shapeButtons.forEach((btn) => btn.classList.remove('active'));
      button.classList.add('active');
      selectedShape = button.dataset.shape;
      neutralTilt = null;
      await showPreview();
      applySelectionScroll();
    });
  });

  colorOptions.forEach((option) => {
    option.addEventListener('click', async () => {
      colorOptions.forEach((color) => color.classList.remove('active'));
      option.classList.add('active');
      selectedColor = option.dataset.color;
      neutralTilt = null;
      await showPreview();
      applySelectionScroll();
    });
  });

  resetBtn.addEventListener('click', () => {
    selectedShape = null;
    selectedColor = null;
    neutralTilt = null;
    motionEnabled = false;
    shapeButtons.forEach((btn) => btn.classList.remove('active'));
    colorOptions.forEach((color) => color.classList.remove('active'));
    updateSelectionLabel();
    showEmpty();
    motionBtn.disabled = false;
    motionBtn.textContent = 'Enable motion';
    setDeviceMode();
  });

  motionBtn.addEventListener('click', enableMotion);

  if (typeof MOBILE_QUERY.addEventListener === 'function') {
    MOBILE_QUERY.addEventListener('change', () => {
      setDeviceMode();
      showPreview();
    });
  }

  setDeviceMode();
  updateSelectionLabel();
});
