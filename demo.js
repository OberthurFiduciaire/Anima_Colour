document.addEventListener('DOMContentLoaded', () => {
  const shapeButtons = document.querySelectorAll('.shape-btn');
  const colorOptions = document.querySelectorAll('.color-option');
  const preview = document.getElementById('animated-preview');
  const resetBtn = document.getElementById('reset-btn');
  const motionBtn = document.getElementById('motion-permission-btn');
  const deviceMode = document.getElementById('device-mode');
  const selectionLabel = document.getElementById('selection-label');

  let selectedShape = null;
  let selectedColor = null;
  let mobileFrames = [];
  let currentIndex = 0;
  let motionEnabled = false;
  let lastFrameUpdate = 0;

  const SHAPES = ['Butterfly', 'Switch'];
  const COLORS = ['Emerald', 'Tourmaline', 'Citrine', 'Topaz', 'Ruby', 'Sapphire', 'Amethyst', 'Aquamarine'];
  const FRAME_COUNT = 11;

  const isMobile =
    window.matchMedia('(max-width: 760px)').matches ||
    window.matchMedia('(pointer: coarse)').matches ||
    'ontouchstart' in window;

  function setDeviceMode() {
    deviceMode.textContent = isMobile ? 'Mode téléphone' : 'Mode ordinateur';
    motionBtn.style.display = isMobile ? 'inline-flex' : 'none';
  }

  function desktopGifPath(shape, color) {
    return `${shape}/${color}_tr.gif`;
  }

  function framePaths(shape, color) {
    return Array.from(
      { length: FRAME_COUNT },
      (_, index) => `${shape}_telephone/${color}/${index + 1}.png`
    );
  }

  function preload(paths) {
    paths.forEach((src) => {
      const img = new Image();
      img.src = src;
    });
  }

  function updateSelectionLabel() {
    if (!selectedShape && !selectedColor) {
      selectionLabel.textContent = 'Aucune sélection';
      return;
    }
    selectionLabel.textContent = `${selectedShape || 'Forme'} · ${selectedColor || 'Couleur'}`;
  }

  function showEmpty() {
    preview.className = 'animated-preview empty-state';
    preview.innerHTML = `
      <span class="preview-kicker">Aperçu</span>
      <p>Sélectionnez une forme et une couleur pour voir l’animation.</p>
    `;
    mobileFrames = [];
    currentIndex = 0;
  }

  function showPreview() {
    updateSelectionLabel();

    if (!selectedShape || !selectedColor) {
      showEmpty();
      return;
    }

    preview.className = 'animated-preview has-render';

    if (isMobile) {
      mobileFrames = framePaths(selectedShape, selectedColor);
      preload(mobileFrames);
      currentIndex = Math.floor(mobileFrames.length / 2);

      preview.innerHTML = `
        <img
          id="anima-effect"
          src="${mobileFrames[currentIndex]}"
          alt="Animation ${selectedShape} ${selectedColor}"
          class="preview-render phone-render"
          draggable="false"
        />
      `;

      motionBtn.style.display = 'inline-flex';
      motionBtn.disabled = motionEnabled;
      motionBtn.textContent = motionEnabled ? 'Mouvement activé' : 'Activer le mouvement';
      return;
    }

    mobileFrames = [];
    preview.innerHTML = `
      <img
        src="${desktopGifPath(selectedShape, selectedColor)}"
        alt="GIF animé ${selectedShape} ${selectedColor}"
        class="preview-render"
        draggable="false"
      />
    `;
  }

  function setMobileFrame(index) {
    const now = Date.now();
    if (now - lastFrameUpdate < 35) return;
    lastFrameUpdate = now;

    const img = document.getElementById('anima-effect');
    if (!img || !mobileFrames.length) return;

    const safeIndex = Math.max(0, Math.min(mobileFrames.length - 1, index));
    if (safeIndex === currentIndex) return;

    currentIndex = safeIndex;
    img.src = mobileFrames[currentIndex];

    const center = (mobileFrames.length - 1) / 2;
    const movement = currentIndex - center;
    img.style.transform = `translateY(${movement * 1.15}px) scale(${1 + Math.abs(movement) * 0.002})`;
  }

  function handleOrientation(event) {
    if (!isMobile || !mobileFrames.length) return;

    const beta = event.beta;
    if (beta === null || typeof beta === 'undefined') return;

    // On utilise uniquement l’inclinaison haut/bas du téléphone.
    const minAngle = 20;
    const maxAngle = 80;
    const clamped = Math.max(minAngle, Math.min(maxAngle, beta));
    const normalized = (clamped - minAngle) / (maxAngle - minAngle);
    const index = Math.round(normalized * (mobileFrames.length - 1));

    setMobileFrame(index);
  }

  async function enableMotion() {
    if (!isMobile) return;

    if (!selectedShape || !selectedColor) {
      motionBtn.textContent = 'Choisis une forme + couleur';
      setTimeout(() => {
        motionBtn.textContent = motionEnabled ? 'Mouvement activé' : 'Activer le mouvement';
      }, 1500);
      return;
    }

    try {
      // Obligatoire sur iPhone / iPad récents.
      if (
        typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function'
      ) {
        const permission = await DeviceOrientationEvent.requestPermission();
        if (permission !== 'granted') {
          motionBtn.textContent = 'Autorisation refusée';
          return;
        }
      }

      if (!motionEnabled) {
        window.addEventListener('deviceorientation', handleOrientation, true);
        motionEnabled = true;
      }

      motionBtn.textContent = 'Mouvement activé';
      motionBtn.disabled = true;
    } catch (error) {
      motionBtn.textContent = 'Mouvement indisponible';
    }
  }

  shapeButtons.forEach((button) => {
    button.addEventListener('click', () => {
      shapeButtons.forEach((btn) => btn.classList.remove('active'));
      button.classList.add('active');
      selectedShape = button.dataset.shape;
      showPreview();
    });
  });

  colorOptions.forEach((option) => {
    option.addEventListener('click', () => {
      colorOptions.forEach((color) => color.classList.remove('active'));
      option.classList.add('active');
      selectedColor = option.dataset.color;
      showPreview();
    });
  });

  resetBtn.addEventListener('click', () => {
    selectedShape = null;
    selectedColor = null;
    shapeButtons.forEach((btn) => btn.classList.remove('active'));
    colorOptions.forEach((color) => color.classList.remove('active'));
    updateSelectionLabel();
    showEmpty();

    if (isMobile) {
      motionBtn.textContent = motionEnabled ? 'Mouvement activé' : 'Activer le mouvement';
      motionBtn.disabled = motionEnabled;
    }
  });

  motionBtn.addEventListener('click', enableMotion);

  setDeviceMode();
  updateSelectionLabel();
});
