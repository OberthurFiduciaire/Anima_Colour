document.addEventListener('DOMContentLoaded', () => {
  const shapeButtons = document.querySelectorAll('.shape-btn');
  const colorOptions = document.querySelectorAll('.color-option');
  const preview = document.getElementById('animated-preview');
  const resetBtn = document.getElementById('reset-btn');
  const motionBtn = document.getElementById('motion-permission-btn');
  const changeModeBtn = document.getElementById('change-mode-btn');
  const deviceMode = document.getElementById('device-mode');
  const selectionLabel = document.getElementById('selection-label');
  const motionStatus = document.getElementById('motion-status');
  const motionDebug = document.getElementById('motion-debug');

  const modal = document.getElementById('motion-modal');
  const modalAccept = document.getElementById('motion-modal-accept');
  const modalCancel = document.getElementById('motion-modal-cancel');

  const FRAME_COUNT = 11;
  const UPRIGHT_BETA = 80;
  const TARGET_TILT_BETA = 40;
  const DEAD_ZONE_BETA = 8;
  const FRAME_THROTTLE_MS = 55;
  const MOBILE_QUERY = window.matchMedia('(max-width: 1180px), (pointer: coarse)');

  let selectedShape = null;
  let selectedColor = null;
  let mobileFrames = [];
  let frameImageCache = [];
  let resolvedFrameCache = new Map();
  let currentIndex = Math.floor(FRAME_COUNT / 2);
  let mode = 'motion'; // 'motion' or 'gif'
  let motionEnabled = false;
  let lastFrameUpdate = 0;
  let sensorEvents = 0;
  let orientationHandlerAttached = false;
  let autoPromptShown = false;

  function isMobileOrTablet() {
    return MOBILE_QUERY.matches || 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }

  function debug(message) {
    if (motionDebug) motionDebug.textContent = message || '';
  }

  function updateButtons() {
    if (!isMobileOrTablet()) {
      motionBtn.style.display = 'none';
      changeModeBtn.style.display = 'none';
      resetBtn.style.display = 'inline-flex';
      return;
    }

    resetBtn.style.display = 'inline-flex';

    if (mode === 'gif') {
      motionBtn.style.display = 'inline-flex';
      motionBtn.textContent = 'Enable motion effect';
      changeModeBtn.style.display = 'none';
    } else {
      motionBtn.style.display = motionEnabled ? 'none' : 'inline-flex';
      motionBtn.textContent = 'Enable motion';
      changeModeBtn.style.display = 'inline-flex';
      changeModeBtn.textContent = 'Use GIF mode';
    }
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
    motionStatus.textContent = mobile
      ? 'Select a shape and colour. Choose motion effect or GIF mode.'
      : 'Desktop mode uses the animated GIF automatically.';
    updateButtons();
  }

  function desktopGifPath(shape, color) {
    return `${shape}/${color}_tr.gif`;
  }

  function desktopGifCandidates(shape, color) {
    const variants = [color, color.toUpperCase(), color.toLowerCase()];
    if (color === 'Amethyst') variants.push('Amethys', 'AMETHYS', 'amethys');

    const paths = [];
    variants.forEach((name) => {
      paths.push(`${shape}/${name}_tr.gif`);
      paths.push(`${shape}/${name}_TR.gif`);
      paths.push(`${shape}/${name}.gif`);
    });
    return [...new Set(paths)];
  }

  function setGifWithFallback(img, shape, color, onFail) {
    const candidates = desktopGifCandidates(shape, color);
    let i = 0;
    function tryNext() {
      if (i >= candidates.length) {
        if (typeof onFail === 'function') onFail();
        return;
      }
      img.src = candidates[i];
      i += 1;
    }
    img.onerror = tryNext;
    tryNext();
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
        exts.forEach((ext) => paths.push(`${shape}_telephone/${folder}/${num}.${ext}`));
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
        const valid = await loadImage(src);
        resolvedFrameCache.set(cacheKey, valid);
        return valid;
      } catch (e) {}
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
    frameImageCache = [];
    currentIndex = Math.floor(FRAME_COUNT / 2);
    motionEnabled = false;
    sensorEvents = 0;
    debug('');
    motionStatus.textContent = isMobileOrTablet()
      ? 'Select a shape and colour. Choose motion effect or GIF mode.'
      : 'Desktop mode uses the animated GIF automatically.';
    updateButtons();
  }

  function missingMobileMessage() {
    return `<div class="empty-state"><span class="preview-kicker">Missing mobile frames</span><p>Add your 11 images here:<br><strong>${selectedShape}_telephone/${selectedColor}/1.png</strong> to <strong>11.png</strong></p></div>`;
  }

  function missingDesktopMessage() {
    return `<div class="empty-state"><span class="preview-kicker">Missing GIF</span><p>Add this file:<br><strong>${desktopGifPath(selectedShape, selectedColor)}</strong></p></div>`;
  }

  function showGifMode(reason = 'GIF mode is enabled.') {
    if (!selectedShape || !selectedColor) return;

    mode = 'gif';
    motionEnabled = false;
    mobileFrames = [];
    frameImageCache = [];

    preview.className = 'animated-preview has-render';
    preview.innerHTML = `<img alt="Animated GIF ${selectedShape} ${selectedColor}" class="preview-render" draggable="false" />`;
    const img = preview.querySelector('img');
    setGifWithFallback(img, selectedShape, selectedColor, () => {
      preview.innerHTML = missingDesktopMessage();
    });

    motionStatus.textContent = reason;
    debug('GIF mode enabled.');
    updateButtons();
  }

  async function showMotionPreview() {
    if (!selectedShape || !selectedColor) {
      showEmpty();
      return;
    }

    mode = 'motion';
    preview.className = 'animated-preview has-render';

    if (!isMobileOrTablet()) {
      showGifMode('Desktop mode uses the animated GIF automatically.');
      return;
    }

    motionStatus.textContent = 'Loading mobile frames…';
    preview.innerHTML = '<div class="empty-state"><span class="preview-kicker">Loading</span><p>Preparing the 11 tilt frames…</p></div>';

    mobileFrames = await preloadMobileFrames(selectedShape, selectedColor);
    const validFrames = mobileFrames.filter(Boolean);

    if (!validFrames.length) {
      showGifMode('Mobile frames were not found. Showing animated GIF instead.');
      return;
    }

    for (let i = 0; i < mobileFrames.length; i += 1) {
      if (!mobileFrames[i]) {
        mobileFrames[i] = validFrames[Math.min(validFrames.length - 1, Math.floor(i * validFrames.length / FRAME_COUNT))];
      }
    }

    frameImageCache = mobileFrames.map((src) => {
      const image = new Image();
      image.src = src;
      return image;
    });

    currentIndex = 0;
    preview.innerHTML = `<img id="anima-effect" src="${mobileFrames[currentIndex]}" alt="${selectedShape} ${selectedColor} tilt animation" class="preview-render phone-render" draggable="false" />`;

    motionStatus.textContent = motionEnabled
      ? 'Motion effect enabled. Hold your phone upright, then tilt gently.'
      : 'Motion preview ready. Allow motion access to activate the effect.';
    debug(`${validFrames.length}/${FRAME_COUNT} mobile frames loaded.`);
    updateButtons();
  }

  async function showPreview() {
    updateSelectionLabel();

    if (!selectedShape || !selectedColor) {
      showEmpty();
      return;
    }

    if (isMobileOrTablet()) {
      if (mode === 'gif') showGifMode('GIF mode is enabled.');
      else await showMotionPreview();
    } else {
      showGifMode('Desktop mode uses the animated GIF automatically.');
    }
  }

  function setMobileFrame(index) {
    const now = performance.now();
    if (now - lastFrameUpdate < FRAME_THROTTLE_MS) return;
    lastFrameUpdate = now;

    const img = document.getElementById('anima-effect');
    if (!img || !mobileFrames.length) return;

    const safeIndex = Math.max(0, Math.min(FRAME_COUNT - 1, index));
    if (safeIndex === currentIndex) return;

    currentIndex = safeIndex;
    img.style.opacity = '0.9';
    img.src = frameImageCache[currentIndex]?.src || mobileFrames[currentIndex];
    requestAnimationFrame(() => {
      img.style.opacity = '1';
    });

    const center = (FRAME_COUNT - 1) / 2;
    const movement = currentIndex - center;
    img.style.transform = `translateY(${movement * 5}px) scale(${1 + Math.abs(movement) * 0.008})`;
  }

  function frameFromBeta(beta) {
    if (typeof beta !== 'number') return currentIndex;

    if (beta >= (UPRIGHT_BETA - DEAD_ZONE_BETA)) {
      return 0;
    }

    const start = UPRIGHT_BETA - DEAD_ZONE_BETA; // 72°
    const end = TARGET_TILT_BETA; // 40°
    const clamped = Math.max(end, Math.min(start, beta));
    const normalized = (start - clamped) / (start - end);

    return Math.round(normalized * (FRAME_COUNT - 1));
  }

  function handleOrientation(event) {
    if (!motionEnabled || mode !== 'motion' || !isMobileOrTablet() || !mobileFrames.length) return;

    const beta = typeof event.beta === 'number' ? event.beta : null;
    const gamma = typeof event.gamma === 'number' ? event.gamma : null;
    if (beta === null) return;

    sensorEvents += 1;
    setMobileFrame(frameFromBeta(beta));

    if (sensorEvents % 6 === 0) {
      debug(`Sensor OK · beta: ${beta.toFixed(1)} · gamma: ${gamma?.toFixed?.(1) ?? '-'} · frame: ${currentIndex + 1}`);
    }
  }

  async function requestSensorPermissionNow() {
    const isSecure = window.isSecureContext || location.protocol === 'https:' || location.hostname === 'localhost';

    if (!isSecure) {
      motionStatus.textContent = 'Motion needs HTTPS. Test it from the GitHub Pages link, not from a local file.';
      debug('Not a secure context: iPhone blocks motion sensors outside HTTPS.');
      return false;
    }

    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      const permission = await DeviceOrientationEvent.requestPermission();
      if (permission !== 'granted') return false;
    }

    return true;
  }

  function attachSensorHandlers() {
    if (!orientationHandlerAttached) {
      window.addEventListener('deviceorientation', handleOrientation, true);
      orientationHandlerAttached = true;
    }
  }

  async function enableMotionFromUserGesture() {
    if (!isMobileOrTablet()) return;

    if (!selectedShape || !selectedColor) {
      motionStatus.textContent = 'Select a shape and a colour first.';
      return;
    }

    mode = 'motion';
    motionBtn.disabled = true;
    motionBtn.textContent = 'Requesting access…';
    motionStatus.textContent = 'Accept the iPhone permission popup if it appears.';
    debug('Waiting for iPhone motion permission…');

    try {
      const granted = await requestSensorPermissionNow();

      if (!granted) {
        motionBtn.disabled = false;
        showGifMode('Motion permission was denied. GIF mode is enabled.');
        return;
      }

      motionEnabled = true;
      sensorEvents = 0;
      attachSensorHandlers();
      await showMotionPreview();

      motionBtn.disabled = false;
      motionStatus.textContent = 'Motion effect enabled. Hold your phone upright, then tilt gently.';
      debug('Motion effect enabled.');
      updateButtons();
    } catch (error) {
      motionBtn.disabled = false;
      showGifMode('Motion could not start. GIF mode is enabled.');
    }
  }

  function maybeAutoOpenMotionPopup() {
    if (!isMobileOrTablet()) return;
    if (autoPromptShown || mode === 'gif' || motionEnabled) return;
    if (!selectedShape || !selectedColor) return;
    autoPromptShown = true;
    setTimeout(() => openMotionModal(), 450);
  }

  shapeButtons.forEach((button) => {
    button.addEventListener('click', async () => {
      shapeButtons.forEach((btn) => btn.classList.remove('active'));
      button.classList.add('active');
      selectedShape = button.dataset.shape;
      await showPreview();
      maybeAutoOpenMotionPopup();
    });
  });

  colorOptions.forEach((option) => {
    option.addEventListener('click', async () => {
      colorOptions.forEach((color) => color.classList.remove('active'));
      option.classList.add('active');
      selectedColor = option.dataset.color;
      await showPreview();
      maybeAutoOpenMotionPopup();
    });
  });

  resetBtn.addEventListener('click', () => {
    selectedShape = null;
    selectedColor = null;
    mode = 'motion';
    motionEnabled = false;
    sensorEvents = 0;
    autoPromptShown = false;

    shapeButtons.forEach((btn) => btn.classList.remove('active'));
    colorOptions.forEach((color) => color.classList.remove('active'));

    updateSelectionLabel();
    showEmpty();
  });

  motionBtn.addEventListener('click', () => {
    if (!isMobileOrTablet()) return;

    if (!selectedShape || !selectedColor) {
      motionStatus.textContent = 'Select a shape and a colour first.';
      return;
    }

    openMotionModal();
  });

  changeModeBtn.addEventListener('click', () => {
    if (!selectedShape || !selectedColor) {
      motionStatus.textContent = 'Select a shape and a colour first.';
      return;
    }
    showGifMode('GIF mode is enabled. You can still enable motion effect later.');
  });

  modalCancel?.addEventListener('click', () => {
    closeMotionModal();
    showGifMode('GIF mode is enabled. You can still enable motion effect later.');
  });

  modalAccept?.addEventListener('click', () => {
    closeMotionModal();
    enableMotionFromUserGesture();
  });

  modal?.addEventListener('click', (event) => {
    if (event.target === modal) {
      closeMotionModal();
      showGifMode('GIF mode is enabled. You can still enable motion effect later.');
    }
  });

  if (typeof MOBILE_QUERY.addEventListener === 'function') {
    MOBILE_QUERY.addEventListener('change', () => {
      setDeviceMode();
      showPreview();
    });
  }

  setDeviceMode();
  updateSelectionLabel();
  showEmpty();
});
