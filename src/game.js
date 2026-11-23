import * as THREE from 'three';
import { audioSystem } from './audio.js';
import { poseTracker } from './pose.js';

class Game {
  constructor() {
    this.container = null;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    
    // Game States
    this.gameState = 'MENU'; // 'MENU', 'CALIBRATION', 'PLAYING', 'GAMEOVER'
    this.controlMode = 'KEYBOARD'; // 'KEYBOARD', 'CAMERA'
    this.score = 0;
    this.coins = 0;
    this.speed = 1.0;
    this.baseSpeed = 25.0; // units per second
    this.distanceRun = 0;
    
    // Player Configuration
    this.player = null;
    this.currentLane = 1; // 0 = Left, 1 = Center, 2 = Right
    this.targetLane = 1;
    this.laneWidth = 3.2;
    this.playerX = 0;
    
    // Player Motion States
    this.isJumping = false;
    this.jumpProgress = 0;
    this.jumpDuration = 0.65; // seconds
    this.jumpHeight = 2.8;
    
    this.isCrouching = false;
    this.crouchProgress = 0;
    this.crouchDuration = 0.7; // seconds
    
    // Environment & Entities
    this.trackSegments = [];
    this.obstacles = [];
    this.coinsList = [];
    this.neonArches = [];
    this.particles = [];
    
    // Timing
    this.clock = new THREE.Clock();
    this.lastObstacleSpawnZ = 0;
    this.obstacleSpawnInterval = 35; // Spawn obstacle every 35 units
    
    // DOM Elements
    this.scoreValEl = null;
    this.coinValEl = null;
    this.speedValEl = null;
    
    this.activeAudio = false;

    // Hoverboard & Invincibility States
    this.hoverboardActive = false;
    this.shieldMesh = null;
    this.invincibleTimer = 0;
    this.hoverboardTimeout = null;
  }

  init() {
    this.container = document.getElementById('game-container');
    this.scoreValEl = document.getElementById('score-val');
    this.coinValEl = document.getElementById('coin-val');
    this.speedValEl = document.getElementById('speed-val');
    
    // 1. Create Scene & Camera
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x070312, 0.015);
    
    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
    // Camera positioned behind and looking down at player
    this.camera.position.set(0, 5.0, 9.0);
    
    // 2. Create Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);
    
    // 3. Add Ambient and Directional Neon Lights
    const ambientLight = new THREE.AmbientLight(0x0f0b24, 1.2);
    this.scene.add(ambientLight);
    
    const dirLight = new THREE.DirectionalLight(0xff007f, 1.5);
    dirLight.position.set(5, 15, 5);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    this.scene.add(dirLight);

    // Neon purple rim light from ahead
    const frontLight = new THREE.DirectionalLight(0x00f0ff, 0.8);
    frontLight.position.set(0, 5, -30);
    this.scene.add(frontLight);
    
    // 4. Create Player Mesh
    this.createPlayer();
    
    // 5. Build Initial Environment
    this.createEnvironment();
    
    // 6. Bind Events
    this.bindEvents();
    
    // 7. Start Animation Loop
    this.tick();
  }

  createPlayer() {
    this.playerGroup = new THREE.Group();
    this.playerGroup.position.set(0, 0.6, 0);
    
    // Body - Metallic Sphere
    const bodyGeo = new THREE.SphereGeometry(0.55, 32, 32);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x070312,
      roughness: 0.1,
      metalness: 0.9,
    });
    this.playerBody = new THREE.Mesh(bodyGeo, bodyMat);
    this.playerBody.castShadow = true;
    this.playerGroup.add(this.playerBody);
    
    // Neon Ring 1 - Vertical
    const ring1Geo = new THREE.TorusGeometry(0.65, 0.05, 8, 32);
    const ring1Mat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
    this.ring1 = new THREE.Mesh(ring1Geo, ring1Mat);
    this.playerGroup.add(this.ring1);
    
    // Neon Ring 2 - Horizontal
    const ring2Geo = new THREE.TorusGeometry(0.65, 0.05, 8, 32);
    const ring2Mat = new THREE.MeshBasicMaterial({ color: 0xff007f });
    this.ring2 = new THREE.Mesh(ring2Geo, ring2Mat);
    this.ring2.rotation.x = Math.PI / 2;
    this.playerGroup.add(this.ring2);
    
    // Shadow under player
    const shadowGeo = new THREE.PlaneGeometry(1.2, 1.2);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.5,
      depthWrite: false
    });
    this.playerShadow = new THREE.Mesh(shadowGeo, shadowMat);
    this.playerShadow.rotation.x = -Math.PI / 2;
    this.playerShadow.position.y = -0.59;
    this.scene.add(this.playerShadow);

    this.scene.add(this.playerGroup);
  }

  createEnvironment() {
    // 1. Create Ground Grid
    const gridHelper = new THREE.GridHelper(30, 60, 0x00f0ff, 0x9d00ff);
    gridHelper.position.set(0, 0.01, -100);
    gridHelper.scale.set(1, 1, 10);
    this.scene.add(gridHelper);
    
    // Create actual floor planes for shadows
    const floorGeo = new THREE.PlaneGeometry(100, 1000);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x05020c,
      roughness: 0.8,
      metalness: 0.2
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, -450);
    floor.receiveShadow = true;
    this.scene.add(floor);
    
    // 2. Build initial sequence of Neon Arches along the tracks
    for (let z = 0; z > -300; z -= 15) {
      this.spawnArch(z);
    }

    // 3. Create a starry/particle background
    const starCount = 300;
    const starGeo = new THREE.BufferGeometry();
    const starPositions = new Float32Array(starCount * 3);
    
    for (let i = 0; i < starCount * 3; i += 3) {
      starPositions[i] = (Math.random() - 0.5) * 80;     // X
      starPositions[i + 1] = Math.random() * 40 + 5;     // Y
      starPositions[i + 2] = -Math.random() * 200 - 20;  // Z
    }
    
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.15,
      transparent: true,
      opacity: 0.6
    });
    const starField = new THREE.Points(starGeo, starMat);
    this.scene.add(starField);
  }

  spawnArch(z) {
    const archGroup = new THREE.Group();
    archGroup.position.set(0, 0, z);
    
    const archWidth = 14;
    const archHeight = 8;
    
    // Outer glowing archway using tube or boxes
    const points = [];
    points.push(new THREE.Vector3(-archWidth / 2, 0, 0));
    points.push(new THREE.Vector3(-archWidth / 2, archHeight, 0));
    points.push(new THREE.Vector3(archWidth / 2, archHeight, 0));
    points.push(new THREE.Vector3(archWidth / 2, 0, 0));
    
    const archGeo = new THREE.BufferGeometry().setFromPoints(points);
    const archMat = new THREE.LineBasicMaterial({
      color: z % 30 === 0 ? 0xff007f : 0x00f0ff,
      linewidth: 2 // Note: linewidth > 1 usually ignored by WebGL implementations
    });
    
    const line = new THREE.Line(archGeo, archMat);
    archGroup.add(line);
    
    // Side columns
    const colGeo = new THREE.BoxGeometry(0.3, archHeight, 0.3);
    const colMat = new THREE.MeshStandardMaterial({
      color: 0x110c24,
      roughness: 0.5,
      emissive: z % 30 === 0 ? 0x220011 : 0x001122
    });
    
    const leftCol = new THREE.Mesh(colGeo, colMat);
    leftCol.position.set(-archWidth / 2, archHeight / 2, 0);
    archGroup.add(leftCol);
    
    const rightCol = leftCol.clone();
    rightCol.position.x = archWidth / 2;
    archGroup.add(rightCol);
    
    this.scene.add(archGroup);
    this.neonArches.push(archGroup);
  }

  bindEvents() {
    // Resize Listener
    window.addEventListener('resize', () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      
      this.renderer.setSize(width, height);
    });

    // Keyboard Listeners
    window.addEventListener('keydown', (e) => {
      if (this.gameState !== 'PLAYING') return;
      if (this.controlMode !== 'KEYBOARD') return;

      switch(e.key) {
        case 'ArrowLeft':
        case 'a':
        case 'A':
          this.changeLane(-1);
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          this.changeLane(1);
          break;
        case 'ArrowUp':
        case 'w':
        case 'W':
        case ' ': // Space
          this.triggerJump();
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          this.triggerCrouch();
          break;
      }
    });

    // Menu Controls Setup
    const btnKeyboard = document.getElementById('btn-keyboard-mode');
    const btnCamera = document.getElementById('btn-camera-mode');
    const keyboardInstructions = document.getElementById('keyboard-instructions');
    const cameraInstructions = document.getElementById('camera-instructions');
    
    btnKeyboard.addEventListener('click', () => {
      this.controlMode = 'KEYBOARD';
      btnKeyboard.classList.add('active');
      btnCamera.classList.remove('active');
      keyboardInstructions.classList.remove('hidden');
      cameraInstructions.classList.add('hidden');
    });

    btnCamera.addEventListener('click', () => {
      this.controlMode = 'CAMERA';
      btnCamera.classList.add('active');
      btnKeyboard.classList.remove('active');
      cameraInstructions.classList.remove('hidden');
      keyboardInstructions.classList.add('hidden');
    });

    // Audio toggle
    const btnAudio = document.getElementById('btn-audio-toggle');
    const audioIcon = document.getElementById('audio-icon');
    btnAudio.addEventListener('click', () => {
      this.activeAudio = audioSystem.toggle();
      audioIcon.textContent = this.activeAudio ? '🔊' : '🔇';
    });

    // Start Button
    const btnStart = document.getElementById('btn-start-game');
    btnStart.addEventListener('click', () => {
      audioSystem.init();
      if (this.activeAudio) {
        audioSystem.playBGM();
      }
      
      if (this.controlMode === 'CAMERA') {
        this.startCalibrationPhase();
      } else {
        this.startRunning();
      }
    });

    // Restart Button
    const btnRestart = document.getElementById('btn-restart-game');
    btnRestart.addEventListener('click', () => {
      this.resetGame();
      this.startRunning();
    });
  }

  startCalibrationPhase() {
    this.gameState = 'CALIBRATION';
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('calibration-screen').classList.remove('hidden');
    document.getElementById('webcam-overlay').classList.remove('hidden');
    
    const webcamVideo = document.getElementById('webcam');
    const calibrationVideo = document.getElementById('calibration-video');
    const poseCanvas = document.getElementById('pose-canvas');
    const trackingStatus = document.getElementById('tracking-status');
    
    // Wire up tracking status callback
    const onStatusChange = (status) => {
      trackingStatus.className = `status-indicator ${status}`;
    };

    // Initialize posture tracker
    poseTracker.init(
      webcamVideo,
      poseCanvas,
      (action) => this.handleCameraAction(action),
      onStatusChange
    );

    // Sync calibration video feed
    poseTracker.start().then(() => {
      calibrationVideo.srcObject = webcamVideo.srcObject;
      calibrationVideo.play();
      
      // Start counting down calibration
      poseTracker.startCalibration(() => {
        // Calibration finished
        document.getElementById('calibration-screen').classList.add('hidden');
        calibrationVideo.srcObject = null;
        this.startRunning();
      });
    });
  }

  handleCameraAction(action) {
    if (this.gameState !== 'PLAYING') return;
    if (this.controlMode !== 'CAMERA') return;

    switch(action) {
      case 'LEFT':
        this.targetLane = 0;
        break;
      case 'RIGHT':
        this.targetLane = 2;
        break;
      case 'CENTER':
        this.targetLane = 1;
        break;
      case 'JUMP':
        this.triggerJump();
        break;
      case 'CROUCH':
        this.triggerCrouch();
        break;
      case 'HANDS_UP':
        this.triggerHandsUpEffect();
        break;
    }
  }

  triggerHandsUpEffect() {
    if (this.hoverboardActive || this.gameState !== 'PLAYING') return;

    console.log("[GAME] Hoverboard active! Spawning shield mesh...");
    this.hoverboardActive = true;
    
    // Create neon shield sphere
    const shieldGeo = new THREE.SphereGeometry(0.9, 16, 16);
    const shieldMat = new THREE.MeshBasicMaterial({
      color: 0x39ff14,
      wireframe: true,
      transparent: true,
      opacity: 0.7
    });
    this.shieldMesh = new THREE.Mesh(shieldGeo, shieldMat);
    this.playerGroup.add(this.shieldMesh);

    // Play chime sound
    audioSystem.playCoin();

    // Auto-expire after 5 seconds if not popped
    if (this.hoverboardTimeout) clearTimeout(this.hoverboardTimeout);
    this.hoverboardTimeout = setTimeout(() => {
      this.deactivateHoverboard(false);
    }, 5000);
  }

  deactivateHoverboard(burstParticles) {
    if (!this.hoverboardActive) return;

    if (this.shieldMesh) {
      this.playerGroup.remove(this.shieldMesh);
      this.shieldMesh.geometry.dispose();
      this.shieldMesh.material.dispose();
      this.shieldMesh = null;
    }

    if (this.hoverboardTimeout) {
      clearTimeout(this.hoverboardTimeout);
      this.hoverboardTimeout = null;
    }

    if (burstParticles) {
      // Spawn burst of green sparks
      const pCount = 20;
      const pGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
      const pMat = new THREE.MeshBasicMaterial({ color: 0x39ff14 });
      
      for (let i = 0; i < pCount; i++) {
        const mesh = new THREE.Mesh(pGeo, pMat);
        mesh.position.copy(this.playerGroup.position);
        this.scene.add(mesh);
        
        this.particles.push({
          mesh: mesh,
          velocity: new THREE.Vector3(
            (Math.random() - 0.5) * 8,
            Math.random() * 8 + 2,
            (Math.random() - 0.5) * 8
          ),
          decay: 0.93,
          life: 0.5
        });
      }
      
      // Play slide crash sound and trigger invincibility immunity
      audioSystem.playSlide();
      this.invincibleTimer = 1.5;
    }

    this.hoverboardActive = false;
  }

  changeLane(direction) {
    this.targetLane = THREE.MathUtils.clamp(this.targetLane + direction, 0, 2);
  }

  triggerJump() {
    if (this.isJumping || this.isCrouching) return;
    this.isJumping = true;
    this.jumpProgress = 0;
    audioSystem.playJump();
  }

  triggerCrouch() {
    if (this.isCrouching) return;
    
    // If in the air jumping, crouch will cancel jump and dive down fast
    if (this.isJumping) {
      this.isJumping = false;
      this.playerGroup.position.y = 0.6;
    }
    
    this.isCrouching = true;
    this.crouchProgress = 0;
    audioSystem.playSlide();
  }

  startRunning() {
    this.gameState = 'PLAYING';
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    
    if (this.controlMode === 'CAMERA') {
      document.getElementById('webcam-overlay').classList.remove('hidden');
    } else {
      document.getElementById('webcam-overlay').classList.add('hidden');
    }

    this.clock.getDelta(); // reset clock
    this.lastObstacleSpawnZ = -20;
  }

  resetGame() {
    // Reset player position
    this.currentLane = 1;
    this.targetLane = 1;
    this.playerX = 0;
    this.playerGroup.position.set(0, 0.6, 0);
    this.isJumping = false;
    this.isCrouching = false;
    
    // Clear obstacles
    this.obstacles.forEach(o => this.scene.remove(o));
    this.obstacles = [];
    
    // Clear coins
    this.coinsList.forEach(c => this.scene.remove(c));
    this.coinsList = [];
    
    // Clear particles
    this.particles.forEach(p => this.scene.remove(p.mesh));
    this.particles = [];

    // Reset scores & speeds
    this.score = 0;
    this.coins = 0;
    this.speed = 1.0;
    this.distanceRun = 0;
    
    // Reset hoverboard and shield
    if (this.hoverboardActive) {
      this.deactivateHoverboard(false);
    }
    this.invincibleTimer = 0;

    document.getElementById('game-over-screen').classList.add('hidden');
    
    if (this.activeAudio) {
      audioSystem.stopBGM();
      audioSystem.playBGM();
    }
  }

  gameOver() {
    this.gameState = 'GAMEOVER';
    audioSystem.playCrash();
    
    // Trigger splash particles
    this.spawnCrashExplosion();

    document.getElementById('hud').classList.add('hidden');
    document.getElementById('game-over-screen').classList.remove('hidden');
    
    document.getElementById('final-score').textContent = Math.floor(this.score);
    document.getElementById('final-coins').textContent = this.coins;

    if (this.activeAudio) {
      audioSystem.stopBGM();
    }
  }

  spawnCrashExplosion() {
    const pCount = 50;
    const pGeo = new THREE.BoxGeometry(0.15, 0.15, 0.15);
    
    for (let i = 0; i < pCount; i++) {
      const pMat = new THREE.MeshBasicMaterial({
        color: Math.random() > 0.5 ? 0x00f0ff : 0xff007f,
        transparent: true,
        opacity: 0.9
      });
      const pMesh = new THREE.Mesh(pGeo, pMat);
      
      // Position at player center
      pMesh.position.copy(this.playerGroup.position);
      this.scene.add(pMesh);
      
      // Velocity vectors
      this.particles.push({
        mesh: pMesh,
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 15,
          Math.random() * 12 + 2,
          (Math.random() - 0.5) * 15
        ),
        decay: Math.random() * 0.95 + 0.92,
        life: 1.0
      });
    }
  }

  tick() {
    requestAnimationFrame(() => this.tick());
    
    const delta = Math.min(this.clock.getDelta(), 0.1); // clamp to prevent clipping during lag spikes
    
    this.update(delta);
    this.render();
  }

  update(delta) {
    // 1. Update particles regardless of state (so explosions finish playing nicely)
    this.updateParticles(delta);

    // Update invincibility blinking
    if (this.invincibleTimer > 0) {
      this.invincibleTimer -= delta;
      const opacity = Math.sin(Date.now() * 0.04) * 0.4 + 0.6;
      this.playerBody.material.transparent = true;
      this.playerBody.material.opacity = opacity;
    } else {
      this.playerBody.material.transparent = false;
      this.playerBody.material.opacity = 1.0;
    }

    if (this.gameState !== 'PLAYING') {
      // Idle rotate rings in start menu
      this.ring1.rotation.y += delta * 1.5;
      this.ring2.rotation.y -= delta * 1.0;
      return;
    }

    // Update shield rotations
    if (this.hoverboardActive && this.shieldMesh) {
      this.shieldMesh.rotation.y += delta * 3.0;
      this.shieldMesh.rotation.x += delta * 1.5;
    }

    // 2. Increase difficulty (speed) over time
    this.speed += delta * 0.015;
    this.speedValEl.textContent = `${this.speed.toFixed(1)}x`;
    const curSpeed = this.baseSpeed * this.speed;
    
    // Distance run
    this.distanceRun += curSpeed * delta;
    this.score += delta * 30 * this.speed;
    this.scoreValEl.textContent = String(Math.floor(this.score)).padStart(6, '0');

    // 3. Move camera to add screen shake and standard tilt feel
    const targetCamY = 4.2 + (this.isCrouching ? -0.8 : 0);
    this.camera.position.y += (targetCamY - this.camera.position.y) * 0.08;

    // 4. Smooth lane changing transition
    const targetX = (this.targetLane - 1) * this.laneWidth;
    this.playerX += (targetX - this.playerX) * 12.0 * delta;
    this.playerGroup.position.x = this.playerX;
    
    // Tilt body slightly while changing lanes
    const tiltAmount = -(targetX - this.playerX) * 0.15;
    this.playerGroup.rotation.z = tiltAmount;

    // Ring animations
    this.ring1.rotation.y += delta * 4.0;
    this.ring1.rotation.x += delta * 1.0;
    this.ring2.rotation.y -= delta * 3.0;
    this.ring2.rotation.x -= delta * 1.5;

    // 5. Jump and Slide / Crouch Animations
    if (this.isJumping) {
      this.jumpProgress += delta / this.jumpDuration;
      if (this.jumpProgress >= 1.0) {
        this.isJumping = false;
        this.playerGroup.position.y = 0.6;
      } else {
        // Parabolic jump arc
        const t = this.jumpProgress;
        this.playerGroup.position.y = 0.6 + Math.sin(t * Math.PI) * this.jumpHeight;
      }
    }

    if (this.isCrouching) {
      this.crouchProgress += delta / this.crouchDuration;
      if (this.crouchProgress >= 1.0) {
        this.isCrouching = false;
        this.playerGroup.scale.set(1, 1, 1);
        this.playerGroup.position.y = 0.6;
      } else {
        // Squish body size
        const t = this.crouchProgress;
        const scaleY = 1.0 - Math.sin(t * Math.PI) * 0.55;
        this.playerGroup.scale.set(1, scaleY, 1);
        this.playerGroup.position.y = 0.6 - (1 - scaleY) * 0.5;
      }
    }

    // Shadow updates
    this.playerShadow.position.x = this.playerGroup.position.x;
    const heightFactor = 1.0 - Math.min((this.playerGroup.position.y - 0.6) / this.jumpHeight, 0.85);
    this.playerShadow.scale.set(heightFactor, heightFactor, heightFactor);
    this.playerShadow.material.opacity = 0.5 * heightFactor;

    // 6. Spawn Obstacles
    // Compare player visual distance traversed to last spawn position
    if (this.distanceRun - this.lastObstacleSpawnZ >= this.obstacleSpawnInterval) {
      this.spawnObstaclePattern();
      this.lastObstacleSpawnZ = this.distanceRun;
    }

    // 7. Move & Recycle Environment
    // Move Neon arches towards camera
    const environmentSpeed = curSpeed;
    this.neonArches.forEach(arch => {
      arch.position.z += environmentSpeed * delta;
      
      // If it passes behind the camera, send it to the back
      if (arch.position.z > 15) {
        arch.position.z -= 300;
      }
    });

    // 8. Move Obstacles & Coins and Detect Collisions
    this.updateObstacles(delta, environmentSpeed);
    this.updateCoins(delta, environmentSpeed);
    this.spawnRunTrails(delta);
  }

  updateParticles(delta) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.mesh.position.addScaledVector(p.velocity, delta);
      p.velocity.y -= 9.8 * delta; // Gravity
      p.velocity.multiplyScalar(p.decay);
      
      p.life -= delta * 1.2;
      p.mesh.material.opacity = p.life;
      
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
        this.particles.splice(i, 1);
      }
    }
  }

  spawnRunTrails(delta) {
    // Generate subtle sparks behind player when moving on the ground
    if (this.isJumping || Math.random() > 0.3) return;

    const trailGeo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
    const trailMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.8
    });
    const trailMesh = new THREE.Mesh(trailGeo, trailMat);
    trailMesh.position.copy(this.playerGroup.position);
    trailMesh.position.y = 0.1; // flat on floor
    trailMesh.position.z += 0.5; // behind center
    this.scene.add(trailMesh);

    this.particles.push({
      mesh: trailMesh,
      velocity: new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 1.5, this.baseSpeed * this.speed * 0.4),
      decay: 0.95,
      life: 0.5
    });
  }

  spawnObstaclePattern() {
    const spawnZ = -220; // Spawn far out
    
    // Choose obstacle configuration layout
    // At least one lane MUST be completely passable
    const laneLayouts = [
      ['EMPTY', 'COINS', 'BARRIER_LOW'],
      ['BARRIER_LOW', 'EMPTY', 'TRAIN'],
      ['TRAIN', 'BARRIER_HIGH', 'EMPTY'],
      ['BARRIER_HIGH', 'EMPTY', 'BARRIER_LOW'],
      ['COINS', 'TRAIN', 'EMPTY'],
      ['EMPTY', 'TRAIN', 'TRAIN'], // Hard: two trains side by side
      ['TRAIN', 'EMPTY', 'TRAIN'], // Hard: gap in middle
      ['BARRIER_LOW', 'COINS', 'EMPTY']
    ];

    const randomLayout = laneLayouts[Math.floor(Math.random() * laneLayouts.length)];
    
    for (let laneIdx = 0; laneIdx < 3; laneIdx++) {
      const type = randomLayout[laneIdx];
      const laneX = (laneIdx - 1) * this.laneWidth;

      if (type === 'COINS') {
        this.spawnCoinRow(laneX, spawnZ);
      } else if (type === 'BARRIER_LOW') {
        this.spawnLowBarrier(laneX, spawnZ);
      } else if (type === 'BARRIER_HIGH') {
        this.spawnHighBarrier(laneX, spawnZ);
      } else if (type === 'TRAIN') {
        this.spawnTrain(laneX, spawnZ);
      }
    }
  }

  spawnCoinRow(laneX, spawnZ) {
    const numCoins = 3;
    const spacing = 4.0;
    
    for (let i = 0; i < numCoins; i++) {
      const coinGeo = new THREE.TorusGeometry(0.3, 0.08, 8, 24);
      const coinMat = new THREE.MeshStandardMaterial({
        color: 0xffd700, // Gold
        metalness: 0.9,
        roughness: 0.1,
        emissive: 0xaa8800
      });
      const coin = new THREE.Mesh(coinGeo, coinMat);
      coin.castShadow = true;
      coin.position.set(laneX, 0.6, spawnZ - (i * spacing));
      coin.rotation.y = Math.random() * Math.PI;
      
      this.scene.add(coin);
      this.coinsList.push(coin);
    }
  }

  spawnLowBarrier(laneX, spawnZ) {
    const barrierGroup = new THREE.Group();
    barrierGroup.position.set(laneX, 0, spawnZ);
    barrierGroup.userData = { type: 'BARRIER_LOW', laneX: laneX };

    // Hazard crossbar
    const barGeo = new THREE.BoxGeometry(2.6, 0.25, 0.25);
    const barMat = new THREE.MeshStandardMaterial({
      color: 0xff003c, // Neon Red
      emissive: 0x880011
    });
    const bar = new THREE.Mesh(barGeo, barMat);
    bar.position.y = 0.5; // low height, requires jump
    bar.castShadow = true;
    barrierGroup.add(bar);

    // Left/Right support stands
    const standGeo = new THREE.BoxGeometry(0.2, 0.6, 0.2);
    const standMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
    
    const leftStand = new THREE.Mesh(standGeo, standMat);
    leftStand.position.set(-1.1, 0.3, 0);
    leftStand.castShadow = true;
    barrierGroup.add(leftStand);
    
    const rightStand = leftStand.clone();
    rightStand.position.x = 1.1;
    barrierGroup.add(rightStand);

    this.scene.add(barrierGroup);
    this.obstacles.push(barrierGroup);
  }

  spawnHighBarrier(laneX, spawnZ) {
    const barrierGroup = new THREE.Group();
    barrierGroup.position.set(laneX, 0, spawnZ);
    barrierGroup.userData = { type: 'BARRIER_HIGH', laneX: laneX };

    // Top block panel - requires sliding under
    const barGeo = new THREE.BoxGeometry(2.6, 1.2, 0.25);
    const barMat = new THREE.MeshStandardMaterial({
      color: 0x9d00ff, // neon purple
      emissive: 0x330055
    });
    const bar = new THREE.Mesh(barGeo, barMat);
    bar.position.y = 1.9; // 1.3 to 2.5 y coords blocked
    bar.castShadow = true;
    barrierGroup.add(bar);

    // Archway supports
    const standGeo = new THREE.BoxGeometry(0.2, 2.5, 0.2);
    const standMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
    
    const leftStand = new THREE.Mesh(standGeo, standMat);
    leftStand.position.set(-1.2, 1.25, 0);
    leftStand.castShadow = true;
    barrierGroup.add(leftStand);
    
    const rightStand = leftStand.clone();
    rightStand.position.x = 1.2;
    barrierGroup.add(rightStand);

    this.scene.add(barrierGroup);
    this.obstacles.push(barrierGroup);
  }

  spawnTrain(laneX, spawnZ) {
    const trainGroup = new THREE.Group();
    // Trains can move slightly or remain stationary. Let's start stationary, then move them at high speed multipliers!
    const trainSpeedZ = this.speed > 1.3 ? Math.random() * 12.0 + 3.0 : 0;
    
    trainGroup.position.set(laneX, 0, spawnZ);
    trainGroup.userData = { 
      type: 'TRAIN', 
      laneX: laneX,
      speedZ: trainSpeedZ // moves towards player
    };

    // Train Body
    const bodyGeo = new THREE.BoxGeometry(2.6, 2.8, 12.0);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x05081c,
      roughness: 0.2,
      metalness: 0.8,
      emissive: 0x01020f
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 1.4;
    body.castShadow = true;
    body.receiveShadow = true;
    trainGroup.add(body);

    // Glowing front windshield (lights)
    const glassGeo = new THREE.PlaneGeometry(2.2, 0.6);
    const glassMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
    const glass = new THREE.Mesh(glassGeo, glassMat);
    glass.position.set(0, 2.0, 6.01); // front face
    trainGroup.add(glass);

    // Headlights
    const lightGeo = new THREE.SphereGeometry(0.2, 8, 8);
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
    
    const leftLight = new THREE.Mesh(lightGeo, lightMat);
    leftLight.position.set(-0.9, 0.6, 6.02);
    trainGroup.add(leftLight);
    
    const rightLight = leftLight.clone();
    rightLight.position.x = 0.9;
    trainGroup.add(rightLight);

    this.scene.add(trainGroup);
    this.obstacles.push(trainGroup);
  }

  updateObstacles(delta, envSpeed) {
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const obs = this.obstacles[i];
      
      // Move obstacles towards player
      const obstacleMoveSpeed = envSpeed + (obs.userData.speedZ || 0);
      obs.position.z += obstacleMoveSpeed * delta;
      
      // Check collision
      if (this.checkObstacleCollision(obs)) {
        if (this.invincibleTimer > 0) {
          // Immune to hit
          continue;
        } else if (this.hoverboardActive) {
          // Shield saves player from crash
          this.deactivateHoverboard(true);
          this.scene.remove(obs);
          this.obstacles.splice(i, 1);
          continue;
        } else {
          this.gameOver();
          return;
        }
      }
      
      // Recycle if far behind camera
      if (obs.position.z > 20) {
        this.scene.remove(obs);
        this.obstacles.splice(i, 1);
      }
    }
  }

  checkObstacleCollision(obs) {
    // Only check collision if close along Z axis
    const distZ = Math.abs(obs.position.z - this.playerGroup.position.z);
    
    // Bounds check threshold depending on length of obstacle
    const lengthZ = obs.userData.type === 'TRAIN' ? 6.5 : 0.6; // Halves of Z-lengths
    if (distZ > lengthZ + 0.45) return false;
    
    // Check lane match
    // Player width fits in a lane, X coordinates must overlap
    const distX = Math.abs(obs.position.x - this.playerGroup.position.x);
    if (distX > 1.3) return false; // Different lane

    const pY = this.playerGroup.position.y;
    const type = obs.userData.type;

    if (type === 'BARRIER_LOW') {
      // Bounded up to y = 0.65
      // If player is on ground, collision. If jump peak height > 0.65 + playerRadius, player clears it.
      // Player bottom is at pY - 0.55
      const playerBottom = pY - 0.55;
      if (playerBottom < 0.65) {
        return true;
      }
    } else if (type === 'BARRIER_HIGH') {
      // Blocks Y from 1.3 to 2.5
      // If player is crouching, they pass underneath (their top scale reduces height to around 0.5)
      // If player is jumping, they collide with top
      const playerTop = pY + (this.isCrouching ? 0.2 : 0.55);
      if (playerTop > 1.3) {
        return true;
      }
    } else if (type === 'TRAIN') {
      // Blocks Y up to 2.8
      // Jump height (2.8 + 0.6 = 3.4 max Y).
      // Player bottom must be > 2.8.
      const playerBottom = pY - 0.55;
      if (playerBottom < 2.8) {
        return true;
      }
    }
    
    return false;
  }

  updateCoins(delta, envSpeed) {
    for (let i = this.coinsList.length - 1; i >= 0; i--) {
      const coin = this.coinsList[i];
      
      // Move coin towards player
      coin.position.z += envSpeed * delta;
      
      // Rotate coin
      coin.rotation.z += delta * 2.5;
      
      // Detect collection (simple sphere distance check)
      const dist = this.playerGroup.position.distanceTo(coin.position);
      if (dist < 1.0) {
        // Collect coin!
        this.coins++;
        this.score += 250; // Cash bonus
        this.coinValEl.textContent = this.coins;
        
        audioSystem.playCoin();
        
        // Spawn mini sparkles
        this.spawnCoinSparkles(coin.position);

        this.scene.remove(coin);
        coin.geometry.dispose();
        coin.material.dispose();
        this.coinsList.splice(i, 1);
        continue;
      }
      
      // Recycle if behind camera
      if (coin.position.z > 20) {
        this.scene.remove(coin);
        this.coinsList.splice(i, 1);
      }
    }
  }

  spawnCoinSparkles(pos) {
    const sCount = 8;
    const sGeo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
    const sMat = new THREE.MeshBasicMaterial({ color: 0xffd700 });
    
    for (let i = 0; i < sCount; i++) {
      const mesh = new THREE.Mesh(sGeo, sMat);
      mesh.position.copy(pos);
      this.scene.add(mesh);
      
      this.particles.push({
        mesh: mesh,
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 5,
          Math.random() * 5 + 1,
          (Math.random() - 0.5) * 5
        ),
        decay: 0.94,
        life: 0.4
      });
    }
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}

// Instantiate and start the game!
const game = new Game();
window.addEventListener('DOMContentLoaded', () => {
  game.init();
});
export default game;
