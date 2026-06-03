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
  if (viewId === 'profile')  loadProfileRecipes();
  if (viewId === 'create')   initCreateView();

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

function openWidgetRecipe(title) {
  switchView('mobile-player');
  seekToStep(1); // open with step 2 ready
  showTip(`Loaded: ${title}`);
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
    } else {
      resetProfilePage();
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
        <div class="folder-card-thumb" onclick="openWidgetRecipe('${r.title.replace(/'/g, "'")}')">
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
      onclick="openWidgetRecipe('${(r.title||'').replace(/'/g, '\'').replace(/"/g,'&quot;')}')">  
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:0.75rem;">
        <div style="width:44px;height:44px;border-radius:14px;background:linear-gradient(135deg,#4a90d9,#6aaee8);display:flex;align-items:center;justify-content:center;font-size:1.3rem;box-shadow:0 4px 12px rgba(74,144,217,0.25);">🍳</div>
        ${badge}
      </div>
      <h3 style="font-size:1rem;font-weight:900;color:var(--text-heading);margin-bottom:6px;line-height:1.3;">${r.title || 'Untitled Recipe'}</h3>
      <p style="font-size:0.78rem;color:var(--text-muted);font-weight:600;margin-bottom:${isOwner ? '0' : '1rem'};">by ${r.creator || 'Chef'}</p>
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
    const videoUrl = uploadedVideoUID
      ? `https://videodelivery.net/${uploadedVideoUID}/manifest/video.m3u8`
      : localVideoURL || null;

    const { createRecipe } = await import('./supabase-client.js');
    await createRecipe({
      title,
      creator:  currentUser.email,
      duration: videoEl?.duration || 0,
      steps:    createStepsArr.map(s => s.label),
      loops:    createStepsArr.map(s => s.time),
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

  // 1️⃣ Show LOCAL preview immediately so user can start marking steps right away
  localVideoURL = URL.createObjectURL(file);
  uploadedVideoUID = null;
  showEditorStage(localVideoURL);

  // 2️⃣ Upload to Cloudflare Stream in the background
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
          if (statusMsg)  statusMsg.textContent = '✅ Uploaded to Cloudflare Stream!';
          if (saveBtn)    saveBtn.textContent   = '✅ Save Recipe';
          showTip('Video uploaded to Cloudflare! You can now save your recipe.');
          resolve();
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

function showEditorStage(videoUrl) {
  document.getElementById('createStage1').style.display = 'none';
  document.getElementById('createStage2').style.display = 'block';

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
    if (dur) dur.textContent = `${m}:${s}`;

    // Update playhead and current time as video plays
    videoEl.addEventListener('timeupdate', () => {
      const t = videoEl.currentTime;
      const cm = Math.floor(t / 60);
      const cs = Math.floor(t % 60).toString().padStart(2, '0');
      const el = document.getElementById('createCurrentTime');
      if (el) el.textContent = `${cm}:${cs}`;
      // Move playhead
      if (videoDuration > 0) {
        const ph = document.getElementById('timelinePlayhead');
        if (ph) ph.style.left = (t / videoDuration * 100) + '%';
      }
    });
  }
  showTip('Video ready! Play it and tap "📍 Add Step" to mark steps.');
};

window.addStepAtCurrentTime = function() {
  const videoEl = document.getElementById('uploadedVideoPlayer');
  if (!videoEl) return;
  const time = videoEl.currentTime;
  const m = Math.floor(time / 60);
  const s = Math.floor(time % 60).toString().padStart(2, '0');
  createStepsArr.push({ time, label: `Step ${createStepsArr.length + 1}`, displayTime: `${m}:${s}` });
  createStepsArr.sort((a, b) => a.time - b.time);
  renderCreateSteps();
  renderTimeline();
  showTip(`Step marked at ${m}:${s} — rename it in the list!`);
};

// ── Timeline renderer ──────────────────────────────────────────────────────
function renderTimeline() {
  const timeline = document.getElementById('createTimeline');
  if (!timeline || videoDuration <= 0) return;

  // Keep the playhead, remove old segments
  const playhead = document.getElementById('timelinePlayhead');
  timeline.innerHTML = '';
  if (playhead) timeline.appendChild(playhead);

  createStepsArr.forEach((step, i) => {
    const startPct = (step.time / videoDuration) * 100;
    const nextTime = (createStepsArr[i + 1]?.time) ?? videoDuration;
    const widthPct = ((nextTime - step.time) / videoDuration) * 100;
    const color    = STEP_COLORS[i % STEP_COLORS.length];

    const seg = document.createElement('div');
    seg.style.cssText = `
      position:absolute; top:0; left:${startPct}%; width:${widthPct}%;
      height:100%; background:${color}; opacity:0.85;
      display:flex; align-items:center; justify-content:center;
      overflow:hidden; border-right:2px solid rgba(255,255,255,0.6);
    `;
    seg.innerHTML = `<span style="font-size:0.65rem;font-weight:800;color:#446;white-space:nowrap;padding:0 4px;overflow:hidden;text-overflow:ellipsis;">${step.label}</span>`;
    timeline.appendChild(seg);
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
function renderCreateSteps() {
  const list  = document.getElementById('createStepsList');
  const count = document.getElementById('createStepCount');
  if (!list) return;
  if (count) count.textContent = `(${createStepsArr.length})`;

  if (!createStepsArr.length) {
    list.innerHTML = `<div style="text-align:center;padding:2rem;color:var(--text-muted);font-weight:600;font-size:0.85rem;">No steps yet.<br>Play the video and tap "📍 Add Step"</div>`;
    return;
  }

  list.innerHTML = createStepsArr.map((step, i) => {
    const color    = STEP_COLORS[i % STEP_COLORS.length];
    const endTime  = (createStepsArr[i + 1]?.time) ?? videoDuration;
    const em = Math.floor(endTime / 60);
    const es = Math.floor(endTime % 60).toString().padStart(2, '0');
    const endDisplay = videoDuration > 0 ? `→ ${em}:${es}` : '';
    return `
      <div draggable="true"
        ondragstart="stepDragStart(event,${i})"
        ondragover="stepDragOver(event,${i})"
        ondrop="stepDrop(event,${i})"
        ondragend="stepDragEnd(event)"
        style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:var(--bg-card-soft);border-radius:12px;border:2px solid var(--border-card);cursor:grab;transition:opacity 0.15s;"
        id="stepRow_${i}">
        <!-- color dot -->
        <div style="width:10px;height:10px;border-radius:50%;background:${color};flex-shrink:0;"></div>
        <!-- times -->
        <span style="font-size:0.7rem;font-weight:900;color:var(--primary);font-variant-numeric:tabular-nums;min-width:80px;">${step.displayTime} ${endDisplay}</span>
        <!-- label input -->
        <input value="${step.label.replace(/"/g,'&quot;')}" onchange="updateStepLabel(${i},this.value)"
          style="flex:1;background:transparent;border:none;font-family:var(--font);font-size:0.85rem;font-weight:700;color:var(--text-heading);outline:none;cursor:text;">
        <!-- preview -->
        <button onclick="previewStepLoop(${i})"
          title="Preview this step looping"
          style="background:${color};border:none;border-radius:8px;padding:4px 10px;font-family:var(--font);font-size:0.75rem;font-weight:900;cursor:pointer;color:#446;white-space:nowrap;">▶ Loop</button>
        <!-- delete -->
        <button onclick="removeCreateStep(${i})"
          style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:1rem;padding:0 4px;">×</button>
      </div>`;
  }).join('');
}

// ── Preview loop ───────────────────────────────────────────────────────────
window.previewStepLoop = function(i) {
  const videoEl = document.getElementById('uploadedVideoPlayer');
  const step    = createStepsArr[i];
  if (!videoEl || !step) return;

  stopPreviewLoop();

  const endTime = (createStepsArr[i + 1]?.time) ?? videoDuration;
  videoEl.currentTime = step.time;
  videoEl.play();

  const label = document.getElementById('previewingLabel');
  const stopBtn = document.getElementById('stopPreviewBtn');
  if (label)   label.style.display  = 'inline';
  if (stopBtn) stopBtn.style.display = 'inline-block';

  previewInterval = setInterval(() => {
    if (videoEl.currentTime >= endTime - 0.1) {
      videoEl.currentTime = step.time;
    }
  }, 100);

  showTip(`Looping "${step.label}" — tap ⏹ Stop when done`);
};

window.stopPreviewLoop = function() {
  if (previewInterval) { clearInterval(previewInterval); previewInterval = null; }
  const label   = document.getElementById('previewingLabel');
  const stopBtn = document.getElementById('stopPreviewBtn');
  if (label)   label.style.display   = 'none';
  if (stopBtn) stopBtn.style.display = 'none';
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

window.updateStepLabel  = (i, v) => { if (createStepsArr[i]) createStepsArr[i].label = v; renderTimeline(); };
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

window.saveNewRecipe = async function() {
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
    const loops    = createStepsArr.map(s => s.time);

    // Build video_url: prefer CF Stream, fall back to local blob
    const videoUrl = uploadedVideoUID
      ? `https://videodelivery.net/${uploadedVideoUID}/manifest/video.m3u8`
      : localVideoURL || null;

    await createRecipe({
      title,
      creator:          currentUser.email,
      duration,
      steps,
      loops,
      video_url:        videoUrl,
      private_recipe:   !createIsPublic,
      is_published:     createIsPublic,
      shared_on_profile: createIsPublic,
    });

    const msg = document.getElementById('savedRecipeMsg');
    if (msg) msg.textContent = createIsPublic
      ? `"​${title}" is now public — visible on Discover 🌎`
      : `"​${title}" saved privately to your profile 🔒`;

    document.getElementById('createStage2').style.display = 'none';
    document.getElementById('createStage3').style.display = 'block';
    showTip(`"​${title}" saved!`);

  } catch (err) {
    console.error('Save error:', err);
    showTip('Could not save: ' + (err.message || 'Unknown error'));
    if (btn) { btn.disabled = false; btn.textContent = '✅ Save Recipe'; }
  }
};

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

    // Replace timeline steps with AI-detected ones
    createStepsArr = loops.map(l => {
      const t = Number(l.time) || 0;
      const m = Math.floor(t / 60);
      const s = Math.floor(t % 60).toString().padStart(2, '0');
      return { time: t, label: l.label || `Step`, displayTime: `${m}:${s}` };
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

// ── Do It All — runs all 3 in sequence ────────────────────────────────────
window.doItAll = async function() {
  if (!cachedTranscript) { showTip('Transcribe the video first!'); return; }
  setAIStatus('⚡ Running all AI features...');

  try {
    setAIStatus('✍️ Writing ingredients...');
    await window.generateIngredients();

    setAIStatus('📋 Writing step instructions...');
    await window.generateSteps();

    setAIStatus('🔁 Detecting loop points...');
    await window.generateLoops();

    setAIStatus('🎉 All done! Review and edit above, then save.');
    showTip('All AI features complete! Review your results.');
  } catch (err) {
    setAIStatus('❌ ' + err.message);
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

