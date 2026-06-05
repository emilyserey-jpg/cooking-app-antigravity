// Cooking GPS — Core Application Script
import { signIn, signUp, signOut, onAuthChange, getPublicRecipes, uploadVideo, createRecipe } from './supabase-client.js';

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

// Application UI States
let currentUser = null;
let authMode = 'signin'; // 'signin' or 'signup'
let currentView = 'mobile-player';
let playbackMode = 'loop';
let isPlaying = false;
let currentTime = 75.0;
let activeStepIndex = 1;
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

// Initialize App
window.addEventListener('DOMContentLoaded', () => {
  canvasMobile = document.getElementById('mobileVideoCanvas');
  ctxMobile = canvasMobile.getContext('2d');
  canvasDesktop = document.getElementById('desktopVideoCanvas');
  ctxDesktop = canvasDesktop.getContext('2d');
  
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  
  renderStepChipsMobile();
  renderTimelineMarkersDesktop();
  renderStepListDesktop();
  startVideoSimulation();
  updateDetailFields();
  setupSpeechRecognition();
  setupDashboardTimer();

  // 🔌 Connect to Supabase
  initSupabase();
});

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
    
    if (isPlaying) {
      // Apply play speed
      const speed = currentView === 'mobile-player' ? 1.0 : parseFloat(document.getElementById('activeSpeedBadge').innerText) || 1.0;
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
  const timeText = `${min}:${sec.toString().padStart(2, '0')} / 6:00`;
  
  // Mobile Time text
  const mTimeReadout = document.getElementById('videoTimeReadout');
  if (mTimeReadout) mTimeReadout.innerText = timeText;
  
  // Mobile Progress line
  const mProgressLine = document.getElementById('videoProgressLine');
  if (mProgressLine) {
    const pct = (currentTime / recipeData.duration) * 100;
    mProgressLine.style.width = pct + '%';
  }
  
  // Desktop Playhead
  const dPlayhead = document.getElementById('timelinePlayhead');
  const dTimerReadout = document.getElementById('desktopTimerReadout');
  if (dTimerReadout) dTimerReadout.innerText = `${min}:${sec.toString().padStart(2, '0')}`;
  
  if (dPlayhead) {
    const pct = (currentTime / recipeData.duration) * 100;
    dPlayhead.style.left = pct + '%';
  }
}

// Play/Pause Action
function toggleVideoPlayback() {
  isPlaying = !isPlaying;
  updateControlsUI();
}

function updateControlsUI() {
  // Mobile play btn
  const mPlayPauseBtn = document.getElementById('phonePlayPauseBtn');
  if (mPlayPauseBtn) {
    mPlayPauseBtn.innerHTML = isPlaying ? `<i data-lucide="pause"></i>` : `<i data-lucide="play"></i>`;
    lucide.createIcons({attrs: {class: 'phone-play-pause-icon'}});
  }
  
  // Desktop play btn
  const dPlayIcon = document.getElementById('desktopPlayIcon');
  if (dPlayIcon) {
    dPlayIcon.setAttribute('data-lucide', isPlaying ? 'pause' : 'play');
    lucide.createIcons();
  }
}

function setPlaybackMode(mode) {
  playbackMode = mode;
  
  // Update mobile buttons
  document.querySelectorAll('.mode-switch-btn').forEach(btn => btn.classList.remove('active'));
  if (mode === 'loop') {
    document.getElementById('modeBtnLoop').classList.add('active');
    document.getElementById('activeModeBadge').className = "mode-badge loop";
    document.getElementById('activeModeBadge').innerHTML = `<i data-lucide="repeat"></i> Loop Mode`;
  } else if (mode === 'wait') {
    document.getElementById('modeBtnWait').classList.add('active');
    document.getElementById('activeModeBadge').className = "mode-badge wait";
    document.getElementById('activeModeBadge').innerHTML = `<i data-lucide="pause"></i> Wait Mode`;
  } else if (mode === 'continuous') {
    document.getElementById('modeBtnContinuous').classList.add('active');
    document.getElementById('activeModeBadge').className = "mode-badge continuous";
    document.getElementById('activeModeBadge').innerHTML = `<i data-lucide="play-circle"></i> Continuous`;
  }
  
  lucide.createIcons();
  speakFeedback(mode + " mode activated.");
}

// Seek directly to a step boundary
function seekToStep(index) {
  activeStepIndex = index;
  currentTime = recipeData.loops[index];
  
  updateStepDetailsUI();
  speakFeedback("Navigating to " + recipeData.steps[index].title);
}

function updateStepDetailsUI() {
  const step = recipeData.steps[activeStepIndex];
  
  // Update mobile fields
  document.getElementById('mobileStepLabel').innerText = `Step ${activeStepIndex + 1} of ${recipeData.steps.length}`;
  
  const minStart = Math.floor(recipeData.loops[activeStepIndex] / 60);
  const secStart = Math.floor(recipeData.loops[activeStepIndex] % 60);
  const minEnd = Math.floor(recipeData.loops[activeStepIndex+1] / 60);
  const secEnd = Math.floor(recipeData.loops[activeStepIndex+1] % 60);
  document.getElementById('mobileStepTime').innerText = `${minStart}:${secStart.toString().padStart(2,'0')} – ${minEnd}:${secEnd.toString().padStart(2,'0')}`;
  
  document.getElementById('mobileStepTitle').innerText = step.title;
  document.getElementById('mobileStepInstructions').innerText = step.instruction;
  
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
}

function renderStepChipsMobile() {
  const container = document.getElementById('chipsScrollX');
  if (!container) return;
  
  container.innerHTML = '';
  recipeData.steps.forEach((step, idx) => {
    const chip = document.createElement('button');
    chip.className = `step-chip ${idx === activeStepIndex ? 'active' : ''}`;
    chip.onclick = () => seekToStep(idx);
    chip.innerHTML = `
      <span class="step-chip-num">${idx + 1}</span>
      <span>${step.title}</span>
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
}

function saveStepDetailsFromInputs() {
  const step = recipeData.steps[activeStepIndex];
  const newTitle = document.getElementById('inputStepTitle').value;
  const newInstr = document.getElementById('inputStepInstructions').value;
  
  step.title = newTitle;
  step.instruction = newInstr;
  
  // Live update displays
  document.getElementById('mobileStepTitle').innerText = newTitle;
  document.getElementById('mobileStepInstructions').innerText = newInstr;
  
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
  
  if ('speechSynthesis' in window) {
    const utterance = new SpeechSynthesisUtterance(phrase);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
  }
}

// ----------------------------------------------------
// INTERFACE VIEW SWITCHER / HELPER SHEETS
// ----------------------------------------------------
function switchView(viewId) {
  currentView = viewId;

  // Update Tabs
  document.querySelectorAll('.view-tab').forEach(tab => tab.classList.remove('active'));
  const activeTab = Array.from(document.querySelectorAll('.view-tab')).find(tab =>
    (viewId === 'mobile-player'    && tab.innerText.includes('Player')) ||
    (viewId === 'discover'         && tab.innerText.includes('Discover')) ||
    (viewId === 'profile'          && tab.innerText.includes('Profile')) ||
    (viewId === 'bento-dashboard'  && tab.innerText.includes('Dashboard')) ||
    (viewId === 'desktop-workbench'&& tab.innerText.includes('Editor'))
  );
  if (activeTab) activeTab.classList.add('active');

  // Toggle Views
  document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));
  document.getElementById(`view-${viewId}`).classList.add('active');

  resizeCanvas();

  // Load data when switching to these views
  if (viewId === 'discover') loadDiscoverRecipes();
  if (viewId === 'profile')   loadProfileRecipes();
  if (viewId === 'grid-view') initGridView();
  if (viewId !== 'grid-view') stopAllGridLoops();
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

  showTip(`Switched to ${viewId.replace(/-/g, ' ')}`);
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
function initSupabase() {
  onAuthChange((user) => {
    currentUser = user;
    updateUserBadge(user);
    if (user) {
      loadRealRecipes();
      populateProfilePage(user);
      showTip(`Welcome back, ${user.email.split('@')[0]}!`);
      if (typeof currentView !== 'undefined') {
        if (currentView === 'grid-view') {
          renderLibrary();
        }
        if (currentView === 'my-profile') {
          openPublicProfile(user.email, 'my-profile');
        }
      }
    } else {
      resetProfilePage();
      if (typeof currentView !== 'undefined') {
        if (currentView === 'grid-view') {
          renderLibrary();
        }
        if (currentView === 'my-profile' || currentView === 'profile') {
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
  if (currentUser) {
    // If already signed in, show sign-out option
    if (confirm(`Sign out of ${currentUser.email}?`)) {
      signOut().then(() => showTip('Signed out successfully.')).catch(console.error);
    }
    return;
  }
  authMode = 'signin';
  document.getElementById('authModal').style.display = 'block';
  document.getElementById('authModalBackdrop').style.display = 'block';
  document.getElementById('authError').style.display = 'none';
  document.getElementById('authEmail').value = '';
  document.getElementById('authPassword').value = '';
};

window.closeAuthModal = function() {
  document.getElementById('authModal').style.display = 'none';
  document.getElementById('authModalBackdrop').style.display = 'none';
};

window.toggleAuthMode = function() {
  authMode = authMode === 'signin' ? 'signup' : 'signin';
  const isSignUp = authMode === 'signup';
  document.getElementById('authModalTitle').textContent = isSignUp ? 'Create account' : 'Welcome back!';
  document.getElementById('authModalSubtitle').textContent = isSignUp ? 'Join Cooking GPS today — it\'s free!' : 'Sign in to your Cooking GPS account';
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

window.openPublicProfile = async function(creatorEmail, fromView) {
  pubPreviousView = fromView || 'discover';
  pubFromTab      = (fromView === 'my-profile');

  document.querySelectorAll('.view-section').forEach(s => s.style.display = 'none');
  const section = document.getElementById('view-public-profile');
  if (!section) return;
  section.style.display = '';

  const backBtn = document.getElementById('pubBackBtn');
  if (backBtn) backBtn.style.display = pubFromTab ? 'none' : 'inline-flex';

  document.querySelectorAll('.view-tab').forEach(b => b.classList.remove('active'));
  if (pubFromTab) {
    const t = document.getElementById('myProfileTab');
    if (t) t.classList.add('active');
  }

  const nameEl   = document.getElementById('pubName');
  const handleEl = document.getElementById('pubHandle');
  const avatarEl = document.getElementById('pubAvatar');
  if (nameEl)   nameEl.textContent   = 'Loading\u2026';
  if (handleEl) handleEl.textContent = '';
  section.scrollTop = 0;
  window.scrollTo(0, 0);

  try {
    const { supabase } = await import('./supabase-client.js');
    let { data: recipes, error } = await supabase
      .from('recipes')
      .select('id, title, description, video_url, thumbnail_url, duration, created_at, loops, steps, creator, is_published, private_recipe')
      .eq('creator', creatorEmail)
      .eq('is_published', true)
      .eq('private_recipe', false)
      .order('created_at', { ascending: false });

    if (error) {
      if (error.message && (error.message.includes('thumbnail_url') || error.message.includes('column'))) {
        console.warn('[Supabase] Retrying openPublicProfile without thumbnail_url column');
        const retry = await supabase
          .from('recipes')
          .select('id, title, description, video_url, duration, created_at, loops, steps, creator, is_published, private_recipe')
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

    const list = recipes || [];
    pubCurrentCreator = { email: creatorEmail, recipes: list };

    const displayName = creatorEmail.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    if (nameEl)   nameEl.textContent   = displayName;
    if (handleEl) handleEl.textContent = '@' + creatorEmail.split('@')[0];
    if (avatarEl) avatarEl.textContent = displayName.charAt(0).toUpperCase();

    const postCountEl = document.getElementById('pubPostCount');
    if (postCountEl) postCountEl.textContent = list.length;

    const bioNameEl = document.getElementById('pubBioName');
    const bioTextEl = document.getElementById('pubBioText');
    if (bioNameEl) bioNameEl.textContent = displayName;
    if (bioTextEl) {
      const msData = (pubFromTab && currentUser && typeof mySpaceLoadData === 'function') ? mySpaceLoadData() : null;
      bioTextEl.textContent = (msData && msData.bio) ? msData.bio : 'Cooking creator \ud83c\udf73';
    }

    const actionBtn = document.getElementById('pubActionBtn');
    if (actionBtn) {
      if (currentUser && creatorEmail === currentUser.email) {
        actionBtn.textContent = 'Edit Profile';
        actionBtn.style.cssText = 'background:#efefef;border:1px solid #dbdbdb;border-radius:8px;padding:6px 16px;font-family:var(--font);font-weight:700;font-size:0.85rem;color:#262626;cursor:pointer;white-space:nowrap;';
        actionBtn.onclick = () => switchView('profile');
      } else {
        actionBtn.textContent = 'Follow';
        actionBtn.style.cssText = 'background:#0095f6;border:none;border-radius:8px;padding:6px 20px;font-family:var(--font);font-weight:700;font-size:0.85rem;color:#fff;cursor:pointer;white-space:nowrap;';
        actionBtn.onclick = () => showTip('Follow feature coming soon!');
      }
    }

    pubRenderGrid(list);
    pubRenderHighlights(list);
    pubSwitchTab('videos');
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
  const videos = document.getElementById('pubTabVideosContent');
  const series = document.getElementById('pubTabSeriesContent');
  const btnV   = document.getElementById('pubTabVideos');
  const btnS   = document.getElementById('pubTabSeries');
  const isV    = tab === 'videos';
  if (videos) videos.style.display = isV ? '' : 'none';
  if (series) series.style.display = isV ? 'none' : '';
  const onStyle  = 'display:flex;align-items:center;gap:6px;padding:12px 24px;border:none;border-top:2px solid #262626;background:none;font-family:var(--font);font-weight:600;font-size:0.72rem;text-transform:uppercase;letter-spacing:0.1em;color:#262626;cursor:pointer;';
  const offStyle = 'display:flex;align-items:center;gap:6px;padding:12px 24px;border:none;border-top:2px solid transparent;background:none;font-family:var(--font);font-weight:600;font-size:0.72rem;text-transform:uppercase;letter-spacing:0.1em;color:#8e8e8e;cursor:pointer;';
  if (btnV) btnV.style.cssText = isV ? onStyle : offStyle;
  if (btnS) btnS.style.cssText = isV ? offStyle : onStyle;
};

function pubRenderGrid(recipes) {
  const grid   = document.getElementById('pubVideoRow');
  const noPost = document.getElementById('pubNoPostsMsg');
  if (!grid) return;
  if (!recipes.length) {
    grid.innerHTML = '';
    if (noPost) noPost.style.display = '';
    return;
  }
  if (noPost) noPost.style.display = 'none';
  grid.innerHTML = recipes.map(function(r, idx) {
    var thumbBg = r.thumbnail_url
      ? 'url(' + encodeURI(r.thumbnail_url) + ') center/cover no-repeat'
      : 'linear-gradient(135deg,#1a1a2e,#16213e,#0f3460)';
    var mins = r.duration
      ? Math.floor(r.duration / 60) + ':' + String(Math.floor(r.duration % 60)).padStart(2, '0')
      : '';
    var html = '<div onclick="openPubLightbox(' + idx + ')" style="position:relative;aspect-ratio:1/1;background:' + thumbBg + ';cursor:pointer;overflow:hidden;">';
    if (!r.thumbnail_url) html += '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:2.5rem;color:rgba(255,255,255,0.5);">\ud83c\udfac</div>';
    html += '<div class="pub-ov" style="position:absolute;inset:0;background:rgba(0,0,0,0);display:flex;align-items:center;justify-content:center;transition:background 0.18s;" onmouseenter="this.style.background=\'rgba(0,0,0,0.32)\';this.querySelector(\'.pov\').style.opacity=\'1\'" onmouseleave="this.style.background=\'rgba(0,0,0,0)\';this.querySelector(\'.pov\').style.opacity=\'0\'">';
    html += '<div class="pov" style="color:#fff;font-weight:700;font-size:0.9rem;opacity:0;transition:opacity 0.18s;">\u25b6 ' + (mins || '\u2013') + '</div></div>';
    if (mins) html += '<div style="position:absolute;bottom:5px;right:5px;background:rgba(0,0,0,0.75);color:#fff;font-size:0.6rem;font-weight:800;padding:2px 6px;border-radius:3px;">' + mins + '</div>';
    html += '</div>';
    return html;
  }).join('');
}

function pubRenderHighlights(recipes) {
  var row = document.getElementById('pubHighlightsRow');
  if (!row || !recipes.length) { if (row) row.style.display = 'none'; return; }
  var groups = {};
  recipes.forEach(function(r) {
    var key = (r.title || 'Other').split(' ')[0].slice(0, 10);
    if (!groups[key]) groups[key] = r;
  });
  var keys = Object.keys(groups).slice(0, 8);
  if (!keys.length) { row.style.display = 'none'; return; }
  row.style.display = 'flex';
  var palette = ['#f09433,#e6683c,#dc2743', '#4a90d9,#2d5986', '#5cb85c,#338a3e', '#a855f7,#7c3aed'];
  row.innerHTML = keys.map(function(k, i) {
    var r = groups[k];
    var bg = r.thumbnail_url
      ? 'url(' + encodeURI(r.thumbnail_url) + ') center/cover no-repeat'
      : 'linear-gradient(45deg,' + palette[i % palette.length] + ')';
    var inner = !r.thumbnail_url ? '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:1.6rem;">\ud83c\udf73</div>' : '';
    return '<div style="display:flex;flex-direction:column;align-items:center;gap:5px;flex-shrink:0;cursor:pointer;">'
      + '<div style="width:64px;height:64px;border-radius:50%;background:' + bg + ';border:3px solid #fff;box-shadow:0 0 0 2px #e1306c;overflow:hidden;position:relative;">' + inner + '</div>'
      + '<div style="font-size:0.68rem;font-weight:500;color:#262626;text-align:center;max-width:68px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + k + '</div>'
      + '</div>';
  }).join('');
}

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
    if (r.thumbnail_url) {
      thumbEl.style.background = 'url(' + encodeURI(r.thumbnail_url) + ') center/cover no-repeat';
      thumbEl.innerHTML = '';
    } else {
      thumbEl.style.background = 'linear-gradient(135deg,#1a1a2e,#0f3460)';
      thumbEl.innerHTML = '<span style="font-size:4rem;">\ud83c\udfac</span>';
    }
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
  try { libData = JSON.parse(localStorage.getItem('cookingGPS_library_v1') || '{}'); } catch {}
  const folders = libData.folders || [];

  if (countEl) countEl.textContent = folders.length || '0';

  const addBtn = `<div style="flex-shrink:0;background:var(--bg-card-soft);border-radius:12px;border:2px dashed var(--border-card);padding:14px 18px;display:flex;align-items:center;gap:8px;cursor:pointer;font-size:0.82rem;font-weight:800;color:var(--text-muted);" onclick="switchView('grid-view')">+ New Folder</div>`;

  if (!folders.length) {
    strip.innerHTML = addBtn;
    return;
  }

  strip.innerHTML = folders.map(f => {
    const count = (f.recipeIds || []).length;
    return `<div onclick="switchView('grid-view')"
      style="flex-shrink:0;background:${f.color};border-radius:12px;padding:14px 18px;cursor:pointer;
             min-width:130px;display:flex;flex-direction:column;gap:4px;
             box-shadow:0 2px 8px rgba(0,0,0,0.08);transition:transform 0.15s;"
      onmouseenter="this.style.transform='translateY(-2px)'" onmouseleave="this.style.transform=''">
      <div style="font-size:1.4rem;">📁</div>
      <div style="font-weight:900;font-size:0.82rem;color:rgba(20,20,50,0.85);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:120px;">${f.name}</div>
      <div style="font-size:0.65rem;font-weight:700;color:rgba(20,20,50,0.5);">${count} recipe${count!==1?'s':''}</div>
    </div>`;
  }).join('') + addBtn;
}

// ── Banner init ───────────────────────────────────────────────────────────
function mySpaceInit() {
  // Bio
  const data = mySpaceLoadData();
  const bioText = document.getElementById('mySpaceBioText');
  if (bioText && data.bio) {
    bioText.textContent = data.bio;
    bioText.style.fontStyle = 'normal';
  }

  // Sign-in / My Channel button visibility
  const signInBtn   = document.getElementById('mySpaceSignInBtn');
  const channelBtn  = document.getElementById('mySpaceChannelBtn');
  if (signInBtn)  signInBtn.style.display  = currentUser ? 'none' : '';
  if (channelBtn) channelBtn.style.display = currentUser ? '' : 'none';

  // Folder strip
  mySpaceRenderFolderStrip();
}

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

  // Status badge
  let badge = '';
  if (isDraft) {
    badge = `<span style="background:#fff8e1;color:#b45309;border:2px solid #fde68a;padding:3px 10px;border-radius:999px;font-size:0.68rem;font-weight:800;">📝 Draft</span>`;
  } else if (isPublic) {
    badge = `<span style="background:rgba(92,184,92,0.15);color:#449944;border:2px solid rgba(92,184,92,0.3);padding:3px 10px;border-radius:999px;font-size:0.68rem;font-weight:800;">🌎 Public</span>`;
  } else {
    badge = `<span style="background:rgba(74,144,217,0.1);color:var(--primary);border:2px solid var(--border-card);padding:3px 10px;border-radius:999px;font-size:0.68rem;font-weight:800;">🔒 Private</span>`;
  }

  // Owner action buttons
  let ownerActions = '';
  if (isOwner) {
    if (isDraft) {
      ownerActions = `
        <div style="display:flex;gap:6px;margin-top:10px;border-top:1px solid var(--border-card);padding-top:10px;">
          <button onclick="event.stopPropagation();publishDraft('${r.id}')"
            style="flex:1;background:var(--green);color:#fff;border:none;border-radius:8px;padding:7px;font-family:var(--font);font-size:0.75rem;font-weight:800;cursor:pointer;">
            🚀 Publish
          </button>
          <button onclick="event.stopPropagation();deleteRecipeById('${r.id}')"
            style="background:#fff0f0;color:#e55;border:2px solid #fcc;border-radius:8px;padding:7px 10px;font-family:var(--font);font-size:0.75rem;font-weight:800;cursor:pointer;">
            🗑
          </button>
        </div>`;
    } else if (isPublic) {
      ownerActions = `
        <div style="display:flex;gap:6px;margin-top:10px;border-top:1px solid var(--border-card);padding-top:10px;">
          <button onclick="event.stopPropagation();toggleRecipePublish('${r.id}', true)"
            style="flex:1;background:#fff0f0;color:#c00;border:2px solid #fcc;border-radius:8px;padding:7px;font-family:var(--font);font-size:0.75rem;font-weight:800;cursor:pointer;">
            🔒 Make Private
          </button>
        </div>`;
    } else {
      ownerActions = `
        <div style="display:flex;gap:6px;margin-top:10px;border-top:1px solid var(--border-card);padding-top:10px;">
          <button onclick="event.stopPropagation();toggleRecipePublish('${r.id}', false)"
            style="flex:1;background:var(--green);color:#fff;border:none;border-radius:8px;padding:7px;font-family:var(--font);font-size:0.75rem;font-weight:800;cursor:pointer;">
            🌎 Make Public
          </button>
          <button onclick="event.stopPropagation();deleteRecipeById('${r.id}')"
            style="background:#fff0f0;color:#e55;border:2px solid #fcc;border-radius:8px;padding:7px 10px;font-family:var(--font);font-size:0.75rem;font-weight:800;cursor:pointer;">
            🗑
          </button>
        </div>`;
    }
  }

  return `
    <div class="glass-card" style="cursor:pointer;transition:transform 0.2s,box-shadow 0.2s;"
      onmouseenter="this.style.transform='translateY(-4px)';this.style.boxShadow='0 16px 40px rgba(74,144,217,0.18)'"
      onmouseleave="this.style.transform='';this.style.boxShadow=''"
      onclick="loadRecipeById('${r.id}')">  
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:0.75rem;">
        <div style="width:44px;height:44px;border-radius:14px;background:linear-gradient(135deg,#4a90d9,#6aaee8);display:flex;align-items:center;justify-content:center;font-size:1.3rem;box-shadow:0 4px 12px rgba(74,144,217,0.25);">🍳</div>
        ${badge}
      </div>
      <h3 style="font-size:1rem;font-weight:900;color:var(--text-heading);margin-bottom:6px;line-height:1.3;">${r.title || 'Untitled Recipe'}</h3>
      <p style="font-size:0.78rem;color:var(--text-muted);font-weight:600;margin-bottom:${isOwner ? '0' : '1rem'};">
        ${!isOwner && r.creator
          ? `<span onclick="event.stopPropagation();openPublicProfile('${r.creator}','discover')"
               style="color:var(--primary);font-weight:700;cursor:pointer;text-decoration:none;"
               onmouseenter="this.style.textDecoration='underline'" onmouseleave="this.style.textDecoration='none'">
               📺 ${r.creator.split('@')[0]}
             </span>`
          : `by ${r.creator || 'Chef'}`
        }
      </p>
      ${isOwner ? '' : `<div style="display:flex;gap:12px;">
        ${stepCount ? `<span style="font-size:0.72rem;font-weight:800;color:var(--text-muted);">📋 ${stepCount} steps</span>` : ''}
        ${mins ? `<span style="font-size:0.72rem;font-weight:800;color:var(--text-muted);">⏱ ${mins} min</span>` : ''}
      </div>`}
      ${ownerActions}
    </div>
  `;
}

// Toggle a recipe between public and private
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
    const { supabase } = await import('./supabase-client.js');
    const { error } = await supabase.from('recipes').delete().eq('id', id);
    if (error) throw error;
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
        videoUrl = localVideoURL || null;
      }
    } else {
      videoUrl = localVideoURL || null;
    }

    const { createRecipe } = await import('./supabase-client.js');
    await createRecipe({
      title,
      creator:  currentUser.email,
      duration: videoEl?.duration || 0,
      steps:    createStepsArr.map(s => s.label),
      // Save full loop objects so viewers get exact AI-detected start+end times
      loops:    createStepsArr.map(s => ({ start: s.time, end: s.endTime ?? null, label: s.label })),
      video_url: videoUrl,
      is_draft: true,
    });

    const msg = document.getElementById('savedRecipeMsg');
    if (msg) msg.textContent = `"${title}" saved as a draft — finish it later on My Page 📝`;
    document.getElementById('createStage2').style.display = 'none';
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

// ── Universal recipe launcher — used by Library, My Profile, Discover ──────
window.loadRecipeById = async function(id) {
  if (!id) return;
  switchView('grid-view');
  await window.loadGridRecipe(id);
  const picker = document.getElementById('gridRecipePicker');
  if (picker) picker.value = id;
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
      const end = typeof nextEntry === 'number' ? nextEntry : null;
      return { start: entry, end, label: null };
    }
    // New format — already has start, end, label
    return {
      start: entry.start ?? entry.time ?? 0,
      end:   entry.end   ?? entry.endTime ?? null,
      label: entry.label ?? null,
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
let   libOpenFolderId  = null;   // null = root; string = folder id being viewed
let   libEditFolderId  = null;   // null = create mode; string = edit mode
let   libDragItem      = null;   // { type:'folder'|'recipe', id }
let   libSelectedColor = FOLDER_COLORS[0];

// ── State helpers ──────────────────────────────────────────────────────────
function libLoad() {
  try {
    const raw = localStorage.getItem(LIB_KEY);
    libState = raw ? JSON.parse(raw) : { sort:'az', folders:[], customOrder:[] };
  } catch { libState = { sort:'az', folders:[], customOrder:[] }; }
  // Ensure required keys
  if (!libState.folders)     libState.folders     = [];
  if (!libState.customOrder) libState.customOrder = [];
  if (!libState.sort)        libState.sort        = 'az';
}

function libSave() {
  localStorage.setItem(LIB_KEY, JSON.stringify(libState));
}

function libGetFolder(id) {
  return libState.folders.find(f => f.id === id);
}

function libMakeId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// ── Fetch user recipes from Supabase ──────────────────────────────────────
async function libFetchRecipes() {
  if (!currentUser) return [];
  try {
    const { supabase } = await import('./supabase-client.js');
    let { data, error } = await supabase
      .from('recipes')
      .select('id, title, video_url, thumbnail_url, duration, created_at, private_recipe')
      .eq('creator', currentUser.email)
      .order('created_at', { ascending: false });
    
    if (error) {
      // If it's a schema/missing column error for thumbnail_url, retry without it
      if (error.message && (error.message.includes('thumbnail_url') || error.message.includes('column'))) {
        console.warn('[Supabase] Retrying libFetchRecipes without thumbnail_url column');
        const retry = await supabase
          .from('recipes')
          .select('id, title, video_url, duration, created_at, private_recipe')
          .eq('creator', currentUser.email)
          .order('created_at', { ascending: false });
        if (retry.error) throw retry.error;
        return retry.data || [];
      }
      throw error;
    }
    return data || [];
  } catch (err) {
    console.error('libFetchRecipes error:', err);
    return [];
  }
}

// ── Main render ────────────────────────────────────────────────────────────
async function renderLibrary() {
  const content = document.getElementById('libContent');
  if (!content) return;

  if (!libState) libLoad();

  // Show loading spinner while fetching
  content.innerHTML = `<div style="text-align:center;padding:4rem;color:var(--text-muted);">
    <div style="font-size:2rem;margin-bottom:0.75rem;">⏳</div>
    <div style="font-weight:700;font-size:0.9rem;">Loading your library…</div>
  </div>`;

  libAllRecipes = await libFetchRecipes();

  // Sync customOrder: add new recipe/folder ids not yet present
  const allIds = new Set(libState.customOrder);
  libState.folders.forEach(f => { if (!allIds.has('folder:' + f.id)) libState.customOrder.push('folder:' + f.id); });
  libAllRecipes.forEach(r => { if (!allIds.has('recipe:' + r.id)) libState.customOrder.push('recipe:' + r.id); });
  libSave();

  libRenderContent();
  libUpdateSortBtns();
}

function libRenderContent() {
  const content = document.getElementById('libContent');
  if (!content || !libState) return;

  // If drilling into a folder, show folder view
  if (libOpenFolderId) {
    libRenderFolderView(content);
    return;
  }

  const q = libSearchQuery.toLowerCase();

  // Build ordered list respecting current sort
  let folders = [...libState.folders];
  let loose   = libAllRecipes.filter(r => !libState.folders.some(f => (f.recipeIds||[]).includes(r.id)));

  // Apply sort
  if (libState.sort === 'az') {
    folders.sort((a, b) => a.name.localeCompare(b.name));
    loose.sort((a, b) => (a.title||'').localeCompare(b.title||''));
  } else if (libState.sort === 'za') {
    folders.sort((a, b) => b.name.localeCompare(a.name));
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
    folders = folders.filter(f => f.name.toLowerCase().includes(q));
    loose   = loose.filter(r => (r.title||'').toLowerCase().includes(q));
  }

  let html = '';

  // ── Folders section ──
  if (folders.length) {
    html += `<div style="margin-bottom:1.5rem;">
      <div style="font-size:0.7rem;font-weight:900;text-transform:uppercase;letter-spacing:0.07em;color:var(--text-muted);margin-bottom:10px;">
        📁 Folders (${folders.length})
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(155px,1fr));gap:12px;" id="libFolderGrid">`;
    folders.forEach(f => { html += libFolderCardHTML(f); });
    html += `</div></div>`;
  }

  // ── Loose recipes section ──
  const looseLabel = q ? `Results (${loose.length})` : `Loose Recipes (${loose.length})`;
  html += `<div>
    <div style="font-size:0.7rem;font-weight:900;text-transform:uppercase;letter-spacing:0.07em;color:var(--text-muted);margin-bottom:10px;">
      🎬 ${looseLabel}
    </div>`;

  if (!loose.length && !folders.length) {
    html += libEmptyState(q);
  } else if (!loose.length) {
    html += `<div style="text-align:center;padding:2rem;color:var(--text-muted);font-size:0.85rem;font-weight:600;">
      ${q ? 'No recipes match your search' : 'All recipes are inside folders'}
    </div>`;
  } else {
    html += `<div style="display:flex;flex-direction:column;gap:10px;" id="libLooseList">`;
    loose.forEach(r => { html += libRecipeCardHTML(r, null); });
    html += `</div>`;
  }
  html += `</div>`;

  content.innerHTML = html;

  // Attach drag events after render
  libAttachDragEvents();
}

function libFolderCardHTML(f) {
  const count = (f.recipeIds || []).length;
  const isDrag = libState.sort === 'custom';
  return `
    <div class="lib-folder-card" id="libF_${f.id}"
      style="background:${f.color};border-radius:16px;padding:16px 14px 14px;cursor:pointer;
             position:relative;transition:transform 0.15s,box-shadow 0.15s;
             box-shadow:0 2px 10px rgba(0,0,0,0.08);min-height:110px;display:flex;flex-direction:column;justify-content:space-between;"
      onclick="libOpenFolder('${f.id}')"
      ${isDrag ? `draggable="true" ondragstart="libOnDragStart(event,'folder','${f.id}')"` : ''}
      ondragover="libOnDragOver(event,'${f.id}')"
      ondrop="libOnDrop(event,'folder','${f.id}')"
      ondragleave="libOnDragLeave(event)">
      <!-- Actions menu -->
      <div style="position:absolute;top:8px;right:8px;display:flex;gap:4px;" onclick="event.stopPropagation()">
        <button onclick="libRenameFolder('${f.id}')" title="Rename"
          style="background:rgba(255,255,255,0.5);border:none;border-radius:6px;width:24px;height:24px;font-size:0.75rem;cursor:pointer;display:flex;align-items:center;justify-content:center;">✏️</button>
        <button onclick="libDeleteFolder('${f.id}')" title="Delete"
          style="background:rgba(255,255,255,0.5);border:none;border-radius:6px;width:24px;height:24px;font-size:0.75rem;cursor:pointer;display:flex;align-items:center;justify-content:center;">🗑️</button>
      </div>
      <div style="font-size:2rem;line-height:1;margin-bottom:6px;">📁</div>
      <div>
        <div style="font-weight:900;font-size:0.88rem;color:rgba(20,20,50,0.85);word-break:break-word;line-height:1.3;">${f.name}</div>
        <div style="font-size:0.7rem;font-weight:700;color:rgba(20,20,50,0.5);margin-top:3px;">${count} recipe${count !== 1 ? 's' : ''}</div>
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

  const removeBtn = folderId
    ? `<button onclick="event.stopPropagation();libRemoveFromFolder('${r.id}','${folderId}')" title="Move to loose"
         style="background:rgba(0,0,0,0.06);border:none;border-radius:7px;padding:4px 9px;font-size:0.65rem;font-weight:800;cursor:pointer;color:var(--text-muted);white-space:nowrap;">&#x21A9; Remove</button>`
    : '';

  // Thumbnail: real image or dark gradient placeholder
  const thumbHtml = r.thumbnail_url
    ? `<img src="${encodeURI(r.thumbnail_url)}" alt="" style="width:100%;height:100%;object-fit:cover;display:block;">`
    : `<div style="width:100%;height:100%;background:linear-gradient(135deg,#0f1e3a,#1e3a5f);display:flex;align-items:center;justify-content:center;font-size:1.8rem;">🎬</div>`;

  const privBadge = r.private_recipe
    ? `<span style="font-size:0.6rem;font-weight:800;color:#4a90d9;background:#e8f0fb;border-radius:5px;padding:2px 6px;">🔒 Private</span>`
    : `<span style="font-size:0.6rem;font-weight:800;color:#22c55e;background:#dcfce7;border-radius:5px;padding:2px 6px;">🌎 Public</span>`;

  const dragAttr = isDrag && !folderId
    ? `draggable="true" ondragstart="libOnDragStart(event,'recipe','${r.id}')"`
    : '';

  return `
    <div class="lib-recipe-card" id="libR_${r.id}"
      style="background:#fff;border-radius:14px;border:2px solid var(--border-card);overflow:hidden;
             cursor:pointer;transition:box-shadow 0.15s,border-color 0.15s;"
      onclick="libOpenRecipe('${r.id}')"
      ${dragAttr}
      onmouseenter="this.style.boxShadow='0 6px 22px rgba(74,144,217,0.16)';this.style.borderColor='var(--primary)';var ov=this.querySelector('.lib-play-ov');if(ov)ov.style.opacity='1';"
      onmouseleave="this.style.boxShadow='';this.style.borderColor='var(--border-card)';var ov=this.querySelector('.lib-play-ov');if(ov)ov.style.opacity='0';">

      <!-- Thumbnail strip -->
      <div style="position:relative;height:130px;background:#111;overflow:hidden;">
        ${thumbHtml}
        ${mins ? `<div style="position:absolute;bottom:6px;right:8px;background:rgba(0,0,0,0.8);color:#fff;font-size:0.6rem;font-weight:800;padding:2px 7px;border-radius:5px;">${mins}</div>` : ''}
        <div class="lib-play-ov" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.28);opacity:0;transition:opacity 0.18s;">
          <div style="width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,0.92);display:flex;align-items:center;justify-content:center;font-size:1.15rem;">▶</div>
        </div>
      </div>

      <!-- Info row -->
      <div style="padding:10px 12px;display:flex;align-items:center;gap:10px;">
        <div style="flex:1;min-width:0;">
          <div style="font-weight:900;font-size:0.88rem;color:var(--text-heading);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:3px;">${r.title || 'Untitled'}</div>
          <div style="font-size:0.68rem;color:var(--text-muted);font-weight:700;display:flex;gap:6px;align-items:center;">
            ${privBadge}
            ${date ? `<span>${date}</span>` : ''}
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
          ${removeBtn}
          ${isDrag && !folderId
            ? `<div style="font-size:0.65rem;color:var(--text-muted);font-weight:700;">⠿</div>`
            : `<span style="font-size:0.85rem;color:var(--text-muted);">›</span>`}
        </div>
      </div>
    </div>`;
}



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
    <div style="font-weight:800;font-size:1rem;margin-bottom:0.5rem;">No recipes yet</div>
    <div style="font-size:0.85rem;font-weight:600;margin-bottom:1rem;">Create your first recipe to see it here</div>
    <button onclick="switchView('create')" style="background:var(--primary);color:#fff;border:none;border-radius:10px;padding:10px 22px;font-family:var(--font);font-weight:900;font-size:0.88rem;cursor:pointer;">+ Create Recipe</button>
  </div>`;
}

// ── Folder drill-down ──────────────────────────────────────────────────────
window.libOpenFolder = function(id) {
  libOpenFolderId = id;
  libRenderContent();
};

function libRenderFolderView(content) {
  const f = libGetFolder(libOpenFolderId);
  if (!f) { libOpenFolderId = null; libRenderContent(); return; }

  const recipes = libAllRecipes.filter(r => (f.recipeIds||[]).includes(r.id));
  const q = libSearchQuery.toLowerCase();
  const filtered = q ? recipes.filter(r => (r.title||'').toLowerCase().includes(q)) : recipes;

  // Find loose recipes NOT already in this folder for the "Add" picker
  const allFolderIds = new Set(libState.folders.flatMap(ff => ff.recipeIds||[]));
  const addable = libAllRecipes.filter(r => !allFolderIds.has(r.id));

  let html = `
    <!-- Back + folder header -->
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:1.25rem;">
      <button onclick="libCloseFolder()"
        style="background:var(--bg-card-soft);border:2px solid var(--border-card);border-radius:9px;padding:7px 14px;font-family:var(--font);font-weight:900;font-size:0.85rem;cursor:pointer;">← Back</button>
      <div style="width:36px;height:36px;border-radius:10px;background:${f.color};display:flex;align-items:center;justify-content:center;font-size:1.4rem;flex-shrink:0;">📁</div>
      <div>
        <div style="font-weight:900;font-size:1.1rem;color:var(--text-heading);">${f.name}</div>
        <div style="font-size:0.7rem;color:var(--text-muted);font-weight:700;">${recipes.length} recipe${recipes.length!==1?'s':''}</div>
      </div>
    </div>`;

  // Add recipe dropdown
  if (addable.length) {
    html += `<div style="background:#fff;border-radius:12px;border:2px solid var(--border-card);padding:12px 14px;margin-bottom:1rem;display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
      <span style="font-size:0.75rem;font-weight:800;color:var(--text-muted);white-space:nowrap;">Add recipe:</span>
      <select id="libAddRecipePicker" style="flex:1;min-width:140px;border:2px solid var(--border-card);border-radius:8px;padding:6px 10px;font-family:var(--font);font-weight:700;font-size:0.82rem;outline:none;background:#fff;">
        <option value="">— pick a recipe —</option>
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
      <div style="font-weight:700;font-size:0.88rem;">${q ? 'No matching recipes' : 'This folder is empty — add recipes above'}</div>
    </div>`;
  } else {
    html += `<div style="display:flex;flex-direction:column;gap:10px;">`;
    filtered.forEach(r => { html += libRecipeCardHTML(r, f.id); });
    html += `</div>`;
  }

  content.innerHTML = html;
}

window.libCloseFolder = function() {
  libOpenFolderId = null;
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
  ['az','za','custom'].forEach(m => {
    const btn = document.getElementById('libSort' + m.charAt(0).toUpperCase() + m.slice(1));
    if (!btn) return;
    const active = m === mode;
    btn.style.background = active ? 'var(--primary)' : 'transparent';
    btn.style.color      = active ? '#fff' : 'var(--text-muted)';
  });
}

// ── Search ────────────────────────────────────────────────────────────────
window.libSearch = function(q) {
  libSearchQuery = q || '';
  libRenderContent();
};

// ── Folder CRUD ───────────────────────────────────────────────────────────
window.libCreateFolder = function() {
  libEditFolderId  = null;
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

window.libSaveFolder = function() {
  const input = document.getElementById('libFolderNameInput');
  const name  = input?.value?.trim();
  if (!name) { input?.focus(); return; }

  if (libEditFolderId) {
    const f = libGetFolder(libEditFolderId);
    if (f) { f.name = name; f.color = libSelectedColor; }
  } else {
    const newFolder = { id: libMakeId(), name, color: libSelectedColor, recipeIds: [] };
    libState.folders.push(newFolder);
    libState.customOrder.push('folder:' + newFolder.id);
  }
  libSave();
  libCloseModal();
  libRenderContent();
};

window.libDeleteFolder = function(id) {
  if (!confirm('Delete this folder? Recipes inside will be moved back to loose.')) return;
  libState.folders = libState.folders.filter(f => f.id !== id);
  libState.customOrder = libState.customOrder.filter(k => k !== 'folder:' + id);
  libSave();
  if (libOpenFolderId === id) libOpenFolderId = null;
  libRenderContent();
};

window.libCloseModal = function() {
  const modal = document.getElementById('libFolderModal');
  if (modal) modal.style.display = 'none';
  libEditFolderId = null;
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

window.libOnDrop = function(e, targetType, targetId) {
  e.preventDefault();
  e.currentTarget.style.outline = '';
  if (!libDragItem) return;

  // If dropping a recipe onto a folder card → move recipe into folder
  if (libDragItem.type === 'recipe' && targetType === 'folder') {
    const f = libGetFolder(targetId);
    if (f && !f.recipeIds.includes(libDragItem.id)) {
      f.recipeIds.push(libDragItem.id);
      libSave();
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

// ── Trigger render when tab is opened ─────────────────────────────────────
const _origSwitchView = window.switchView;
window.switchView = function(view) {
  // Hide the public-profile overlay when switching away
  if (view !== 'my-profile' && pubFromTab) {
    const pp = document.getElementById('view-public-profile');
    if (pp) pp.style.display = 'none';
    pubFromTab = false;
  }

  _origSwitchView?.(view);

  if (view === 'grid-view') {
    if (!libState) libLoad();
    renderLibrary();
  }
  if (view === 'profile') {
    mySpaceInit();
  }
  if (view === 'my-profile') {
    // Load own public channel
    if (!currentUser) {
      openAuthModal();
      // Revert to previous view
      return;
    }
    pubFromTab = true;
    openPublicProfile(currentUser.email, 'my-profile');
  }
};

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
window.switchSidebarTab      = switchSidebarTab;
window.toggleVideoPlayback   = toggleVideoPlayback;
window.setPlaybackMode       = setPlaybackMode;
window.seekToStep            = seekToStep;
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
  if (!file.type.startsWith('video/')) { showTip('Please select a video file (MP4, MOV, WebM)'); return; }
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
    if (statusMsg) statusMsg.textContent = '✅ Uploaded! (File >25MB — use 🤖 AI Magic to analyze)';
    if (saveBtn)   saveBtn.textContent   = '✅ Save Recipe';
    showTip('Video uploaded! Use the 🤖 AI Magic section to analyze it manually.');
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
        return { time: t, endTime: end, label: l.label || 'Step', displayTime: `${m}:${s}` };
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
    setAIStatus('⚠️ Auto-analysis failed — use 🤖 AI Magic to retry.', true);
    if (statusMsg) statusMsg.textContent = '✅ Uploaded (AI failed — retry in AI Magic)';
    if (saveBtn)   saveBtn.textContent   = '✅ Save Recipe';
  }
}

function showEditorStage(videoUrl) {
  document.getElementById('createStage1').style.display = 'none';
  document.getElementById('createStage2').style.display = 'flex';

  const videoEl = document.getElementById('uploadedVideoPlayer');
  if (!videoEl) return;

  // Use HLS.js for Cloudflare Stream HLS, blob URL plays natively
  if (videoUrl.includes('videodelivery.net') && window.Hls && Hls.isSupported()) {
    const hls = new Hls();
    hls.loadSource(videoUrl);
    hls.attachMedia(videoEl);
  } else {
    videoEl.src = videoUrl;
  }

  videoEl.addEventListener('timeupdate', () => {
    const t = videoEl.currentTime;
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60).toString().padStart(2, '0');
    const el = document.getElementById('createCurrentTime');
    if (el) el.textContent = `${m}:${s}`;
  });

  createStepsArr = [];
  renderCreateSteps();
  if (window.lucide) lucide.createIcons();
}

// Step colors — one per step, Wii-style pastels
const STEP_COLORS = ['#a8d8f0','#b8f0c8','#f0d8a8','#d8b8f0','#f0b8c8','#a8f0e8','#f0ebb8','#c8b8f0'];

let videoDuration   = 0;
let previewInterval = null;
let dragSrcIndex    = null;

window.onVideoLoaded = function() {
  const videoEl = document.getElementById('uploadedVideoPlayer');
  if (videoEl) {
    videoDuration = videoEl.duration || 0;
    const m = Math.floor(videoDuration / 60);
    const s = Math.floor(videoDuration % 60).toString().padStart(2, '0');
    const dur = document.getElementById('timelineDuration');
    const cdl = document.getElementById('chapterDurationLabel');
    const timeStr = `${m}:${s}`;
    if (dur) dur.textContent = timeStr;
    if (cdl) cdl.textContent = timeStr;

    // Update playhead and current time as video plays
    videoEl.addEventListener('timeupdate', () => {
      const t  = videoEl.currentTime;
      const cm = Math.floor(t / 60);
      const cs = Math.floor(t % 60).toString().padStart(2, '0');
      const el = document.getElementById('createCurrentTime');
      if (el) el.textContent = `${cm}:${cs}`;
      // Drive custom scrubber fill + thumb
      updateVideoScrubber(videoEl);
    });

    // Sync play/pause button icon
    videoEl.addEventListener('play',  () => { const b = document.getElementById('videoPlayBtn'); if (b) b.textContent = '⏸'; });
    videoEl.addEventListener('pause', () => { const b = document.getElementById('videoPlayBtn'); if (b) b.textContent = '▶'; });
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
// ── Custom Video Player controls ──────────────────────────────────────────
window.toggleVideoPlay = function() {
  const vid = document.getElementById('uploadedVideoPlayer');
  const btn = document.getElementById('videoPlayBtn');
  if (!vid) return;
  if (vid.paused) { vid.play(); if (btn) btn.textContent = '⏸'; }
  else            { vid.pause(); if (btn) btn.textContent = '▶'; }
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

// ── Timeline renderer — markers on the video scrubber ──────────────────────
function renderTimeline() {
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
    const color    = STEP_COLORS[i % STEP_COLORS.length];

    // Full-height colored chapter band — label inside
    const band = document.createElement('div');
    band.style.cssText = `position:absolute;top:0;left:${startPct}%;width:${widthPct}%;height:100%;background:${color};opacity:1;border-right:2px solid rgba(255,255,255,0.5);box-sizing:border-box;cursor:pointer;overflow:hidden;`;
    // Clicking the band background still seeks
    band.addEventListener('click', (e) => { videoScrubberSeek(e); });
    // Number badge + label + hover-delete button
    band.innerHTML = `
      <div style="padding:3px 5px;display:flex;flex-direction:column;gap:1px;height:100%;position:relative;">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:2px;">
          <div style="font-size:0.5rem;font-weight:900;color:rgba(20,20,50,0.7);line-height:1.6;">${i+1}</div>
          <button class="band-del-btn"
            title="Delete stop ${i+1}"
            style="background:rgba(220,30,30,0.18);border:none;border-radius:3px;width:16px;height:16px;font-size:0.75rem;font-weight:900;color:rgba(180,0,0,0.9);cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;opacity:0;transition:opacity 0.15s,background 0.1s;flex-shrink:0;line-height:1;"
            onmouseenter="this.style.background='rgba(220,30,30,0.38)'"
            onmouseleave="this.style.background='rgba(220,30,30,0.18)'">×</button>
        </div>
        <div style="font-size:0.6rem;font-weight:800;color:rgba(20,20,50,0.85);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.2;">${step.label}</div>
        <div style="font-size:0.5rem;font-weight:600;color:rgba(20,20,50,0.55);margin-top:auto;">${step.displayTime}</div>
      </div>`;
    // Wire the delete button (created via innerHTML so use querySelector)
    const delBtn = band.querySelector('.band-del-btn');
    if (delBtn) {
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // don't seek
        removeCreateStep(i);
      });
    }
    // Show/hide delete button on band hover
    band.addEventListener('mouseenter', () => { if (delBtn) delBtn.style.opacity = '1'; });
    band.addEventListener('mouseleave', () => { if (delBtn) delBtn.style.opacity = '0'; });
    markers.appendChild(band);

    // Draggable handle — thin vertical divider with circle dot at top
    const handle = document.createElement('div');
    handle.dataset.isHandle = '1';
    handle.title = `Drag to move: ${step.label}`;
    handle.style.cssText = `
      position:absolute; top:0; bottom:0; left:${startPct}%;
      width:14px; transform:translateX(-50%);
      cursor:ew-resize; z-index:30;
      display:flex; align-items:flex-start; justify-content:center;
      pointer-events:auto;
    `;
    handle.innerHTML = `<div style="width:12px;height:12px;margin-top:2px;border-radius:50%;background:#fff;border:2.5px solid ${color};box-shadow:0 2px 5px rgba(0,0,0,0.3);pointer-events:none;flex-shrink:0;"></div>`;

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
  if (mode === 'steps') {
    if (btnSteps) { btnSteps.style.background = 'var(--primary)'; btnSteps.style.color = '#fff'; }
    if (btnScrub) { btnScrub.style.background = 'transparent';    btnScrub.style.color = 'var(--text-muted)'; }
    if (hint)  hint.textContent = 'Jump between loop stops';
  } else {
    if (btnScrub) { btnScrub.style.background = 'var(--primary)'; btnScrub.style.color = '#fff'; }
    if (btnSteps) { btnSteps.style.background = 'transparent';    btnSteps.style.color = 'var(--text-muted)'; }
    if (hint)  hint.textContent = 'Seek video ±1 second';
  }
};

// Flash the on-screen arrow button briefly when keyboard triggers it
function flashNavBtn(dir) {
  const btn = document.getElementById(dir < 0 ? 'navPrevBtn' : 'navNextBtn');
  if (!btn) return;
  btn.style.background = 'var(--primary)';
  btn.style.color = '#fff';
  setTimeout(() => { btn.style.background = 'var(--bg-card-soft)'; btn.style.color = ''; }, 180);
}

// ── Global arrow-key handler (active on Create page) ──────────────────────
document.addEventListener('keydown', function(e) {
  // Ignore if user is typing in an input, textarea, or contenteditable
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;
  // Only active when Create editor (stage 2) is visible
  const stage2 = document.getElementById('createStage2');
  if (!stage2 || stage2.style.display === 'none' || stage2.style.display === '') return;

  if (e.key === 'ArrowLeft') {
    e.preventDefault();
    if (keyboardMode === 'steps') {
      flashNavBtn(-1);
      window.navStep(-1);
    } else {
      const vid = document.getElementById('uploadedVideoPlayer');
      if (vid) { vid.currentTime = Math.max(0, vid.currentTime - 1); flashNavBtn(-1); }
    }
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    if (keyboardMode === 'steps') {
      flashNavBtn(1);
      window.navStep(1);
    } else {
      const vid = document.getElementById('uploadedVideoPlayer');
      if (vid) { vid.currentTime = Math.min(vid.duration || Infinity, vid.currentTime + 1); flashNavBtn(1); }
    }
  } else if (e.key === ' ') {
    // Spacebar: play/pause
    const stage2check = document.getElementById('createStage2');
    if (stage2check && stage2check.style.display !== 'none') {
      e.preventDefault();
      window.toggleVideoPlay?.();
    }
  }
});


function refreshStepNavigator() {
  const label = document.getElementById('stepNavLabel');
  const count = document.getElementById('stepNavCount');
  if (!createStepsArr.length) {
    if (label) label.textContent = 'No loop stops yet';
    if (count) count.textContent = 'Tap ▶ AI: Place Loop Stops or add manually';
    return;
  }
  const i    = Math.max(0, Math.min(currentNavStepIndex, createStepsArr.length - 1));
  currentNavStepIndex = i;
  const step = createStepsArr[i];
  if (label) label.textContent = step.label || `Step ${i + 1}`;
  if (count) count.textContent  = `${i + 1} of ${createStepsArr.length}  ·  ${step.displayTime || '0:00'}`;
}

window.navStep = function(dir) {
  if (!createStepsArr.length) return;
  currentNavStepIndex = Math.max(0, Math.min(currentNavStepIndex + dir, createStepsArr.length - 1));
  refreshStepNavigator();
  if (previewInterval !== null) {
    // Loop is active — switch loop to the new step immediately
    previewStepLoop(currentNavStepIndex);
  } else {
    // Not looping — just seek the video to this step's start
    const vid = document.getElementById('uploadedVideoPlayer');
    if (vid) vid.currentTime = createStepsArr[currentNavStepIndex].time ?? 0;
  }
};

window.previewCurrentNavStep = function() {
  if (!createStepsArr.length) return;
  previewStepLoop(currentNavStepIndex);
};

function renderCreateSteps() {
  const list  = document.getElementById('createStepsList');
  const count = document.getElementById('createStepCount');
  if (!list) return;
  if (count) count.textContent = `(${createStepsArr.length})`;

  if (!createStepsArr.length) {
    list.innerHTML = `<div style="color:var(--text-muted);font-weight:600;font-size:0.8rem;padding:8px 0;">No loop stops yet — run AI or tap 📍 Add Stop while playing</div>`;
    list.style.flexDirection = 'column';
    refreshStepNavigator();
    return;
  }

  // Horizontal scrolling row of cards
  list.style.flexDirection = 'row';
  list.style.flexWrap      = 'nowrap';
  list.style.overflowX     = 'auto';
  list.style.overflowY     = 'hidden';
  list.style.gap           = '8px';
  list.style.paddingBottom = '6px';

  list.innerHTML = createStepsArr.map((step, i) => {
    const color  = STEP_COLORS[i % STEP_COLORS.length];
    const rawEnd = step.endTime ?? (createStepsArr[i + 1]?.time ?? videoDuration);
    const em = Math.floor(rawEnd / 60);
    const es = Math.floor(rawEnd % 60).toString().padStart(2, '0');
    const desc = (step.description || '').replace(/"/g, '&quot;');
    return `
      <div id="stepRow_${i}"
        style="min-width:168px;max-width:168px;flex-shrink:0;background:var(--bg-card-soft);border-radius:12px;border:2px solid ${color};padding:8px;display:flex;flex-direction:column;gap:5px;">
        <div style="display:flex;align-items:center;gap:5px;">
          <div style="width:18px;height:18px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-size:0.6rem;font-weight:900;color:#446;flex-shrink:0;">${i+1}</div>
          <input value="${step.label.replace(/"/g,'&quot;')}" onchange="updateStepLabel(${i},this.value)"
            style="flex:1;min-width:0;background:transparent;border:none;font-family:var(--font);font-size:0.75rem;font-weight:800;color:var(--text-heading);outline:none;">
          <button onclick="removeCreateStep(${i})" title="Delete this stop"
            style="background:none;border:1px solid rgba(180,0,0,0.2);border-radius:4px;cursor:pointer;color:#c00;font-size:0.8rem;padding:0 4px;flex-shrink:0;line-height:1.4;font-weight:900;"
            onmouseenter="this.style.background='rgba(200,0,0,0.1)'" onmouseleave="this.style.background='none'">×</button>
        </div>
        <div style="font-size:0.58rem;font-weight:700;color:var(--primary);font-variant-numeric:tabular-nums;">${step.displayTime} → ${em}:${es}</div>
        <textarea placeholder="Add notes for this step…" rows="3"
          onchange="updateStepDescription(${i},this.value)"
          style="width:100%;box-sizing:border-box;background:#fff;border:1px solid rgba(0,0,0,0.08);border-radius:6px;padding:5px;font-family:var(--font);font-size:0.68rem;font-weight:500;color:var(--text-body);resize:none;outline:none;line-height:1.4;">${desc}</textarea>
        <div style="display:flex;gap:4px;">
          <button onclick="previewStepLoop(${i})"
            style="flex:1;background:${color};border:none;border-radius:6px;padding:5px 2px;font-family:var(--font);font-size:0.65rem;font-weight:900;cursor:pointer;color:#446;">▶ Loop</button>
          <button onclick="navToStep(${i})"
            style="flex:1;background:transparent;border:1px solid var(--border-card);border-radius:6px;padding:5px 2px;font-family:var(--font);font-size:0.65rem;font-weight:900;cursor:pointer;color:var(--text-heading);">⏩ Go</button>
        </div>
      </div>`;
  }).join('');
  refreshStepNavigator();
}


// ── Preview loop ───────────────────────────────────────────────────────────
window.previewStepLoop = function(i) {
  const videoEl = document.getElementById('uploadedVideoPlayer');
  const step    = createStepsArr[i];
  if (!videoEl || !step) return;

  stopPreviewLoop();

  // Keep navigator in sync with the step being looped
  currentNavStepIndex = i;
  refreshStepNavigator();

  // endTime: use explicit value, then next step's start, then video end
  const endTime = (step.endTime != null)
    ? step.endTime
    : (createStepsArr[i + 1]?.time ?? videoDuration);

  // Seek to step start and play
  videoEl.currentTime = step.time;
  videoEl.play();

  const labelEl = document.getElementById('previewingLabel');
  const stopBtn = document.getElementById('stopPreviewBtn');
  if (labelEl) labelEl.style.display  = 'inline';
  if (stopBtn) stopBtn.style.display  = 'inline-block';

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
  if (labelEl) labelEl.style.display  = 'none';
  if (stopBtn) stopBtn.style.display  = 'none';
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
window.updateStepDescription = (i, v) => { if (createStepsArr[i]) createStepsArr[i].description = v; };
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
    canvas.width  = Math.min(videoEl.videoWidth,  640);
    canvas.height = Math.min(videoEl.videoHeight, 360);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
    return new Promise(resolve => canvas.toBlob(b => resolve(b), 'image/jpeg', 0.82));
  } catch { return null; }
}

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
    }));

    // Capture thumbnail from the video element
    let thumbnailUrl = null;
    try {
      const videoEl2 = document.getElementById('uploadedVideoPlayer');
      if (videoEl2 && videoEl2.videoWidth > 0) {
        const blob = await captureThumbnail(videoEl2);
        if (blob) {
          const { supabase: sb } = await import('./supabase-client.js');
          const ext    = 'jpg';
          const folder = currentUser.email.replace(/[@.]/g, '_');
          const fname  = 'thumbnails/' + folder + '/' + Date.now() + '.' + ext;
          const { error: upErr } = await sb.storage.from('videos').upload(fname, blob, { contentType: 'image/jpeg', upsert: true });
          if (!upErr) {
            const { data: urlData } = sb.storage.from('videos').getPublicUrl(fname);
            thumbnailUrl = urlData.publicUrl;
          }
        }
      }
    } catch (tErr) {
      console.warn('Thumbnail capture failed (non-fatal):', tErr);
    }

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
        videoUrl = localVideoURL || null;
      }
    } else {
      videoUrl = localVideoURL || null;
    }

    const savedRecipe = await createRecipe({
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
    });

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
    + '<button onclick="switchView(\'library\')" class="btn btn-primary" style="border-radius:999px;padding:12px 28px;">&#x1F4DA; View in Library</button>'
    + '<button onclick="resetCreateView()" class="btn" style="border-radius:999px;padding:12px 28px;">&#x2795; Upload Another</button>'
    + '</div>';
}



window.addNewlySavedToFolder   = function() {};
window.createAndAddToNewFolder = function() {};


window.resetCreateView = function() {
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
  document.getElementById('createStage3').style.display    = 'none';
  document.getElementById('uploadProgressWrap').style.display = 'none';
  document.getElementById('uploadProgressBar').style.width = '0%';
  document.getElementById('uploadProgressBar').style.background = 'linear-gradient(90deg,var(--primary),#6aaee8)';
  document.getElementById('newRecipeTitleInput').value = '';

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

// Store the file when user picks it (called in handleFileSelect)
// We patch handleFileSelect to also save uploadedFile
const _origHandleFileSelect = window.handleFileSelect;
window.handleFileSelect = async function(file) {
  uploadedFile     = file;       // save for AI
  cachedTranscript = null;       // clear any previous cache
  cachedSegments   = null;
  return _origHandleFileSelect(file);
};

// ── Helper: set AI status message ──────────────────────────────────────────
function setAIStatus(msg, show = true) {
  const el = document.getElementById('aiStatus');
  const tx = document.getElementById('aiStatusText');
  if (el) el.style.display = show ? 'block' : 'none';
  if (tx) tx.textContent   = msg;
}

// ── Step 1: Transcribe ─────────────────────────────────────────────────────
window.transcribeVideo = async function() {
  if (!uploadedFile) {
    showTip('Upload a video first before transcribing.');
    return;
  }

  if (uploadedFile.size > 25 * 1024 * 1024) {
    showTip('Video is over 25MB — Whisper has a 25MB limit. Try a shorter clip.');
    return;
  }

  // Use cache if already transcribed
  if (cachedTranscript) {
    showTip('Already transcribed! Use the buttons below to generate content.');
    return;
  }

  const btn = document.getElementById('transcribeBtn');
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

    setAIStatus('✅ Transcription done! Now generate content below.');
    if (btn) { btn.textContent = '✅ Transcribed'; }
    showTip('Transcription complete! Tap any button to generate content.');

  } catch (err) {
    console.error('[AI] Transcription error:', err);
    setAIStatus('❌ ' + (err.message || 'Transcription failed.'));
    if (btn) { btn.disabled = false; btn.textContent = '🎤 Step 1: Transcribe Video'; }
    showTip('Transcription failed: ' + err.message);
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

  try {
    const res  = await fetch('/api/ai/loops', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript: cachedTranscript, segments: cachedSegments }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    const loops = data.loops || [];
    if (!loops.length) {
      setAIStatus('⚠️ No steps detected — try adding them manually.');
      return;
    }

    // Replace timeline steps with AI-detected ones (with start AND end times)
    createStepsArr = loops.map(l => {
      const t   = Number(l.time) || 0;
      const end = l.endTime != null ? Number(l.endTime) : null;
      const m = Math.floor(t / 60);
      const s = Math.floor(t % 60).toString().padStart(2, '0');
      return {
        time:        t,
        endTime:     end,
        label:       l.label || 'Step',
        displayTime: `${m}:${s}`
      };
    }).sort((a, b) => a.time - b.time);

    renderCreateSteps();
    renderTimeline();

    setAIStatus(`✅ ${loops.length} steps placed on your timeline!`);
    showTip(`AI placed ${loops.length} loop markers — check your timeline!`);
  } catch (err) {
    setAIStatus('❌ ' + err.message);
    showTip('Failed: ' + err.message);
  }
};

// ── On-demand Gemini — called once per file, result cached for all AI buttons ─
let _geminiCache     = null; // cached result for current file
let _geminiCacheFile = null; // which file was analyzed (detect new uploads)

async function tryGeminiFor(task) {
  if (!uploadedFile) return null;

  // Return cached result if same file (free reuse)
  if (_geminiCache && _geminiCacheFile === uploadedFile) {
    return _geminiCache;
  }

  setAIStatus('🤖 Uploading to Gemini…', true);
  const formData = new FormData();
  formData.append('video', uploadedFile, uploadedFile.name);

  const res  = await fetch('/api/ai/gemini-analyze', { method: 'POST', body: formData });
  const data = await res.json();

  if (!res.ok || data.error) {
    // Throw the REAL server error so buttons can show it
    throw new Error(data.error || `Gemini server error (${res.status})`);
  }

  // Cache — subsequent taps reuse for free
  _geminiCache     = data;
  _geminiCacheFile = uploadedFile;
  return data;
}

// ── AI: Write Ingredients only ─────────────────────────────────────────────
window.aiWriteIngredients = async function() {
  setAIStatus('✍️ Writing ingredients...', true);
  try {
    // Try Gemini first
    const gem = await tryGeminiFor('ingredients');
    if (gem?.ingredients?.length) {
      const box = document.getElementById('ingredientsText');
      if (box) box.value = gem.ingredients.join('\n');
      window._aiIngredients = gem.ingredients.join('\n');
      const r = document.getElementById('ingredientsResult');
      if (r) r.style.display = 'block';
      setAIStatus('✅ Ingredients written by Gemini!', true);
      showTip('✍️ Ingredients filled in — edit as needed.');
      return;
    }
    // Fallback: Whisper → GPT
    if (!cachedTranscript) await window.transcribeVideo();
    if (!cachedTranscript) { setAIStatus('❌ Need transcript first — video may be over 25MB.', true); return; }
    await window.generateIngredients();
    setAIStatus('✅ Ingredients written!', true);
  } catch (err) {
    setAIStatus('❌ ' + (err.message || 'Failed to write ingredients.'), true);
  }
};

// ── AI: Write Steps only ───────────────────────────────────────────────────
window.aiWriteSteps = async function() {
  setAIStatus('📋 Writing step instructions...', true);
  try {
    // Try Gemini first
    const gem = await tryGeminiFor('steps');
    if (gem?.steps?.length) {
      const box = document.getElementById('stepsText');
      if (box) box.value = gem.steps.join('\n');
      window._aiStepsText = gem.steps.join('\n');
      const r = document.getElementById('stepsResult');
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
    showTip('Add loop stops first, then tap ✍️ AI Descriptions.');
    return;
  }
  showTip('✍️ AI is writing descriptions for each loop stop…');
  try {
    const steps = createStepsArr.map((s, i) => ({
      index: i,
      label: s.label,
      startTime: s.time,
      endTime: s.endTime ?? (createStepsArr[i + 1]?.time ?? videoDuration),
    }));
    const videoUrl = document.getElementById('uploadedVideoPlayer')?.src || window._uploadedVideoUrl || '';
    const res = await fetch('/api/ai/describe-steps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ steps, videoUrl }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    // Apply descriptions
    (data.descriptions || []).forEach((desc, i) => {
      if (createStepsArr[i]) createStepsArr[i].description = desc;
    });
    renderCreateSteps();
    showTip('✅ Descriptions written! Edit any card to customize.');
  } catch (err) {
    showTip('❌ ' + (err.message || 'Could not generate descriptions.'));
  }
};

// ── AI: Do Everything ──────────────────────────────────────────────────────
window.aiDoEverything = async function() {
  setAIStatus('⚡ Running all AI features...', true);
  const btn = document.getElementById('aiLoopBtn');
  try {
    const gem = await tryGeminiFor('all');
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
        const r = document.getElementById('stepsResult'); if (r) r.style.display='block';
      }
      createStepsArr = gem.loops.map((l, i) => {
        const t   = Number(l.start ?? l.time) || 0;
        const end = (l.end ?? l.endTime) != null ? Number(l.end ?? l.endTime) : null;
        const mm  = Math.floor(t / 60);
        const ss  = Math.floor(t % 60).toString().padStart(2, '0');
        return { time: t, endTime: end, label: l.label || gem.steps?.[i] || `Step ${i+1}`, displayTime: `${mm}:${ss}` };
      }).sort((a, b) => a.time - b.time);
      renderCreateSteps(); renderTimeline();
      setAIStatus(`✅ Done! Gemini placed ${gem.loops.length} loops + wrote everything.`, true);
      showTip(`⚡ All done! ${gem.loops.length} loop stops placed.`);
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
    } else {
      setAIStatus('❌ Video too large for Whisper. Add your Gemini key to unlock large video support.', true);
    }
  } catch (err) {
    setAIStatus('❌ ' + (err.message || 'Error.'), true);
  }
};

// ── Place Loop Stops (primary AI button) ──────────────────────────────────
window.doItAll = async function() {
  const btn = document.getElementById('aiLoopBtn');
  if (btn) btn.disabled = true;

  try {
    setAIStatus('🤖 Gemini is analyzing your video...', true);
    const gem = await tryGeminiFor('loops');

    if (gem?.loops?.length) {
      // ✅ Gemini worked — apply loops + optionally title
      if (gem.title) {
        const t = document.getElementById('newRecipeTitleInput');
        if (t && !t.value) t.value = gem.title;
      }
      createStepsArr = gem.loops.map((l, i) => {
        const t   = Number(l.start ?? l.time) || 0;
        const end = (l.end ?? l.endTime) != null ? Number(l.end ?? l.endTime) : null;
        const mm  = Math.floor(t / 60);
        const ss  = Math.floor(t % 60).toString().padStart(2, '0');
        return { time: t, endTime: end, label: l.label || gem.steps?.[i] || `Step ${i+1}`, displayTime: `${mm}:${ss}` };
      }).sort((a, b) => a.time - b.time);
      renderCreateSteps();
      renderTimeline();
      setAIStatus(`✅ Gemini placed ${gem.loops.length} loop stops!`, true);
      showTip(`🤖 ${gem.loops.length} loop stops placed — check the timeline!`);
      if (btn) {
        btn.disabled = false;
        btn.style.background = 'linear-gradient(135deg,#16a34a,#22c55e)';
        btn.innerHTML = '<span>✅</span><span>Loop Stops Placed!</span>';
      }
      return;
    }

    // ── Gemini unavailable — use Whisper + GPT fallback ─────────────────
    setAIStatus('🎤 Using Whisper fallback...', true);

    // Use cached transcript if already transcribed
    if (!cachedTranscript) {
      if (!uploadedFile) {
        setAIStatus('⚠️ Upload a video first.', true);
        showTip('Upload your video first, then tap the button.');
        if (btn) btn.disabled = false;
        return;
      }
      await window.transcribeVideo();
    }

    if (!cachedTranscript) {
      setAIStatus('❌ Could not transcribe — video may be over 25MB. Add your Gemini key to Railway to support any size.', true);
      if (btn) btn.disabled = false;
      return;
    }

    setAIStatus('🔁 Detecting loop stops from transcript...', true);
    await window.generateLoops();
    setAIStatus('✅ Loop stops placed!', true);
    showTip('🤖 Loop stops placed from transcript — check the timeline!');
    if (btn) {
      btn.disabled = false;
      btn.style.background = 'linear-gradient(135deg,#16a34a,#22c55e)';
      btn.innerHTML = '<span>✅</span><span>Loop Stops Placed!</span>';
    }

  } catch (err) {
    setAIStatus('❌ ' + (err.message || 'Connection error — try again.'), true);
    if (btn) btn.disabled = false;
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

