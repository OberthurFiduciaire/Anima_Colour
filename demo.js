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
  const SHAPES = ['Butterfly', 'Switch'];
  const COLORS = ['Amethyst', 'Aquamarine', 'Citrine', 'Emerald', 'Ruby', 'Sapphire', 'Topaz', 'Tourmaline'];

  let selectedShape = null;
  let selectedColor = null;
  let mobileFrames = [];
  let resolvedFrameCache = new Map();
  let currentIndex = Math.floor(FRAME_COUNT / 2);
  let motionEnabled = false;
  let neutralTilt = null;
  let lastFrameUpdate = 0;
  let lastMotionEventAt = 0;
  let orientationHandlerAttached = false;
  let motionHandlerAttached = false;

  function isMobileOrTablet() {
    return MOBILE_QUERY.matches || 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }

  function setDeviceMode() {
    const mobile = isMobileOrTablet();
    deviceMode.textContent = mobile ? 'Mobile / tablet mode' : 'Desktop mode';
    motionBtn.style.display = mobile ? 'inline-flex' : 'none';
    motionStatus.textContent = mobile
      ? 'Select a shape and colour, tap Enable motion, then tilt your device up and down.'
      : 'Desktop mode uses the animated GIF automatically.';
  }

  function desktopGifPath(shape, color) {
    return `${shape}/${color}_tr.gif`;
  }

  function colorFolderCandidates(color) {
    const lower = color.toLowerCase();
    const upper = color.toUpperCase();
    const candidates = [color, upper, lower];
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
        // Try the next candidate path.
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
    selectionLabel.textContent = selectedShape && selectedColor ? `${selectedShape} · ${selectedColor}` : 'No selection';
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

      // If some images are missing, replace them with the nearest valid image so motion still works.
      for (let i = 0; i < mobileFrames.length; i += 1) {
        if (!mobileFrames[i]) {
          mobileFrames[i] = validFrames[Math.min(validFrames.length - 1, Math.floor(i * validFrames.length / FRAME_COUNT))];
        }
      }

      currentIndex = Math.floor(FRAME_COUNT / 2);
      neutralTilt = null;
      preview.innerHTML = `<img id="anima-effect" src="${mobileFrames[currentIndex]}" alt="${selectedShape} ${selectedColor} tilt animation" class="preview-render phone-render" draggable="false" />`;
      motionBtn.disabled = motionEnabled;
      motionBtn.textContent = motionEnabled ? 'Motion enabled' : 'Enable motion';
      motionStatus.textContent = motionEnabled
        ? 'Motion is enabled. Tilt your device up and down slowly.'
        : 'Tap Enable motion, then tilt your device up and down slowly.';
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
    if (now - lastFrameUpdate < 18) return;
    lastFrameUpdate = now;

    const img = document.getElementById('anima-effect');
    if (!img || !mobileFrames.length) return;

    const safeIndex = Math.max(0, Math.min(FRAME_COUNT - 1, index));
    if (safeIndex === currentIndex) return;

    currentIndex = safeIndex;
    img.src = mobileFrames[currentIndex];

    const center = (FRAME_COUNT - 1) / 2;
    const movement = currentIndex - center;
    img.style.transform = `translateY(${movement * 1.4}px) scale(${1 + Math.abs(movement) * 0.003})`;
  }

  function getOrientationTilt(event) {
    const beta = typeof event.beta === 'number' ? event.beta : null;
    const gamma = typeof event.gamma === 'number' ? event.gamma : null;
    const angle = screen.orientation && typeof screen.orientation.angle === 'number'
      ? screen.orientation.angle
      : (typeof window.orientation === 'number' ? window.orientation : 0);

    // Portrait: beta is front/back tilt. Landscape: gamma is usually closer to up/down movement.
    if (Math.abs(angle) === 90 && gamma !== null) return gamma;
    if (beta !== null) return beta;
    return gamma;
  }

  function handleOrientation(event) {
    if (!motionEnabled || !isMobileOrTablet() || !mobileFrames.length) return;
    const tilt = getOrientationTilt(event);
    if (tilt === null || typeof tilt === 'undefined') return;

    lastMotionEventAt = Date.now();
    if (neutralTilt === null) neutralTilt = tilt;

    const delta = Math.max(-35, Math.min(35, tilt - neutralTilt));
    const normalized = (delta + 35) / 70;
    const index = Math.round(normalized * (FRAME_COUNT - 1));
    setMobileFrame(index);
  }

  function handleMotion(event) {
    if (!motionEnabled || !isMobileOrTablet() || !mobileFrames.length) return;
    if (Date.now() - lastMotionEventAt < 300) return; // Prefer DeviceOrientation when it exists.

    const gravity = event.accelerationIncludingGravity;
    if (!gravity) return;

    const value = typeof gravity.y === 'number' ? gravity.y : gravity.x;
    if (typeof value !== 'number') return;

    if (neutralTilt === null) neutralTilt = value;
    const delta = Math.max(-6, Math.min(6, value - neutralTilt));
    const normalized = (delta + 6) / 12;
    const index = Math.round(normalized * (FRAME_COUNT - 1));
    setMobileFrame(index);
  }

  async function requestSensorPermission() {
    // iPhone/iPad Safari can require permission for both APIs.
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      const permission = await DeviceOrientationEvent.requestPermission();
      if (permission !== 'granted') return false;
    }

    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
      const permission = await DeviceMotionEvent.requestPermission();
      if (permission !== 'granted') return false;
    }

    return true;
  }

  async function enableMotion() {
    if (!isMobileOrTablet()) return;

    if (!selectedShape || !selectedColor) {
      motionBtn.textContent = 'Select shape + colour';
      setTimeout(() => { motionBtn.textContent = motionEnabled ? 'Motion enabled' : 'Enable motion'; }, 1300);
      return;
    }

    if (!mobileFrames.length) {
      await showPreview();
      if (!mobileFrames.length) return;
    }

    motionBtn.disabled = true;
    motionBtn.textContent = 'Requesting access…';
    motionStatus.textContent = 'Waiting for the iPhone/iPad motion permission…';

    try {
      const granted = await requestSensorPermission();
      if (!granted) {
        motionBtn.disabled = false;
        motionBtn.textContent = 'Enable motion';
        motionStatus.textContent = 'Motion permission was denied. Tap Enable motion to try again.';
        return;
      }

      motionEnabled = true;
      neutralTilt = null;
      lastMotionEventAt = 0;

      if (!orientationHandlerAttached) {
        window.addEventListener('deviceorientation', handleOrientation, true);
        orientationHandlerAttached = true;
      }
      if (!motionHandlerAttached) {
        window.addEventListener('devicemotion', handleMotion, true);
        motionHandlerAttached = true;
      }

      motionBtn.textContent = 'Motion enabled';
      motionStatus.textContent = 'Motion enabled. Keep the phone/tablet in your hand and tilt it up and down slowly.';

      setTimeout(() => {
        if (motionEnabled && lastMotionEventAt === 0) {
          motionStatus.textContent = 'No motion event detected yet. On iPhone, check that Motion & Orientation Access is enabled in Safari settings.';
        }
      }, 1800);
    } catch (error) {
      motionEnabled = false;
      motionBtn.disabled = false;
      motionBtn.textContent = 'Enable motion';
      motionStatus.textContent = 'Motion could not be started. Safari/iOS may be blocking the sensor.';
    }
  }

  shapeButtons.forEach((button) => {
    button.addEventListener('click', async () => {
      shapeButtons.forEach((btn) => btn.classList.remove('active'));
      button.classList.add('active');
      selectedShape = button.dataset.shape;
      neutralTilt = null;
      await showPreview();
      if (isMobileOrTablet()) document.querySelector('.preview-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  colorOptions.forEach((option) => {
    option.addEventListener('click', async () => {
      colorOptions.forEach((color) => color.classList.remove('active'));
      option.classList.add('active');
      selectedColor = option.dataset.color;
      neutralTilt = null;
      await showPreview();
      if (isMobileOrTablet()) document.querySelector('.preview-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  resetBtn.addEventListener('click', () => {
    selectedShape = null;
    selectedColor = null;
    neutralTilt = null;
    shapeButtons.forEach((btn) => btn.classList.remove('active'));
    colorOptions.forEach((color) => color.classList.remove('active'));
    updateSelectionLabel();
    showEmpty();
    motionBtn.disabled = false;
    motionBtn.textContent = motionEnabled ? 'Motion enabled' : 'Enable motion';
    setDeviceMode();
  });

  motionBtn.addEventListener('click', enableMotion);
  MOBILE_QUERY.addEventListener?.('change', () => {
    setDeviceMode();
    showPreview();
  });

  setDeviceMode();
  updateSelectionLabel();
});
