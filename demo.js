document.addEventListener('DOMContentLoaded', () => {
  const shapeButtons = document.querySelectorAll('.shape-btn');
  const colorOptions = document.querySelectorAll('.color-option');
  const preview = document.getElementById('animated-preview');
  const resetBtn = document.getElementById('reset-btn');
  const motionBtn = document.getElementById('motion-permission-btn');
  const deviceMode = document.getElementById('device-mode');
  const selectionLabel = document.getElementById('selection-label');

  const FRAME_COUNT = 11;
  const MOBILE_BREAKPOINT = window.matchMedia('(max-width: 1180px)');
  const TOUCH_DEVICE = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  const isMobileOrTablet = MOBILE_BREAKPOINT.matches || TOUCH_DEVICE;

  let selectedShape = null;
  let selectedColor = null;
  let mobileFrames = [];
  let currentIndex = 5;
  let motionEnabled = false;
  let lastFrameUpdate = 0;
  let neutralBeta = null;

  function setDeviceMode() {
    deviceMode.textContent = isMobileOrTablet ? 'Mobile / tablet mode' : 'Desktop mode';
    motionBtn.style.display = isMobileOrTablet ? 'inline-flex' : 'none';
  }

  function desktopGifPath(shape, color) {
    return `${shape}/${color}_tr.gif`;
  }

  function framePaths(shape, color) {
    return Array.from({ length: FRAME_COUNT }, (_, i) => `${shape}_telephone/${color}/${i + 1}.png`);
  }

  function preload(paths) {
    paths.forEach((src) => {
      const img = new Image();
      img.src = src;
    });
  }

  function updateSelectionLabel() {
    selectionLabel.textContent = selectedShape && selectedColor ? `${selectedShape} · ${selectedColor}` : 'No selection';
  }

  function showEmpty() {
    preview.className = 'animated-preview empty-state';
    preview.innerHTML = '<span class="preview-kicker">Preview</span><p>Select a shape and a colour to see the animation.</p>';
    mobileFrames = [];
    currentIndex = 5;
    neutralBeta = null;
  }

  function showMissingNote(kind) {
    return `<p class="fallback-note">${kind} not found yet. Add the files with the exact folder names shown in your project.</p>`;
  }

  function showPreview() {
    updateSelectionLabel();
    if (!selectedShape || !selectedColor) {
      showEmpty();
      return;
    }

    preview.className = 'animated-preview has-render';

    if (isMobileOrTablet) {
      mobileFrames = framePaths(selectedShape, selectedColor);
      preload(mobileFrames);
      currentIndex = Math.floor(FRAME_COUNT / 2);
      preview.innerHTML = `
        <img id="anima-effect" src="${mobileFrames[currentIndex]}" alt="${selectedShape} ${selectedColor} tilt animation" class="preview-render phone-render" draggable="false" />
      `;
      const img = document.getElementById('anima-effect');
      img.onerror = () => {
        img.onerror = null;
        img.src = desktopGifPath(selectedShape, selectedColor);
        preview.insertAdjacentHTML('beforeend', showMissingNote('Mobile frames'));
      };
      motionBtn.style.display = 'inline-flex';
      motionBtn.disabled = motionEnabled;
      motionBtn.textContent = motionEnabled ? 'Motion enabled' : 'Enable motion';
      return;
    }

    mobileFrames = [];
    preview.innerHTML = `
      <img src="${desktopGifPath(selectedShape, selectedColor)}" alt="Animated GIF ${selectedShape} ${selectedColor}" class="preview-render" draggable="false" />
    `;
    const img = preview.querySelector('img');
    img.onerror = () => {
      preview.innerHTML = `<div class="empty-state"><span class="preview-kicker">Missing GIF</span><p>Add ${desktopGifPath(selectedShape, selectedColor)} to your project.</p></div>`;
    };
  }

  function setMobileFrame(index) {
    const now = Date.now();
    if (now - lastFrameUpdate < 24) return;
    lastFrameUpdate = now;

    const img = document.getElementById('anima-effect');
    if (!img || !mobileFrames.length) return;

    const safeIndex = Math.max(0, Math.min(mobileFrames.length - 1, index));
    if (safeIndex === currentIndex) return;

    currentIndex = safeIndex;
    img.src = mobileFrames[currentIndex];
    const center = (mobileFrames.length - 1) / 2;
    const movement = currentIndex - center;
    img.style.transform = `translateY(${movement * 1.3}px) scale(${1 + Math.abs(movement) * 0.002})`;
  }

  function handleOrientation(event) {
    if (!isMobileOrTablet || !mobileFrames.length) return;
    const beta = event.beta;
    if (beta === null || typeof beta === 'undefined') return;

    if (neutralBeta === null) neutralBeta = beta;

    // Haut/bas uniquement : on compare l'inclinaison actuelle à la position de départ.
    const delta = Math.max(-35, Math.min(35, beta - neutralBeta));
    const normalized = (delta + 35) / 70;
    const index = Math.round(normalized * (FRAME_COUNT - 1));
    setMobileFrame(index);
  }

  async function enableMotion() {
    if (!isMobileOrTablet) return;

    if (!selectedShape || !selectedColor) {
      motionBtn.textContent = 'Select shape + colour';
      setTimeout(() => { motionBtn.textContent = motionEnabled ? 'Motion enabled' : 'Enable motion'; }, 1400);
      return;
    }

    try {
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        const permission = await DeviceOrientationEvent.requestPermission();
        if (permission !== 'granted') {
          motionBtn.textContent = 'Permission denied';
          return;
        }
      }

      if (!motionEnabled) {
        window.addEventListener('deviceorientation', handleOrientation, true);
        motionEnabled = true;
      }
      neutralBeta = null;
      motionBtn.textContent = 'Motion enabled';
      motionBtn.disabled = true;
    } catch (error) {
      motionBtn.textContent = 'Motion unavailable';
    }
  }

  shapeButtons.forEach((button) => {
    button.addEventListener('click', () => {
      shapeButtons.forEach((btn) => btn.classList.remove('active'));
      button.classList.add('active');
      selectedShape = button.dataset.shape;
      neutralBeta = null;
      showPreview();
      if (isMobileOrTablet) document.querySelector('.preview-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  colorOptions.forEach((option) => {
    option.addEventListener('click', () => {
      colorOptions.forEach((color) => color.classList.remove('active'));
      option.classList.add('active');
      selectedColor = option.dataset.color;
      neutralBeta = null;
      showPreview();
      if (isMobileOrTablet) document.querySelector('.preview-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  resetBtn.addEventListener('click', () => {
    selectedShape = null;
    selectedColor = null;
    neutralBeta = null;
    shapeButtons.forEach((btn) => btn.classList.remove('active'));
    colorOptions.forEach((color) => color.classList.remove('active'));
    updateSelectionLabel();
    showEmpty();
    motionBtn.textContent = motionEnabled ? 'Motion enabled' : 'Enable motion';
    motionBtn.disabled = motionEnabled;
  });

  motionBtn.addEventListener('click', enableMotion);
  setDeviceMode();
  updateSelectionLabel();
});
