// Cooking GPS — Core Application Script
import { signIn, signUp, signOut, onAuthChange, getPublicRecipes, uploadVideo, createRecipe, getCurrentUser } from './supabase-client.js';

// 1. RECIPE & TIMELINE STATE STATE
const recipeData = {
  title: "Spicy Thai Basil Chicken",
  duration: 360, // 6 minutes (in seconds)
  loops: [0, 75, 165, 250, 310, 360], // step boundaries in seconds
  steps: [
    {
      title: "Prep & Chop",
      instruction: "Finely mince the garlic and Thai bird's eye chilies together. Slice the chicken breasts into thin, bite-sized pieces. Pluck the fresh holy basil leaves from their stems and set aside.",
      subLoops: [15, 45, 60]
    },
    {
      title: "Sear the Chicken",
      instruction: "Heat 1 tbsp of oil in a wok or large skillet over high heat. Add the chicken slices, spreading them evenly. Sear for 2-3 minutes without moving, until a golden crust forms on the bottom.",
      subLoops: [95, 120, 145]
    },
    {
      title: "Stir Fry Aromatics",
      instruction: "Push the chicken to the side. Toss in the minced garlic and chilies into the center. Stir-fry rapidly for 30 seconds until highly fragrant. Do not let the garlic burn.",
      subLoops: [180, 210, 235]
    },
    {
      title: "Toss in Savory Sauce",
      instruction: "Drizzle in the soy sauce, oyster sauce, fish sauce, and a pinch of brown sugar. Stir-fry everything together rapidly, tossing the chicken to coat completely in the bubbling glaze.",
      subLoops: [270, 290]
    },
    {
      title: "Basil Finish & Plate",
      instruction: "Turn off the stove. Throw in the fresh basil leaves. Toss continuously for 30 seconds until the leaves wilt from the residual heat. Transfer to a plate and serve with jasmine rice.",
      subLoops: [330, 345]
    }
  ]
};

// Helper to update a Lucide icon dynamically by replacing the element
function updateLucideIcon(id, newIconName, width = '15px', height = '15px') {
  const oldIcon = document.getElementById(id);
  if (!oldIcon) return;
  const newIcon = document.createElement('i');
  newIcon.id = id;
  newIcon.setAttribute('data-lucide', newIconName);
  newIcon.style.width = width;
  newIcon.style.height = height;
  oldIcon.parentNode.replaceChild(newIcon, oldIcon);
  if (window.lucide) {
    lucide.createIcons();
  }
}

// Application UI States
let currentUser = null;
let authMode = 'signin'; // 'signin' or 'signup'
let currentView = 'create';
let playerPreviousView = 'create';
let playbackMode = 'loop';
let isPlaying = false;
let currentTime = 0.0;
let activeStepIndex = 0;
let isScrollingAuto = false;
let editingRecipeId = null;
let playerCurrentRecipe = null;
window.getPlayerCurrentRecipe = () => playerCurrentRecipe;
window.setPlayerCurrentRecipe = (val) => { playerCurrentRecipe = val; };
let playerCompletedSteps = new Set();
let currentSpeechActive = false;
let undoHistory = [];
let redoHistory = [];

// Drag and drop states for Bento Grid
let isBentoEditing = false;

// Speech Recognition Objects
let recognition = null;
let speechTimeout = null;

// Animation/Canvas contexts
let canvasMobile = null;
let ctxMobile = null;
let canvasDesktop = null;
let ctxDesktop = null;
let animFrameId = null;

// Sizzle animations particles for canvas
let particles = [];

// Helper to enable smooth click-and-drag horizontal scrolling on desktop viewports
function enableDragToScroll(el) {
  if (!el) return;
  let isDown = false;
  let startX;
  let scrollLeft;
  let hasMoved = false;

  el.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return; // Left click only
    if (el.id === 'playerMultigridDescriptions' && typeof playerDescLayoutMode !== 'undefined' && playerDescLayoutMode !== 'row') return;
    isDown = true;
    hasMoved = false;
    startX = e.pageX - el.offsetLeft;
    scrollLeft = el.scrollLeft;
    el.style.cursor = 'grabbing';
    el.style.userSelect = 'none';
  });

  el.addEventListener('mouseleave', () => {
    isDown = false;
    el.style.cursor = 'grab';
    el.style.removeProperty('user-select');
  });

  el.addEventListener('mouseup', () => {
    isDown = false;
    el.style.cursor = 'grab';
    el.style.removeProperty('user-select');
  });

  el.addEventListener('mousemove', (e) => {
    if (!isDown) return;
    const x = e.pageX - el.offsetLeft;
    const walk = (x - startX) * 1.5;
    if (Math.abs(walk) > 3) {
      hasMoved = true;
      e.preventDefault();
      el.scrollLeft = scrollLeft - walk;
    }
  });

  el.addEventListener('click', (e) => {
    if (hasMoved) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);

  el.style.cursor = 'grab';
}

// Helper to enable horizontal touch swiping on active step cards to switch steps
function initActiveStepCardSwiping() {
  const cards = document.querySelectorAll('.step-card-active');
  cards.forEach(card => {
    if (card.dataset.swipeListenerAdded) return;
    
    let startX = 0;
    let startY = 0;
    let startTime = 0;
    
    card.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      startTime = Date.now();
    }, { passive: true });
    
    card.addEventListener('touchmove', (e) => {
      if (e.touches.length !== 1) return;
      const diffX = e.touches[0].clientX - startX;
      const diffY = e.touches[0].clientY - startY;
      
      // If horizontal movement is greater than vertical movement, prevent scrolling the page
      if (Math.abs(diffX) > Math.abs(diffY)) {
        if (e.cancelable) e.preventDefault();
      }
    }, { passive: false });
    
    card.addEventListener('touchend', (e) => {
      if (e.changedTouches.length !== 1) return;
      const diffX = e.changedTouches[0].clientX - startX;
      const diffY = e.changedTouches[0].clientY - startY;
      const elapsedTime = Date.now() - startTime;
      
      const threshold = 50; // min distance in px for horizontal swipe
      const verticalLimit = 80; // max allowed vertical deviation in px
      const timeLimit = 350; // max allowed time in ms
      
      if (Math.abs(diffX) >= threshold && Math.abs(diffY) <= verticalLimit && elapsedTime <= timeLimit) {
        if (diffX < 0) {
          // Swipe Left: Next Step
          if (typeof window.desktopPlayerNext === 'function') {
            window.desktopPlayerNext();
          }
        } else {
          // Swipe Right: Prev Step
          if (typeof window.desktopPlayerPrev === 'function') {
            window.desktopPlayerPrev();
          }
        }
      }
    }, { passive: true });
    
    card.dataset.swipeListenerAdded = 'true';
    card.style.touchAction = 'pan-y';
  });
}

// Initialize App
async function initializeApp() {
  canvasMobile = document.getElementById('mobileVideoCanvas');
  ctxMobile = canvasMobile ? canvasMobile.getContext('2d') : null;
  canvasDesktop = document.getElementById('desktopVideoCanvas');
  ctxDesktop = canvasDesktop ? canvasDesktop.getContext('2d') : null;
  
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  
  if (typeof window.setupResponsiveDrawers === 'function') {
    window.setupResponsiveDrawers();
    window.addEventListener('resize', window.setupResponsiveDrawers);
  }
  
  loadPlayerProgress(activePlayerRecipeId || 'local_default');
  renderStepChipsMobile();
  renderStepCardsMobile();
  initStepCardsSliderScroll();
  renderTimelineMarkersDesktop();
  renderStepListDesktop();
  startVideoSimulation();
  updateDetailFields();
  setupSpeechRecognition();
  setupDashboardTimer();

  // Initialize muted state based on preference
  const isMutedPref = localStorage.getItem('cooking_gps_player_muted') === 'true';
  const initVideo = document.getElementById('mobileRealVideo');
  if (initVideo) {
    initVideo.muted = isMutedPref;
    initVideo.addEventListener('timeupdate', () => {
      const segments = (recipeData && recipeData.text_overlays) || [];
      window.updateSubtitles(initVideo, 'playerSubtitleOverlay', segments);
    });

    // Dynamically adjust player video container aspect ratio to prevent side panels
    initVideo.addEventListener('loadedmetadata', () => {
      const container = document.querySelector('.mobile-video-container');
      const placeholder = document.querySelector('.mobile-video-placeholder');
      if (initVideo.videoWidth && initVideo.videoHeight) {
        const arStr = `${initVideo.videoWidth} / ${initVideo.videoHeight}`;
        const isPortrait = initVideo.videoHeight > initVideo.videoWidth;

        if (container) {
          container.style.setProperty('aspect-ratio', arStr, 'important');
          if (isPortrait) {
            container.style.setProperty('height', 'min(480px, 50vh)', 'important');
            container.style.setProperty('width', 'auto', 'important');
            container.style.setProperty('margin', '0 auto', 'important');
          } else {
            container.style.setProperty('width', '100%', 'important');
            container.style.setProperty('height', 'auto', 'important');
            container.style.removeProperty('margin');
          }
        }
        if (placeholder) {
          placeholder.style.setProperty('aspect-ratio', arStr, 'important');
          if (isPortrait) {
            placeholder.style.setProperty('height', '100%', 'important');
            placeholder.style.setProperty('width', 'auto', 'important');
            placeholder.style.setProperty('margin', '0 auto', 'important');
          } else {
            placeholder.style.setProperty('width', '100%', 'important');
            placeholder.style.setProperty('height', '100%', 'important');
            placeholder.style.removeProperty('margin');
          }
        }
      }
    });
  }
  if (typeof updateMuteUI === 'function') {
    updateMuteUI();
  }

  // Enable drag-to-scroll on multigrid descriptions horizontal container
  const multigridDescContainer = document.getElementById('playerMultigridDescriptions');
  if (multigridDescContainer) {
    enableDragToScroll(multigridDescContainer);
  }

  // Enable drag-to-scroll on editor mobile controls containers
  const videoControls = document.getElementById('videoOverlayControls');
  if (videoControls) {
    enableDragToScroll(videoControls);
  }
  const stepNavControls = document.getElementById('stepNavControlsRow');
  if (stepNavControls) {
    enableDragToScroll(stepNavControls);
  }

  // Update keyboard navigation buttons when seek amount is changed
  const seekSelect = document.getElementById('seekStepSelect');
  if (seekSelect) {
    seekSelect.addEventListener('change', () => {
      window.setKeyboardMode(keyboardMode);
    });
  }

  // Catch video loading/playback errors (e.g., expired local blob URLs)
  const realVideo = document.getElementById('mobileRealVideo');
  if (realVideo) {
    realVideo.addEventListener('error', () => {
      console.warn('[Player] Video failed to load source:', realVideo.src);
      const src = realVideo.src || '';
      
      const errorOverlay = document.getElementById('videoErrorOverlay');
      const errorOverlayMsg = document.getElementById('videoErrorOverlayMsg');
      if (errorOverlay) {
        errorOverlay.style.display = 'flex';
        if (errorOverlayMsg) {
          if (src.startsWith('blob:')) {
            errorOverlayMsg.textContent = 'This video was saved as a temporary local preview and has expired. Please edit the recipe to upload the video file permanently.';
          } else if (src) {
            errorOverlayMsg.textContent = 'Could not load the video file. Please check your internet connection or verify the URL.';
          }
        }
        if (window.lucide) {
          lucide.createIcons();
        }
      }

      if (src.startsWith('blob:')) {
        showTip('⚠️ This video was saved locally in your browser and has expired. Please re-upload it.');
      } else if (src) {
        showTip('⚠️ Video file could not be loaded. Please ensure it has uploaded fully.');
      }
    });
  }

  // 🔌 Connect to Supabase
  await initSupabase();

  let startView = window.location.hash.replace('#', '') || '';
  let startRecipeId = null;
  if (startView.includes('?')) {
    const parts = startView.split('?');
    startView = parts[0];
    const params = new URLSearchParams(parts[1]);
    startRecipeId = params.get('id') || params.get('recipeId');
  }
  const validViews = ['create', 'discover', 'grid-view', 'profile', 'my-profile', 'mobile-player', 'bento-dashboard', 'desktop-workbench'];
  if (!validViews.includes(startView)) {
    startView = localStorage.getItem('cooking_gps_landing_view') || 'create';
  }
  switchView(startView);

  if (startView === 'mobile-player') {
    const activeId = startRecipeId || localStorage.getItem('cooking_gps_active_recipe_id');
    if (activeId) {
      window.loadRecipeById(activeId);
    }
  }
  
  // Set select input value in UI if it exists
  const landingSelect = document.getElementById('defaultLandingViewSelect');
  if (landingSelect) {
    const defaultPref = localStorage.getItem('cooking_gps_landing_view') || 'create';
    landingSelect.value = defaultPref;
  }
  setupWorkbenchResizer();
  
  // Wire updateAIChecklists to ingredientsText input edits
  const ingTextEl = document.getElementById('ingredientsText');
  if (ingTextEl) {
    ingTextEl.addEventListener('input', window.updateAIChecklists);
  }

  // Handle browser back/forward navigation using hashchange listener
  window.addEventListener('hashchange', () => {
    let targetView = window.location.hash.replace('#', '') || '';
    let targetRecipeId = null;
    if (targetView.includes('?')) {
      const parts = targetView.split('?');
      targetView = parts[0];
      const params = new URLSearchParams(parts[1]);
      targetRecipeId = params.get('id') || params.get('recipeId');
    }
    const validViews = ['create', 'discover', 'grid-view', 'profile', 'my-profile', 'mobile-player', 'bento-dashboard', 'desktop-workbench'];
    if (validViews.includes(targetView) && targetView !== currentView) {
      switchView(targetView);
      if (targetView === 'mobile-player' && targetRecipeId) {
        window.loadRecipeById(targetRecipeId);
      }
    }
  });
  window.updateAIChecklists();
  window.setKeyboardMode(keyboardMode);
}

// App execution trigger moved to the bottom of the file to prevent Temporal Dead Zone (TDZ) reference errors

function resizeCanvas() {
  if (canvasMobile) {
    canvasMobile.width = canvasMobile.clientWidth * window.devicePixelRatio;
    canvasMobile.height = canvasMobile.clientHeight * window.devicePixelRatio;
  }
  if (canvasDesktop) {
    canvasDesktop.width = canvasDesktop.clientWidth * window.devicePixelRatio;
    canvasDesktop.height = canvasDesktop.clientHeight * window.devicePixelRatio;
  }
}

// ----------------------------------------------------
// PLAYBACK LOGIC & SIMULATOR ENGINE (THE GPS CORE)
// ----------------------------------------------------
function startVideoSimulation() {
  let lastTime = performance.now();
  
  function update(time) {
    const delta = (time - lastTime) / 1000;
    lastTime = time;
    
    const realVideo = document.getElementById('mobileRealVideo');
    const isRealVideoActive = realVideo && realVideo.style.display !== 'none';

    if (isRealVideoActive) {
      if (isPlaying) {
        if (realVideo.paused) {
          realVideo.play().catch((err) => {
            console.warn('[Player] Unmuted playback blocked in simulation, retrying muted:', err);
            realVideo.muted = true;
            if (typeof updateMuteUI === 'function') updateMuteUI();
            realVideo.play().catch((e) => {
              console.error('[Player] Muted playback in simulation also failed:', e);
              isPlaying = false;
              updateControlsUI();
            });
          });
        }
        if (Math.abs(realVideo.currentTime - currentTime) > 0.5) {
          realVideo.currentTime = currentTime;
        } else {
          currentTime = realVideo.currentTime;
        }
      } else {
        if (!realVideo.paused) {
          realVideo.pause();
        }
        if (Math.abs(realVideo.currentTime - currentTime) > 0.3) {
          realVideo.currentTime = currentTime;
        }
      }

      const stepStart = recipeData.loops[activeStepIndex] || 0;
      const stepEnd   = recipeData.loops[activeStepIndex + 1] || recipeData.duration;

      if (playbackMode === 'loop') {
        if (currentTime >= stepEnd) {
          currentTime = stepStart;
          realVideo.currentTime = stepStart;
        }
      } else if (playbackMode === 'wait') {
        if (currentTime >= stepEnd) {
          currentTime = stepEnd;
          realVideo.currentTime = stepEnd;
          isPlaying = false;
          realVideo.pause();
          speakFeedback("Step completed. Waiting.");
          updateControlsUI();
        }
      } else if (playbackMode === 'continuous') {
        if (currentTime >= stepEnd) {
          if (activeStepIndex < recipeData.steps.length - 1) {
            activeStepIndex++;
            speakFeedback("Advancing to " + recipeData.steps[activeStepIndex].title);
            updateStepDetailsUI();
          } else {
            currentTime = stepEnd;
            realVideo.currentTime = stepEnd;
            isPlaying = false;
            realVideo.pause();
            updateControlsUI();
          }
        }
      }

      if (currentTime >= recipeData.duration) {
        currentTime = recipeData.duration;
        realVideo.currentTime = recipeData.duration;
        isPlaying = false;
        realVideo.pause();
        updateControlsUI();
      }
    } else {
      if (isPlaying) {
        // Apply play speed
        const speed = currentView === 'mobile-player' ? (window.playerPlaybackSpeed || 1.0) : parseFloat(document.getElementById('activeSpeedBadge').innerText) || 1.0;
        currentTime += delta * speed;
        
        const stepStart = recipeData.loops[activeStepIndex];
        const stepEnd = recipeData.loops[activeStepIndex + 1];
        
        // CRITICAL GPS BEHAVIOR IMPLEMENTATION
        if (playbackMode === 'loop') {
          if (currentTime >= stepEnd) {
            currentTime = stepStart; // jump back to loop start
          }
        } else if (playbackMode === 'wait') {
          if (currentTime >= stepEnd) {
            currentTime = stepEnd;
            isPlaying = false; // pause exactly at end
            speakFeedback("Step completed. Waiting.");
            updateControlsUI();
          }
        } else if (playbackMode === 'continuous') {
          // Auto-advance step dynamically
          if (currentTime >= stepEnd) {
            if (activeStepIndex < recipeData.steps.length - 1) {
              activeStepIndex++;
              speakFeedback("Advancing to " + recipeData.steps[activeStepIndex].title);
              updateStepDetailsUI();
            } else {
              currentTime = stepEnd;
              isPlaying = false;
              updateControlsUI();
            }
          }
        }
        
        // Boundaries cap
        if (currentTime >= recipeData.duration) {
          currentTime = recipeData.duration;
          isPlaying = false;
          updateControlsUI();
        }
      }
      // Update subtitles in canvas simulation mode
      const segments = (recipeData && recipeData.text_overlays) || [];
      window.updateSubtitles(currentTime, 'playerSubtitleOverlay', segments);
    }
    
    // Draw Simulated Frame and Update Timeline displays
    drawSimulatedVideo();
    updateTimelineUI();
    
    animFrameId = requestAnimationFrame(update);
  }
  
  animFrameId = requestAnimationFrame(update);
}

function drawSimulatedVideo() {
  const currentCanvas = currentView === 'mobile-player' ? canvasMobile : canvasDesktop;
  const ctx = currentView === 'mobile-player' ? ctxMobile : ctxDesktop;
  
  if (!currentCanvas || !ctx) return;
  
  const w = currentCanvas.width;
  const h = currentCanvas.height;
  
  ctx.save();
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  const dw = w / window.devicePixelRatio;
  const dh = h / window.devicePixelRatio;
  
  // ── Soft sky background (light Wii-style) ──
  const grad = ctx.createLinearGradient(0, 0, dw, dh);
  grad.addColorStop(0, '#ddeeff');
  grad.addColorStop(1, '#c8e8ff');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, dw, dh);

  // Soft floating circle in background
  const t = performance.now() / 3000;
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.beginPath();
  ctx.arc(dw * 0.75 + Math.sin(t) * 8, dh * 0.25 + Math.cos(t) * 6, 60, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.beginPath();
  ctx.arc(dw * 0.15 + Math.cos(t) * 6, dh * 0.7 + Math.sin(t) * 5, 40, 0, Math.PI * 2);
  ctx.fill();

  // Step label at top
  const stepEmojis = ['🥒','🍳','🧄','🥫','🍽️'];
  const stepColors = ['#2a7a5a','#c45a2a','#b07a10','#4a60c0','#2a7a5a'];
  const emoji = stepEmojis[activeStepIndex] || '🍳';
  ctx.font = "bold 13px 'Nunito', sans-serif";
  ctx.textAlign = 'center';
  ctx.fillStyle = stepColors[activeStepIndex] || '#1a3a5c';

  // Soft particles (steam/bubbles instead of fire)
  if (isPlaying && (activeStepIndex === 1 || activeStepIndex === 2 || activeStepIndex === 3)) {
    if (Math.random() < 0.25) {
      particles.push({
        x: dw/2 + (Math.random() - 0.5) * 80,
        y: dh/2 + 10,
        vx: (Math.random() - 0.5) * 1.2,
        vy: -Math.random() * 2 - 1,
        alpha: 0.6,
        size: Math.random() * 5 + 3,
        color: activeStepIndex === 1 ? 'rgba(255,200,120,' : 'rgba(180,230,180,'
      });
    }
  }
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx; p.y += p.vy; p.alpha -= 0.015;
    if (p.alpha <= 0) { particles.splice(i, 1); continue; }
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = p.color + p.alpha + ')';
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // ── Step illustrations ──
  switch (activeStepIndex) {
    case 0: { // Prep & Chop
      // Cutting board
      ctx.fillStyle = '#e8d5b0';
      roundRect(ctx, dw/2 - 65, dh/2 - 15, 130, 55, 10);
      ctx.fillStyle = '#d4bc94';
      ctx.fillRect(dw/2 - 50, dh/2 - 5, 8, 35);
      ctx.fillRect(dw/2 - 30, dh/2 - 5, 8, 35);
      ctx.fillRect(dw/2 - 10, dh/2 - 5, 8, 35);
      // Knife animation
      const chopY = isPlaying ? Math.abs(Math.sin(performance.now() / 160)) * 22 : 0;
      ctx.strokeStyle = '#7a9ab8'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(dw/2 + 40, dh/2 - 18 - chopY);
      ctx.lineTo(dw/2 + 40, dh/2 + 5 - chopY);
      ctx.stroke();
      ctx.lineWidth = 1;
      // Label
      ctx.fillStyle = '#2a7a5a'; ctx.font = "700 12px 'Nunito',sans-serif";
      ctx.fillText('🥒  Prep & Chop', dw/2, dh/2 - 30);
      break;
    }
    case 1: { // Sear Chicken
      // Pan
      ctx.fillStyle = '#c8d8e8';
      ctx.beginPath(); ctx.ellipse(dw/2, dh/2 + 18, 48, 14, 0, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#b0c4d8';
      ctx.beginPath(); ctx.arc(dw/2, dh/2 + 10, 40, 0, Math.PI*2); ctx.fill();
      // Handle
      ctx.strokeStyle = '#8aaac0'; ctx.lineWidth = 7; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(dw/2 - 40, dh/2 + 10); ctx.lineTo(dw/2 - 85, dh/2 + 10); ctx.stroke();
      ctx.lineWidth = 1;
      // Chicken (golden)
      ctx.fillStyle = '#f0b85a';
      roundRect(ctx, dw/2 - 18, dh/2 + 2, 36, 20, 6);
      ctx.fillStyle = '#e8a040';
      roundRect(ctx, dw/2 - 12, dh/2 + 4, 24, 14, 4);
      ctx.fillStyle = '#c45a2a'; ctx.font = "700 12px 'Nunito',sans-serif";
      ctx.fillText('🍳  Sear the Chicken', dw/2, dh/2 - 30);
      break;
    }
    case 2: { // Stir Fry
      // Wok
      ctx.fillStyle = '#b8c8d8';
      ctx.beginPath(); ctx.ellipse(dw/2, dh/2 + 15, 52, 32, 0, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#a0b4c8';
      ctx.beginPath(); ctx.ellipse(dw/2, dh/2 + 12, 38, 22, 0, 0, Math.PI*2); ctx.fill();
      // Tossing veggies
      const tossY = isPlaying ? Math.sin(performance.now() / 200) * 10 : 0;
      const veggies = [
        {x:-18, y:8, r:7, c:'#6abd6a'}, {x:10, y:4, r:8, c:'#e8a040'},
        {x:-4, y:18, r:6, c:'#e85050'}, {x:18, y:12, r:6, c:'#6abd6a'}
      ];
      veggies.forEach((v, i) => {
        ctx.fillStyle = v.c;
        ctx.beginPath();
        ctx.arc(dw/2 + v.x, dh/2 + v.y + (i%2===0 ? tossY : -tossY)*0.6, v.r, 0, Math.PI*2);
        ctx.fill();
      });
      ctx.fillStyle = '#b07a10'; ctx.font = "700 12px 'Nunito',sans-serif";
      ctx.fillText('🧄  Stir Fry Aromatics', dw/2, dh/2 - 30);
      break;
    }
    case 3: { // Toss in Sauce
      ctx.fillStyle = '#b8c8d8';
      ctx.beginPath(); ctx.arc(dw/2, dh/2 + 12, 44, 0, Math.PI*2); ctx.fill();
      const boil = isPlaying ? Math.abs(Math.sin(performance.now() / 280)) * 6 : 0;
      ctx.fillStyle = 'rgba(200,140,60,0.5)';
      ctx.beginPath(); ctx.arc(dw/2, dh/2 + 12, 34 + boil, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = 'rgba(200,140,60,0.3)';
      ctx.beginPath(); ctx.arc(dw/2, dh/2 + 12, 24 + boil*0.5, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#4a60c0'; ctx.font = "700 12px 'Nunito',sans-serif";
      ctx.fillText('🥫  Toss in Sauce', dw/2, dh/2 - 30);
      break;
    }
    case 4: { // Plate & Garnish
      // Plate
      ctx.fillStyle = '#f4f8ff';
      ctx.beginPath(); ctx.arc(dw/2, dh/2 + 14, 52, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#dde8f4'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(dw/2, dh/2 + 14, 38, 0, Math.PI*2); ctx.stroke();
      ctx.lineWidth = 1;
      // Food
      ctx.fillStyle = '#f0b85a';
      ctx.beginPath(); ctx.ellipse(dw/2, dh/2 + 14, 22, 14, 0, 0, Math.PI*2); ctx.fill();
      // Basil
      ctx.fillStyle = '#5aaa5a';
      ctx.beginPath(); ctx.ellipse(dw/2 - 8, dh/2 + 8, 10, 5, Math.PI/5, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(dw/2 + 12, dh/2 + 16, 9, 4, -Math.PI/6, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#2a7a5a'; ctx.font = "700 12px 'Nunito',sans-serif";
      ctx.fillText('🍽️  Plate & Garnish', dw/2, dh/2 - 30);
      break;
    }
  }

  ctx.restore();
}

// Helper: rounded rectangle fill
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
}

function updateTimelineUI() {
  const min = Math.floor(currentTime / 60);
  const sec = Math.floor(currentTime % 60);
  
  const durMin = Math.floor((recipeData.duration || 0) / 60);
  const durSec = Math.floor((recipeData.duration || 0) % 60);
  const timeText = `${min}:${sec.toString().padStart(2, '0')} / ${durMin}:${durSec.toString().padStart(2, '0')}`;
  
  // Mobile Time text
  const mTimeReadout = document.getElementById('videoTimeReadout');
  if (mTimeReadout) mTimeReadout.innerText = timeText;
  
  // Mobile Progress line
  const mProgressLine = document.getElementById('videoProgressLine');
  const mPlayhead = document.getElementById('playerTimelinePlayhead');
  if (mProgressLine || mPlayhead) {
    const pct = (recipeData.duration > 0) ? (currentTime / recipeData.duration) * 100 : 0;
    if (mProgressLine) mProgressLine.style.width = pct + '%';
    if (mPlayhead) mPlayhead.style.left = pct + '%';
  }
  
  // Desktop Playhead
  const dPlayhead = document.getElementById('timelinePlayhead');
  const dTimerReadout = document.getElementById('desktopTimerReadout');
  if (dTimerReadout) dTimerReadout.innerText = `${min}:${sec.toString().padStart(2, '0')}`;
  
  if (dPlayhead) {
    const pct = (recipeData.duration > 0) ? (currentTime / recipeData.duration) * 100 : 0;
    dPlayhead.style.left = pct + '%';
  }
  
  // Keep active step index in sync with current timeline playhead time
  if (typeof currentView !== 'undefined' && currentView === 'mobile-player') {
    updateStepFromTime(currentTime);
  }
}

// Play/Pause Action
function toggleVideoPlayback() {
  isPlaying = !isPlaying;
  updateControlsUI();

  // Real video play/pause sync
  const realVideo = document.getElementById('mobileRealVideo');
  if (realVideo && realVideo.style.display !== 'none') {
    if (isPlaying) {
      realVideo.play().catch((err) => {
        console.warn('[Player] Unmuted playback blocked, retrying muted:', err);
        realVideo.muted = true;
        if (typeof updateMuteUI === 'function') updateMuteUI();
        realVideo.play().catch((e) => {
          console.error('[Player] Muted playback also failed:', e);
          isPlaying = false;
          updateControlsUI();
        });
      });
    } else {
      realVideo.pause();
    }
  }

  // Voiceover audio play/pause sync
  if (typeof window.playVoiceoverForStep === 'function') {
    if (isPlaying) {
      if (window._stepVoiceoverAudio && window._stepVoiceoverAudio.paused) {
        window._stepVoiceoverAudio.play().catch(() => {});
      } else {
        window.playVoiceoverForStep(activeStepIndex);
      }
    } else {
      if (window._stepVoiceoverAudio) {
        window._stepVoiceoverAudio.pause();
      }
    }
  }
}

function updateControlsUI() {
  // Mobile play btn
  const mPlayPauseBtn = document.getElementById('phonePlayPauseBtn');
  if (mPlayPauseBtn) {
    mPlayPauseBtn.innerHTML = isPlaying ? `<i data-lucide="pause"></i>` : `<i data-lucide="play"></i>`;
    lucide.createIcons({attrs: {class: 'phone-play-pause-icon'}});
  }
  
  // Desktop play btn (workbench)
  updateLucideIcon('desktopPlayIcon', isPlaying ? 'pause' : 'play', '24px', '24px');

  // Desktop player play btn
  const dPlayPauseBtn = document.getElementById('desktopPlayPauseBtn');
  if (dPlayPauseBtn) {
    dPlayPauseBtn.innerHTML = isPlaying ? '⏸ Pause' : '▶ Play';
  }

  // Unified controls strip play/pause btn
  const stripPlayBtn = document.getElementById('playerStripPlayPauseBtn');
  if (stripPlayBtn) {
    stripPlayBtn.innerHTML = isPlaying ? `<i data-lucide="pause" style="width: 16px; height: 16px;"></i>` : `<i data-lucide="play" style="width: 16px; height: 16px;"></i>`;
    if (window.lucide) lucide.createIcons();
  }
}

// Mute/Unmute Player Controls
window.togglePlayerMute = function() {
  const realVideo = document.getElementById('mobileRealVideo');
  if (!realVideo) return;
  realVideo.muted = !realVideo.muted;
  localStorage.setItem('cooking_gps_player_muted', realVideo.muted);
  updateMuteUI();
};

function updateMuteUI() {
  const realVideo = document.getElementById('mobileRealVideo');
  if (!realVideo) return;
  const muteBtn = document.getElementById('playerMuteBtn');
  if (!muteBtn) return;

  if (realVideo.muted) {
    updateLucideIcon('playerMuteIcon', 'volume-x', '15px', '15px');
    muteBtn.title = 'Unmute';
    muteBtn.style.color = 'var(--red)';
    muteBtn.style.background = 'rgba(224, 92, 92, 0.08)';
  } else {
    updateLucideIcon('playerMuteIcon', 'volume-2', '15px', '15px');
    muteBtn.title = 'Mute';
    muteBtn.style.color = '';
    muteBtn.style.background = '';
  }
}

// Player Playback Speed Controls
let playerPlaybackSpeedIndex = 1; // Default to 1.0
const PLAYER_SPEEDS = [0.5, 1.0, 1.25, 1.5, 2.0];
window.playerPlaybackSpeed = 1.0; // Global for canvas simulation sync

window.cyclePlayerSpeed = function() {
  const realVideo = document.getElementById('mobileRealVideo');
  if (!realVideo) return;

  playerPlaybackSpeedIndex = (playerPlaybackSpeedIndex + 1) % PLAYER_SPEEDS.length;
  const speed = PLAYER_SPEEDS[playerPlaybackSpeedIndex];
  realVideo.playbackRate = speed;
  window.playerPlaybackSpeed = speed;

  const label = document.getElementById('playerSpeedLabel');
  if (label) {
    label.textContent = (speed === 1 || speed === 2) ? `${speed}.0x` : `${speed}x`;
  }
};

function setPlaybackMode(mode) {
  playbackMode = mode;
  
  // Update old mode switch buttons if they exist
  document.querySelectorAll('.mode-switch-btn').forEach(btn => btn.classList.remove('active'));
  const btnLoop = document.getElementById('modeBtnLoop');
  const btnWait = document.getElementById('modeBtnWait');
  const btnCont = document.getElementById('modeBtnContinuous');

  const activeBadge = document.getElementById('activeModeBadge');
  
  if (mode === 'loop') {
    if (btnLoop) btnLoop.classList.add('active');
    if (activeBadge) {
      activeBadge.className = "mode-badge loop";
      activeBadge.innerHTML = `<i data-lucide="repeat"></i> Loop Mode`;
    }
  } else if (mode === 'wait') {
    if (btnWait) btnWait.classList.add('active');
    if (activeBadge) {
      activeBadge.className = "mode-badge wait";
      activeBadge.innerHTML = `<i data-lucide="pause"></i> Wait Mode`;
    }
  } else if (mode === 'continuous') {
    if (btnCont) btnCont.classList.add('active');
    if (activeBadge) {
      activeBadge.className = "mode-badge continuous";
      activeBadge.innerHTML = `<i data-lucide="play-circle"></i> Continuous`;
    }
  }
  
  // Update the new centered control-row cycle button
  const cycleBtn  = document.getElementById('playerModeCycleBtn');
  if (cycleBtn) {
    if (mode === 'loop') {
      updateLucideIcon('playerModeCycleIcon', 'repeat', '15px', '15px');
      cycleBtn.style.background = 'rgba(74, 144, 217, 0.1)';
      cycleBtn.style.color = 'var(--primary)';
      cycleBtn.style.borderColor = 'rgba(74, 144, 217, 0.2)';
    } else if (mode === 'wait') {
      updateLucideIcon('playerModeCycleIcon', 'clock', '15px', '15px');
      cycleBtn.style.background = 'rgba(224, 122, 32, 0.1)';
      cycleBtn.style.color = '#e07a20';
      cycleBtn.style.borderColor = 'rgba(224, 122, 32, 0.2)';
    } else if (mode === 'continuous') {
      updateLucideIcon('playerModeCycleIcon', 'arrow-right-circle', '15px', '15px');
      cycleBtn.style.background = 'rgba(92, 184, 92, 0.1)';
      cycleBtn.style.color = 'var(--green)';
      cycleBtn.style.borderColor = 'rgba(92, 184, 92, 0.2)';
    }
  }
  speakFeedback(mode + " mode activated.");
}

// Seek directly to a step boundary
function seekToStep(index) {
  activeStepIndex = index;
  currentTime = recipeData.loops[index];

  // Force voiceover replay on manual seek
  currentVoiceoverUrl = null;

  // Real video seek sync
  const realVideo = document.getElementById('mobileRealVideo');
  if (realVideo && realVideo.style.display !== 'none') {
    realVideo.currentTime = currentTime;
  }
  
  updateStepDetailsUI();
  speakFeedback("Navigating to " + recipeData.steps[index].title);
}

function updateStepDetailsUI() {
  if (!recipeData || !recipeData.steps || recipeData.steps.length === 0) return;
  const step = recipeData.steps[activeStepIndex];
  if (!step) return;

  // Toggle active class on card elements
  document.querySelectorAll('.step-slider-card').forEach((card, idx) => {
    if (idx === activeStepIndex) {
      card.classList.add('active');
    } else {
      card.classList.remove('active');
    }
  });

  // Move the playerTimerContainer into the active card's placeholder
  const timerContainer = document.getElementById('playerTimerContainer');
  const activePlaceholder = document.getElementById(`timerPlaceholder-${activeStepIndex}`);
  if (timerContainer) {
    if (activePlaceholder) {
      activePlaceholder.appendChild(timerContainer);
    } else {
      const body = document.querySelector('.mobile-player-body');
      if (body) body.appendChild(timerContainer);
    }
  }

  // Smoothly scroll the active card into center focus
  const activeCard = document.getElementById(`stepSliderCard-${activeStepIndex}`);
  if (activeCard) {
    isScrollingAuto = true;
    activeCard.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    
    if (window.autoScrollResetTimeout) {
      clearTimeout(window.autoScrollResetTimeout);
    }
    window.autoScrollResetTimeout = setTimeout(() => {
      isScrollingAuto = false;
    }, 600);
  }

  // Update mobile done button checkbox state across all cards
  updatePlayerMarkDoneButton();

  // Update step timers
  updatePlayerTimerUI();
  
  // Update chips class active
  document.querySelectorAll('.step-chip').forEach((c, idx) => {
    if (idx === activeStepIndex) c.classList.add('active');
    else c.classList.remove('active');
  });
  
  // Update Desktop side panel rows active
  document.querySelectorAll('.step-row-item').forEach((r, idx) => {
    if (idx === activeStepIndex) r.classList.add('active');
    else r.classList.remove('active');
  });
  
  // Fill details inputs
  updateDetailFields();

  // Render multigrid description cards if active
  if (typeof renderMultigridDescriptions === 'function') {
    renderMultigridDescriptions();
  }

  if (typeof window.playVoiceoverForStep === 'function') {
    window.playVoiceoverForStep(activeStepIndex);
  }
}

window.renderMultigridDescriptions = function() {
  const container = document.getElementById('playerMultigridDescriptions');
  const ctrlContainer = document.getElementById('playerMultigridDescControls');
  const activeCard = document.querySelector('.step-card-active');
  if (!container || !recipeData || !recipeData.steps) return;

  if (!isPlayerMultigridActive) {
    container.style.display = 'none';
    if (ctrlContainer) ctrlContainer.style.display = 'none';
    if (activeCard) activeCard.style.display = 'flex';
    return;
  }

  // Display the layout controls
  if (ctrlContainer) ctrlContainer.style.display = 'flex';
  container.style.display = 'flex';
  if (activeCard) activeCard.style.display = 'none';

  // Apply visual button active states
  const rowBtn = document.getElementById('descViewRowBtn');
  const colBtn = document.getElementById('descViewColBtn');
  if (rowBtn && colBtn) {
    if (playerDescLayoutMode === 'row') {
      rowBtn.style.background = 'var(--primary)';
      rowBtn.style.color = '#fff';
      colBtn.style.background = 'transparent';
      colBtn.style.color = 'var(--text-muted)';
    } else {
      colBtn.style.background = 'var(--primary)';
      colBtn.style.color = '#fff';
      rowBtn.style.background = 'transparent';
      rowBtn.style.color = 'var(--text-muted)';
    }
  }

  // Apply style overrides to the container based on current layout mode
  if (playerDescLayoutMode === 'row') {
    container.style.flexDirection = 'row';
    container.style.overflowX = 'auto';
    container.style.overflowY = 'hidden';
    container.style.cursor = 'grab';
    container.style.gap = '12px';
    container.style.touchAction = 'pan-x';
    container.style.webkitOverflowScrolling = 'touch';
  } else {
    container.style.flexDirection = 'column';
    container.style.overflowX = 'hidden';
    container.style.overflowY = 'visible';
    container.style.cursor = 'default';
    container.style.gap = '12px';
    container.style.touchAction = '';
    container.style.webkitOverflowScrolling = '';
  }

  // Render cards for only the selected steps
  const selectedIndices = Array.from(playerSelectedSteps).sort((a, b) => a - b);
  
  if (selectedIndices.length === 0) {
    container.innerHTML = `<div style="color:rgba(255,255,255,0.6); font-family:var(--font); font-size:0.75rem; font-style:italic; padding:12px; width:100%; text-align:center;">No steps selected. Check steps in the header to view descriptions.</div>`;
    return;
  }

  const cardStyle = playerDescLayoutMode === 'row' 
    ? 'flex-shrink:0; width:280px;' 
    : 'flex-shrink:0; width:100%;';

  const clampStyle = playerDescLayoutMode === 'row'
    ? 'overflow:hidden; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical;'
    : '';

  container.innerHTML = selectedIndices.map(idx => {
    const step = recipeData.steps[idx];
    if (!step) return '';
    
    const startVal = recipeData.loops[idx] !== undefined ? recipeData.loops[idx] : 0;
    const endVal = recipeData.loops[idx+1] !== undefined ? recipeData.loops[idx+1] : recipeData.duration;
    
    const minStart = Math.floor(startVal / 60);
    const secStart = Math.floor(startVal % 60);
    const minEnd = Math.floor(endVal / 60);
    const secEnd = Math.floor(endVal % 60);
    
    const timeText = `${minStart}:${secStart.toString().padStart(2,'0')} – ${minEnd}:${secEnd.toString().padStart(2,'0')}`;
    
    const isCompleted = playerCompletedSteps.has(idx);

    return `
      <div class="multigrid-desc-card" style="${cardStyle} background:rgba(255,255,255,0.9); border-radius:var(--radius-lg); border:2px solid rgba(74, 144, 217, 0.12); padding:16px; display:flex; flex-direction:row; align-items:center; justify-content:space-between; gap:12px; box-shadow:0 2px 12px rgba(74,144,217,0.08); box-sizing:border-box;">
        <!-- Left Column: Details -->
        <div style="flex:1; display:flex; flex-direction:column; gap:6px; min-width:0;">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
            <span style="font-size:0.72rem; font-weight:800; color:var(--text-muted);">Step ${idx + 1} of ${recipeData.steps.length}</span>
            <span style="font-size:0.65rem; font-weight:800; color:var(--primary); background:rgba(74,144,217,0.08); padding:2px 8px; border-radius:999px;">${timeText}</span>
          </div>
          <h3 style="font-size:0.92rem; font-weight:800; color:var(--text-title); margin:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${step.title}</h3>
          <p style="font-size:0.75rem; color:var(--text-body); line-height:1.45; margin:0; white-space:normal; ${clampStyle}">${step.instruction}</p>
        </div>
        
        <!-- Right Column: Checkoff circle icon -->
        <div onclick="event.stopPropagation(); window.togglePlayerMultigridDescStepDone(${idx})" style="cursor:pointer; display:flex; align-items:center; justify-content:center; width:36px; height:36px; border-radius:50%; flex-shrink:0; transition:all 0.2s ease-in-out; ${isCompleted ? 'background:#22c55e; color:#fff; box-shadow:0 4px 10px rgba(34,197,94,0.3);' : 'background:rgba(74, 144, 217, 0.08); color:var(--primary);'}" onmouseover="this.style.transform='scale(1.12)'" onmouseout="this.style.transform='scale(1)'">
          <i data-lucide="${isCompleted ? 'check-circle' : 'circle'}" style="width:18px; height:18px;"></i>
        </div>
      </div>
    `;
  }).join('');
  if (window.lucide) lucide.createIcons();
};

window.togglePlayerMultigridDescStepDone = function(stepIndex) {
  window.togglePlayerStepDone(stepIndex);
  if (typeof renderMultigridDescriptions === 'function') {
    renderMultigridDescriptions();
  }
};

window.setPlayerDescLayout = function(mode) {
  playerDescLayoutMode = mode;
  renderMultigridDescriptions();
};

function renderStepCardsMobile() {
  const container = document.getElementById('stepCardsSlider');
  if (!container) return;
  
  container.innerHTML = '';
  if (!recipeData || !recipeData.steps) return;
  
  recipeData.steps.forEach((step, idx) => {
    const isDone = playerCompletedSteps.has(idx);
    
    // Calculate start/end time
    const startVal = recipeData.loops[idx] !== undefined ? recipeData.loops[idx] : 0;
    const endVal = recipeData.loops[idx+1] !== undefined ? recipeData.loops[idx+1] : recipeData.duration;
    
    const minStart = Math.floor(startVal / 60);
    const secStart = Math.floor(startVal % 60);
    const minEnd = Math.floor(endVal / 60);
    const secEnd = Math.floor(endVal % 60);
    const timeStr = `${minStart}:${secStart.toString().padStart(2,'0')} – ${minEnd}:${secEnd.toString().padStart(2,'0')}`;
    
    const card = document.createElement('div');
    card.className = `step-slider-card ${idx === activeStepIndex ? 'active' : ''}`;
    card.id = `stepSliderCard-${idx}`;
    card.tabIndex = -1;
    card.onclick = () => {
      seekToStep(idx);
    };
    
    card.innerHTML = `
      <!-- Left Column: Details -->
      <div style="flex:1; display:flex; flex-direction:column; gap:6px; min-width:0; text-align:left;">
        <div class="step-meta-row">
          <span class="step-indicator-text">Step ${idx + 1} of ${recipeData.steps.length}</span>
          <span class="step-duration-badge">${timeStr}</span>
        </div>
        <h3 class="step-card-title" id="mobileStepTitle-${idx}">${step.title}</h3>
        <p class="step-instructions" id="mobileStepInstructions-${idx}">${step.instruction}</p>
        
        <!-- Placeholder for active timer -->
        <div class="timer-placeholder" id="timerPlaceholder-${idx}" style="margin-top:8px;"></div>
      </div>
      
      <!-- Right Column: Checkoff circle icon -->
      <div style="display:flex; flex-direction:column; align-items:center; gap:8px; flex-shrink:0;">
        <button class="player-mark-done-btn" id="playerMarkDoneBtn-${idx}" onclick="event.stopPropagation(); window.togglePlayerStepDone(${idx})" tabindex="-1" style="display:flex; align-items:center; justify-content:center; width:36px; height:36px; border-radius:50%; border:none; cursor:pointer; transition:all 0.2s ease-in-out; background:rgba(74, 144, 217, 0.08); color:var(--primary);" onmouseover="this.style.transform='scale(1.12)'" onmouseout="this.style.transform='scale(1)'">
          <i data-lucide="${isDone ? 'check-circle' : 'circle'}" style="width:18px; height:18px;"></i>
        </button>
      </div>
    `;
    container.appendChild(card);
  });
  
  if (window.lucide) lucide.createIcons();
}
window.renderStepCardsMobile = renderStepCardsMobile;

function initStepCardsSliderScroll() {
  const slider = document.getElementById('stepCardsSlider');
  if (!slider) return;
  
  if (slider.dataset.scrollListenerAdded) return;
  slider.dataset.scrollListenerAdded = 'true';
  
  let scrollTimeout = null;
  slider.addEventListener('scroll', () => {
    if (isScrollingAuto) return;
    
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      if (isScrollingAuto) return;
      
      const sliderRect = slider.getBoundingClientRect();
      const sliderCenter = sliderRect.left + (sliderRect.width / 2);
      
      const cards = slider.querySelectorAll('.step-slider-card');
      let minDistance = Infinity;
      let closestIndex = activeStepIndex;
      
      cards.forEach((card, idx) => {
        const cardRect = card.getBoundingClientRect();
        const cardCenter = cardRect.left + (cardRect.width / 2);
        const distance = Math.abs(cardCenter - sliderCenter);
        if (distance < minDistance) {
          minDistance = distance;
          closestIndex = idx;
        }
      });
      
      if (closestIndex !== activeStepIndex) {
        seekToStep(closestIndex);
      }
    }, 150);
  });
}
window.initStepCardsSliderScroll = initStepCardsSliderScroll;

function renderStepChipsMobile() {
  const container = document.getElementById('chipsScrollX');
  if (!container) return;
  
  container.innerHTML = '';
  recipeData.steps.forEach((step, idx) => {
    const isDone = playerCompletedSteps.has(idx);
    const chip = document.createElement('div');
    chip.className = `step-chip ${idx === activeStepIndex ? 'active' : ''} ${isDone ? 'done' : ''}`;
    chip.tabIndex = -1;
    chip.onclick = () => seekToStep(idx);
    chip.innerHTML = `
      <span class="step-chip-num">${idx + 1}</span>
      <span style="flex:1; text-align:left;">${step.title}</span>
      <span class="step-chip-checkbox" onclick="event.stopPropagation(); window.togglePlayerStepDone(${idx})">
        ${isDone ? '✓' : ''}
      </span>
    `;
    container.appendChild(chip);
  });
}

// ----------------------------------------------------
// BENTO GRID EDITING & SNAP LOGIC
// ----------------------------------------------------
function toggleBentoEditMode() {
  isBentoEditing = !isBentoEditing;
  const btn = document.getElementById('bentoEditModeBtn');
  const widgets = document.querySelectorAll('.bento-widget');
  
  if (isBentoEditing) {
    btn.innerHTML = `<i data-lucide="check"></i> Save Layout`;
    widgets.forEach(w => w.classList.add('editing'));
    showTip("Bento Grid Edit Mode active. Drag widgets to rearrange.");
  } else {
    btn.innerHTML = `<i data-lucide="edit-3"></i> Edit Board`;
    widgets.forEach(w => w.classList.remove('editing'));
    showTip("Bento Dashboard layout saved.");
  }
  lucide.createIcons();
}

function matchBentoSizes() {
  const widgets = document.querySelectorAll('.bento-widget');
  // snaps everything to uniform sizes of 2x1 to showcase match size behavior
  widgets.forEach(w => {
    w.className = 'glass-card bento-widget widget-2x1';
  });
  showTip("Snapping widget board sizes uniformly.");
}

function setupDashboardTimer() {
  let timerVal = 1815; // 30 mins 15 sec in sec
  setInterval(() => {
    timerVal--;
    if (timerVal <= 0) timerVal = 1815;
    
    const hrs = Math.floor(timerVal / 3600);
    const mins = Math.floor((timerVal % 3600) / 60);
    const secs = Math.floor(timerVal % 60);
    
    const read = `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    const timerLabel = document.getElementById('dashboardTimer');
    if (timerLabel) timerLabel.innerText = read;
  }, 1000);
}

// ----------------------------------------------------
// DESKTOP WORKBENCH & MARKER MANAGEMENT
// ----------------------------------------------------
function renderTimelineMarkersDesktop() {
  const container = document.getElementById('timelineMarkersContainer');
  if (!container) return;
  
  container.innerHTML = '';
  
  // Boundary markers are elements placed on timeline ruler
  recipeData.loops.forEach((time, idx) => {
    // skip duration limit marker representation if it is the absolute end
    if (idx === recipeData.loops.length - 1) return;
    
    const pct = (time / recipeData.duration) * 100;
    const marker = document.createElement('div');
    marker.className = 'timeline-stop-marker';
    marker.style.left = pct + '%';
    
    const stepLabel = document.createElement('div');
    stepLabel.className = 'timeline-stop-label';
    stepLabel.innerText = recipeData.steps[idx] ? recipeData.steps[idx].title : `Mark ${idx}`;
    marker.appendChild(stepLabel);
    
    // Simple drag simulation for boundary marker
    marker.onmousedown = (e) => {
      e.stopPropagation();
      const ruler = document.getElementById('editorTimelineRuler');
      const rulerRect = ruler.getBoundingClientRect();
      
      saveHistory(); // for undo state
      
      function onMouseMove(moveEvent) {
        let posX = moveEvent.clientX - rulerRect.left;
        posX = Math.max(0, Math.min(posX, rulerRect.width));
        const newTime = Math.round((posX / rulerRect.width) * recipeData.duration);
        
        // boundary validation rules: must stay sorted!
        const prevBound = idx > 0 ? recipeData.loops[idx - 1] + 5 : 0;
        const nextBound = recipeData.loops[idx + 1] - 5;
        
        if (newTime >= prevBound && newTime <= nextBound) {
          recipeData.loops[idx] = newTime;
          marker.style.left = (newTime / recipeData.duration * 100) + '%';
          updateStepListTimings();
          updateTimelineUI();
        }
      }
      
      function onMouseUp() {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        showTip(`Marker [${recipeData.steps[idx].title}] set to boundary.`);
      }
      
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    };
    
    container.appendChild(marker);
  });
}

let workbenchDragSrcIndex = null;

function renderStepListDesktop() {
  const container = document.getElementById('editorStepListContainer');
  if (!container) return;
  
  container.innerHTML = '';
  recipeData.steps.forEach((step, idx) => {
    const minStart = Math.floor(recipeData.loops[idx] / 60);
    const secStart = Math.floor(recipeData.loops[idx] % 60);
    const minEnd = Math.floor(recipeData.loops[idx+1] / 60);
    const secEnd = Math.floor(recipeData.loops[idx+1] % 60);
    const timeText = `${minStart}:${secStart.toString().padStart(2,'0')} – ${minEnd}:${secEnd.toString().padStart(2,'0')}`;
    
    const row = document.createElement('div');
    row.className = `step-row-item ${idx === activeStepIndex ? 'active' : ''}`;
    row.onclick = () => seekToStep(idx);
    
    // Step reordering via drag-and-drop
    row.draggable = true;
    row.addEventListener('dragstart', (e) => {
      workbenchDragSrcIndex = idx;
      e.dataTransfer.effectAllowed = 'move';
      row.classList.add('dragging');
    });
    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    });
    row.addEventListener('drop', (e) => {
      e.preventDefault();
      if (workbenchDragSrcIndex === null || workbenchDragSrcIndex === idx) return;
      
      saveHistory();
      
      const stepDurations = recipeData.steps.map((_, i) => recipeData.loops[i+1] - recipeData.loops[i]);
      
      const movedStep = recipeData.steps.splice(workbenchDragSrcIndex, 1)[0];
      recipeData.steps.splice(idx, 0, movedStep);
      
      const movedDuration = stepDurations.splice(workbenchDragSrcIndex, 1)[0];
      stepDurations.splice(idx, 0, movedDuration);
      
      let accum = 0;
      const newLoops = [0];
      stepDurations.forEach(d => {
        accum += d;
        newLoops.push(accum);
      });
      recipeData.loops = newLoops;
      
      workbenchDragSrcIndex = null;
      
      renderStepListDesktop();
      renderTimelineMarkersDesktop();
      updateTimelineUI();
      updateStepDetailsUI();
      showTip("Steps reordered.");
    });
    row.addEventListener('dragend', () => {
      row.classList.remove('dragging');
      workbenchDragSrcIndex = null;
    });

    row.innerHTML = `
      <div class="step-row-drag-dot"><i data-lucide="grip-vertical"></i></div>
      <div class="step-row-num">${idx + 1}</div>
      <div class="step-row-details">
        <div class="step-row-title">${step.title}</div>
        <div class="step-row-time" id="stepRowTime-${idx}">${timeText}</div>
      </div>
    `;
    container.appendChild(row);
  });
  lucide.createIcons();
}

function updateStepListTimings() {
  recipeData.steps.forEach((_, idx) => {
    const minStart = Math.floor(recipeData.loops[idx] / 60);
    const secStart = Math.floor(recipeData.loops[idx] % 60);
    const minEnd = Math.floor(recipeData.loops[idx+1] / 60);
    const secEnd = Math.floor(recipeData.loops[idx+1] % 60);
    const timeText = `${minStart}:${secStart.toString().padStart(2,'0')} – ${minEnd}:${secEnd.toString().padStart(2,'0')}`;
    
    const label = document.getElementById(`stepRowTime-${idx}`);
    if (label) label.innerText = timeText;
  });
}

// Click timeline to jump playhead
function timelineClick(e) {
  const ruler = document.getElementById('editorTimelineRuler');
  const rect = ruler.getBoundingClientRect();
  const posX = e.clientX - rect.left;
  const clickPct = posX / rect.width;
  currentTime = clickPct * recipeData.duration;
  
  // Find which step this click lands on and update active index
  for (let i = 0; i < recipeData.loops.length - 1; i++) {
    if (currentTime >= recipeData.loops[i] && currentTime <= recipeData.loops[i+1]) {
      activeStepIndex = i;
      break;
    }
  }
  
  updateStepDetailsUI();
  updateTimelineUI();
}

// Boundary nudge action
function nudgeActiveBoundary(seconds) {
  saveHistory();
  
  // nudge current active step end boundary
  const targetIdx = activeStepIndex + 1;
  if (targetIdx >= recipeData.loops.length - 1) return; // skip absolute end
  
  const minTime = recipeData.loops[targetIdx - 1] + 5;
  const maxTime = recipeData.loops[targetIdx + 1] - 5;
  const newTime = recipeData.loops[targetIdx] + seconds;
  
  if (newTime >= minTime && newTime <= maxTime) {
    recipeData.loops[targetIdx] = newTime;
    renderTimelineMarkersDesktop();
    updateStepListTimings();
    showTip(`End boundary of [${recipeData.steps[activeStepIndex].title}] nudged.`);
  }
}

// Sidebar Forms synchronization
function updateDetailFields() {
  const step = recipeData.steps[activeStepIndex];
  
  const titleInput = document.getElementById('inputStepTitle');
  const instrInput = document.getElementById('inputStepInstructions');
  const subsInput = document.getElementById('inputStepSubloops');
  
  if (titleInput) titleInput.value = step.title;
  if (instrInput) instrInput.value = step.instruction;
  if (subsInput) subsInput.value = step.subLoops ? step.subLoops.join(', ') : '';

  if (typeof renderSidebarTimersList === 'function') {
    renderSidebarTimersList();
  }
}

function saveStepDetailsFromInputs() {
  const step = recipeData.steps[activeStepIndex];
  const newTitle = document.getElementById('inputStepTitle').value;
  const newInstr = document.getElementById('inputStepInstructions').value;
  
  step.title = newTitle;
  step.instruction = newInstr;
  
  // Auto-detect timers from the typed text!
  const parsedTimers = window.parseMultipleTimersFromText(newInstr);
  if (parsedTimers && parsedTimers.length > 0) {
    step.timers = parsedTimers;
    step.timer = parsedTimers[0].duration;
  }
  
  // Update sidebar list and player display
  if (typeof renderSidebarTimersList === 'function') {
    renderSidebarTimersList();
  }
  if (typeof updatePlayerTimerUI === 'function') {
    updatePlayerTimerUI();
  }
  
  // Live update displays
  if (typeof renderStepCardsMobile === 'function') {
    renderStepCardsMobile();
  }
  
  renderStepChipsMobile();
  renderStepListDesktop();
  renderTimelineMarkersDesktop();
}

// AI Copilot simulation trigger
function runAiAnalysis() {
  const mode = document.getElementById('aiExtractionMode').value;
  showTip("AI Model [Gemini 2.5 Flash] reading video streams...");
  
  const analysisBtn = event.target;
  const originalText = analysisBtn.innerHTML;
  analysisBtn.disabled = true;
  analysisBtn.innerHTML = `<i data-lucide="loader-2" class="animate-spin"></i> Processing Audio...`;
  lucide.createIcons();
  
  setTimeout(() => {
    analysisBtn.innerHTML = `<i data-lucide="loader-2" class="animate-spin"></i> Generating stops...`;
    lucide.createIcons();
    
    setTimeout(() => {
      analysisBtn.disabled = false;
      analysisBtn.innerHTML = originalText;
      lucide.createIcons();
      
      saveHistory();
      
      if (mode === 'loops') {
        recipeData.loops = [0, 60, 150, 240, 310, 360];
        showTip("AI loop stops updated successfully.");
      } else if (mode === 'all') {
        recipeData.loops = [0, 80, 170, 230, 300, 360];
        recipeData.steps[0].title = "Ingred. Chop Setup";
        recipeData.steps[1].title = "Heat pan & Oil";
        recipeData.steps[2].title = "Sizzle garlic paste";
        showTip("AI full recipe timing details generated.");
      } else {
        showTip("AI loop descriptions appended to instructions.");
      }
      
      renderStepChipsMobile();
      renderStepCardsMobile();
      renderTimelineMarkersDesktop();
      renderStepListDesktop();
      updateStepDetailsUI();
    }, 1500);
  }, 1500);
}

// ----------------------------------------------------
// UNDO / REDO HISTORY ENGINE
// ----------------------------------------------------
function saveHistory() {
  undoHistory.push(JSON.stringify({
    loops: [...recipeData.loops],
    steps: recipeData.steps.map(s => ({...s}))
  }));
  redoHistory = []; // clear redo stack on new action
}

function triggerUndo() {
  if (undoHistory.length === 0) {
    showTip("Nothing to undo.");
    return;
  }
  
  redoHistory.push(JSON.stringify({
    loops: [...recipeData.loops],
    steps: recipeData.steps.map(s => ({...s}))
  }));
  
  const prevState = JSON.parse(undoHistory.pop());
  recipeData.loops = prevState.loops;
  recipeData.steps = prevState.steps;
  
  renderStepChipsMobile();
  renderStepCardsMobile();
  renderTimelineMarkersDesktop();
  renderStepListDesktop();
  updateStepDetailsUI();
  showTip("Action undone.");
}

function triggerRedo() {
  if (redoHistory.length === 0) {
    showTip("Nothing to redo.");
    return;
  }
  
  undoHistory.push(JSON.stringify({
    loops: [...recipeData.loops],
    steps: recipeData.steps.map(s => ({...s}))
  }));
  
  const nextState = JSON.parse(redoHistory.pop());
  recipeData.loops = nextState.loops;
  recipeData.steps = nextState.steps;
  
  renderStepChipsMobile();
  renderStepCardsMobile();
  renderTimelineMarkersDesktop();
  renderStepListDesktop();
  updateStepDetailsUI();
  showTip("Action redone.");
}

// ----------------------------------------------------
// WEB SPEECH VOICE COMMAND HAND-FREE CONTROLLER
// ----------------------------------------------------
function setupSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    console.warn("Speech recognition is not supported in this browser.");
    return;
  }
  
  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = false;
  recognition.lang = 'en-US';
  
  recognition.onstart = () => {
    currentSpeechActive = true;
    updateVoiceUI(true);
  };
  
  recognition.onend = () => {
    currentSpeechActive = false;
    updateVoiceUI(false);
  };
  
  recognition.onresult = (event) => {
    const transcript = event.results[event.results.length - 1][0].transcript.trim().toLowerCase();
    console.log("Voice Command heard: ", transcript);
    
    // Display in HUD
    const hudTranscript = document.getElementById('voiceHudTranscript');
    if (hudTranscript) hudTranscript.innerText = `"${transcript}"`;
    
    parseVoiceCommand(transcript);
  };
  
  recognition.onerror = (e) => {
    console.error("Speech Recognition Error: ", e);
    // Restart recognition if listening was active
    if (currentSpeechActive) {
      recognition.stop();
      setTimeout(() => recognition.start(), 300);
    }
  };
}

function toggleVoiceSystem() {
  if (!recognition) {
    showTip("Web Speech API not supported. Use buttons.");
    return;
  }
  
  if (currentSpeechActive) {
    recognition.stop();
    speakFeedback("Voice command system deactivated.");
  } else {
    recognition.start();
    speakFeedback("Voice command system activated. Go ahead.");
  }
}

function updateVoiceUI(active) {
  const phoneMic = document.getElementById('phoneMicBtn');
  const hudPanel = document.getElementById('voiceHudPanel');
  const hudIndicator = document.getElementById('voiceHudIndicator');
  const hudStatus = document.getElementById('voiceHudStatusLabel');
  
  if (active) {
    if (phoneMic) phoneMic.classList.add('listening');
    if (hudPanel) hudPanel.classList.remove('hidden');
    if (hudIndicator) hudIndicator.classList.add('active');
    if (hudStatus) hudStatus.innerText = "Listening...";
  } else {
    if (phoneMic) phoneMic.classList.remove('listening');
    if (hudPanel) hudPanel.classList.add('hidden');
    if (hudIndicator) hudIndicator.classList.remove('active');
  }
}

function parseVoiceCommand(text) {
  const hudStatus = document.getElementById('voiceHudStatusLabel');
  if (hudStatus) hudStatus.innerText = "Processing Command...";
  
  // COMMAND MATCHES
  if (text.includes("next step") || text.includes("next segment") || text.includes("skip forward")) {
    if (activeStepIndex < recipeData.steps.length - 1) {
      seekToStep(activeStepIndex + 1);
    } else {
      speakFeedback("This is the last step.");
    }
  } 
  else if (text.includes("previous step") || text.includes("go back") || text.includes("back step")) {
    if (activeStepIndex > 0) {
      seekToStep(activeStepIndex - 1);
    } else {
      speakFeedback("This is the first step.");
    }
  }
  else if (text.includes("pause") || text.includes("stop video") || text.includes("hold on")) {
    isPlaying = false;
    updateControlsUI();
    speakFeedback("Playback paused.");
  }
  else if (text.includes("resume") || text.includes("play video") || text.includes("continue")) {
    isPlaying = true;
    updateControlsUI();
    speakFeedback("Resuming playback.");
  }
  else if (text.includes("repeat step") || text.includes("repeat") || text.includes("replay")) {
    currentTime = recipeData.loops[activeStepIndex];
    isPlaying = true;
    updateControlsUI();
    speakFeedback("Repeating current step.");
  }
  else if (text.includes("loop mode")) {
    setPlaybackMode('loop');
  }
  else if (text.includes("wait mode")) {
    setPlaybackMode('wait');
  }
  else if (text.includes("continuous mode")) {
    setPlaybackMode('continuous');
  }
  else if (text.includes("go to dashboard") || text.includes("open dashboard") || text.includes("open my page")) {
    switchView('bento-dashboard');
  }
  else if (text.includes("go to player") || text.includes("open player")) {
    switchView('mobile-player');
  }
  else if (text.includes("go to editor") || text.includes("open editor") || text.includes("go to workbench")) {
    switchView('desktop-workbench');
  }
  else {
    if (hudStatus) hudStatus.innerText = "Command unrecognized";
    setTimeout(() => {
      if (currentSpeechActive && hudStatus) hudStatus.innerText = "Listening...";
    }, 1500);
  }
}

// Speech confirmation back to user
function speakFeedback(phrase) {
  showTip(phrase);
  
  // Audio SpeechSynthesis disabled per user request to prevent vocalizing every action
  /*
  if ('speechSynthesis' in window) {
    const utterance = new SpeechSynthesisUtterance(phrase);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
  }
  */
}

// ----------------------------------------------------
// INTERFACE VIEW SWITCHER / HELPER SHEETS
// ----------------------------------------------------
function switchView(viewId) {
  if (viewId !== 'create') {
    document.body.classList.remove('mobile-editing-active');
  }
  const phoneMic = document.getElementById('phoneMicBtn');
  if (phoneMic) {
    phoneMic.style.display = (viewId === 'mobile-player') ? 'flex' : 'none';
  }

  if (viewId === 'mobile-player') {
    if (currentView && currentView !== 'mobile-player') {
      playerPreviousView = currentView;
    }
  } else {
    // Pause mobile player video when leaving player view
    const realVideo = document.getElementById('mobileRealVideo');
    if (realVideo) {
      try {
        realVideo.pause();
      } catch (e) {}
    }
    isPlaying = false;
    if (typeof updateControlsUI === 'function') {
      updateControlsUI();
    }
  }

  // Hide the public-profile overlay when switching away
  if (viewId !== 'my-profile' && pubFromTab) {
    const pp = document.getElementById('view-public-profile');
    if (pp) pp.style.display = 'none';
    pubFromTab = false;
  }

  currentView = viewId;
  window.location.hash = viewId;

  // Update Tabs
  document.querySelectorAll('.view-tab').forEach(tab => tab.classList.remove('active'));
  const activeTab = Array.from(document.querySelectorAll('.view-tab')).find(tab => {
    const onc = tab.getAttribute('onclick') || '';
    return onc.includes(`'${viewId}'`) || onc.includes(`"${viewId}"`);
  });
  if (activeTab) activeTab.classList.add('active');

  // Toggle Views
  document.querySelectorAll('.view-section').forEach(sec => {
    sec.style.display = '';
    sec.classList.remove('active');
  });
  const targetSection = document.getElementById(`view-${viewId}`);
  if (targetSection) targetSection.classList.add('active');

  resizeCanvas();

  // Load data when switching to these views
  if (viewId === 'discover') loadDiscoverRecipes();
  if (viewId === 'profile') {
    loadProfileRecipes();
    if (typeof mySpaceInit === 'function') mySpaceInit();
    const landingSelect = document.getElementById('defaultLandingViewSelect');
    if (landingSelect) {
      landingSelect.value = localStorage.getItem('cooking_gps_landing_view') || 'create';
    }
  }
  if (viewId === 'grid-view') {
    if (!libState) libLoad();
    renderLibrary();
  }
  if (viewId !== 'grid-view') stopAllGridLoops();
  if (viewId === 'my-profile') {
    // Load own public channel
    if (!currentUser) {
      openAuthModal();
      return;
    }
    pubFromTab = true;
    openPublicProfile(currentUser.email, 'my-profile');
  }
  if (viewId === 'create') {
    initCreateView();
    // Check which AI services are live and update the badge
    fetch('/api/ai/status').then(r => r.json()).then(s => {
      const badge = document.getElementById('aiStatusBadge');
      if (!badge) return;
      if (s.gemini) {
        badge.textContent = '✅ Gemini ready';
        badge.style.background = '#dcfce7';
        badge.style.color = '#16a34a';
      } else if (s.whisper) {
        badge.textContent = '⚠️ Whisper only (≤25MB)';
        badge.style.background = '#fef9c3';
        badge.style.color = '#a16207';
      } else {
        badge.textContent = '❌ No AI key set';
        badge.style.background = '#fee2e2';
        badge.style.color = '#dc2626';
      }
    }).catch(() => {});
  }

  // Fix Create tab appearance
  const createTabEl = document.getElementById('createTab');
  if (createTabEl) {
    createTabEl.style.background = viewId === 'create' ? 'var(--primary)' : '';
    createTabEl.style.color      = viewId === 'create' ? '#fff' : '';
    createTabEl.style.boxShadow  = viewId === 'create' ? '0 3px 10px rgba(74,144,217,0.35)' : '';
  }
}

function switchSidebarTab(tabId) {
  document.querySelectorAll('.editor-tab-btn').forEach(btn => btn.classList.remove('active'));
  event.target.classList.add('active');
  
  document.querySelectorAll('.sidebar-tab-content').forEach(tab => tab.classList.remove('active'));
  document.getElementById(`tab-${tabId}`).classList.add('active');
}

function openWidgetRecipe(title, id) {
  if (id) {
    window.loadRecipeById(id);
  } else {
    switchView('mobile-player');
    showTip('Loaded: ' + title);
  }
}

function triggerRemix() {
  saveHistory();
  // Remix copy simulation
  showTip("Remixing Recipe: Copying boundaries & assets into editor workbench...");
  setTimeout(() => {
    switchView('desktop-workbench');
    showTip("Ready in Editor workbench as a personal version copy.");
  }, 1000);
}

// ─── Bento Dashboard Calendar & Grocery Checklist logic ───────────────────
function formatLocalDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDateToCookedHistory(date) {
  const history = getCookedHistory();
  const dateStr = formatLocalDate(date); // YYYY-MM-DD local
  if (!history.includes(dateStr)) {
    history.push(dateStr);
    localStorage.setItem('cooking_gps_cooked_history', JSON.stringify(history));
  }
  updateStreakCount();
  renderBentoCalendar();
}

function getCookedHistory() {
  const val = localStorage.getItem('cooking_gps_cooked_history');
  if (!val) return [];
  try {
    return JSON.parse(val);
  } catch (e) {
    return [];
  }
}

function updateStreakCount() {
  const history = getCookedHistory();
  if (!history.length) {
    const streakEl = document.getElementById('profileStreakCount');
    if (streakEl) streakEl.textContent = '0 Days';
    return;
  }
  
  const sortedDates = [...new Set(history)].sort((a, b) => new Date(b) - new Date(a));
  let streak = 0;
  const today = new Date();
  today.setHours(0,0,0,0);
  
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  const todayStr = formatLocalDate(today);
  const yesterdayStr = formatLocalDate(yesterday);
  
  if (!sortedDates.includes(todayStr) && !sortedDates.includes(yesterdayStr)) {
    const streakEl = document.getElementById('profileStreakCount');
    if (streakEl) streakEl.textContent = '0 Days';
    return;
  }
  
  let currentCheck = sortedDates.includes(todayStr) ? today : yesterday;
  while (true) {
    const checkStr = formatLocalDate(currentCheck);
    if (sortedDates.includes(checkStr)) {
      streak++;
      currentCheck.setDate(currentCheck.getDate() - 1);
    } else {
      break;
    }
  }
  const streakEl = document.getElementById('profileStreakCount');
  if (streakEl) streakEl.textContent = `${streak} Day${streak > 1 ? 's' : ''}`;
}

function renderBentoCalendar() {
  const gridEl = document.getElementById('bentoCalendarGrid');
  if (!gridEl) return;
  
  gridEl.innerHTML = '';
  
  const days = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  days.forEach(day => {
    const lbl = document.createElement('div');
    lbl.className = 'bento-calendar-day-label';
    lbl.textContent = day;
    gridEl.appendChild(lbl);
  });
  
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const monthNameEl = document.getElementById('calendarMonthName');
  if (monthNameEl) {
    monthNameEl.textContent = `${monthNames[month]} ${year}`;
  }
  
  const firstDay = new Date(year, month, 1);
  const startDayOfWeek = firstDay.getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();
  
  for (let i = 0; i < startDayOfWeek; i++) {
    const empty = document.createElement('div');
    empty.className = 'bento-calendar-day empty';
    gridEl.appendChild(empty);
  }
  
  const history = getCookedHistory();
  const todayStr = formatLocalDate(now);
  
  for (let dayNum = 1; dayNum <= totalDays; dayNum++) {
    const dayEl = document.createElement('div');
    dayEl.className = 'bento-calendar-day';
    dayEl.textContent = dayNum;
    
    // Construct local YYYY-MM-DD
    const dStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
    
    if (dStr === todayStr) {
      dayEl.classList.add('today');
    }
    if (history.includes(dStr)) {
      dayEl.classList.add('cooked');
    }
    
    dayEl.onclick = () => {
      toggleDateCooked(dStr);
    };
    
    gridEl.appendChild(dayEl);
  }
}

function toggleDateCooked(dateStr) {
  let history = getCookedHistory();
  if (history.includes(dateStr)) {
    history = history.filter(d => d !== dateStr);
  } else {
    history.push(dateStr);
  }
  localStorage.setItem('cooking_gps_cooked_history', JSON.stringify(history));
  updateStreakCount();
  renderBentoCalendar();
}

// Grocery Checklist logic
function getGroceryList() {
  const val = localStorage.getItem('cooking_gps_grocery_list');
  if (!val) return [];
  try {
    return JSON.parse(val);
  } catch (e) {
    return [];
  }
}

function saveGroceryList(list) {
  localStorage.setItem('cooking_gps_grocery_list', JSON.stringify(list));
}

function renderBentoGrocery() {
  const container = document.getElementById('bentoGroceryContainer');
  if (!container) return;
  
  container.innerHTML = '';
  const list = getGroceryList();
  
  if (list.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'grocery-empty-state';
    empty.textContent = '🛒 Your shopping list is empty.';
    container.appendChild(empty);
    return;
  }
  
  list.forEach(item => {
    const div = document.createElement('div');
    div.className = `grocery-item ${item.checked ? 'checked' : ''}`;
    
    const left = document.createElement('div');
    left.className = 'grocery-item-left';
    left.onclick = () => toggleGroceryItemChecked(item.id);
    
    const cb = document.createElement('div');
    cb.className = 'grocery-item-checkbox';
    if (item.checked) cb.textContent = '✓';
    
    const textSpan = document.createElement('span');
    textSpan.className = 'grocery-item-text';
    textSpan.textContent = item.text;
    
    left.appendChild(cb);
    left.appendChild(textSpan);
    
    const del = document.createElement('button');
    del.className = 'grocery-delete-btn';
    del.innerHTML = '✕';
    del.onclick = (e) => {
      e.stopPropagation();
      deleteGroceryItem(item.id);
    };
    
    div.appendChild(left);
    div.appendChild(del);
    container.appendChild(div);
  });
}

function addManualGroceryItem() {
  const input = document.getElementById('groceryNewItemInput');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  
  const list = getGroceryList();
  list.push({
    id: 'gr_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    text: text,
    checked: false
  });
  saveGroceryList(list);
  input.value = '';
  renderBentoGrocery();
}

function toggleGroceryItemChecked(itemId) {
  const list = getGroceryList();
  const item = list.find(i => i.id === itemId);
  if (item) {
    item.checked = !item.checked;
    saveGroceryList(list);
    renderBentoGrocery();
  }
}

function deleteGroceryItem(itemId) {
  let list = getGroceryList();
  list = list.filter(i => i.id !== itemId);
  saveGroceryList(list);
  renderBentoGrocery();
}

function clearCompletedGroceryItems() {
  let list = getGroceryList();
  list = list.filter(i => !i.checked);
  saveGroceryList(list);
  renderBentoGrocery();
}

// Recipe Player Ingredients logic
function renderPlayerIngredients() {
  const panel = document.getElementById('playerIngredientsPanel');
  const listEl = document.getElementById('playerIngredientsList');
  if (!panel || !listEl) return;
  
  if (!activePlayerRecipeId) {
    panel.style.display = 'none';
    return;
  }
  
  const recipeData = getActiveRecipeData();
  const ingredientsStr = recipeData ? recipeData.ingredients : '';
  
  if (!ingredientsStr || !ingredientsStr.trim()) {
    panel.style.display = 'none';
    return;
  }
  
  // Tab-aware display toggling
  const tabsContainer = document.getElementById('playerMainTabsContainer');
  const isTabbed = tabsContainer && tabsContainer.style.display === 'flex';
  
  if (isTabbed && window.activePlayerMainTab !== 'ingredients') {
    panel.style.display = 'none';
  } else {
    panel.style.display = 'flex';
  }
  listEl.innerHTML = '';
  
  const ingredients = ingredientsStr
    .split(/[\n;]/)
    .map(i => i.trim())
    .filter(i => i.length > 0);
    
  ingredients.forEach((ing) => {
    const itemDiv = document.createElement('div');
    itemDiv.style.cssText = 'display:flex; align-items:center; gap:8px; padding:6px 8px; border-bottom:1px solid rgba(0,0,0,0.05); cursor:pointer; transition:background 0.2s; border-radius:6px;';
    
    const checkbox = document.createElement('div');
    checkbox.style.cssText = 'width:14px; height:14px; border:1.5px solid var(--border-card); border-radius:3px; display:flex; align-items:center; justify-content:center; background:#fff; font-size:0.6rem; color:#fff; flex-shrink:0;';
    
    const textSpan = document.createElement('span');
    textSpan.style.cssText = 'transition:all 0.15s; flex:1;';
    textSpan.textContent = ing;
    
    itemDiv.onclick = () => {
      const isDone = itemDiv.classList.toggle('checked');
      if (isDone) {
        itemDiv.style.background = 'rgba(34, 197, 94, 0.05)';
        checkbox.style.background = 'var(--primary)';
        checkbox.style.borderColor = 'var(--primary)';
        checkbox.textContent = '✓';
        textSpan.style.textDecoration = 'line-through';
        textSpan.style.color = 'var(--text-muted)';
      } else {
        itemDiv.style.background = 'transparent';
        checkbox.style.background = '#fff';
        checkbox.style.borderColor = 'var(--border-card)';
        checkbox.textContent = '';
        textSpan.style.textDecoration = 'none';
        textSpan.style.color = '';
      }
    };
    
    itemDiv.appendChild(checkbox);
    itemDiv.appendChild(textSpan);
    listEl.appendChild(itemDiv);
  });
}

function getActiveRecipeData() {
  if (typeof activeRecipe !== 'undefined' && activeRecipe) return activeRecipe;
  if (window.recipeData) return window.recipeData;
  return null;
}

function addRecipeIngredientsToGrocery() {
  const recipeData = getActiveRecipeData();
  const ingredientsStr = recipeData ? recipeData.ingredients : '';
  if (!ingredientsStr || !ingredientsStr.trim()) {
    showTip('No ingredients found to add 🛒');
    return;
  }
  
  const ingredients = ingredientsStr
    .split(/[\n;]/)
    .map(i => i.trim())
    .filter(i => i.length > 0);
    
  const list = getGroceryList();
  let addedCount = 0;
  
  ingredients.forEach(ing => {
    if (!list.some(item => item.text.toLowerCase() === ing.toLowerCase())) {
      list.push({
        id: 'gr_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        text: ing,
        checked: false
      });
      addedCount++;
    }
  });
  
  if (addedCount > 0) {
    saveGroceryList(list);
    showTip(`Added ${addedCount} ingredients to Shopping List! 🛒`);
    renderBentoGrocery();
  } else {
    showTip('Ingredients already in Shopping List! 🛒');
  }
}

function mySpaceInit() {
  // Bio
  if (typeof mySpaceLoadData === 'function') {
    const data = mySpaceLoadData();
    const bioText = document.getElementById('mySpaceBioText');
    if (bioText && data.bio) {
      bioText.textContent = data.bio;
      bioText.style.fontStyle = 'normal';
    }
  }

  // Sign-in / Sign-out button visibility
  const signInBtn = document.getElementById('mySpaceSignInBtn');
  const signOutBtn = document.getElementById('mySpaceSignOutBtn');
  if (signInBtn) signInBtn.style.display = currentUser ? 'none' : '';
  if (signOutBtn) signOutBtn.style.display = currentUser ? '' : 'none';

  // Legacy channel button if it exists
  const channelBtn = document.getElementById('mySpaceChannelBtn');
  if (channelBtn) channelBtn.style.display = currentUser ? '' : 'none';

  // Folder strip
  if (typeof mySpaceRenderFolderStrip === 'function') {
    mySpaceRenderFolderStrip();
  }

  // Bento Widgets
  if (typeof renderBentoCalendar === 'function') renderBentoCalendar();
  if (typeof renderBentoGrocery === 'function') renderBentoGrocery();
  if (typeof updateStreakCount === 'function') updateStreakCount();
  
  // Initialize customizable widgets visibility & states
  if (typeof refreshWidgetsVisibility === 'function') refreshWidgetsVisibility();
  if (typeof initBentoMealPlan === 'function') initBentoMealPlan();
  if (typeof renderBentoWater === 'function') renderBentoWater();
  if (typeof resetBentoTimer === 'function') resetBentoTimer();

  // Initialize Dashboard Widgets Sizes
  if (typeof initAllWidgetSizes === 'function') initAllWidgetSizes();
}

const ALL_BENTO_WIDGETS = [
  { id: 'bentoStatsWidget', name: '📊 Culinary Records', defaultHidden: false, defaultSize: 'span-1' },
  { id: 'bentoCalendarWidget', name: '📅 Cooked Meal History', defaultHidden: false, defaultSize: 'span-2' },
  { id: 'bentoGroceryWidget', name: '🛒 Shopping List', defaultHidden: false, defaultSize: 'span-1' },
  { id: 'bentoTimerWidget', name: '⏱️ Quick Timer', defaultHidden: true, defaultSize: 'span-1' },
  { id: 'bentoWaterWidget', name: '💧 Daily Water Tracker', defaultHidden: true, defaultSize: 'span-1' },
  { id: 'bentoMealPlannerWidget', name: '🍳 Today\'s Menu', defaultHidden: true, defaultSize: 'span-1' }
];

function toggleDashboardEditMode() {
  const bGrid = document.getElementById('profileBentoGrid');
  if (!bGrid) return;
  const profileView = document.getElementById('view-profile');
  
  const btn = document.getElementById('dashboardEditBtn');
  const isEditing = bGrid.classList.contains('dashboard-editing');
  
  if (isEditing) {
    bGrid.classList.remove('dashboard-editing');
    if (profileView) profileView.classList.remove('dashboard-editing');
    if (btn) {
      btn.innerHTML = '⚙️ Customize Layout';
      btn.style.background = 'rgba(74,144,217,0.1)';
      btn.style.color = 'var(--primary)';
    }
    showTip("Dashboard layout saved.");
  } else {
    bGrid.classList.add('dashboard-editing');
    if (profileView) profileView.classList.add('dashboard-editing');
    if (btn) {
      btn.innerHTML = '✅ Save Layout';
      btn.style.background = 'var(--green)';
      btn.style.color = '#fff';
    }
    showTip("Edit Mode active. Customize sizes and add/delete widgets.");
  }
  
  // Refresh widget visibility and the manage widgets panel state
  window.refreshWidgetsVisibility();

  // Re-render folder strip to show/hide customizers
  if (typeof mySpaceRenderFolderStrip === 'function') {
    mySpaceRenderFolderStrip();
  }
}

function toggleWidgetSize(widgetId) {
  const widget = document.getElementById(widgetId);
  if (!widget) return;
  
  // Cycle order: span-1 (Small) -> span-2 (Medium) -> span-3 (Large) -> span-1
  let currentSize = 'span-1';
  if (widget.classList.contains('span-2')) {
    currentSize = 'span-2';
  } else if (widget.classList.contains('span-3')) {
    currentSize = 'span-3';
  }
  
  let nextSize = 'span-1';
  let sizeLabel = 'Small';
  
  if (currentSize === 'span-1') {
    nextSize = 'span-2';
    sizeLabel = 'Medium';
  } else if (currentSize === 'span-2') {
    nextSize = 'span-3';
    sizeLabel = 'Large';
  } else {
    nextSize = 'span-1';
    sizeLabel = 'Small';
  }
  
  widget.classList.remove('span-1', 'span-2', 'span-3');
  widget.classList.add(nextSize);
  
  // Save to localStorage
  localStorage.setItem(`cooking_gps_widget_size_${widgetId}`, nextSize);
  
  // Update button text
  const btn = document.getElementById(`resizeBtn_${widgetId}`);
  if (btn) {
    btn.innerHTML = `↔ Size: ${sizeLabel}`;
  }
  
  // If calendar widget was resized, re-render it to fit properly
  if (widgetId === 'bentoCalendarWidget' && typeof renderBentoCalendar === 'function') {
    renderBentoCalendar();
  }
}

function initAllWidgetSizes() {
  const widgets = [
    { id: 'bentoIdentityWidget', default: 'span-2' },
    { id: 'bentoStatsWidget', default: 'span-1' },
    { id: 'bentoCalendarWidget', default: 'span-2' },
    { id: 'bentoGroceryWidget', default: 'span-1' },
    { id: 'bentoTimerWidget', default: 'span-1' },
    { id: 'bentoWaterWidget', default: 'span-1' },
    { id: 'bentoMealPlannerWidget', default: 'span-1' }
  ];
  
  widgets.forEach(w => {
    const el = document.getElementById(w.id);
    if (!el) return;
    const savedSize = localStorage.getItem(`cooking_gps_widget_size_${w.id}`) || w.default;
    el.classList.remove('span-1', 'span-2', 'span-3');
    el.classList.add(savedSize);
    
    let sizeLabel = 'Small';
    if (savedSize === 'span-2') sizeLabel = 'Medium';
    if (savedSize === 'span-3') sizeLabel = 'Large';
    
    const btn = document.getElementById(`resizeBtn_${w.id}`);
    if (btn) {
      btn.innerHTML = `↔ Size: ${sizeLabel}`;
    }
  });
}

function toggleCalendarSize() {
  toggleWidgetSize('bentoCalendarWidget');
}

function initCalendarSize() {
  initAllWidgetSizes();
}

/* ── Widget Customization Management ── */
window.hideBentoWidget = function(widgetId) {
  localStorage.setItem(`cooking_gps_widget_hidden_${widgetId}`, 'true');
  window.refreshWidgetsVisibility();
  showTip("Widget hidden. Click 'Customize Layout' to bring it back!");
};

window.showBentoWidget = function(widgetId) {
  localStorage.setItem(`cooking_gps_widget_hidden_${widgetId}`, 'false');
  window.refreshWidgetsVisibility();
  
  // Also initialize state for newly added widgets
  if (widgetId === 'bentoWaterWidget') renderBentoWater();
  if (widgetId === 'bentoMealPlannerWidget') initBentoMealPlan();
  
  showTip("Widget restored to dashboard!");
};

window.refreshWidgetsVisibility = function() {
  const bGrid = document.getElementById('profileBentoGrid');
  if (!bGrid) return;
  const isEditing = bGrid.classList.contains('dashboard-editing');
  
  // 1. Update visibility on standard widgets
  ALL_BENTO_WIDGETS.forEach(w => {
    const el = document.getElementById(w.id);
    if (!el) return;
    
    const isHidden = localStorage.getItem(`cooking_gps_widget_hidden_${w.id}`) === 'true' || 
                     (localStorage.getItem(`cooking_gps_widget_hidden_${w.id}`) === null && w.defaultHidden);
    
    el.style.display = isHidden ? 'none' : '';
  });

  // 2. Remove old custom shuffle widgets from DOM to avoid duplication
  document.querySelectorAll('.custom-shuffle-widget').forEach(el => el.remove());

  // 3. Render custom shuffle widgets
  let customWidgets = [];
  try {
    const raw = localStorage.getItem('cooking_gps_custom_shuffle_widgets');
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed)) {
      customWidgets = parsed;
    }
  } catch (err) {
    console.error('Error parsing custom widgets:', err);
  }
  customWidgets.forEach(w => {
    if (w.hidden) return;

    const savedSize = localStorage.getItem(`cooking_gps_widget_size_${w.id}`) || w.size || 'span-1';
    
    let sizeLabel = 'Small';
    if (savedSize === 'span-2') sizeLabel = 'Medium';
    if (savedSize === 'span-3') sizeLabel = 'Large';

    // Build folder dropdown options dynamically
    const folderOptions = (libState && libState.folders || []).map(f => `
      <option value="${f.id}" ${w.source === f.id ? 'selected' : ''}>Folder: ${escapeHTML(f.name)}</option>
    `).join('');

    const widgetEl = document.createElement('div');
    widgetEl.className = `bento-widget custom-shuffle-widget ${savedSize}`;
    widgetEl.id = w.id;
    widgetEl.style.position = 'relative';

    widgetEl.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; width:100%; flex-shrink:0;">
        <div style="font-size:0.72rem; font-weight:800; text-transform:uppercase; color:var(--text-muted); letter-spacing:0.05em; display:flex; align-items:center; gap:4px;">
          🔀 <span id="shuffleWidgetTitleSpan_${w.id}">${escapeHTML(w.name)}</span>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <button onclick="window.configureShuffleWidget('${w.id}')" class="bento-widget-resize-btn" style="background:rgba(74,144,217,0.1); border:none; border-radius:8px; padding:4px 8px; color:var(--primary); font-family:var(--font); font-size:0.65rem; font-weight:800; cursor:pointer;" title="Configure widget settings">⚙️ settings</button>
          <button onclick="toggleWidgetSize('${w.id}')" id="resizeBtn_${w.id}" class="bento-widget-resize-btn" style="background:rgba(74,144,217,0.1); border:none; border-radius:8px; padding:4px 8px; color:var(--primary); font-family:var(--font); font-size:0.65rem; font-weight:800; cursor:pointer;" title="Change layout size">↔ Size: ${sizeLabel}</button>
          <button onclick="window.deleteShuffleWidget('${w.id}')" class="bento-widget-delete-btn" title="Remove Widget">×</button>
        </div>
      </div>
      
      <!-- Inline settings overlay -->
      <div id="shuffleSettings_${w.id}" style="display:none; width:100%; flex-direction:column; gap:8px; background:rgba(0,0,0,0.03); padding:10px; border-radius:12px; box-sizing:border-box; margin-bottom:8px; border:1px solid rgba(0,0,0,0.05);">
        <div style="display:flex; flex-direction:column; gap:4px;">
          <label style="font-size:0.6rem; font-weight:800; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.03em;">Widget Title</label>
          <input type="text" id="shuffleInputTitle_${w.id}" value="${escapeHTML(w.name)}" style="padding:6px 10px; font-family:var(--font); font-size:0.75rem; font-weight:600; border:1.5px solid var(--border-card); border-radius:8px; outline:none; background:#fff;">
        </div>
        <div style="display:flex; flex-direction:column; gap:4px;">
          <label style="font-size:0.6rem; font-weight:800; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.03em;">Source Collection</label>
          <select id="shuffleSelectSource_${w.id}" style="padding:6px 10px; font-family:var(--font); font-size:0.75rem; font-weight:600; border:1.5px solid var(--border-card); border-radius:8px; background:#fff; outline:none;">
            <option value="all" ${w.source === 'all' ? 'selected' : ''}>Entire Library</option>
            ${folderOptions}
          </select>
        </div>
        <button onclick="window.saveShuffleWidgetSettings('${w.id}')" class="btn btn-primary" style="padding:6px; font-size:0.7rem; font-weight:800; border-radius:8px; width:100%;">Save Config</button>
      </div>

      <div class="shuffle-widget-content" style="display:flex; flex-direction:column; align-items:center; justify-content:center; flex:1; gap:10px; width:100%;">
        <!-- Picked Recipe Card Display -->
        <div id="shufflePicked_${w.id}" style="display:none; width:100%; text-align:center; background:rgba(74,144,217,0.04); border:1px solid rgba(74,144,217,0.15); border-radius:12px; padding:10px; box-sizing:border-box;">
          <div style="font-size:0.6rem; font-weight:800; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.04em; margin-bottom:4px;">Chef's Suggestion 🍽️</div>
          <div id="shufflePickedTitle_${w.id}" style="font-size:0.85rem; font-weight:800; color:var(--text-heading); margin-bottom:8px; line-height:1.3;">Recipe Title</div>
          <button id="shuffleCookBtn_${w.id}" class="btn btn-primary" style="padding:6px 12px; font-size:0.7rem; font-weight:800; border-radius:8px; width:100%;">Cook Now 🍳</button>
        </div>
        
        <!-- Shuffle action button -->
        <button onclick="window.triggerShuffleWidget('${w.id}', event)" class="btn btn-primary" style="padding:10px 16px; font-size:0.8rem; font-weight:800; border-radius:12px; width:100%; display:flex; align-items:center; justify-content:center; gap:6px; box-shadow:0 4px 10px rgba(74,144,217,0.2);">
          <i data-lucide="shuffle" style="width:14px; height:14px;"></i>
          <span id="shuffleWidgetBtnText_${w.id}">What's for Dinner?</span>
        </button>
      </div>
    `;

    bGrid.appendChild(widgetEl);
  });

  // 4. Update Add Widgets Panel
  const panel = document.getElementById('addWidgetsPanel');
  const container = document.getElementById('addWidgetsButtonsContainer');
  if (panel && container) {
    if (isEditing) {
      panel.style.display = 'flex';
      
      const hiddenWidgets = ALL_BENTO_WIDGETS.filter(w => {
        return localStorage.getItem(`cooking_gps_widget_hidden_${w.id}`) === 'true' || 
               (localStorage.getItem(`cooking_gps_widget_hidden_${w.id}`) === null && w.defaultHidden);
      });
      
      let html = '';
      if (hiddenWidgets.length > 0) {
        html += hiddenWidgets.map(w => `
          <button onclick="window.showBentoWidget('${w.id}')" style="background:#fff; border:1.5px solid rgba(74,144,217,0.25); border-radius:10px; padding:6px 12px; font-family:var(--font); font-size:0.72rem; font-weight:800; color:var(--primary); cursor:pointer; display:flex; align-items:center; gap:4px; transition:all 0.15s;" onmouseenter="this.style.background='var(--primary)'; this.style.color='#fff';" onmouseleave="this.style.background='#fff'; this.style.color='var(--primary)';">
            ➕ Add ${w.name.split(' ').slice(1).join(' ') || w.name}
          </button>
        `).join('');
      }
      
      // Add custom shuffle widget creator button
      html += `
        <button onclick="window.createNewShuffleWidget()" style="background:#fff; border:1.5px solid rgba(124,58,237,0.25); border-radius:10px; padding:6px 12px; font-family:var(--font); font-size:0.72rem; font-weight:800; color:#7c3aed; cursor:pointer; display:flex; align-items:center; gap:4px; transition:all 0.15s;" onmouseenter="this.style.background='#7c3aed'; this.style.color='#fff';" onmouseleave="this.style.background='#fff'; this.style.color='#7c3aed';">
          ➕ Create Shuffle Widget
        </button>
      `;
      
      container.innerHTML = html;
    } else {
      panel.style.display = 'none';
    }
  }

  if (window.lucide) lucide.createIcons();
};

window.createNewShuffleWidget = function() {
  let widgets = [];
  try {
    const raw = localStorage.getItem('cooking_gps_custom_shuffle_widgets');
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed)) {
      widgets = parsed;
    }
  } catch (err) {
    console.error('Error parsing custom widgets:', err);
  }
  const id = 'bentoShuffleWidget_' + Date.now();
  const newWidget = {
    id,
    name: '🍽️ Meal Decider',
    source: 'all',
    size: 'span-1',
    hidden: false
  };
  widgets.push(newWidget);
  localStorage.setItem('cooking_gps_custom_shuffle_widgets', JSON.stringify(widgets));
  
  window.refreshWidgetsVisibility();
  setTimeout(() => {
    window.configureShuffleWidget(id);
  }, 50);
  showTip("Custom Cook Decider widget created!");
};

window.configureShuffleWidget = function(widgetId) {
  const settingsDiv = document.getElementById(`shuffleSettings_${widgetId}`);
  if (settingsDiv) {
    if (settingsDiv.style.display === 'none') {
      settingsDiv.style.display = 'flex';
    } else {
      settingsDiv.style.display = 'none';
    }
  }
};

window.saveShuffleWidgetSettings = function(widgetId) {
  const inputTitle = document.getElementById(`shuffleInputTitle_${widgetId}`);
  const selectSource = document.getElementById(`shuffleSelectSource_${widgetId}`);
  if (!inputTitle || !selectSource) return;

  const title = inputTitle.value.trim() || 'Meal Decider';
  const source = selectSource.value;

  let widgets = [];
  try {
    const raw = localStorage.getItem('cooking_gps_custom_shuffle_widgets');
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed)) {
      widgets = parsed;
    }
  } catch (err) {
    console.error('Error parsing custom widgets:', err);
  }
  const index = widgets.findIndex(w => w.id === widgetId);
  if (index !== -1) {
    widgets[index].name = title;
    widgets[index].source = source;
    localStorage.setItem('cooking_gps_custom_shuffle_widgets', JSON.stringify(widgets));
    
    const titleSpan = document.getElementById(`shuffleWidgetTitleSpan_${widgetId}`);
    if (titleSpan) titleSpan.textContent = title;
    
    const settingsDiv = document.getElementById(`shuffleSettings_${widgetId}`);
    if (settingsDiv) settingsDiv.style.display = 'none';
    
    showTip("Shuffle Widget settings saved.");
  }
};

window.deleteShuffleWidget = function(widgetId) {
  let widgets = [];
  try {
    const raw = localStorage.getItem('cooking_gps_custom_shuffle_widgets');
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed)) {
      widgets = parsed;
    }
  } catch (err) {
    console.error('Error parsing custom widgets:', err);
  }
  widgets = widgets.filter(w => w.id !== widgetId);
  localStorage.setItem('cooking_gps_custom_shuffle_widgets', JSON.stringify(widgets));
  
  localStorage.removeItem(`cooking_gps_widget_size_${widgetId}`);
  
  window.refreshWidgetsVisibility();
  showTip("Custom Shuffle Widget removed.");
};

window.triggerShuffleWidget = function(widgetId, e) {
  let widgets = [];
  try {
    const raw = localStorage.getItem('cooking_gps_custom_shuffle_widgets');
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed)) {
      widgets = parsed;
    }
  } catch (err) {
    console.error('Error parsing custom widgets:', err);
  }
  const widget = widgets.find(w => w.id === widgetId);
  if (!widget) return;

  let candidates = [];
  if (widget.source === 'all') {
    candidates = libAllRecipes || [];
  } else {
    const folder = (libState && libState.folders || []).find(f => f.id === widget.source);
    if (folder) {
      candidates = (libAllRecipes || []).filter(r => r && (folder.recipeIds || []).includes(r.id));
    }
  }

  if (!candidates || candidates.length === 0) {
    showTip("No recipes found in the selected folder/library.");
    return;
  }

  const resultDiv = document.getElementById(`shufflePicked_${widgetId}`);
  const resultTitle = document.getElementById(`shufflePickedTitle_${widgetId}`);
  const resultCookBtn = document.getElementById(`shuffleCookBtn_${widgetId}`);
  
  if (resultDiv && resultTitle && resultCookBtn) {
    resultDiv.style.display = 'block';
    
    let counter = 0;
    const intervalTime = 80; // ms
    const duration = 1200; // ms
    const cycles = duration / intervalTime;
    
    const shuffleBtn = e ? e.currentTarget : null;
    if (shuffleBtn) shuffleBtn.disabled = true;

    const animInterval = setInterval(() => {
      const tempIndex = Math.floor(Math.random() * candidates.length);
      resultTitle.textContent = candidates[tempIndex].title;
      counter++;
      
      if (counter >= cycles) {
        clearInterval(animInterval);
        
        const finalRecipe = candidates[Math.floor(Math.random() * candidates.length)];
        resultTitle.textContent = finalRecipe.title;
        
        resultDiv.style.boxShadow = '0 0 15px rgba(74, 144, 217, 0.4)';
        setTimeout(() => { resultDiv.style.boxShadow = 'none'; }, 600);

        resultCookBtn.onclick = () => {
          window.loadRecipeById(finalRecipe.id);
        };
        
        if (shuffleBtn) shuffleBtn.disabled = false;
        showTip(`Decided! How about: ${finalRecipe.title}? 😋`);
      }
    }, intervalTime);
  }
};

/* ── Water Tracker Logic ── */
let bentoWaterCount = parseInt(localStorage.getItem('cooking_gps_water_count') || '0');

function renderBentoWater() {
  const container = document.getElementById('bentoWaterDroplets');
  const countText = document.getElementById('bentoWaterCountText');
  if (!container || !countText) return;

  countText.textContent = `${bentoWaterCount} / 8 Cups`;

  let html = '';
  for (let i = 0; i < 8; i++) {
    const activeClass = i < bentoWaterCount ? 'active' : '';
    html += `<div class="water-droplet ${activeClass}" onclick="window.toggleBentoWaterCup(${i})" title="Log cup ${i+1}"></div>`;
  }
  container.innerHTML = html;
}

window.toggleBentoWaterCup = function(index) {
  if (index < bentoWaterCount) {
    if (index === bentoWaterCount - 1) {
      bentoWaterCount--;
    } else {
      bentoWaterCount = index + 1;
    }
  } else {
    bentoWaterCount = index + 1;
  }
  localStorage.setItem('cooking_gps_water_count', bentoWaterCount.toString());
  renderBentoWater();
};

window.resetBentoWater = function() {
  bentoWaterCount = 0;
  localStorage.setItem('cooking_gps_water_count', '0');
  renderBentoWater();
};

/* ── Quick Countdown Timer Logic ── */
let bentoTimerInterval = null;
let bentoTimerSecondsLeft = 300;
let bentoTimerRunning = false;

function formatBentoTime(secs) {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

window.setBentoTimerPreset = function(secs) {
  if (bentoTimerRunning) {
    window.toggleBentoTimer();
  }
  bentoTimerSecondsLeft = secs;
  const display = document.getElementById('bentoTimerDisplay');
  if (display) display.textContent = formatBentoTime(secs);
};

window.toggleBentoTimer = function() {
  const startBtn = document.getElementById('bentoTimerStartBtn');
  const display = document.getElementById('bentoTimerDisplay');
  if (!startBtn || !display) return;

  if (bentoTimerRunning) {
    clearInterval(bentoTimerInterval);
    bentoTimerRunning = false;
    startBtn.textContent = 'Start';
    startBtn.className = 'timer-control-btn start';
  } else {
    bentoTimerRunning = true;
    startBtn.textContent = 'Pause';
    startBtn.className = 'timer-control-btn pause';

    bentoTimerInterval = setInterval(() => {
      if (bentoTimerSecondsLeft <= 0) {
        clearInterval(bentoTimerInterval);
        bentoTimerRunning = false;
        startBtn.textContent = 'Start';
        startBtn.className = 'timer-control-btn start';
        playBentoTimerAlert();
        return;
      }
      bentoTimerSecondsLeft--;
      display.textContent = formatBentoTime(bentoTimerSecondsLeft);
    }, 1000);
  }
};

window.resetBentoTimer = function() {
  if (bentoTimerInterval) {
    clearInterval(bentoTimerInterval);
  }
  bentoTimerRunning = false;
  bentoTimerSecondsLeft = 300;
  const startBtn = document.getElementById('bentoTimerStartBtn');
  const display = document.getElementById('bentoTimerDisplay');
  if (startBtn) {
    startBtn.textContent = 'Start';
    startBtn.className = 'timer-control-btn start';
  }
  if (display) display.textContent = '05:00';
};

function playBentoTimerAlert() {
  const display = document.getElementById('bentoTimerDisplay');
  if (display) {
    let flashes = 0;
    const flashInterval = setInterval(() => {
      display.style.color = display.style.color === 'red' ? 'var(--primary)' : 'red';
      flashes++;
      if (flashes >= 10) {
        clearInterval(flashInterval);
        display.style.color = '';
      }
    }, 300);
  }

  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (!audioCtx) return;

    let beepCount = 0;
    const interval = setInterval(() => {
      if (beepCount >= 3) {
        clearInterval(interval);
        return;
      }
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);

      osc.start();
      osc.stop(audioCtx.currentTime + 0.3);
      beepCount++;
    }, 500);
  } catch (err) {
    console.warn("Audio Context alert blocked by browser autoplay policy:", err);
  }
}

/* ── Meal Planner Logic ── */
window.saveBentoMealPlan = function(meal, val) {
  localStorage.setItem(`cooking_gps_meal_plan_${meal}`, val);
  showTip(`Saved ${meal.charAt(0).toUpperCase() + meal.slice(1)} plan! 🍳`);
};

function initBentoMealPlan() {
  const meals = ['breakfast', 'lunch', 'dinner'];
  meals.forEach(m => {
    const val = localStorage.getItem(`cooking_gps_meal_plan_${m}`) || '';
    const input = document.getElementById(`mealInput${m.charAt(0).toUpperCase() + m.slice(1)}`);
    if (input) input.value = val;
  });
}

window.initBentoMealPlan = initBentoMealPlan;
window.renderBentoWater = renderBentoWater;

// Expose bento and ingredients logic globally for inline HTML click handlers
window.addDateToCookedHistory = addDateToCookedHistory;
window.getCookedHistory = getCookedHistory;
window.updateStreakCount = updateStreakCount;
window.renderBentoCalendar = renderBentoCalendar;
window.toggleCalendarSize = toggleCalendarSize;
window.initCalendarSize = initCalendarSize;
window.toggleDashboardEditMode = toggleDashboardEditMode;
window.toggleWidgetSize = toggleWidgetSize;
window.initAllWidgetSizes = initAllWidgetSizes;
window.toggleDateCooked = toggleDateCooked;
window.getGroceryList = getGroceryList;
window.saveGroceryList = saveGroceryList;
window.renderBentoGrocery = renderBentoGrocery;
window.addManualGroceryItem = addManualGroceryItem;
window.toggleGroceryItemChecked = toggleGroceryItemChecked;
window.deleteGroceryItem = deleteGroceryItem;
window.clearCompletedGroceryItems = clearCompletedGroceryItems;
window.renderPlayerIngredients = renderPlayerIngredients;
window.addRecipeIngredientsToGrocery = addRecipeIngredientsToGrocery;
window.mySpaceInit = mySpaceInit;

// Quick UI notification toast (Wii-style light theme)
function showTip(message) {
  const existing = document.getElementById('uiToastNotify');
  if (existing) existing.remove();
  
  const toast = document.createElement('div');
  toast.id = 'uiToastNotify';
  toast.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    background: #fff;
    border: 2px solid rgba(74,144,217,0.25);
    color: #1a3a5c;
    padding: 12px 20px;
    border-radius: 999px;
    font-size: 0.85rem;
    font-weight: 700;
    font-family: 'Nunito', sans-serif;
    box-shadow: 0 8px 24px rgba(74,144,217,0.15);
    z-index: 1000;
    opacity: 0;
    transform: translateY(20px);
    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    display: flex;
    align-items: center;
    gap: 8px;
  `;
  toast.innerHTML = `<span style="color:#4a90d9;font-size:1rem;">●</span> ${message}`;
  document.body.appendChild(toast);
  
  setTimeout(() => { toast.style.opacity = '1'; toast.style.transform = 'translateY(0)'; }, 50);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(20px)';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ----------------------------------------------------
// SUPABASE AUTH LOGIC
// ----------------------------------------------------
async function initSupabase() {
  try {
    currentUser = await getCurrentUser();
    updateUserBadge(currentUser);
    updatePlayerEditButtonVisibility();
    if (currentUser) {
      populateProfilePage(currentUser);
    } else {
      resetProfilePage();
    }
  } catch (e) {
    console.error('Initial user fetch error:', e);
  }

  onAuthChange(async (user) => {
    const hasChanged = (!currentUser && user) || (currentUser && !user) || (currentUser && user && currentUser.id !== user.id);

    currentUser = user;
    updateUserBadge(user);
    updatePlayerEditButtonVisibility();
    if (typeof activePlayerRecipeId !== 'undefined' && activePlayerRecipeId) {
      renderCommentForm(activePlayerRecipeId);
    }
    if (user) {
      loadRealRecipes();
      populateProfilePage(user);
      await window.syncFoldersWithSupabase();
      if (hasChanged) {
        showTip(`Welcome back, ${user.email.split('@')[0]}!`);
      }
      if (typeof currentView !== 'undefined') {
        if (currentView === 'grid-view') {
          renderLibrary();
        }
        if (currentView === 'my-profile') {
          openPublicProfile(user.email, 'my-profile');
        }
        if (currentView === 'profile') {
          loadProfileRecipes();
        }
      }
    } else {
      resetProfilePage();
      if (typeof currentView !== 'undefined') {
        if (currentView === 'grid-view') {
          renderLibrary();
        }
        if (currentView === 'my-profile') {
          switchView('discover');
        }
      }
    }
  });
  // Always load discover (public recipes don't require login)
  loadDiscoverRecipes();
}

function updateUserBadge(user) {
  const label = document.getElementById('userBadgeLabel');
  const avatar = document.getElementById('userAvatarCircle');
  if (!label || !avatar) return;

  if (user) {
    const initials = user.email.slice(0, 2).toUpperCase();
    label.textContent = user.email.split('@')[0];
    avatar.textContent = initials;
    avatar.style.background = 'linear-gradient(135deg,#4a90d9,#6aaee8)';
    avatar.style.color = '#fff';
  } else {
    label.textContent = 'Sign In';
    avatar.textContent = '?';
    avatar.style.background = 'rgba(74,144,217,0.1)';
    avatar.style.color = '#4a90d9';
  }
}

async function loadRealRecipes() {
  try {
    const recipes = await getPublicRecipes();
    if (!recipes || recipes.length === 0) return;
    // Update the featured recipe widget title in the bento dashboard
    const featuredTitle = document.getElementById('featuredRecipeTitle');
    if (featuredTitle && recipes[0]) {
      featuredTitle.textContent = recipes[0].title;
    }
    // Update carousel items
    const carousel = document.getElementById('recipesCarouselDeck');
    if (carousel && recipes.length > 0) {
      carousel.innerHTML = recipes.slice(0, 6).map(r => `
        <div class="folder-card-thumb" onclick="loadRecipeById('${r.id}')">
          <div class="folder-icon-glow">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
          </div>
          <div style="font-size:0.8rem;font-weight:800;color:#1a3a5c;line-height:1.3;">${r.title}</div>
          <div style="font-size:0.68rem;color:#7a9ab8;font-weight:600;">${r.creator || 'Chef'}</div>
        </div>
      `).join('');
    }
    showTip(`Loaded ${recipes.length} recipes from your library!`);
  } catch (err) {
    console.error('Failed to load recipes:', err);
  }
}

// Auth modal controls (exposed globally for HTML onclick)
window.openAuthModal = function() {
  authMode = 'signin';
  document.getElementById('authModal').style.display = 'block';
  document.getElementById('authModalBackdrop').style.display = 'block';
  document.getElementById('authError').style.display = 'none';
  document.getElementById('authEmail').value = '';
  document.getElementById('authPassword').value = '';
};

// Header User Dropdown Controls
window.toggleUserDropdown = function(event) {
  event.stopPropagation();
  if (!currentUser) {
    window.openAuthModal();
    return;
  }
  const dropdown = document.getElementById('userDropdownMenu');
  if (dropdown) {
    const isClosed = dropdown.style.display === 'none' || dropdown.style.display === '';
    dropdown.style.display = isClosed ? 'flex' : 'none';
  }
};

window.handleDropdownMySpace = function(event) {
  event.stopPropagation();
  const dropdown = document.getElementById('userDropdownMenu');
  if (dropdown) dropdown.style.display = 'none';
  switchView('profile');
};

window.handleDropdownMyChannel = function(event) {
  event.stopPropagation();
  const dropdown = document.getElementById('userDropdownMenu');
  if (dropdown) dropdown.style.display = 'none';
  switchView('my-profile');
};

window.handleDropdownSignOut = async function(event) {
  if (event) event.stopPropagation();
  const dropdown = document.getElementById('userDropdownMenu');
  if (dropdown) dropdown.style.display = 'none';
  try {
    await signOut();
  } catch (err) {
    console.warn('Sign out warning (forced local logout):', err);
  }
  currentUser = null;
  updateUserBadge(null);
  showTip('Signed out successfully.');
  window.location.reload();
};

// Dismiss dropdown when clicking elsewhere
document.addEventListener('click', () => {
  const dropdown = document.getElementById('userDropdownMenu');
  if (dropdown) dropdown.style.display = 'none';
});

window.closeAuthModal = function() {
  document.getElementById('authModal').style.display = 'none';
  document.getElementById('authModalBackdrop').style.display = 'none';
};

window.toggleAuthMode = function() {
  authMode = authMode === 'signin' ? 'signup' : 'signin';
  const isSignUp = authMode === 'signup';
  document.getElementById('authModalTitle').textContent = isSignUp ? 'Create account' : 'Welcome back!';
  document.getElementById('authModalSubtitle').textContent = isSignUp ? 'Join In The Loop today — it\'s free!' : 'Sign in to your In The Loop account';
  document.getElementById('authSubmitBtn').textContent = isSignUp ? 'Create Account' : 'Sign In';
  document.getElementById('authToggleText').textContent = isSignUp ? 'Already have an account?' : 'Don\'t have an account?';
  document.getElementById('authToggleBtn').textContent = isSignUp ? 'Sign In' : 'Sign Up';
  document.getElementById('authError').style.display = 'none';
};

window.handleAuthSubmit = async function(e) {
  e.preventDefault();
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const btn = document.getElementById('authSubmitBtn');
  const errorEl = document.getElementById('authError');

  btn.disabled = true;
  btn.textContent = 'Loading...';
  errorEl.style.display = 'none';

  try {
    if (authMode === 'signin') {
      await signIn(email, password);
    } else {
      await signUp(email, password);
      showTip('Account created! Check your email to confirm.');
    }
    window.closeAuthModal();
  } catch (err) {
    errorEl.textContent = err.message || 'Something went wrong. Please try again.';
    errorEl.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = authMode === 'signin' ? 'Sign In' : 'Create Account';
  }
};

// ----------------------------------------------------
// DISCOVER & PROFILE DATA LOADERS
// ----------------------------------------------------
let allDiscoverRecipes = [];
let allMyRecipes = [];

async function loadDiscoverRecipes() {
  try {
    const recipes = await getPublicRecipes();
    allDiscoverRecipes = recipes || [];
    renderDiscoverGrid(allDiscoverRecipes);
  } catch (err) {
    console.error('Discover load error:', err);
    const grid = document.getElementById('discoverGrid');
    if (grid) grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:2rem;color:var(--text-muted);font-weight:700;">Could not load recipes. Check your connection.</div>';
  }
}

async function loadProfileRecipes() {
  if (!currentUser) {
    document.getElementById('profileGrid').innerHTML =
      '<div style="grid-column:1/-1;text-align:center;padding:3rem;color:var(--text-muted);font-weight:700;">Sign in to see your recipes</div>';
    return;
  }
  try {
    const { getUserAllRecipes } = await import('./supabase-client.js');
    allMyRecipes = await getUserAllRecipes(currentUser.email);
    renderProfileGrid(allMyRecipes);
    // Update stats
    const totalEl  = document.getElementById('profileRecipeCount');
    const pubEl    = document.getElementById('profilePublicCount');
    const draftCount  = allMyRecipes.filter(r => r.is_draft).length;
    const publicCount = allMyRecipes.filter(r => r.is_published && !r.private_recipe && !r.is_draft).length;
    if (totalEl) totalEl.textContent = allMyRecipes.length;
    if (pubEl)   pubEl.textContent   = publicCount;
  } catch (err) {
    console.error('Profile load error:', err);
    document.getElementById('profileGrid').innerHTML =
      '<div style="grid-column:1/-1;text-align:center;padding:3rem;color:var(--text-muted);font-weight:700;">Could not load recipes</div>';
  }
}

function renderProfileGrid(recipes) {
  const grid = document.getElementById('profileGrid');
  if (!grid) return;
  if (!recipes || recipes.length === 0) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:3rem;color:var(--text-muted);font-weight:700;">No recipes yet — go create your first one! 🍳</div>';
    return;
  }
  grid.innerHTML = recipes.map(r => renderRecipeCard(r, true)).join('');
}

function renderDiscoverGrid(recipes) {
  const grid  = document.getElementById('discoverGrid');
  const empty = document.getElementById('discoverEmpty');
  const count = document.getElementById('discoverCount');
  if (!grid) return;
  if (!recipes || recipes.length === 0) {
    grid.innerHTML = '';
    if (empty) empty.style.display = 'block';
    if (count) count.textContent = '0 recipes';
    return;
  }
  if (empty) empty.style.display = 'none';
  if (count) count.textContent = `${recipes.length} recipe${recipes.length !== 1 ? 's' : ''}`;
  grid.innerHTML = recipes.map(r => renderRecipeCard(r, false)).join('');
}

// ══════════════════════════════════════════════════════════════════════════════
// 📸 PUBLIC CREATOR PROFILE — Instagram-style
// ══════════════════════════════════════════════════════════════════════════════

let pubCurrentCreator = null;
let pubHeroRecipe     = null;
let pubPreviousView   = 'discover';
let pubFromTab        = false;
let pubLightboxIdx    = 0;

// Helper to format relative time (e.g. "3 days ago")
function getRelativeTime(dateString) {
  if (!dateString) return 'recently';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  if (isNaN(diffMs)) return 'recently';
  
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffMonths / 12);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return diffMins === 1 ? '1 minute ago' : `${diffMins} minutes ago`;
  if (diffHours < 24) return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;
  if (diffDays < 30) return diffDays === 1 ? '1 day ago' : `${diffDays} days ago`;
  if (diffMonths < 12) return diffMonths === 1 ? '1 month ago' : `${diffMonths} months ago`;
  return diffYears === 1 ? '1 year ago' : `${diffYears} years ago`;
}

// Generate consistent mock stats based on creator email
function getCreatorStats(email) {
  let hash = 0;
  if (email) {
    for (let i = 0; i < email.length; i++) {
      hash = email.charCodeAt(i) + ((hash << 5) - hash);
    }
  }
  hash = Math.abs(hash);
  
  // Subscribers count: between 50 and 1500
  const subsCount = (hash % 1450) + 50;
  // Total Views: between 1200 and 35000
  const totalViews = (hash % 33800) + 1200;
  
  // Format joined date: e.g. June 2024
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const joinedMonth = months[hash % 12];
  const joinedYear = 2023 + (hash % 3); // 2023, 2024, or 2025
  
  return {
    subs: subsCount,
    views: totalViews,
    joined: `${joinedMonth} ${joinedYear}`
  };
}

// Subscribe toggle support
window.togglePubSubscribe = function() {
  if (!pubCurrentCreator || !pubCurrentCreator.email) return;
  const email = pubCurrentCreator.email;
  
  let subs = {};
  try {
    subs = JSON.parse(localStorage.getItem('cooking_gps_subscriptions') || '{}');
  } catch(e) {}
  
  const isSubbed = !!subs[email];
  if (isSubbed) {
    delete subs[email];
    showTip('Unsubscribed from creator');
  } else {
    subs[email] = true;
    showTip('Subscribed to creator! 🔔');
  }
  
  localStorage.setItem('cooking_gps_subscriptions', JSON.stringify(subs));
  
  // Refresh UI elements
  updateSubscribeUI(email);
};

function updateSubscribeUI(email) {
  let subs = {};
  try {
    subs = JSON.parse(localStorage.getItem('cooking_gps_subscriptions') || '{}');
  } catch(e) {}
  
  const isSubbed = !!subs[email];
  const subBtn = document.getElementById('pubSubscribeBtn');
  if (subBtn) {
    if (isSubbed) {
      subBtn.textContent = 'Subscribed';
      subBtn.classList.add('subscribed');
    } else {
      subBtn.textContent = 'Subscribe';
      subBtn.classList.remove('subscribed');
    }
  }
  
  // Re-display stats with updated subscriber count
  const baseStats = getCreatorStats(email);
  const totalSubs = baseStats.subs + (isSubbed ? 1 : 0);
  const formatSubs = totalSubs >= 1000 ? (totalSubs/1000).toFixed(1) + 'K' : totalSubs;
  
  const recipeCount = pubCurrentCreator ? pubCurrentCreator.recipes.length : 0;
  const subCountEl = document.getElementById('pubSubCount');
  if (subCountEl) {
    subCountEl.textContent = `@${email.split('@')[0]} • ${formatSubs} subscribers • ${recipeCount} recipes`;
  }
  
  const aboutSubsEl = document.getElementById('pubAboutStatsSubs');
  if (aboutSubsEl) {
    aboutSubsEl.innerHTML = `<span class="yt-about-stat-icon">👥</span><span>${totalSubs.toLocaleString()} subscribers</span>`;
  }
}

window.openPublicProfile = async function(creatorEmail, fromView) {
  pubPreviousView = fromView || 'discover';
  pubFromTab      = (fromView === 'my-profile');

  // Deactivate all sections properly by removing 'active' class and resetting inline display
  document.querySelectorAll('.view-section').forEach(s => {
    s.style.display = '';
    s.classList.remove('active');
  });

  const section = document.getElementById('view-public-profile');
  if (!section) return;
  section.classList.add('active');

  const backBtn = document.getElementById('pubBackBtn');
  if (backBtn) backBtn.style.display = pubFromTab ? 'none' : 'inline-flex';

  document.querySelectorAll('.view-tab').forEach(b => b.classList.remove('active'));
  if (pubFromTab) {
    const t = document.getElementById('myProfileTab');
    if (t) t.classList.add('active');
  }

  const nameEl = document.getElementById('pubName');
  if (nameEl) nameEl.textContent = 'Loading…';
  section.scrollTop = 0;
  window.scrollTo(0, 0);

  try {
    const { supabase } = await import('./supabase-client.js');
    let { data: recipes, error } = await supabase
      .from('recipes')
      .select('id, title, video_url, bundle_mode, duration, created_at, loops, steps, creator, is_published, private_recipe, text_overlays, ingredients')
      .eq('creator', creatorEmail)
      .eq('is_published', true)
      .eq('private_recipe', false)
      .order('created_at', { ascending: false });

    if (error) {
      if (error.message && (error.message.includes('bundle_mode') || error.message.includes('column'))) {
        console.warn('[Supabase] Retrying openPublicProfile without bundle_mode column');
        const retry = await supabase
          .from('recipes')
          .select('id, title, video_url, duration, created_at, loops, steps, creator, is_published, private_recipe, text_overlays, ingredients')
          .eq('creator', creatorEmail)
          .eq('is_published', true)
          .eq('private_recipe', false)
          .order('created_at', { ascending: false });
        if (retry.error) throw retry.error;
        recipes = retry.data;
      } else {
        throw error;
      }
    }

    if (recipes) {
      recipes.forEach(r => {
        r.thumbnail_url = r.bundle_mode || null;
      });
    }

    const list = recipes || [];
    pubCurrentCreator = { email: creatorEmail, recipes: list };

    const displayName = creatorEmail.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    if (nameEl) nameEl.textContent = displayName;

    // Load Bio
    const msData = (pubFromTab && currentUser && typeof mySpaceLoadData === 'function') ? mySpaceLoadData() : null;
    const bioText = (msData && msData.bio) ? msData.bio : 'Cooking creator 🍳';
    
    const bioTextEl = document.getElementById('pubBioTextSnippet');
    if (bioTextEl) bioTextEl.textContent = bioText;
    
    const aboutBioEl = document.getElementById('pubAboutBio');
    if (aboutBioEl) aboutBioEl.textContent = bioText;

    const avatarEl = document.getElementById('pubAvatar');
    if (avatarEl) avatarEl.textContent = displayName.charAt(0).toUpperCase();

    // Subscribe button configuration
    const subBtn = document.getElementById('pubSubscribeBtn');
    if (subBtn) {
      if (currentUser && creatorEmail === currentUser.email) {
        subBtn.textContent = 'Customize Workspace';
        subBtn.className = 'btn-subscribe subscribed';
        subBtn.onclick = () => switchView('profile');
      } else {
        subBtn.className = 'btn-subscribe';
        subBtn.onclick = () => togglePubSubscribe();
      }
    }

    // Refresh sub state UI
    updateSubscribeUI(creatorEmail);

    // Update About stats
    const stats = getCreatorStats(creatorEmail);
    const joinedEl = document.getElementById('pubAboutStatsJoined');
    if (joinedEl) joinedEl.innerHTML = `<span class="yt-about-stat-icon">📅</span><span>Joined ${stats.joined}</span>`;
    
    const countEl = document.getElementById('pubAboutStatsRecipes');
    if (countEl) countEl.innerHTML = `<span class="yt-about-stat-icon">🍲</span><span>${list.length} public recipes</span>`;
    
    const viewsEl = document.getElementById('pubAboutStatsViews');
    const mockViewsTotal = stats.views + (list.length * 148);
    if (viewsEl) viewsEl.innerHTML = `<span class="yt-about-stat-icon">📈</span><span>${mockViewsTotal.toLocaleString()} total views</span>`;

    // Render Home and Recipes contents
    pubRenderYTHome(list);
    pubRenderYTRecipes(list);
    
    // Switch to Home tab by default
    window.pubSwitchTab('home');

    if (typeof lucide !== 'undefined') lucide.createIcons();

  } catch (err) {
    if (nameEl) nameEl.textContent = 'Could not load profile';
    console.error('pubProfile error:', err);
  }
};

window.openMyChannel = function() {
  if (!currentUser) { openAuthModal(); return; }
  openPublicProfile(currentUser.email, 'my-profile');
};

window.pubProfileBack = function() {
  const section = document.getElementById('view-public-profile');
  if (section) section.style.display = 'none';
  switchView(pubPreviousView || 'discover');
};

window.pubSwitchTab = function(tab) {
  const homeTab = document.getElementById('pubTabHomeContent');
  const recipesTab = document.getElementById('pubTabRecipesContent');
  const aboutTab = document.getElementById('pubTabAboutContent');

  const btnHome = document.getElementById('pubTabHomeBtn');
  const btnRecipes = document.getElementById('pubTabRecipesBtn');
  const btnAbout = document.getElementById('pubTabAboutBtn');

  if (homeTab) homeTab.style.display = tab === 'home' ? 'block' : 'none';
  if (recipesTab) recipesTab.style.display = tab === 'recipes' ? 'block' : 'none';
  if (aboutTab) aboutTab.style.display = tab === 'about' ? 'block' : 'none';

  if (btnHome) btnHome.classList.toggle('active', tab === 'home');
  if (btnRecipes) btnRecipes.classList.toggle('active', tab === 'recipes');
  if (btnAbout) btnAbout.classList.toggle('active', tab === 'about');
};

function pubRenderYTRecipes(recipes) {
  const grid = document.getElementById('pubRecipesGrid');
  const noMsg = document.getElementById('pubNoRecipesMsg');
  if (!grid) return;
  if (!recipes.length) {
    grid.innerHTML = '';
    if (noMsg) noMsg.style.display = 'block';
    return;
  }
  if (noMsg) noMsg.style.display = 'none';

  grid.innerHTML = recipes.map(function(r, idx) {
    const mins = r.duration
      ? Math.floor(r.duration / 60) + ':' + String(Math.floor(r.duration % 60)).padStart(2, '0')
      : '';
    const mediaHtml = getRecipeCardThumbnail(r);
    const creatorName = r.creator.split('@')[0];
    const initial = creatorName.charAt(0).toUpperCase();
    
    // Deterministic views/date
    const viewsHash = r.id ? r.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) : 0;
    const views = viewsHash % 2 === 0 
      ? `${(viewsHash % 90) + 10}K views`
      : `${(viewsHash % 800) + 100} views`;
    const relativeTime = getRelativeTime(r.created_at);

    return `
      <div class="yt-video-card" onclick="openPubLightbox(${idx})">
        <div class="yt-thumbnail-wrapper">
          ${mediaHtml}
          ${mins ? `<div class="yt-duration-badge">${mins}</div>` : ''}
        </div>
        <div class="yt-card-info">
          <div class="yt-card-avatar">${initial}</div>
          <div class="yt-card-details">
            <h4 class="yt-card-title">${escapeHTML(r.title || 'Untitled')}</h4>
            <div class="yt-card-meta">${views} • ${relativeTime}</div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function pubRenderYTHome(recipes) {
  const featuredContainer = document.getElementById('pubHomeFeatured');
  const recentSection = document.getElementById('pubHomeRecentSection');
  const recentGrid = document.getElementById('pubHomeRecentGrid');

  if (!featuredContainer || !recentGrid) return;

  if (!recipes.length) {
    featuredContainer.innerHTML = '';
    if (recentSection) recentSection.style.display = 'none';
    recentGrid.innerHTML = '';
    return;
  }

  if (recentSection) recentSection.style.display = 'block';

  // Render Trailer Video (Index 0)
  const trailer = recipes[0];
  const durationStr = trailer.duration
    ? Math.floor(trailer.duration / 60) + ':' + String(Math.floor(trailer.duration % 60)).padStart(2, '0')
    : '';
  const mediaHtml = getRecipeCardThumbnail(trailer);
  const viewsHash = trailer.id ? trailer.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) : 0;
  const views = viewsHash % 2 === 0 
    ? `${(viewsHash % 90) + 10}K views`
    : `${(viewsHash % 800) + 100} views`;
  const relativeTime = getRelativeTime(trailer.created_at);

  featuredContainer.innerHTML = `
    <div class="yt-trailer-section">
      <div class="yt-trailer-thumbnail-container">
        <div class="yt-thumbnail-wrapper" onclick="openPubLightbox(0)" style="cursor:pointer;">
          ${mediaHtml}
          ${durationStr ? `<div class="yt-duration-badge">${durationStr}</div>` : ''}
        </div>
      </div>
      <div class="yt-trailer-details">
        <span class="yt-trailer-badge">Featured Recipe</span>
        <h2 class="yt-trailer-title">${escapeHTML(trailer.title || 'Untitled')}</h2>
        <div class="yt-trailer-meta">${views} • ${relativeTime}</div>
        <p class="yt-trailer-desc">${escapeHTML(trailer.description || 'No description provided.')}</p>
        <div class="yt-trailer-actions">
          <button onclick="pubHomeWatchTrailer()" class="btn-subscribe" style="padding:8px 18px; font-size:0.82rem;">
            ▶ Watch Guide
          </button>
          <button onclick="pubHomeAddTrailerToGrocery()" class="btn-channel-secondary">
            🛒 Add to List
          </button>
        </div>
      </div>
    </div>
  `;

  // Render Recent Grid (Index 1 to remaining)
  const recentList = recipes.slice(1);
  if (!recentList.length) {
    if (recentSection) recentSection.style.display = 'none';
    recentGrid.innerHTML = '';
  } else {
    recentGrid.innerHTML = recentList.map(function(r, index) {
      const idx = index + 1; // map back to original recipes array index
      const mins = r.duration
        ? Math.floor(r.duration / 60) + ':' + String(Math.floor(r.duration % 60)).padStart(2, '0')
        : '';
      const cardMedia = getRecipeCardThumbnail(r);
      const creatorName = r.creator.split('@')[0];
      const initial = creatorName.charAt(0).toUpperCase();
      
      const vHash = r.id ? r.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) : 0;
      const vCount = vHash % 2 === 0 
        ? `${(vHash % 90) + 10}K views`
        : `${(vHash % 800) + 100} views`;
      const relTime = getRelativeTime(r.created_at);

      return `
        <div class="yt-video-card" onclick="openPubLightbox(${idx})">
          <div class="yt-thumbnail-wrapper">
            ${cardMedia}
            ${mins ? `<div class="yt-duration-badge">${mins}</div>` : ''}
          </div>
          <div class="yt-card-info">
            <div class="yt-card-avatar">${initial}</div>
            <div class="yt-card-details">
              <h4 class="yt-card-title">${escapeHTML(r.title || 'Untitled')}</h4>
              <div class="yt-card-meta">${vCount} • ${relTime}</div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }
}

window.pubHomeWatchTrailer = function() {
  if (!pubCurrentCreator || !pubCurrentCreator.recipes || !pubCurrentCreator.recipes.length) return;
  const trailer = pubCurrentCreator.recipes[0];
  pubHeroRecipe = trailer;
  pubLightboxWatch();
};

window.pubHomeAddTrailerToGrocery = function() {
  if (!pubCurrentCreator || !pubCurrentCreator.recipes || !pubCurrentCreator.recipes.length) return;
  const trailer = pubCurrentCreator.recipes[0];
  addIngredientsListToGrocery(trailer.title, trailer.ingredients);
};

// No-op for backwards compatibility
function pubRenderGrid() {}
function pubRenderHighlights() {}

window.openPubLightbox = function(idx) {
  var r = pubCurrentCreator && pubCurrentCreator.recipes ? pubCurrentCreator.recipes[idx] : null;
  if (!r) return;
  pubLightboxIdx = idx;
  pubHeroRecipe  = r;
  var lb = document.getElementById('pubLightbox');
  if (!lb) return;
  lb.style.display = 'flex';
  var thumbEl = document.getElementById('pubLightboxThumb');
  if (thumbEl) {
    thumbEl.innerHTML = getRecipeCardThumbnail(r);
    thumbEl.style.background = 'transparent';
  }
  var displayName = pubCurrentCreator.email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
  var avatarEl = document.getElementById('pubLightboxAvatar');
  var userEl   = document.getElementById('pubLightboxUsername');
  var titleEl  = document.getElementById('pubLightboxTitle');
  var descEl   = document.getElementById('pubLightboxDesc');
  var metaEl   = document.getElementById('pubLightboxMeta');
  if (avatarEl) avatarEl.textContent = displayName.charAt(0).toUpperCase();
  if (userEl)   userEl.textContent   = displayName;
  if (titleEl)  titleEl.textContent  = r.title || 'Untitled';
  if (descEl)   descEl.textContent   = r.description || '';
  var date  = r.created_at ? new Date(r.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '';
  var steps = Array.isArray(r.loops) ? r.loops.length : (Array.isArray(r.steps) ? r.steps.length : 0);
  if (metaEl) metaEl.textContent = [date, steps ? steps + ' steps' : ''].filter(Boolean).join(' \u00b7 ');
};

window.closePubLightbox = function() {
  var lb = document.getElementById('pubLightbox');
  if (lb) lb.style.display = 'none';
};

window.pubLightboxWatch = function() {
  closePubLightbox();
  if (!pubHeroRecipe) return;
  switchView('mobile-player');
  if (typeof window.loadRecipeById === 'function') window.loadRecipeById(pubHeroRecipe.id);
};

window.pubPlayHero  = window.pubLightboxWatch;
window.pubOpenVideo = function(id) {
  if (!pubCurrentCreator || !pubCurrentCreator.recipes) return;
  var idx = pubCurrentCreator.recipes.findIndex(function(r) { return r.id === id; });
  if (idx >= 0) openPubLightbox(idx);
};

// Reusable grocery list import helper
function addIngredientsListToGrocery(title, ingredientsStr) {
  if (!ingredientsStr || !ingredientsStr.trim()) {
    showTip('This recipe has no ingredients list.');
    return;
  }
  
  const ingredients = ingredientsStr
    .split(/[\n;]/)
    .map(i => i.trim())
    .filter(i => i.length > 0);
    
  const list = getGroceryList();
  let addedCount = 0;
  
  ingredients.forEach(ing => {
    if (!list.some(item => item.text.toLowerCase() === ing.toLowerCase())) {
      list.push({
        id: 'gr_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        text: ing,
        checked: false
      });
      addedCount++;
    }
  });
  
  if (addedCount > 0) {
    saveGroceryList(list);
    showTip(`Added ${addedCount} ingredients from "${title}" to Shopping List! 🛒`);
    if (typeof renderBentoGrocery === 'function') renderBentoGrocery();
  } else {
    showTip('All ingredients are already in your Shopping List! 🛒');
  }
}

window.addIngredientsFromCard = function(recipeId) {
  let recipe = null;
  if (typeof allDiscoverRecipes !== 'undefined') {
    recipe = allDiscoverRecipes.find(rec => rec.id === recipeId);
  }
  if (!recipe && typeof allMyRecipes !== 'undefined') {
    recipe = allMyRecipes.find(rec => rec.id === recipeId);
  }
  if (!recipe && typeof pubCurrentCreator !== 'undefined' && pubCurrentCreator && pubCurrentCreator.recipes) {
    recipe = pubCurrentCreator.recipes.find(rec => rec.id === recipeId);
  }
  if (!recipe) {
    const activeData = getActiveRecipeData();
    if (activeData && activeData.id === recipeId) {
      recipe = activeData;
    }
  }
  
  if (!recipe) {
    showTip('Recipe details not found.');
    return;
  }
  
  addIngredientsListToGrocery(recipe.title, recipe.ingredients);
};

window.pubLightboxAddToGrocery = function() {
  if (!pubHeroRecipe) {
    showTip('No recipe selected.');
    return;
  }
  addIngredientsListToGrocery(pubHeroRecipe.title, pubHeroRecipe.ingredients);
};
function pubRenderSeries()    {}
function pubRenderVideoGrid() {}
function pubRenderHero()      {}

// ══════════════════════════════════════════════════════════════════════════════
// 🌟 MY SPACE — Bio, folder strip, stat badges
// ══════════════════════════════════════════════════════════════════════════════

const MY_SPACE_KEY = 'cookingGPS_myspace_v1';

function mySpaceLoadData() {
  try { return JSON.parse(localStorage.getItem(MY_SPACE_KEY) || '{}'); } catch { return {}; }
}
function mySpaceSaveData(data) {
  localStorage.setItem(MY_SPACE_KEY, JSON.stringify(data));
}

// ── Bio editing ──────────────────────────────────────────────────────────
window.mySpaceEditBio = function() {
  if (!currentUser) { openAuthModal(); return; }
  const bGrid = document.getElementById('profileBentoGrid');
  if (bGrid && !bGrid.classList.contains('dashboard-editing')) {
    showTip("Please click 'Customize Layout' to edit your bio.");
    return;
  }
  const display = document.getElementById('mySpaceBioDisplay');
  const input   = document.getElementById('mySpaceBioInput');
  if (!input) return;
  const data = mySpaceLoadData();
  input.value = data.bio || '';
  if (display) display.style.display = 'none';
  input.style.display = 'block';
  input.focus();
};

window.mySpaceSaveBio = function() {
  const input   = document.getElementById('mySpaceBioInput');
  const bioText = document.getElementById('mySpaceBioText');
  const display = document.getElementById('mySpaceBioDisplay');
  if (!input) return;
  const bio = input.value.trim();
  const data = mySpaceLoadData();
  data.bio = bio;
  mySpaceSaveData(data);
  if (bioText) bioText.textContent = bio || 'Click to add a bio…';
  if (bioText) bioText.style.fontStyle = bio ? 'normal' : 'italic';
  input.style.display = 'none';
  if (display) display.style.display = '';
};

// ── Folder strip ─────────────────────────────────────────────────────────
function mySpaceRenderFolderStrip() {
  const strip = document.getElementById('mySpaceFolderStrip');
  const countEl = document.getElementById('mySpaceFolderCount');
  if (!strip) return;

  // Load library state
  let libData = { folders: [] };
  try {
    const raw = localStorage.getItem('cookingGPS_library_v1');
    const parsed = raw ? JSON.parse(raw) : null;
    libData = (parsed && typeof parsed === 'object') ? parsed : { folders: [] };
  } catch {}
  const folders = (libData && Array.isArray(libData.folders) ? libData.folders : []).filter(f => f && typeof f === 'object');

  if (countEl) countEl.textContent = folders.length || '0';

  // Apply responsive bento grid layout styles to the strip container
  const isMobile = window.innerWidth <= 768;
  const currentHeight = localStorage.getItem('cookingGPS_folders_height') || 'bento';
  
  strip.style.display = 'grid';
  strip.style.gridTemplateColumns = isMobile ? '1fr' : 'repeat(3, 1fr)';
  strip.style.gridAutoRows = currentHeight === 'bento' ? '240px' : '160px'; // Match row height based on global choice setting
  strip.style.gap = isMobile ? '1rem' : '1.25rem';
  strip.style.overflowX = 'visible';
  strip.style.padding = '0';
  strip.style.margin = '10px 0 0 0';

  // Update toggle button text if it exists
  const heightToggleBtn = document.getElementById('foldersHeightToggleBtn');
  if (heightToggleBtn) {
    heightToggleBtn.textContent = `↕ Height: ${currentHeight === 'bento' ? 'Bento (240px)' : 'Standard (160px)'}`;
  }

  const addBtn = `
    <div class="bento-widget span-1" style="background:rgba(255,255,255,0.75);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:2px dashed var(--border-card);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;cursor:pointer;height:100%;box-sizing:border-box;" onclick="libCreateFolder()">
      <div style="font-size:1.8rem;">➕</div>
      <div style="font-size:0.85rem;font-weight:800;color:var(--text-muted);">New Folder</div>
    </div>
  `;

  if (!folders.length) {
    strip.innerHTML = addBtn;
    return;
  }

  const isEditing = document.getElementById('profileBentoGrid')?.classList.contains('dashboard-editing');

  strip.innerHTML = folders.map(f => {
    const count = (f.recipeIds || []).length;
    
    // Default size is small
    const size = f.size || 'small';
    let spanClass = 'span-1';
    let sizeLabel = 'Small';
    if (!isMobile) {
      if (size === 'medium') {
        spanClass = 'span-2';
        sizeLabel = 'Medium';
      } else if (size === 'large' || size === 'row') {
        spanClass = 'span-3';
        sizeLabel = size === 'row' ? 'Row' : 'Large';
      }
    }

    const colorVal = f.color || '#4a90d9';

    // Premium glowing folder SVG icon using Lucide style folder shape
    const folderIconSvg = `
      <svg width="40" height="40" viewBox="0 0 24 24" fill="${colorVal}" fill-opacity="0.15" stroke="${colorVal}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.05)); margin-bottom:auto; flex-shrink:0;">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
      </svg>
    `;

    let clickHandler = `window.libOpenFolderId='${f.id}'; switchView('grid-view')`;
    let editOverlay = '';
    let editClass = '';

    if (isEditing) {
      clickHandler = 'event.stopPropagation();';
      editClass = 'dashboard-folder-editing';
      editOverlay = `
        <div class="folder-edit-controls" style="position:absolute;top:12px;right:12px;display:flex;gap:4px;z-index:10;" onclick="event.stopPropagation()">
          <button onclick="event.stopPropagation(); toggleFolderSize('${f.id}')" title="Change size (${sizeLabel})"
            style="background:rgba(255,255,255,0.7);border:none;border-radius:6px;width:22px;height:22px;font-size:0.65rem;cursor:pointer;display:flex;align-items:center;justify-content:center;font-weight:bold;box-shadow:0 1px 3px rgba(0,0,0,0.15)">↔</button>
          <button onclick="event.stopPropagation(); toggleFolderColor('${f.id}')" title="Change color"
            style="background:rgba(255,255,255,0.7);border:none;border-radius:6px;width:22px;height:22px;font-size:0.65rem;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 3px rgba(0,0,0,0.15)">🎨</button>
          <button onclick="event.stopPropagation(); mySpaceRenameFolder('${f.id}')" title="Rename folder"
            style="background:rgba(255,255,255,0.7);border:none;border-radius:6px;width:22px;height:22px;font-size:0.65rem;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 3px rgba(0,0,0,0.15)">✏️</button>
          <button onclick="event.stopPropagation(); mySpaceDeleteFolder('${f.id}')" title="Delete folder"
            style="background:rgba(255,255,255,0.7);border:none;border-radius:6px;width:22px;height:22px;font-size:0.65rem;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 3px rgba(0,0,0,0.15)">🗑️</button>
        </div>
      `;
    }

    if (size === 'row') {
      const folderRecipes = (f.recipeIds || []).map(rid => {
        return (typeof allMyRecipes !== 'undefined' && allMyRecipes) ? allMyRecipes.find(r => r.id === rid) : null;
      }).filter(Boolean);

      const recipesHtml = folderRecipes.map(r => {
        let miniThumb = '';
        if (r.thumbnail_url) {
          miniThumb = `<img src="${encodeURI(r.thumbnail_url)}" alt="" style="width:100%;height:100%;object-fit:cover;display:block;">`;
        } else {
          const hash = r.id ? r.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) : 0;
          const gradients = ['#ff6b6b','#4facfe','#43e97b','#fa709a','#30cfd0','#f093fb'];
          const grad = gradients[hash % gradients.length];
          miniThumb = `<div style="width:100%;height:100%;background:${grad};display:flex;align-items:center;justify-content:center;font-size:1.2rem;color:#fff;">🎬</div>`;
        }
        return `
          <div onclick="event.stopPropagation(); loadRecipeById('${r.id}')"
            style="width:110px;flex-shrink:0;cursor:pointer;display:flex;flex-direction:column;gap:6px;transition:transform 0.15s;text-align:left;"
            onmouseenter="this.style.transform='translateY(-2px)'" onmouseleave="this.style.transform=''">
            <div style="height:80px;border-radius:12px;overflow:hidden;position:relative;border:1.5px solid rgba(0,0,0,0.08);background:#000;">
              ${miniThumb}
            </div>
            <div style="font-size:0.72rem;font-weight:800;color:rgba(20,20,50,0.85);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;padding:0 2px;">
              ${escapeHTML(r.title || 'Untitled')}
            </div>
          </div>
        `;
      }).join('');

      const rightPane = `
        <div style="width:2px;background:rgba(20,20,50,0.08);align-self:stretch;margin:6px 0;flex-shrink:0;"></div>
        <div style="flex:1;display:flex;gap:12px;overflow-x:auto;scrollbar-width:none;align-items:center;padding:0 4px;min-width:0;height:100%;">
          ${recipesHtml || `<div style="font-size:0.75rem;font-weight:700;color:rgba(20,20,50,0.4);display:flex;align-items:center;padding-left:10px;">Folder is empty. Add recipes from your library!</div>`}
        </div>
      `;

      return `
        <div onclick="${clickHandler}" class="bento-widget ${spanClass} ${editClass}"
          style="height:100%;display:flex;flex-direction:row;gap:20px;position:relative;cursor:pointer;text-align:left;box-sizing:border-box;"
          onmouseenter="if(!${isEditing}) this.style.transform='translateY(-2px)'" onmouseleave="if(!${isEditing}) this.style.transform=''">
          ${editOverlay}
          <div style="width:130px;flex-shrink:0;display:flex;flex-direction:column;justify-content:space-between;min-width:0;">
            ${folderIconSvg}
            <div style="margin-top:auto;">
              <div style="font-weight:900;font-size:0.95rem;color:rgba(20,20,50,0.85);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;">${f.name}</div>
              <div style="font-size:0.72rem;font-weight:700;color:rgba(20,20,50,0.5);margin-top:2px;">${count} recipe${count!==1?'s':''}</div>
            </div>
          </div>
          ${rightPane}
        </div>
      `;
    }

    return `
      <div onclick="${clickHandler}" class="bento-widget ${spanClass} ${editClass}"
        style="height:100%;display:flex;flex-direction:column;position:relative;cursor:pointer;text-align:left;box-sizing:border-box;"
        onmouseenter="if(!${isEditing}) this.style.transform='translateY(-4px)'" onmouseleave="if(!${isEditing}) this.style.transform=''">
        ${editOverlay}
        ${folderIconSvg}
        <div style="margin-top:auto;">
          <div style="font-weight:900;font-size:0.95rem;color:rgba(20,20,50,0.85);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;">${f.name}</div>
          <div style="font-size:0.72rem;font-weight:700;color:rgba(20,20,50,0.5);margin-top:2px;">${count} recipe${count!==1?'s':''}</div>
        </div>
      </div>
    `;
  }).join('') + addBtn;
}

window.toggleFolderSize = function(folderId) {
  let libData = { folders: [] };
  try {
    const raw = localStorage.getItem('cookingGPS_library_v1');
    const parsed = raw ? JSON.parse(raw) : null;
    libData = (parsed && typeof parsed === 'object') ? parsed : { folders: [] };
  } catch {}
  
  if (!libData.folders) libData.folders = [];
  const folder = libData.folders.find(f => f.id === folderId);
  if (!folder) return;
  
  // Cycle sizes: small -> medium -> large -> row -> small
  const sizeMap = {
    'small': 'medium',
    'medium': 'large',
    'large': 'row',
    'row': 'small'
  };
  folder.size = sizeMap[folder.size || 'small'] || 'small';
  
  localStorage.setItem('cookingGPS_library_v1', JSON.stringify(libData));
  
  // Sync the global libState in app.js
  if (typeof libState !== 'undefined' && libState && libState.folders) {
    const fState = libState.folders.find(f => f.id === folderId);
    if (fState) fState.size = folder.size;
  }
  
  mySpaceRenderFolderStrip();
  showTip(`Folder size changed to ${folder.size.charAt(0).toUpperCase() + folder.size.slice(1)}`);
};

window.toggleFoldersGlobalHeight = function() {
  const current = localStorage.getItem('cookingGPS_folders_height') || 'bento';
  const next = current === 'bento' ? 'standard' : 'bento';
  localStorage.setItem('cookingGPS_folders_height', next);
  mySpaceRenderFolderStrip();
  showTip(`Folders height layout toggled to ${next === 'bento' ? 'Bento (240px)' : 'Standard (160px)'}`);
};

window.toggleFolderColor = function(folderId) {
  let libData = { folders: [] };
  try {
    const raw = localStorage.getItem('cookingGPS_library_v1');
    const parsed = raw ? JSON.parse(raw) : null;
    libData = (parsed && typeof parsed === 'object') ? parsed : { folders: [] };
  } catch {}
  
  if (!libData.folders) libData.folders = [];
  const folder = libData.folders.find(f => f.id === folderId);
  if (!folder) return;
  
  // Cycle colors using FOLDER_COLORS
  const currentColor = folder.color || '#4a90d9';
  let currentIndex = FOLDER_COLORS.indexOf(currentColor);
  if (currentIndex === -1) {
    currentIndex = 0;
  }
  const nextIndex = (currentIndex + 1) % FOLDER_COLORS.length;
  folder.color = FOLDER_COLORS[nextIndex];
  
  localStorage.setItem('cookingGPS_library_v1', JSON.stringify(libData));
  
  // Sync the global libState in app.js
  if (typeof libState !== 'undefined' && libState && libState.folders) {
    const fState = libState.folders.find(f => f.id === folderId);
    if (fState) fState.color = folder.color;
  }
  
  mySpaceRenderFolderStrip();
  showTip(`Folder color customized.`);
};

window.mySpaceRenameFolder = function(folderId) {
  let libData = { folders: [] };
  try {
    const raw = localStorage.getItem('cookingGPS_library_v1');
    const parsed = raw ? JSON.parse(raw) : null;
    libData = (parsed && typeof parsed === 'object') ? parsed : { folders: [] };
  } catch {}
  
  if (!libData.folders) libData.folders = [];
  const folder = libData.folders.find(f => f.id === folderId);
  if (!folder) return;
  
  const newName = prompt("Enter a new name for the folder:", folder.name);
  if (newName === null) return;
  const cleaned = newName.trim();
  if (!cleaned) {
    showTip("Folder name cannot be empty.");
    return;
  }
  
  if (cleaned.toLowerCase() !== folder.name.toLowerCase()) {
    if (libData.folders.some(f => f.name.toLowerCase() === cleaned.toLowerCase())) {
      alert("A folder with this name already exists.");
      return;
    }
  }
  
  folder.name = cleaned;
  localStorage.setItem('cookingGPS_library_v1', JSON.stringify(libData));
  
  // Sync the global libState in app.js
  if (typeof libState !== 'undefined' && libState && libState.folders) {
    const fState = libState.folders.find(f => f.id === folderId);
    if (fState) fState.name = folder.name;
  }
  
  mySpaceRenderFolderStrip();
  showTip("Folder renamed.");
};

window.mySpaceDeleteFolder = function(folderId) {
  let libData = { folders: [] };
  try {
    const raw = localStorage.getItem('cookingGPS_library_v1');
    const parsed = raw ? JSON.parse(raw) : null;
    libData = (parsed && typeof parsed === 'object') ? parsed : { folders: [] };
  } catch {}
  
  if (!libData.folders) libData.folders = [];
  const folder = libData.folders.find(f => f.id === folderId);
  if (!folder) return;
  
  const count = (folder.recipeIds || []).length;
  const confirmMsg = count > 0 
    ? `Are you sure you want to delete folder "${folder.name}"? The ${count} recipe(s) inside will remain in your library as loose recipes.`
    : `Are you sure you want to delete folder "${folder.name}"?`;
    
  if (!confirm(confirmMsg)) return;
  
  libData.folders = libData.folders.filter(f => f.id !== folderId);
  localStorage.setItem('cookingGPS_library_v1', JSON.stringify(libData));
  
  // Sync the global libState in app.js
  if (typeof libState !== 'undefined' && libState && libState.folders) {
    libState.folders = libState.folders.filter(f => f.id !== folderId);
  }
  
  mySpaceRenderFolderStrip();
  showTip("Folder deleted.");
};



window.filterProfileRecipes = function(filter) {
  // Update active tab styling
  ['All','Public','Private','Draft'].forEach(t => {
    const btn = document.getElementById(`profileTab${t}`);
    if (!btn) return;
    btn.className = 'btn';
    btn.style.background = '';
    btn.style.color = '';
  });
  const activeId = `profileTab${filter.charAt(0).toUpperCase() + filter.slice(1)}`;
  const activeBtn = document.getElementById(activeId);
  if (activeBtn) { activeBtn.className = 'btn btn-primary'; }

  let filtered = allMyRecipes || [];
  if (filter === 'public')  filtered = filtered.filter(r => r.is_published && !r.private_recipe && !r.is_draft);
  if (filter === 'private') filtered = filtered.filter(r => !r.is_published && !r.is_draft);
  if (filter === 'draft')   filtered = filtered.filter(r => r.is_draft);
  renderProfileGrid(filtered);
};

function renderRecipeCard(r, isOwner) {
  const isDraft   = r.is_draft;
  const isPublic  = r.is_published && !r.private_recipe && !isDraft;
  const isPrivate = !r.is_published && !isDraft;
  const stepCount = Array.isArray(r.steps) ? r.steps.length : 0;
  const mins      = r.duration ? Math.floor(r.duration / 60) : 0;

  // Status badge (will be absolute positioned over the thumbnail)
  let badge = '';
  if (isDraft) {
    badge = `<span style="background:#fff8e1;color:#b45309;border:1.5px solid #fde68a;padding:3px 10px;border-radius:6px;font-size:0.65rem;font-weight:800;">📝 Draft</span>`;
  } else if (isPublic) {
    badge = `<span style="background:#dcfce7;color:#15803d;border:1.5px solid #bbf7d0;padding:3px 10px;border-radius:6px;font-size:0.65rem;font-weight:800;">🌎 Public</span>`;
  } else {
    badge = `<span style="background:#e0f2fe;color:#0369a1;border:1.5px solid #bae6fd;padding:3px 10px;border-radius:6px;font-size:0.65rem;font-weight:800;">🔒 Private</span>`;
  }

  // Thumbnail markup
  let thumbHtml = getRecipeCardThumbnail(r);

  // Owner action buttons
  let ownerActions = '';
  if (isOwner) {
    if (isDraft) {
      ownerActions = `
        <div style="display:flex;gap:6px;margin-top:10px;border-top:1.5px solid var(--border-card);padding-top:10px;">
          <button onclick="event.stopPropagation();publishDraft('${r.id}')"
            style="flex:1;background:var(--green);color:#fff;border:none;border-radius:10px;padding:9px;font-family:var(--font);font-size:0.78rem;font-weight:800;cursor:pointer;">
            🚀 Publish
          </button>
          <button onclick="event.stopPropagation();deleteRecipeById('${r.id}')"
            style="background:#fff0f0;color:#e55;border:1.5px solid #fcc;border-radius:10px;padding:9px 12px;font-family:var(--font);font-size:0.78rem;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;">
            🗑️
          </button>
        </div>`;
    } else if (isPublic) {
      ownerActions = `
        <div style="display:flex;gap:6px;margin-top:10px;border-top:1.5px solid var(--border-card);padding-top:10px;">
          <button onclick="event.stopPropagation();toggleRecipePublish('${r.id}', true)"
            style="flex:1;background:#fff0f0;color:#c00;border:1.5px solid #fcc;border-radius:10px;padding:9px;font-family:var(--font);font-size:0.78rem;font-weight:800;cursor:pointer;">
            🔒 Make Private
          </button>
        </div>`;
    } else {
      ownerActions = `
        <div style="display:flex;gap:6px;margin-top:10px;border-top:1.5px solid var(--border-card);padding-top:10px;">
          <button onclick="event.stopPropagation();toggleRecipePublish('${r.id}', false)"
            style="flex:1;background:var(--green);color:#fff;border:none;border-radius:10px;padding:9px;font-family:var(--font);font-size:0.78rem;font-weight:800;cursor:pointer;">
            🌎 Make Public
          </button>
          <button onclick="event.stopPropagation();deleteRecipeById('${r.id}')"
            style="background:#fff0f0;color:#e55;border:1.5px solid #fcc;border-radius:10px;padding:9px 12px;font-family:var(--font);font-size:0.78rem;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;">
            🗑️
          </button>
        </div>`;
    }
  }

  // Duration & steps badge at bottom right of thumbnail
  const durationBadge = `
    <div style="position:absolute;bottom:8px;right:8px;background:rgba(0,0,0,0.78);color:#fff;font-size:0.65rem;font-weight:800;padding:3px 8px;border-radius:6px;display:flex;gap:6px;align-items:center;backdrop-filter:blur(4px);">
      ${stepCount ? `<span>📋 ${stepCount} steps</span>` : ''}
      ${mins ? `<span>⏱ ${mins} min</span>` : ''}
    </div>`;

  return `
    <div class="glass-card" style="cursor:pointer;transition:transform 0.2s,box-shadow 0.2s;padding:0;overflow:hidden;border-radius:18px;background:#fff;"
      onmouseenter="this.style.transform='translateY(-4px)';this.style.boxShadow='0 16px 40px rgba(74,144,217,0.18)'"
      onmouseleave="this.style.transform='';this.style.boxShadow=''"
      onclick="loadRecipeById('${r.id}')">  
      
      <!-- Thumbnail Header -->
      <div style="position:relative;height:150px;background:#111;overflow:hidden;">
        ${thumbHtml}
        <!-- Top Left Status Badge -->
        <div style="position:absolute;top:10px;left:10px;z-index:10;">
          ${badge}
        </div>
        <!-- Bottom Right Info Overlay -->
        ${durationBadge}
      </div>

      <!-- Card Details Body -->
      <div style="padding:14px 16px;">
        <h3 style="font-size:0.95rem;font-weight:900;color:var(--text-heading);margin-bottom:6px;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
          ${r.title || 'Untitled Recipe'}
        </h3>
        <p style="font-size:0.75rem;color:var(--text-muted);font-weight:600;margin:0;display:flex;justify-content:space-between;align-items:center;">
          <span>
            ${!isOwner && r.creator
              ? `<span onclick="event.stopPropagation();openPublicProfile('${r.creator}','discover')"
                   style="color:var(--primary);font-weight:700;cursor:pointer;text-decoration:none;"
                   onmouseenter="this.style.textDecoration='underline'" onmouseleave="this.style.textDecoration='none'">
                   📺 ${r.creator.split('@')[0]}
                 </span>`
              : `by ${r.creator || 'Chef'}`
            }
          </span>
          ${r.ingredients ? `
            <button onclick="event.stopPropagation(); window.addIngredientsFromCard('${r.id}')"
              style="background:rgba(74,144,217,0.1); border:none; border-radius:8px; padding:4px 8px; color:var(--primary); font-family:var(--font); font-size:0.7rem; font-weight:800; cursor:pointer; display:flex; align-items:center; gap:4px; transition:all 0.2s;"
              onmouseenter="this.style.background='var(--primary)'; this.style.color='#fff';"
              onmouseleave="this.style.background='rgba(74,144,217,0.1)'; this.style.color='var(--primary)';"
              title="Add ingredients to Shopping List">
              🛒 Add List
            </button>
          ` : ''}
        </p>
        ${ownerActions}
      </div>
    </div>
  `;
}



window.toggleRecipePublish = async function(id, currentlyPublic) {
  try {
    const { updateRecipe } = await import('./supabase-client.js');
    if (currentlyPublic) {
      // Make private
      await updateRecipe(id, { is_published: false, private_recipe: true, shared_on_profile: false });
      showTip('Recipe is now private 🔒');
    } else {
      // Pre-publish check
      const recipe = allMyRecipes.find(r => r.id === id);
      if (recipe && (!recipe.title || recipe.title === 'Untitled Recipe')) {
        showTip('Add a title before publishing!');
        return;
      }
      await updateRecipe(id, { is_published: true, private_recipe: false, is_draft: false, shared_on_profile: true });
      showTip('Recipe is now public 🌎');
    }
    await loadProfileRecipes();
  } catch (err) {
    showTip('Could not update: ' + err.message);
  }
};

// Publish a draft
window.publishDraft = async function(id) {
  try {
    const { updateRecipe } = await import('./supabase-client.js');
    const recipe = allMyRecipes.find(r => r.id === id);
    if (recipe && (!recipe.title || recipe.title === 'Untitled Recipe')) {
      showTip('Add a title before publishing!');
      return;
    }
    if (recipe && (!recipe.steps || recipe.steps.length === 0)) {
      showTip('Add at least one step before publishing!');
      return;
    }
    await updateRecipe(id, { is_published: true, private_recipe: false, is_draft: false, shared_on_profile: true });
    showTip('Recipe published! 🌎');
    await loadProfileRecipes();
  } catch (err) {
    showTip('Could not publish: ' + err.message);
  }
};

// Delete a recipe
window.deleteRecipeById = async function(id) {
  if (!confirm('Delete this recipe? This cannot be undone.')) return;
  try {
    const { deleteRecipeById } = await import('./supabase-client.js');
    await deleteRecipeById(id);
    showTip('Recipe deleted.');
    await loadProfileRecipes();
  } catch (err) {
    showTip('Could not delete: ' + err.message);
  }
};

// Save as Draft (from Create view)
window.saveDraft = async function() {
  const titleInput = document.getElementById('newRecipeTitleInput');
  const title = titleInput?.value?.trim() || 'Untitled Draft';
  if (!currentUser) { showTip('Sign in to save drafts.'); window.openAuthModal(); return; }

  const btn = document.getElementById('saveDraftBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving draft...'; }

  try {
    const videoEl = document.getElementById('uploadedVideoPlayer');
    // Build video_url: prefer CF Stream, upload to Supabase if CF is not configured, fall back to local blob
    let videoUrl = null;
    if (uploadedVideoUID) {
      videoUrl = `https://videodelivery.net/${uploadedVideoUID}/manifest/video.m3u8`;
    } else if (uploadedFile) {
      if (btn) btn.textContent = 'Uploading video file...';
      try {
        const { uploadVideo } = await import('./supabase-client.js');
        const supabaseUrl = await uploadVideo(uploadedFile, currentUser.email);
        if (supabaseUrl) {
          videoUrl = supabaseUrl;
        }
      } catch (upErr) {
        console.error('Supabase video upload failed:', upErr);
        showTip('⚠️ Supabase Video upload failed. Please ensure you have created a public bucket named "videos" in your Supabase dashboard.');
        throw new Error('Supabase video upload failed: ' + upErr.message);
      }
    } else {
      // No video uploaded (remix or empty)
      videoUrl = null;
    }

    const { createRecipe } = await import('./supabase-client.js');
    const thumbnailUrl = await ensureThumbnailUrl();
    await createRecipe({
      title,
      creator:  currentUser.email,
      duration: videoEl?.duration || 0,
      steps:    createStepsArr.map(s => s.label),
      // Save full loop objects so viewers get exact AI-detected start+end times
      loops:    createStepsArr.map(s => ({
        start:       s.time,
        end:         s.endTime ?? null,
        label:       s.label,
        description: s.description || '',
        ingredients: s.ingredients || [],
        audio_url:   s.audio_url || s.audioUrl || '',
        timer:       s.timer,
        timers:      s.timers || (s.timer ? [{ duration: Number(s.timer), label: 'Timer 1' }] : [])
      })),
      video_url: videoUrl,
      thumbnail_url: thumbnailUrl,
      is_draft: true,
      text_overlays: cachedSegments || [],
    });

    const msg = document.getElementById('savedRecipeMsg');
    if (msg) msg.textContent = `"${title}" saved as a draft — finish it later on My Page 📝`;
    document.getElementById('createStage2').style.display = 'none';
    document.body.classList.remove('mobile-editing-active');
    document.getElementById('createStage3').style.display = 'block';
    showTip(`Draft "${title}" saved!`);
  } catch (err) {
    showTip('Could not save draft: ' + err.message);
    if (btn) { btn.disabled = false; btn.textContent = '💾 Save as Draft'; }
  }
};


function populateProfilePage(user) {
  const name   = document.getElementById('profileName');
  const email  = document.getElementById('profileEmail');
  const avatar = document.getElementById('profileAvatarLarge');
  const initials = user.email.slice(0, 2).toUpperCase();
  if (name)   name.textContent  = user.email.split('@')[0];
  if (email)  email.textContent = user.email;
  if (avatar) avatar.textContent = initials;
}

function resetProfilePage() {
  const name   = document.getElementById('profileName');
  const email  = document.getElementById('profileEmail');
  const avatar = document.getElementById('profileAvatarLarge');
  const total  = document.getElementById('profileRecipeCount');
  const pub    = document.getElementById('profilePublicCount');
  if (name)   name.textContent  = 'Not signed in';
  if (email)  email.textContent = 'Sign in to see your profile';
  if (avatar) avatar.textContent = '?';
  if (total)  total.textContent  = '—';
  if (pub)    pub.textContent    = '—';
  const grid = document.getElementById('profileGrid');
  if (grid) grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:3rem;color:var(--text-muted);font-weight:700;">Sign in to see your recipes</div>';
}



// ============================================================
// PHASE 6 — MULTI-VIDEO GRID VIEW
// ============================================================
let gridCurrentRecipe   = null;   // loaded recipe object
let gridCurrentLayout   = 1;      // 1, 2, or 4 columns
let gridExpandedIndex   = null;   // which step is expanded
let gridStepIntervals   = [];     // loop interval IDs per tile

const GRID_STEP_COLORS = ['#a8d8f0','#b8f0c8','#f0d8a8','#d8b8f0','#f0b8c8','#a8f0e8','#f0ebb8','#c8b8f0'];

// Populate recipe picker dropdown when grid view opens
async function initGridView() {
  const picker = document.getElementById('gridRecipePicker');
  if (!picker) return;

  try {
    const { getPublicRecipes } = await import('./supabase-client.js');
    let recipes = await getPublicRecipes();

    // Also include the user's own private/draft recipes if signed in
    if (currentUser) {
      const { getUserAllRecipes } = await import('./supabase-client.js');
      const mine = await getUserAllRecipes(currentUser.email);
      // Merge avoiding duplicates
      const ids = new Set(recipes.map(r => r.id));
      mine.forEach(r => { if (!ids.has(r.id) && !r.is_draft) recipes.push(r); });
    }

    picker.innerHTML = '<option value="">— Pick a recipe to view in grid —</option>';
    recipes.forEach(r => {
      const stepCount = Array.isArray(r.steps) ? r.steps.length : 0;
      if (stepCount === 0) return; // skip recipes with no steps
      const opt = document.createElement('option');
      opt.value = r.id;
      opt.textContent = `${r.title} (${stepCount} steps)`;
      picker.appendChild(opt);
    });

    // Auto-load if a recipe is already selected
    if (gridCurrentRecipe) picker.value = gridCurrentRecipe.id;
  } catch (err) {
    console.error('[Grid] Init error:', err);
  }
}

// Load a recipe into the grid
window.loadGridRecipe = async function(recipeId) {
  if (!recipeId) return;
  stopAllGridLoops();

  try {
    const { getRecipeById } = await import('./supabase-client.js');
    const recipe = await getRecipeById(recipeId);
    gridCurrentRecipe = recipe;
    renderGridTiles(recipe);
    await loadUserLoops(recipeId);
    activeLoopVersion = 'creator';

    // Show Phase 7 loop toggle
    const lt = document.getElementById('gridLoopToggle');
    if (lt) lt.style.display = 'block';
    // Show Phase 8e progress section
    const ps = document.getElementById('gridProgressSection');
    if (ps) ps.style.display = 'block';
    const total = document.getElementById('gridProgressTotal');
    const loops = Array.isArray(recipe.loops) ? recipe.loops : [];
    if (total) total.textContent = loops.length;
    updateProgressBar(recipe.id);
  } catch (err) {
    showTip('Could not load recipe: ' + err.message);
  }
};

// ============================================================
// PLAYER TIMELINE TICKS, SEEK SYNC, AND STEP PROGRESS CHECKS
// ============================================================
function updateStepFromTime(time) {
  if (!recipeData.loops || recipeData.loops.length === 0) return;
  let foundIndex = 0;
  for (let i = 0; i < recipeData.loops.length; i++) {
    if (time >= recipeData.loops[i] - 0.01) {
      foundIndex = i;
    }
  }
  // Cap foundIndex to the number of steps
  if (recipeData.steps && foundIndex >= recipeData.steps.length) {
    foundIndex = recipeData.steps.length - 1;
  }
  if (foundIndex !== activeStepIndex) {
    activeStepIndex = foundIndex;
    updateStepDetailsUI();
    renderStepChipsMobile();
  }
}

window.playerSkipTime = function(amount) {
  const vid = document.getElementById('mobileRealVideo');
  const hasRealVideo = vid && vid.style.display !== 'none';
  
  const newTime = Math.max(0, Math.min(recipeData.duration, currentTime + amount));
  
  if (hasRealVideo) {
    vid.currentTime = newTime;
  }
  currentTime = newTime;
  updateStepFromTime(currentTime);
  updateTimelineUI();
  showTip(`Skipped ${amount > 0 ? '+' : ''}${amount}s ⏱️`);
};

window.playerTimelineClick = function(e) {
  const rail = e.currentTarget;
  const rect = rail.getBoundingClientRect();
  const pct = (e.clientX - rect.left) / rect.width;
  const duration = recipeData.duration || 10;
  const newTime = Math.max(0, Math.min(duration, pct * duration));
  
  const vid = document.getElementById('mobileRealVideo');
  const hasRealVideo = vid && vid.style.display !== 'none';
  if (hasRealVideo) {
    vid.currentTime = newTime;
  }
  currentTime = newTime;
  updateStepFromTime(currentTime);
  updateTimelineUI();
};

let playerTimerInterval = null;
let playerTimerSecondsLeft = 0;
let playerTimerInitialSeconds = 0;
let playerTimerRunning = false;

function updatePlayerTimerUI() {
  const container = document.getElementById('playerTimerContainer');
  const display = document.getElementById('playerTimerDisplay');
  const playPauseBtn = document.getElementById('playerTimerPlayPauseBtn');
  
  if (!container || !display) return;
  
  // Clear any active player timer interval
  if (playerTimerInterval) {
    clearInterval(playerTimerInterval);
    playerTimerInterval = null;
  }
  playerTimerRunning = false;
  if (playPauseBtn) playPauseBtn.textContent = 'Start';
  
  const step = recipeData.steps[activeStepIndex];
  const duration = step && step.timer ? Number(step.timer) : 0;
  
  if (duration > 0) {
    container.style.display = 'flex';
    playerTimerSecondsLeft = duration;
    playerTimerInitialSeconds = duration;
    
    const mins = Math.floor(duration / 60);
    const secs = duration % 60;
    display.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  } else {
    container.style.display = 'none';
    playerTimerSecondsLeft = 0;
    playerTimerInitialSeconds = 0;
  }
}

window.updatePlayerTimerUI = updatePlayerTimerUI;

window.togglePlayerTimer = function() {
  const display = document.getElementById('playerTimerDisplay');
  const playPauseBtn = document.getElementById('playerTimerPlayPauseBtn');
  if (!display || !playPauseBtn) return;
  
  if (playerTimerRunning) {
    clearInterval(playerTimerInterval);
    playerTimerInterval = null;
    playerTimerRunning = false;
    playPauseBtn.textContent = 'Resume';
    showTip('Timer paused ⏸️');
  } else {
    if (playerTimerSecondsLeft <= 0) {
      playerTimerSecondsLeft = playerTimerInitialSeconds;
    }
    
    playerTimerRunning = true;
    playPauseBtn.textContent = 'Pause';
    showTip('Timer started ⏱️');
    
    playerTimerInterval = setInterval(() => {
      playerTimerSecondsLeft--;
      if (playerTimerSecondsLeft <= 0) {
        clearInterval(playerTimerInterval);
        playerTimerInterval = null;
        playerTimerRunning = false;
        playPauseBtn.textContent = 'Start';
        display.textContent = '00:00';
        showTip('🔔 Timer finished! Step complete!');
        if (typeof speakFeedback === 'function') {
          speakFeedback('Timer finished. Step complete.');
        }
      } else {
        const mins = Math.floor(playerTimerSecondsLeft / 60);
        const secs = playerTimerSecondsLeft % 60;
        display.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
      }
    }, 1000);
  }
};

window.resetPlayerTimer = function() {
  const display = document.getElementById('playerTimerDisplay');
  const playPauseBtn = document.getElementById('playerTimerPlayPauseBtn');
  if (!display) return;
  
  if (playerTimerInterval) {
    clearInterval(playerTimerInterval);
    playerTimerInterval = null;
  }
  playerTimerRunning = false;
  if (playPauseBtn) playPauseBtn.textContent = 'Start';
  
  playerTimerSecondsLeft = playerTimerInitialSeconds;
  const mins = Math.floor(playerTimerSecondsLeft / 60);
  const secs = playerTimerSecondsLeft % 60;
  display.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  showTip('Timer reset 🔄');
};

function getPlayerProgressKey(recipeId) {
  const id = recipeId || 'local_default';
  return `cooking_gps_player_progress_${id}`;
}

function loadPlayerProgress(recipeId) {
  const id = recipeId || 'local_default';
  playerCompletedSteps = new Set();
  try {
    const saved = localStorage.getItem(getPlayerProgressKey(id));
    if (saved) {
      const arr = JSON.parse(saved);
      playerCompletedSteps = new Set(arr);
    }
  } catch {}
  updatePlayerProgressBar();
}

function savePlayerProgress(recipeId) {
  const id = recipeId || 'local_default';
  localStorage.setItem(getPlayerProgressKey(id), JSON.stringify([...playerCompletedSteps]));
}

window.togglePlayerStepDone = function(stepIndex) {
  if (stepIndex === undefined || typeof stepIndex !== 'number') {
    stepIndex = activeStepIndex;
  }
  const recipeId = activePlayerRecipeId || 'local_default';
  if (playerCompletedSteps.has(stepIndex)) {
    playerCompletedSteps.delete(stepIndex);
  } else {
    playerCompletedSteps.add(stepIndex);
  }
  savePlayerProgress(recipeId);
  updatePlayerProgressBar();
  renderStepChipsMobile();
  updatePlayerMarkDoneButton();
  
  const total = recipeData.steps ? recipeData.steps.length : 0;
  if (playerCompletedSteps.size === total && total > 0) {
    if (typeof addDateToCookedHistory === 'function') {
      addDateToCookedHistory(new Date());
    }
    setTimeout(() => showTip('🎉 Recipe complete! Every step done! Excellent cooking! 🍽️'), 300);
  }
};

window.resetPlayerProgress = function() {
  const recipeId = activePlayerRecipeId || 'local_default';
  playerCompletedSteps = new Set();
  savePlayerProgress(recipeId);
  updatePlayerProgressBar();
  renderStepChipsMobile();
  updatePlayerMarkDoneButton();
  showTip('Progress reset 🔄');
};

function updatePlayerProgressBar() {
  const total = recipeData.steps ? recipeData.steps.length : 0;
  const done = playerCompletedSteps.size;
  const readout = document.getElementById('playerProgressReadout');
  const fill = document.getElementById('playerProgressFill');
  const resetBtn = document.getElementById('playerResetProgressBtn');
  
  if (readout) {
    readout.textContent = `${done} of ${total} completed`;
  }
  if (fill) {
    fill.style.width = total > 0 ? `${Math.round((done / total) * 100)}%` : '0%';
  }
  if (resetBtn) {
    resetBtn.style.display = done > 0 ? 'flex' : 'none';
  }
}

function updatePlayerMarkDoneButton() {
  if (!recipeData || !recipeData.steps) return;
  recipeData.steps.forEach((step, idx) => {
    const btn = document.getElementById(`playerMarkDoneBtn-${idx}`);
    if (!btn) return;
    const isDone = playerCompletedSteps.has(idx);
    if (isDone) {
      btn.innerHTML = `<i data-lucide="check-circle" style="width: 18px; height: 18px;"></i>`;
      btn.style.background = '#22c55e';
      btn.style.color = '#fff';
      btn.style.boxShadow = '0 4px 10px rgba(34,197,94,0.3)';
    } else {
      btn.innerHTML = `<i data-lucide="circle" style="width: 18px; height: 18px;"></i>`;
      btn.style.background = 'rgba(74, 144, 217, 0.08)';
      btn.style.color = 'var(--primary)';
      btn.style.boxShadow = 'none';
    }
  });
  if (window.lucide) lucide.createIcons();
}

function updatePlayerEditButtonVisibility() {
  const editBtn = document.getElementById('playerEditRecipeBtn');
  if (!editBtn) return;
  
  if (playerCurrentRecipe) {
    editBtn.style.display = 'flex';
    editBtn.onclick = () => {
      window.loadRecipeToEditor(playerCurrentRecipe);
      if (typeof window.closePlayerActionsDropdown === 'function') {
        window.closePlayerActionsDropdown();
      }
    };
  } else {
    editBtn.style.display = 'none';
    editBtn.onclick = null;
  }
  if (window.lucide) lucide.createIcons();
}

window.togglePlayerActionsDropdown = function() {
  const menu = document.getElementById('playerActionsDropdownMenu');
  if (!menu) return;
  if (menu.style.display === 'none' || menu.style.display === '') {
    menu.style.display = 'flex';
  } else {
    menu.style.display = 'none';
  }
};

window.closePlayerActionsDropdown = function() {
  const menu = document.getElementById('playerActionsDropdownMenu');
  if (menu) menu.style.display = 'none';
};

document.addEventListener('click', (e) => {
  // If the target is the folder select/options, or if the element was detached from the DOM during click handling,
  // do not close the player actions dropdown.
  if (e.target && (e.target.tagName === 'SELECT' || e.target.tagName === 'OPTION' || e.target.isConnected === false)) {
    return;
  }
  if (!e.target.closest('#playerActionsDropdownMenu') && !e.target.closest('#playerActionsDropdownBtn')) {
    window.closePlayerActionsDropdown();
  }
});

function renderPlayerTimelineMarkers() {
  const container = document.getElementById('videoBoundariesContainer');
  if (!container) return;
  container.innerHTML = '';
  
  const loops = recipeData.loops || [];
  const duration = recipeData.duration || 10;
  
  loops.forEach((time, idx) => {
    if (idx === loops.length - 1 && time >= duration) return;
    if (time > duration) return;
    
    const pct = (time / duration) * 100;
    const tick = document.createElement('div');
    tick.className = 'player-timeline-tick';
    tick.style.left = `${pct}%`;
    
    const stepTitle = recipeData.steps[idx]?.title || `Step ${idx + 1}`;
    const min = Math.floor(time / 60);
    const sec = Math.floor(time % 60);
    tick.title = `${stepTitle} (${min}:${sec.toString().padStart(2, '0')})`;
    
    tick.onclick = (e) => {
      e.stopPropagation();
      seekToStep(idx);
    };
    
    container.appendChild(tick);
  });
}

window.loadRecipeToEditor = function(recipe) {
  if (!recipe) return;
  
  // Switch to the create view so that the editor is visible to the user
  if (typeof switchView === 'function') {
    switchView('create');
  }
  
  editingRecipeId = recipe.id;

  // Load saved subtitles / transcription
  cachedSegments = recipe.text_overlays || [];
  cachedTranscript = cachedSegments.map(s => s.text).join(' ');
  const preview = document.getElementById('transcriptPreview');
  const textEl  = document.getElementById('transcriptText');
  if (preview) preview.style.display = cachedTranscript ? 'block' : 'none';
  if (textEl) textEl.textContent = cachedTranscript || '';
  
  // Set stage 1 hidden, stage 2 shown
  document.getElementById('createStage1').style.display = 'none';
  document.getElementById('createStage2').style.display = 'flex';
  document.body.classList.add('mobile-editing-active');
  document.getElementById('createStage3').style.display = 'none';

  // Title
  const titleInput = document.getElementById('newRecipeTitleInput');
  if (titleInput) titleInput.value = recipe.title || '';

  // Video URL
  const videoEl = document.getElementById('uploadedVideoPlayer');
  if (videoEl) {
    const isMutedPref = localStorage.getItem('cooking_gps_editor_muted') !== 'false';
    videoEl.muted = isMutedPref;
    if (typeof window.updateEditorMuteUI === 'function') {
      window.updateEditorMuteUI();
    }
    if (recipe.video_url) {
      videoEl.src = recipe.video_url;
    } else {
      videoEl.src = '';
    }
  }

  // Cover image / thumbnail
  const coverInput = document.getElementById('newRecipeCoverInput');
  if (coverInput) coverInput.value = recipe.thumbnail_url || recipe.bundle_mode || '';
  window.updateCoverPreviewFromUrl(recipe.thumbnail_url || recipe.bundle_mode || '');

  // Is public
  createIsPublic = recipe.is_published || false;

  // Map loops to createStepsArr
  const parsed = parseLoops(recipe.loops);
  createStepsArr = parsed.map((l, idx) => {
    const t = l.start || 0;
    const end = l.end != null ? l.end : null;
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60).toString().padStart(2, '0');
    const details = window.parseDescriptionAndIngredients(l.description || '', l.ingredients);
    return {
      time: t,
      endTime: end,
      label: l.label || (recipe.steps && recipe.steps[idx] && (recipe.steps[idx].title || recipe.steps[idx].label || (typeof recipe.steps[idx] === 'string' ? recipe.steps[idx] : null))) || `Step ${idx + 1}`,
      displayTime: `${m}:${s}`,
      description: details.description,
      ingredients: details.ingredients,
      audio_url: l.audio_url || l.audioUrl || '',
      timer: l.timer != null ? Number(l.timer) : null
    };
  }).sort((a, b) => a.time - b.time);

  renderCreateSteps();
  renderTimeline();
  switchView('create');
  showTip(`Editing recipe: ${recipe.title} ✏️`);
  if (typeof window.setupResponsiveDrawers === 'function') {
    window.setupResponsiveDrawers();
  }
  if (typeof window.adjustWorkbenchVideoSize === 'function') {
    window.adjustWorkbenchVideoSize();
  }
};

let hlsInstance = null;

window.loadPlayerRecipe = async function(recipeId) {
  if (!recipeId) return;
  activePlayerRecipeId = recipeId;
  localStorage.setItem('cooking_gps_active_recipe_id', recipeId);

  // Reset player multigrid state on new recipe load
  if (typeof stopAllPlayerMultigridLoops === 'function') {
    stopAllPlayerMultigridLoops();
  }
  isPlayerMultigridActive = false;
  playerSelectedSteps.clear();
  if (typeof updateMultigridLayoutClass === 'function') {
    updateMultigridLayoutClass();
  }
  const toggleBtn = document.getElementById('playerMultigridToggleBtn');
  const container = document.getElementById('playerMultigridContainer');
  if (toggleBtn) {
    toggleBtn.style.background = 'rgba(0,0,0,0.5)';
    toggleBtn.style.color = '#fff';
  }
  if (container) container.style.display = 'none';

  // Ensure voice guide is deactivated by default when opening a new recipe
  if (currentSpeechActive && recognition) {
    try {
      recognition.stop();
    } catch (e) {}
    currentSpeechActive = false;
    updateVoiceUI(false);
  }
  
  const errOverlay = document.getElementById('videoErrorOverlay');
  if (errOverlay) errOverlay.style.display = 'none';

  try {
    const { getRecipeById } = await import('./supabase-client.js');
    const recipe = await getRecipeById(recipeId);
    if (!recipe) return;

    // Mutate recipeData properties
    recipeData.title = recipe.title || 'Untitled Recipe';
    recipeData.duration = recipe.duration || 10;
    recipeData.video_url = recipe.video_url || '';
    recipeData.text_overlays = recipe.text_overlays || [];
    recipeData.ingredients = recipe.ingredients || '';
    
    // Normalize loops and steps
    const parsed = parseLoops(recipe.loops);
    if (parsed.length > 0) {
      recipeData.loops = parsed.map(l => l.start);
      // Make sure step boundaries end at duration
      if (recipeData.loops[recipeData.loops.length - 1] < recipeData.duration) {
        recipeData.loops.push(recipeData.duration);
      }
      recipeData.steps = parsed.map((l, idx) => ({
        title: l.label || (recipe.steps && recipe.steps[idx]) || `Step ${idx + 1}`,
        instruction: l.description || '',
        audio_url: l.audio_url || l.audioUrl || '',
        timer: l.timer,
        timers: l.timers || (l.timer ? [{ duration: Number(l.timer), label: 'Timer 1' }] : [])
      }));
    } else {
      recipeData.loops = [0, recipeData.duration];
      recipeData.steps = [{
        title: 'Start Cooking',
        instruction: 'Follow the steps to prepare this dish.',
      }];
    }

    // Reset player state
    activeStepIndex = 0;
    currentTime = 0;
    isPlaying = false;

    // Handle video player UI display
    const realVideo = document.getElementById('mobileRealVideo');
    const canvas = document.getElementById('mobileVideoCanvas');

    if (recipe.video_url && realVideo) {
      if (canvas) canvas.style.display = 'none';
      realVideo.style.display = 'block';

      // Set default preview cover/poster before play
      if (recipe.thumbnail_url) {
        realVideo.setAttribute('poster', recipe.thumbnail_url);
      } else {
        realVideo.removeAttribute('poster');
      }
      
      // Load source
      if (hlsInstance) {
        hlsInstance.destroy();
        hlsInstance = null;
      }

      if (recipe.video_url.includes('.m3u8')) {
        if (typeof Hls !== 'undefined' && Hls.isSupported()) {
          hlsInstance = new Hls();
          hlsInstance.loadSource(recipe.video_url);
          hlsInstance.attachMedia(realVideo);
        } else if (realVideo.canPlayType('application/vnd.apple.mpegurl')) {
          realVideo.src = recipe.video_url;
        }
      } else {
        realVideo.src = recipe.video_url;
      }

      // Initialize muted state based on preference
      const isMutedPref = localStorage.getItem('cooking_gps_player_muted') === 'true';
      realVideo.muted = isMutedPref;
      if (typeof updateMuteUI === 'function') {
        updateMuteUI();
      }

      realVideo.load();
      // Re-apply playback speed preference
      const speed = PLAYER_SPEEDS[playerPlaybackSpeedIndex];
      realVideo.playbackRate = speed;
      const speedLabel = document.getElementById('playerSpeedLabel');
      if (speedLabel) {
        speedLabel.textContent = (speed === 1 || speed === 2) ? `${speed}.0x` : `${speed}x`;
      }
      realVideo.currentTime = 0;
    } else {
      if (realVideo) {
        realVideo.style.display = 'none';
        realVideo.src = '';
      }
      if (canvas) canvas.style.display = 'block';

      // Reset aspect ratio to default when no video is loaded
      const container = document.querySelector('.mobile-video-container');
      const placeholder = document.querySelector('.mobile-video-placeholder');
      if (container) {
        container.style.removeProperty('aspect-ratio');
        container.style.removeProperty('height');
        container.style.removeProperty('width');
        container.style.removeProperty('margin');
      }
      if (placeholder) {
        placeholder.style.removeProperty('aspect-ratio');
        placeholder.style.removeProperty('height');
        placeholder.style.removeProperty('width');
        placeholder.style.removeProperty('margin');
      }
    }

    // Refresh controls and details
    renderStepChipsMobile();
    renderStepCardsMobile();
    initStepCardsSliderScroll();
    updateStepDetailsUI();
    updateControlsUI();
    
    // Inject recipe title
    const titleEl = document.getElementById('playerRecipeTitle');
    if (titleEl) {
      titleEl.textContent = recipeData.title;
    }
    
    // Populate folder dropdown
    if (typeof window.updatePlayerFolderSelect === 'function') {
      window.updatePlayerFolderSelect();
    }
    
    // Load progress, timeline stop ticks, and edit button permissions
    playerCurrentRecipe = recipe;
    loadPlayerProgress(recipeId);
    renderPlayerTimelineMarkers();
    updatePlayerEditButtonVisibility();
    
    // Comments & Ingredients Main-Tabs display
    const isPublic = !recipe.private_recipe || recipe.is_published;
    const tabsContainer = document.getElementById('playerMainTabsContainer');
    const commentsBtn = document.getElementById('playerTabCommentsBtn');
    
    // Always load comments in background if public so the count badge is fetched
    if (isPublic) {
      loadPlayerComments(recipeId);
      renderCommentForm(recipeId);
      if (commentsBtn) commentsBtn.style.display = 'flex';
    } else {
      if (commentsBtn) commentsBtn.style.display = 'none';
    }
    
    if (tabsContainer) tabsContainer.style.display = 'flex';
    
    // Default to Steps tab
    if (typeof window.switchPlayerMainTab === 'function') {
      window.switchPlayerMainTab('steps');
    }

    if (typeof renderPlayerIngredients === 'function') renderPlayerIngredients();
    showTip(`Loaded: ${recipeData.title} 🎬`);
  } catch (err) {
    console.error('[Player] Load error:', err);
    showTip('Could not load recipe to player: ' + err.message);
  }
};

window.updatePlayerFolderSelect = function() {
  const btnEl = document.getElementById('playerSaveToFolderBtn');
  if (!btnEl) return;
  
  if (typeof libLoad === 'function') {
    libLoad();
  } else {
    return;
  }
  
  const isSaved = libState.savedRecipeIds && libState.savedRecipeIds.includes(activePlayerRecipeId);
  const currentFolder = libState.folders.find(f => Array.isArray(f.recipeIds) && f.recipeIds.includes(activePlayerRecipeId));
  const currentFolderId = currentFolder ? currentFolder.id : (isSaved ? '__loose__' : null);
  
  const span = btnEl.querySelector('span');
  const icon = btnEl.querySelector('i, svg');
  if (span) {
    if (currentFolderId === '__loose__') {
      span.textContent = 'Saved';
      if (icon) {
        icon.outerHTML = '<i data-lucide="folder-check" style="width: 14px; height: 14px; color: var(--primary);"></i>';
      }
    } else if (currentFolder) {
      span.textContent = currentFolder.name;
      if (icon) {
        icon.outerHTML = '<i data-lucide="folder-check" style="width: 14px; height: 14px; color: var(--primary);"></i>';
      }
    } else {
      span.textContent = 'Save';
      if (icon) {
        icon.outerHTML = '<i data-lucide="folder-heart" style="width: 14px; height: 14px;"></i>';
      }
    }
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }
};

window.openPlayerSaveToFolderModal = function() {
  if (typeof window.closePlayerActionsDropdown === 'function') {
    window.closePlayerActionsDropdown();
  }

  const modal = document.getElementById('playerFolderSelectionModal');
  const listContainer = document.getElementById('playerFolderModalList');
  if (!modal || !listContainer) return;
  
  const searchInput = document.getElementById('playerFolderSearchInput');
  if (searchInput) {
    searchInput.value = '';
  }
  
  if (typeof libLoad === 'function') {
    libLoad();
    console.log('[DEBUG] SaveToFolderModal: Loaded folders:', libState.folders);
  } else {
    return;
  }
  
  const recipeId = activePlayerRecipeId || window.activePlayerRecipeId;
  
  // Find all folder IDs that already contain activePlayerRecipeId/recipeId
  const initialFolderIds = (libState.folders || [])
    .filter(f => f && Array.isArray(f.recipeIds) && f.recipeIds.includes(recipeId))
    .map(f => f.id);
  
  const isSaved = libState.savedRecipeIds && libState.savedRecipeIds.includes(recipeId);
  
  // Set of selected IDs (can contain '__loose__' and any folder IDs)
  window.playerFolderModalSelectedIds = new Set(initialFolderIds);
  if (isSaved) {
    window.playerFolderModalSelectedIds.add('__loose__');
  }
  
  window.updateFolderModalListSelection = function() {
    listContainer.innerHTML = '';
    
    // 1. Loose / Default Library option
    const isLooseSelected = window.playerFolderModalSelectedIds.has('__loose__');
    const looseItem = document.createElement('button');
    looseItem.className = 'player-modal-folder-item';
    looseItem.style.cssText = `
      width: 100%;
      background: ${isLooseSelected ? 'rgba(74,144,217,0.1)' : 'transparent'};
      border: 1.5px solid ${isLooseSelected ? 'var(--primary)' : 'rgba(0,0,0,0.06)'};
      border-radius: 12px;
      padding: 10px 14px;
      font-family: var(--font);
      font-size: 0.82rem;
      font-weight: 700;
      color: ${isLooseSelected ? 'var(--primary)' : 'var(--text-heading)'};
      text-align: left;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: space-between;
      transition: all 0.2s;
    `;
    looseItem.innerHTML = `
      <span>📂 Save to Library</span>
      ${isLooseSelected ? '<span style="font-weight:800;color:var(--primary);">✓</span>' : ''}
    `;
    looseItem.onclick = () => {
      if (window.playerFolderModalSelectedIds.has('__loose__')) {
        window.playerFolderModalSelectedIds.delete('__loose__');
      } else {
        window.playerFolderModalSelectedIds.add('__loose__');
      }
      window.updateFolderModalListSelection();
    };
    listContainer.appendChild(looseItem);
    
    // 2. Folder options
    libState.folders.forEach(f => {
      if (!f || typeof f !== 'object') return;
      
      const isSelected = window.playerFolderModalSelectedIds.has(f.id);
      const item = document.createElement('button');
      item.className = 'player-modal-folder-item';
      item.style.cssText = `
        width: 100%;
        background: ${isSelected ? 'rgba(74,144,217,0.1)' : 'transparent'};
        border: 1.5px solid ${isSelected ? 'var(--primary)' : 'rgba(0,0,0,0.06)'};
        border-radius: 12px;
        padding: 10px 14px;
        font-family: var(--font);
        font-size: 0.82rem;
        font-weight: 700;
        color: ${isSelected ? 'var(--primary)' : 'var(--text-heading)'};
        text-align: left;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: space-between;
        transition: all 0.2s;
      `;
      item.innerHTML = `
        <span>📁 ${escapeHTML(f.name)}</span>
        ${isSelected ? '<span style="font-weight:800;color:var(--primary);">✓</span>' : ''}
      `;
      item.onclick = () => {
        if (window.playerFolderModalSelectedIds.has(f.id)) {
          window.playerFolderModalSelectedIds.delete(f.id);
        } else {
          window.playerFolderModalSelectedIds.add(f.id);
        }
        window.updateFolderModalListSelection();
      };
      listContainer.appendChild(item);
    });
  };
  
  window.updateFolderModalListSelection();
  
  modal.style.display = 'flex';
};

window.confirmPlayerFolderChange = async function() {
  const recipeId = activePlayerRecipeId || window.activePlayerRecipeId;
  if (!recipeId) {
    window.closePlayerSaveToFolderModal();
    return;
  }
  
  if (!libState.savedRecipeIds) libState.savedRecipeIds = [];
  
  const selectedSet = window.playerFolderModalSelectedIds || new Set();
  
  // Update folder recipe arrays
  libState.folders.forEach(f => {
    if (!f || typeof f !== 'object') return;
    if (!f.recipeIds) f.recipeIds = [];
    
    if (selectedSet.has(f.id)) {
      if (!f.recipeIds.includes(recipeId)) {
        f.recipeIds.push(recipeId);
      }
    } else {
      f.recipeIds = f.recipeIds.filter(id => id !== recipeId);
    }
  });
  
  // General saved list check
  const shouldBeSaved = selectedSet.has('__loose__') || selectedSet.size > 0;
  if (shouldBeSaved) {
    if (!libState.savedRecipeIds.includes(recipeId)) {
      libState.savedRecipeIds.push(recipeId);
    }
  } else {
    libState.savedRecipeIds = libState.savedRecipeIds.filter(id => id !== recipeId);
  }
  
  if (currentUser) {
    try {
      const { assignRecipeToFolder } = await import('./supabase-client.js');
      const folderIds = Array.from(selectedSet).filter(id => id !== '__loose__');
      const targetFolderId = folderIds.length > 0 ? folderIds[0] : null;
      await assignRecipeToFolder(recipeId, targetFolderId);
    } catch (err) {
      console.error('Error syncing recipe folder assignment to Supabase:', err);
    }
  }

  libSave();
  libRenderContent();
  
  if (typeof mySpaceRenderFolderStrip === 'function') {
    mySpaceRenderFolderStrip();
  }
  if (typeof window.updatePlayerFolderSelect === 'function') {
    window.updatePlayerFolderSelect();
  }
  
  if (typeof window.closePlayerActionsDropdown === 'function') {
    window.closePlayerActionsDropdown();
  }
  
  window.closePlayerSaveToFolderModal();
  showTip("Video folder updated 📁");
};

window.closePlayerSaveToFolderModal = function() {
  const modal = document.getElementById('playerFolderSelectionModal');
  if (modal) modal.style.display = 'none';
  window.libPendingFolderRecipeId = null;
};

window.filterPlayerFolders = function() {
  const query = (document.getElementById('playerFolderSearchInput')?.value || '').toLowerCase().trim();
  const listContainer = document.getElementById('playerFolderModalList');
  if (!listContainer) return;
  const items = listContainer.getElementsByClassName('player-modal-folder-item');
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const text = item.textContent.toLowerCase();
    if (text.includes(query)) {
      item.style.display = 'flex';
    } else {
      item.style.display = 'none';
    }
  }
};

window.openPlayerEmbedModal = function() {
  const modal = document.getElementById('playerEmbedModal');
  if (!modal) return;

  const widthInput = document.getElementById('playerEmbedWidthInput');
  const heightInput = document.getElementById('playerEmbedHeightInput');
  if (widthInput) widthInput.value = '100%';
  if (heightInput) heightInput.value = '480';

  window.updateEmbedCodeSnippet();
  
  modal.style.display = 'flex';
};

window.closePlayerEmbedModal = function() {
  const modal = document.getElementById('playerEmbedModal');
  if (modal) modal.style.display = 'none';
};

window.updateEmbedCodeSnippet = function() {
  const textarea = document.getElementById('playerEmbedTextarea');
  const widthInput = document.getElementById('playerEmbedWidthInput');
  const heightInput = document.getElementById('playerEmbedHeightInput');
  if (!textarea) return;

  const w = (widthInput?.value || '100%').trim();
  const h = (heightInput?.value || '480').trim();
  const recipeId = activePlayerRecipeId || 'r1';

  const origin = window.location.origin;
  const embedUrl = `${origin}/mobile.html?id=${recipeId}#mobile-player`;

  const code = `<iframe src="${embedUrl}" width="${w}" height="${h}" style="border:none; border-radius:18px; box-shadow:0 10px 30px rgba(0,0,0,0.08);" allow="autoplay; clipboard-write; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;

  textarea.value = code;
};

window.copyEmbedCode = function() {
  const textarea = document.getElementById('playerEmbedTextarea');
  const btn = document.getElementById('playerCopyEmbedBtn');
  if (!textarea) return;

  textarea.select();
  textarea.setSelectionRange(0, 99999);

  try {
    navigator.clipboard.writeText(textarea.value).then(() => {
      showCopyFeedback();
    }).catch(() => {
      document.execCommand('copy');
      showCopyFeedback();
    });
  } catch (err) {
    document.execCommand('copy');
    showCopyFeedback();
  }

  function showCopyFeedback() {
    if (btn) {
      const origText = btn.innerHTML;
      btn.innerHTML = '<span>✓ Copied to Clipboard!</span>';
      const origBg = btn.style.background;
      const origShadow = btn.style.boxShadow;
      btn.style.background = '#16a34a';
      btn.style.boxShadow = '0 4px 12px rgba(22,163,74,0.25)';
      setTimeout(() => {
        btn.innerHTML = origText;
        btn.style.background = origBg || 'var(--primary)';
        btn.style.boxShadow = origShadow || '0 4px 12px rgba(74,144,217,0.25)';
        window.closePlayerEmbedModal();
      }, 1500);
    }
  }
};

window.handlePlayerFolderChange = function(targetFolderId) {
  if (!activePlayerRecipeId) return;
  
  const isSaved = libState.savedRecipeIds && libState.savedRecipeIds.includes(activePlayerRecipeId);
  const currentFolder = libState.folders.find(f => Array.isArray(f.recipeIds) && f.recipeIds.includes(activePlayerRecipeId));
  const currentFolderId = currentFolder ? currentFolder.id : (isSaved ? '__loose__' : null);
  
  if (targetFolderId === '__new__') {
    // Create folder with pending recipe
    window.libCreateFolder(activePlayerRecipeId);
    
    // Close the dropdown menu so it is not visible behind the folder creation modal
    if (typeof window.closePlayerActionsDropdown === 'function') {
      window.closePlayerActionsDropdown();
    }
    
    // Close selection modal
    if (typeof window.closePlayerSaveToFolderModal === 'function') {
      window.closePlayerSaveToFolderModal();
    }
    return;
  }
  
  // Toggle save status: if clicking the currently active selection, un-save the recipe
  if (targetFolderId === currentFolderId) {
    if (libState.savedRecipeIds) {
      libState.savedRecipeIds = libState.savedRecipeIds.filter(id => id !== activePlayerRecipeId);
    }
    if (currentFolder) {
      currentFolder.recipeIds = (currentFolder.recipeIds || []).filter(id => id !== activePlayerRecipeId);
    }
    libSave();
    libRenderContent();
    if (typeof mySpaceRenderFolderStrip === 'function') {
      mySpaceRenderFolderStrip();
    }
    if (typeof window.updatePlayerFolderSelect === 'function') {
      window.updatePlayerFolderSelect();
    }
    showTip("Removed from Library");
  } else {
    window.libMoveRecipeToFolder(activePlayerRecipeId, currentFolderId, targetFolderId);
  }
  
  // Close the dropdown menu after moving to folder
  if (typeof window.closePlayerActionsDropdown === 'function') {
    window.closePlayerActionsDropdown();
  }
  
  // Close selection modal
  if (typeof window.closePlayerSaveToFolderModal === 'function') {
    window.closePlayerSaveToFolderModal();
  }
};

// ── Universal recipe launcher — used by Library, My Profile, Discover ──────
window.loadRecipeById = async function(id) {
  if (!id) return;
  switchView('mobile-player');
  await window.loadPlayerRecipe(id);
};

// ----------------------------------------------------
// PLAYER COMMENTS SECTION & BACK NAVIGATION LOGIC
// ----------------------------------------------------
window.playerGoBack = function() {
  const prev = playerPreviousView || 'create';
  switchView(prev);
};

function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function getRecipeCardThumbnail(r) {
  if (r.thumbnail_url) {
    return `<img src="${encodeURI(r.thumbnail_url)}" alt="" style="width:100%;height:100%;object-fit:cover;display:block;">`;
  }
  if (r.video_url) {
    const title = r.title || 'Cooking Guide';
    const hash = r.id ? r.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) : 0;
    const gradients = [
      'linear-gradient(135deg, #ff6b6b, #ff8e53)', // Sunset Warm
      'linear-gradient(135deg, #4facfe, #00f2fe)', // Cool Blue
      'linear-gradient(135deg, #43e97b, #38f9d7)', // Mint Green
      'linear-gradient(135deg, #fa709a, #fee140)', // Sweet Candy
      'linear-gradient(135deg, #30cfd0, #330867)', // Deep Purple
      'linear-gradient(135deg, #f093fb, #f5576c)', // Pink Rose
      'linear-gradient(135deg, #a1c4fd, #c2e9fb)', // Soft Blue
      'linear-gradient(135deg, #84fab0, #8fd3f4)'  // Mint Splash
    ];
    const gradient = gradients[hash % gradients.length];
    const emojis = ['🍳', '🥗', '🍲', '🍰', '🍜', '🍣', '🍕', '🥞', '🥐', '🍔'];
    const emoji = emojis[hash % emojis.length];

    return `
      <div style="width:100%;height:100%;background:${gradient};display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative;color:#fff;padding:8px;text-align:center;font-family:var(--font);box-sizing:border-box;overflow:hidden;">
        <div style="position:absolute;inset:0;background:rgba(0,0,0,0.12);z-index:1;"></div>
        <div style="z-index:2;display:flex;flex-direction:column;align-items:center;gap:4px;width:100%;">
          <span style="font-size:1.6rem;filter:drop-shadow(0 3px 6px rgba(0,0,0,0.25));">${emoji}</span>
          <div style="font-size:0.7rem;font-weight:900;max-width:95%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-shadow:0 1px 3px rgba(0,0,0,0.4);">${escapeHTML(title)}</div>
          <div style="display:flex;align-items:center;gap:2px;background:rgba(255,255,255,0.22);backdrop-filter:blur(2px);padding:2px 6px;border-radius:10px;border:1px solid rgba(255,255,255,0.25);margin-top:2px;">
            <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor" stroke="none" style="color:#fff;"><path d="M8 5v14l11-7z"/></svg>
            <span style="font-size:0.5rem;font-weight:800;text-transform:uppercase;letter-spacing:0.04em;text-shadow:0 1px 2px rgba(0,0,0,0.2);">Watch</span>
          </div>
        </div>
      </div>
    `;
  }
  return `<div style="width:100%;height:100%;background:linear-gradient(135deg,#0f1e3a,#1e3a5f);display:flex;align-items:center;justify-content:center;font-size:1.8rem;">🎬</div>`;
}

function getCompactRecipeThumbnail(r) {
  if (r.thumbnail_url) {
    return `<img src="${encodeURI(r.thumbnail_url)}" style="width:100%;height:100%;object-fit:cover;">`;
  }
  if (r.video_url) {
    const hash = r.id ? r.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) : 0;
    const gradients = [
      'linear-gradient(135deg, #ff6b6b, #ff8e53)',
      'linear-gradient(135deg, #4facfe, #00f2fe)',
      'linear-gradient(135deg, #43e97b, #38f9d7)',
      'linear-gradient(135deg, #fa709a, #fee140)',
      'linear-gradient(135deg, #30cfd0, #330867)',
      'linear-gradient(135deg, #f093fb, #f5576c)'
    ];
    const gradient = gradients[hash % gradients.length];
    const emojis = ['🍳', '🥗', '🍲', '🍰', '🍜', '🍣', '🍕', '🥞', '🥐', '🍔'];
    const emoji = emojis[hash % emojis.length];
    return `<div style="width:100%;height:100%;background:${gradient};display:flex;align-items:center;justify-content:center;font-size:1.1rem;position:relative;"><div style="position:absolute;inset:0;background:rgba(0,0,0,0.1);z-index:1;"></div><span style="z-index:2;">${emoji}</span></div>`;
  }
  return `<div style="font-size:1rem;">🎬</div>`;
}

function timeAgo(dateString) {
  try {
    const now = new Date();
    const past = new Date(dateString);
    const diffMs = now - past;
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return 'just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDays = Math.floor(diffHr / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return past.toLocaleDateString();
  } catch {
    return 'some time ago';
  }
}

let activePlayerRecipeId = null;

window.activePlayerMainTab = 'steps';

window.switchPlayerMainTab = function(tabName) {
  window.activePlayerMainTab = tabName;
  
  const stepsViewport = document.querySelector('.step-slider-viewport');
  const stepsTimeline = document.querySelector('.step-nav-chips-container');
  const ingPanel = document.getElementById('playerIngredientsPanel');
  const comSec = document.getElementById('playerCommentsSection');
  
  // Multigrid containers
  const mgControls = document.getElementById('playerMultigridDescControls');
  const mgDesc = document.getElementById('playerMultigridDescriptions');
  
  // Tab buttons
  const stepsBtn = document.getElementById('playerTabStepsBtn');
  const ingBtn = document.getElementById('playerTabIngredientsBtn');
  const comBtn = document.getElementById('playerTabCommentsBtn');
  
  if (!stepsBtn || !ingBtn || !comBtn) return;
  
  // Helper to activate button styling
  const activateBtn = (btn) => {
    btn.style.background = 'var(--primary)';
    btn.style.color = '#fff';
    btn.style.boxShadow = '0 4px 12px rgba(74, 144, 217, 0.25)';
  };
  const deactivateBtn = (btn) => {
    btn.style.background = 'rgba(0, 0, 0, 0.05)';
    btn.style.color = 'var(--text-muted)';
    btn.style.boxShadow = 'none';
  };
  
  // Reset all panels to display none
  if (stepsViewport) stepsViewport.style.display = 'none';
  if (stepsTimeline) stepsTimeline.style.display = 'none';
  if (ingPanel) ingPanel.style.display = 'none';
  if (comSec) comSec.style.display = 'none';
  if (mgControls) mgControls.style.display = 'none';
  if (mgDesc) mgDesc.style.display = 'none';
  
  deactivateBtn(stepsBtn);
  deactivateBtn(ingBtn);
  deactivateBtn(comBtn);
  
  if (tabName === 'steps') {
    activateBtn(stepsBtn);
    if (isPlayerMultigridActive) {
      if (mgControls) mgControls.style.display = 'flex';
      if (mgDesc) mgDesc.style.display = 'flex';
    } else {
      if (stepsViewport) stepsViewport.style.display = 'flex';
      // Center active card when switching back to steps tab
      const activeCard = document.getElementById(`stepSliderCard-${activeStepIndex}`);
      if (activeCard) {
        isScrollingAuto = true;
        activeCard.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'center' });
        setTimeout(() => { isScrollingAuto = false; }, 100);
      }
    }
    if (stepsTimeline) stepsTimeline.style.display = 'block';
  } else if (tabName === 'ingredients') {
    activateBtn(ingBtn);
    if (ingPanel) ingPanel.style.display = 'flex';
  } else if (tabName === 'comments') {
    activateBtn(comBtn);
    if (comSec) comSec.style.display = 'flex';
  }
  
  if (window.lucide) lucide.createIcons();
};

async function loadPlayerComments(recipeId) {
  activePlayerRecipeId = recipeId;
  const listEl = document.getElementById('playerCommentsList');
  const badgeEl = document.getElementById('playerCommentsCountBadge');
  if (!listEl) return;

  listEl.innerHTML = '<div style="font-size:0.7rem;color:var(--text-muted);text-align:center;padding:10px;">Loading comments...</div>';

  try {
    const { getRecipeComments } = await import('./supabase-client.js');
    const comments = await getRecipeComments(recipeId);
    
    if (badgeEl) badgeEl.textContent = comments.length;
    
    const badgeTab = document.getElementById('playerCommentsCountBadgeTab');
    if (badgeTab) badgeTab.textContent = comments.length;

    if (!comments.length) {
      listEl.innerHTML = '<div style="font-size:0.7rem;color:var(--text-muted);text-align:center;padding:15px;font-weight:600;">No comments yet. Be the first! 💬</div>';
      return;
    }

    listEl.innerHTML = comments.map(c => {
      const email = c.author_id || c.user_id || 'Anonymous';
      const name = email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase());
      const dateText = timeAgo(c.created_at || c.createdAt);
      return `
        <div style="background:rgba(74,144,217,0.04);padding:8px 10px;border-radius:8px;border:1px solid rgba(74,144,217,0.08);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;gap:8px;">
            <span style="font-size:0.7rem;font-weight:800;color:var(--primary);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHTML(name)}</span>
            <span style="font-size:0.58rem;color:var(--text-muted);font-weight:600;flex-shrink:0;">${dateText}</span>
          </div>
          <p style="font-size:0.72rem;color:var(--text-body);line-height:1.35;margin:0;word-break:break-word;">${escapeHTML(c.body)}</p>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error('[Player Comments] Error loading comments:', err);
    listEl.innerHTML = '<div style="font-size:0.7rem;color:#f87171;text-align:center;padding:10px;">Could not load comments.</div>';
  }
}

function renderCommentForm(recipeId) {
  const wrap = document.getElementById('playerAddCommentWrap');
  if (!wrap) return;

  if (currentUser) {
    wrap.innerHTML = `
      <textarea id="playerCommentInput" placeholder="Add a public comment..." style="width:100%;min-height:42px;max-height:80px;background:var(--bg-card-soft);border:2px solid var(--border-card);border-radius:8px;padding:6px 10px;font-family:var(--font);font-size:0.72rem;color:var(--text-heading);outline:none;resize:vertical;" onfocus="this.style.borderColor='var(--primary)'" onblur="this.style.borderColor='var(--border-card)'"></textarea>
      <div style="display:flex;justify-content:flex-end;">
        <button id="playerPostCommentBtn" onclick="submitPlayerComment()" class="btn btn-primary" style="padding:4px 14px;font-size:0.7rem;font-weight:800;border-radius:8px;cursor:pointer;font-family:var(--font);">
          Post
        </button>
      </div>
    `;
  } else {
    wrap.innerHTML = `
      <div style="background:rgba(0,0,0,0.02);border:1.5px dashed var(--border-card);padding:8px 10px;border-radius:8px;text-align:center;">
        <p style="font-size:0.68rem;color:var(--text-muted);margin:0 0 6px 0;font-weight:600;">You must be signed in to post comments.</p>
        <button onclick="openAuthModal()" class="btn" style="padding:4px 10px;font-size:0.65rem;font-weight:800;border-radius:6px;cursor:pointer;background:var(--bg-card-soft);border:1.5px solid var(--border-card);font-family:var(--font);">
          🔑 Sign In
        </button>
      </div>
    `;
  }
}

window.submitPlayerComment = async function() {
  if (!currentUser) {
    showTip('Please sign in to post comments.');
    return;
  }
  if (!activePlayerRecipeId) return;

  const input = document.getElementById('playerCommentInput');
  const btn = document.getElementById('playerPostCommentBtn');
  if (!input) return;

  const body = input.value.trim();
  if (!body) {
    showTip('Please write a comment first!');
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Posting...';
  }

  try {
    const { createRecipeComment } = await import('./supabase-client.js');
    await createRecipeComment(activePlayerRecipeId, body, currentUser.email);
    input.value = '';
    showTip('Comment posted! 💬');
    await loadPlayerComments(activePlayerRecipeId);
  } catch (err) {
    console.error('[Comments] Post failed:', err);
    showTip('Could not post comment: ' + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Post';
    }
  }
};

// ── Helper: normalize loop data (supports old number arrays AND new object arrays) ──
// Old format: loops = [5.2, 18.7]  (just start times)
// New format: loops = [{start:5.2, end:18.7, label:"Chop"}, ...]
function parseLoops(rawLoops) {
  if (!Array.isArray(rawLoops) || rawLoops.length === 0) return [];
  return rawLoops.map((entry, i, arr) => {
    if (typeof entry === 'number') {
      // Old format — end = next start (or null)
      const nextEntry = arr[i + 1];
      const end = typeof nextEntry === 'number' ? Number(nextEntry) : null;
      return { start: Number(entry), end, label: null };
    }
    // New format — already has start, end, label
    return {
      start: Number(entry.start ?? entry.time ?? 0),
      end:   (entry.end != null || entry.endTime != null) ? Number(entry.end ?? entry.endTime) : null,
      label: entry.label ?? null,
      description: entry.description ?? '',
      ingredients: entry.ingredients ?? [],
      audio_url: entry.audio_url ?? entry.audioUrl ?? '',
      timer: entry.timer ?? null,
      timers: entry.timers ?? null
    };
  });
}

// Render all step tiles
function renderGridTiles(recipe) {
  stopAllGridLoops();
  const container = document.getElementById('gridTilesContainer');
  const empty     = document.getElementById('gridEmptyState');
  if (!container) return;

  const parsedLoops = parseLoops(recipe.loops);
  const steps    = Array.isArray(recipe.steps) ? recipe.steps : [];
  const videoUrl = recipe.video_url || null;

  if (parsedLoops.length === 0) {
    container.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:4rem 2rem;color:var(--text-muted);">
        <div style="font-size:2rem;margin-bottom:0.75rem;">⚠️</div>
        <div style="font-weight:800;margin-bottom:0.5rem;">No steps found</div>
        <div style="font-size:0.85rem;font-weight:600;">This recipe has no loop points set. Add steps in the Create view first.</div>
      </div>`;
    return;
  }

  if (empty) empty.style.display = 'none';

  // Build tile HTML — each tile uses the AI-detected start+end times
  container.innerHTML = parsedLoops.map((loop, i) => {
    const label = loop.label || steps[i] || `Step ${i + 1}`;
    const timerSecs = detectTimer(label);
    const color = GRID_STEP_COLORS[i % GRID_STEP_COLORS.length];
    const sm = Math.floor(loop.start / 60);
    const ss = Math.floor(loop.start % 60).toString().padStart(2, '0');
    const hasEnd = loop.end != null;
    const em = hasEnd ? Math.floor(loop.end / 60) : null;
    const es = hasEnd ? Math.floor(loop.end % 60).toString().padStart(2, '0') : null;
    const timeLabel = hasEnd ? `${sm}:${ss} → ${em}:${es}` : `${sm}:${ss} → end`;

    return `
      <div class="glass-card" id="gridTile_${i}"
        style="position:relative;overflow:hidden;cursor:pointer;border:2px solid ${color};padding:0;border-radius:16px;transition:box-shadow 0.2s;"
        onclick="expandGridTile(${i})"
        onmouseenter="this.style.boxShadow='0 12px 32px rgba(74,144,217,0.22)'"
        onmouseleave="this.style.boxShadow=''">

        <!-- Video tile -->
        <div style="position:relative;background:#111;aspect-ratio:16/9;overflow:hidden;">
          <video id="gridVideo_${i}" muted playsinline
            style="width:100%;height:100%;object-fit:cover;display:block;"
            preload="metadata">
          </video>
          <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;" id="gridVideoOverlay_${i}">
            <div style="width:40px;height:40px;border-radius:50%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;font-size:1.1rem;">▶</div>
          </div>
          <div style="position:absolute;top:8px;right:8px;background:rgba(0,0,0,0.5);border-radius:6px;padding:3px 8px;font-size:0.65rem;font-weight:800;color:#fff;">
            ⤢ expand
          </div>
          <div style="position:absolute;top:8px;left:8px;background:${color};border-radius:6px;padding:3px 8px;font-size:0.65rem;font-weight:900;color:#446;">
            Step ${i + 1}
          </div>
        </div>

        <!-- Step info -->
        <div style="padding:12px 14px;background:${color}22;">
          <div data-step-label style="font-weight:900;font-size:0.9rem;color:var(--text-heading);margin-bottom:2px;">${label}</div>
          <div style="font-size:0.72rem;font-weight:700;color:var(--text-muted);">🔁 ${timeLabel}${hasEnd ? ' <span style="color:#22c55e;">✓ AI</span>' : ''}</div>
          <!-- Phase 8d: Timer button -->
          ${timerSecs ? '<button onclick="event.stopPropagation();startStepTimer(' + i + ',\'' + label.replace(/'/g, '\\\'') + '\')" style="margin-top:6px;background:#fef3c7;border:none;border-radius:8px;padding:4px 10px;font-family:var(--font);font-size:0.68rem;font-weight:800;cursor:pointer;color:#92400e;">⏱ Start ' + Math.floor(timerSecs/60) + 'min timer</button>' : ''}
        </div>
        <!-- Phase 8e: Done button -->
        <button id="gridDoneBtn_${i}" onclick="event.stopPropagation();toggleStepDone(${i})"
          style="position:absolute;bottom:12px;right:12px;background:rgba(255,255,255,0.85);border:none;border-radius:999px;padding:4px 12px;font-family:var(--font);font-size:0.72rem;font-weight:800;cursor:pointer;color:#333;backdrop-filter:blur(4px);">
          ○ Done
        </button>
      </div>`;
  }).join('');

  // Set up each video with EXACT AI-detected start + end times
  parsedLoops.forEach((loop, i) => {
    setupGridTileVideo(i, videoUrl, loop.start, loop.end);
  });

  // Load progress state for this recipe
  if (gridCurrentRecipe) {
    loadGridProgress(gridCurrentRecipe.id);
    parsedLoops.forEach((_, i) => refreshTileDoneState(i));
  }
}

// Set up a single tile's video to loop its segment
function setupGridTileVideo(i, videoUrl, startTime, endTime) {
  const video   = document.getElementById(`gridVideo_${i}`);
  const overlay = document.getElementById(`gridVideoOverlay_${i}`);
  if (!video || !videoUrl) return;

  // For HLS streams use hls.js, otherwise set src directly
  if (videoUrl.includes('videodelivery.net') || videoUrl.includes('.m3u8')) {
    if (window.Hls && Hls.isSupported()) {
      const hls = new Hls({ maxBufferLength: 10 }); // keep buffer small for grid tiles
      hls.loadSource(videoUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.currentTime = startTime;
        video.play().catch(() => {});
        if (overlay) overlay.style.display = 'none';
      });
    }
  } else {
    video.src = videoUrl;
    video.currentTime = startTime;
    video.play().catch(() => {});
    if (overlay) overlay.style.display = 'none';
  }

  // Loop: when video passes endTime, jump back to startTime
  const loopEnd = endTime ?? Infinity;
  const intervalId = setInterval(() => {
    if (!video || video.paused) return;
    if (endTime !== null && video.currentTime >= endTime - 0.1) {
      video.currentTime = startTime;
    }
  }, 150);
  gridStepIntervals[i] = intervalId;
}

// Stop all tile loop intervals
function stopAllGridLoops() {
  gridStepIntervals.forEach(id => { if (id) clearInterval(id); });
  gridStepIntervals = [];
}

// ── Layout switcher ────────────────────────────────────────────
window.setGridLayout = function(cols) {
  gridCurrentLayout = cols;
  const container = document.getElementById('gridTilesContainer');
  if (container) {
    if (cols === 1) container.style.gridTemplateColumns = '1fr';
    if (cols === 2) container.style.gridTemplateColumns = 'repeat(2, 1fr)';
    if (cols === 4) container.style.gridTemplateColumns = 'repeat(2, 1fr)'; // 2×2 on desktop, responsive

    // Update button styles
    [1, 2, 4].forEach(n => {
      const btn = document.getElementById(`layout${n}Btn`);
      if (!btn) return;
      const active = n === cols;
      btn.style.background = active ? 'var(--primary)' : 'var(--bg-card-soft)';
      btn.style.color      = active ? '#fff' : 'var(--text-body)';
      btn.style.border     = active ? 'none' : '2px solid var(--border-card)';
    });
  }
};

// ── Expand a tile to full-screen ──────────────────────────────
window.expandGridTile = function(i) {
  if (!gridCurrentRecipe) return;
  gridExpandedIndex = i;

  const parsedLoops = parseLoops(gridCurrentRecipe.loops);
  const steps  = gridCurrentRecipe.steps || [];
  const loop   = parsedLoops[i] ?? { start: 0, end: null };
  const start  = loop.start;
  const end    = loop.end;
  const label  = loop.label || steps[i] || `Step ${i + 1}`;
  const sm = Math.floor(start / 60);
  const ss = Math.floor(start % 60).toString().padStart(2, '0');
  const timeStr = end != null
    ? `${sm}:${ss} → ${Math.floor(end/60)}:${Math.floor(end%60).toString().padStart(2,'0')}`
    : `${sm}:${ss} → end`;

  const overlay    = document.getElementById('gridExpandedOverlay');
  const titleEl    = document.getElementById('gridExpandedTitle');
  const timeEl     = document.getElementById('gridExpandedTime');
  const expandedVid = document.getElementById('gridExpandedVideo');

  if (titleEl) titleEl.textContent = `Step ${i + 1} — ${label}`;
  if (timeEl)  timeEl.textContent  = `🔁 ${timeStr}`;

  if (expandedVid && gridCurrentRecipe.video_url) {
    const videoUrl = gridCurrentRecipe.video_url;
    if (videoUrl.includes('videodelivery.net') || videoUrl.includes('.m3u8')) {
      if (window.Hls && Hls.isSupported()) {
        const hls = new Hls();
        hls.loadSource(videoUrl);
        hls.attachMedia(expandedVid);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          expandedVid.currentTime = start;
          expandedVid.play().catch(() => {});
        });
      }
    } else {
      expandedVid.src = videoUrl;
      expandedVid.currentTime = start;
      expandedVid.play().catch(() => {});
    }

    // Loop the expanded video
    if (expandedVid._gridLoopInterval) clearInterval(expandedVid._gridLoopInterval);
    expandedVid._gridLoopInterval = setInterval(() => {
      if (end !== null && expandedVid.currentTime >= end - 0.1) {
        expandedVid.currentTime = start;
      }
    }, 150);
  }

  if (overlay) { overlay.style.display = 'flex'; }
};

window.collapseGridTile = function() {
  const overlay     = document.getElementById('gridExpandedOverlay');
  const expandedVid = document.getElementById('gridExpandedVideo');
  if (overlay) overlay.style.display = 'none';
  if (expandedVid) {
    expandedVid.pause();
    if (expandedVid._gridLoopInterval) {
      clearInterval(expandedVid._gridLoopInterval);
      expandedVid._gridLoopInterval = null;
    }
    expandedVid.src = '';
  }
  gridExpandedIndex = null;
};

// Prev/Next in expanded view
window.navigateGridStep = function(direction) {
  if (!gridCurrentRecipe || gridExpandedIndex === null) return;
  const loops = gridCurrentRecipe.loops || [];
  const next = gridExpandedIndex + direction;
  if (next < 0 || next >= loops.length) return;
  collapseGridTile();
  setTimeout(() => expandGridTile(next), 100);
};

// ============================================================
// PHASE 7 — Creator Loops vs. User Loops
// ============================================================
let activeLoopVersion  = 'creator'; // 'creator' | 'mine'
let userSavedLoops     = null;      // user's saved loop data for current recipe

// Switch between creator's loops and user's own customized loops
window.switchLoopVersion = function(version) {
  if (!gridCurrentRecipe) return;
  activeLoopVersion = version;

  // Update tab styles
  const tC = document.getElementById('loopTabCreator');
  const tM = document.getElementById('loopTabMine');
  if (tC) { tC.style.background = version === 'creator' ? 'var(--primary)' : 'var(--bg-card-soft)'; tC.style.color = version === 'creator' ? '#fff' : 'var(--text-body)'; tC.style.border = version === 'creator' ? 'none' : '2px solid var(--border-card)'; }
  if (tM) { tM.style.background = version === 'mine'    ? 'var(--primary)' : 'var(--bg-card-soft)'; tM.style.color = version === 'mine'    ? '#fff' : 'var(--text-body)'; tM.style.border = version === 'mine'    ? 'none' : '2px solid var(--border-card)'; }

  if (version === 'creator') {
    renderGridTiles(gridCurrentRecipe);
    showTip('Showing creator\'s original loop points 🎬');
  } else {
    if (!userSavedLoops) {
      showTip('No saved loops yet — edit the timeline in Create view, then tap 💾 Save My Loops');
      return;
    }
    const customRecipe = { ...gridCurrentRecipe, loops: userSavedLoops };
    renderGridTiles(customRecipe);
    showTip('Showing your custom loop points ✏️');
  }
};

// Save the current grid's loop timing as the user's own version
window.saveUserLoops = async function() {
  if (!gridCurrentRecipe || !currentUser) {
    showTip('Sign in to save your own loop customizations.');
    return;
  }
  try {
    const { supabase } = await import('./supabase-client.js');
    const loops = parseLoops(gridCurrentRecipe.loops); // save what's currently rendered
    const { error } = await supabase
      .from('user_loops')
      .upsert({
        user_id:   currentUser.email,
        recipe_id: gridCurrentRecipe.id,
        loops:     loops,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,recipe_id' });
    if (error) throw error;
    userSavedLoops = loops;
    showTip('Your loops saved! Switch to "My Loops" to use them 💾');
  } catch (err) {
    // Table might not exist yet — save to localStorage as fallback
    userSavedLoops = parseLoops(gridCurrentRecipe.loops);
    localStorage.setItem(`user_loops_${gridCurrentRecipe.id}`, JSON.stringify(userSavedLoops));
    showTip('Loops saved locally 💾 (run the Phase 7 SQL in Supabase to sync across devices)');
  }
};

// Load user's saved loops for the current recipe
async function loadUserLoops(recipeId) {
  userSavedLoops = null;

  // Try localStorage first (works without DB)
  const local = localStorage.getItem(`user_loops_${recipeId}`);
  if (local) { try { userSavedLoops = JSON.parse(local); } catch {} }

  // Try Supabase (if table exists)
  if (currentUser) {
    try {
      const { supabase } = await import('./supabase-client.js');
      const { data } = await supabase
        .from('user_loops')
        .select('loops')
        .eq('user_id', currentUser.email)
        .eq('recipe_id', recipeId)
        .single();
      if (data?.loops) userSavedLoops = data.loops;
    } catch {} // silently ignore if table doesn't exist
  }

  // Show/hide the My Loops tab
  const tM = document.getElementById('loopTabMine');
  if (tM) {
    tM.style.opacity = userSavedLoops ? '1' : '0.5';
    tM.title = userSavedLoops ? 'Your saved loops' : 'No saved loops yet — tap 💾 Save My Loops first';
  }
}

// ============================================================
// PHASE 8b — Search (tags + title)
// ============================================================
window.handleGridSearch = function(query) {
  // Reuse discover search logic — filter the picker
  if (!query.trim()) return;
  const q = query.toLowerCase();
  const picker = document.getElementById('gridRecipePicker');
  if (!picker) return;
  Array.from(picker.options).forEach(opt => {
    opt.style.display = opt.textContent.toLowerCase().includes(q) || !opt.value ? '' : 'none';
  });
};

// ============================================================
// PHASE 8c — AI Translation (cached per recipe + language)
// ============================================================
let gridTranslatedSteps       = null; // null = showing original
let gridActiveLanguage        = '';   // '' = original

window.translateGridRecipe = async function(lang) {
  gridActiveLanguage = lang;
  if (!gridCurrentRecipe) return;
  if (!lang) {
    // Reset to original
    gridTranslatedSteps = null;
    renderGridTiles(gridCurrentRecipe);
    showTip('Showing original language');
    return;
  }

  showTip('🌐 Translating...');

  try {
    // 1. Check cache in Supabase
    const { supabase } = await import('./supabase-client.js');
    const { data: cached } = await supabase
      .from('recipe_translations')
      .select('steps, ingredients')
      .eq('recipe_id', gridCurrentRecipe.id)
      .eq('language', lang)
      .single();

    if (cached) {
      gridTranslatedSteps = cached.steps;
      applyTranslationToGrid(cached.steps);
      showTip(`✅ Loaded cached ${lang} translation (free!)`);
      return;
    }
  } catch {} // table might not exist yet

  // 2. No cache — call AI
  try {
    const steps = Array.isArray(gridCurrentRecipe.steps) ? gridCurrentRecipe.steps : [];
    const ingredients = gridCurrentRecipe.ingredients || '';

    const res  = await fetch('/api/ai/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipe_id:   gridCurrentRecipe.id,
        language:    lang,
        steps,
        ingredients,
      }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    gridTranslatedSteps = data.steps;
    applyTranslationToGrid(data.steps);
    showTip(`✅ Translated to ${lang}! Cached for free next time.`);
  } catch (err) {
    showTip('Translation failed: ' + err.message);
  }
};

function applyTranslationToGrid(translatedSteps) {
  if (!Array.isArray(translatedSteps)) return;
  translatedSteps.forEach((label, i) => {
    const tile = document.getElementById(`gridTile_${i}`);
    if (!tile) return;
    const labelEl = tile.querySelector('[data-step-label]');
    if (labelEl) labelEl.textContent = label;
  });
}

// ============================================================
// PHASE 8d — Cooking Timers + Browser Notifications
// ============================================================
let activeTimerInterval = null;
let activeTimerStep     = null;
let expandedTimerSecs   = 0;
let expandedTimerRunning = false;

// Extract timer from step label: "Simmer 10 min" → 600 seconds
function detectTimer(label) {
  if (!label) return null;
  const match = label.match(/(\d+)\s*(hour|hr|h|minute|min|m|second|sec|s)s?/i);
  if (!match) return null;
  const val  = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  if (unit.startsWith('h')) return val * 3600;
  if (unit.startsWith('m')) return val * 60;
  return val;
};

window.startStepTimer = function(stepIndex, label) {
  const secs = detectTimer(label);
  if (!secs) { showTip('No timer found in this step.'); return; }
  stopActiveTimer();

  activeTimerStep = stepIndex;
  let remaining   = secs;
  const banner    = document.getElementById('gridTimerBanner');
  const text      = document.getElementById('gridTimerText');

  if (Notification.permission === 'default') Notification.requestPermission();

  if (banner) banner.style.display = 'block';

  function tick() {
    const m = Math.floor(remaining / 60).toString().padStart(2,'0');
    const s = (remaining % 60).toString().padStart(2,'0');
    if (text) text.textContent = `⏱ Step ${stepIndex + 1}: ${label} — ${m}:${s} remaining`;
    if (remaining <= 0) {
      stopActiveTimer();
      if (text) text.textContent = `✅ Step ${stepIndex + 1} timer done!`;
      if (Notification.permission === 'granted') {
        new Notification('⏱ SIMR Timer Done!', {
          body: `Step ${stepIndex + 1}: ${label} is ready!`,
          icon: '/favicon.ico',
        });
      }
      setTimeout(() => { if (banner) banner.style.display = 'none'; }, 5000);
      return;
    }
    remaining--;
  }
  tick();
  activeTimerInterval = setInterval(tick, 1000);
};

window.stopActiveTimer = function() {
  if (activeTimerInterval) { clearInterval(activeTimerInterval); activeTimerInterval = null; }
  const banner = document.getElementById('gridTimerBanner');
  if (banner) banner.style.display = 'none';
  activeTimerStep = null;
};

// Timer in expanded overlay
window.toggleExpandedTimer = function() {
  expandedTimerRunning = !expandedTimerRunning;
  const btn = document.getElementById('gridExpandedTimerBtn');
  if (btn) btn.textContent = expandedTimerRunning ? '⏸ Pause' : '▶ Resume';

  if (expandedTimerRunning) {
    const labelEl = document.getElementById('gridExpandedTimerLabel');
    activeTimerInterval = setInterval(() => {
      if (expandedTimerSecs <= 0) {
        clearInterval(activeTimerInterval);
        expandedTimerRunning = false;
        if (btn) btn.textContent = '✅ Done!';
        if (Notification.permission === 'granted') {
          new Notification('⏱ Timer Done!', { body: 'Your cooking step is ready!' });
        }
        return;
      }
      expandedTimerSecs--;
      const m = Math.floor(expandedTimerSecs / 60).toString().padStart(2,'0');
      const s = (expandedTimerSecs % 60).toString().padStart(2,'0');
      if (labelEl) labelEl.textContent = `${m}:${s} remaining`;
    }, 1000);
  } else {
    clearInterval(activeTimerInterval);
  }
};

// ============================================================
// PHASE 8e — Step Progress Tracker (localStorage)
// ============================================================
let gridCompletedSteps = new Set();

function getProgressKey(recipeId) {
  return `simr_progress_${recipeId}`;
}

function loadGridProgress(recipeId) {
  gridCompletedSteps = new Set();
  try {
    const saved = localStorage.getItem(getProgressKey(recipeId));
    if (saved) {
      const arr = JSON.parse(saved);
      gridCompletedSteps = new Set(arr);
    }
  } catch {}
  updateProgressBar(recipeId);
}

function updateProgressBar(recipeId) {
  const total  = gridCurrentRecipe?.loops?.length || 0;
  const done   = gridCompletedSteps.size;
  const doneEl = document.getElementById('gridProgressDone');
  const totEl  = document.getElementById('gridProgressTotal');
  const fill   = document.getElementById('gridProgressFill');
  if (doneEl) doneEl.textContent = done;
  if (totEl)  totEl.textContent  = total;
  if (fill)   fill.style.width   = total > 0 ? `${Math.round((done/total)*100)}%` : '0%';
}

function saveGridProgress(recipeId) {
  localStorage.setItem(getProgressKey(recipeId), JSON.stringify([...gridCompletedSteps]));
}

window.toggleStepDone = function(stepIndex) {
  if (!gridCurrentRecipe) return;
  if (gridCompletedSteps.has(stepIndex)) {
    gridCompletedSteps.delete(stepIndex);
  } else {
    gridCompletedSteps.add(stepIndex);
  }
  saveGridProgress(gridCurrentRecipe.id);
  updateProgressBar(gridCurrentRecipe.id);
  refreshTileDoneState(stepIndex);

  const total = gridCurrentRecipe.loops?.length || 0;
  if (gridCompletedSteps.size === total && total > 0) {
    setTimeout(() => showTip('🎉 Recipe complete! Every step done!'), 300);
  }
};

function refreshTileDoneState(i) {
  const tile = document.getElementById(`gridTile_${i}`);
  if (!tile) return;
  const done = gridCompletedSteps.has(i);
  tile.style.opacity  = done ? '0.6' : '1';
  const doneBtn = document.getElementById(`gridDoneBtn_${i}`);
  if (doneBtn) {
    doneBtn.textContent = done ? '✅ Done' : '○ Done';
    doneBtn.style.background = done ? '#22c55e' : 'rgba(255,255,255,0.85)';
    doneBtn.style.color      = done ? '#fff' : '#333';
  }
}

// Mark done from the expanded overlay
window.markExpandedStepDone = function() {
  if (gridExpandedIndex === null) return;
  toggleStepDone(gridExpandedIndex);
  const btn = document.getElementById('gridExpandedDoneBtn');
  if (btn) {
    const done = gridCompletedSteps.has(gridExpandedIndex);
    btn.textContent = done ? '✅ Done!' : '○ Mark Done';
    btn.style.background = done ? '#16a34a' : '#22c55e';
  }
};

window.resetGridProgress = function() {
  if (!gridCurrentRecipe) return;
  gridCompletedSteps = new Set();
  saveGridProgress(gridCurrentRecipe.id);
  updateProgressBar(gridCurrentRecipe.id);
  const loops = gridCurrentRecipe.loops || [];
  loops.forEach((_, i) => refreshTileDoneState(i));
  showTip('Progress reset 🔄');
};

// ══════════════════════════════════════════════════════════════════════════════
// 📁 LIBRARY — Folders, search, sort, drag-and-drop
// ══════════════════════════════════════════════════════════════════════════════

const LIB_KEY          = 'cookingGPS_library_v1';
const FOLDER_COLORS    = ['#a8d8f0','#b8f0c8','#f0d8a8','#d8b8f0','#f0b8c8','#a8f0e8','#f0ebb8','#c8b8f0','#ffd6a5','#caffbf'];
let   libState         = null;   // loaded on first render
let   libAllRecipes    = [];     // all recipes owned by user (from Supabase)
let   libSearchQuery   = '';
window.libOpenFolderId = null;   // null = root; string = folder id being viewed
let   libEditFolderId  = null;   // null = create mode; string = edit mode
let   libDragItem      = null;   // { type:'folder'|'recipe', id }
let   libSelectedColor = FOLDER_COLORS[0];
window.libPendingFolderRecipeId = null; // recipe to move after creating folder

// ── State helpers ──────────────────────────────────────────────────────────
function libLoad() {
  try {
    const raw = localStorage.getItem(LIB_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    libState = (parsed && typeof parsed === 'object') ? parsed : { sort:'az', folders:[], customOrder:[] };
  } catch {
    libState = { sort:'az', folders:[], customOrder:[] };
  }
  // Ensure required keys and arrays
  if (!libState.folders || !Array.isArray(libState.folders)) {
    libState.folders = [];
  } else {
    // Filter out any null/undefined entries
    libState.folders = libState.folders.filter(f => f && typeof f === 'object');
  }
  if (!libState.customOrder || !Array.isArray(libState.customOrder)) {
    libState.customOrder = [];
  }
  if (!libState.savedRecipeIds || !Array.isArray(libState.savedRecipeIds)) {
    libState.savedRecipeIds = [];
  }
  if (!libState.sort) libState.sort = 'az';
  if (!libState.layout) libState.layout = 'grid';
}

function libSave() {
  localStorage.setItem(LIB_KEY, JSON.stringify(libState));
}

function libGetFolder(id) {
  return libState.folders.find(f => f && f.id === id);
}

function libMakeId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// ── Fetch user recipes from Supabase ──────────────────────────────────────
async function libFetchRecipes() {
  if (!libState) libLoad();
  
  const savedIds = [];
  if (libState && Array.isArray(libState.folders)) {
    libState.folders.forEach(f => {
      if (f && Array.isArray(f.recipeIds)) {
        f.recipeIds.forEach(id => {
          if (id && !savedIds.includes(id)) savedIds.push(id);
        });
      }
    });
  }
  if (libState && Array.isArray(libState.savedRecipeIds)) {
    libState.savedRecipeIds.forEach(id => {
      if (id && !savedIds.includes(id)) savedIds.push(id);
    });
  }

  if (!currentUser && savedIds.length === 0) return [];

  try {
    const { supabase } = await import('./supabase-client.js');
    let fetchedRecipes = [];

    if (currentUser) {
      const { data, error } = await supabase
        .from('recipes')
        .select('id, title, video_url, bundle_mode, duration, created_at, private_recipe, creator')
        .eq('creator', currentUser.email)
        .order('created_at', { ascending: false });
      
      if (error) {
        if (error.message && (error.message.includes('bundle_mode') || error.message.includes('column'))) {
          const retry = await supabase
            .from('recipes')
            .select('id, title, video_url, duration, created_at, private_recipe, creator')
            .eq('creator', currentUser.email)
            .order('created_at', { ascending: false });
          if (retry.error) throw retry.error;
          fetchedRecipes = retry.data || [];
        } else {
          throw error;
        }
      } else if (data) {
        fetchedRecipes = data;
      }
    }

    const missingIds = savedIds.filter(id => !fetchedRecipes.some(r => r.id === id));
    if (missingIds.length > 0) {
      const { data, error } = await supabase
        .from('recipes')
        .select('id, title, video_url, bundle_mode, duration, created_at, private_recipe, creator')
        .in('id', missingIds);
      
      if (error) {
        const retry = await supabase
          .from('recipes')
          .select('id, title, video_url, duration, created_at, private_recipe, creator')
          .in('id', missingIds);
        if (!retry.error && retry.data) {
          retry.data.forEach(r => { r.thumbnail_url = null; });
          fetchedRecipes = [...fetchedRecipes, ...retry.data];
        }
      } else if (data) {
        fetchedRecipes = [...fetchedRecipes, ...data];
      }
    }

    fetchedRecipes.forEach(r => {
      r.thumbnail_url = r.bundle_mode || null;
    });
    return fetchedRecipes;
  } catch (err) {
    console.error('libFetchRecipes error:', err);
    return [];
  }
}

window.syncFoldersWithSupabase = async function() {
  if (!currentUser) return;
  try {
    const { getFolders, createFolder, assignRecipeToFolder, supabase } = await import('./supabase-client.js');
    
    // 1. Fetch folders from Supabase
    const dbFolders = await getFolders(currentUser.id);
    
    // 2. Fetch recipes from Supabase with folder_id
    const { data: dbRecipes, error } = await supabase
      .from('recipes')
      .select('id, title, video_url, bundle_mode, duration, created_at, private_recipe, creator, folder_id')
      .eq('creator', currentUser.email);
      
    if (error) throw error;
    
    if (!libState) libLoad();
    
    // 3. Sync local folders to DB
    for (const localFolder of libState.folders) {
      if (!localFolder || !localFolder.name) continue;
      // Find matching folder in DB by name (case-insensitive) or by id
      let dbF = dbFolders.find(df => df.id === localFolder.id || df.name.toLowerCase() === localFolder.name.toLowerCase());
      if (!dbF) {
        console.log(`Syncing folder "${localFolder.name}" to Supabase...`);
        dbF = await createFolder(currentUser.id, localFolder.name, localFolder.color || '#4a90d9');
        dbFolders.push(dbF);
      }
      
      // Update local folder ID to match DB folder ID if they differ
      const oldId = localFolder.id;
      localFolder.id = dbF.id;
      
      // Replace references in customOrder
      libState.customOrder = libState.customOrder.map(k => k === 'folder:' + oldId ? 'folder:' + dbF.id : k);
      
      // For each recipe in localFolder, assign it in Supabase
      if (localFolder.recipeIds && Array.isArray(localFolder.recipeIds)) {
        for (const rId of localFolder.recipeIds) {
          const dbR = (dbRecipes || []).find(r => r.id === rId);
          if (dbR && dbR.folder_id !== dbF.id) {
            console.log(`Assigning recipe ${rId} to folder ${dbF.id} in Supabase...`);
            await assignRecipeToFolder(rId, dbF.id);
          }
        }
      }
    }
    
    // 4. Sync DB folders to local
    for (const dbF of dbFolders) {
      let localFolder = libState.folders.find(lf => lf.id === dbF.id || lf.name.toLowerCase() === dbF.name.toLowerCase());
      if (!localFolder) {
        localFolder = {
          id: dbF.id,
          name: dbF.name,
          color: dbF.color,
          recipeIds: []
        };
        libState.folders.push(localFolder);
      }
      
      // Fetch recipe IDs assigned to this folder in Supabase
      const assignedRecipeIds = (dbRecipes || [])
        .filter(r => r.folder_id === dbF.id)
        .map(r => r.id);
        
      assignedRecipeIds.forEach(rId => {
        if (!localFolder.recipeIds.includes(rId)) {
          localFolder.recipeIds.push(rId);
        }
      });
    }
    
    // Ensure all customOrder are present
    const allIds = new Set(libState.customOrder);
    libState.folders.forEach(f => {
      if (f && f.id && !allIds.has('folder:' + f.id)) {
        libState.customOrder.push('folder:' + f.id);
      }
    });
    
    libSave();
    console.log("Supabase folder sync completed successfully!");
  } catch (err) {
    console.error("Error syncing folders with Supabase:", err);
  }
};

// ── Main render ────────────────────────────────────────────────────────────
async function renderLibrary() {
  const content = document.getElementById('libContent');
  if (!content) return;

  try {
    if (!libState) libLoad();

    if (currentUser) {
      await window.syncFoldersWithSupabase();
    }

    // Show loading spinner while fetching
    content.innerHTML = `<div style="text-align:center;padding:4rem;color:var(--text-muted);">
      <div style="font-size:2rem;margin-bottom:0.75rem;">⏳</div>
      <div style="font-weight:700;font-size:0.9rem;">Loading your library…</div>
    </div>`;

    libAllRecipes = await libFetchRecipes();

    // Sync customOrder: add new recipe/folder ids not yet present
    const allIds = new Set(libState.customOrder);
    libState.folders.forEach(f => {
      if (f && f.id && !allIds.has('folder:' + f.id)) {
        libState.customOrder.push('folder:' + f.id);
      }
    });
    libAllRecipes.forEach(r => {
      if (r && r.id && !allIds.has('recipe:' + r.id)) {
        libState.customOrder.push('recipe:' + r.id);
      }
    });
    libSave();

    libRenderContent();
    libUpdateSortBtns();
    libUpdateLayoutBtns();
  } catch (err) {
    console.error('renderLibrary error:', err);
    content.innerHTML = `<div style="text-align:center;padding:4rem;color:#ef4444;font-family:var(--font);">
      <div style="font-size:2.5rem;margin-bottom:0.75rem;">⚠️</div>
      <div style="font-weight:800;font-size:1.1rem;margin-bottom:0.5rem;">Library Rendering Error</div>
      <div style="font-size:0.85rem;margin-bottom:1rem;opacity:0.8;">${err.message}</div>
      <button onclick="localStorage.removeItem('${LIB_KEY}'); location.reload();" 
              style="background:var(--primary);color:#fff;border:none;border-radius:10px;padding:10px 22px;font-family:var(--font);font-weight:900;font-size:0.88rem;cursor:pointer;">
        Reset Library Data
      </button>
    </div>`;
  }
}

function libRenderContent() {
  const content = document.getElementById('libContent');
  if (!content || !libState) return;

  try {
    // If drilling into a folder, show folder view
    if (window.libOpenFolderId) {
      libRenderFolderView(content);
      return;
    }

    const q = libSearchQuery.toLowerCase();

    // Build ordered list respecting current sort
    let folders = [...libState.folders].filter(f => f && typeof f === 'object');
    let loose   = libAllRecipes.filter(r => r && !folders.some(f => f && (f.recipeIds||[]).includes(r.id)));

    // Apply sort
    if (libState.sort === 'az') {
      folders.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      loose.sort((a, b) => (a.title||'').localeCompare(b.title||''));
    } else if (libState.sort === 'za') {
      folders.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
      loose.sort((a, b) => (b.title||'').localeCompare(a.title||''));
    } else {
      // Custom: use customOrder array
      const orderMap = {};
      libState.customOrder.forEach((k, i) => { orderMap[k] = i; });
      folders.sort((a, b) => (orderMap['folder:'+a.id] ?? 999) - (orderMap['folder:'+b.id] ?? 999));
      loose.sort((a, b) => (orderMap['recipe:'+a.id] ?? 999) - (orderMap['recipe:'+b.id] ?? 999));
    }

    // Apply search filter
    if (q) {
      folders = folders.filter(f => f && (f.name || '').toLowerCase().includes(q));
      loose   = loose.filter(r => r && (r.title||'').toLowerCase().includes(q));
    }

    let html = '';

    // ── Folders section ──
    if (folders.length) {
      html += `<div style="margin-bottom:1.5rem;">
        <div style="font-size:0.7rem;font-weight:900;text-transform:uppercase;letter-spacing:0.07em;color:var(--text-muted);margin-bottom:10px;">
          📁 Folders (${folders.length})
        </div>
        <div class="bento-dashboard-grid" style="margin: 0; padding: 0; max-width: 100%;" id="libFolderGrid">`;
      folders.forEach(f => { if (f) html += libFolderCardHTML(f); });
      html += `</div></div>`;
    }

    // ── Loose recipes section ──
    const looseLabel = q ? `Results (${loose.length})` : `Loose Videos (${loose.length})`;
    html += `<div>
      <div style="font-size:0.7rem;font-weight:900;text-transform:uppercase;letter-spacing:0.07em;color:var(--text-muted);margin-bottom:10px;">
        🎬 ${looseLabel}
      </div>`;

    if (!loose.length && !folders.length) {
      html += libEmptyState(q);
    } else if (!loose.length) {
      html += `<div style="text-align:center;padding:2rem;color:var(--text-muted);font-size:0.85rem;font-weight:600;">
        ${q ? 'No videos match your search' : 'All videos are inside folders'}
      </div>`;
    } else {
      const layout = libState.layout || 'grid';
      let containerStyle = '';
      if (layout === 'grid') {
        containerStyle = `display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:16px;`;
      } else {
        containerStyle = `display:flex;flex-direction:column;gap:10px;`;
      }
      html += `<div style="${containerStyle}" id="libLooseList">`;
      loose.forEach(r => { if (r) html += libRecipeCardHTML(r, null); });
      html += `</div>`;
    }
    html += `</div>`;

    content.innerHTML = html;

    // Attach drag events after render
    libAttachDragEvents();
  } catch (err) {
    console.error('libRenderContent error:', err);
    content.innerHTML = `<div style="text-align:center;padding:4rem;color:#ef4444;font-family:var(--font);">
      <div style="font-size:2.5rem;margin-bottom:0.75rem;">⚠️</div>
      <div style="font-weight:800;font-size:1.1rem;margin-bottom:0.5rem;">Library Content Render Error</div>
      <div style="font-size:0.85rem;margin-bottom:1rem;opacity:0.8;">${err.message}</div>
    </div>`;
  }
}

function libFolderCardHTML(f) {
  const count = (f.recipeIds || []).length;
  const isDrag = libState.sort === 'custom';
  return `
    <div class="lib-folder-card bento-widget" id="libF_${f.id}"
      style="background:${f.color}; border-radius:24px; padding:1.5rem; cursor:pointer;
             position:relative; transition:transform 0.15s, box-shadow 0.15s;
             box-shadow:var(--shadow-sm); height:100%; display:flex; flex-direction:column; justify-content:space-between; box-sizing:border-box;"
      onclick="libOpenFolder('${f.id}')"
      ${isDrag ? `draggable="true" ondragstart="libOnDragStart(event,'folder','${f.id}')"` : ''}
      ondragover="libOnDragOver(event,'${f.id}')"
      ondrop="libOnDrop(event,'folder','${f.id}')"
      ondragleave="libOnDragLeave(event)">
      <!-- Actions menu -->
      <div style="position:absolute;top:14px;right:14px;display:flex;gap:6px;" onclick="event.stopPropagation()">
        <button onclick="libRenameFolder('${f.id}')" title="Rename"
          style="background:rgba(255,255,255,0.5);border:none;border-radius:6px;width:24px;height:24px;font-size:0.75rem;cursor:pointer;display:flex;align-items:center;justify-content:center;">✏️</button>
        <button onclick="libDeleteFolder('${f.id}')" title="Delete"
          style="background:rgba(255,255,255,0.5);border:none;border-radius:6px;width:24px;height:24px;font-size:0.75rem;cursor:pointer;display:flex;align-items:center;justify-content:center;">🗑️</button>
      </div>
      <div style="font-size:2.8rem;line-height:1;margin-bottom:8px;">📁</div>
      <div>
        <div style="font-weight:900;font-size:0.95rem;color:rgba(20,20,50,0.85);word-break:break-word;line-height:1.3;">${f.name}</div>
        <div style="font-size:0.72rem;font-weight:700;color:rgba(20,20,50,0.5);margin-top:3px;">${count} video${count !== 1 ? 's' : ''}</div>
      </div>
      ${isDrag ? '<div style="position:absolute;bottom:6px;right:8px;font-size:0.65rem;color:rgba(0,0,0,0.3);font-weight:700;">⠿ drag</div>' : ''}
    </div>`;
}

function libRecipeCardHTML(r, folderId) {
  const mins = r.duration
    ? Math.floor(r.duration / 60) + ':' + String(Math.floor(r.duration % 60)).padStart(2, '0')
    : '';
  const date = r.created_at
    ? new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : '';
  const isDrag = libState.sort === 'custom';
  const layout = libState.layout || 'grid';

  let folderSelectHtml = '';
  if (!folderId) {
    // Loose video
    folderSelectHtml = `
      <button onclick="window.toggleLibFolderDropdown(event, '${r.id}', null)" 
              class="lib-folder-select-trigger"
              style="display:inline-flex; align-items:center; gap:6px; border:2px solid var(--border-card); border-radius:8px; padding:4px 8px; font-family:var(--font); font-weight:700; font-size:0.65rem; outline:none; background:#fff; color:var(--text-muted); max-width:115px; cursor:pointer; text-align:left; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; transition: border-color 0.2s, background 0.2s;">
        📁 Save to folder
      </button>
    `;
  } else {
    // In-folder video
    folderSelectHtml = `
      <button onclick="window.toggleLibFolderDropdown(event, '${r.id}', '${folderId}')" 
              class="lib-folder-select-trigger"
              style="display:inline-flex; align-items:center; gap:6px; border:2px solid var(--border-card); border-radius:8px; padding:4px 8px; font-family:var(--font); font-weight:700; font-size:0.65rem; outline:none; background:#fff; color:var(--text-muted); max-width:115px; cursor:pointer; text-align:left; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; transition: border-color 0.2s, background 0.2s;">
        📁 Move to...
      </button>
    `;
  }

  const deleteBtn = !folderId
    ? `<button onclick="event.stopPropagation();libDeleteRecipe('${r.id}')" title="Delete video"
         style="background:rgba(239,68,68,0.08);border:none;border-radius:7px;padding:5px 10px;font-family:var(--font);font-size:0.65rem;font-weight:800;cursor:pointer;color:#ef4444;white-space:nowrap;">🗑️ Delete</button>`
    : '';

  // Thumbnail markup
  let thumbHtml = getRecipeCardThumbnail(r);

  const privBadge = r.private_recipe
    ? `<span style="font-size:0.6rem;font-weight:800;color:#4a90d9;background:#e8f0fb;border-radius:5px;padding:2px 6px;">🔒 Private</span>`
    : `<span style="font-size:0.6rem;font-weight:800;color:#22c55e;background:#dcfce7;border-radius:5px;padding:2px 6px;">🌎 Public</span>`;

  const dragAttr = isDrag && !folderId
    ? `draggable="true" ondragstart="libOnDragStart(event,'recipe','${r.id}')"`
    : '';

  if (layout === 'grid') {
    return `
      <div class="lib-recipe-card" id="libR_${r.id}"
        style="background:#fff;border-radius:16px;border:2px solid var(--border-card);overflow:hidden;
               cursor:pointer;transition:transform 0.2s,box-shadow 0.2s;display:flex;flex-direction:column;position:relative;"
        onclick="libOpenRecipe('${r.id}')"
        ${dragAttr}
        onmouseenter="this.style.transform='translateY(-2px)';this.style.boxShadow='0 8px 24px rgba(74,144,217,0.14)';this.style.borderColor='var(--primary)';var ov=this.querySelector('.lib-play-ov');if(ov)ov.style.opacity='1';"
        onmouseleave="this.style.transform='';this.style.boxShadow='';this.style.borderColor='var(--border-card)';var ov=this.querySelector('.lib-play-ov');if(ov)ov.style.opacity='0';">
        
        <!-- Thumbnail -->
        <div style="position:relative;height:140px;background:#111;overflow:hidden;flex-shrink:0;">
          ${thumbHtml}
          ${mins ? `<div style="position:absolute;bottom:6px;right:8px;background:rgba(0,0,0,0.8);color:#fff;font-size:0.6rem;font-weight:800;padding:2px 7px;border-radius:5px;">${mins}</div>` : ''}
          <div class="lib-play-ov" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.28);opacity:0;transition:opacity 0.18s;">
            <div style="width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,0.92);display:flex;align-items:center;justify-content:center;font-size:1.1rem;">▶</div>
          </div>
        </div>

        <!-- Info Body -->
        <div style="padding:12px;flex:1;display:flex;flex-direction:column;justify-content:space-between;gap:8px;">
          <div>
            <div style="font-weight:900;font-size:0.86rem;color:var(--text-heading);margin-bottom:4px;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;text-overflow:ellipsis;max-height:2.6rem;">${r.title || 'Untitled'}</div>
            <div style="font-size:0.68rem;color:var(--text-muted);font-weight:700;display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
              ${privBadge}
              ${date ? `<span>• ${date}</span>` : ''}
            </div>
          </div>
          <div style="display:flex;align-items:center;justify-content:flex-end;gap:6px;margin-top:4px;" onclick="event.stopPropagation()">
            ${folderSelectHtml}
            ${deleteBtn}
            ${isDrag && !folderId ? `<div style="font-size:0.75rem;color:var(--text-muted);cursor:grab;font-weight:700;padding:2px 6px;">⠿</div>` : ''}
          </div>
        </div>
      </div>`;
  }

  if (layout === 'list') {
    return `
      <div class="lib-recipe-card" id="libR_${r.id}"
        style="background:#fff;border-radius:14px;border:2px solid var(--border-card);overflow:hidden;
               cursor:pointer;transition:box-shadow 0.15s,border-color 0.15s;display:flex;align-items:stretch;position:relative;"
        onclick="libOpenRecipe('${r.id}')"
        ${dragAttr}
        onmouseenter="this.style.boxShadow='0 6px 20px rgba(74,144,217,0.12)';this.style.borderColor='var(--primary)';var ov=this.querySelector('.lib-play-ov');if(ov)ov.style.opacity='1';"
        onmouseleave="this.style.boxShadow='';this.style.borderColor='var(--border-card)';var ov=this.querySelector('.lib-play-ov');if(ov)ov.style.opacity='0';">
        
        <!-- Thumbnail on the left -->
        <div style="position:relative;width:150px;min-height:95px;background:#111;overflow:hidden;flex-shrink:0;">
          ${thumbHtml}
          ${mins ? `<div style="position:absolute;bottom:6px;right:8px;background:rgba(0,0,0,0.8);color:#fff;font-size:0.6rem;font-weight:800;padding:2px 7px;border-radius:5px;">${mins}</div>` : ''}
          <div class="lib-play-ov" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.28);opacity:0;transition:opacity 0.18s;">
            <div style="width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,0.92);display:flex;align-items:center;justify-content:center;font-size:1rem;">▶</div>
          </div>
        </div>

        <!-- Info on the right -->
        <div style="padding:12px 16px;flex:1;display:flex;justify-content:space-between;align-items:center;gap:12px;min-width:0;">
          <div style="min-width:0;">
            <div style="font-weight:900;font-size:0.92rem;color:var(--text-heading);margin-bottom:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${r.title || 'Untitled'}</div>
            <div style="font-size:0.68rem;color:var(--text-muted);font-weight:700;display:flex;gap:8px;align-items:center;">
              ${privBadge}
              ${date ? `<span>• ${date}</span>` : ''}
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;" onclick="event.stopPropagation()">
            ${folderSelectHtml}
            ${deleteBtn}
            ${isDrag && !folderId
              ? `<div style="font-size:0.75rem;color:var(--text-muted);cursor:grab;font-weight:700;padding:4px 8px;">⠿</div>`
              : `<span style="font-size:0.85rem;color:var(--text-muted);padding:4px 8px;">›</span>`}
          </div>
        </div>
      </div>`;
  }

  // Compact layout
  return `
    <div class="lib-recipe-card" id="libR_${r.id}"
      style="background:#fff;border-radius:10px;border:2px solid var(--border-card);overflow:hidden;
             cursor:pointer;transition:background 0.1s,border-color 0.1s;display:flex;align-items:center;padding:6px 12px;position:relative;"
      onclick="libOpenRecipe('${r.id}')"
      ${dragAttr}
      onmouseenter="this.style.borderColor='var(--primary)';this.style.background='var(--bg-card-soft)';"
      onmouseleave="this.style.borderColor='var(--border-card)';this.style.background='#fff';">
      
      <!-- Tiny thumbnail representation -->
      <div style="width:36px;height:36px;border-radius:6px;background:#111;overflow:hidden;flex-shrink:0;margin-right:10px;display:flex;align-items:center;justify-content:center;position:relative;">
        ${getCompactRecipeThumbnail(r)}
      </div>

      <div style="flex:1;min-width:0;display:flex;align-items:center;justify-content:space-between;gap:12px;">
        <div style="min-width:0;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <div style="font-weight:900;font-size:0.82rem;color:var(--text-heading);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:320px;">${r.title || 'Untitled'}</div>
          ${privBadge}
          ${mins ? `<span style="font-size:0.65rem;color:var(--text-muted);font-weight:700;">(${mins})</span>` : ''}
        </div>
        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;" onclick="event.stopPropagation()">
          ${folderSelectHtml}
          ${deleteBtn}
          ${isDrag && !folderId
            ? `<div style="font-size:0.75rem;color:var(--text-muted);cursor:grab;font-weight:700;padding:2px 6px;">⠿</div>`
            : `<span style="font-size:0.8rem;color:var(--text-muted);padding:2px 6px;">›</span>`}
        </div>
      </div>
    </div>`;
}

window.libDeleteRecipe = async function(id) {
  if (!confirm('Are you sure you want to delete this video permanently?')) return;
  try {
    const { deleteRecipeById } = await import('./supabase-client.js');
    await deleteRecipeById(id);
    showTip('Video deleted 🗑️');
    renderLibrary();
  } catch (err) {
    showTip('Could not delete video: ' + err.message);
  }
};

function libEmptyState(q) {
  if (q) return `<div style="text-align:center;padding:4rem;color:var(--text-muted);">
    <div style="font-size:2.5rem;margin-bottom:0.75rem;">🔍</div>
    <div style="font-weight:800;font-size:1rem;">No results for "${q}"</div>
  </div>`;
  if (!currentUser) return `<div style="text-align:center;padding:4rem;color:var(--text-muted);">
    <div style="font-size:2.5rem;margin-bottom:0.75rem;">🔒</div>
    <div style="font-weight:800;font-size:1rem;margin-bottom:0.5rem;">Sign in to see your library</div>
    <button onclick="openAuthModal()" style="background:var(--primary);color:#fff;border:none;border-radius:10px;padding:10px 22px;font-family:var(--font);font-weight:900;font-size:0.88rem;cursor:pointer;margin-top:0.5rem;">Sign In</button>
  </div>`;
  return `<div style="text-align:center;padding:4rem;color:var(--text-muted);">
    <div style="font-size:2.5rem;margin-bottom:0.75rem;">📭</div>
    <div style="font-weight:800;font-size:1rem;margin-bottom:0.5rem;">No videos yet</div>
    <div style="font-size:0.85rem;font-weight:600;margin-bottom:1rem;">Create your first video to see it here</div>
    <button onclick="switchView('create')" style="background:var(--primary);color:#fff;border:none;border-radius:10px;padding:10px 22px;font-family:var(--font);font-weight:900;font-size:0.88rem;cursor:pointer;">+ Create Video</button>
  </div>`;
}

// ── Folder drill-down ──────────────────────────────────────────────────────
window.libOpenFolder = function(id) {
  window.libOpenFolderId = id;
  libRenderContent();
};

function libRenderFolderView(content) {
  const f = libGetFolder(window.libOpenFolderId);
  if (!f) { window.libOpenFolderId = null; libRenderContent(); return; }

  const recipes = libAllRecipes.filter(r => r && (f.recipeIds||[]).includes(r.id));
  const q = libSearchQuery.toLowerCase();
  const filtered = q ? recipes.filter(r => r && (r.title||'').toLowerCase().includes(q)) : recipes;

  // Find loose recipes NOT already in this folder for the "Add" picker
  const folders = (libState.folders || []).filter(ff => ff && typeof ff === 'object');
  const allFolderIds = new Set(folders.flatMap(ff => ff.recipeIds||[]));
  const addable = libAllRecipes.filter(r => r && !allFolderIds.has(r.id));

  let html = `
    <!-- Back + folder header -->
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:1.25rem;">
      <button onclick="libCloseFolder()"
        style="background:var(--bg-card-soft);border:2px solid var(--border-card);border-radius:9px;padding:7px 14px;font-family:var(--font);font-weight:900;font-size:0.85rem;cursor:pointer;">← Back</button>
      <div style="width:36px;height:36px;border-radius:10px;background:${f.color};display:flex;align-items:center;justify-content:center;font-size:1.4rem;flex-shrink:0;">📁</div>
      <div>
        <div style="font-weight:900;font-size:1.1rem;color:var(--text-heading);">${f.name}</div>
        <div style="font-size:0.7rem;color:var(--text-muted);font-weight:700;">${recipes.length} video${recipes.length!==1?'s':''}</div>
      </div>
    </div>`;

  // Add recipe dropdown
  if (addable.length) {
    html += `<div style="background:#fff;border-radius:12px;border:2px solid var(--border-card);padding:12px 14px;margin-bottom:1rem;display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
      <span style="font-size:0.75rem;font-weight:800;color:var(--text-muted);white-space:nowrap;">Add video:</span>
      <select id="libAddRecipePicker" style="flex:1;min-width:140px;border:2px solid var(--border-card);border-radius:8px;padding:6px 10px;font-family:var(--font);font-weight:700;font-size:0.82rem;outline:none;background:#fff;">
        <option value="">— pick a video —</option>
        ${addable.map(r => `<option value="${r.id}">${r.title||'Untitled'}</option>`).join('')}
      </select>
      <button onclick="libAddRecipeToFolder(document.getElementById('libAddRecipePicker').value,'${f.id}')"
        style="background:var(--primary);color:#fff;border:none;border-radius:8px;padding:7px 14px;font-family:var(--font);font-weight:800;font-size:0.8rem;cursor:pointer;white-space:nowrap;">+ Add</button>
    </div>`;
  }

  // Recipes list
  if (!filtered.length) {
    html += `<div style="text-align:center;padding:3rem;color:var(--text-muted);">
      <div style="font-size:2rem;margin-bottom:0.5rem;">📂</div>
      <div style="font-weight:700;font-size:0.88rem;">${q ? 'No matching videos' : 'This folder is empty — add videos above'}</div>
    </div>`;
  } else {
    const layout = libState.layout || 'grid';
    let containerStyle = '';
    if (layout === 'grid') {
      containerStyle = `display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:16px;`;
    } else {
      containerStyle = `display:flex;flex-direction:column;gap:10px;`;
    }
    html += `<div style="${containerStyle}">`;
    filtered.forEach(r => { if (r) html += libRecipeCardHTML(r, f.id); });
    html += `</div>`;
  }

  content.innerHTML = html;
}

window.libCloseFolder = function() {
  window.libOpenFolderId = null;
  libRenderContent();
};

window.libAddRecipeToFolder = function(recipeId, folderId) {
  if (!recipeId) return;
  const f = libGetFolder(folderId);
  if (!f) return;
  if (!f.recipeIds) f.recipeIds = [];
  if (!f.recipeIds.includes(recipeId)) f.recipeIds.push(recipeId);
  libSave();
  libRenderContent();
};

window.libRemoveFromFolder = function(recipeId, folderId) {
  const f = libGetFolder(folderId);
  if (!f) return;
  f.recipeIds = (f.recipeIds||[]).filter(id => id !== recipeId);
  libSave();
  libRenderContent();
};

window.libMoveRecipeToFolder = async function(recipeId, currentFolderId, targetFolderId) {
  if (!recipeId) return;

  if (targetFolderId === '__new__') {
    window.libCreateFolder(recipeId);
    return;
  }

  // Ensure it is marked as saved in libState
  if (!libState.savedRecipeIds) libState.savedRecipeIds = [];
  if (!libState.savedRecipeIds.includes(recipeId)) {
    libState.savedRecipeIds.push(recipeId);
  }

  // Remove from current folder if it was in one
  if (currentFolderId && currentFolderId !== '__loose__') {
    const curF = libGetFolder(currentFolderId);
    if (curF) {
      curF.recipeIds = (curF.recipeIds || []).filter(id => id !== recipeId);
    }
  }

  // Add to target folder if specified and not "loose"
  if (targetFolderId && targetFolderId !== '__loose__' && targetFolderId !== '') {
    const targetF = libGetFolder(targetFolderId);
    if (targetF) {
      if (!targetF.recipeIds) targetF.recipeIds = [];
      if (!targetF.recipeIds.includes(recipeId)) {
        targetF.recipeIds.push(recipeId);
      }
    }
  }

  if (currentUser) {
    try {
      const { assignRecipeToFolder } = await import('./supabase-client.js');
      const targetFolderIdOrNull = (targetFolderId && targetFolderId !== '__loose__') ? targetFolderId : null;
      await assignRecipeToFolder(recipeId, targetFolderIdOrNull);
    } catch (err) {
      console.error('Error syncing recipe folder assignment in libMoveRecipeToFolder:', err);
    }
  }

  libSave();
  libRenderContent();
  
  if (typeof mySpaceRenderFolderStrip === 'function') {
    mySpaceRenderFolderStrip();
  }
  if (typeof window.updatePlayerFolderSelect === 'function') {
    window.updatePlayerFolderSelect();
  }
  showTip("Video folder updated 📁");
};

window.toggleLibFolderDropdown = function(event, recipeId, currentFolderId) {
  event.stopPropagation();

  if (!libState) {
    try {
      libLoad();
    } catch (e) {
      libState = { sort: 'az', folders: [], customOrder: [] };
    }
  }
  if (!libState) {
    libState = { sort: 'az', folders: [], customOrder: [] };
  }

  const btn = event.currentTarget;
  let menu = document.getElementById('libFolderDropdownMenu');
  if (!menu) {
    menu = document.createElement('div');
    menu.id = 'libFolderDropdownMenu';
    menu.style.position = 'absolute';
    menu.style.background = '#ffffff';
    menu.style.border = '1.5px solid rgba(124,58,237,0.2)';
    menu.style.borderRadius = '12px';
    menu.style.boxShadow = '0 10px 25px -5px rgba(0,0,0,0.06), 0 8px 10px -6px rgba(0,0,0,0.06)';
    menu.style.zIndex = '99999';
    menu.style.display = 'none';
    menu.style.overflow = 'hidden';
    menu.style.flexDirection = 'column';
    menu.style.minWidth = '160px';
    document.body.appendChild(menu);
  }

  if (menu.style.display === 'flex' && menu.dataset.recipeId === recipeId) {
    menu.style.display = 'none';
    return;
  }

  menu.dataset.recipeId = recipeId;
  menu.dataset.currentFolderId = currentFolderId || '';

  const foldersList = (libState.folders || []).filter(ff => ff && typeof ff === 'object');

  let html = '';
  // Header / Title
  html += `
    <div style="padding: 8px 16px 4px; font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); font-weight: 800; border-bottom: 1px solid rgba(0,0,0,0.03);">
      📁 ${currentFolderId ? 'Move to...' : 'Save to folder'}
    </div>
  `;

  // Loose Videos option
  if (currentFolderId) {
    html += `
      <button onclick="window.libMoveRecipeToFolder('${recipeId}', '${currentFolderId}', '__loose__'); window.closeLibFolderDropdown();" 
              style="width: 100%; background: transparent; border: none; padding: 10px 16px; font-family: var(--font); font-size: 0.75rem; font-weight: 700; color: var(--text-heading); text-align: left; cursor: pointer; display: flex; align-items: center; gap: 8px; transition: background 0.12s, color 0.12s;"
              onmouseenter="this.style.background='#f5f0ff'; this.style.color='var(--primary)';" 
              onmouseleave="this.style.background='transparent'; this.style.color='var(--text-heading)';">
        <span>🎬</span> Loose Videos
      </button>
    `;
  }

  // Folders list
  foldersList.forEach(f => {
    // If we are already in this folder, skip it
    if (f.id === currentFolderId) return;

    // Bullet dot indicating folder color
    const dotHtml = `<span style="display:inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${f.color || '#7c3aed'}; margin-right: 2px;"></span>`;

    html += `
      <button onclick="window.libMoveRecipeToFolder('${recipeId}', ${currentFolderId ? `'${currentFolderId}'` : 'null'}, '${f.id}'); window.closeLibFolderDropdown();" 
              style="width: 100%; background: transparent; border: none; padding: 10px 16px; font-family: var(--font); font-size: 0.75rem; font-weight: 700; color: var(--text-heading); text-align: left; cursor: pointer; display: flex; align-items: center; gap: 8px; transition: background 0.12s, color 0.12s;"
              onmouseenter="this.style.background='#f5f0ff'; this.style.color='var(--primary)';" 
              onmouseleave="this.style.background='transparent'; this.style.color='var(--text-heading)';">
        ${dotHtml} ${f.name}
      </button>
    `;
  });

  // Create folder option
  html += `
    <button onclick="window.libCreateFolder('${recipeId}'); window.closeLibFolderDropdown();" 
            style="width: 100%; background: transparent; border: none; border-top: 1px solid rgba(0,0,0,0.03); padding: 10px 16px; font-family: var(--font); font-size: 0.75rem; font-weight: 700; color: var(--primary); text-align: left; cursor: pointer; display: flex; align-items: center; gap: 8px; transition: background 0.12s;"
            onmouseenter="this.style.background='#f5f0ff';" 
            onmouseleave="this.style.background='transparent';">
      <span style="font-weight: 800; font-size: 0.8rem;">＋</span> Create Folder...
    </button>
  `;

  menu.innerHTML = html;
  menu.style.display = 'flex';

  const rect = btn.getBoundingClientRect();
  const menuHeight = menu.offsetHeight || 180;
  if (rect.top - menuHeight > 10) {
    menu.style.top = `${rect.top - menuHeight - 4 + window.scrollY}px`;
  } else {
    menu.style.top = `${rect.bottom + 4 + window.scrollY}px`;
  }
  menu.style.left = `${rect.left + window.scrollX}px`;
};

window.closeLibFolderDropdown = function() {
  const menu = document.getElementById('libFolderDropdownMenu');
  if (menu) menu.style.display = 'none';
};

window.libOpenRecipe = function(id) {
  const r = libAllRecipes.find(r => r.id === id);
  if (r) showTip('Opening "' + r.title + '"\u2026');
  window.loadRecipeById(id);
};

// ── Sort ──────────────────────────────────────────────────────────────────
window.libSetSort = function(mode) {
  if (!libState) libLoad();
  libState.sort = mode;
  libSave();
  libUpdateSortBtns();
  libRenderContent();
};

function libUpdateSortBtns() {
  const mode = libState?.sort || 'az';
  const select = document.getElementById('libSortSelect');
  if (select) {
    select.value = mode;
  }
}

// ── Layout ────────────────────────────────────────────────────────────────
window.libSetLayout = function(mode) {
  if (!libState) libLoad();
  libState.layout = mode;
  libSave();
  libUpdateLayoutBtns();
  libRenderContent();
};

function libUpdateLayoutBtns() {
  const mode = libState?.layout || 'grid';
  const select = document.getElementById('libLayoutSelect');
  if (select) {
    select.value = mode;
  }
}

// ── Search ────────────────────────────────────────────────────────────────
window.libSearch = function(q) {
  libSearchQuery = q || '';
  libRenderContent();
};

// ── Folder CRUD ───────────────────────────────────────────────────────────
window.libCreateFolder = function(pendingRecipeId = null) {
  libEditFolderId  = null;
  window.libPendingFolderRecipeId = pendingRecipeId;
  libSelectedColor = FOLDER_COLORS[libState.folders.length % FOLDER_COLORS.length];
  const title = document.getElementById('libModalTitle');
  const input = document.getElementById('libFolderNameInput');
  if (title) title.textContent = '📁 New Folder';
  if (input) input.value = '';
  libRenderSwatches();
  const modal = document.getElementById('libFolderModal');
  if (modal) { modal.style.display = 'flex'; setTimeout(() => input?.focus(), 60); }
};

window.libRenameFolder = function(id) {
  const f = libGetFolder(id);
  if (!f) return;
  libEditFolderId  = id;
  libSelectedColor = f.color;
  const title = document.getElementById('libModalTitle');
  const input = document.getElementById('libFolderNameInput');
  if (title) title.textContent = '✏️ Rename Folder';
  if (input) input.value = f.name;
  libRenderSwatches();
  const modal = document.getElementById('libFolderModal');
  if (modal) { modal.style.display = 'flex'; setTimeout(() => { input?.focus(); input?.select(); }, 60); }
};

window.libSaveFolder = async function() {
  const input = document.getElementById('libFolderNameInput');
  const name  = input?.value?.trim();
  if (!name) { input?.focus(); return; }

  if (libEditFolderId) {
    const f = libGetFolder(libEditFolderId);
    if (f) {
      f.name = name;
      f.color = libSelectedColor;
      if (currentUser) {
        try {
          const { supabase } = await import('./supabase-client.js');
          await supabase.from('recipe_folders').update({ name, color: libSelectedColor }).eq('id', libEditFolderId);
        } catch (err) {
          console.error('Error updating folder in Supabase:', err);
        }
      }
    }
  } else {
    let newId = libMakeId();
    if (currentUser) {
      try {
        const { createFolder } = await import('./supabase-client.js');
        const dbF = await createFolder(currentUser.id, name, libSelectedColor);
        if (dbF && dbF.id) newId = dbF.id;
      } catch (err) {
        console.error('Error creating folder in Supabase:', err);
      }
    }
    const newFolder = { id: newId, name, color: libSelectedColor, recipeIds: [] };
    if (window.libPendingFolderRecipeId) {
      newFolder.recipeIds.push(window.libPendingFolderRecipeId);
      if (currentUser) {
        try {
          const { assignRecipeToFolder } = await import('./supabase-client.js');
          await assignRecipeToFolder(window.libPendingFolderRecipeId, newId);
        } catch (err) {
          console.error('Error assigning recipe to folder in Supabase:', err);
        }
      }
      window.libPendingFolderRecipeId = null;
    }
    libState.folders.push(newFolder);
    libState.customOrder.push('folder:' + newFolder.id);
  }
  libSave();
  libCloseModal();
  libRenderContent();
  
  if (typeof mySpaceRenderFolderStrip === 'function') {
    mySpaceRenderFolderStrip();
  }
  if (typeof window.updatePlayerFolderSelect === 'function') {
    window.updatePlayerFolderSelect();
  }
};

window.libDeleteFolder = async function(id) {
  if (!confirm('Delete this folder? Videos inside will be moved back to loose.')) return;
  libState.folders = libState.folders.filter(f => f.id !== id);
  libState.customOrder = libState.customOrder.filter(k => k !== 'folder:' + id);
  libSave();
  if (window.libOpenFolderId === id) window.libOpenFolderId = null;
  libRenderContent();
  if (typeof window.updatePlayerFolderSelect === 'function') {
    window.updatePlayerFolderSelect();
  }
  if (currentUser) {
    try {
      const { supabase } = await import('./supabase-client.js');
      await supabase.from('recipe_folders').delete().eq('id', id);
      await supabase.from('recipes').update({ folder_id: null }).eq('folder_id', id);
    } catch (err) {
      console.error('Error deleting folder in Supabase:', err);
    }
  }
};

window.libCloseModal = function() {
  const modal = document.getElementById('libFolderModal');
  if (modal) modal.style.display = 'none';
  libEditFolderId = null;
  window.libPendingFolderRecipeId = null;
};

function libRenderSwatches() {
  const box = document.getElementById('libColorSwatches');
  if (!box) return;
  box.innerHTML = FOLDER_COLORS.map(c => `
    <div onclick="libPickColor('${c}')" id="swatch_${c.slice(1)}"
      style="width:28px;height:28px;border-radius:50%;background:${c};cursor:pointer;
             border:3px solid ${c === libSelectedColor ? '#3b82f6' : 'transparent'};
             transition:border-color 0.15s;flex-shrink:0;"></div>`).join('');
}

window.libPickColor = function(c) {
  libSelectedColor = c;
  document.querySelectorAll('[id^="swatch_"]').forEach(el => {
    el.style.borderColor = '#' + el.id.slice(6) === c.slice(1) ? '#3b82f6' : 'transparent';
  });
  // Re-render just the swatches
  libRenderSwatches();
};

// ── Drag-and-drop ─────────────────────────────────────────────────────────
window.libOnDragStart = function(e, type, id) {
  libDragItem = { type, id };
  e.dataTransfer.effectAllowed = 'move';
  setTimeout(() => {
    const el = document.getElementById((type==='folder'?'libF_':'libR_') + id);
    if (el) el.style.opacity = '0.4';
  }, 0);
};

window.libOnDragOver = function(e, folderId) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const el = document.getElementById('libF_' + folderId);
  if (el) el.style.outline = '3px solid var(--primary)';
};

window.libOnDragLeave = function(e) {
  e.currentTarget.style.outline = '';
};

window.libOnDrop = async function(e, targetType, targetId) {
  e.preventDefault();
  e.currentTarget.style.outline = '';
  if (!libDragItem) return;

  // If dropping a recipe onto a folder card → move recipe into folder
  if (libDragItem.type === 'recipe' && targetType === 'folder') {
    const f = libGetFolder(targetId);
    if (f && !f.recipeIds.includes(libDragItem.id)) {
      f.recipeIds.push(libDragItem.id);
      libSave();
      if (currentUser) {
        try {
          const { assignRecipeToFolder } = await import('./supabase-client.js');
          await assignRecipeToFolder(libDragItem.id, targetId);
        } catch (err) {
          console.error('Error syncing recipe folder assignment in drag-and-drop:', err);
        }
      }
    }
  }
  // If custom sort: reorder customOrder
  else if (libState.sort === 'custom') {
    const dragKey   = libDragItem.type + ':' + libDragItem.id;
    const targetKey = targetType + ':' + targetId;
    const order     = libState.customOrder.filter(k => k !== dragKey);
    const tIdx      = order.indexOf(targetKey);
    order.splice(tIdx >= 0 ? tIdx : order.length, 0, dragKey);
    libState.customOrder = order;
    libSave();
  }

  libDragItem = null;
  libRenderContent();
};

function libAttachDragEvents() {
  // Reset opacity on all cards after render
  document.querySelectorAll('[id^="libF_"],[id^="libR_"]').forEach(el => { el.style.opacity = '1'; });
}

// switchView triggers are unified in the main switchView definition

window.handleDiscoverSearch = function(query) {
  if (!query.trim()) {
    renderDiscoverGrid(allDiscoverRecipes);
    return;
  }
  const q = query.toLowerCase();
  const filtered = allDiscoverRecipes.filter(r =>
    (r.title || '').toLowerCase().includes(q) ||
    (r.creator || '').toLowerCase().includes(q)
  );
  renderDiscoverGrid(filtered);
};

// ============================================================
// EXPOSE ALL HTML onclick FUNCTIONS TO GLOBAL WINDOW SCOPE
// ES modules are private by default — this makes them reachable
// from inline onclick="..." attributes in index.html
// ============================================================
// ── Accordion toggle — shared by all collapsible panels in Create editor ───
window.togglePanel = function(bodyId, chevronId) {
  const body    = document.getElementById(bodyId);
  const chevron = document.getElementById(chevronId);
  if (!body) return;
  const isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : '';
  if (chevron) chevron.style.transform = isOpen ? 'rotate(-90deg)' : '';
};

window.switchView            = switchView;
window.changeDefaultLandingView = function(view) {
  localStorage.setItem('cooking_gps_landing_view', view);
  showTip(`Default landing view set to: ${view === 'create' ? 'Create' : 'My Space'} 🏡`);
};
window.switchSidebarTab      = switchSidebarTab;
window.toggleVideoPlayback   = toggleVideoPlayback;
window.setPlaybackMode       = setPlaybackMode;
window.seekToStep            = seekToStep;
window.desktopPlayerNext     = function() {
  if (!recipeData.loops || recipeData.loops.length === 0) {
    showTip("Last step reached.");
    return;
  }

  const firstStepStart = recipeData.loops[0] || 0;
  if (currentTime < firstStepStart) {
    seekToStep(0);
    return;
  }

  // Find the correct activeStepIndex based on currentTime
  let foundIndex = 0;
  for (let i = 0; i < recipeData.loops.length; i++) {
    if (currentTime >= recipeData.loops[i] - 0.01) {
      foundIndex = i;
    }
  }
  if (recipeData.steps && foundIndex >= recipeData.steps.length) {
    foundIndex = recipeData.steps.length - 1;
  }
  activeStepIndex = foundIndex;

  if (activeStepIndex < recipeData.steps.length - 1) {
    seekToStep(activeStepIndex + 1);
  } else {
    showTip("Last step reached.");
  }
};
window.desktopPlayerPrev     = function() {
  if (!recipeData.loops || recipeData.loops.length === 0) {
    currentTime = 0;
    const realVideo = document.getElementById('mobileRealVideo');
    if (realVideo && realVideo.style.display !== 'none') {
      realVideo.currentTime = 0;
    }
    showTip("Beginning of video reached.");
    return;
  }

  // Find the correct activeStepIndex based on currentTime
  let foundIndex = 0;
  for (let i = 0; i < recipeData.loops.length; i++) {
    if (currentTime >= recipeData.loops[i] - 0.01) {
      foundIndex = i;
    }
  }
  if (recipeData.steps && foundIndex >= recipeData.steps.length) {
    foundIndex = recipeData.steps.length - 1;
  }
  activeStepIndex = foundIndex;

  if (activeStepIndex > 0) {
    seekToStep(activeStepIndex - 1);
  } else {
    seekToStep(0);
    showTip("Beginning of video reached.");
  }
};

// ============================================================
// MULTIGRID VIDEO PLAYER (Row vs Quad)
// ============================================================
let isPlayerMultigridActive = false;
let playerGridLayout = 'quad'; // 'row' | 'quad'
let playerSelectedSteps = new Set();
let playerDescLayoutMode = 'row'; // 'row' | 'column'
let playerMultigridIntervals = {};
let playerMultigridHlsInstances = {};

window.togglePlayerMultigridMode = function() {
  isPlayerMultigridActive = !isPlayerMultigridActive;
  const toggleBtn = document.getElementById('playerMultigridToggleBtn');
  const container = document.getElementById('playerMultigridContainer');
  const canvas = document.getElementById('mobileVideoCanvas');
  const realVideo = document.getElementById('mobileRealVideo');
  
  if (toggleBtn) {
    if (isPlayerMultigridActive) {
      toggleBtn.style.background = 'var(--primary)';
      toggleBtn.style.color = '#fff';
    } else {
      toggleBtn.style.background = 'rgba(0,0,0,0.5)';
      toggleBtn.style.color = '#fff';
    }
  }

  if (isPlayerMultigridActive) {
    // Initialize selected steps if empty
    if (playerSelectedSteps.size === 0 && recipeData && recipeData.steps) {
      // Initialize with only the currently active step
      playerSelectedSteps.add(activeStepIndex);
    }
    
    // Pause and hide single player
    if (realVideo) {
      realVideo.pause();
      realVideo.style.display = 'none';
    }
    if (canvas) canvas.style.display = 'none';
    
    // Show grid
    if (container) container.style.display = 'block';
    
    renderPlayerMultigrid();
    showTip("Entered Multigrid Mode 🖥️");
  } else {
    // Stop grid loops
    stopAllPlayerMultigridLoops();
    
    // Hide grid
    if (container) container.style.display = 'none';
    
    // Restore single player
    if (recipeData.video_url && realVideo) {
      realVideo.style.display = 'block';
    } else if (canvas) {
      canvas.style.display = 'block';
    }
    
    updateMultigridLayoutClass();
    showTip("Returned to Single Player 🎬");
  }
};

window.setPlayerGridLayout = function(layout) {
  playerGridLayout = layout;
  const rowBtn = document.getElementById('playerLayoutRowBtn');
  const quadBtn = document.getElementById('playerLayoutQuadBtn');
  
  if (rowBtn) {
    rowBtn.style.background = layout === 'row' ? 'var(--primary)' : 'rgba(255,255,255,0.15)';
  }
  if (quadBtn) {
    quadBtn.style.background = layout === 'quad' ? 'var(--primary)' : 'rgba(255,255,255,0.15)';
  }

  renderPlayerMultigrid();
};

window.togglePlayerMultigridStep = function(idx) {
  if (playerSelectedSteps.has(idx)) {
    if (playerSelectedSteps.size <= 1) {
      showTip("Please keep at least one step selected.");
      renderPlayerMultigrid();
      return;
    }
    playerSelectedSteps.delete(idx);
  } else {
    playerSelectedSteps.add(idx);
  }
  renderPlayerMultigrid();
};

window.togglePlayerMultigridMute = function(event, idx) {
  if (event) event.stopPropagation();
  const video = document.getElementById(`playerMultigridVid_${idx}`);
  const btn = document.getElementById(`playerMultigridMuteBtn_${idx}`);
  if (!video || !btn) return;
  video.muted = !video.muted;
  
  if (video.muted) {
    btn.innerHTML = `<i data-lucide="volume-x" style="width:12px; height:12px;"></i>`;
  } else {
    // Mute all other videos in the grid first
    if (recipeData && recipeData.steps) {
      recipeData.steps.forEach((_, otherIdx) => {
        if (otherIdx !== idx) {
          const otherVid = document.getElementById(`playerMultigridVid_${otherIdx}`);
          const otherBtn = document.getElementById(`playerMultigridMuteBtn_${otherIdx}`);
          if (otherVid) otherVid.muted = true;
          if (otherBtn) otherBtn.innerHTML = `<i data-lucide="volume-x" style="width:12px; height:12px;"></i>`;
        }
      });
    }
    btn.innerHTML = `<i data-lucide="volume-2" style="width:12px; height:12px;"></i>`;
  }
  if (window.lucide) lucide.createIcons();
};

function updateMultigridLayoutClass() {
  const screen = document.querySelector('.phone-screen');
  const videoContainer = document.querySelector('.mobile-video-container');
  const multigridContainer = document.getElementById('playerMultigridContainer');
  const wrapper = document.querySelector('.player-mobile-wrapper');
  const leftCol = document.querySelector('.player-left-column');

  if (leftCol) {
    leftCol.style.setProperty('height', 'auto', 'important');
    leftCol.style.setProperty('flex', '0 0 auto', 'important');
  }

  if (screen) {
    if (isPlayerMultigridActive && playerGridLayout === 'row') {
      screen.classList.add('multigrid-row-mode');
    } else {
      screen.classList.remove('multigrid-row-mode');
    }

    if (isPlayerMultigridActive) {
      screen.classList.add('multigrid-active');
    } else {
      screen.classList.remove('multigrid-active');
    }
  }

  if (wrapper) {
    if (isPlayerMultigridActive) {
      wrapper.classList.add('multigrid-active');
    } else {
      wrapper.classList.remove('multigrid-active');
    }
  }

  if (videoContainer) {
    const placeholder = videoContainer.querySelector('.mobile-video-placeholder');
    if (isPlayerMultigridActive) {
      videoContainer.classList.add('multigrid-active');
      videoContainer.style.setProperty('height', 'auto', 'important');
      videoContainer.style.setProperty('aspect-ratio', 'auto', 'important');
      if (placeholder) {
        placeholder.style.setProperty('height', 'auto', 'important');
        placeholder.style.setProperty('aspect-ratio', 'auto', 'important');
      }
    } else {
      videoContainer.classList.remove('multigrid-active');
      const screenWidth = screen ? screen.clientWidth : 390;
      const w = videoContainer.getBoundingClientRect().width || videoContainer.clientWidth || screenWidth || 390;
      const h = Math.round(w * 9 / 16);
      videoContainer.style.setProperty('height', `${h}px`, 'important');
      videoContainer.style.setProperty('aspect-ratio', '16/9', 'important');
      if (placeholder) {
        placeholder.style.setProperty('height', '100%', 'important');
        placeholder.style.setProperty('aspect-ratio', '16/9', 'important');
      }
    }
  }

  if (multigridContainer) {
    if (isPlayerMultigridActive) {
      multigridContainer.classList.add('multigrid-active');
    } else {
      multigridContainer.classList.remove('multigrid-active');
    }
  }

  // Render descriptions
  if (typeof renderMultigridDescriptions === 'function') {
    renderMultigridDescriptions();
  }

  // Force layout reflow and repaint to solve Safari aspect-ratio and layout caching bugs
  if (videoContainer) videoContainer.offsetHeight;
  if (screen) screen.offsetHeight;
  if (leftCol) leftCol.offsetHeight;
  window.dispatchEvent(new Event('resize'));
}

window.toggleMultigridTilePlayback = function(event, idx) {
  if (event) event.stopPropagation();
  
  // Try video first
  const video = document.getElementById(`playerMultigridVid_${idx}`);
  if (video) {
    if (video.paused) {
      video.play().catch(() => {});
      showTip(`Step ${idx + 1} playing ▶`);
    } else {
      video.pause();
      showTip(`Step ${idx + 1} paused ⏸`);
    }
    return;
  }
  
  // Try canvas simulation next
  const canvas = document.getElementById(`playerMultigridCanvas_${idx}`);
  if (canvas) {
    if (playerMultigridIntervals[idx]) {
      // Pause simulation
      clearInterval(playerMultigridIntervals[idx]);
      playerMultigridIntervals[idx] = null;
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.save();
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
        const dw = canvas.width / window.devicePixelRatio;
        const dh = canvas.height / window.devicePixelRatio;
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(0, 0, dw, dh);
        ctx.fillStyle = '#fff';
        ctx.font = "bold 13px 'Nunito', sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("⏸ Paused", dw / 2, dh / 2 + 4);
        ctx.restore();
      }
      showTip(`Step ${idx + 1} simulation paused ⏸`);
    } else {
      // Resume simulation
      setupMultigridTileSimulation(idx, canvas);
      showTip(`Step ${idx + 1} simulation playing ▶`);
    }
  }
};

function renderPlayerMultigrid() {
  const tilesContainer = document.getElementById('playerMultigridTiles');
  const selectorList = document.getElementById('playerMultigridSelectorList');
  if (!tilesContainer || !recipeData || !recipeData.steps) return;
  
  updateMultigridLayoutClass();
  
  // Render selector checkboxes
  if (selectorList) {
    selectorList.innerHTML = recipeData.steps.map((step, idx) => {
      const checked = playerSelectedSteps.has(idx) ? 'checked' : '';
      return `
        <label style="display:inline-flex; align-items:center; gap:4px; font-family:var(--font); font-size:0.68rem; font-weight:800; color:#fff; background:rgba(255,255,255,0.08); padding:4px 10px; border-radius:999px; cursor:pointer; user-select:none; transition:all 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.15)'" onmouseout="this.style.background='rgba(255,255,255,0.08)'">
          <input type="checkbox" ${checked} onchange="window.togglePlayerMultigridStep(${idx})" style="accent-color:var(--primary); cursor:pointer;" />
          ${idx + 1}
        </label>
      `;
    }).join('');
  }

  // Clean up existing loops
  stopAllPlayerMultigridLoops();
  tilesContainer.innerHTML = '';
  
  // Apply layout styles
  if (playerGridLayout === 'row') {
    tilesContainer.style.display = 'flex';
    tilesContainer.style.flexDirection = 'row';
    tilesContainer.style.overflowX = 'auto';
    tilesContainer.style.overflowY = 'hidden';
    tilesContainer.style.flexWrap = 'nowrap';
    tilesContainer.style.scrollSnapType = 'x mandatory';
  } else {
    tilesContainer.style.display = 'grid';
    tilesContainer.style.gridTemplateColumns = 'repeat(auto-fill, minmax(150px, 1fr))';
    tilesContainer.style.overflowX = 'hidden';
    tilesContainer.style.overflowY = 'visible';
    tilesContainer.style.height = 'auto';
  }

  const videoUrl = recipeData.video_url || (playerCurrentRecipe && playerCurrentRecipe.video_url);

  recipeData.steps.forEach((step, idx) => {
    if (!playerSelectedSteps.has(idx)) return;
    
    const startTime = recipeData.loops[idx] || 0;
    const endTime = recipeData.loops[idx + 1] || recipeData.duration;
    
    const tile = document.createElement('div');
    tile.className = 'multigrid-tile';
    tile.style.cssText = `
      position: relative;
      background: #0f172a;
      border-radius: 10px;
      overflow: hidden;
      border: 1.5px solid rgba(255,255,255,0.1);
      aspect-ratio: 16/9;
      flex-shrink: 0;
      scroll-snap-align: start;
      cursor: pointer;
    `;
    if (playerGridLayout === 'row') {
      tile.style.width = '360px';
    } else {
      tile.style.width = '100%';
    }
    tile.onclick = (event) => window.toggleMultigridTilePlayback(event, idx);

    if (videoUrl) {
      tile.innerHTML = `
        <video id="playerMultigridVid_${idx}" playsinline muted style="width:100%; height:100%; object-fit:contain; display:block;"></video>
        <div id="playerMultigridOverlay_${idx}" style="position:absolute; inset:0; background:rgba(0,0,0,0.4); display:flex; align-items:center; justify-content:center; color:#fff; font-size:0.6rem; font-family:var(--font); z-index:2;">Loading...</div>
        
        <!-- Close button (x) to remove step -->
        <button onclick="event.stopPropagation(); window.togglePlayerMultigridStep(${idx})" style="position:absolute; top:6px; right:6px; z-index:5; background:rgba(0,0,0,0.6); border:none; border-radius:50%; width:22px; height:22px; display:flex; align-items:center; justify-content:center; color:#fff; cursor:pointer; transition:all 0.2s;" onmouseover="this.style.background='rgba(239,68,68,0.8)'" onmouseout="this.style.background='rgba(0,0,0,0.6)'" title="Hide video">
          <i data-lucide="x" style="width:12px; height:12px;"></i>
        </button>

        <!-- Mute/Unmute floating button -->
        <button onclick="window.togglePlayerMultigridMute(event, ${idx})" id="playerMultigridMuteBtn_${idx}" style="position:absolute; bottom:6px; right:6px; z-index:5; background:rgba(0,0,0,0.6); border:none; border-radius:50%; width:22px; height:22px; display:flex; align-items:center; justify-content:center; color:#fff; cursor:pointer;">
          <i data-lucide="volume-x" style="width:12px; height:12px;"></i>
        </button>

        <!-- Step info badge -->
        <div style="position:absolute; top:6px; left:6px; z-index:4; background:rgba(0,0,0,0.65); padding:3px 8px; border-radius:999px; font-family:var(--font); font-size:0.6rem; font-weight:800; color:#fff; pointer-events:none;">
          Step ${idx + 1}
        </div>
      `;
      tilesContainer.appendChild(tile);
      if (window.lucide) lucide.createIcons();

      const video = tile.querySelector('video');
      setupMultigridTileVideo(idx, video, videoUrl, startTime, endTime);
    } else {
      // Simulation mode fallback
      tile.innerHTML = `
        <canvas id="playerMultigridCanvas_${idx}" style="width:100%; height:100%; object-fit:contain; display:block;"></canvas>
        
        <!-- Close button (x) to remove step -->
        <button onclick="event.stopPropagation(); window.togglePlayerMultigridStep(${idx})" style="position:absolute; top:6px; right:6px; z-index:5; background:rgba(0,0,0,0.6); border:none; border-radius:50%; width:22px; height:22px; display:flex; align-items:center; justify-content:center; color:#fff; cursor:pointer; transition:all 0.2s;" onmouseover="this.style.background='rgba(239,68,68,0.8)'" onmouseout="this.style.background='rgba(0,0,0,0.6)'" title="Hide video">
          <i data-lucide="x" style="width:12px; height:12px;"></i>
        </button>

        <!-- Step info badge -->
        <div style="position:absolute; top:6px; left:6px; z-index:4; background:rgba(0,0,0,0.65); padding:3px 8px; border-radius:999px; font-family:var(--font); font-size:0.6rem; font-weight:800; color:#fff; pointer-events:none;">
          Step ${idx + 1}
        </div>
      `;
      tilesContainer.appendChild(tile);
      
      const canvas = tile.querySelector('canvas');
      setupMultigridTileSimulation(idx, canvas);
    }
  });
}

function setupMultigridTileVideo(idx, video, videoUrl, startTime, endTime) {
  const overlay = document.getElementById(`playerMultigridOverlay_${idx}`);
  if (!video || !videoUrl) return;

  // Listen to loadedmetadata to set actual video aspect ratio on the card and adjust width in row layout if vertical
  video.addEventListener('loadedmetadata', () => {
    const tile = video.closest('.multigrid-tile');
    if (tile && video.videoWidth && video.videoHeight) {
      tile.style.aspectRatio = `${video.videoWidth} / ${video.videoHeight}`;
      
      // If we are in row layout, adjust the tile width dynamically based on orientation
      if (playerGridLayout === 'row') {
        if (video.videoWidth < video.videoHeight) {
          tile.style.width = '200px';
        } else {
          tile.style.width = '360px';
        }
      }
    }
  });

  if (videoUrl.includes('.m3u8')) {
    if (window.Hls && Hls.isSupported()) {
      const hls = new Hls({ maxBufferLength: 5 });
      hls.loadSource(videoUrl);
      hls.attachMedia(video);
      playerMultigridHlsInstances[idx] = hls;
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.currentTime = startTime;
        video.play().catch(() => {});
        if (overlay) overlay.style.display = 'none';
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = videoUrl;
      video.currentTime = startTime;
      video.play().catch(() => {});
      if (overlay) overlay.style.display = 'none';
    }
  } else {
    video.src = videoUrl;
    video.currentTime = startTime;
    video.play().catch(() => {});
    if (overlay) overlay.style.display = 'none';
  }

  const loopEnd = endTime ?? Infinity;
  const intervalId = setInterval(() => {
    if (!video || video.paused) return;
    if (video.currentTime >= loopEnd - 0.1) {
      video.currentTime = startTime;
    }
  }, 150);
  playerMultigridIntervals[idx] = intervalId;
}

function setupMultigridTileSimulation(idx, canvas) {
  if (!canvas) return;
  
  canvas.width = canvas.clientWidth * window.devicePixelRatio;
  canvas.height = canvas.clientHeight * window.devicePixelRatio;
  
  const ctx = canvas.getContext('2d');
  
  function drawFrame() {
    if (!canvas || !ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    
    ctx.save();
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    const dw = w / window.devicePixelRatio;
    const dh = h / window.devicePixelRatio;
    
    // Soft sky background
    const grad = ctx.createLinearGradient(0, 0, dw, dh);
    grad.addColorStop(0, '#ddeeff');
    grad.addColorStop(1, '#c8e8ff');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, dw, dh);
    
    // Soft floating circles in background
    const t = performance.now() / 3000;
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath();
    ctx.arc(dw * 0.75 + Math.sin(t + idx) * 8, dh * 0.25 + Math.cos(t + idx) * 6, 60, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath();
    ctx.arc(dw * 0.15 + Math.cos(t + idx) * 6, dh * 0.7 + Math.sin(t + idx) * 5, 40, 0, Math.PI * 2);
    ctx.fill();
    
    // Step illustrations
    switch (idx) {
      case 0: { // Prep & Chop
        ctx.fillStyle = '#e8d5b0';
        roundRect(ctx, dw/2 - 65, dh/2 - 15, 130, 55, 10);
        ctx.fillStyle = '#d4bc94';
        ctx.fillRect(dw/2 - 50, dh/2 - 5, 8, 35);
        ctx.fillRect(dw/2 - 30, dh/2 - 5, 8, 35);
        ctx.fillRect(dw/2 - 10, dh/2 - 5, 8, 35);
        const chopY = Math.abs(Math.sin(performance.now() / 160)) * 22;
        ctx.strokeStyle = '#7a9ab8'; ctx.lineWidth = 3; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(dw/2 + 40, dh/2 - 18 - chopY);
        ctx.lineTo(dw/2 + 40, dh/2 + 5 - chopY);
        ctx.stroke();
        ctx.lineWidth = 1;
        ctx.fillStyle = '#2a7a5a'; ctx.font = "700 12px 'Nunito',sans-serif";
        ctx.textAlign = 'center';
        ctx.fillText('🥒 Prep & Chop', dw/2, dh/2 - 30);
        break;
      }
      case 1: { // Sear Chicken
        ctx.fillStyle = '#c8d8e8';
        ctx.beginPath(); ctx.ellipse(dw/2, dh/2 + 18, 48, 14, 0, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#b0c4d8';
        ctx.beginPath(); ctx.arc(dw/2, dh/2 + 10, 40, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = '#8aaac0'; ctx.lineWidth = 7; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(dw/2 - 40, dh/2 + 10); ctx.lineTo(dw/2 - 85, dh/2 + 10); ctx.stroke();
        ctx.lineWidth = 1;
        ctx.fillStyle = '#f0b85a';
        roundRect(ctx, dw/2 - 18, dh/2 + 2, 36, 20, 6);
        ctx.fillStyle = '#e8a040';
        roundRect(ctx, dw/2 - 12, dh/2 + 4, 24, 14, 4);
        ctx.fillStyle = '#c45a2a'; ctx.font = "700 12px 'Nunito',sans-serif";
        ctx.textAlign = 'center';
        ctx.fillText('🍳 Sear the Chicken', dw/2, dh/2 - 30);
        break;
      }
      case 2: { // Stir Fry
        ctx.fillStyle = '#b8c8d8';
        ctx.beginPath(); ctx.ellipse(dw/2, dh/2 + 15, 52, 32, 0, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#a0b4c8';
        ctx.beginPath(); ctx.ellipse(dw/2, dh/2 + 12, 38, 22, 0, 0, Math.PI*2); ctx.fill();
        const tossY = Math.sin(performance.now() / 200) * 10;
        const veggies = [
          {x:-18, y:8, r:7, c:'#6abd6a'}, {x:10, y:4, r:8, c:'#e8a040'},
          {x:-4, y:18, r:6, c:'#e85050'}, {x:18, y:12, r:6, c:'#6abd6a'}
        ];
        veggies.forEach((v, i) => {
          ctx.fillStyle = v.c;
          ctx.beginPath();
          ctx.arc(dw/2 + v.x, dh/2 + v.y + (i%2===0 ? tossY : -tossY)*0.6, v.r, 0, Math.PI*2);
          ctx.fill();
        });
        ctx.fillStyle = '#b07a10'; ctx.font = "700 12px 'Nunito',sans-serif";
        ctx.textAlign = 'center';
        ctx.fillText('🧄 Stir Fry Aromatics', dw/2, dh/2 - 30);
        break;
      }
      case 3: { // Toss in Sauce
        ctx.fillStyle = '#b8c8d8';
        ctx.beginPath(); ctx.arc(dw/2, dh/2 + 12, 44, 0, Math.PI*2); ctx.fill();
        const boil = Math.abs(Math.sin(performance.now() / 280)) * 6;
        ctx.fillStyle = 'rgba(200,140,60,0.5)';
        ctx.beginPath(); ctx.arc(dw/2, dh/2 + 12, 34 + boil, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = 'rgba(200,140,60,0.3)';
        ctx.beginPath(); ctx.arc(dw/2, dh/2 + 12, 24 + boil*0.5, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#4a60c0'; ctx.font = "700 12px 'Nunito',sans-serif";
        ctx.textAlign = 'center';
        ctx.fillText('🥫 Toss in Sauce', dw/2, dh/2 - 30);
        break;
      }
      case 4: { // Plate & Garnish
        ctx.fillStyle = '#f4f8ff';
        ctx.beginPath(); ctx.arc(dw/2, dh/2 + 14, 52, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = '#dde8f4'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(dw/2, dh/2 + 14, 38, 0, Math.PI*2); ctx.stroke();
        ctx.lineWidth = 1;
        ctx.fillStyle = '#f0b85a';
        ctx.beginPath(); ctx.ellipse(dw/2, dh/2 + 14, 22, 14, 0, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#5aaa5a';
        ctx.beginPath(); ctx.ellipse(dw/2 - 8, dh/2 + 8, 10, 5, Math.PI/5, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(dw/2 + 12, dh/2 + 16, 9, 4, -Math.PI/6, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#2a7a5a'; ctx.font = "700 12px 'Nunito',sans-serif";
        ctx.textAlign = 'center';
        ctx.fillText('🍽️ Plate & Garnish', dw/2, dh/2 - 30);
        break;
      }
      default: {
        ctx.fillStyle = '#f0f4f8';
        ctx.beginPath();
        ctx.arc(dw/2, dh/2 + 10, 40, 0, Math.PI, false);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#c0c8d0';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.lineWidth = 1;
        
        ctx.strokeStyle = '#708090';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(dw/2 - 10, dh/2 + 5);
        ctx.lineTo(dw/2 - 35, dh/2 - 25);
        ctx.stroke();
        ctx.lineWidth = 1;

        ctx.fillStyle = '#1e3a8a';
        ctx.font = "700 12px 'Nunito',sans-serif";
        ctx.textAlign = 'center';
        ctx.fillText('🍳 Cooking Step', dw/2, dh/2 - 30);
        break;
      }
    }
    
    ctx.restore();
  }
  
  const intervalId = setInterval(drawFrame, 40);
  playerMultigridIntervals[idx] = intervalId;
}

function stopAllPlayerMultigridLoops() {
  for (const key in playerMultigridIntervals) {
    clearInterval(playerMultigridIntervals[key]);
  }
  playerMultigridIntervals = {};

  for (const key in playerMultigridHlsInstances) {
    playerMultigridHlsInstances[key].destroy();
  }
  playerMultigridHlsInstances = {};
}

window.toggleBentoEditMode   = toggleBentoEditMode;
window.matchBentoSizes       = matchBentoSizes;
window.openWidgetRecipe      = openWidgetRecipe;
window.triggerRemix          = triggerRemix;
window.toggleVoiceSystem     = toggleVoiceSystem;
window.triggerUndo           = triggerUndo;
window.triggerRedo           = triggerRedo;
window.timelineClick         = timelineClick;
window.nudgeActiveBoundary   = nudgeActiveBoundary;
window.saveStepDetailsFromInputs = saveStepDetailsFromInputs;
window.runAiAnalysis         = runAiAnalysis;
window.showTip               = showTip;

// ============================================================
// VIDEO UPLOAD & RECIPE EDITOR — Cloudflare Stream
// ============================================================
let createIsPublic   = false;
let createStepsArr   = [];
let uploadedVideoUID = null;   // Cloudflare Stream video UID
let localVideoURL    = null;   // blob URL for local preview while uploading

function initCreateView() {
  if (window.lucide) lucide.createIcons();
}

// ── Drag & drop handlers ──────────────────────────────────────
window.handleDragOver = function(e) {
  e.preventDefault(); e.stopPropagation();
  const zone = document.getElementById('uploadDropZone');
  if (zone) { zone.style.borderColor='var(--primary)'; zone.style.background='#f0f8ff'; zone.style.transform='scale(1.01)'; }
};
window.handleDragLeave = function(e) {
  const zone = document.getElementById('uploadDropZone');
  if (zone) { zone.style.borderColor='rgba(74,144,217,0.3)'; zone.style.background='#fff'; zone.style.transform=''; }
};
window.handleDrop = function(e) {
  e.preventDefault(); e.stopPropagation();
  window.handleDragLeave(e);
  const file = e.dataTransfer.files[0];
  if (file) window.handleFileSelect(file);
};

// ── Main file handler ─────────────────────────────────────────
window.handleFileSelect = async function(file) {
  if (!file) return;
  
  const type = file.type || '';
  const ext = (file.name || '').split('.').pop().toLowerCase();
  const validExtensions = ['mp4', 'mov', 'webm', 'avi', 'mpeg', 'mpg', '3gp', 'ogg', 'm4v'];
  const isVideoExt = validExtensions.includes(ext);

  if (!type.startsWith('video/') && !isVideoExt) {
    showTip('Please select a video file (MP4, MOV, WebM)');
    return;
  }
  if (file.size > 500 * 1024 * 1024) { showTip('File too large — max 500MB'); return; }

  // Show local preview immediately
  localVideoURL = URL.createObjectURL(file);
  uploadedVideoUID = null;
  showEditorStage(localVideoURL);

  // Upload to Cloudflare Stream for playback
  uploadToCFStream(file);
};


async function uploadToCFStream(file) {
  const progressWrap = document.getElementById('uploadProgressWrap');
  const progressBar  = document.getElementById('uploadProgressBar');
  const progressPct  = document.getElementById('uploadProgressPct');
  const fileNameEl   = document.getElementById('uploadFileName');
  const statusMsg    = document.getElementById('uploadStatusMsg');
  const saveBtn      = document.getElementById('saveRecipeBtn');

  if (progressWrap) progressWrap.style.display = 'block';
  if (fileNameEl)   fileNameEl.textContent = file.name;
  if (saveBtn)      saveBtn.textContent = '⏳ Uploading video...';

  try {
    // Ask our server for a Cloudflare direct upload URL
    const res = await fetch('/api/cf-upload-url', { method: 'POST' });
    const { uploadURL, uid, error } = await res.json();
    if (error) throw new Error(error);

    // Upload via tus (resumable, real progress)
    await new Promise((resolve, reject) => {
      const upload = new tus.Upload(file, {
        uploadUrl: uploadURL,          // existing CF resource URL
        retryDelays: [0, 3000, 5000, 10000],
        metadata: { filename: file.name, filetype: file.type },
        onProgress(loaded, total) {
          const pct = Math.round((loaded / total) * 100);
          if (progressBar) progressBar.style.width = pct + '%';
          if (progressPct) progressPct.textContent  = pct + '%';
        },
        onSuccess() {
          uploadedVideoUID = uid;
          if (progressBar) progressBar.style.width = '100%';
          if (progressPct) progressPct.textContent  = '100%';
          if (statusMsg)  statusMsg.textContent = '✅ Uploaded! Starting AI analysis...';
          if (saveBtn)    saveBtn.textContent   = '⏳ Analyzing...';
          showTip('Upload done! AI is now analyzing your video...');
          resolve();
          // Auto-run AI analysis immediately after upload
          autoAnalyzeWithAI();
        },
        onError(err) {
          reject(err);
        },
      });
      upload.start();
    });

  } catch (err) {
    console.error('CF upload error:', err);
    if (statusMsg)  statusMsg.textContent = '❌ Upload failed: ' + (err.message || 'Unknown error');
    if (progressBar) progressBar.style.background = '#f87171';
    if (saveBtn)     saveBtn.textContent = '✅ Save Recipe (local preview only)';
    showTip('CF upload failed — video will save in preview mode.');
    // Still allow saving with localVideoURL as fallback
    uploadedVideoUID = null;
  }
}

// ── Auto AI Analysis (runs automatically after upload) ──────────────────────
// Transcribes video + places loop stops without any manual clicks needed.
async function autoAnalyzeWithAI() {
  if (!uploadedFile) return;
  const statusMsg = document.getElementById('uploadStatusMsg');
  const saveBtn   = document.getElementById('saveRecipeBtn');

  if (uploadedFile.size > 25 * 1024 * 1024) {
    if (statusMsg) statusMsg.textContent = '✅ Uploaded! (File >25MB — use 🤖 AI Tools to analyze)';
    if (saveBtn)   saveBtn.textContent   = '✅ Save Recipe';
    showTip('Video uploaded! Use the 🤖 AI Tools section to analyze it manually.');
    return;
  }

  try {
    // ── Step 1: Transcribe ──────────────────────────────────────────────
    setAIStatus('🎤 Transcribing your video...', true);
    if (statusMsg) statusMsg.textContent = '🤖 Step 1/2: Transcribing audio...';

    const formData = new FormData();
    formData.append('video', uploadedFile, uploadedFile.name);
    const tRes  = await fetch('/api/transcribe', { method: 'POST', body: formData });
    const tData = await tRes.json();
    if (tData.error) throw new Error(tData.error);

    cachedTranscript = tData.transcript;
    cachedSegments   = tData.segments || [];

    // Show transcript in AI section
    const preview = document.getElementById('transcriptPreview');
    const textEl  = document.getElementById('transcriptText');
    if (preview) preview.style.display = 'block';
    if (textEl)  textEl.textContent    = cachedTranscript;
    const tBtn = document.getElementById('transcribeBtn');
    if (tBtn) tBtn.textContent = '✅ Transcribed';
    const aiActions = document.getElementById('aiActions');
    if (aiActions) aiActions.style.display = 'block';

    // ── Step 2: Detect loop start + stop points ─────────────────────────
    setAIStatus('🔁 Detecting loop start & stop points...', true);
    if (statusMsg) statusMsg.textContent = '🤖 Step 2/2: Placing loop stops...';

    const lRes  = await fetch('/api/ai/loops', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript: cachedTranscript, segments: cachedSegments }),
    });
    const lData = await lRes.json();
    if (lData.error) throw new Error(lData.error);

    const loops = lData.loops || [];
    if (loops.length > 0) {
      createStepsArr = loops.map(l => {
        const t   = Number(l.time) || 0;
        const end = l.endTime != null ? Number(l.endTime) : null;
        const m   = Math.floor(t / 60);
        const s   = Math.floor(t % 60).toString().padStart(2, '0');
        return { time: t, endTime: end, label: l.label || 'Step', displayTime: `${m}:${s}`, description: '', ingredients: [], timer: null };
      }).sort((a, b) => a.time - b.time);

      renderCreateSteps();
      renderTimeline();

      setAIStatus(`✅ ${loops.length} loop stops placed! Review and edit below.`, true);
      if (statusMsg) statusMsg.textContent = `✅ AI placed ${loops.length} loop stops`;
      if (saveBtn)   saveBtn.textContent   = '✅ Save Recipe';
      showTip(`🤖 AI placed ${loops.length} loop stops — review the timeline!`);
    } else {
      setAIStatus('⚠️ No steps detected — add them manually below.', true);
      if (statusMsg) statusMsg.textContent = '✅ Uploaded (no steps detected — add manually)';
      if (saveBtn)   saveBtn.textContent   = '✅ Save Recipe';
    }

  } catch (err) {
    console.error('[AutoAI]', err);
    setAIStatus('⚠️ Auto-analysis failed — use 🤖 AI Tools to retry.', true);
    if (statusMsg) statusMsg.textContent = '✅ Uploaded (AI failed — retry in AI Tools)';
    if (saveBtn)   saveBtn.textContent   = '✅ Save Recipe';
  }
}

function showEditorStage(videoUrl) {
  document.getElementById('createStage1').style.display = 'none';
  document.getElementById('createStage2').style.display = 'flex';
  document.body.classList.add('mobile-editing-active');

  const videoEl = document.getElementById('uploadedVideoPlayer');
  if (!videoEl) return;

  // Reset old poster
  videoEl.removeAttribute('poster');

  // Use HLS.js for Cloudflare Stream HLS, blob URL plays natively
  if (videoUrl.includes('videodelivery.net') && window.Hls && Hls.isSupported()) {
    const hls = new Hls();
    hls.loadSource(videoUrl);
    hls.attachMedia(videoEl);
  } else {
    videoEl.src = videoUrl;
  }

  // Initialize muted state based on preference
  const isMutedPref = localStorage.getItem('cooking_gps_editor_muted') !== 'false';
  videoEl.muted = isMutedPref;
  if (typeof window.updateEditorMuteUI === 'function') {
    window.updateEditorMuteUI();
  }

  videoEl.load();

  videoEl.addEventListener('timeupdate', () => {
    const t = videoEl.currentTime;
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60).toString().padStart(2, '0');
    const el = document.getElementById('createCurrentTime');
    if (el) el.textContent = `${m}:${s}`;
    // Update subtitles overlay
    window.updateSubtitles(videoEl, 'editorSubtitleOverlay', cachedSegments);
  });

  createStepsArr = [];
  renderCreateSteps();
  if (window.lucide) lucide.createIcons();
  if (typeof window.setupResponsiveDrawers === 'function') {
    window.setupResponsiveDrawers();
  }
  if (typeof window.adjustWorkbenchVideoSize === 'function') {
    window.adjustWorkbenchVideoSize();
  }
}

// Step colors — one per step, Wii-style pastels
const STEP_COLORS = ['#a8d8f0','#b8f0c8','#f0d8a8','#d8b8f0','#f0b8c8','#a8f0e8','#f0ebb8','#c8b8f0'];

// Mute/Unmute Editor Controls
window.toggleEditorMute = function() {
  const videoEl = document.getElementById('uploadedVideoPlayer');
  if (!videoEl) return;
  videoEl.muted = !videoEl.muted;
  localStorage.setItem('cooking_gps_editor_muted', videoEl.muted);
  window.updateEditorMuteUI();
};

window.updateEditorMuteUI = function() {
  const videoEl = document.getElementById('uploadedVideoPlayer');
  if (!videoEl) return;
  const muteBtn = document.getElementById('editorMuteBtn');
  if (!muteBtn) return;

  if (videoEl.muted) {
    updateLucideIcon('editorMuteIcon', 'volume-x', '14px', '14px');
    muteBtn.title = 'Unmute';
    muteBtn.style.color = '#ef4444';
    muteBtn.style.background = 'rgba(239, 68, 68, 0.2)';
  } else {
    updateLucideIcon('editorMuteIcon', 'volume-2', '14px', '14px');
    muteBtn.title = 'Mute';
    muteBtn.style.color = '#ffffff';
    muteBtn.style.background = 'rgba(255, 255, 255, 0.2)';
  }
};

// Editor Playback Speed Controls
let editorPlaybackSpeedIndex = 1; // Default to 1.0
const EDITOR_SPEEDS = [0.5, 1.0, 1.25, 1.5, 2.0];

window.cycleEditorSpeed = function() {
  const videoEl = document.getElementById('uploadedVideoPlayer');
  if (!videoEl) return;

  editorPlaybackSpeedIndex = (editorPlaybackSpeedIndex + 1) % EDITOR_SPEEDS.length;
  const speed = EDITOR_SPEEDS[editorPlaybackSpeedIndex];
  videoEl.playbackRate = speed;

  const label = document.getElementById('editorSpeedLabel');
  if (label) {
    label.textContent = (speed === 1 || speed === 2) ? `${speed}.0x` : `${speed}x`;
  }
};

let videoDuration   = 0;
let previewInterval = null;
let dragSrcIndex    = null;

window.onVideoLoaded = function() {
  const videoEl = document.getElementById('uploadedVideoPlayer');
  if (videoEl) {
    if (typeof window.adjustWorkbenchVideoSize === 'function') {
      window.adjustWorkbenchVideoSize();
    }
    const isMutedPref = localStorage.getItem('cooking_gps_editor_muted') !== 'false';
    videoEl.muted = isMutedPref;
    if (typeof window.updateEditorMuteUI === 'function') {
      window.updateEditorMuteUI();
    }
    // Re-apply playback speed
    const speed = EDITOR_SPEEDS[editorPlaybackSpeedIndex];
    videoEl.playbackRate = speed;
    const speedLabel = document.getElementById('editorSpeedLabel');
    if (speedLabel) {
      speedLabel.textContent = (speed === 1 || speed === 2) ? `${speed}.0x` : `${speed}x`;
    }
    videoDuration = videoEl.duration || 0;
    const m = Math.floor(videoDuration / 60);
    const s = Math.floor(videoDuration % 60).toString().padStart(2, '0');
    const dur = document.getElementById('timelineDuration');
    const cdl = document.getElementById('chapterDurationLabel');
    const timeStr = `${m}:${s}`;
    if (dur) dur.textContent = timeStr;
    if (cdl) cdl.textContent = timeStr;

    // Auto-capture a local preview when metadata or data is loaded
    const onFirstData = () => {
      videoEl.currentTime = 0.5;
    };
    videoEl.addEventListener('loadeddata', onFirstData, { once: true });
    
    videoEl.addEventListener('seeked', function onFirstSeek() {
      window.captureLocalVideoPreview();
      videoEl.removeEventListener('seeked', onFirstSeek);
    });

    if (videoEl.readyState >= 2) {
      onFirstData();
    }

    // Update playhead and current time as video plays
    videoEl.addEventListener('timeupdate', () => {
      const t  = videoEl.currentTime;
      const cm = Math.floor(t / 60);
      const cs = Math.floor(t % 60).toString().padStart(2, '0');
      const el = document.getElementById('createCurrentTime');
      if (el) el.textContent = `${cm}:${cs}`;
      // Drive custom scrubber fill + thumb
      updateVideoScrubber(videoEl);
      // Update subtitles overlay
      window.updateSubtitles(videoEl, 'editorSubtitleOverlay', cachedSegments);
    });

    // Sync play/pause button icon
    videoEl.addEventListener('play',  () => { 
      const b = document.getElementById('videoPlayBtn'); if (b) b.textContent = '⏸'; 
      const tb = document.getElementById('toolbarPlayBtn'); if (tb) tb.textContent = '⏸';
      const tbm = document.getElementById('toolbarPlayBtnMobile'); if (tbm) tbm.textContent = '⏸';
    });
    videoEl.addEventListener('pause', () => { 
      const b = document.getElementById('videoPlayBtn'); if (b) b.textContent = '▶'; 
      const tb = document.getElementById('toolbarPlayBtn'); if (tb) tb.textContent = '▶';
      const tbm = document.getElementById('toolbarPlayBtnMobile'); if (tbm) tbm.textContent = '▶';
    });
  }
  // Re-render timeline if steps already exist (e.g. after AI analysis)
  if (createStepsArr.length) {
    renderTimeline();
    renderCreateSteps();
  }
  showTip('Video ready! Play it and tap "📍 Add Step" to mark steps.');
};

window.addStepAtCurrentTime = function() {
  const videoEl = document.getElementById('uploadedVideoPlayer');
  if (!videoEl) return;
  const time = videoEl.currentTime;
  const m = Math.floor(time / 60);
  const s = Math.floor(time % 60).toString().padStart(2, '0');
  // Default endTime = start + 15s (or video end if near end)
  const defaultEnd = Math.min(time + 15, videoDuration || time + 15);

  // Split empty list into two sections: 0:00 to time (Step 1) and time to end (Step 2)
  if (createStepsArr.length === 0 && time > 0.05) {
    createStepsArr.push({
      time: 0,
      endTime: time,
      label: `Step 1`,
      displayTime: `0:00`
    });
  }

  createStepsArr.push({
    time,
    endTime: defaultEnd,
    label: `Step ${createStepsArr.length + 1}`,
    displayTime: `${m}:${s}`
  });
  createStepsArr.sort((a, b) => a.time - b.time);
  renderCreateSteps();
  renderTimeline();
  showTip(`Step marked at ${m}:${s} — play to the loop end then tap ✂️ Set End`);
};

// Set the loop end point for a step to the current video time
window.setStepEnd = function(i) {
  const videoEl = document.getElementById('uploadedVideoPlayer');
  if (!videoEl || !createStepsArr[i]) return;
  const endTime = videoEl.currentTime;
  if (endTime <= createStepsArr[i].time) {
    showTip('End time must be after the step start time!');
    return;
  }
  createStepsArr[i].endTime = endTime;
  renderCreateSteps();
  renderTimeline();
  const em = Math.floor(endTime / 60);
  const es = Math.floor(endTime % 60).toString().padStart(2, '0');
  showTip(`Loop end set to ${em}:${es}`);
};

// ── Timeline renderer ──────────────────────────────────────────────────────
window.toggleVideoPlay = function() {
  const vid = document.getElementById('uploadedVideoPlayer');
  const btn = document.getElementById('videoPlayBtn');
  const tbPlayBtn = document.getElementById('toolbarPlayBtn');
  const tbPlayBtnMobile = document.getElementById('toolbarPlayBtnMobile');
  if (!vid) return;
  if (vid.paused) {
    const playPromise = vid.play();
    if (playPromise !== undefined) {
      playPromise.catch(err => {
        console.warn("Unmuted editor video playback blocked by browser, falling back to muted:", err);
        vid.muted = true;
        if (typeof window.updateEditorMuteUI === 'function') {
          window.updateEditorMuteUI();
        }
        vid.play().catch(e => console.error("Muted editor video playback also blocked:", e));
      });
    }
    if (btn) btn.textContent = '⏸';
    if (tbPlayBtn) tbPlayBtn.textContent = '⏸';
    if (tbPlayBtnMobile) tbPlayBtnMobile.textContent = '⏸';
  } else {
    vid.pause();
    if (btn) btn.textContent = '▶';
    if (tbPlayBtn) tbPlayBtn.textContent = '▶';
    if (tbPlayBtnMobile) tbPlayBtnMobile.textContent = '▶';
  }
};

window.videoScrubberSeek = function(e) {
  const scrubber = document.getElementById('videoScrubber');
  const vid = document.getElementById('uploadedVideoPlayer');
  if (!scrubber || !vid || videoDuration <= 0) return;
  // Ignore clicks that came from a drag handle
  if (e.target !== scrubber && e.target.dataset.isHandle) return;
  const rect = scrubber.getBoundingClientRect();
  const pct  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  vid.currentTime = pct * videoDuration;
};

window.videoScrubberHover = function(e) {
  if (!createStepsArr.length || videoDuration <= 0) return;
  const scrubber = document.getElementById('videoScrubber');
  const label    = document.getElementById('videoChapterLabel');
  if (!scrubber || !label) return;
  const rect   = scrubber.getBoundingClientRect();
  const pct    = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  const hoverT = pct * videoDuration;
  // Find which step this hover time belongs to
  let found = null;
  for (let i = createStepsArr.length - 1; i >= 0; i--) {
    if (hoverT >= createStepsArr[i].time) { found = createStepsArr[i]; break; }
  }
  if (found) {
    label.textContent  = found.label;
    label.style.display = 'block';
    label.style.left   = `${pct * 100}%`;
  } else {
    label.style.display = 'none';
  }
};

// Update scrubber fill + thumb + time on timeupdate
function updateVideoScrubber(vid) {
  if (!vid || videoDuration <= 0) return;
  const pct = (vid.currentTime / videoDuration) * 100;
  const fill  = document.getElementById('videoProgressFill');
  const thumb = document.getElementById('videoThumb');
  if (fill)  fill.style.width = `${pct}%`;
  if (thumb) thumb.style.left = `${pct}%`;
}

window.ensureContinuousSteps = function() {
  if (!createStepsArr || createStepsArr.length === 0) return;
  
  // Sort steps chronologically
  createStepsArr.sort((a, b) => a.time - b.time);
  
  // Force the first step to start at 0:00 to eliminate any initial dead zone
  if (createStepsArr[0]) {
    createStepsArr[0].time = 0;
  }
  
  createStepsArr.forEach((step, idx) => {
    // Renumber default labels ("Step X") chronologically
    let labelStr = '';
    if (step.label) {
      if (typeof step.label === 'object') {
        labelStr = String(step.label.title || step.label.label || '').trim();
      } else {
        labelStr = String(step.label).trim();
      }
    }
    
    if (!labelStr || /^Step\s+\d+$/i.test(labelStr)) {
      step.label = `Step ${idx + 1}`;
    } else {
      step.label = labelStr;
    }

    const next = createStepsArr[idx + 1];
    if (next) {
      step.endTime = next.time;
    } else {
      step.endTime = videoDuration || (step.time + 15);
    }
    
    // Format displayTime based on step.time
    const m = Math.floor(step.time / 60);
    const s = Math.floor(step.time % 60).toString().padStart(2, '0');
    step.displayTime = `${m}:${s}`;
  });
};

// ── Timeline renderer — markers on the video scrubber ──────────────────────
function renderTimeline() {
  if (typeof window.ensureContinuousSteps === 'function') {
    window.ensureContinuousSteps();
  }
  const scrubber = document.getElementById('videoScrubber');
  const markers  = document.getElementById('videoMarkers');
  if (!scrubber || !markers || videoDuration <= 0) return;

  // Remove old markers & handles (keep fill + thumb + label)
  markers.innerHTML = '';
  // Remove old drag handles added directly to scrubber
  scrubber.querySelectorAll('[data-is-handle]').forEach(el => el.remove());

  createStepsArr.forEach((step, i) => {
    const startPct = (step.time / videoDuration) * 100;
    const nextTime = step.endTime ?? (createStepsArr[i + 1]?.time ?? videoDuration);
    const widthPct = Math.max(((nextTime - step.time) / videoDuration) * 100, 0.5);

    // Full-height transparent click band for seeking
    const band = document.createElement('div');
    band.style.cssText = `position:absolute;top:0;left:${startPct}%;width:${widthPct}%;height:100%;background:transparent;box-sizing:border-box;cursor:pointer;overflow:hidden;`;
    band.addEventListener('click', (e) => { videoScrubberSeek(e); });
    markers.appendChild(band);

    // Draggable handle — vertical capsule matching player ticks
    const handle = document.createElement('div');
    handle.dataset.isHandle = '1';
    handle.title = `Drag to move: ${step.label} (${step.displayTime})`;
    handle.style.cssText = `
      position:absolute; top:50%; left:${startPct}%;
      width:16px; height:24px; transform:translate(-50%, -50%);
      cursor:ew-resize; z-index:30;
      display:flex; align-items:center; justify-content:center;
      pointer-events:auto;
    `;
    handle.innerHTML = `<div style="width:5px;height:14px;border-radius:99px;background:#fff;border:1.5px solid #475569;box-shadow:0 1px 3px rgba(0,0,0,0.3);pointer-events:none;flex-shrink:0;transition:all 0.15s ease;"></div>`;

    handle.addEventListener('mouseenter', () => {
      const inner = handle.firstChild;
      if (inner) {
        inner.style.background = '#22c55e';
        inner.style.borderColor = '#16a34a';
        inner.style.height = '18px';
        inner.style.width = '7px';
        inner.style.boxShadow = '0 2px 8px rgba(34, 197, 94, 0.6)';
      }
    });
    handle.addEventListener('mouseleave', () => {
      const inner = handle.firstChild;
      if (inner) {
        inner.style.background = '#fff';
        inner.style.borderColor = '#475569';
        inner.style.height = '14px';
        inner.style.width = '5px';
        inner.style.boxShadow = '0 1px 3px rgba(0,0,0,0.3)';
      }
    });

    handle.addEventListener('mousedown', (e) => {
      e.stopPropagation(); e.preventDefault();
      const rect = scrubber.getBoundingClientRect();
      function onMove(ev) {
        const pct     = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
        const newTime = Math.round(pct * videoDuration * 10) / 10;
        createStepsArr[i].time = newTime;
        const m = Math.floor(newTime / 60).toString().padStart(2, '0');
        const s = Math.floor(newTime % 60).toString().padStart(2, '0');
        createStepsArr[i].displayTime = `${m}:${s}`;
        renderTimeline();
      }
      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        createStepsArr.sort((a, b) => a.time - b.time);
        renderTimeline(); renderCreateSteps();
        const vid = document.getElementById('uploadedVideoPlayer');
        if (vid) vid.currentTime = createStepsArr[i]?.time ?? 0;
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    // Touch support
    handle.addEventListener('touchstart', (e) => {
      e.stopPropagation(); e.preventDefault();
      const rect = scrubber.getBoundingClientRect();
      function onTouch(ev) {
        const t   = ev.touches[0];
        const pct = Math.max(0, Math.min(1, (t.clientX - rect.left) / rect.width));
        const newTime = Math.round(pct * videoDuration * 10) / 10;
        createStepsArr[i].time = newTime;
        const m = Math.floor(newTime / 60).toString().padStart(2, '0');
        const s = Math.floor(newTime % 60).toString().padStart(2, '0');
        createStepsArr[i].displayTime = `${m}:${s}`;
        renderTimeline();
      }
      function onTouchEnd() {
        handle.removeEventListener('touchmove', onTouch);
        handle.removeEventListener('touchend', onTouchEnd);
        createStepsArr.sort((a, b) => a.time - b.time);
        renderTimeline(); renderCreateSteps();
        const vid = document.getElementById('uploadedVideoPlayer');
        if (vid) vid.currentTime = createStepsArr[i]?.time ?? 0;
      }
      handle.addEventListener('touchmove', onTouch, { passive: false });
      handle.addEventListener('touchend', onTouchEnd);
    }, { passive: false });

    scrubber.appendChild(handle);
  });
}



// Click on timeline to seek
window.timelineSeek = function(e) {
  const videoEl  = document.getElementById('uploadedVideoPlayer');
  const timeline = document.getElementById('createTimeline');
  if (!videoEl || !timeline || videoDuration <= 0) return;
  const rect = timeline.getBoundingClientRect();
  const pct  = (e.clientX - rect.left) / rect.width;
  videoEl.currentTime = pct * videoDuration;
};

// ── Step list renderer ─────────────────────────────────────────────────────
// ── Step Navigator ─────────────────────────────────────────────────────────
let currentNavStepIndex = 0;
let keyboardMode = 'steps'; // 'steps' | 'scrub'

// ── Keyboard mode toggle ───────────────────────────────────────────────────
window.setKeyboardMode = function(mode) {
  keyboardMode = mode;
  const btnSteps = document.getElementById('kbModeSteps');
  const btnScrub = document.getElementById('kbModeScrub');
  const hint     = document.getElementById('kbModeHint');
  
  const pBtnSteps = document.getElementById('playerKbModeSteps');
  const pBtnScrub = document.getElementById('playerKbModeScrub');
  const pHint     = document.getElementById('playerKbModeHint');

  const kbToggleIcon = document.getElementById('playerKbToggleIcon');
  const kbToggleBtn  = document.getElementById('playerKbToggleBtn');

  const cKbToggleIcon = document.getElementById('createKbToggleIcon');
  const cKbToggleBtn  = document.getElementById('createKbToggleBtn');
  const navPrev = document.getElementById('navPrevBtn');
  const navNext = document.getElementById('navNextBtn');

  const isMobilePage = window.innerWidth <= 768 || !!document.getElementById('mobileEditorCarousel');
  const seekSelect = document.getElementById('seekStepSelect');
  const seekAmount = isMobilePage ? 1 : (seekSelect ? parseInt(seekSelect.value) || 1 : 1);

  if (mode === 'steps') {
    if (btnSteps) { btnSteps.style.background = 'var(--primary)'; btnSteps.style.color = '#fff'; }
    if (btnScrub) { btnScrub.style.background = 'transparent';    btnScrub.style.color = 'var(--text-muted)'; }
    if (hint)  hint.textContent = 'Jump between loop stops';
    
    if (pBtnSteps) { pBtnSteps.style.background = 'var(--primary)'; pBtnSteps.style.color = '#fff'; }
    if (pBtnScrub) { pBtnScrub.style.background = 'transparent';    pBtnScrub.style.color = 'var(--text-muted)'; }
    if (pHint)  pHint.textContent = 'Pressing Left / Right arrow keys will jump between recipe steps.';

    if (kbToggleBtn) {
      kbToggleBtn.style.background = 'rgba(255,255,255,0.95)';
      kbToggleBtn.style.color = 'var(--text-body)';
      kbToggleBtn.style.borderColor = 'var(--border-card)';
      kbToggleBtn.style.boxShadow = 'var(--shadow-xs)';
      updateLucideIcon('playerKbToggleIcon', 'chevrons-right', '15px', '15px');
    }

    if (cKbToggleBtn) {
      cKbToggleBtn.style.background = 'rgba(255,255,255,0.95)';
      cKbToggleBtn.style.color = 'var(--text-body)';
      cKbToggleBtn.style.borderColor = 'var(--border-card)';
      updateLucideIcon('createKbToggleIcon', 'chevrons-right', '13px', '13px');
      const span = cKbToggleBtn.querySelector('span');
      if (span) span.textContent = 'Skip: Steps';
    }

    // Update Combined Prev button to Previous Step style
    const cPrevBtn = document.getElementById('playerCombinedPrevBtn');
    if (cPrevBtn) {
      cPrevBtn.title = 'Previous Step';
      updateLucideIcon('playerCombinedPrevIcon', 'skip-back', '15px', '15px');
      const label = document.getElementById('playerCombinedPrevLabel');
      if (label) label.style.display = 'none';
    }
    // Update Combined Next button to Next Step style
    const cNextBtn = document.getElementById('playerCombinedNextBtn');
    if (cNextBtn) {
      cNextBtn.title = 'Next Step';
      updateLucideIcon('playerCombinedNextIcon', 'skip-forward', '15px', '15px');
      const label = document.getElementById('playerCombinedNextLabel');
      if (label) label.style.display = 'none';
    }

    if (navPrev) {
      navPrev.textContent = '←';
      navPrev.title = 'Previous step (← key)';
    }
    if (navNext) {
      navNext.textContent = '→';
      navNext.title = 'Next step (→ key)';
    }
  } else {
    if (btnScrub) { btnScrub.style.background = 'var(--primary)'; btnScrub.style.color = '#fff'; }
    if (btnSteps) { btnSteps.style.background = 'transparent';    btnSteps.style.color = 'var(--text-muted)'; }
    if (hint)  hint.textContent = 'Seek video';
    
    if (pBtnScrub) { pBtnScrub.style.background = 'var(--primary)'; pBtnScrub.style.color = '#fff'; }
    if (pBtnSteps) { pBtnSteps.style.background = 'transparent';    pBtnSteps.style.color = 'var(--text-muted)'; }
    
    if (pHint)  pHint.textContent = `Pressing Left / Right arrow keys will seek forward or backward by ${seekAmount} second${seekAmount === 1 ? '' : 's'}.`;

    if (kbToggleBtn) {
      kbToggleBtn.style.background = 'var(--primary-soft)';
      kbToggleBtn.style.color = 'var(--primary-dark)';
      kbToggleBtn.style.borderColor = 'var(--primary)';
      kbToggleBtn.style.boxShadow = 'none';
      updateLucideIcon('playerKbToggleIcon', 'timer', '15px', '15px');
    }

    if (cKbToggleBtn) {
      cKbToggleBtn.style.background = 'var(--primary-soft)';
      cKbToggleBtn.style.color = 'var(--primary-dark)';
      cKbToggleBtn.style.borderColor = 'var(--primary)';
      updateLucideIcon('createKbToggleIcon', 'timer', '13px', '13px');
      const span = cKbToggleBtn.querySelector('span');
      if (span) span.textContent = `Skip: ${seekAmount}s`;
    }

    // Update Combined Prev button to Rewind 1s style
    const cPrevBtn = document.getElementById('playerCombinedPrevBtn');
    if (cPrevBtn) {
      cPrevBtn.title = 'Rewind 1s';
      updateLucideIcon('playerCombinedPrevIcon', 'rewind', '15px', '15px');
      const label = document.getElementById('playerCombinedPrevLabel');
      if (label) label.style.display = 'inline-block';
    }
    // Update Combined Next button to Forward 1s style
    const cNextBtn = document.getElementById('playerCombinedNextBtn');
    if (cNextBtn) {
      cNextBtn.title = 'Forward 1s';
      updateLucideIcon('playerCombinedNextIcon', 'fast-forward', '15px', '15px');
      const label = document.getElementById('playerCombinedNextLabel');
      if (label) label.style.display = 'inline-block';
    }

    if (navPrev) {
      navPrev.textContent = `-${seekAmount}s`;
      navPrev.title = `Rewind ${seekAmount}s (← key)`;
    }
    if (navNext) {
      navNext.textContent = `+${seekAmount}s`;
      navNext.title = `Forward ${seekAmount}s (→ key)`;
    }
  }
  if (window.lucide) lucide.createIcons();
};

window.setPlayerKeyboardMode = function(mode) {
  window.setKeyboardMode(mode);
  const isMobilePage = window.innerWidth <= 768 || !!document.getElementById('mobileEditorCarousel');
  const seekSelect = document.getElementById('seekStepSelect');
  const seekAmount = isMobilePage ? 1 : (seekSelect ? parseInt(seekSelect.value) || 1 : 1);
  showTip(`Arrow keys behavior: ${mode === 'steps' ? 'Jump Steps' : 'Seek ' + seekAmount + 's'} ⌨️`);
};

window.playerPrevAction = function() {
  if (keyboardMode === 'steps') {
    window.desktopPlayerPrev();
  } else {
    window.playerSkipTime(-1);
  }
};

window.playerNextAction = function() {
  if (keyboardMode === 'steps') {
    window.desktopPlayerNext();
  } else {
    window.playerSkipTime(1);
  }
};

window.cyclePlaybackMode = function() {
  const modes = ['loop', 'wait', 'continuous'];
  const nextIdx = (modes.indexOf(playbackMode) + 1) % modes.length;
  setPlaybackMode(modes[nextIdx]);
  showTip(`Playback Mode: ${modes[nextIdx].toUpperCase()} 🔁`);
};

window.togglePlayerKeyboardMode = function() {
  const newMode = (keyboardMode === 'steps') ? 'scrub' : 'steps';
  window.setKeyboardMode(newMode);
  const isMobilePage = window.innerWidth <= 768 || !!document.getElementById('mobileEditorCarousel');
  const seekSelect = document.getElementById('seekStepSelect');
  const seekAmount = isMobilePage ? 1 : (seekSelect ? parseInt(seekSelect.value) || 1 : 1);
  showTip(`Arrow keys behavior: ${newMode === 'steps' ? 'Jump Steps' : 'Seek ' + seekAmount + 's'} ⌨️`);
};

window.toggleCreateKeyboardMode = function() {
  window.togglePlayerKeyboardMode();
};

window.navOrScrub = function(dir) {
  if (keyboardMode === 'steps') {
    window.navStep(dir);
  } else {
    const vid = document.getElementById('uploadedVideoPlayer');
    if (vid) {
      const isMobilePage = window.innerWidth <= 768 || !!document.getElementById('mobileEditorCarousel');
      const seekSelect = document.getElementById('seekStepSelect');
      const seekAmount = isMobilePage ? 1 : (seekSelect ? parseInt(seekSelect.value) || 1 : 1);
      const amount = dir > 0 ? seekAmount : -seekAmount;
      vid.currentTime = Math.max(0, Math.min(vid.duration || Infinity, vid.currentTime + amount));
    }
  }
};

// Flash the on-screen arrow button briefly when keyboard triggers it
function flashNavBtn(dir) {
  // Visual highlight disabled to prevent interrupting edit/hover states
}

// Flash the mobile player control button briefly when keyboard triggers it
function flashPlayerBtn(btnId) {
  // Visual highlight disabled to prevent interrupting edit/hover states
}

// Global button focus management: blur buttons after clicking so keyboard shortcuts aren't hijacked by browser focus
document.addEventListener('click', function(e) {
  const activeEl = document.activeElement;
  if (activeEl && (activeEl.tagName === 'BUTTON' || activeEl.tagName === 'A' || activeEl.classList.contains('control-btn'))) {
    activeEl.blur();
  }
});

// ── Global arrow-key handler (active on Create page & Player page) ──────────────
document.addEventListener('keydown', function(e) {
  // Ignore if user is typing in an input, textarea, or contenteditable
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;
  
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    // Force mouse cursor to remain visible/reappear on macOS by toggling cursor style
    const oldCursor = document.body.style.cursor;
    document.body.style.cursor = 'none';
    document.body.offsetHeight; // trigger reflow
    setTimeout(() => {
      document.body.style.cursor = oldCursor || '';
    }, 10);
  }
  
  // Blur focused buttons to prevent browser focus rings or highlight rings from hijacking navigation
  const activeEl = document.activeElement;
  if (activeEl && (activeEl.tagName === 'BUTTON' || activeEl.tagName === 'A' || activeEl.classList.contains('control-btn'))) {
    activeEl.blur();
  }
  
  const stage2 = document.getElementById('createStage2');
  const isCreateActive = stage2 && stage2.style.display !== 'none' && stage2.style.display !== '';
  const isPlayerActive = (typeof currentView !== 'undefined' && currentView === 'mobile-player');

  if (!isCreateActive && !isPlayerActive) return;

  if (e.key === 'ArrowLeft') {
    e.preventDefault();
    if (isCreateActive) {
      flashNavBtn(-1);
      window.navOrScrub(-1);
    } else if (isPlayerActive) {
      const vid = document.getElementById('mobileRealVideo');
      const hasRealVideo = vid && vid.style.display !== 'none';
      const isSeeking = (keyboardMode === 'scrub') ? !e.shiftKey : e.shiftKey;
      
      if (isSeeking) {
        const isMobilePage = window.innerWidth <= 768 || !!document.getElementById('mobileEditorCarousel');
        const seekSelect = document.getElementById('seekStepSelect');
        const seekAmount = isMobilePage ? 1 : (seekSelect ? parseInt(seekSelect.value) || 1 : 1);
        const newTime = Math.max(0, currentTime - seekAmount);
        if (hasRealVideo) {
          vid.currentTime = newTime;
        }
        currentTime = newTime;
        updateStepFromTime(currentTime);
        updateTimelineUI();
        flashPlayerBtn('playerSkipBack1sBtn');
      } else {
        window.desktopPlayerPrev();
        flashPlayerBtn('playerPrevStepBtn');
      }
    }
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    if (isCreateActive) {
      flashNavBtn(1);
      window.navOrScrub(1);
    } else if (isPlayerActive) {
      const vid = document.getElementById('mobileRealVideo');
      const hasRealVideo = vid && vid.style.display !== 'none';
      const isSeeking = (keyboardMode === 'scrub') ? !e.shiftKey : e.shiftKey;
      
      if (isSeeking) {
        const isMobilePage = window.innerWidth <= 768 || !!document.getElementById('mobileEditorCarousel');
        const seekSelect = document.getElementById('seekStepSelect');
        const seekAmount = isMobilePage ? 1 : (seekSelect ? parseInt(seekSelect.value) || 1 : 1);
        const newTime = Math.min(recipeData.duration, currentTime + seekAmount);
        if (hasRealVideo) {
          vid.currentTime = newTime;
        }
        currentTime = newTime;
        updateStepFromTime(currentTime);
        updateTimelineUI();
        flashPlayerBtn('playerSkipFwd1sBtn');
      } else {
        window.desktopPlayerNext();
        flashPlayerBtn('playerNextStepBtn');
      }
    }
  } else if (e.key === ' ') {
    e.preventDefault();
    if (isCreateActive) {
      window.toggleVideoPlay?.();
    } else if (isPlayerActive) {
      window.toggleVideoPlayback();
    }
  }
});


function refreshStepNavigator() {
  const label = document.getElementById('stepNavLabel');
  const count = document.getElementById('stepNavCount');
  if (!createStepsArr.length) {
    if (label) label.textContent = 'No loop stops yet';
    if (count) count.textContent = 'Tap 🪄 AI: Create Steps from Analyzing Video or add manually';
    return;
  }
  const i    = Math.max(0, Math.min(currentNavStepIndex, createStepsArr.length - 1));
  currentNavStepIndex = i;
  const step = createStepsArr[i];
  if (label) label.textContent = step.label || `Step ${i + 1}`;
  if (count) count.textContent  = `${i + 1} of ${createStepsArr.length}  ·  ${step.displayTime || '0:00'}`;
}

window.navStep = function(dir) {
  const vid = document.getElementById('uploadedVideoPlayer');
  if (!createStepsArr.length) {
    if (dir < 0 && vid) {
      vid.currentTime = 0;
      stopPreviewLoop();
      showTip("Beginning of video reached.");
    }
    return;
  }

  if (vid) {
    const time = vid.currentTime;
    let found = 0;
    for (let i = 0; i < createStepsArr.length; i++) {
      if (time >= createStepsArr[i].time) {
        found = i;
      } else {
        break;
      }
    }
    currentNavStepIndex = found;
  }

  if (dir < 0) {
    if (vid) {
      const time = vid.currentTime;
      const currentStepStart = createStepsArr[currentNavStepIndex].time || 0;

      // If we are before the first step start, go to 0 and stop preview loop
      if (time < currentStepStart) {
        vid.currentTime = 0;
        stopPreviewLoop();
        showTip("Beginning of video reached.");
        return;
      }

      // If we are more than 1.0 seconds past the current step start, go to current step start
      if (time > currentStepStart + 1.0) {
        vid.currentTime = currentStepStart;
        if (previewInterval !== null) {
          previewStepLoop(currentNavStepIndex);
        }
        return;
      }

      // Otherwise, go to previous step start
      if (currentNavStepIndex > 0) {
        currentNavStepIndex--;
        refreshStepNavigator();
        if (previewInterval !== null) {
          previewStepLoop(currentNavStepIndex);
        } else {
          vid.currentTime = createStepsArr[currentNavStepIndex].time ?? 0;
        }
      } else {
        // At or near first step start, go to 0 and stop preview loop
        vid.currentTime = 0;
        stopPreviewLoop();
        showTip("Beginning of video reached.");
      }
    }
  } else {
    let targetIndex = 0;
    if (createStepsArr.length > 0) {
      const time = vid ? vid.currentTime : 0;
      const firstStepStart = createStepsArr[0].time || 0;
      if (time < firstStepStart) {
        targetIndex = 0;
      } else {
        // Find which step we are currently in
        let found = 0;
        for (let i = 0; i < createStepsArr.length; i++) {
          if (time >= createStepsArr[i].time) {
            found = i;
          } else {
            break;
          }
        }
        targetIndex = found + 1;
      }
    }

    if (targetIndex < createStepsArr.length) {
      currentNavStepIndex = targetIndex;
      refreshStepNavigator();
      if (previewInterval !== null) {
        previewStepLoop(currentNavStepIndex);
      } else {
        if (vid) vid.currentTime = createStepsArr[currentNavStepIndex].time ?? 0;
      }
    } else {
      showTip("Last step reached.");
    }
  }
};

window.previewCurrentNavStep = function() {
  if (!createStepsArr.length) return;
  previewStepLoop(currentNavStepIndex);
};

window.toggleAiToolsCollapse = function() {
  const el = document.getElementById('aiToolsCollapse');
  const chev = document.getElementById('aiToolsChevron');
  if (!el) return;
  const isHidden = el.style.display === 'none';
  if (isHidden) {
    el.style.display = 'flex';
    if (chev) chev.textContent = '▴';
  } else {
    el.style.display = 'none';
    if (chev) chev.textContent = '▾';
  }
};

window.collapseAiTools = function() {
  const el = document.getElementById('aiToolsCollapse');
  const chev = document.getElementById('aiToolsChevron');
  if (el) {
    el.style.display = 'none';
    if (chev) chev.textContent = '▾';
  }
};

window.toggleStepNavControls = function() {
  const el = document.getElementById('stepNavControlsContent');
  const chev = document.getElementById('stepNavControlsChevron');
  const btn = document.getElementById('toggleStepNavControlsBtn');
  if (!el) return;
  const isHidden = el.style.display === 'none';
  if (isHidden) {
    el.style.display = 'flex';
    if (btn) {
      const span = btn.querySelector('span');
      if (span) span.textContent = 'Hide Panel';
    }
    if (chev) chev.textContent = '▲';
  } else {
    el.style.display = 'none';
    if (btn) {
      const span = btn.querySelector('span');
      if (span) span.textContent = 'Show Panel';
    }
    if (chev) chev.textContent = '▼';
  }
};

window.selectCreateStep = function(i) {
  currentNavStepIndex = i;
  const vid = document.getElementById('uploadedVideoPlayer');
  if (vid && createStepsArr[i]) {
    window.previewStepLoop(i);
  } else {
    renderCreateSteps();
  }
};

window.showStepTranscripts = false;
window.toggleStepTranscripts = function() {
  window.showStepTranscripts = !window.showStepTranscripts;
  const btn = document.getElementById('toggleStepTranscriptBtn');
  if (btn) {
    if (window.showStepTranscripts) {
      btn.style.background = '#7c3aed';
      btn.style.color = '#fff';
      btn.style.borderColor = 'transparent';
      btn.textContent = '💬 Hide Transcripts';
    } else {
      btn.style.background = '#f5f0ff';
      btn.style.color = '#7c3aed';
      btn.style.borderColor = 'rgba(124,58,237,0.3)';
      btn.textContent = '💬 View Transcripts';
    }
  }
  renderCreateSteps();
};

window.scrollStepsList = function(amount) {
  const el = document.getElementById('createStepsList');
  if (el) {
    el.scrollBy({ left: amount, behavior: 'smooth' });
    setTimeout(window.updateStepsScrollButtons, 300);
  }
};

window.updateStepsScrollButtons = function() {
  const el = document.getElementById('createStepsList');
  const leftBtn = document.getElementById('stepsScrollLeftBtn');
  const rightBtn = document.getElementById('stepsScrollRightBtn');
  if (!el) return;
  
  if (leftBtn) {
    leftBtn.style.display = el.scrollLeft > 5 ? 'flex' : 'none';
  }
  if (rightBtn) {
    const remaining = el.scrollWidth - el.clientWidth - el.scrollLeft;
    rightBtn.style.display = remaining > 15 ? 'flex' : 'none';
  }
};

window.enableDragScroll = function(el) {
  if (!el) return;
  let isDown = false;
  let startX;
  let scrollLeft;

  el.addEventListener('mousedown', (e) => {
    const tag = e.target.tagName.toLowerCase();
    if (tag === 'textarea' || tag === 'input' || tag === 'button' || e.target.closest('button')) {
      return;
    }
    isDown = true;
    el.style.cursor = 'grabbing';
    startX = e.pageX - el.offsetLeft;
    scrollLeft = el.scrollLeft;
  });

  el.addEventListener('mouseleave', () => {
    isDown = false;
    el.style.cursor = 'default';
  });

  el.addEventListener('mouseup', () => {
    isDown = false;
    el.style.cursor = 'default';
  });

  el.addEventListener('mousemove', (e) => {
    if (!isDown) return;
    e.preventDefault();
    const x = e.pageX - el.offsetLeft;
    const walk = (x - startX) * 1.5;
    el.scrollLeft = scrollLeft - walk;
  });
};

function renderCreateSteps() {
  if (typeof window.ensureContinuousSteps === 'function') {
    window.ensureContinuousSteps();
  }
  const list  = document.getElementById('createStepsList');
  const count = document.getElementById('createStepCount');

  // Dynamically toggle Generate Steps/Re-generate Steps labels
  const hasDescriptions = createStepsArr.some(s => s.description && s.description.trim().length > 0);
  const genBtn = document.getElementById('aiGenerateStepsBtn');
  if (genBtn) {
    const span = genBtn.querySelector('span');
    if (span) span.textContent = hasDescriptions ? 'Re-generate Steps' : 'Generate Steps';
  }
  const genBtnMobile = document.getElementById('aiGenerateStepsBtnMobile');
  if (genBtnMobile) {
    const span = genBtnMobile.querySelector('span');
    if (span) span.textContent = hasDescriptions ? 'Re-generate Steps' : 'Generate Steps';
  }

  // Populate the Voiceover tab lists if they exist
  const voList = document.getElementById('voiceoverStepsList');
  const voListMobile = document.getElementById('voiceoverStepsListMobile');
  if (voList || voListMobile) {
    const html = createStepsArr.map((step, i) => {
      const stepText = step.description?.trim() || step.label?.trim() || `Step ${i + 1}`;
      const hasAudio = !!step.audioUrl;
      return `
        <div class="glass-card" style="padding:10px; border:1px solid rgba(236,72,153,0.12); background:rgba(255,255,255,0.6); display:flex; flex-direction:column; gap:6px; width:260px; flex-shrink:0;">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
            <div style="font-weight:800; font-size:0.75rem; color:var(--text-heading); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1;">
              Step ${i + 1}: ${step.label}
            </div>
            <button id="regenVoiceoverBtn-${i}" onclick="window.generateSingleVoiceover(${i})" 
              style="background:#fff; color:#ec4899; border:1.5px solid rgba(236,72,153,0.25); border-radius:6px; padding:3px 8px; font-family:var(--font); font-weight:800; font-size:0.65rem; cursor:pointer; transition:all 0.15s; white-space:nowrap;"
              onmouseenter="this.style.background='#fff1f2';" onmouseleave="this.style.background='#fff';">
              ${hasAudio ? '🎙️ Re-generate' : '🎙️ Generate'}
            </button>
          </div>
          <div style="font-size:0.7rem; color:var(--text-muted); font-style:italic; line-height:1.3; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;">
            "${stepText}"
          </div>
          ${hasAudio ? `
            <audio src="${step.audioUrl}" controls style="width:100%; height:28px; margin-top:2px; border-radius:6px; outline:none; background:#f1f5f9;"></audio>
          ` : `
            <div style="font-size:0.62rem; color:#f43f5e; font-weight:700; display:flex; align-items:center; gap:3px; margin-top:2px;">
              <span>⚠️</span> No voiceover generated yet.
            </div>
          `}
        </div>
      `;
    }).join('');

    if (voList) voList.innerHTML = html;
    if (voListMobile) {
      // Create mobile version with distinct button ID suffixes to avoid document.getElementById collisions
      const mobileHtml = html
        .replace(/id="regenVoiceoverBtn-/g, 'id="regenVoiceoverBtnMobile-')
        .replace(/regenVoiceoverBtn-/g, 'regenVoiceoverBtnMobile-');
      voListMobile.innerHTML = mobileHtml;
    }
  }

  if (!list) return;
  if (count) count.textContent = `(${createStepsArr.length})`;

  // Ensure currentNavStepIndex is within bounds
  const activeIdx = Math.max(0, Math.min(currentNavStepIndex, createStepsArr.length - 1));
  if (createStepsArr.length > 0 && currentNavStepIndex !== activeIdx) {
    currentNavStepIndex = activeIdx;
  }

  const fixedPanel = document.getElementById('fixedTranscriptPanel');
  const fixedText = document.getElementById('fixedTranscriptText');

  if (!createStepsArr.length) {
    list.innerHTML = `<div style="color:var(--text-muted);font-weight:600;font-size:0.8rem;padding:8px 0;">No loop stops yet — run AI or tap 📍 Add Stop while playing</div>`;
    list.style.flexDirection = 'column';
    if (fixedPanel) fixedPanel.style.display = 'none';
    refreshStepNavigator();
    return;
  }

  const isDesktop = window.innerWidth > 768;

  list.style.display                 = 'flex';
  list.style.flexDirection           = 'row';
  list.style.gap                     = '12px';
  list.style.paddingBottom           = isDesktop ? '6px' : '4px';
  list.style.flexWrap                = 'nowrap';
  list.style.overflowX               = 'auto';
  list.style.overflowY               = 'hidden';
  list.style.webkitOverflowScrolling = 'touch';
  list.style.maxHeight               = 'none';
  list.style.height                  = isDesktop ? '430px' : '100%';
  list.style.flexShrink              = '0';
  list.style.touchAction             = 'pan-x pan-y';

  // Stop propagation of touch events to prevent swiping the parent carousel when scrolling loop stops horizontally
  if (!list.dataset.touchListenerAdded) {
    list.addEventListener('touchstart', (e) => {
      e.stopPropagation();
    }, { passive: true });
    list.addEventListener('touchmove', (e) => {
      e.stopPropagation();
    }, { passive: true });
    list.dataset.touchListenerAdded = 'true';
  }

  // 1. Render Fixed Transcript Panel if enabled
  if (window.showStepTranscripts) {
    if (fixedPanel) fixedPanel.style.display = 'flex';
    
    // Calculate transcript for active step
    const activeStep = createStepsArr[currentNavStepIndex];
    if (activeStep) {
      const activeRawEnd = activeStep.endTime ?? (createStepsArr[currentNavStepIndex + 1]?.time ?? videoDuration);
      
      if (!cachedSegments || !cachedSegments.length) {
        if (fixedText) fixedText.textContent = "No transcript available. Transcribe first!";
      } else {
        const html = cachedSegments.map(s => {
          const start = Number(s.start ?? s.startTime ?? s.start_time) || 0;
          const end = Number(s.end ?? s.endTime ?? s.end_time) || (start + 5);
          const isCurrent = (start <= activeRawEnd + 0.5) && (end >= activeStep.time - 0.5);
          
          if (isCurrent) {
            return `<span class="active-transcript-segment" style="font-weight: 800; color: var(--text-heading); display: inline;">${s.text.trim()}</span>`;
          } else {
            return `<span style="color: var(--text-body); opacity: 0.65;">${s.text.trim()}</span>`;
          }
        }).join(' ');
        
        if (fixedText) {
          fixedText.innerHTML = html;
          
          // Smooth scroll active segment into view
          setTimeout(() => {
            const activeEl = fixedText.querySelector('.active-transcript-segment');
            if (activeEl) {
              activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
          }, 50);
        }
      }
    }
  } else {
    if (fixedPanel) fixedPanel.style.display = 'none';
  }

  // 2. Render Cards list
  list.innerHTML = createStepsArr.map((step, i) => {
    // Normalize step.timers: if not yet initialized, parse from description or legacy timer
    if (step.timers === undefined) {
      const parsed = window.parseMultipleTimersFromText(step.description);
      if (parsed && parsed.length > 0) {
        step.timers = parsed;
        step.timer = parsed[0].duration;
      } else if (step.timer) {
        step.timers = [{ duration: Number(step.timer), label: 'Timer 1' }];
      } else {
        step.timers = [];
      }
    }

    const color  = STEP_COLORS[i % STEP_COLORS.length];
    const rawEnd = step.endTime ?? (createStepsArr[i + 1]?.time ?? videoDuration);
    const em = Math.floor(rawEnd / 60);
    const es = Math.floor(rawEnd % 60).toString().padStart(2, '0');
    const desc = (step.description || '').replace(/"/g, '&quot;');
    const stepIngsText = Array.isArray(step.ingredients) ? step.ingredients.join('\n') : '';

    const isActive = (i === currentNavStepIndex);
    const activeStyle = isActive && window.showStepTranscripts 
      ? `border: 3.5px solid ${color}; box-shadow: 0 0 16px rgba(124,58,237,0.3); background: #fff; transform: scale(1.01);` 
      : `border: 2px solid ${color}; box-shadow: 0 4px 12px rgba(0,0,0,0.03); background: rgba(255,255,255,0.7);`;

    return `
      <div id="stepRow_${i}"
        onfocusin="if(!event.target.closest('input, textarea, button') && window.selectCreateStep && currentNavStepIndex !== ${i}) { window.selectCreateStep(${i}); }"
        onclick="if(!event.target.closest('input, textarea, button') && window.selectCreateStep) { window.selectCreateStep(${i}); }"
        style="width:${isDesktop ? '310px' : '280px'};height:100%;max-height:100%;overflow-y:auto;flex-shrink:0;backdrop-filter:blur(8px);border-radius:14px;padding:12px;display:flex;flex-direction:column;gap:6px;box-sizing:border-box;transition:all 0.2s ease;min-height:0;overflow-x:hidden;${activeStyle};cursor:pointer;"
        class="loop-stop-card"
        onmouseenter="if(!${isActive}){this.style.transform='translateY(-2px)';this.style.boxShadow='0 8px 20px rgba(0,0,0,0.06)';}"
        onmouseleave="if(!${isActive}){this.style.transform='none';this.style.boxShadow='0 4px 12px rgba(0,0,0,0.03)';}">
        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
          <div style="width:22px;height:22px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-size:0.75rem;font-weight:900;color:#446;flex-shrink:0;box-shadow:0 1px 3px rgba(0,0,0,0.1);">${i+1}</div>
          <input value="${step.label.replace(/"/g,'&quot;')}" onchange="updateStepLabel(${i},this.value)"
            style="flex:1;min-width:0;background:transparent;border:none;font-family:var(--font);font-size:0.8rem;font-weight:800;color:var(--text-heading);outline:none;border-bottom:1px dashed transparent;"
            onfocus="this.style.borderBottomColor='var(--primary)'" onblur="this.style.borderBottomColor='transparent'">
          ${i < createStepsArr.length - 1 ? `
            <button onclick="event.stopPropagation(); window.mergeCreateStep(${i})" title="Merge with next step" tabindex="-1"
               style="background:rgba(22,163,74,0.08);border:1px solid rgba(22,163,74,0.25);border-radius:6px;cursor:pointer;color:#16a34a;font-size:0.85rem;padding:3px 6px;flex-shrink:0;display:flex;align-items:center;justify-content:center;transition:background 0.15s,transform 0.1s;"
              onmouseenter="this.style.background='rgba(22,163,74,0.18)';this.style.transform='scale(1.05)';" onmouseleave="this.style.background='rgba(22,163,74,0.08)';this.style.transform='none';">🔗</button>
          ` : ''}
          <button onclick="event.stopPropagation(); removeCreateStep(${i})" title="Delete this stop" tabindex="-1"
            style="background:rgba(220,38,38,0.06);border:1px solid rgba(220,38,38,0.2);border-radius:6px;cursor:pointer;color:#dc2626;font-size:0.85rem;padding:3px 6px;flex-shrink:0;display:flex;align-items:center;justify-content:center;transition:background 0.15s,transform 0.1s;"
            onmouseenter="this.style.background='rgba(220,38,38,0.15)';this.style.transform='scale(1.05)';" onmouseleave="this.style.background='rgba(220,38,38,0.06)';this.style.transform='none';">×</button>
        </div>
        <div style="font-size:0.68rem;font-weight:800;color:var(--primary);background:rgba(74,144,217,0.08);padding:4px 8px;border-radius:6px;width:fit-content;font-variant-numeric:tabular-nums;display:flex;align-items:center;gap:4px;flex-shrink:0;">
          <span>⏱️</span> <span>${step.displayTime} → ${em}:${es}</span>
        </div>

        <div style="display:flex;flex-direction:column;gap:4px;background:rgba(124,58,237,0.03);border:1px solid rgba(124,58,237,0.12);padding:6px;border-radius:8px;flex-shrink:0;box-sizing:border-box;width:100%;">
          <div style="display:flex;align-items:center;justify-content:space-between;width:100%;margin-bottom:2px;">
            <span style="font-size:0.65rem;font-weight:800;color:#7c3aed;display:flex;align-items:center;gap:3px;white-space:nowrap;">⏳ Timers (${(step.timers || []).length}):</span>
            <button onclick="event.stopPropagation(); window.addStepTimer(${i})" style="border:none;background:rgba(124,58,237,0.1);color:#7c3aed;font-family:var(--font);font-size:0.62rem;font-weight:800;border-radius:4px;padding:2px 6px;cursor:pointer;">＋ Add</button>
          </div>
          <div id="step-timers-list-${i}">
            ${(step.timers || []).map((t, tIdx) => `
              <div style="display:flex;align-items:center;gap:4px;margin-bottom:4px;width:100%;">
                <input type="text" placeholder="Label" value="${t.label || ''}" 
                  onchange="window.updateStepTimerLabel(${i}, ${tIdx}, this.value)"
                  style="flex:1;min-width:0;background:#fff;border:1px solid rgba(0,0,0,0.1);border-radius:4px;font-size:0.65rem;font-weight:700;padding:2px 4px;outline:none;color:var(--text-heading);height:18px;" />
                <input type="number" min="0" placeholder="Min" 
                  value="${t.duration ? Math.floor(t.duration / 60) : ''}" 
                  onchange="window.updateStepTimerDurationMin(${i}, ${tIdx}, this.value)"
                  style="width:32px;background:#fff;border:1px solid rgba(0,0,0,0.1);border-radius:4px;font-size:0.65rem;font-weight:700;text-align:center;padding:1px 0;outline:none;color:var(--text-heading);height:18px;" />
                <span style="font-size:0.6rem;color:var(--text-muted);font-weight:700;">m</span>
                <input type="number" min="0" max="59" placeholder="Sec" 
                  value="${t.duration ? t.duration % 60 : ''}" 
                  onchange="window.updateStepTimerDurationSec(${i}, ${tIdx}, this.value)"
                  style="width:26px;background:#fff;border:1px solid rgba(0,0,0,0.1);border-radius:4px;font-size:0.65rem;font-weight:700;text-align:center;padding:1px 0;outline:none;color:var(--text-heading);height:18px;" />
                <span style="font-size:0.6rem;color:var(--text-muted);font-weight:700;">s</span>
                <button onclick="event.stopPropagation(); window.removeStepTimer(${i}, ${tIdx})" title="Delete Timer" style="border:none;background:transparent;cursor:pointer;color:#dc2626;font-size:0.75rem;padding:0 2px;line-height:1;margin-left:2px;">×</button>
              </div>
            `).join('')}
          </div>
        </div>
        
        <div style="position:relative;width:100%;flex:1;min-height:60px;display:flex;flex-direction:column;min-width:0;">
          <textarea placeholder="Add notes for this step…" style="flex:1;min-height:60px;width:100%;box-sizing:border-box;background:#fff;border:1px solid rgba(0,0,0,0.08);border-radius:8px;padding:6px 28px 6px 8px;font-family:var(--font);font-size:0.75rem;font-weight:600;color:var(--text-body);resize:none;outline:none;line-height:1.4;box-shadow:inset 0 1px 2px rgba(0,0,0,0.02);"
            onchange="updateStepDescription(${i},this.value)">${desc}</textarea>
          <button onclick="event.stopPropagation(); window.askAiTweakDescription(${i})" title="AI Edit Description"
            style="position:absolute;top:6px;right:6px;background:linear-gradient(135deg,#7c3aed,#ec4899);color:#fff;border:none;border-radius:6px;width:22px;height:22px;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 2px 4px rgba(124,58,237,0.25);font-size:0.75rem;transition:all 0.15s;z-index:10;padding:0;"
            onmouseenter="this.style.transform='scale(1.1)';" onmouseleave="this.style.transform='none';">
            ✨
          </button>
        </div>
        
        <div style="display:flex;flex-direction:column;gap:2px;flex-shrink:0;">
          <label style="font-size:0.6rem;font-weight:800;text-transform:uppercase;color:var(--text-muted);letter-spacing:0.04em;margin-top:2px;line-height:1.2;">Step Ingredients (one per line)</label>
          <textarea placeholder="e.g. 1 onion&#10;2 cloves garlic" style="height:52px;width:100%;box-sizing:border-box;background:#fff;border:1px solid rgba(0,0,0,0.08);border-radius:8px;padding:4px 8px;font-family:var(--font);font-size:0.72rem;font-weight:600;color:var(--text-body);outline:none;line-height:1.3;box-shadow:inset 0 1px 2px rgba(0,0,0,0.02);resize:none;"
            onchange="window.updateStepIngredientsText(${i},this.value)">${stepIngsText}</textarea>
        </div>

        <div class="card-options-dropdown" style="margin-top:auto;padding-top:4px;flex-shrink:0;position:relative;">
          <button onclick="window.toggleCardDropdown(event, ${i})" class="card-options-dropdown-btn" tabindex="-1"
            style="width:100%;background:#f5f0ff;border:1.5px solid rgba(124,58,237,0.25);border-radius:8px;padding:6px 12px;font-family:var(--font);font-size:0.72rem;font-weight:800;color:#7c3aed;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px;box-shadow:var(--shadow-xs);transition:all 0.15s;"
            onmouseenter="this.style.background='#ede9ff';" onmouseleave="this.style.background='#f5f0ff';">
            ⚙️ Edit Options ▾
          </button>
        </div>
      </div>`;
  }).join('');
  refreshStepNavigator();
  if (typeof window.updateAIChecklists === 'function') {
    window.updateAIChecklists();
  }

  // Set up drag scroll & horizontal scroll buttons
  window.enableDragScroll(list);
  list.removeEventListener('scroll', window.updateStepsScrollButtons);
  list.addEventListener('scroll', window.updateStepsScrollButtons);
  setTimeout(window.updateStepsScrollButtons, 50);
}

// Lazy initialization of document-level dropdown menu for step options to prevent container clipping
window.toggleCardDropdown = function(event, i) {
  event.stopPropagation();
  const btn = event.currentTarget;
  let menu = document.getElementById('cardDropdownMenu');
  if (!menu) {
    menu = document.createElement('div');
    menu.id = 'cardDropdownMenu';
    menu.style.position = 'absolute';
    menu.style.background = '#fff';
    menu.style.border = '1.5px solid rgba(124,58,237,0.25)';
    menu.style.borderRadius = '8px';
    menu.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
    menu.style.zIndex = '9999';
    menu.style.display = 'none';
    menu.style.overflow = 'hidden';
    menu.style.flexDirection = 'column';
    document.body.appendChild(menu);
  }
  
  if (menu.style.display === 'flex' && menu.dataset.stepIndex === String(i)) {
    menu.style.display = 'none';
    return;
  }
  
  menu.dataset.stepIndex = i;
  
  const step = createStepsArr[i];
  const color = STEP_COLORS[i % STEP_COLORS.length];
  
  menu.innerHTML = `
    <button onclick="previewStepLoop(${i}); window.closeCardDropdown();" style="width:100%;background:transparent;border:none;border-bottom:1px solid rgba(0,0,0,0.03);padding:8px 12px;font-family:var(--font);font-size:0.72rem;font-weight:700;color:var(--text-heading);text-align:left;cursor:pointer;display:flex;align-items:center;gap:6px;transition:background 0.12s;" onmouseenter="this.style.background='#f5f0ff';" onmouseleave="this.style.background='transparent';">
      <span>▶</span> Loop Stop
    </button>
    <button onclick="navToStep(${i}); window.closeCardDropdown();" style="width:100%;background:transparent;border:none;padding:8px 12px;font-family:var(--font);font-size:0.72rem;font-weight:700;color:var(--text-heading);text-align:left;cursor:pointer;display:flex;align-items:center;gap:6px;transition:background 0.12s;" onmouseenter="this.style.background='#f5f0ff';" onmouseleave="this.style.background='transparent';">
      <span>⏩</span> Go to Stop
    </button>
    ${step.audio_url || step.audioUrl ? `
      <button onclick="window.playVoiceoverAudio('${step.audio_url || step.audioUrl}'); window.closeCardDropdown();" style="width:100%;background:transparent;border:none;border-top:1px solid rgba(0,0,0,0.03);padding:8px 12px;font-family:var(--font);font-size:0.72rem;font-weight:700;color:var(--text-heading);text-align:left;cursor:pointer;display:flex;align-items:center;gap:6px;transition:background 0.12s;" onmouseenter="this.style.background='#f5f0ff';" onmouseleave="this.style.background='transparent';">
        <span>🔊</span> Play Voiceover Audio
      </button>
    ` : ''}
  `;
  
  const rect = btn.getBoundingClientRect();
  menu.style.display = 'flex';
  
  const menuHeight = menu.offsetHeight || 130;
  if (rect.top - menuHeight > 10) {
    menu.style.top = `${rect.top - menuHeight - 4 + window.scrollY}px`;
  } else {
    menu.style.top = `${rect.bottom + 4 + window.scrollY}px`;
  }
  menu.style.left = `${rect.left + window.scrollX}px`;
  menu.style.width = `${rect.width}px`;
};

window.closeCardDropdown = function() {
  const menu = document.getElementById('cardDropdownMenu');
  if (menu) menu.style.display = 'none';
};

document.addEventListener('click', (e) => {
  if (!e.target.closest('#cardDropdownMenu') && !e.target.closest('.card-options-dropdown-btn')) {
    window.closeCardDropdown();
  }
  if (!e.target.closest('#libFolderDropdownMenu') && !e.target.closest('.lib-folder-select-trigger')) {
    window.closeLibFolderDropdown();
  }
});
window.addEventListener('scroll', () => {
  window.closeCardDropdown();
  window.closeLibFolderDropdown();
}, true);

window.mergeCreateStep = function(i) {
  if (i < 0 || i >= createStepsArr.length - 1) return;

  const current = createStepsArr[i];
  const next = createStepsArr[i + 1];

  // 1. Merge labels
  let newLabel = current.label;
  if (next.label && !newLabel.includes(next.label) && !next.label.startsWith('Step ')) {
    newLabel = `${newLabel} & ${next.label}`;
  }

  // 2. Merge descriptions
  let newDesc = current.description || '';
  let nextDesc = next.description || '';
  if (newDesc && nextDesc) {
    newDesc = `${newDesc} ${nextDesc}`;
  } else {
    newDesc = newDesc || nextDesc;
  }

  // 3. New endTime is the endTime of the next step
  const newEndTime = next.endTime ?? (createStepsArr[i + 2]?.time ?? videoDuration);

  // Update the current step
  current.label = newLabel;
  current.description = newDesc;
  current.endTime = newEndTime;
  
  // Clear voiceover references so they can be regenerated for the merged step
  current.audio_url = null;
  current.audioUrl = null;

  // 4. Remove the next step
  createStepsArr.splice(i + 1, 1);

  // 5. Redraw
  renderCreateSteps();
  renderTimeline();
  showTip(`Merged step ${i+1} with step ${i+2}!`);
};

window.redoStepDescription = async function(i, tweakPrompt = '') {
  const step = createStepsArr[i];
  if (!step) return;

  const originalText = step.description;
  step.description = "⏳ AI is rewriting...";
  renderCreateSteps();

  try {
    const steps = [{
      index: 0,
      label: step.label,
      startTime: step.time,
      endTime: step.endTime ?? (createStepsArr[i + 1]?.time ?? videoDuration),
      currentDescription: originalText
    }];

    const videoUrl = document.getElementById('uploadedVideoPlayer')?.src || window._uploadedVideoUrl || '';
    const res = await fetch('/api/ai/describe-steps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ steps, videoUrl, segments: cachedSegments, tweakPrompt }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    const newDesc = data.descriptions?.[0];
    const nextStart = createStepsArr[i + 1]?.time ?? videoDuration;
    const wordForWordDesc = window.getTranscriptForTimeRange(step.time, step.endTime ?? nextStart);
    
    let finalDesc = '';
    let parsedIngs = [];
    if (newDesc) {
      const parsed = window.parseDescriptionAndIngredients(newDesc, step.ingredients);
      finalDesc = parsed.description;
      parsedIngs = parsed.ingredients;
    }
    
    const rawDesc = finalDesc || wordForWordDesc;
    if (rawDesc || wordForWordDesc) {
      step.description = rawDesc;
      if (parsedIngs.length > 0) {
        step.ingredients = parsedIngs;
      }
      delete step.timers; // force auto-detection of new timers!
      showTip(`✅ Regenerated description for step ${i + 1}!`);
    } else {
      step.description = originalText;
      showTip('⚠️ AI returned no description.');
    }
  } catch (err) {
    step.description = originalText;
    showTip('❌ ' + (err.message || 'Failed to regenerate.'));
  } finally {
    renderCreateSteps();
  }
};

window.askAiTweakDescription = function(i) {
  const step = createStepsArr[i];
  if (!step) return;
  
  window.activeAiTweakStepIndex = i;
  
  const modal = document.getElementById('aiTweakDescriptionModal');
  const input = document.getElementById('aiTweakDescriptionInput');
  if (modal && input) {
    input.value = '';
    // Show the modal
    modal.style.display = 'flex';
    input.focus();
    
    // Bind enter key (without shift) to submit
    input.onkeydown = function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        window.submitAiTweakDescription();
      }
    };
  }
};

window.closeAiTweakDescriptionModal = function() {
  const modal = document.getElementById('aiTweakDescriptionModal');
  if (modal) {
    modal.style.display = 'none';
  }
};

window.submitAiTweakDescription = function() {
  const i = window.activeAiTweakStepIndex;
  const input = document.getElementById('aiTweakDescriptionInput');
  if (i === undefined || i === null || !input) {
    window.closeAiTweakDescriptionModal();
    return;
  }
  const promptText = input.value.trim();
  window.closeAiTweakDescriptionModal();
  window.redoStepDescription(i, promptText);
};


// ── Preview loop ───────────────────────────────────────────────────────────
window.previewStepLoop = function(i) {
  const videoEl = document.getElementById('uploadedVideoPlayer');
  const step    = createStepsArr[i];
  if (!videoEl || !step) return;

  stopPreviewLoop();

  // Keep navigator in sync with the step being looped
  currentNavStepIndex = i;
  refreshStepNavigator();
  renderCreateSteps();

  // endTime: use explicit value, then next step's start, then video end
  const endTime = (step.endTime != null)
    ? step.endTime
    : (createStepsArr[i + 1]?.time ?? videoDuration);

  // Seek to step start and play
  videoEl.currentTime = step.time;
  const playPromise = videoEl.play();
  if (playPromise !== undefined) {
    playPromise.catch(err => {
      console.warn("Unmuted editor video loop playback blocked by browser, falling back to muted:", err);
      videoEl.muted = true;
      if (typeof window.updateEditorMuteUI === 'function') {
        window.updateEditorMuteUI();
      }
      videoEl.play().catch(e => console.error("Muted editor video loop playback also blocked:", e));
    });
  }

  const labelEl = document.getElementById('previewingLabel');
  const stopBtn = document.getElementById('stopPreviewBtn');
  const loopBtn = document.getElementById('previewLoopBtn');
  if (labelEl) labelEl.style.display  = 'inline';
  if (loopBtn) loopBtn.style.display   = 'none';
  if (stopBtn) stopBtn.style.display  = 'inline-block';

  const overlayStopBtn = document.getElementById('overlayStopPreviewBtn');
  const overlayLoopBtn = document.getElementById('overlayPreviewLoopBtn');
  if (overlayLoopBtn) overlayLoopBtn.style.display = 'none';
  if (overlayStopBtn) overlayStopBtn.style.display = 'inline-block';

  // Use timeupdate (fires ~4× per second) for precise boundary detection
  // — avoids the 100ms polling lag that caused early/late cutoffs
  function onTimeUpdate() {
    if (videoEl.currentTime >= endTime - 0.05) {
      videoEl.currentTime = step.time;
    }
  }
  videoEl.addEventListener('timeupdate', onTimeUpdate);

  // Store cleanup handle so stopPreviewLoop can remove the listener
  previewInterval = { cancel: () => videoEl.removeEventListener('timeupdate', onTimeUpdate) };

  const dur = endTime - step.time;
  showTip(`Looping "${step.label}" — ${dur.toFixed(1)}s · use ← → to skip steps`);
};

window.stopPreviewLoop = function() {
  if (previewInterval) {
    if (typeof previewInterval.cancel === 'function') previewInterval.cancel();
    else clearInterval(previewInterval);
    previewInterval = null;
  }
  const labelEl = document.getElementById('previewingLabel');
  const stopBtn = document.getElementById('stopPreviewBtn');
  const loopBtn = document.getElementById('previewLoopBtn');
  if (labelEl) labelEl.style.display  = 'none';
  if (stopBtn) stopBtn.style.display  = 'none';
  if (loopBtn) loopBtn.style.display   = 'inline-block';

  const overlayStopBtn = document.getElementById('overlayStopPreviewBtn');
  const overlayLoopBtn = document.getElementById('overlayPreviewLoopBtn');
  if (overlayStopBtn) overlayStopBtn.style.display = 'none';
  if (overlayLoopBtn) overlayLoopBtn.style.display = 'inline-block';
};

// ── Drag to reorder ────────────────────────────────────────────────────────
window.stepDragStart = function(e, i) {
  dragSrcIndex = i;
  e.dataTransfer.effectAllowed = 'move';
  setTimeout(() => { const r = document.getElementById(`stepRow_${i}`); if (r) r.style.opacity = '0.4'; }, 0);
};
window.stepDragOver = function(e, i) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
};
window.stepDrop = function(e, i) {
  e.preventDefault();
  if (dragSrcIndex === null || dragSrcIndex === i) return;
  const moved = createStepsArr.splice(dragSrcIndex, 1)[0];
  createStepsArr.splice(i, 0, moved);
  dragSrcIndex = null;
  renderCreateSteps();
  renderTimeline();
};
window.stepDragEnd = function(e) {
  dragSrcIndex = null;
  renderCreateSteps();
  renderTimeline();
};

window.updateStepLabel       = (i, v) => { if (createStepsArr[i]) createStepsArr[i].label = v; renderTimeline(); };
window.updateStepDescription = (i, v) => {
  if (createStepsArr[i]) {
    createStepsArr[i].description = v;
    if (!createStepsArr[i].timers || createStepsArr[i].timers.length === 0) {
      delete createStepsArr[i].timers;
      renderCreateSteps();
    }
  }
};
window.updateStepIngredientsText = (i, val) => {
  if (createStepsArr[i]) {
    createStepsArr[i].ingredients = val.split('\n').map(x => x.trim()).filter(Boolean);
  }
};

window.updateStepTimerMinutes = (i, v) => {
  const step = createStepsArr[i];
  if (!step) return;
  const currentSeconds = step.timer ? step.timer % 60 : 0;
  const minutes = Math.max(0, parseInt(v) || 0);
  if (minutes === 0 && currentSeconds === 0) {
    step.timer = null;
  } else {
    step.timer = minutes * 60 + currentSeconds;
  }
  
  // Keep step.timers synced
  step.timers = step.timers || [];
  if (step.timers.length === 0) {
    step.timers.push({ duration: step.timer || 0, label: 'Timer 1' });
  } else {
    step.timers[0].duration = step.timer || 0;
  }
  
  renderTimeline();
};

window.updateStepTimerSeconds = (i, v) => {
  const step = createStepsArr[i];
  if (!step) return;
  const minutes = step.timer ? Math.floor(step.timer / 60) : 0;
  const seconds = Math.max(0, Math.min(59, parseInt(v) || 0));
  if (minutes === 0 && seconds === 0) {
    step.timer = null;
  } else {
    step.timer = minutes * 60 + seconds;
  }
  
  // Keep step.timers synced
  step.timers = step.timers || [];
  if (step.timers.length === 0) {
    step.timers.push({ duration: step.timer || 0, label: 'Timer 1' });
  } else {
    step.timers[0].duration = step.timer || 0;
  }
  
  renderTimeline();
};

window.addStepTimer = (i) => {
  const step = createStepsArr[i];
  if (!step) return;
  step.timers = step.timers || [];
  step.timers.push({ duration: 60, label: `Timer ${step.timers.length + 1}` });
  step.timer = step.timers[0].duration;
  renderCreateSteps();
  renderTimeline();
};

window.removeStepTimer = (i, tIdx) => {
  const step = createStepsArr[i];
  if (!step || !step.timers) return;
  step.timers.splice(tIdx, 1);
  step.timer = step.timers.length > 0 ? step.timers[0].duration : null;
  renderCreateSteps();
  renderTimeline();
};

window.updateStepTimerLabel = (i, tIdx, val) => {
  const step = createStepsArr[i];
  if (!step || !step.timers || !step.timers[tIdx]) return;
  step.timers[tIdx].label = val.trim();
};

window.updateStepTimerDurationMin = (i, tIdx, val) => {
  const step = createStepsArr[i];
  if (!step || !step.timers || !step.timers[tIdx]) return;
  const currentSec = step.timers[tIdx].duration % 60;
  const min = Math.max(0, parseInt(val) || 0);
  step.timers[tIdx].duration = min * 60 + currentSec;
  step.timer = step.timers[0].duration;
  renderTimeline();
};

window.updateStepTimerDurationSec = (i, tIdx, val) => {
  const step = createStepsArr[i];
  if (!step || !step.timers || !step.timers[tIdx]) return;
  const min = Math.floor(step.timers[tIdx].duration / 60);
  const sec = Math.max(0, Math.min(59, parseInt(val) || 0));
  step.timers[tIdx].duration = min * 60 + sec;
  step.timer = step.timers[0].duration;
  renderTimeline();
};
window.parseDescriptionAndIngredients = function(text, existingIngs) {
  let description = (text || '').trim();
  let ingredients = Array.isArray(existingIngs) ? [...existingIngs] : [];

  const match = description.match(/Ingredients:\s*([\s\S]*)/i);
  if (match) {
    const ingPart = match[1].trim();
    description = description.replace(/[\s.,;]*Ingredients:\s*[\s\S]*/i, '').trim();
    if (ingredients.length === 0 && ingPart.toLowerCase() !== 'none') {
      ingredients = ingPart.split(/[,;\n]+/).map(i => i.trim()).filter(Boolean);
    }
  }
  return { description, ingredients };
};
window.navToStep = function(i) {
  const vid = document.getElementById('uploadedVideoPlayer');
  if (!vid || !createStepsArr[i]) return;
  vid.currentTime = createStepsArr[i].time;
  currentNavStepIndex = i;
  refreshStepNavigator();
};
window.removeCreateStep = (i)    => { createStepsArr.splice(i, 1); renderCreateSteps(); renderTimeline(); stopPreviewLoop(); };


window.toggleCreatePrivacy = function() {
  createIsPublic = !createIsPublic;
  const toggle = document.getElementById('privacyToggle');
  const thumb  = document.getElementById('privacyThumb');
  const label  = document.getElementById('privacyLabel');
  if (toggle) toggle.style.background = createIsPublic ? 'var(--green)' : '#e0eaf4';
  if (thumb)  thumb.style.left        = createIsPublic ? '26px' : '2px';
  if (label)  label.textContent       = createIsPublic
    ? '🌎 Public — visible on Discover and your profile'
    : '🔒 Private — only you can see this';
};

// ── Folder Save Modal (shown when clicking Save Recipe) ────────────────────────────
let _fsmPendingFolderId = null;

window.openFolderSaveModal = function() {
  const titleInput = document.getElementById('newRecipeTitleInput');
  const title = titleInput ? titleInput.value.trim() : '';
  if (!title) { showTip('Please enter a recipe title first!'); if (titleInput) titleInput.focus(); return; }
  if (!currentUser) { showTip('Please sign in to save your recipe.'); window.openAuthModal(); return; }

  _fsmPendingFolderId = null;

  const select = document.getElementById('fsm-folder-select');
  if (select) {
    let folders = [];
    try {
      const raw = localStorage.getItem('cookingGPS_library_v1');
      const lib = raw ? JSON.parse(raw) : {};
      folders = lib.folders || [];
    } catch {}
    select.innerHTML = '<option value="">— No folder (save loose) —</option>'
      + folders.map(f => '<option value="' + f.id + '">' + f.name + '</option>').join('');
  }

  const titleEl = document.getElementById('fsm-title');
  if (titleEl) titleEl.textContent = '\u201c' + (titleInput ? titleInput.value.trim() : '') + '\u201d';

  const msg   = document.getElementById('fsm-msg');
  const chips = document.getElementById('fsm-chips');
  const input = document.getElementById('fsm-new-folder');
  if (msg)   msg.textContent = '';
  if (chips) chips.innerHTML = '';
  if (input) input.value    = '';

  document.getElementById('folderSaveBackdrop').style.display = 'block';
  document.getElementById('folderSaveModal').style.display    = 'block';
};

window.closeFolderSaveModal = function() {
  document.getElementById('folderSaveBackdrop').style.display = 'none';
  document.getElementById('folderSaveModal').style.display    = 'none';
};

window.fsmCreateFolder = function() {
  const input = document.getElementById('fsm-new-folder');
  const msg   = document.getElementById('fsm-msg');
  const chips = document.getElementById('fsm-chips');
  const name  = input ? input.value.trim() : '';
  if (!name) { if (msg) { msg.style.color = '#ef4444'; msg.textContent = 'Enter a folder name first.'; } return; }

  try {
    const raw = localStorage.getItem('cookingGPS_library_v1');
    const lib = raw ? JSON.parse(raw) : { folders: [], customOrder: [] };
    if (!lib.folders)     lib.folders     = [];
    if (!lib.customOrder) lib.customOrder = [];

    if (lib.folders.some(f => f.name.toLowerCase() === name.toLowerCase())) {
      if (msg) { msg.style.color = '#ef4444'; msg.textContent = 'A folder with that name already exists.'; }
      return;
    }

    const colors = ['#4a90d9','#22c55e','#f59e0b','#a855f7','#ef4444','#06b6d4','#ec4899','#14b8a6'];
    const newFolder = {
      id:        'f_' + Date.now(),
      name,
      color:     colors[lib.folders.length % colors.length],
      recipeIds: [],
    };
    lib.folders.push(newFolder);
    lib.customOrder.push('folder:' + newFolder.id);
    localStorage.setItem('cookingGPS_library_v1', JSON.stringify(lib));
    _fsmPendingFolderId = newFolder.id;

    if (chips) {
      chips.innerHTML = '<div style="display:inline-flex;align-items:center;gap:5px;background:' + newFolder.color + '22;border:1.5px solid ' + newFolder.color + ';border-radius:8px;padding:4px 10px;font-size:0.78rem;font-weight:700;color:' + newFolder.color + ';">'
        + '\ud83d\udcc1 ' + name + ' \u2714</div>';
    }
    if (msg)   { msg.style.color = '#22c55e'; msg.textContent = '\u2705 Folder created! Recipe will be added on save.'; }
    if (input) input.value = '';

    const select = document.getElementById('fsm-folder-select');
    if (select) {
      const opt = document.createElement('option');
      opt.value = newFolder.id;
      opt.textContent = newFolder.name;
      opt.selected = true;
      select.appendChild(opt);
    }
  } catch (e) {
    if (msg) { msg.style.color = '#ef4444'; msg.textContent = 'Error: ' + e.message; }
  }
};

window.fsmSaveWithFolder = async function() {
  const select = document.getElementById('fsm-folder-select');
  const chosenFolderId = (select && select.value) ? select.value : _fsmPendingFolderId;
  closeFolderSaveModal();
  await saveNewRecipe(chosenFolderId);
};

// ── Capture a thumbnail from the editor video element ──────────────────────
async function captureThumbnail(videoEl) {
  if (!videoEl || !videoEl.videoWidth) return null;
  try {
    const canvas = document.createElement('canvas');
    const maxDim = 640;
    let w = videoEl.videoWidth;
    let h = videoEl.videoHeight;
    const ratio = w / h;
    if (w > h) {
      if (w > maxDim) {
        w = maxDim;
        h = Math.round(maxDim / ratio);
      }
    } else {
      if (h > maxDim) {
        h = maxDim;
        w = Math.round(maxDim * ratio);
      }
    }
    canvas.width  = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
    return new Promise(resolve => canvas.toBlob(b => resolve(b), 'image/jpeg', 0.82));
  } catch { return null; }
}

function dataURLtoBlob(dataurl) {
  try {
    const arr = dataurl.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  } catch (e) {
    console.error('dataURLtoBlob error:', e);
    return null;
  }
}

async function ensureThumbnailUrl() {
  let thumbnailUrl = document.getElementById('newRecipeCoverInput')?.value?.trim() || null;
  if (!thumbnailUrl) {
    try {
      const previewImg = document.getElementById('createThumbnailPreviewImg');
      let blob = null;
      if (previewImg && previewImg.src && previewImg.src.startsWith('data:')) {
        blob = dataURLtoBlob(previewImg.src);
      }
      if (!blob) {
        const videoEl = document.getElementById('uploadedVideoPlayer');
        if (videoEl && videoEl.videoWidth > 0) {
          blob = await captureThumbnail(videoEl);
        }
      }
      if (blob) {
        const { supabase: sb } = await import('./supabase-client.js');
        const ext    = 'jpg';
        const folder = (currentUser?.email || 'anon').replace(/[@.]/g, '_');
        const fname  = 'thumbnails/' + folder + '/' + Date.now() + '.' + ext;
        const { error: upErr } = await sb.storage.from('videos').upload(fname, blob, { contentType: 'image/jpeg', upsert: true });
        if (!upErr) {
          const { data: urlData } = sb.storage.from('videos').getPublicUrl(fname);
          thumbnailUrl = urlData.publicUrl;
          const input = document.getElementById('newRecipeCoverInput');
          if (input) input.value = thumbnailUrl;
        }
      }
    } catch (tErr) {
      console.warn('Thumbnail capture failed (non-fatal):', tErr);
    }
  }
  return thumbnailUrl;
}

window.handleCoverFileSelect = async function(file) {
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    showTip('Please select an image file (PNG, JPG, WebP)');
    return;
  }
  const statusEl = document.getElementById('coverUploadStatus');
  if (statusEl) statusEl.textContent = 'Uploading cover image...';
  try {
    const { supabase: sb } = await import('./supabase-client.js');
    const ext = file.name.split('.').pop().toLowerCase();
    const folder = (currentUser?.email || 'anon').replace(/[@.]/g, '_');
    const fname = 'thumbnails/' + folder + '/' + Date.now() + '_' + Math.random().toString(36).slice(2, 7) + '.' + ext;
    
    const { error: upErr } = await sb.storage.from('videos').upload(fname, file, { contentType: file.type, upsert: true });
    if (upErr) throw upErr;
    
    const { data: urlData } = sb.storage.from('videos').getPublicUrl(fname);
    const publicUrl = urlData.publicUrl;
    
    const coverInput = document.getElementById('newRecipeCoverInput');
    if (coverInput) {
      coverInput.value = publicUrl;
    }
    
    window.updateCoverPreviewFromUrl(publicUrl);
    if (statusEl) statusEl.textContent = 'Cover uploaded successfully! ✅';
    showTip('Cover image uploaded! 🖼️');
  } catch (err) {
    console.error('Cover upload failed:', err);
    if (statusEl) statusEl.textContent = 'Upload failed: ' + err.message;
    showTip('Could not upload cover image: ' + err.message);
  }
};

window.updateCoverPreviewFromUrl = function(url) {
  const previewImg = document.getElementById('createThumbnailPreviewImg');
  const placeholder = document.getElementById('createThumbnailPlaceholder');
  if (previewImg && placeholder) {
    if (url && url.trim()) {
      previewImg.src = url;
      previewImg.style.display = 'block';
      placeholder.style.display = 'none';
    } else {
      previewImg.src = '';
      previewImg.style.display = 'none';
      placeholder.style.display = 'block';
    }
  }
};

window.captureLocalVideoPreview = function() {
  const videoEl = document.getElementById('uploadedVideoPlayer');
  const previewImg = document.getElementById('createThumbnailPreviewImg');
  const placeholder = document.getElementById('createThumbnailPlaceholder');
  if (videoEl && videoEl.videoWidth > 0 && previewImg && placeholder) {
    try {
      const canvas = document.createElement('canvas');
      const maxDim = 640;
      let w = videoEl.videoWidth;
      let h = videoEl.videoHeight;
      const ratio = w / h;
      if (w > h) {
        if (w > maxDim) {
          w = maxDim;
          h = Math.round(maxDim / ratio);
        }
      } else {
        if (h > maxDim) {
          h = maxDim;
          w = Math.round(maxDim * ratio);
        }
      }
      canvas.width  = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
      const localUrl = canvas.toDataURL('image/jpeg', 0.85);
      previewImg.src = localUrl;
      previewImg.style.display = 'block';
      placeholder.style.display = 'none';
      videoEl.setAttribute('poster', localUrl);
    } catch (err) {
      console.warn('Local preview capture failed:', err);
    }
  }
};

window.saveNewRecipe = async function(targetFolderId) {
  const titleInput = document.getElementById('newRecipeTitleInput');
  const title = titleInput?.value?.trim();
  if (!title) { showTip('Please enter a recipe title first!'); titleInput?.focus(); return; }
  if (!currentUser) { showTip('Please sign in to save your recipe.'); window.openAuthModal(); return; }

  const btn = document.getElementById('saveRecipeBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }

  try {
    const videoEl  = document.getElementById('uploadedVideoPlayer');
    const duration = videoEl?.duration || 0;
    const steps    = createStepsArr.map(s => s.label);
    // Save full loop objects — preserves AI-detected start AND end times + descriptions
    const loops    = createStepsArr.map(s => ({
      start:       s.time,
      end:         s.endTime ?? null,
      label:       s.label,
      description: s.description || '',
      ingredients: s.ingredients || [],
      audio_url:   s.audio_url || s.audioUrl || '',
      timer:       s.timer,
      timers:      s.timers || (s.timer ? [{ duration: Number(s.timer), label: 'Timer 1' }] : [])
    }));

    const thumbnailUrl = await ensureThumbnailUrl();

    // Build video_url: prefer CF Stream, upload to Supabase if CF is not configured, fall back to local blob
    let videoUrl = null;
    if (uploadedVideoUID) {
      videoUrl = `https://videodelivery.net/${uploadedVideoUID}/manifest/video.m3u8`;
    } else if (uploadedFile) {
      if (btn) btn.textContent = 'Uploading video file...';
      try {
        const { uploadVideo } = await import('./supabase-client.js');
        const supabaseUrl = await uploadVideo(uploadedFile, currentUser.email);
        if (supabaseUrl) {
          videoUrl = supabaseUrl;
        }
      } catch (upErr) {
        console.error('Supabase video upload failed:', upErr);
        showTip('⚠️ Supabase Video upload failed. Please ensure you have created a public bucket named "videos" in your Supabase dashboard.');
        throw new Error('Supabase video upload failed: ' + upErr.message);
      }
    } else if (editingRecipeId && playerCurrentRecipe) {
      // Preserve existing video URL
      videoUrl = playerCurrentRecipe.video_url || null;
    } else {
      // No video uploaded (remix or empty)
      videoUrl = null;
    }

    let savedRecipe;
    if (editingRecipeId) {
      const { updateRecipe } = await import('./supabase-client.js');
      
      const updates = {
        title,
        duration,
        steps,
        loops,
        video_url:        videoUrl,
        thumbnail_url:    thumbnailUrl,
        private_recipe:   !createIsPublic,
        is_published:     createIsPublic,
        shared_on_profile: createIsPublic,
        text_overlays:    cachedSegments || [],
        folder_id:        targetFolderId,
      };
      
      if (window._aiIngredients) updates.ingredients = window._aiIngredients;
      
      savedRecipe = await updateRecipe(editingRecipeId, updates);
      showTip('Changes saved successfully! 💾');
    } else {
      savedRecipe = await createRecipe({
        title,
        creator:          currentUser.email,
        duration,
        steps,
        loops,
        video_url:        videoUrl,
        thumbnail_url:    thumbnailUrl,
        private_recipe:   !createIsPublic,
        is_published:     createIsPublic,
        shared_on_profile: createIsPublic,
        ingredients:      window._aiIngredients || '',
        text_overlays:    cachedSegments || [],
        folder_id:        targetFolderId,
      });
    }

    // If user chose a folder, add the recipe to it in localStorage
    if (targetFolderId && savedRecipe && savedRecipe.id) {
      try {
        const _raw = localStorage.getItem('cookingGPS_library_v1');
        const _lib = _raw ? JSON.parse(_raw) : { folders: [], customOrder: [] };
        const _f   = (_lib.folders || []).find(f => f.id === targetFolderId);
        if (_f) {
          if (!_f.recipeIds) _f.recipeIds = [];
          if (!_f.recipeIds.includes(savedRecipe.id)) _f.recipeIds.push(savedRecipe.id);
          localStorage.setItem('cookingGPS_library_v1', JSON.stringify(_lib));
        }
      } catch {}
    }
    document.getElementById('createStage2').style.display = 'none';
    document.body.classList.remove('mobile-editing-active');
    showStage3WithFolderPicker(savedRecipe, createIsPublic);
    showTip('"' + title + '" saved!');

  } catch (err) {
    console.error('Save error:', err);
    showTip('Could not save: ' + (err.message || 'Unknown error'));
    if (btn) { btn.disabled = false; btn.textContent = '✅ Save Recipe'; }
  }
};

// ── Stage 3: simple success screen ─────────────────────────────────
let _lastSavedRecipeId    = null;
let _lastSavedRecipeTitle = '';

function showStage3WithFolderPicker(recipe, isPublic) {
  _lastSavedRecipeId    = recipe ? recipe.id : null;
  _lastSavedRecipeTitle = recipe ? recipe.title : 'Recipe';

  const stage3 = document.getElementById('createStage3');
  if (!stage3) return;
  stage3.style.display = 'block';

  const v = isPublic
    ? '<span style="color:#22c55e;font-weight:700;">&#x1F30E; Public</span> — visible on Discover and your profile'
    : '<span style="color:#4a90d9;font-weight:700;">&#x1F512; Private</span> — only you can see this';

  stage3.innerHTML =
    '<div style="font-size:4rem;margin-bottom:0.75rem;">&#x1F389;</div>'
    + '<h2 style="font-size:1.6rem;font-weight:900;color:var(--text-heading);margin-bottom:0.5rem;">Recipe Saved!</h2>'
    + '<p style="color:var(--text-muted);font-weight:600;margin-bottom:2rem;font-size:0.9rem;">' + v + '</p>'
    + '<div style="display:flex;gap:0.75rem;justify-content:center;flex-wrap:wrap;">'
    + '<button onclick="switchView(\'grid-view\')" class="btn btn-primary" style="border-radius:999px;padding:12px 28px;">&#x1F4DA; View in Library</button>'
    + '<button onclick="resetCreateView()" class="btn" style="border-radius:999px;padding:12px 28px;">&#x2795; Upload Another</button>'
    + '</div>';
}



window.addNewlySavedToFolder   = function() {};
window.createAndAddToNewFolder = function() {};


window.resetCreateView = function() {
  if (typeof window.closeAllMobileDrawers === 'function') {
    window.closeAllMobileDrawers();
  }
  editingRecipeId  = null;
  uploadedVideoUID = null;
  localVideoURL    = null;
  uploadedFile     = null;
  cachedTranscript = null;
  cachedSegments   = null;
  createStepsArr   = [];
  createIsPublic   = false;

  const videoEl = document.getElementById('uploadedVideoPlayer');
  if (videoEl) videoEl.src = '';

  document.getElementById('createStage1').style.display    = 'block';
  document.getElementById('createStage2').style.display    = 'none';
  document.body.classList.remove('mobile-editing-active');
  document.getElementById('createStage3').style.display    = 'none';
  document.getElementById('uploadProgressWrap').style.display = 'none';
  document.getElementById('uploadProgressBar').style.width = '0%';
  document.getElementById('uploadProgressBar').style.background = 'linear-gradient(90deg,var(--primary),#6aaee8)';
  document.getElementById('newRecipeTitleInput').value = '';

  const coverInput = document.getElementById('newRecipeCoverInput');
  if (coverInput) coverInput.value = '';
  window.updateCoverPreviewFromUrl('');
  const statusEl = document.getElementById('coverUploadStatus');
  if (statusEl) statusEl.textContent = 'Captured from video or custom';

  // Reset AI section
  document.getElementById('aiStatus').style.display       = 'none';
  document.getElementById('transcriptPreview').style.display = 'none';
  document.getElementById('aiActions').style.display      = 'none';
  document.getElementById('ingredientsResult').style.display = 'none';
  document.getElementById('stepsTextResult').style.display   = 'none';
  document.getElementById('transcribeBtn').disabled       = false;
  document.getElementById('transcribeBtn').textContent    = '🎤 Step 1: Transcribe Video';

  const toggle = document.getElementById('privacyToggle');
  const thumb  = document.getElementById('privacyThumb');
  const label  = document.getElementById('privacyLabel');
  if (toggle) toggle.style.background = '#e0eaf4';
  if (thumb)  thumb.style.left        = '2px';
  if (label)  label.textContent       = '🔒 Private — only you can see this';

  const fi = document.getElementById('videoFileInput');
  if (fi) fi.value = '';
};

// ============================================================
// PHASE 4 — AI FEATURES
// ============================================================
let uploadedFile     = null;   // original File object (for Whisper)
let cachedTranscript = null;   // cached so we never transcribe twice
let cachedSegments   = null;   // timestamped segments from Whisper

// ── Helper: Align manual edits to the transcript textbox back to time segments ──
window.alignTranscriptEditsToSegments = function(newTranscript) {
  if (!cachedSegments || !cachedSegments.length) return;
  
  const newWords = newTranscript.trim().split(/\s+/).filter(Boolean);
  if (!newWords.length) {
    cachedSegments.forEach(s => { s.text = ""; });
    return;
  }

  const origWordCounts = cachedSegments.map(s => (s.text || "").trim().split(/\s+/).filter(Boolean).length);
  const totalOrigWords = origWordCounts.reduce((a, b) => a + b, 0);

  if (totalOrigWords === 0) {
    const wordsPerSeg = Math.ceil(newWords.length / cachedSegments.length);
    cachedSegments.forEach((s, idx) => {
      s.text = newWords.slice(idx * wordsPerSeg, (idx + 1) * wordsPerSeg).join(' ');
    });
    return;
  }

  let wordIdx = 0;
  cachedSegments.forEach((s, idx) => {
    if (idx === cachedSegments.length - 1) {
      s.text = newWords.slice(wordIdx).join(' ');
    } else {
      const share = origWordCounts[idx] / totalOrigWords;
      const count = Math.max(0, Math.round(share * newWords.length));
      s.text = newWords.slice(wordIdx, wordIdx + count).join(' ');
      wordIdx += count;
    }
  });
};

// Expose cachedTranscript to window for checklist and edit syncing
Object.defineProperty(window, 'cachedTranscript', {
  get() { return cachedTranscript; },
  set(val) {
    cachedTranscript = val;
    if (typeof window.alignTranscriptEditsToSegments === 'function') {
      window.alignTranscriptEditsToSegments(val || '');
    }
    const textEl = document.getElementById('transcriptText');
    if (textEl) {
      if (textEl.tagName === 'TEXTAREA' || textEl.tagName === 'INPUT') {
        if (textEl.value !== val) textEl.value = val || '';
      } else {
        if (textEl.textContent !== val) textEl.textContent = val || '';
      }
    }
    if (typeof window.updateAIChecklists === 'function') {
      window.updateAIChecklists();
    }
  }
});

// Store the file when user picks it (called in handleFileSelect)
// We patch handleFileSelect to also save uploadedFile
const _origHandleFileSelect = window.handleFileSelect;
window.handleFileSelect = async function(file) {
  uploadedFile     = file;       // save for AI
  cachedTranscript = null;       // clear any previous cache
  cachedSegments   = null;
  return _origHandleFileSelect(file);
};

// ── Helper: Set visual loading or success state for guidelines chatbox ──────
window.setChatboxLoading = function(isLoading, isSuccess) {
  const prompts = document.querySelectorAll('#aiTweakPrompt');
  const buttons = document.querySelectorAll('.ai-tweak-send-btn');

  prompts.forEach(p => {
    if (isLoading) {
      p.classList.add('chatbox-textarea-loading');
      p.disabled = true;
    } else {
      p.classList.remove('chatbox-textarea-loading');
      p.disabled = false;
    }
  });

  const planeSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
    <line x1="22" y1="2" x2="11" y2="13"></line>
    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
  </svg>`;

  const spinnerSvg = `<svg class="spinner-icon" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
    <line x1="12" y1="2" x2="12" y2="6"></line>
    <line x1="12" y1="18" x2="12" y2="22"></line>
    <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line>
    <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line>
    <line x1="2" y1="12" x2="6" y2="12"></line>
    <line x1="18" y1="12" x2="22" y2="12"></line>
    <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line>
    <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>
  </svg>`;

  const successCheck = `<span style="color: #ffffff; font-weight: 900; font-size: 0.85rem; display: flex; align-items: center; justify-content: center; line-height: 1;">✓</span>`;

  buttons.forEach(btn => {
    if (isLoading) {
      btn.innerHTML = spinnerSvg;
      btn.style.pointerEvents = 'none';
    } else {
      btn.style.pointerEvents = 'auto';
      if (isSuccess) {
        btn.innerHTML = successCheck;
        const origBg = btn.style.background;
        btn.style.background = 'linear-gradient(135deg, #16a34a, #22c55e)';
        setTimeout(() => {
          btn.innerHTML = planeSvg;
          btn.style.background = origBg;
        }, 2000);
      } else {
        btn.innerHTML = planeSvg;
      }
    }
  });
};

// ── Helper: Show action choice popup for guidelines chatbox ────────────────
window.showChatboxActionMenu = function(triggerEl) {
  const parent = triggerEl.closest('div');
  if (!parent) return;

  // If menu already exists, toggle off
  let existingMenu = parent.querySelector('.chatbox-action-menu');
  if (existingMenu) {
    existingMenu.remove();
    return;
  }

  // Create menu wrapper
  const menu = document.createElement('div');
  menu.className = 'chatbox-action-menu';
  
  // Custom styles for dropdown (incorporating HSL theme and premium details)
  menu.style.position = 'absolute';
  menu.style.top = '100%';
  menu.style.right = '0';
  menu.style.left = '0';
  menu.style.marginTop = '6px';
  menu.style.background = 'rgba(255, 255, 255, 0.96)';
  menu.style.backdropFilter = 'blur(16px)';
  menu.style.webkitBackdropFilter = 'blur(16px)';
  menu.style.border = '1px solid rgba(124, 58, 237, 0.25)';
  menu.style.borderRadius = '12px';
  menu.style.boxShadow = '0 12px 30px -4px rgba(124, 58, 237, 0.15), 0 8px 16px -6px rgba(0, 0, 0, 0.1)';
  menu.style.zIndex = '9999';
  menu.style.display = 'flex';
  menu.style.flexDirection = 'column';
  menu.style.overflow = 'hidden';
  menu.style.padding = '5px';
  menu.style.gap = '3px';

  // Option list
  const options = [
    {
      label: '🔁 Create Steps from Analyzing Video',
      desc: 'Starts full video analysis using Gemini (slow: 30-50s)',
      action: 'loops'
    },
    {
      label: '📋 Edit Step Instructions with AI',
      desc: 'Refine steps text using your guidelines (fast: 1-3s)',
      action: 'steps'
    },
    {
      label: '🍳 Edit Ingredients List with AI',
      desc: 'Refine ingredients using your guidelines (fast: 1-3s)',
      action: 'ingredients'
    },
    {
      label: '🎤 Edit Video Transcript with AI',
      desc: 'Refine raw transcript text using your guidelines (fast: 1-3s)',
      action: 'transcript'
    }
  ];

  options.forEach(opt => {
    const item = document.createElement('button');
    item.type = 'button';
    item.style.background = 'transparent';
    item.style.border = 'none';
    item.style.borderRadius = '8px';
    item.style.padding = '8px 12px';
    item.style.textAlign = 'left';
    item.style.cursor = 'pointer';
    item.style.display = 'flex';
    item.style.flexDirection = 'column';
    item.style.transition = 'all 0.15s ease';
    
    const title = document.createElement('span');
    title.textContent = opt.label;
    title.style.fontWeight = '800';
    title.style.fontSize = '0.74rem';
    title.style.color = '#7c3aed';
    title.style.fontFamily = 'var(--font)';
    
    const desc = document.createElement('span');
    desc.textContent = opt.desc;
    desc.style.fontSize = '0.6rem';
    desc.style.color = '#6b7280';
    desc.style.fontFamily = 'var(--font)';
    desc.style.marginTop = '2px';

    item.appendChild(title);
    item.appendChild(desc);

    item.addEventListener('mouseenter', () => {
      item.style.background = 'rgba(124, 58, 237, 0.08)';
      title.style.color = '#4f46e5';
    });
    item.addEventListener('mouseleave', () => {
      item.style.background = 'transparent';
      title.style.color = '#7c3aed';
    });

    item.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.remove();
      document.removeEventListener('click', closeMenuHandler);
      
      // Execute the requested handler
      if (opt.action === 'loops') {
        doItAll();
      } else if (opt.action === 'steps') {
        window.editStepsWithAI();
      } else if (opt.action === 'ingredients') {
        window.editIngredientsWithAI();
      } else if (opt.action === 'transcript') {
        window.editTranscriptWithAI();
      }
    });

    menu.appendChild(item);
  });

  parent.appendChild(menu);

  // Close menu when clicking outside
  function closeMenuHandler(e) {
    if (!parent.contains(e.target)) {
      menu.remove();
      document.removeEventListener('click', closeMenuHandler);
    }
  }

  setTimeout(() => {
    document.addEventListener('click', closeMenuHandler);
  }, 10);
};

// ── Helper: set AI status message ──────────────────────────────────────────
function setAIStatus(msg, show = true) {
  const el = document.getElementById('aiStatus');
  const tx = document.getElementById('aiStatusText');
  if (el) el.style.display = show ? 'block' : 'none';
  if (tx) tx.textContent   = msg;
}

window.getTranscriptForTimeRange = function(startTime, endTime) {
  if (!cachedSegments || !cachedSegments.length) return "";
  
  let matchingWords = [];
  
  // Sort segments by start time to keep word sequence correct
  const sortedSegments = [...cachedSegments].sort((a, b) => {
    const startA = Number(a.start ?? a.startTime ?? a.start_time) || 0;
    const startB = Number(b.start ?? b.startTime ?? b.start_time) || 0;
    return startA - startB;
  });

  sortedSegments.forEach(s => {
    const start = Number(s.start ?? s.startTime ?? s.start_time) || 0;
    const end = Number(s.end ?? s.endTime ?? s.end_time) || (start + 5);
    const duration = end - start;
    if (duration <= 0) return;
    
    // Check if there is any overlap at all between segment and step timeframe
    const overlapStart = Math.max(start, startTime);
    const overlapEnd = Math.min(end, endTime);
    if (overlapStart >= overlapEnd) return;
    
    const words = s.text.trim().split(/\s+/).filter(Boolean);
    if (!words.length) return;
    
    words.forEach((word, idx) => {
      // Estimate when this specific word was spoken within the segment
      const wordTime = start + (idx / words.length) * duration;
      // Assign the word to this step if it falls within the step boundaries
      if (wordTime >= startTime && wordTime <= endTime + 0.01) {
        matchingWords.push(word);
      }
    });
  });
  
  return matchingWords.join(' ');
};

window.getTranscriptForSteps = function(steps) {
  if (!cachedSegments || !cachedSegments.length) {
    return steps.map(() => "");
  }

  // Sort steps by start time to ensure correct contiguous ranges
  const sortedSteps = [...steps].sort((a, b) => (Number(a.time) || 0) - (Number(b.time) || 0));

  // Generate transcripts for each sorted step
  const transcriptsMap = new Map();
  sortedSteps.forEach((step, idx) => {
    const stepStart = Number(step.time) || 0;
    const stepEnd = Number(sortedSteps[idx + 1]?.time) || videoDuration;

    // Use the word-by-word precision helper for this contiguous partition range
    const transcript = window.getTranscriptForTimeRange(stepStart, stepEnd);
    transcriptsMap.set(step, transcript);
  });

  // Return transcripts in the original order of steps
  return steps.map(step => transcriptsMap.get(step) || "");
};

window.parseTimerFromText = function(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  
  // Match patterns like "20 minutes", "10 min", "1 hour", "1.5 hours", "45 seconds", "20-30 minutes"
  const regex = /(\d+(?:\.\d+)?)\s*(hour|hr|minute|min|second|sec)s?\b/g;
  let match;
  let totalSeconds = 0;
  
  while ((match = regex.exec(lower)) !== null) {
    const value = parseFloat(match[1]);
    const unit = match[2];
    
    if (unit.startsWith('hour') || unit.startsWith('hr')) {
      totalSeconds += value * 3600;
    } else if (unit.startsWith('minute') || unit.startsWith('min')) {
      totalSeconds += value * 60;
    } else if (unit.startsWith('second') || unit.startsWith('sec')) {
      totalSeconds += value;
    }
  }
  
  if (totalSeconds > 0) return totalSeconds;

  // Word fallbacks
  if (lower.includes('half an hour') || lower.includes('half-hour')) {
    return 1800;
  }
  if (lower.includes('a minute') || lower.includes('one minute')) {
    return 60;
  }
  if (lower.includes('an hour') || lower.includes('one hour')) {
    return 3600;
  }
  
  return null;
};

window.parseMultipleTimersFromText = function(text) {
  if (!text) return [];
  const timers = [];
  const lower = text.toLowerCase();
  
  // Clean sentences/clauses
  const clauses = text.split(/[.;,\n]/);
  for (let clause of clauses) {
    clause = clause.trim();
    if (!clause) continue;
    
    // Pattern to match digits followed by hour/minute/second
    const regex = /(\b[\w\s-]{1,30})?\b(\d+(?:\.\d+)?)\s*(hour|hr|minute|min|second|sec)s?\b/i;
    const match = clause.match(regex);
    if (match) {
      const prefix = (match[1] || '').trim();
      const value = parseFloat(match[2]);
      const unit = match[3].toLowerCase();
      
      let duration = 0;
      if (unit.startsWith('hour') || unit.startsWith('hr')) {
        duration = value * 3600;
      } else if (unit.startsWith('minute') || unit.startsWith('min')) {
        duration = value * 60;
      } else if (unit.startsWith('second') || unit.startsWith('sec')) {
        duration = value;
      }
      
      if (duration > 0) {
        let label = '';
        const keywords = ['bake', 'simmer', 'boil', 'rest', 'cook', 'heat', 'roast', 'fry', 'sear', 'chill', 'freeze', 'cool', 'steam', 'whisk', 'knead', 'rise', 'proof', 'steep', 'microwave', 'sauté', 'saute', 'cover'];
        
        // Find keyword in prefix first
        let foundKeyword = keywords.find(k => prefix.toLowerCase().includes(k));
        if (foundKeyword) {
          const idx = prefix.toLowerCase().indexOf(foundKeyword);
          label = prefix.substring(idx).replace(/\s+for\s*$/i, '').trim();
          if (label.length > 25) label = label.substring(0, 25) + '...';
          label = label.charAt(0).toUpperCase() + label.slice(1);
        } else {
          // Look in active clause
          foundKeyword = keywords.find(k => clause.toLowerCase().includes(k));
          if (!foundKeyword) {
            // Look in the entire instruction text
            foundKeyword = keywords.find(k => lower.includes(k));
          }
          
          if (foundKeyword) {
            label = foundKeyword.charAt(0).toUpperCase() + foundKeyword.slice(1);
          } else if (prefix && !['about', 'around', 'for', 'approx', 'approximately', 'another'].includes(prefix.toLowerCase())) {
            label = prefix.replace(/\s+for\s*$/i, '').trim();
            if (label.length > 20) label = label.substring(0, 20) + '...';
            label = label.charAt(0).toUpperCase() + label.slice(1);
          }
        }
        
        if (!label || label.toLowerCase() === 'timer' || label === 'For') {
          label = `Timer ${timers.length + 1}`;
        }
        
        if (!timers.some(t => t.duration === duration && t.label === label)) {
          timers.push({ duration, label });
        }
      }
    }
  }
  
  // Word fallbacks if nothing matched
  if (timers.length === 0) {
    if (lower.includes('half an hour') || lower.includes('half-hour')) {
      timers.push({ duration: 1800, label: 'Rest/Bake' });
    } else if (lower.includes('a minute') || lower.includes('one minute')) {
      timers.push({ duration: 60, label: 'Timer 1' });
    } else if (lower.includes('an hour') || lower.includes('one hour')) {
      timers.push({ duration: 3600, label: 'Timer 1' });
    }
  }
  
  return timers;
};

// ── Step 1: Transcribe ─────────────────────────────────────────────────────
window.transcribeVideo = async function() {
  if (typeof checkForceFreshAI === 'function') {
    checkForceFreshAI();
  }
  if (!uploadedFile) {
    showTip('Upload a video first before transcribing.');
    return;
  }

  // Use cache if already transcribed
  if (cachedTranscript) {
    showTip('Already transcribed! Use the buttons below to generate content.');
    return;
  }

  const btn = document.getElementById('transcribeBtn');

  async function transcribeWithGeminiFallback(reason) {
    console.log('[AI] Running Gemini transcription fallback due to:', reason);
    showTip('Using Gemini to analyze video and extract subtitles... 🚀');
    setAIStatus('🤖 Video analyze/transcribe via Gemini...', true);
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Transcribing (Gemini)...'; }
    try {
      const gem = await tryGeminiFor('transcribe');
      if (gem && Array.isArray(gem.text_overlays) && gem.text_overlays.length > 0) {
        cachedSegments = gem.text_overlays;
        cachedTranscript = gem.text_overlays.map(s => s.text).join(' ');

        // If Gemini returned title, loops, steps, copy them to createStepsArr if empty
        if (gem.loops && gem.loops.length > 0 && createStepsArr.length === 0) {
          if (gem.title) {
            const t = document.getElementById('newRecipeTitleInput');
            if (t && !t.value) t.value = gem.title;
          }
          createStepsArr = gem.loops.map((l, i) => {
            const t   = Number(l.start ?? l.time) || 0;
            const end = (l.end ?? l.endTime) != null ? Number(l.end ?? l.endTime) : null;
            const mm  = Math.floor(t / 60);
            const ss  = Math.floor(t % 60).toString().padStart(2, '0');
            
            const nextStart = gem.loops[i+1]?.start ?? gem.loops[i+1]?.time ?? videoDuration;
            const wordForWordDesc = window.getTranscriptForTimeRange(t, end ?? nextStart);
            const rawDesc = l.instruction || wordForWordDesc || gem.steps?.[i] || '';
            const detectedTimer = window.parseTimerFromText(rawDesc);

            return {
              time: t,
              endTime: end,
              label: l.label || `Step ${i+1}`,
              description: rawDesc,
              ingredients: l.ingredients || [],
              displayTime: `${mm}:${ss}`,
              timer: detectedTimer
            };
          }).sort((a, b) => a.time - b.time);
          renderCreateSteps();
          renderTimeline();
        }

        // Show transcript preview
        const preview = document.getElementById('transcriptPreview');
        const textEl  = document.getElementById('transcriptText');
        if (preview) preview.style.display = 'block';
        if (textEl)  textEl.textContent    = cachedTranscript;

        // Show AI action buttons
        const actions = document.getElementById('aiActions');
        if (actions) actions.style.display = 'block';

        setAIStatus('✅ Subtitles transcribed by Gemini! Play video to view.', true);
        if (btn) { btn.disabled = false; btn.textContent = '✅ Transcribed (Gemini)'; }
        showTip('Transcription complete!');
        if (typeof window.updateAIChecklists === 'function') window.updateAIChecklists();
      } else {
        throw new Error('Gemini model did not return any subtitle text.');
      }
    } catch (gemErr) {
      console.error('[AI] Gemini fallback failed:', gemErr);
      setAIStatus('❌ Transcription failed: ' + gemErr.message);
      if (btn) { btn.disabled = false; btn.textContent = '🎤 Transcribe audio only'; }
      showTip('Transcription failed: ' + gemErr.message);
      throw gemErr;
    }
  }

  if (uploadedFile.size > 25 * 1024 * 1024) {
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Uploading large video...'; }
    setAIStatus('📤 Uploading large video to Supabase Storage for transcription...', true);
    showTip('Uploading large video (>25MB) to Supabase Storage so Replicate can transcribe it... 🚀');
    
    try {
      const { uploadVideo } = await import('./supabase-client.js');
      const supabaseUrl = await uploadVideo(uploadedFile, currentUser?.email || 'anon');
      
      if (btn) { btn.disabled = true; btn.textContent = '⏳ Transcribing (Replicate)...'; }
      setAIStatus('🤖 Running Whisper on Replicate...', true);
      showTip('Transcribing video via Whisper on Replicate...');
      
      const repRes = await fetch('/api/ai/replicate-transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoUrl: supabaseUrl })
      });
      const repData = await repRes.json();
      if (!repRes.ok || repData.error) throw new Error(repData.error || 'Replicate transcribe failed');
      
      cachedTranscript = repData.transcript;
      cachedSegments = repData.segments || [];
      
      // Show transcript preview
      const preview = document.getElementById('transcriptPreview');
      const textEl  = document.getElementById('transcriptText');
      if (preview) preview.style.display = 'block';
      if (textEl)  textEl.textContent    = cachedTranscript;
  
      // Show AI action buttons
      const actions = document.getElementById('aiActions');
      if (actions) actions.style.display = 'block';
  
      setAIStatus('✅ Transcription done via Replicate Whisper! Play video to view subtitles.', true);
      if (btn) { btn.disabled = false; btn.textContent = '✅ Transcribed'; }
      showTip('Transcription complete! Play video to view subtitles.');
      if (typeof window.updateAIChecklists === 'function') window.updateAIChecklists();
    } catch (err) {
      console.warn('[AI] Replicate Whisper failed, trying Gemini fallback...', err.message);
      await transcribeWithGeminiFallback(err.message);
    }
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = '⏳ Transcribing...'; }
  setAIStatus('🎤 Sending to OpenAI Whisper...');

  try {
    const formData = new FormData();
    formData.append('video', uploadedFile, uploadedFile.name);

    const res  = await fetch('/api/transcribe', { method: 'POST', body: formData });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    // Cache the transcript and segments
    cachedTranscript = data.transcript;
    cachedSegments   = data.segments || [];

    // Show transcript preview
    const preview = document.getElementById('transcriptPreview');
    const textEl  = document.getElementById('transcriptText');
    if (preview) preview.style.display = 'block';
    if (textEl)  textEl.textContent    = cachedTranscript;

    // Show AI action buttons
    const actions = document.getElementById('aiActions');
    if (actions) actions.style.display = 'block';

    setAIStatus('✅ Transcription done! Play video to view subtitles.');
    if (btn) { btn.disabled = false; btn.textContent = '✅ Transcribed'; }
    showTip('Transcription complete! Play video to view subtitles.');
    if (typeof window.updateAIChecklists === 'function') window.updateAIChecklists();
  } catch (err) {
    console.warn('[AI] Whisper transcription failed, trying Gemini fallback...', err.message);
    await transcribeWithGeminiFallback(err.message);
  }
};

// ── AI: Edit/refine transcript with custom guidelines ──────────────────────
window.editTranscriptWithAI = async function() {
  const tweak = document.getElementById('aiTweakPrompt')?.value?.trim();
  if (!tweak) {
    showTip('Type your edit instructions in the guidelines box first! ✏️');
    return;
  }
  
  const currentText = document.getElementById('transcriptText')?.textContent?.trim() || cachedTranscript;
  if (!currentText) {
    showTip('Please transcribe the video first! 🎤');
    return;
  }

  const btn = document.getElementById('aiEditTranscriptBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ Editing...';
  }
  setAIStatus('🪄 Editing transcript via Gemini...', true);
  showTip('Refining transcript with your instructions... 🪄');
  window.setChatboxLoading(true);

  try {
    const res = await fetch('/api/ai/edit-transcript', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript: currentText, prompt: tweak }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    // Update transcript
    window.cachedTranscript = data.transcript;
    
    showTip('🪄 Transcript updated successfully!');
    setAIStatus('✅ Transcript refined by AI!');
    window.setChatboxLoading(false, true);
  } catch (err) {
    console.error('[AI] Transcript edit failed:', err);
    setAIStatus('❌ Edit failed: ' + err.message);
    showTip('Edit failed: ' + err.message);
    window.setChatboxLoading(false, false);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '🪄 AI Edit';
    }
  }
};

// ── AI: Edit/refine steps with custom guidelines ──────────────────────
window.editStepsWithAI = async function() {
  const tweak = document.getElementById('aiTweakPrompt')?.value?.trim();
  if (!tweak) {
    showTip('Type your edit instructions in the guidelines box first! ✏️');
    return;
  }
  
  const stepsBox = document.getElementById('stepsText');
  const currentText = stepsBox?.value?.trim();
  if (!currentText) {
    showTip('Generate or write step instructions first! 📋');
    return;
  }

  const btn = document.getElementById('aiEditStepsBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ Editing...';
  }
  setAIStatus('🪄 Editing steps via Gemini...', true);
  showTip('Refining step instructions with your guidelines... 🪄');
  window.setChatboxLoading(true);

  try {
    const res = await fetch('/api/ai/edit-steps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ steps: currentText, prompt: tweak }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    // Update steps textbox
    if (stepsBox) stepsBox.value = data.steps;
    window._aiStepsText = data.steps;
    
    showTip('🪄 Steps updated successfully!');
    setAIStatus('✅ Steps refined by AI!');
    window.setChatboxLoading(false, true);
  } catch (err) {
    console.error('[AI] Steps edit failed:', err);
    setAIStatus('❌ Edit failed: ' + err.message);
    showTip('Edit failed: ' + err.message);
    window.setChatboxLoading(false, false);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '🪄 AI Edit';
    }
  }
};

// ── AI: Edit/refine ingredients with custom guidelines ──────────────────────
window.editIngredientsWithAI = async function() {
  const tweak = document.getElementById('aiTweakPrompt')?.value?.trim();
  if (!tweak) {
    showTip('Type your edit instructions in the guidelines box first! ✏️');
    return;
  }
  
  const ingBox = document.getElementById('ingredientsText');
  const currentText = ingBox?.value?.trim();
  if (!currentText) {
    showTip('Generate or write ingredients first! 🍳');
    return;
  }

  const btn = document.getElementById('aiEditIngredientsBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ Editing...';
  }
  setAIStatus('🪄 Editing ingredients via Gemini...', true);
  showTip('Refining ingredients list with your guidelines... 🪄');
  window.setChatboxLoading(true);

  try {
    const res = await fetch('/api/ai/edit-ingredients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ingredients: currentText, prompt: tweak }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    // Update ingredients textbox
    if (ingBox) ingBox.value = data.ingredients;
    
    showTip('🪄 Ingredients updated successfully!');
    setAIStatus('✅ Ingredients refined by AI!');
    if (typeof window.updateAIChecklists === 'function') window.updateAIChecklists();
    window.setChatboxLoading(false, true);
  } catch (err) {
    console.error('[AI] Ingredients edit failed:', err);
    setAIStatus('❌ Edit failed: ' + err.message);
    showTip('Edit failed: ' + err.message);
    window.setChatboxLoading(false, false);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '🪄 AI Edit';
    }
  }
};

// ── Generate ingredients ───────────────────────────────────────────────────
window.generateIngredients = async function() {
  if (!cachedTranscript) { showTip('Transcribe the video first!'); return; }
  setAIStatus('✍️ Writing ingredients...');

  try {
    const res  = await fetch('/api/ai/ingredients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript: cachedTranscript }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    const result = document.getElementById('ingredientsResult');
    const text   = document.getElementById('ingredientsText');
    if (result) result.style.display = 'block';
    if (text)   text.value           = data.ingredients;

    setAIStatus('✅ Ingredients written — edit them above!');
    showTip('Ingredients generated! Edit them if needed.');
  } catch (err) {
    setAIStatus('❌ ' + err.message);
    showTip('Failed: ' + err.message);
  }
};

// ── Generate written steps ─────────────────────────────────────────────────
window.generateSteps = async function() {
  if (!cachedTranscript) { showTip('Transcribe the video first!'); return; }
  setAIStatus('📋 Writing step instructions...');

  try {
    const res  = await fetch('/api/ai/steps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript: cachedTranscript }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    const result = document.getElementById('stepsTextResult');
    const text   = document.getElementById('stepsText');
    if (result) result.style.display = 'block';
    if (text)   text.value           = data.steps;

    setAIStatus('✅ Step instructions written — edit them above!');
    showTip('Step instructions generated! Edit them if needed.');
  } catch (err) {
    setAIStatus('❌ ' + err.message);
    showTip('Failed: ' + err.message);
  }
};

// ── Auto-add loop markers from AI ──────────────────────────────────────────
window.generateLoops = async function() {
  if (!cachedTranscript) { showTip('Transcribe the video first!'); return; }
  setAIStatus('🔁 Detecting step timestamps...');

  const tweak = document.getElementById('aiTweakPrompt')?.value?.trim() || null;

  try {
    const res  = await fetch('/api/ai/loops', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript: cachedTranscript, segments: cachedSegments, prompt: tweak }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    const loops = data.loops || [];
    if (!loops.length) {
      setAIStatus('⚠️ No steps detected — try adding them manually.');
      return;
    }

    // Replace timeline steps with AI-detected ones (with start AND end times)
    const sortedLoops = loops.map((l, idx) => ({
      time: Number(l.time) || 0,
      endTime: l.endTime != null ? Number(l.endTime) : null,
      label: l.label || `Step ${idx+1}`,
      instruction: l.instruction,
      description: l.description
    })).sort((a, b) => a.time - b.time);

    const transcripts = window.getTranscriptForSteps(sortedLoops);

    createStepsArr = sortedLoops.map((l, idx) => {
      const t   = l.time;
      const end = l.endTime;
      const m = Math.floor(t / 60);
      const s = Math.floor(t % 60).toString().padStart(2, '0');
      const rawDesc = transcripts[idx] || l.instruction || l.description || '';
      return {
        time:        t,
        endTime:     end,
        label:       l.label || 'Step',
        displayTime: `${m}:${s}`,
        description: rawDesc,
        ingredients: [],
        timers: undefined // force auto-detection of timers!
      };
    });

    renderCreateSteps();
    renderTimeline();

    setAIStatus(`✅ ${loops.length} steps placed on your timeline!`);
    showTip(`AI placed ${loops.length} loop markers — check your timeline!`);
  } catch (err) {
    setAIStatus('❌ ' + err.message);
    showTip('Failed: ' + err.message);
  }
};

// Force fresh AI helper (bypasses cache)
function checkForceFreshAI() {
  const checkbox = document.getElementById('aiForceFresh');
  if (checkbox && checkbox.checked) {
    _geminiCache = null;
    _geminiCacheFile = null;
    _geminiCacheTweak = null;
    _geminiCacheVideoOnly = false;
    cachedTranscript = null;
    cachedSegments = null;
    checkbox.checked = false; // reset after triggering
    console.log('[AI] Cache cleared for fresh generation');
  }
}

// ── On-demand Gemini — called once per file, result cached for all AI buttons ─
let _geminiCache     = null; // cached result for current file
let _geminiCacheFile = null; // which file was analyzed (detect new uploads)
let _geminiCacheTweak = null; // tweak prompt used for this cached result
let _geminiCacheVideoOnly = false; // whether it was analyzed as videoOnly

async function tryGeminiFor(task, videoOnly = false) {
  if (!uploadedFile) return null;

  const tweak = document.getElementById('aiTweakPrompt')?.value?.trim() || null;

  // Return cached result if same file, same tweak, and same videoOnly flag (free reuse)
  if (_geminiCache && _geminiCacheFile === uploadedFile && _geminiCacheTweak === tweak && _geminiCacheVideoOnly === videoOnly) {
    const hasLoops = Array.isArray(_geminiCache.loops) && _geminiCache.loops.length > 0;
    const hasTranscripts = Array.isArray(_geminiCache.text_overlays) && _geminiCache.text_overlays.length > 0;

    if (task === 'transcribe' && !hasTranscripts && !videoOnly) {
      console.log('[Gemini] Cache lacks transcripts, forcing fresh analysis');
    } else if (task === 'loops' && !hasLoops) {
      console.log('[Gemini] Cache lacks loops, forcing fresh analysis');
    } else {
      return _geminiCache;
    }
  }

  setAIStatus('🤖 Uploading to Gemini…', true);
  const formData = new FormData();
  formData.append('video', uploadedFile, uploadedFile.name);
  if (tweak) {
    formData.append('prompt', tweak);
  }
  if (videoOnly) {
    formData.append('videoOnly', 'true');
  }

  const res  = await fetch('/api/ai/gemini-analyze', { method: 'POST', body: formData });
  const data = await res.json();

  if (!res.ok || data.error) {
    // Throw the REAL server error so buttons can show it
    throw new Error(data.error || `Gemini server error (${res.status})`);
  }

  // Cache — subsequent taps reuse for free
  _geminiCache      = data;
  _geminiCacheFile  = uploadedFile;
  _geminiCacheTweak = tweak;
  _geminiCacheVideoOnly = videoOnly;
  return data;
}

// ── AI: Write Ingredients only ─────────────────────────────────────────────
window.aiWriteIngredients = async function() {
  if (typeof checkForceFreshAI === 'function') {
    checkForceFreshAI();
  }
  setAIStatus('✍️ Writing ingredients...', true);
  let gem = null;
  try {
    // Try Gemini first
    gem = await tryGeminiFor('ingredients');
  } catch (gemError) {
    console.warn('Gemini failed to write ingredients, trying Whisper fallback:', gemError);
  }

  try {
    if (gem?.ingredients?.length) {
      const box = document.getElementById('ingredientsText');
      if (box) box.value = gem.ingredients.join('\n');
      window._aiIngredients = gem.ingredients.join('\n');
      const r = document.getElementById('ingredientsResult');
      if (r) r.style.display = 'block';
      setAIStatus('✅ Ingredients written by Gemini!', true);
      showTip('✍️ Ingredients filled in — edit as needed.');
      if (typeof window.updateAIChecklists === 'function') window.updateAIChecklists();
      return;
    }
    // Fallback: Whisper → GPT
    if (!cachedTranscript) await window.transcribeVideo();
    if (!cachedTranscript) { setAIStatus('❌ Need transcript first — video may be over 25MB.', true); return; }
    await window.generateIngredients();
    setAIStatus('✅ Ingredients written!', true);
    if (typeof window.updateAIChecklists === 'function') window.updateAIChecklists();
  } catch (err) {
    setAIStatus('❌ ' + (err.message || 'Failed to write ingredients.'), true);
  }
};

// ── AI: Write Steps only ───────────────────────────────────────────────────
window.aiWriteSteps = async function() {
  if (typeof checkForceFreshAI === 'function') {
    checkForceFreshAI();
  }
  setAIStatus('📋 Writing step instructions...', true);
  let gem = null;
  try {
    // Try Gemini first
    gem = await tryGeminiFor('steps');
  } catch (gemError) {
    console.warn('Gemini failed to write steps, trying Whisper fallback:', gemError);
  }

  try {
    if (gem?.steps?.length) {
      const box = document.getElementById('stepsText');
      if (box) box.value = gem.steps.join('\n');
      window._aiStepsText = gem.steps.join('\n');
      const r = document.getElementById('stepsTextResult');
      if (r) r.style.display = 'block';
      setAIStatus('✅ Steps written by Gemini!', true);
      showTip('📋 Steps filled in — edit as needed.');
      return;
    }
    // Fallback: Whisper → GPT
    if (!cachedTranscript) await window.transcribeVideo();
    if (!cachedTranscript) { setAIStatus('❌ Need transcript first — video may be over 25MB.', true); return; }
    await window.generateSteps();
    setAIStatus('✅ Steps written!', true);
  } catch (err) {
    setAIStatus('❌ ' + (err.message || 'Failed to write steps.'), true);
  }
};

// ── AI: Write descriptions for each placed loop stop ──────────────────────
window.aiWriteStepDescriptions = async function() {
  if (!createStepsArr.length) {
    showTip('Add loop stops first, then tap Generate Steps.');
    return;
  }
  showTip('✍️ AI is writing descriptions for each loop stop…');

  const hasDescriptions = createStepsArr.some(s => s.description && s.description.trim().length > 0);
  const btnIds = ['aiGenerateStepsBtn', 'aiGenerateStepsBtnMobile'];
  const originalHtmls = {};
  btnIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      originalHtmls[id] = el.innerHTML;
      el.disabled = true;
      el.innerHTML = hasDescriptions ? '<span>⏳ Re-generating Steps...</span>' : '<span>⏳ Generating Steps...</span>';
    }
  });

  try {
    const steps = createStepsArr.map((s, i) => ({
      index: i,
      label: s.label,
      startTime: s.time,
      endTime: s.endTime ?? (createStepsArr[i + 1]?.time ?? videoDuration),
    }));
    const videoUrl = document.getElementById('uploadedVideoPlayer')?.src || window._uploadedVideoUrl || '';
    let descriptions = [];
    try {
      const res = await fetch('/api/ai/describe-steps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ steps, videoUrl, segments: cachedSegments }),
      });
      const data = await res.json();
      if (data.error) {
        console.warn('describe-steps returned error, using local transcript fallback:', data.error);
      } else {
        descriptions = data.descriptions || [];
      }
    } catch (describeErr) {
      console.warn('describe-steps API call failed, using local transcript fallback:', describeErr);
    }

    // Apply descriptions
    const transcripts = window.getTranscriptForSteps(createStepsArr);
    createStepsArr.forEach((step, i) => {
      const descText = descriptions[i] || '';
      let finalDesc = '';
      let parsedIngs = [];
      if (descText) {
        const parsed = window.parseDescriptionAndIngredients(descText, step.ingredients);
        finalDesc = parsed.description;
        parsedIngs = parsed.ingredients;
      }
      const wordForWordDesc = transcripts[i] || '';
      step.description = wordForWordDesc || finalDesc || step.description || '';
      if (parsedIngs.length > 0) {
        step.ingredients = parsedIngs;
      }
      delete step.timers; // force auto-detection on render!
    });
    renderCreateSteps();
    showTip('✅ Steps generated! Edit any card to customize.');
  } catch (err) {
    showTip('❌ ' + (err.message || 'Could not generate steps.'));
  } finally {
    btnIds.forEach(id => {
      const el = document.getElementById(id);
      if (el && originalHtmls[id] !== undefined) {
        el.disabled = false;
        el.innerHTML = originalHtmls[id];
      }
    });
    renderCreateSteps();
  }
};

// ── AI: Do Everything ──────────────────────────────────────────────────────
window.aiDoEverything = async function() {
  if (typeof checkForceFreshAI === 'function') {
    checkForceFreshAI();
  }
  setAIStatus('⚡ Running all AI features...', true);
  const btn = document.getElementById('aiLoopBtn');
  let gem = null;
  try {
    gem = await tryGeminiFor('all');
  } catch (gemError) {
    console.warn('Gemini failed in aiDoEverything, trying Whisper fallback:', gemError);
  }

  try {
    if (gem?.loops?.length) {
      // Apply all Gemini results
      if (gem.title) {
        const t = document.getElementById('newRecipeTitleInput');
        if (t && !t.value) t.value = gem.title;
      }
      if (gem.ingredients?.length) {
        const b = document.getElementById('ingredientsText');
        if (b) b.value = gem.ingredients.join('\n');
        window._aiIngredients = gem.ingredients.join('\n');
        const r = document.getElementById('ingredientsResult'); if (r) r.style.display='block';
      }
      if (gem.steps?.length) {
        const b = document.getElementById('stepsText');
        if (b) b.value = gem.steps.join('\n');
        window._aiStepsText = gem.steps.join('\n');
        const r = document.getElementById('stepsTextResult'); if (r) r.style.display='block';
      }
      if (Array.isArray(gem.text_overlays)) {
        cachedSegments = gem.text_overlays;
        cachedTranscript = gem.text_overlays.map(o => o.text).join(' ');
      }
      createStepsArr = gem.loops.map((l, i) => {
        const t   = Number(l.start ?? l.time) || 0;
        const end = (l.end ?? l.endTime) != null ? Number(l.end ?? l.endTime) : null;
        const mm  = Math.floor(t / 60);
        const ss  = Math.floor(t % 60).toString().padStart(2, '0');
        
        const nextStart = gem.loops[i+1]?.start ?? gem.loops[i+1]?.time ?? videoDuration;
        const wordForWordDesc = window.getTranscriptForTimeRange(t, end ?? nextStart);
        const rawDesc = l.instruction || wordForWordDesc || gem.steps?.[i] || '';
        return {
          time: t,
          endTime: end,
          label: l.label || `Step ${i+1}`,
          description: rawDesc,
          ingredients: l.ingredients || [],
          displayTime: `${mm}:${ss}`,
          timers: undefined // force auto-detection of timers!
        };
      }).sort((a, b) => a.time - b.time);
      renderCreateSteps(); renderTimeline();
      setAIStatus(`✅ Done! Gemini placed ${gem.loops.length} loops + wrote everything.`, true);
      showTip(`⚡ All done! ${gem.loops.length} loop stops placed.`);
      if (typeof window.collapseAiTools === 'function') window.collapseAiTools();
      return;
    }
    // Fallback: transcribe then run each
    if (!cachedTranscript) await window.transcribeVideo();
    if (cachedTranscript) {
      await window.generateIngredients();
      await window.generateSteps();
      await window.generateLoops();
      setAIStatus('✅ Done! Review the timeline.', true);
      showTip('⚡ AI completed all tasks!');
      if (typeof window.collapseAiTools === 'function') window.collapseAiTools();
    } else {
      setAIStatus('❌ Video too large for Whisper. Add your Gemini key to unlock large video support.', true);
    }
  } catch (err) {
    setAIStatus('❌ ' + (err.message || 'Error.'), true);
  }
};

// ── Place Loop Stops (primary AI button) ──────────────────────────────────
window.doItAll = async function() {
  if (typeof checkForceFreshAI === 'function') {
    checkForceFreshAI();
  }
  const btn = document.getElementById('aiLoopBtn');
  const overlayBtn = document.getElementById('overlayAiBtn');
  
  const setButtonsState = (disabled, text) => {
    if (btn) {
      btn.disabled = disabled;
      if (text) {
        btn.innerHTML = `<span>⏳</span><span>${text}</span>`;
      }
    }
    if (overlayBtn) {
      overlayBtn.disabled = disabled;
      if (disabled) {
        overlayBtn.style.opacity = '0.7';
        if (text) overlayBtn.innerHTML = `🤖 ${text}`;
      } else {
        overlayBtn.style.opacity = '1';
        overlayBtn.innerHTML = '⚡ AI Stops';
      }
    }
  };

  // Check if video is loaded first
  if (!uploadedFile) {
    setAIStatus('⚠️ Upload a video first.', true);
    showTip('Upload your video first, then tap the button.');
    setButtonsState(false);
    window.setChatboxLoading(false, false);
    return;
  }

  window.setChatboxLoading(true);
  
  try {
    // 1. Transcribe audio/video
    let textVal = document.getElementById('transcriptText')?.textContent?.trim() || cachedTranscript;
    if (!textVal) {
      setButtonsState(true, '1/3: Transcribing...');
      setAIStatus('🎤 Step 1/3: Generating video transcript...', true);
      showTip('🎤 Transcribing audio...');
      await window.transcribeVideo();
      
      textVal = document.getElementById('transcriptText')?.textContent?.trim() || cachedTranscript;
      if (!textVal) {
        throw new Error('Could not generate transcript. Please ensure the video has audio or try again.');
      }
      showTip('🎙️ Transcript successfully created!');
    } else {
      showTip('📖 Using current transcript to build steps...');
    }

    // 2. Detect loop stops from transcript
    setButtonsState(true, '2/3: Detecting loops...');
    setAIStatus('🔁 Step 2/3: Detecting precise loop stops...', true);
    showTip('🔁 Identifying step timestamps from speech...');
    await window.generateLoops();
    
    if (!createStepsArr.length) {
      throw new Error('No loop steps were detected from the audio transcript.');
    }

    // 3. Write descriptions & ingredients for these loop stops
    setButtonsState(true, '3/3: Writing steps...');
    setAIStatus('✍️ Step 3/3: Generating detailed instructions & ingredients...', true);
    showTip('✍️ Writing detailed instructions...');
    await window.aiWriteStepDescriptions();

    // Reset buttons and finalize
    if (btn) {
      btn.disabled = false;
      btn.style.background = 'linear-gradient(135deg,#16a34a,#22c55e)';
      btn.innerHTML = '<span>✅</span><span>Steps Created!</span>';
    }
    if (overlayBtn) {
      overlayBtn.disabled = false;
      overlayBtn.style.opacity = '1';
      overlayBtn.innerHTML = '⚡ AI Stops';
    }
    setAIStatus('✅ AI successfully created precisely-timed steps!', true);
    showTip('⚡ AI completed all tasks precisely aligned with audio!');
    window.setChatboxLoading(false, true);

  } catch (err) {
    console.error('doItAll error:', err);
    setAIStatus('❌ ' + (err.message || 'Connection error — try again.'), true);
    showTip('❌ AI Analysis failed: ' + (err.message || 'Connection error.'));
    
    if (btn) {
      btn.disabled = false;
      btn.style.background = '';
      btn.innerHTML = '<span>🔁 AI: Create Steps from Analyzing Video</span>';
    }
    if (overlayBtn) {
      overlayBtn.disabled = false;
      overlayBtn.style.opacity = '1';
      overlayBtn.innerHTML = '⚡ AI Stops';
    }
    window.setChatboxLoading(false, false);
  }
};

window.aiDoVideoOnly = async function() {
  if (typeof checkForceFreshAI === 'function') {
    checkForceFreshAI();
  }

  // Clear cached transcripts and segments to make sure they are not reused
  cachedTranscript = '';
  cachedSegments = [];
  
  const btn = document.getElementById('aiVideoOnlyBtn');
  const loopBtn = document.getElementById('aiLoopBtn');
  const transcriptBtn = document.getElementById('aiStepsFromTranscriptBtn');
  const generateBtn = document.getElementById('aiGenerateStepsBtn') || document.getElementById('aiGenerateStepsBtnMobile');
  const overlayBtn = document.getElementById('overlayAiBtn');

  const setButtonsState = (disabled, text) => {
    if (btn) {
      btn.disabled = disabled;
      if (disabled && text) {
        btn.innerHTML = `<span>⏳</span><span>${text}</span>`;
      } else if (!disabled) {
        btn.style.background = '';
        btn.innerHTML = `<span>🎥 AI: Analyze Video Only (No Audio)</span>`;
      }
    }
    if (loopBtn) loopBtn.disabled = disabled;
    if (transcriptBtn) transcriptBtn.disabled = disabled;
    if (generateBtn) generateBtn.disabled = disabled;
    
    if (overlayBtn) {
      overlayBtn.disabled = disabled;
      if (disabled) {
        overlayBtn.style.opacity = '0.7';
        if (text) overlayBtn.innerHTML = `🤖 ${text}`;
      } else {
        overlayBtn.style.opacity = '1';
        overlayBtn.innerHTML = '⚡ AI Stops';
      }
    }
  };

  if (!uploadedFile) {
    setAIStatus('⚠️ Upload a video first.', true);
    showTip('Upload your video first, then tap the button.');
    setButtonsState(false);
    return;
  }

  window.setChatboxLoading(true);
  
  try {
    setButtonsState(true, 'Analyzing Video (No Audio)...');
    setAIStatus('🤖 Analyzing video visually (ignoring audio)...', true);
    showTip('🎥 Sending video to Gemini for visual-only analysis...');
    
    // Call Gemini with videoOnly=true
    const gem = await tryGeminiFor('all', true);
    
    if (!gem || !gem.loops || !gem.loops.length) {
      throw new Error('No loop steps were detected from the visual video analysis.');
    }
    
    // Apply Gemini results
    if (gem.title) {
      const t = document.getElementById('newRecipeTitleInput');
      if (t) t.value = gem.title;
    }
    if (gem.ingredients?.length) {
      const b = document.getElementById('ingredientsText');
      if (b) b.value = gem.ingredients.join('\n');
      window._aiIngredients = gem.ingredients.join('\n');
      const r = document.getElementById('ingredientsResult'); if (r) r.style.display='block';
    }
    if (gem.steps?.length) {
      const b = document.getElementById('stepsText');
      if (b) b.value = gem.steps.join('\n');
      window._aiStepsText = gem.steps.join('\n');
      const r = document.getElementById('stepsTextResult'); if (r) r.style.display='block';
    }
    
    // Clear transcript text overlays
    cachedSegments = [];
    cachedTranscript = '';
    const transcriptTextEl = document.getElementById('transcriptText');
    if (transcriptTextEl) {
      transcriptTextEl.textContent = 'Speech transcription disabled (Video-Only analysis)';
    }

    createStepsArr = gem.loops.map((l, i) => {
      const t   = Number(l.start ?? l.time) || 0;
      const end = (l.end ?? l.endTime) != null ? Number(l.end ?? l.endTime) : null;
      const mm  = Math.floor(t / 60);
      const ss  = Math.floor(t % 60).toString().padStart(2, '0');
      
      const rawDesc = l.instruction || gem.steps?.[i] || '';
      return {
        time: t,
        endTime: end,
        label: l.label || `Step ${i+1}`,
        description: rawDesc,
        ingredients: l.ingredients || [],
        displayTime: `${mm}:${ss}`,
        timers: undefined // force auto-detection of timers!
      };
    }).sort((a, b) => a.time - b.time);

    renderCreateSteps();
    renderTimeline();

    // Success styling
    if (btn) {
      btn.disabled = false;
      btn.style.background = 'linear-gradient(135deg,#16a34a,#22c55e)';
      btn.innerHTML = '<span>✅</span><span>Video Steps Created!</span>';
    }
    if (overlayBtn) {
      overlayBtn.disabled = false;
      overlayBtn.style.opacity = '1';
      overlayBtn.innerHTML = '⚡ AI Stops';
    }

    setAIStatus('✅ AI successfully created steps from visual analysis!', true);
    showTip('⚡ AI completed video-only analysis!');
    window.setChatboxLoading(false, true);
    if (typeof window.collapseAiTools === 'function') window.collapseAiTools();

  } catch (err) {
    console.error('aiDoVideoOnly error:', err);
    setAIStatus('❌ ' + (err.message || 'Connection error — try again.'), true);
    showTip('❌ AI Analysis failed: ' + (err.message || 'Connection error.'));
    
    setButtonsState(false);
    window.setChatboxLoading(false, false);
  }
};

window.createStepsFromTranscript = async function() {
  if (typeof checkForceFreshAI === 'function') {
    checkForceFreshAI();
  }
  const btn = document.getElementById('aiStepsFromTranscriptBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ 1/3: Transcript...';
  }

  try {
    let textVal = document.getElementById('transcriptText')?.textContent?.trim() || cachedTranscript;
    if (!textVal) {
      setAIStatus('🎤 Step 1/3: Generating video transcript...', true);
      showTip('🎤 Transcribing audio...');
      await window.transcribeVideo();
      
      textVal = document.getElementById('transcriptText')?.textContent?.trim() || cachedTranscript;
      if (!textVal) {
        throw new Error('Could not generate transcript. Please transcribe first.');
      }
      showTip('🎙️ Transcript successfully created!');
    } else {
      showTip('📖 Using current transcript to build steps...');
    }

    // 2. Detect loop stops from transcript
    if (btn) btn.textContent = '⏳ 2/3: Loops...';
    setAIStatus('🔁 Step 2/3: Detecting loop timestamps...', true);
    const tweak = document.getElementById('aiTweakPrompt')?.value?.trim() || null;
    const loopsRes = await fetch('/api/ai/loops', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript: textVal, segments: cachedSegments, prompt: tweak }),
    });
    const loopsData = await loopsRes.json();
    if (loopsData.error) throw new Error(loopsData.error);

    const loops = loopsData.loops || [];
    if (!loops.length) {
      throw new Error('No loop steps detected in the transcript text.');
    }

    // Temporarily map detected loops
    let tempSteps = loops.map((l, i) => {
      const t = Number(l.time) || 0;
      const end = l.endTime != null ? Number(l.endTime) : null;
      const m = Math.floor(t / 60);
      const s = Math.floor(t % 60).toString().padStart(2, '0');
      return {
        time: t,
        endTime: end,
        label: l.label || `Step ${i+1}`,
        displayTime: `${m}:${s}`,
        description: '⏳ Writing instruction...',
        ingredients: [],
        timer: null
      };
    }).sort((a, b) => a.time - b.time);

    // 3. Write descriptions & ingredients for these loop stops from segments
    if (btn) btn.textContent = '⏳ 3/3: Steps...';
    setAIStatus('✍️ Step 3/3: Writing descriptions & ingredients...', true);
    const stepsPayload = tempSteps.map(s => ({
      label: s.label,
      startTime: s.time,
      endTime: s.endTime ?? (s.time + 5)
    }));

    let descriptions = [];
    try {
      const describeRes = await fetch('/api/ai/describe-steps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ steps: stepsPayload, segments: cachedSegments }),
      });
      const describeData = await describeRes.json();
      if (describeData.error) {
        console.warn('describe-steps returned error, using local transcript fallback:', describeData.error);
      } else {
        descriptions = describeData.descriptions || [];
      }
    } catch (describeErr) {
      console.warn('describe-steps API call failed, using local transcript fallback:', describeErr);
    }
    
    // Apply descriptions and ingredients to final array
    const transcripts = window.getTranscriptForSteps(tempSteps);
    const finalSteps = tempSteps.map((step, idx) => {
      const descText = descriptions[idx] || '';
      const parsed = window.parseDescriptionAndIngredients(descText);
      const wordForWordDesc = transcripts[idx] || '';
      const rawDesc = wordForWordDesc || parsed.description || '';
      return {
        ...step,
        description: rawDesc,
        ingredients: parsed.ingredients || [],
        timers: undefined // force auto-detection of timers!
      };
    });

    // Only update state and render once everything is 100% complete and final
    createStepsArr = finalSteps;
    renderCreateSteps();
    renderTimeline();
    
    setAIStatus(`🎉 Successfully created ${createStepsArr.length} steps from transcript!`, true);
    showTip(`✅ Steps successfully created based off transcript!`);
  } catch (err) {
    setAIStatus('❌ ' + (err.message || 'Error.'), true);
    showTip('❌ Failed: ' + (err.message || 'Error.'));
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '🪄 AI: Audio-to-Step Generator';
    }
  }
};

// ── Update saveNewRecipe to include AI-generated content ───────────────────
// Patch the save function to include ingredients and written steps
const _origSaveNewRecipe = window.saveNewRecipe;
window.saveNewRecipe = async function() {
  // Inject AI content into the recipe payload before saving
  // (the createRecipe function will pick these up via extra fields)
  window._aiIngredients = document.getElementById('ingredientsText')?.value?.trim() || null;
  window._aiStepsText   = document.getElementById('stepsText')?.value?.trim() || null;
  return _origSaveNewRecipe();
};

// ============================================================
// PREMIUM MOBILE EDITOR LAYOUT REDESIGN & TIMESTAMPS
// ============================================================

// Relocate cards dynamically between desktop grid and mobile carousel slides
window.setupResponsiveDrawers = function() {
  const isMobile = window.innerWidth <= 768;
  const slideVoiceover = document.getElementById('slideVoiceover');
  const slideStops = document.getElementById('slideStops');
  const slideSave = document.getElementById('slideSave');
  
  const titleCard = document.getElementById('editorTitleCard');
  const coverCard = document.getElementById('editorCoverCard');
  const visibilityCard = document.getElementById('editorVisibilityCard');
  const voiceoverSection = document.getElementById('voiceoverSection');
  const stopsSection = document.getElementById('editorStopsCard');
  const saveBtn = document.getElementById('saveRecipeBtn');
  const saveDraftBtn = document.getElementById('saveDraftBtn');
  const videoWrapper = document.getElementById('workbenchVideoWrapper');
  const videoOverlayControls = document.getElementById('videoOverlayControls');
  
  if (isMobile) {
    if (slideSave) {
      if (titleCard) {
        slideSave.appendChild(titleCard);
        // Reset styles for mobile drawer
        titleCard.style.padding = '10px 13px';
        titleCard.style.display = 'block';
        titleCard.style.width = 'auto';
        titleCard.style.flex = 'none';
        titleCard.style.margin = '';
        const label = titleCard.querySelector('label');
        if (label) {
          label.style.display = 'block';
          label.style.marginBottom = '4px';
        }
        const input = document.getElementById('newRecipeTitleInput');
        if (input) {
          input.style.width = '100%';
          input.style.border = '2px solid var(--border-card)';
          input.style.background = 'var(--bg-card-soft)';
          input.style.padding = '8px 10px';
          input.style.borderRadius = '10px';
        }
      }
      if (visibilityCard) slideSave.appendChild(visibilityCard);
      if (coverCard) slideSave.appendChild(coverCard);
      if (saveBtn) slideSave.appendChild(saveBtn);
      if (saveDraftBtn) slideSave.appendChild(saveDraftBtn);
    }
    if (slideVoiceover && voiceoverSection && voiceoverSection.parentElement !== slideVoiceover) {
      slideVoiceover.appendChild(voiceoverSection);
    }
    if (slideStops && stopsSection && stopsSection.parentElement !== slideStops) {
      slideStops.appendChild(stopsSection);
    }
    
    // Relocate #videoOverlayControls to be sibling of #workbenchVideoWrapper on mobile to fix iOS Safari touch swallowing
    if (videoWrapper && videoOverlayControls && videoOverlayControls.parentElement === videoWrapper) {
      videoWrapper.parentNode.insertBefore(videoOverlayControls, videoWrapper.nextSibling);
    }
    
    // Wire swipe scroll listeners
    window.setupCarouselListeners();
  } else {
    // Restore to desktop horizontal columns in exact order
    const headerContainer = document.getElementById('headerTitleContainer');
    const colVoiceover = document.getElementById('rightColVoiceover');
    const colStops = document.getElementById('rightColStops');
    const colIngredients = document.getElementById('rightColIngredients');
    const colSave = document.getElementById('rightColSave');
    const saveButtonsCard = document.getElementById('editorSaveButtonsCard');
    const ingredientsCard = document.getElementById('editorIngredientsCard');

    if (headerContainer && titleCard && titleCard.parentElement !== headerContainer) {
      headerContainer.appendChild(titleCard);
      // Premium compact inline style for header pill
      titleCard.style.padding = '4px 12px';
      titleCard.style.display = 'flex';
      titleCard.style.alignItems = 'center';
      titleCard.style.gap = '8px';
      titleCard.style.width = '100%';
      titleCard.style.flex = '1';
      titleCard.style.margin = '0';
      const label = titleCard.querySelector('label');
      if (label) {
        label.style.display = 'inline-block';
        label.style.marginBottom = '0';
        label.style.whiteSpace = 'nowrap';
      }
      const input = document.getElementById('newRecipeTitleInput');
      if (input) {
        input.style.width = '100%';
        input.style.border = 'none';
        input.style.background = 'transparent';
        input.style.padding = '4px 0';
        input.style.borderRadius = '0';
      }
    }
    if (colVoiceover && voiceoverSection && voiceoverSection.parentElement !== colVoiceover) {
      colVoiceover.appendChild(voiceoverSection);
    }
    if (colStops && stopsSection && stopsSection.parentElement !== colStops) {
      colStops.appendChild(stopsSection);
    }
    if (colIngredients) {
      if (ingredientsCard && ingredientsCard.parentElement !== colIngredients) {
        colIngredients.appendChild(ingredientsCard);
      }
    }
    if (colSave) {
      if (visibilityCard && visibilityCard.parentElement !== colSave) {
        colSave.appendChild(visibilityCard);
      }
      if (coverCard && coverCard.parentElement !== colSave) {
        colSave.appendChild(coverCard);
      }
      if (saveButtonsCard) {
        if (saveButtonsCard.parentElement !== colSave) {
          colSave.appendChild(saveButtonsCard);
        }
        if (saveBtn && saveBtn.parentElement !== saveButtonsCard) {
          saveButtonsCard.appendChild(saveBtn);
        }
        if (saveDraftBtn && saveDraftBtn.parentElement !== saveButtonsCard) {
          saveButtonsCard.appendChild(saveDraftBtn);
        }
      }
    }
    
    // Restore #videoOverlayControls back inside #workbenchVideoWrapper on desktop
    if (videoWrapper && videoOverlayControls && videoOverlayControls.parentElement !== videoWrapper) {
      videoWrapper.appendChild(videoOverlayControls);
    }
    
    if (typeof window.switchEditorTab === 'function') {
      window.switchEditorTab(window.activeEditorTab || 'stops');
    }
  }
};

let carouselScrolling = false;
window.setupCarouselListeners = function() {
  const carousel = document.getElementById('mobileEditorCarousel');
  if (!carousel) return;
  
  carousel.removeEventListener('scroll', handleCarouselScroll);
  carousel.addEventListener('scroll', handleCarouselScroll);
};

function handleCarouselScroll() {
  if (carouselScrolling) return;
  const carousel = document.getElementById('mobileEditorCarousel');
  if (!carousel) return;
  const width = carousel.clientWidth;
  if (width <= 0) return;
  const scrollLeft = carousel.scrollLeft;
  const index = Math.round(scrollLeft / width);
  updateToolbarButtonStates(index);
}

window.scrollToCarouselSlide = function(index) {
  const carousel = document.getElementById('mobileEditorCarousel');
  if (!carousel) return;
  
  carouselScrolling = true;
  const width = carousel.clientWidth;
  carousel.scrollTo({
    left: width * index,
    behavior: 'smooth'
  });
  
  updateToolbarButtonStates(index);
  
  setTimeout(() => {
    carouselScrolling = false;
  }, 450);
};

// Update active states on bottom toolbar tabs
function updateToolbarButtonStates(activeIndex) {
  const tabs = ['Stops', 'Ingredients', 'Save'];
  tabs.forEach((tab, i) => {
    const btn = document.getElementById(`btnToolbar${tab}`);
    if (btn) {
      btn.classList.toggle('active', i === activeIndex);
    }
  });

  // Auto-expand accordion body when sliding to its tab
  if (activeIndex === 0) { // Stops tab (index 0)
    const stopsBody = document.getElementById('stopsBody');
    const stopsChevron = document.getElementById('stopsChevron');
    if (stopsBody) {
      stopsBody.style.display = '';
      if (stopsChevron) stopsChevron.style.transform = '';
    }
  }
}

// Kept for compatibility during view switching and resets
window.closeAllMobileDrawers = function() {
  window.scrollToCarouselSlide(0);
};

// Open manual timestamp modal
window.openManualTimestampModal = function() {
  const modal = document.getElementById('manualTimestampModal');
  if (modal) {
    modal.style.display = 'flex';
    const tsInput = document.getElementById('manualTimestampInput');
    if (tsInput) {
      tsInput.value = '';
      tsInput.focus();
    }
  }
};

// Close manual timestamp modal
window.closeManualTimestampModal = function() {
  const modal = document.getElementById('manualTimestampModal');
  if (modal) modal.style.display = 'none';
};

// Parse timestamps to float seconds (supports 1:30, 01:23:45, 95, 95s)
window.parseTimestampToSeconds = function(str) {
  if (!str) return null;
  const cleaned = str.trim();
  const parts = cleaned.split(':');
  if (parts.length > 1) {
    let secs = 0;
    if (parts.length === 2) {
      const m = parseInt(parts[0], 10);
      const s = parseFloat(parts[1]);
      if (isNaN(m) || isNaN(s)) return null;
      secs = m * 60 + s;
    } else if (parts.length === 3) {
      const h = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      const s = parseFloat(parts[2]);
      if (isNaN(h) || isNaN(m) || isNaN(s)) return null;
      secs = h * 3600 + m * 60 + s;
    }
    return secs;
  }
  const rawSecs = parseFloat(cleaned.replace(/s$/i, ''));
  if (isNaN(rawSecs)) return null;
  return rawSecs;
};

// Add a manual loop stop from parsed timestamp
window.addManualStep = function() {
  const tsInput = document.getElementById('manualTimestampInput');
  if (!tsInput) return;
  
  const timeStr = tsInput.value;
  const label = '';
  
  // Split by comma to support multiple timestamps
  const timeStrings = timeStr.split(',').map(s => s.trim()).filter(Boolean);
  if (!timeStrings.length) {
    showTip('Please enter a valid timestamp.');
    return;
  }

  const videoEl = document.getElementById('uploadedVideoPlayer');
  const duration = videoEl ? (videoEl.duration || videoDuration || 0) : 0;
  const parsedSteps = [];

  for (const str of timeStrings) {
    const secs = window.parseTimestampToSeconds(str);
    if (secs === null || secs < 0) {
      showTip(`Invalid timestamp format: "${str}". Use e.g. 1:30 or 95`);
      return;
    }
    if (duration && secs > duration) {
      const durM = Math.floor(duration / 60);
      const durS = Math.floor(duration % 60).toString().padStart(2, '0');
      showTip(`Timestamp ${str} exceeds video duration (${durM}:${durS})`);
      return;
    }
    parsedSteps.push(secs);
  }

  // Sort parsedSteps chronologically first so index appended to custom label matches chronological order
  parsedSteps.sort((a, b) => a - b);

  let addedCount = 0;
  parsedSteps.forEach((secs, index) => {
    // Avoid exact duplicate timestamp stops
    const exists = createStepsArr.some(s => Math.abs(s.time - secs) < 0.01);
    if (exists) return;

    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60).toString().padStart(2, '0');
    const defaultEnd = duration ? Math.min(secs + 15, duration) : secs + 15;
    
    // Split empty list into two sections: 0:00 to secs (Step 1) and secs to end (Step 2)
    if (createStepsArr.length === 0 && secs > 0.05) {
      createStepsArr.push({
        time: 0,
        endTime: secs,
        label: `Step 1`,
        displayTime: `0:00`
      });
      addedCount++;
    }

    // Assign label. If multiple timestamps are added with a custom label, append step index.
    const stepLabel = label 
      ? (parsedSteps.length > 1 ? `${label} ${index + 1}` : label) 
      : `Step ${createStepsArr.length + 1}`;

    createStepsArr.push({
      time: secs,
      endTime: defaultEnd,
      label: stepLabel,
      displayTime: `${m}:${s}`
    });
    addedCount++;
  });

  if (addedCount === 0) {
    showTip('Steps already exist at these timestamps.');
    return;
  }

  createStepsArr.sort((a, b) => a.time - b.time);
  
  // Seek video to the first newly added stop
  if (videoEl && parsedSteps.length > 0) {
    videoEl.currentTime = parsedSteps[0];
  }
  
  renderCreateSteps();
  renderTimeline();
  window.closeManualTimestampModal();
  showTip(`Added ${addedCount} loop stop${addedCount > 1 ? 's' : ''}!`);
};

// Dynamic Subtitle overlays
window.updateSubtitles = function(timeSource, overlayId, segments) {
  const overlay = document.getElementById(overlayId);
  if (!overlay) return;

  if (!segments || !segments.length) {
    overlay.style.display = 'none';
    return;
  }

  const currentTime = (typeof timeSource === 'number') ? timeSource : timeSource.currentTime;
  const currentSegment = segments.find(seg => {
    const start = Number(seg.start ?? seg.startTime ?? seg.start_time) || 0;
    const end   = Number(seg.end ?? seg.endTime ?? seg.end_time) || 0;
    return currentTime >= start && currentTime <= end;
  });

  if (currentSegment) {
    const span = overlay.querySelector('span');
    if (span) {
      span.textContent = currentSegment.text.trim();
    }
    overlay.style.display = 'flex';
  } else {
    overlay.style.display = 'none';
  }
};

// Copy or share link of the active recipe using Custom Premium Share Modal
window.shareCurrentRecipe = function() {
  window.openPlayerShareModal();
};

window.downloadCurrentVideo = async function() {
  const realVideo = document.getElementById('mobileRealVideo');
  const videoUrl = (realVideo && realVideo.src && !realVideo.src.includes('mobile.html')) ? realVideo.src : 
                   ((typeof playerCurrentRecipe === 'object' && playerCurrentRecipe) ? playerCurrentRecipe.video_url : '') || 
                   ((typeof recipeData === 'object' && recipeData) ? recipeData.video_url : '') || '';
                   
  if (!videoUrl) {
    showTip("❌ No video URL found to download.");
    return;
  }

  showTip("⏳ Fetching video for download...");

  try {
    const response = await fetch(videoUrl);
    if (!response.ok) throw new Error("Network response was not ok");

    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = blobUrl;

    const recipeTitle = (typeof playerCurrentRecipe === 'object' && playerCurrentRecipe?.title) || 
                        (typeof recipeData === 'object' && recipeData?.title) || 
                        'recipe_video';
                        
    a.download = `${recipeTitle.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.mp4`;

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Clean up blob URL after a short delay
    setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
    showTip("✅ Video download started!");
  } catch (error) {
    console.error("Download failed:", error);
    // Fallback: open URL in a new tab if blob fetch fails (e.g. CORS)
    const a = document.createElement('a');
    a.href = videoUrl;
    a.target = '_blank';
    a.download = 'video.mp4';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showTip("✅ Opening video in new tab for download.");
  }
};

window.openPlayerShareModal = function() {
  if (!playerCurrentRecipe || !playerCurrentRecipe.id) {
    showTip('No recipe loaded to share.');
    return;
  }

  const modal = document.getElementById('playerShareModal');
  if (!modal) return;

  const panel = document.getElementById('playerShareSheetPanel');
  if (panel) {
    panel.style.transform = 'translateY(100%)';
  }

  // Populate preview and recipe name
  const recipeNameEl = document.getElementById('shareModalRecipeName');
  if (recipeNameEl) {
    recipeNameEl.textContent = playerCurrentRecipe.title || 'Untitled Recipe';
  }
  
  // URL binding
  const shareUrl = window.location.origin + window.location.pathname + '?v=8.52#mobile-player?id=' + playerCurrentRecipe.id;
  const previewTextEl = document.getElementById('shareUrlPreviewText');
  if (previewTextEl) {
    previewTextEl.textContent = shareUrl;
  }

  const title = playerCurrentRecipe.title || 'In The Loop Recipe';

  // Configure SMS link
  const smsLink = document.getElementById('shareSmsLink');
  if (smsLink) {
    smsLink.href = 'sms:?body=' + encodeURIComponent(`Check out this recipe on In The Loop: ${title} — ${shareUrl}`);
  }

  // Configure Email link
  const emailLink = document.getElementById('shareEmailLink');
  if (emailLink) {
    emailLink.href = 'mailto:?subject=' + encodeURIComponent(`Recipe: ${title}`) + '&body=' + encodeURIComponent(`Check out this cooking guide on In The Loop: ${title}\n\n${shareUrl}`);
  }

  // Configure WhatsApp link
  const waLink = document.getElementById('shareWhatsappLink');
  if (waLink) {
    waLink.href = 'https://api.whatsapp.com/send?text=' + encodeURIComponent(`Check out this recipe on In The Loop: ${title} — ${shareUrl}`);
  }

  // Check and show native share option if supported
  const nativeBtn = document.getElementById('shareNativeBtn');
  if (nativeBtn) {
    if (navigator.share) {
      nativeBtn.style.display = 'flex';
    } else {
      nativeBtn.style.display = 'none';
    }
  }

  modal.style.display = 'flex';

  // Force reflow and slide up
  setTimeout(() => {
    if (panel) {
      panel.style.transform = 'translateY(0)';
    }
  }, 10);
};

window.closePlayerShareModal = function() {
  const modal = document.getElementById('playerShareModal');
  const panel = document.getElementById('playerShareSheetPanel');
  if (!modal) return;
  if (panel) {
    panel.style.transform = 'translateY(100%)';
  }
  setTimeout(() => {
    modal.style.display = 'none';
  }, 300); // matches the 0.3s CSS transition duration
};

window.handleShareAction = function(action) {
  if (!playerCurrentRecipe || !playerCurrentRecipe.id) return;
  const shareUrl = window.location.origin + window.location.pathname + '?v=8.52#mobile-player?id=' + playerCurrentRecipe.id;
  const title = playerCurrentRecipe.title || 'In The Loop Recipe';

  if (action === 'copy') {
    copyToClipboardHelper(shareUrl);
    window.closePlayerShareModal();
  } else if (action === 'instagram') {
    copyToClipboardHelper(shareUrl, 'Link copied! Opening Instagram to paste... 📸');
    window.closePlayerShareModal();
    setTimeout(() => {
      window.open('instagram://', '_blank');
      setTimeout(() => {
        if (document.hasFocus()) {
          window.open('https://www.instagram.com/', '_blank');
        }
      }, 500);
    }, 400);
  } else if (action === 'tiktok') {
    copyToClipboardHelper(shareUrl, 'Link copied! Opening TikTok to paste... 🎵');
    window.closePlayerShareModal();
    setTimeout(() => {
      window.open('snssdk1180://', '_blank');
      setTimeout(() => {
        if (document.hasFocus()) {
          window.open('https://www.tiktok.com/', '_blank');
        }
      }, 500);
    }, 400);
  } else if (action === 'native') {
    if (navigator.share) {
      navigator.share({
        title: title,
        text: `Check out this cooking recipe step-by-step video loop on In The Loop: ${title}!`,
        url: shareUrl
      }).then(() => {
        showTip('Shared successfully! 🚀');
        window.closePlayerShareModal();
      }).catch(err => {
        console.warn('Native share failed or cancelled:', err);
        if (err.name !== 'AbortError') {
          copyToClipboardHelper(shareUrl);
          window.closePlayerShareModal();
        }
      });
    }
  }
};

function copyToClipboardHelper(shareUrl, customTip) {
  const msg = customTip || 'Copied share link to clipboard! 🔗';
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(shareUrl).then(() => {
      showTip(msg);
    }).catch(err => {
      console.error('Clipboard copy failed:', err);
      copyFallback(shareUrl, msg);
    });
  } else {
    copyFallback(shareUrl, msg);
  }
}

function copyFallback(text, msg) {
  const dummy = document.createElement('textarea');
  dummy.style.position = 'absolute';
  dummy.style.left = '-9999px';
  document.body.appendChild(dummy);
  dummy.value = text;
  dummy.select();
  try {
    document.execCommand('copy');
    showTip(msg || 'Copied share link to clipboard! 🔗');
  } catch (err) {
    console.error('Fallback copy failed:', err);
    showTip('Failed to copy. URL: ' + text);
  }
  document.body.removeChild(dummy);
}

// ============================================================
// REPLICATE AI INTEGRATION — COVER, VOICEOVER, & PLAYBACK
// ============================================================
let currentVoiceoverUrl = null;

window.playVoiceoverForStep = function(stepIndex) {
  return; // Speech/Audio feedback disabled per user request to prevent repeating steps
  if (!recipeData || !recipeData.steps) return;
  const step = recipeData.steps[stepIndex];
  if (!step) return;

  const audioUrl = step.audio_url || step.audioUrl;
  if (!audioUrl) {
    if (window._stepVoiceoverAudio) {
      window._stepVoiceoverAudio.pause();
      window._stepVoiceoverAudio = null;
      currentVoiceoverUrl = null;
    }
    return;
  }

  // If this audio url is already playing, don't restart it
  if (currentVoiceoverUrl === audioUrl && window._stepVoiceoverAudio && !window._stepVoiceoverAudio.paused) {
    return;
  }

  // Stop preview audio if any
  if (window._previewVoiceoverAudio) {
    window._previewVoiceoverAudio.pause();
    window._previewVoiceoverAudio = null;
  }

  // Stop currently playing voiceover
  if (window._stepVoiceoverAudio) {
    window._stepVoiceoverAudio.pause();
  }

  console.log(`[Voiceover] Playing step ${stepIndex} audio:`, audioUrl);
  currentVoiceoverUrl = audioUrl;
  
  const audio = new Audio(audioUrl);
  window._stepVoiceoverAudio = audio;
  
  // Set up cleanup when it ends
  audio.addEventListener('ended', () => {
    if (window._stepVoiceoverAudio === audio) {
      currentVoiceoverUrl = null;
    }
  });

  if (isPlaying) {
    audio.play().catch(err => {
      console.warn('[Voiceover] Playback failed/blocked:', err);
    });
  }
};

window.playVoiceoverAudio = function(url) {
  if (window._previewVoiceoverAudio) {
    window._previewVoiceoverAudio.pause();
  }
  console.log('[Voiceover] Previewing voiceover audio:', url);
  window._previewVoiceoverAudio = new Audio(url);
  window._previewVoiceoverAudio.play().catch(err => {
    console.warn('[Voiceover] Preview play failed/blocked:', err);
  });
};

window.generateAICover = async function() {
  const title = document.getElementById('newRecipeTitleInput')?.value?.trim() || '';
  const ingredients = document.getElementById('ingredientsText')?.value?.trim() || '';
  
  if (!title) {
    showTip('Please enter a recipe title first so AI knows what to cook! 🍲');
    return;
  }

  // Create prompt
  let prompt = title;
  if (ingredients) {
    const lines = ingredients.split('\n').map(l => l.trim()).filter(Boolean).slice(0, 5);
    prompt += ` featuring ${lines.join(', ')}`;
  }

  const btn = event?.currentTarget;
  const originalText = btn ? btn.innerHTML : '🪄 AI Cover';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '⏳ Generating...';
  }
  showTip('🪄 Generating gourmet cover image via Flux on Replicate...');

  try {
    const res = await fetch('/api/ai/generate-cover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt })
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || 'Server error generating cover');

    if (data.imageUrl) {
      const coverInput = document.getElementById('newRecipeCoverInput');
      if (coverInput) {
        coverInput.value = data.imageUrl;
      }
      window.updateCoverPreviewFromUrl(data.imageUrl);
      showTip('✅ Gourmet Cover generated and saved to Supabase! 🖼️');
    } else {
      throw new Error('No imageUrl returned');
    }
  } catch (err) {
    console.error('[Generate Cover Error]:', err);
    showTip('❌ Cover generation failed: ' + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  }
};

window.generateAllVoiceovers = async function() {
  if (!createStepsArr.length) {
    showTip('Add loop stops first, then tap 🎙️ AI Voiceovers.');
    return;
  }

  const btn = document.getElementById('aiVoiceoverGenerateBtn');
  const mBtn = document.getElementById('aiVoiceoverGenerateBtnMobile');
  
  const originalText = btn ? btn.innerHTML : '🎙️ AI: Generate Voiceovers for All Steps';
  const originalMText = mBtn ? mBtn.innerHTML : '🎙️ AI: Generate Voiceovers for All Steps';

  const updateButtons = (text, disabled) => {
    if (btn) { btn.disabled = disabled; btn.innerHTML = `<span>${text}</span>`; }
    if (mBtn) { mBtn.disabled = disabled; mBtn.innerHTML = `<span>${text}</span>`; }
  };

  updateButtons('⏳ Preparing...', true);
  showTip('🎙️ Generating AI voiceovers for each step...');

  try {
    const recipeId = editingRecipeId || 'new_recipe_' + Date.now();
    for (let i = 0; i < createStepsArr.length; i++) {
      const step = createStepsArr[i];
      const text = step.description?.trim() || step.label?.trim() || `Step ${i + 1}`;
      
      updateButtons(`🎙️ Step ${i + 1}/${createStepsArr.length}...`, true);
      
      const res = await fetch('/api/ai/generate-voiceover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          stepIndex: i,
          recipeId
        })
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `Failed to generate voiceover for step ${i + 1}`);

      if (data.audioUrl) {
        step.audio_url = data.audioUrl;
        step.audioUrl = data.audioUrl;
      }
    }

    renderCreateSteps();
    showTip('✅ All AI Voiceovers generated and synced to steps! 🎙️');
  } catch (err) {
    console.error('[Generate Voiceovers Error]:', err);
    showTip('❌ Voiceover generation failed: ' + err.message);
  } finally {
    updateButtons(originalText, false);
    if (mBtn) mBtn.innerHTML = originalMText;
  }
};

window.generateSingleVoiceover = async function(i) {
  const step = createStepsArr[i];
  if (!step) return;

  const btn = document.getElementById(`regenVoiceoverBtn-${i}`);
  const btnMobile = document.getElementById(`regenVoiceoverBtnMobile-${i}`);
  const originalText = btn ? btn.innerHTML : '🎙️ Re-generate';
  const originalMText = btnMobile ? btnMobile.innerHTML : '🎙️ Re-generate';

  const updateButtons = (text, disabled) => {
    if (btn) { btn.disabled = disabled; btn.innerHTML = text; }
    if (btnMobile) { btnMobile.disabled = disabled; btnMobile.innerHTML = text; }
  };

  updateButtons('⏳...', true);
  showTip(`🎙️ Generating voiceover for step ${i + 1}...`);

  try {
    const recipeId = editingRecipeId || 'new_recipe_' + Date.now();
    const text = step.description?.trim() || step.label?.trim() || `Step ${i + 1}`;

    const res = await fetch('/api/ai/generate-voiceover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        stepIndex: i,
        recipeId
      })
    });
    const data = res.ok ? await res.json() : null;
    if (!res.ok || !data || data.error) throw new Error(data?.error || `Failed to generate voiceover`);

    if (data.audioUrl) {
      step.audio_url = data.audioUrl;
      step.audioUrl = data.audioUrl;
    }

    renderCreateSteps();
    showTip(`✅ Generated voiceover for step ${i + 1}!`);
  } catch (err) {
    console.error(err);
    showTip('❌ Single voiceover failed: ' + err.message);
  } finally {
    updateButtons(originalText, false);
    if (btnMobile) btnMobile.innerHTML = originalMText;
  }
};


// Automatically blur active text input/textarea elements when the mouse pointer
// hovers over key video player or scrubber controls. This releases text input focus,
// prevents macOS from hiding the mouse cursor (arrow pointer), and allows arrow keys
// to instantly control the video player.
document.addEventListener('mouseover', function(e) {
  const target = e.target;
  if (!target) return;

  const isPlayerRegion = target.closest(
    '#uploadedVideoPlayer, #videoScrubber, .player-timeline-rail-container, .player-controls-strip, .mobile-video-container, #navPrevBtn, #navNextBtn, #previewLoopBtn, #stopPreviewBtn, #createKbToggleBtn, .desktop-player-controls, .step-navigator-row'
  );

  if (isPlayerRegion) {
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) {
      active.blur();
    }
  }
});

window.editorVideoScale = parseFloat(localStorage.getItem('cooking_gps_video_scale')) || 1.0;

window.changeEditorVideoScale = function(val) {
  window.editorVideoScale = parseFloat(val);
  localStorage.setItem('cooking_gps_video_scale', val);
  
  const label = document.getElementById('videoSizeMultiplierLabel');
  if (label) {
    label.textContent = `${Math.round(val * 100)}%`;
  }
  
  const slider = document.getElementById('videoSizeScaleSlider');
  if (slider) {
    slider.value = val;
  }

  // Update active state on preset buttons
  document.querySelectorAll('.video-size-preset-btn').forEach(btn => {
    const btnVal = parseFloat(btn.getAttribute('data-value'));
    if (Math.abs(btnVal - val) < 0.01) {
      btn.style.background = 'var(--primary)';
      btn.style.color = '#fff';
      btn.style.borderColor = 'transparent';
    } else {
      btn.style.background = 'var(--bg-card-soft)';
      btn.style.color = 'var(--text-body)';
      btn.style.borderColor = 'var(--border-card)';
    }
  });

  window.adjustWorkbenchVideoSize();
};

window.setEditorVideoScale = function(val) {
  window.changeEditorVideoScale(val);
};

function setupWorkbenchResizer() {
  const resizer = document.getElementById('workbenchResizer');
  const leftSide = document.getElementById('workbenchLeft');
  const grid = document.getElementById('workbenchGrid');
  if (!resizer || !leftSide || !grid) return;

  // Set initial slider & label values
  const initialScale = window.editorVideoScale || 1.0;
  const label = document.getElementById('videoSizeMultiplierLabel');
  if (label) {
    label.textContent = `${Math.round(initialScale * 100)}%`;
  }
  const slider = document.getElementById('videoSizeScaleSlider');
  if (slider) {
    slider.value = initialScale;
  }
  document.querySelectorAll('.video-size-preset-btn').forEach(btn => {
    const btnVal = parseFloat(btn.getAttribute('data-value'));
    if (Math.abs(btnVal - initialScale) < 0.01) {
      btn.style.background = 'var(--primary)';
      btn.style.color = '#fff';
      btn.style.borderColor = 'transparent';
    } else {
      btn.style.background = 'var(--bg-card-soft)';
      btn.style.color = 'var(--text-body)';
      btn.style.borderColor = 'var(--border-card)';
    }
  });

  let startX = 0;
  let startWidth = 0;

  function onMouseDown(e) {
    startX = e.clientX;
    startWidth = parseInt(document.defaultView.getComputedStyle(leftSide).width, 10);
    
    // Add event listeners for dragging
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    // Disable text selection during drag
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    
    const line = document.getElementById('resizerLine');
    if (line) line.style.background = 'var(--primary)';
    resizer.style.background = 'rgba(74,144,217,0.1)';
  }

  function onMouseMove(e) {
    const deltaX = e.clientX - startX;
    // Calculate new width, constrained between 320px and 1100px (or 80% of window size)
    const minW = 320;
    const maxW = Math.min(1100, window.innerWidth * 0.8);
    let newWidth = startWidth + deltaX;
    if (newWidth < minW) newWidth = minW;
    if (newWidth > maxW) newWidth = maxW;

    leftSide.style.width = newWidth + 'px';
    window.dispatchEvent(new Event('resize'));
  }

  function onMouseUp() {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
    
    const line = document.getElementById('resizerLine');
    if (line) {
      line.style.background = 'var(--border-card)';
    }
    resizer.style.background = 'transparent';
  }

  resizer.addEventListener('mousedown', onMouseDown);
}

window.adjustWorkbenchVideoSize = function() {
  const videoEl = document.getElementById('uploadedVideoPlayer');
  const wrapper = document.getElementById('workbenchVideoWrapper');
  const leftSide = document.getElementById('workbenchLeft');
  if (!videoEl || !wrapper || !leftSide) return;

  // Only apply custom adjustments on desktop screens (width > 768)
  if (window.innerWidth <= 768) {
    wrapper.style.height = '';
    wrapper.style.width = '';
    wrapper.style.flex = '';
    wrapper.style.alignSelf = '';
    return;
  }

  const scale = window.editorVideoScale || 1.0;

  // Get video metadata dimensions
  const videoWidth = videoEl.videoWidth;
  const videoHeight = videoEl.videoHeight;
  
  // If metadata isn't loaded yet, default to a safe 16:9 ratio style
  const aspectRatio = (videoWidth && videoHeight) ? (videoWidth / videoHeight) : (16 / 9);
  const containerWidth = leftSide.getBoundingClientRect().width - 12; // account for padding/scrollbar

  let targetHeight, targetWidth;

  if (aspectRatio >= 1) {
    // Landscape video: match aspect ratio precisely to fit container width
    targetHeight = containerWidth / aspectRatio;
    // Cap height between 320px and 520px to fit well on desktop
    const minH = 320 * scale;
    const maxH = 650 * scale;
    targetHeight = Math.max(minH, Math.min(maxH, targetHeight));
    targetWidth = targetHeight * aspectRatio;
    if (targetWidth > containerWidth) {
      targetWidth = containerWidth;
      targetHeight = targetWidth / aspectRatio;
    }
  } else {
    // Portrait/Vertical video (e.g., 9:16)
    // Scale height based on width, but cap it so it does not overflow viewport height
    const maxAllowedHeight = Math.min(850, window.innerHeight * 0.85) * scale;
    const minH = 480 * scale;
    targetHeight = containerWidth / aspectRatio;
    targetHeight = Math.max(minH, Math.min(maxAllowedHeight, targetHeight));
    targetWidth = targetHeight * aspectRatio;
    if (targetWidth > containerWidth) {
      targetWidth = containerWidth;
      targetHeight = targetWidth / aspectRatio;
    }
  }

  wrapper.style.height = `${targetHeight}px`;
  wrapper.style.width = `${targetWidth}px`;
  wrapper.style.flex = 'none';
  wrapper.style.alignSelf = 'center';
};

// Listen to window resize events to recalculate heights dynamically
window.addEventListener('resize', window.adjustWorkbenchVideoSize);


window.updateAIChecklists = function() {
  // 1. Place Loop Stops: done if createStepsArr has elements
  const hasStops = window.createStepsArr && window.createStepsArr.length > 0;
  
  // 2. Write Steps: done if hasStops and at least one step has a non-empty description
  const hasStepsDesc = hasStops && window.createStepsArr.some(s => s.description && s.description.trim().length > 0);
  
  // 3. Write Ingredients: done if ingredientsText value is not empty, or any step has ingredients
  const ingredientsInput = document.getElementById('ingredientsText');
  const hasIngredients = (ingredientsInput && ingredientsInput.value.trim().length > 0) || 
                          (window.createStepsArr && window.createStepsArr.some(s => s.ingredients && s.ingredients.length > 0));

  // 4. Transcribe audio only: done if cachedTranscript is not empty
  const hasTranscript = typeof window.cachedTranscript === 'string' && window.cachedTranscript.trim().length > 0;

  // 5. Do Everything: done if all sub-tasks are done
  const isDoEverythingDone = hasStops && hasStepsDesc && hasIngredients && hasTranscript;

  // Toggle visibility of checkmark elements
  document.querySelectorAll('.check-place-stops').forEach(el => {
    el.style.display = hasStops ? 'inline-flex' : 'none';
  });
  document.querySelectorAll('.check-write-steps').forEach(el => {
    el.style.display = hasStepsDesc ? 'inline-flex' : 'none';
  });
  document.querySelectorAll('.check-write-ingredients').forEach(el => {
    el.style.display = hasIngredients ? 'inline-flex' : 'none';
  });
  document.querySelectorAll('.check-transcribe').forEach(el => {
    el.style.display = hasTranscript ? 'inline-flex' : 'none';
  });
  document.querySelectorAll('.check-do-everything').forEach(el => {
    el.style.display = isDoEverythingDone ? 'inline-flex' : 'none';
  });
};

window.activeEditorTab = 'stops';
window.switchEditorTab = function(tabName) {
  window.activeEditorTab = tabName;
  const tabs = {
    stops: { colId: 'rightColStops', btnId: 'tabBtnStops' },
    ingredients: { colId: 'rightColIngredients', btnId: 'tabBtnIngredients' },
    save: { colId: 'rightColSave', btnId: 'tabBtnSave' }
  };
  
  Object.keys(tabs).forEach(key => {
    const col = document.getElementById(tabs[key].colId);
    const btn = document.getElementById(tabs[key].btnId);
    if (key === tabName) {
      if (col) {
        col.style.display = 'flex';
        col.style.width = '100%';
        col.style.flex = '1';
      }
      if (btn) {
        btn.style.background = 'linear-gradient(135deg, var(--primary), var(--primary-hover))';
        btn.style.color = '#fff';
        btn.style.borderColor = 'transparent';
        btn.style.boxShadow = '0 4px 12px var(--primary-glow)';
      }
    } else {
      if (col) {
        col.style.display = 'none';
      }
      if (btn) {
        btn.style.background = 'var(--bg-card-soft)';
        btn.style.color = 'var(--text-body)';
        btn.style.borderColor = 'var(--border-card)';
        btn.style.boxShadow = 'none';
      }
    }
  });
};

// ── App execution trigger at very bottom ──
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}
