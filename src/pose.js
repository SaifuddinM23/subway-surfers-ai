// MediaPipe Pose Tracking and Gesture Interpretation (Ultra-Low Latency Web Worker Version)

class PoseTracker {
  constructor() {
    this.video = null;
    this.canvas = null;
    this.worker = null;
    
    this.onActionCallback = null;
    this.onStatusCallback = null;
    this.onCalibrateComplete = null;
    
    this.isInitialized = false;
    this.isTracking = false;
    this.isCalibrating = false;
    
    this.calibrationDuration = 3000; // ms
  }

  init(videoElement, canvasElement, onAction, onStatus, debug = false) {
    this.video = videoElement;
    this.canvas = canvasElement;
    this.onActionCallback = onAction;
    this.onStatusCallback = onStatus;

    if (this.isInitialized) {
      console.log("[AI TRACKER] Already initialized.");
      return;
    }

    // --- Create inline Web Worker code ---
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

      importScripts('https://cdn.jsdelivr.net/npm/@mediapipe/pose/pose.js');

      let pose = null;
      let canvas = null;
      let ctx = null;

      // Calibration & Limits
      let baseline = null;
      let limits = null;
      let currentState = 'CENTER';
      let isCalibrating = false;
      let calibrationFrames = [];

      // Timing / Hysteresis
      let lastJumpTime = 0;
      const JUMP_COOLDOWN_MS = 200;
      const HYSTERESIS = 0.55;

      function initPose(offscreen, debugActive) {
        if (offscreen) {
          canvas = offscreen;
          if (debugActive) {
            ctx = canvas.getContext('2d');
          }
        }

        pose = new self.Pose({
          locateFile: (file) => \`https://cdn.jsdelivr.net/npm/@mediapipe/pose/\${file}\`
        });

        pose.setOptions({
          modelComplexity: 0,        // Lite pose model
          smoothLandmarks: false,     // Instant responses
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5
        });

        pose.onResults(handleResults);
        self.postMessage({ type: 'STATUS', status: 'connected' });
      }

      function handleResults(results) {
        if (!results.poseLandmarks) {
          self.postMessage({ type: 'STATUS', status: 'disconnected' });
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
        const shoulderWidth = Math.abs(leftSh.x - rightSh.x);
        const torsoHeight = Math.abs(hipCenterY - (leftSh.y + rightSh.y) / 2);

        let detected = "CENTER";
        const now = Date.now();

        // 1. Hands Raised Detection (Space bar equivalent)
        if (leftWrist && rightWrist && leftWrist.visibility > 0.5 && rightWrist.visibility > 0.5) {
          if (leftWrist.y < leftSh.y && rightWrist.y < rightSh.y) {
            detected = "HANDS_UP";
          }
        }

        // 2. Directions and vertical checks with hysteresis state machine
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

          // Vertical Gestures (Hips center Y movement)
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
          self.postMessage({ type: 'ACTION', action: detected });
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
          jump: baseline.hipCenterY - (baseline.torsoHeight * 0.08),
          crouch: baseline.hipCenterY + (baseline.torsoHeight * 0.08)
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

        // Draw boundaries (if limits present)
        if (baseline && limits) {
          ctx.strokeStyle = "rgba(0, 240, 255, 0.15)";
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]);

          // Left/Right
          ctx.beginPath(); ctx.moveTo(limits.left * w, 0); ctx.lineTo(limits.left * w, h); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(limits.right * w, 0); ctx.lineTo(limits.right * w, h); ctx.stroke();

          // Jump/Crouch
          ctx.strokeStyle = "rgba(57, 255, 20, 0.15)";
          ctx.beginPath(); ctx.moveTo(0, limits.jump * h); ctx.lineTo(w, limits.jump * h); ctx.stroke();
          ctx.strokeStyle = "rgba(255, 170, 0, 0.15)";
          ctx.beginPath(); ctx.moveTo(0, limits.crouch * h); ctx.lineTo(w, limits.crouch * h); ctx.stroke();
          ctx.setLineDash([]);
        }

        // Draw connections
        drawLine(landmarks[11], landmarks[12], "rgba(0, 240, 255, 0.8)", 3); // shoulders
        drawLine(landmarks[23], landmarks[24], "rgba(0, 240, 255, 0.8)", 3); // hips
        drawLine(landmarks[11], landmarks[23], "rgba(0, 240, 255, 0.8)", 1.5);
        drawLine(landmarks[12], landmarks[24], "rgba(0, 240, 255, 0.8)", 1.5);

        // Arms
        const isHandsUp = (currentState === 'HANDS_UP');
        const armColor = isHandsUp ? '#39ff14' : 'rgba(157, 0, 255, 0.7)';
        drawLine(landmarks[11], landmarks[13], armColor, 2);
        drawLine(landmarks[13], landmarks[15], armColor, 2);
        drawLine(landmarks[12], landmarks[14], armColor, 2);
        drawLine(landmarks[14], landmarks[16], armColor, 2);

        drawPoint(landmarks[0], '#ff007f', 5);
        drawPoint(landmarks[11], '#00f0ff', 4);
        drawPoint(landmarks[12], '#00f0ff', 4);
        drawPoint(landmarks[23], '#00f0ff', 4);
        drawPoint(landmarks[24], '#00f0ff', 4);
        drawPoint(landmarks[15], isHandsUp ? '#39ff14' : '#ff007f', 4);
        drawPoint(landmarks[16], isHandsUp ? '#39ff14' : '#ff007f', 4);
        
        // Hips Center dot
        const hX = (landmarks[23].x + landmarks[24].x) / 2;
        const hY = (landmarks[23].y + landmarks[24].y) / 2;
        ctx.beginPath(); ctx.arc(hX * w, hY * h, 4, 0, 2*Math.PI);
        ctx.fillStyle = '#39ff14'; ctx.fill();
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
        }
      };
    `;

    // Initialize Web Worker thread
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    this.worker = new Worker(URL.createObjectURL(blob));

    // Flow control backpressure status
    this.workerBusy = false;

    // Handle messages back from worker
    this.worker.onmessage = (e) => {
      const data = e.data;
      if (data.type === 'STATUS') {
        this.updateStatus(data.status);
      } else if (data.type === 'ACTION') {
        if (this.onActionCallback) {
          this.onActionCallback(data.action);
        }
      } else if (data.type === 'LOST') {
        // Player lost feedback
        const feed = document.getElementById('posture-feedback');
        if (feed) {
          feed.textContent = "LOST";
          feed.style.color = "#ff003c";
        }
      } else if (data.type === 'CALIBRATION_DONE') {
        this.updateStatus('connected');
        if (this.onCalibrateComplete) {
          this.onCalibrateComplete();
        }
      } else if (data.type === 'FRAME_PROCESSED') {
        this.workerBusy = false;
      }
    };

    // Transfer render control of tracking canvas directly to Web Worker thread
    const offscreen = this.canvas.transferControlToOffscreen();
    this.worker.postMessage({ type: 'INIT', canvas: offscreen, debug }, [offscreen]);

    this.isInitialized = true;
  }

  updateStatus(status) {
    if (this.onStatusCallback) {
      this.onStatusCallback(status);
    }
  }

  async start() {
    if (!this.isInitialized) return;
    if (this.isTracking) return;
    
    this.updateStatus('calibrating');
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
        audio: false
      });
      this.video.srcObject = stream;
      await this.video.play();

      this.isTracking = true;
      this.workerBusy = false;
      
      // Dispatch frames using modern requestVideoFrameCallback on worker thread
      if ('requestVideoFrameCallback' in this.video) {
        const process = () => {
          if (!this.isTracking) return;
          if (this.workerBusy) {
            this.video.requestVideoFrameCallback(process);
            return;
          }
          this.workerBusy = true;
          createImageBitmap(this.video).then(bitmap => {
            this.worker.postMessage({ type: 'FRAME', bitmap: bitmap }, [bitmap]);
            this.video.requestVideoFrameCallback(process);
          }).catch(err => {
            this.workerBusy = false;
            this.video.requestVideoFrameCallback(process);
          });
        };
        this.video.requestVideoFrameCallback(process);
      } else {
        const process = () => {
          if (!this.isTracking) return;
          if (this.workerBusy) {
            requestAnimationFrame(process);
            return;
          }
          this.workerBusy = true;
          createImageBitmap(this.video).then(bitmap => {
            this.worker.postMessage({ type: 'FRAME', bitmap: bitmap }, [bitmap]);
            requestAnimationFrame(process);
          }).catch(err => {
            this.workerBusy = false;
            requestAnimationFrame(process);
          });
        };
        requestAnimationFrame(process);
      }

    } catch (err) {
      console.error('Error starting camera in low latency pose tracker: ', err);
      this.updateStatus('disconnected');
      alert('Could not access webcam. Please check permissions.');
    }
  }

  stop() {
    this.isTracking = false;
    this.isCalibrating = false;
    this.workerBusy = false;
    
    if (this.video && this.video.srcObject) {
      const tracks = this.video.srcObject.getTracks();
      tracks.forEach(track => track.stop());
      this.video.srcObject = null;
    }
    
    this.updateStatus('disconnected');
  }

  startCalibration(onComplete) {
    if (!this.isTracking) return;
    
    this.isCalibrating = true;
    this.onCalibrateComplete = onComplete;
    this.worker.postMessage({ type: 'START_CAL' });
    
    const startTime = Date.now();
    const countdownEl = document.getElementById('calibration-countdown');
    const progressEl = document.getElementById('calibration-progress');

    const updateInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progressPercent = Math.min((elapsed / this.calibrationDuration) * 100, 100);
      
      if (progressEl) progressEl.style.width = `${progressPercent}%`;
      if (countdownEl) countdownEl.textContent = Math.max(0, Math.ceil((this.calibrationDuration - elapsed) / 1000));

      if (elapsed >= this.calibrationDuration) {
        clearInterval(updateInterval);
        this.isCalibrating = false;
        this.worker.postMessage({ type: 'FINISH_CAL' });
      }
    }, 100);
  }
}

export const poseTracker = new PoseTracker();
