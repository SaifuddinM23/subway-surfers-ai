/**
 * Subway Surfers AI Posture Controller Injector (Ultra-Low Latency Version)
 * -------------------------------------------------------------
 * Copy this entire script, open the developer console (F12) on
 * any browser version of Subway Surfers, paste it, and press Enter.
 * 
 * Features:
 * - Web Worker Threading: Vision model and math processing run in background.
 * - Zero Main-Thread Overhead: Keystrokes are triggered instantly.
 * - Hip-Based Controls: Jumps/Crouches/Leans are computed from hips.
 * - 640x480 Resolution: Targeted for high-speed tracking.
 */

(async function () {
  console.log("[AI INIT] Loading Ultra-Low Latency Posture Controller...");

  // --- 1. CONFIGURATION ---
  const CONFIG = {
    calibrationDuration: 3000,
    keyPressDuration: 100, // Quick press response
  };

  // --- 2. LOAD LIBRARIES ON MAIN THREAD (Required for Camera Helper) ---
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.crossOrigin = "anonymous";
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  try {
    if (!window.Camera) {
      await loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js");
    }
  } catch (err) {
    console.error("[AI FATAL] Failed to load Camera Utils:", err);
    return;
  }

  // --- 3. INJECT WIDGET DOM AND STYLES ---
  const styleEl = document.createElement("style");
  styleEl.innerHTML = `
    #ai-controller-widget {
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 240px;
      background: rgba(10, 5, 20, 0.95);
      border: 2px solid #00f0ff;
      border-radius: 12px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.6);
      font-family: 'Orbitron', monospace;
      color: #fff;
      z-index: 999999;
      display: flex;
      flex-direction: column;
      touch-action: none;
    }
    .ai-header {
      background: #070310;
      padding: 8px 12px;
      cursor: move;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 10px;
      font-weight: bold;
      border-bottom: 1px solid rgba(255,255,255,0.1);
    }
    .ai-header span {
      background: linear-gradient(90deg, #00f0ff, #ff007f);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .ai-close {
      background: none;
      border: none;
      color: #ff003c;
      font-size: 14px;
      cursor: pointer;
      font-weight: bold;
    }
    .ai-body {
      padding: 10px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .ai-cam-view {
      position: relative;
      width: 100%;
      aspect-ratio: 4/3;
      background: #000;
      border-radius: 6px;
      overflow: hidden;
    }
    #ai-video {
      width: 100%;
      height: 100%;
      object-fit: cover;
      transform: scaleX(-1);
    }
    #ai-canvas {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      transform: scaleX(-1);
      z-index: 2;
    }
    .ai-feed {
      background: rgba(0, 240, 255, 0.1);
      color: #00f0ff;
      font-weight: bold;
      text-align: center;
      padding: 6px;
      border-radius: 4px;
      font-size: 12px;
      text-transform: uppercase;
    }
    .ai-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 9px;
      color: #a29bb8;
    }
    .ai-btn-row {
      display: flex;
      gap: 6px;
    }
    .ai-btn {
      flex: 1;
      padding: 6px;
      border: none;
      border-radius: 4px;
      font-family: inherit;
      font-size: 10px;
      font-weight: bold;
      cursor: pointer;
    }
    .ai-btn-primary {
      background: #ff007f;
      color: #fff;
    }
    .ai-btn-secondary {
      background: rgba(255,255,255,0.1);
      color: #fff;
    }
    #ai-countdown {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.7);
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      z-index: 5;
    }
    .ai-num {
      font-size: 32px;
      color: #39ff14;
      font-weight: bold;
    }
  `;
  document.head.appendChild(styleEl);

  const existing = document.getElementById("ai-controller-widget");
  if (existing) existing.remove();

  const widget = document.createElement("div");
  widget.id = "ai-controller-widget";
  widget.innerHTML = `
    <div class="ai-header" id="ai-drag">
      <span>AI LOW-LATENCY</span>
      <button class="ai-close" id="ai-close-btn">×</button>
    </div>
    <div class="ai-body">
      <div class="ai-cam-view">
        <video id="ai-video" autoplay playsinline muted></video>
        <canvas id="ai-canvas"></canvas>
        <div id="ai-countdown" style="display: none;">
          <div class="ai-num" id="ai-cd-num">3</div>
          <div style="font-size: 8px; margin-top: 4px;">CALIBRATING HIPS...</div>
        </div>
      </div>
      <div class="ai-feed" id="ai-feed-txt">OFFLINE</div>
      <div class="ai-btn-row">
        <button class="ai-btn ai-btn-primary" id="ai-btn-calibrate">CALIBRATE</button>
        <button class="ai-btn ai-btn-secondary" id="ai-btn-toggle-cam">START</button>
      </div>
      <div class="ai-row">
        <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
          <input type="checkbox" id="ai-chk-debug" style="cursor: pointer;"> Debug Overlay
        </label>
        <span>STATUS: <strong id="ai-status-txt" style="color:#ff003c;">OFFLINE</strong></span>
      </div>
    </div>
  `;
  document.body.appendChild(widget);

  const video = document.getElementById("ai-video");
  const canvas = document.getElementById("ai-canvas");
  const feedTxt = document.getElementById("ai-feed-txt");
  const statusTxt = document.getElementById("ai-status-txt");
  const chkDebug = document.getElementById("ai-chk-debug");
  
  let isTracking = false;
  let camera = null;

  // --- 4. DRAG WIDGET MECHANISM ---
  const dragHeader = document.getElementById("ai-drag");
  let isDragging = false, startX, startY, initialX, initialY;
  dragHeader.addEventListener("mousedown", (e) => {
    isDragging = true;
    startX = e.clientX; startY = e.clientY;
    const rect = widget.getBoundingClientRect();
    initialX = rect.left; initialY = rect.top;
    widget.style.right = "auto"; widget.style.bottom = "auto";
    widget.style.left = `${initialX}px`; widget.style.top = `${initialY}px`;
  });
  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    widget.style.left = `${initialX + (e.clientX - startX)}px`;
    widget.style.top = `${initialY + (e.clientY - startY)}px`;
  });
  document.addEventListener("mouseup", () => { isDragging = false; });

  // --- 5. INLINE WEB WORKER COMPILATION (Blob URL) ---
  const workerCode = `
    self.window = self;
    self.document = {
      createElement: function(tag) {
        if (tag === 'canvas') {
          return new OffscreenCanvas(640, 480);
        }
        return {};
      }
    };

    // Fetch MediaPipe inside Worker
    importScripts('https://cdn.jsdelivr.net/npm/@mediapipe/pose/pose.js');

    let pose = null;
    let canvas = null;
    let ctx = null;

    // Tracking Parameters
    let baseline = null;
    let limits = null;
    let currentState = 'CENTER';
    let isCalibrating = false;
    let calibrationFrames = [];

    // Cooldown variables
    let lastJumpTime = 0;
    const JUMP_COOLDOWN_MS = 200;
    const HYSTERESIS = 0.55;

    function initPose(offscreenCanvas, debugActive) {
      if (offscreenCanvas) {
        canvas = offscreenCanvas;
        if (debugActive) {
          ctx = canvas.getContext('2d');
        }
      }

      pose = new self.Pose({
        locateFile: (file) => \`https://cdn.jsdelivr.net/npm/@mediapipe/pose/\${file}\`
      });

      pose.setOptions({
        modelComplexity: 0,       // Lightest model (Fastest load, lowest latency)
        smoothLandmarks: false,    // Disable smoothing for instant response
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
      });

      pose.onResults(handleResults);
      self.postMessage({ type: 'STATUS', status: 'INIT_DONE' });
    }

    function handleResults(results) {
      if (!results.poseLandmarks) {
        self.postMessage({ type: 'LOST' });
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
      }

      const landmarks = results.poseLandmarks;

      if (isCalibrating) {
        calibrationFrames.push(landmarks);
      }

      if (baseline) {
        processPosture(landmarks);
      }

      // Render overlay purely inside worker thread (zero main-thread cost)
      if (ctx) {
        drawSkeleton(landmarks);
      }
    }

    function processPosture(landmarks) {
      const leftHip = landmarks[23];
      const rightHip = landmarks[24];
      const leftSh = landmarks[11];
      const rightSh = landmarks[12];
      const leftWrist = landmarks[15];
      const rightWrist = landmarks[16];

      if (!leftHip || !rightHip || !leftSh || !rightSh) return;

      const hipCenterX = (leftHip.x + rightHip.x) / 2;
      const hipCenterY = (leftHip.y + rightHip.y) / 2;
      const shCenterX = (leftSh.x + rightSh.x) / 2;
      
      let detected = "CENTER";
      const now = Date.now();

      // 1. Check space bar (Hands up)
      if (leftWrist && rightWrist && leftWrist.visibility > 0.5 && rightWrist.visibility > 0.5) {
        if (leftWrist.y < leftSh.y && rightWrist.y < rightSh.y) {
          detected = "HANDS_UP";
        }
      }

      // 2. Directions and jump/crouch checks with hysteresis state machine
      if (detected !== "HANDS_UP") {
        // Horizontal leans (Hips based)
        const leftThreshold = limits.left;
        const leftReturn = baseline.hipCenterX + (baseline.shoulderWidth * 0.15 * HYSTERESIS);
        const rightThreshold = limits.right;
        const rightReturn = baseline.hipCenterX - (baseline.shoulderWidth * 0.15 * HYSTERESIS);

        if (hipCenterX > leftThreshold) {
          detected = "LEFT";
        } else if (hipCenterX < rightThreshold) {
          detected = "RIGHT";
        } else {
          if (currentState === "LEFT" && hipCenterX > leftReturn) detected = "LEFT";
          else if (currentState === "RIGHT" && hipCenterX < rightReturn) detected = "RIGHT";
        }

        // Vertical gestures (Hips center Y movement)
        if (detected === "CENTER") {
          const jumpThreshold = limits.jump;
          const jumpReturn = baseline.hipCenterY - (baseline.torsoHeight * 0.08 * HYSTERESIS);
          const crouchThreshold = limits.crouch;
          const crouchReturn = baseline.hipCenterY + (baseline.torsoHeight * 0.08 * HYSTERESIS);

          // Jump State Machine
          if (currentState === "JUMP") {
            if (hipCenterY < jumpReturn) {
              detected = "JUMP";
            }
          } else if (hipCenterY < jumpThreshold) {
            if (now - lastJumpTime > JUMP_COOLDOWN_MS) {
              detected = "JUMP";
              lastJumpTime = now;
            }
          }

          // Crouch State Machine (only check if not jumping)
          if (detected === "CENTER") {
            if (currentState === "CROUCH") {
              if (hipCenterY > crouchReturn) {
                detected = "CROUCH";
              }
            } else if (hipCenterY > crouchThreshold) {
              detected = "CROUCH";
            }
          }
        }
      }

      if (detected !== currentState) {
        self.postMessage({ type: 'ACTION', action: detected, prevAction: currentState });
        currentState = detected;
      }
    }

    function calculateBaseline() {
      if (calibrationFrames.length < 5) {
        self.postMessage({ type: 'CALIBRATION_FAILED' });
        return;
      }

      let sumHipCenterX = 0, sumHipCenterY = 0;
      let sumShWidth = 0, sumTorsoHeight = 0;

      calibrationFrames.forEach(frame => {
        const lH = frame[23]; const rH = frame[24];
        const lS = frame[11]; const rS = frame[12];

        const hipX = (lH.x + rH.x) / 2;
        const hipY = (lH.y + rH.y) / 2;
        const shY = (lS.y + rS.y) / 2;

        sumHipCenterX += hipX;
        sumHipCenterY += hipY;
        sumShWidth += Math.abs(lS.x - rS.x);
        sumTorsoHeight += Math.abs(hipY - shY);
      });

      const count = calibrationFrames.length;
      baseline = {
        hipCenterX: sumHipCenterX / count,
        hipCenterY: sumHipCenterY / count,
        shoulderWidth: sumShWidth / count,
        torsoHeight: sumTorsoHeight / count
      };

      limits = {
        left: baseline.hipCenterX + (baseline.shoulderWidth * 0.15),
        right: baseline.hipCenterX - (baseline.shoulderWidth * 0.15),
        jump: baseline.hipCenterY - (baseline.torsoHeight * 0.08),    // Highly sensitive (5-10cm hop)
        crouch: baseline.hipCenterY + (baseline.torsoHeight * 0.08)   // Highly sensitive crouch
      };

      self.postMessage({ type: 'CALIBRATION_DONE', limits, baseline });
    }

    function drawSkeleton(landmarks) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const w = canvas.width, h = canvas.height;

      const drawLine = (A, B, color, thick = 2) => {
        if (A.visibility < 0.5 || B.visibility < 0.5) return;
        ctx.beginPath(); ctx.moveTo(A.x * w, A.y * h); ctx.lineTo(B.x * w, B.y * h);
        ctx.strokeStyle = color; ctx.lineWidth = thick; ctx.stroke();
      };

      const drawPoint = (pt, color, r = 4) => {
        if (pt.visibility < 0.5) return;
        ctx.beginPath(); ctx.arc(pt.x * w, pt.y * h, r, 0, 2*Math.PI);
        ctx.fillStyle = color; ctx.fill();
      };

      // Connect Hips and shoulders
      drawLine(landmarks[11], landmarks[12], "#00f0ff", 3);
      drawLine(landmarks[23], landmarks[24], "#00f0ff", 3);
      drawLine(landmarks[11], landmarks[23], "#00f0ff", 2);
      drawLine(landmarks[12], landmarks[24], "#00f0ff", 2);

      // Draw Hips tracking center
      const hX = (landmarks[23].x + landmarks[24].x) / 2;
      const hY = (landmarks[23].y + landmarks[24].y) / 2;
      ctx.beginPath(); ctx.arc(hX * w, hY * h, 5, 0, 2*Math.PI);
      ctx.fillStyle = "#39ff14"; ctx.fill();

      // Hands Up visualization
      const isHandsUp = (currentState === "HANDS_UP");
      const armColor = isHandsUp ? "#39ff14" : "#ff007f";
      drawLine(landmarks[11], landmarks[13], armColor, 2);
      drawLine(landmarks[13], landmarks[15], armColor, 2);
      drawLine(landmarks[12], landmarks[14], armColor, 2);
      drawLine(landmarks[14], landmarks[16], armColor, 2);

      drawPoint(landmarks[15], "#fff", 3);
      drawPoint(landmarks[16], "#fff", 3);
    }

    self.onmessage = function(e) {
      const data = e.data;
      if (data.type === 'INIT') {
        initPose(data.canvas, data.debug);
      } else if (data.type === 'START_CAL') {
        isCalibrating = true;
        calibrationFrames = [];
      } else if (data.type === 'FINISH_CAL') {
        isCalibrating = false;
        calculateBaseline();
      } else if (data.type === 'FRAME') {
        const bitmap = data.bitmap;
        if (pose) {
          pose.send({ image: bitmap }).then(() => {
            bitmap.close();
            self.postMessage({ type: 'FRAME_PROCESSED' });
          }).catch(() => {
            bitmap.close();
            self.postMessage({ type: 'FRAME_PROCESSED' });
          });
        } else {
          bitmap.close();
          self.postMessage({ type: 'FRAME_PROCESSED' });
        }
      } else if (data.type === 'TOGGLE_DEBUG') {
        if (!data.active) {
          ctx = null;
        } else if (canvas) {
          ctx = canvas.getContext('2d');
        }
      }
    };
  `;

  // Instantiate the worker using Blob URL
  const blob = new Blob([workerCode], { type: "application/javascript" });
  const worker = new Worker(URL.createObjectURL(blob));

  // Flow control backpressure status
  let workerBusy = false;

  // --- 6. HANDLE ACTIONS ON MAIN THREAD ---
  function simulateKey(type, keyName) {
    let keyCode, codeName;
    switch (keyName) {
      case "ArrowLeft": keyCode = 37; codeName = "ArrowLeft"; break;
      case "ArrowUp": keyCode = 38; codeName = "ArrowUp"; break;
      case "ArrowRight": keyCode = 39; codeName = "ArrowRight"; break;
      case "ArrowDown": keyCode = 40; codeName = "ArrowDown"; break;
      case "Space": keyName = " "; keyCode = 32; codeName = "Space"; break;
      default: return;
    }

    const eventOpts = {
      key: keyName,
      code: codeName,
      keyCode: keyCode,
      which: keyCode,
      bubbles: true,
      cancelable: true,
      view: window
    };

    const targets = [];
    if (document.activeElement) {
      targets.push(document.activeElement);
      if (document.activeElement.tagName === "IFRAME") {
        try {
          const iframe = document.activeElement;
          if (iframe.contentWindow) targets.push(iframe.contentWindow);
          if (iframe.contentDocument) {
            targets.push(iframe.contentDocument);
            if (iframe.contentDocument.body) targets.push(iframe.contentDocument.body);
            iframe.contentDocument.querySelectorAll("canvas").forEach(c => targets.push(c));
          }
        } catch (e) {}
      }
    }
    document.querySelectorAll("canvas").forEach(c => { if (!targets.includes(c)) targets.push(c); });
    if (!targets.includes(document.body)) targets.push(document.body);
    if (!targets.includes(document)) targets.push(document);
    if (!targets.includes(window)) targets.push(window);

    targets.forEach(target => {
      try {
        const event = new KeyboardEvent(type, eventOpts);
        Object.defineProperty(event, 'keyCode', { value: keyCode, writable: false });
        Object.defineProperty(event, 'which', { value: keyCode, writable: false });
        Object.defineProperty(event, 'code', { value: codeName, writable: false });
        Object.defineProperty(event, 'key', { value: keyName, writable: false });
        target.dispatchEvent(event);
      } catch (err) {}
    });
  }

  function executeDiscreteAction(action, prevAction) {
    console.log(`[AI ACTION] ${prevAction} ➔ ${action}`);
    
    // Space bar
    if (action === "HANDS_UP") {
      simulateKey("keydown", "Space");
      setTimeout(() => simulateKey("keyup", "Space"), CONFIG.keyPressDuration);
      return;
    }

    // Leaning translations to discrete arrow taps (returns to center automatically)
    if (action === "LEFT") {
      simulateKey("keydown", "ArrowLeft");
      setTimeout(() => simulateKey("keyup", "ArrowLeft"), CONFIG.keyPressDuration);
    } else if (action === "RIGHT") {
      simulateKey("keydown", "ArrowRight");
      setTimeout(() => simulateKey("keyup", "ArrowRight"), CONFIG.keyPressDuration);
    } else if (action === "CENTER") {
      if (prevAction === "LEFT") {
        simulateKey("keydown", "ArrowRight");
        setTimeout(() => simulateKey("keyup", "ArrowRight"), CONFIG.keyPressDuration);
      } else if (prevAction === "RIGHT") {
        simulateKey("keydown", "ArrowLeft");
        setTimeout(() => simulateKey("keyup", "ArrowLeft"), CONFIG.keyPressDuration);
      }
    }

    // Jump & Crouch taps
    if (action === "JUMP") {
      simulateKey("keydown", "ArrowUp");
      setTimeout(() => simulateKey("keyup", "ArrowUp"), CONFIG.keyPressDuration);
    } else if (action === "CROUCH") {
      simulateKey("keydown", "ArrowDown");
      setTimeout(() => simulateKey("keyup", "ArrowDown"), CONFIG.keyPressDuration);
    }
  }

  worker.onmessage = function (e) {
    const data = e.data;
    if (data.type === 'STATUS' && data.status === 'INIT_DONE') {
      statusTxt.textContent = "READY";
      statusTxt.style.color = "#00f0ff";
    } else if (data.type === 'ACTION') {
      feedTxt.textContent = data.action;
      executeDiscreteAction(data.action, data.prevAction);
    } else if (data.type === 'LOST') {
      feedTxt.textContent = "PLAYER LOST";
    } else if (data.type === 'CALIBRATION_DONE') {
      statusTxt.textContent = "ACTIVE";
      statusTxt.style.color = "#39ff14";
    } else if (data.type === 'CALIBRATION_FAILED') {
      alert("Calibration failed: Low frame capture. Try again.");
    } else if (data.type === 'FRAME_PROCESSED') {
      workerBusy = false;
    }
  };

  // Transfer canvas rendering control to Web Worker
  const offscreen = canvas.transferControlToOffscreen();
  worker.postMessage({ type: 'INIT', canvas: offscreen, debug: chkDebug.checked }, [offscreen]);

  // --- 7. WEBCAM FEED DISPATCHER (Main thread -> Worker) ---
  async function startCamera() {
    if (isTracking) return;
    statusTxt.textContent = "CAM STARTING...";
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" }, // 640x480 resolution constraints
        audio: false
      });
      video.srcObject = stream;
      await video.play();

      isTracking = true;
      workerBusy = false;
      document.getElementById("ai-btn-toggle-cam").textContent = "STOP";
      document.getElementById("ai-btn-toggle-cam").className = "ai-btn ai-btn-secondary";

      // Ultra-low latency frame loop using requestVideoFrameCallback
      if ('requestVideoFrameCallback' in video) {
        const dispatchFrame = () => {
          if (!isTracking) return;
          if (workerBusy) {
            video.requestVideoFrameCallback(dispatchFrame);
            return;
          }
          workerBusy = true;
          createImageBitmap(video).then(bitmap => {
            worker.postMessage({ type: 'FRAME', bitmap: bitmap }, [bitmap]);
            video.requestVideoFrameCallback(dispatchFrame);
          }).catch(err => {
            workerBusy = false;
            video.requestVideoFrameCallback(dispatchFrame);
          });
        };
        video.requestVideoFrameCallback(dispatchFrame);
      } else {
        const dispatchFrame = () => {
          if (!isTracking) return;
          if (workerBusy) {
            requestAnimationFrame(dispatchFrame);
            return;
          }
          workerBusy = true;
          createImageBitmap(video).then(bitmap => {
            worker.postMessage({ type: 'FRAME', bitmap: bitmap }, [bitmap]);
            requestAnimationFrame(dispatchFrame);
          }).catch(err => {
            workerBusy = false;
            requestAnimationFrame(dispatchFrame);
          });
        };
        requestAnimationFrame(dispatchFrame);
      }
      statusTxt.textContent = "READY";
      statusTxt.style.color = "#00f0ff";
    } catch (err) {
      console.error("[AI CAMERA] Error launching stream:", err);
      statusTxt.textContent = "CAM ERROR";
      statusTxt.style.color = "#ff003c";
      alert("Camera launch failed. Ensure access permissions are enabled.");
    }
  }

  function stopCamera() {
    isTracking = false;
    workerBusy = false;
    if (video.srcObject) {
      video.srcObject.getTracks().forEach(t => t.stop());
      video.srcObject = null;
    }
    document.getElementById("ai-btn-toggle-cam").textContent = "START";
    document.getElementById("ai-btn-toggle-cam").className = "ai-btn ai-btn-primary";
    statusTxt.textContent = "OFFLINE";
    statusTxt.style.color = "#ff003c";
    feedTxt.textContent = "OFFLINE";
  }

  document.getElementById("ai-btn-toggle-cam").addEventListener("click", () => {
    if (isTracking) stopCamera(); else startCamera();
  });

  // --- 8. CALIBRATION TRIGGERS ---
  const btnCalibrate = document.getElementById("ai-btn-calibrate");
  const countdownOverlay = document.getElementById("ai-countdown");
  const countdownNum = document.getElementById("ai-cd-num");

  btnCalibrate.addEventListener("click", () => {
    if (!isTracking) {
      alert("Please start the camera first!");
      return;
    }
    runCalibration();
  });

  function runCalibration() {
    countdownOverlay.style.display = "flex";
    worker.postMessage({ type: 'START_CAL' });

    const startTime = Date.now();
    const timer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, Math.ceil((CONFIG.calibrationDuration - elapsed) / 1000));
      countdownNum.textContent = remaining;

      if (elapsed >= CONFIG.calibrationDuration) {
        clearInterval(timer);
        countdownOverlay.style.display = "none";
        worker.postMessage({ type: 'FINISH_CAL' });
      }
    }, 100);
  }

  // Debug overlay toggles drawing inside the worker thread (zero rendering costs when off)
  chkDebug.addEventListener("change", () => {
    worker.postMessage({ type: 'TOGGLE_DEBUG', active: chkDebug.checked });
  });

  document.getElementById("ai-close-btn").addEventListener("click", () => {
    stopCamera();
    widget.remove();
    styleEl.remove();
  });

})();
