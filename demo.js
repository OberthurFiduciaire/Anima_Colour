document.addEventListener('DOMContentLoaded', () => {
  const shapeButtons = document.querySelectorAll('.shape-btn');
  const colorOptions = document.querySelectorAll('.color-option');
  const preview = document.getElementById('animated-preview');
  const resetBtn = document.getElementById('reset-btn');
  const motionBtn = document.getElementById('motion-permission-btn');
  const deviceMode = document.getElementById('device-mode');
  const selectionLabel = document.getElementById('selection-label');
  const motionStatus = document.getElementById('motion-status');
  const motionDebug = document.getElementById('motion-debug');

  const modal = document.getElementById('motion-modal');
  const modalAccept = document.getElementById('motion-modal-accept');
  const modalCancel = document.getElementById('motion-modal-cancel');

  const FRAME_COUNT = 11;
  const MOBILE_QUERY = window.matchMedia('(max-width: 1180px), (pointer: coarse)');

  let selectedShape = null;
  let selectedColor = null;
  let mobileFrames = [];
  let resolvedFrameCache = new Map();
  let currentIndex = Math.floor(FRAME_COUNT / 2);
  let motionEnabled = false;
  let neutralValue = null;
  let lastFrameUpdate = 0;
  let sensorEvents = 0;
  let orientationHandlerAttached = false;
  let motionHandlerAttached = false;

  function isMobileOrTablet() {
    return MOBILE_QUERY.matches || 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }

  function debug(message) {
    if (motionDebug) motionDebug.textContent = message || '';
  }

  function openMotionModal() {
    if (!modal) {
      enableMotionFromUserGesture();
      return;
    }
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeMotionModal() {
    if (!modal) return;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  function setDeviceMode() {
    const mobile = isMobileOrTablet();
    deviceMode.textContent = mobile ? 'Mobile / tablet mode' : 'Desktop mode';
    motionBtn.style.display = mobile ? 'inline-flex' : 'none';
    motionStatus.textContent = mobile
      ? 'Select a shape and colour, tap Enable motion, allow access, then tilt your phone up and down.'
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
    const numbers = [
      String(frameNumber),
      String(frameNumber).padStart(2, '0'),
      `${color}_${frameNumber}`,
      `${color}_${String(frameNumber).padStart(2, '0')}`,
      `${color.toUpperCase()}_${frameNumber}`,
      `${color.toUpperCase()}_${String(frameNumber).padStart(2, '0')}`
    ];
    const exts = ['png', 'PNG', 'jpg', 'JPG', 'jpeg', 'JPEG', 'webp', 'WEBP'];
    const paths = [];

    folders.forEach((folder) => {
      numbers.forEach((num) => {
        exts.forEach((ext) => {
          paths.push(`${shape}_telephone/${folder}/${num}.${ext}`);
        });
      });
    });

    return [...new Set(paths)];
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
      } catch (error) {}
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
    neutralValue = null;
    debug('');
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
        debug('No mobile frame found. The gyroscope can work only if the images exist in the expected folders.');
        return;
      }

      for (let i = 0; i < mobileFrames.length; i += 1) {
        if (!mobileFrames[i]) {
          mobileFrames[i] = validFrames[Math.min(validFrames.length - 1, Math.floor(i * validFrames.length / FRAME_COUNT))];
        }
      }

      currentIndex = Math.floor(FRAME_COUNT / 2);
      neutralValue = null;
      preview.innerHTML = `<img id="anima-effect" src="${mobileFrames[currentIndex]}" alt="${selectedShape} ${selectedColor} tilt animation" class="preview-render phone-render" draggable="false" />`;

      motionBtn.disabled = false;
      motionBtn.textContent = motionEnabled ? 'Recalibrate motion' : 'Enable motion';
      motionStatus.textContent = motionEnabled
        ? 'Motion is enabled. Tilt the phone up and down. Tap again to recalibrate.'
        : 'Tap Enable motion, allow access, then tilt the phone up and down.';
      debug(`${validFrames.length}/${FRAME_COUNT} mobile frames loaded.`);
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
    img.style.transform = `translateY(${movement * 8}px) scale(${1 + Math.abs(movement) * 0.014})`;
  }

  function frameFromValue(value, center, range) {
    const delta = value - center;
    const clamped = Math.max(-range, Math.min(range, delta));
    const normalized = (clamped + range) / (range * 2);
    return Math.round(normalized * (FRAME_COUNT - 1));
  }

  function getBestTiltValue(event) {
    const beta = typeof event.beta === 'number' ? event.beta : null;
    const gamma = typeof event.gamma === 'number' ? event.gamma : null;

    const orientationAngle =
      (screen.orientation && typeof screen.orientation.angle === 'number')
        ? screen.orientation.angle
        : (typeof window.orientation === 'number' ? window.orientation : 0);

    // Portrait: beta reacts clearly to up/down tilt.
    if (Math.abs(orientationAngle) !== 90 && beta !== null) return beta;

    // Landscape: gamma is usually the useful axis.
    if (gamma !== null) return gamma;
    return beta;
  }

  function handleOrientation(event) {
    if (!motionEnabled || !isMobileOrTablet() || !mobileFrames.length) return;

    const value = getBestTiltValue(event);
    if (typeof value !== 'number') return;

    sensorEvents += 1;

    if (neutralValue === null) {
      neutralValue = value;
      motionStatus.textContent = 'Motion enabled. Tilt up and down slowly.';
    }

    const frame = frameFromValue(value, neutralValue, 14);
    setMobileFrame(frame);

    if (sensorEvents % 8 === 0) {
      debug(`Sensor OK · beta: ${event.beta?.toFixed?.(1) ?? '-'} · gamma: ${event.gamma?.toFixed?.(1) ?? '-'} · frame: ${currentIndex + 1}`);
    }
  }

  function handleMotion(event) {
    if (!motionEnabled || !isMobileOrTablet() || !mobileFrames.length) return;

    // Fallback when deviceorientation is silent.
    if (sensorEvents > 0) return;

    const gravity = event.accelerationIncludingGravity;
    if (!gravity) return;

    const value = typeof gravity.y === 'number' ? gravity.y : gravity.x;
    if (typeof value !== 'number') return;

    sensorEvents += 1;

    if (neutralValue === null) {
      neutralValue = value;
      motionStatus.textContent = 'Motion enabled. Tilt up and down slowly.';
    }

    const frame = frameFromValue(value, neutralValue, 3);
    setMobileFrame(frame);

    if (sensorEvents % 8 === 0) {
      debug(`Motion sensor OK · value: ${value.toFixed(2)} · frame: ${currentIndex + 1}`);
    }
  }

  async function requestSensorPermissionNow() {
    const isSecure = window.isSecureContext || location.protocol === 'https:' || location.hostname === 'localhost';

    if (!isSecure) {
      motionStatus.textContent = 'Motion needs HTTPS. Test it from the GitHub Pages link, not from a local file.';
      debug('Not a secure context: iPhone blocks motion sensors outside HTTPS.');
      return false;
    }

    // IMPORTANT: On iPhone this function must be called directly from the button click.
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      const permission = await DeviceOrientationEvent.requestPermission();
      if (permission !== 'granted') return false;
    }

    // Do not block everything if DeviceMotionEvent fails. Orientation is enough.
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
      try {
        await DeviceMotionEvent.requestPermission();
      } catch (error) {}
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

  async function enableMotionFromUserGesture() {
    if (!isMobileOrTablet()) return;

    if (!selectedShape || !selectedColor) {
      motionBtn.textContent = 'Select shape + colour';
      motionStatus.textContent = 'Select a shape and a colour before enabling motion.';
      setTimeout(() => {
        motionBtn.textContent = motionEnabled ? 'Recalibrate motion' : 'Enable motion';
      }, 1300);
      return;
    }

    motionBtn.disabled = true;
    motionBtn.textContent = 'Requesting access…';
    motionStatus.textContent = 'Accept the iPhone permission popup if it appears.';
    debug('Waiting for iPhone motion permission…');

    try {
      // Permission is requested BEFORE loading images, so iPhone keeps the user gesture.
      const granted = await requestSensorPermissionNow();

      if (!granted) {
        motionEnabled = false;
        motionBtn.disabled = false;
        motionBtn.textContent = 'Enable motion';
        motionStatus.textContent = 'Motion permission was denied or blocked.';
        debug('On iPhone: Settings > Safari > Motion & Orientation Access must be enabled.');
        return;
      }

      motionEnabled = true;
      neutralValue = null;
      sensorEvents = 0;
      attachSensorHandlers();

      if (!mobileFrames.length) {
        await showPreview();
      }

      motionBtn.disabled = false;
      motionBtn.textContent = 'Recalibrate motion';
      motionStatus.textContent = 'Motion enabled. Hold the phone normally, then tilt up and down slowly.';
      debug('Permission granted. Waiting for sensor movement…');

      // Force the image to the middle at start.
      setMobileFrame(Math.floor(FRAME_COUNT / 2));

      setTimeout(() => {
        if (motionEnabled && sensorEvents === 0) {
          motionStatus.textContent = 'Permission is OK, but no sensor data arrived.';
          debug('On iPhone, check: Settings > Safari > Motion & Orientation Access. Also test in Safari, not inside another app preview.');
        }
      }, 2500);
    } catch (error) {
      motionEnabled = false;
      motionBtn.disabled = false;
      motionBtn.textContent = 'Enable motion';
      motionStatus.textContent = 'Motion could not start.';
      debug('iPhone may block the sensor if the permission request is not triggered directly by the Allow button.');
    }
  }

  shapeButtons.forEach((button) => {
    button.addEventListener('click', async () => {
      shapeButtons.forEach((btn) => btn.classList.remove('active'));
      button.classList.add('active');
      selectedShape = button.dataset.shape;
      neutralValue = null;
      await showPreview();
    });
  });

  colorOptions.forEach((option) => {
    option.addEventListener('click', async () => {
      colorOptions.forEach((color) => color.classList.remove('active'));
      option.classList.add('active');
      selectedColor = option.dataset.color;
      neutralValue = null;
      await showPreview();
    });
  });

  resetBtn.addEventListener('click', () => {
    selectedShape = null;
    selectedColor = null;
    neutralValue = null;
    motionEnabled = false;
    sensorEvents = 0;
    shapeButtons.forEach((btn) => btn.classList.remove('active'));
    colorOptions.forEach((color) => color.classList.remove('active'));
    updateSelectionLabel();
    showEmpty();
    motionBtn.disabled = false;
    motionBtn.textContent = 'Enable motion';
    setDeviceMode();
  });

  motionBtn.addEventListener('click', () => {
    if (!isMobileOrTablet()) return;

    if (!selectedShape || !selectedColor) {
      enableMotionFromUserGesture();
      return;
    }

    openMotionModal();
  });

  modalCancel?.addEventListener('click', closeMotionModal);

  modalAccept?.addEventListener('click', () => {
    closeMotionModal();
    enableMotionFromUserGesture();
  });

  modal?.addEventListener('click', (event) => {
    if (event.target === modal) closeMotionModal();
  });

  if (typeof MOBILE_QUERY.addEventListener === 'function') {
    MOBILE_QUERY.addEventListener('change', () => {
      setDeviceMode();
      showPreview();
    });
  }

  setDeviceMode();
  updateSelectionLabel();
});
