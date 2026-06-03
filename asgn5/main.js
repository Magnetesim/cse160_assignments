// cse160 assignment 5

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import * as CANNON from 'cannon-es';

//  DOM things
const canvas = document.getElementById('canvas');
const instructionsEl = document.getElementById('instructions');
const orbCountEl = document.getElementById('orb-count');
const winMessageEl = document.getElementById('win-message');
const clockHitsEl = document.getElementById('clock-hits');
const clockHitCountEl = document.getElementById('clock-hit-count');
const flashEl = document.getElementById('flash');

//  Three.js globals
let scene, camera, renderer, controls;
let spotLight;
const clock = new THREE.Clock();

// Animated visual-only objects (rotation / bobbing)
const animated = [];

// Physics-mesh pairs to sync every frame
const dynamicPairs = [];

// Collectible orbs
const orbs = [];

// Projectiles
const projectiles = [];

// Easter egg state
const easterEgg = {
  triggered: false,
  flashAlpha: 0,
  clockHits: 0,
  lastClockHit: -Infinity,
  clockObj: null,
  blurbTimer: null,
  clockPulse: 0,
  clockBaseScale: 1,
};
let nightSkyboxTex = null;
let daySkyboxTex = null;

//  Player / movement state
const keys = { KeyW: false, KeyA: false, KeyS: false, KeyD: false };
const moveSpeed = 8;
const playerHeight = 1.7;
const boundary = 90;

//  Game state
let collected = 0;
const totalOrbs = 3;
let lastShotTime = -Infinity;
const shotCooldown = 0.5; // seconds

//  Cannon world
let world;
let playerBody;
const groundCMat = new CANNON.Material('ground');
const objectCMat = new CANNON.Material('object');

//  Reusable PBR materials
const M = {
  darkMatte:   new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9, metalness: 0.0 }),
  lightMatte:  new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.8, metalness: 0.0 }),
  darkMetal:   new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.3, metalness: 0.9 }),
  midGray:     new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.6, metalness: 0.3 }),
  nearWhite:   new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.4, metalness: 0.1 }),
  pedestal:    new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.7, metalness: 0.2 }),
  redEmissive: new THREE.MeshStandardMaterial({
    color: 0xff2222, emissive: 0xff0000, emissiveIntensity: 0.9,
    roughness: 0.3, metalness: 0.1,
  }),
};

// Default orbs-win message HTML (used to restore the panel after the easter-egg blurb)
const WIN_MESSAGE_DEFAULT_HTML =
  'All orbs collected!' +
  '<br><span style="font-size:13px; color:#ccc; display:block; margin-top:8px; max-width:300px;">' +
  "You've noticed the clock, right? Shoot it five times and see what happens." +
  '</span>' +
  '<br><span style="font-size:14px; color:#aaa;">Press R to reset</span>';

// =============================================================================
//  Init
// =============================================================================
function init() {
  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 500);
  camera.position.set(0, playerHeight, 0);

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  setupControls();
  setupSkybox();
  setupIBL();
  setupFloor();
  setupLights();
  setupPhysics();
  setupShapes();
  loadModels();
  setupOrbs();

  window.addEventListener('resize', onResize);
}

function setupControls() {
  controls = new PointerLockControls(camera, document.body);

  // Click to lock the pointer
  canvas.addEventListener('click', () => controls.lock());

  controls.addEventListener('lock', () => {
    instructionsEl.style.display = 'none';
  });
  controls.addEventListener('unlock', () => {
    instructionsEl.style.display = 'block';
  });

  // Keyboard
  window.addEventListener('keydown', (e) => {
    if (e.code in keys) keys[e.code] = true;
    if (e.code === 'KeyR') reset();
  });
  window.addEventListener('keyup', (e) => {
    if (e.code in keys) keys[e.code] = false;
  });

  // Left-click to shoot (only when pointer is locked)
  document.addEventListener('mousedown', (e) => {
    if (e.button === 0 && controls.isLocked) {
      shootProjectile();
    }
  });
}

function setupSkybox() {
  // Procedural dark-void equirectangular skybox
  const c = document.createElement('canvas');
  c.width = 2048;
  c.height = 1024;
  const ctx = c.getContext('2d');

  // Vertical gradient: very dark with subtle variations
  const grad = ctx.createLinearGradient(0, 0, 0, c.height);
  grad.addColorStop(0.00, '#01010a');
  grad.addColorStop(0.50, '#040410');
  grad.addColorStop(1.00, '#000000');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, c.width, c.height);

  // Sparse dim "stars"
  for (let i = 0; i < 2500; i++) {
    const x = Math.random() * c.width;
    const y = Math.random() * c.height;
    const r = Math.random() * 0.9 + 0.2;
    const a = Math.random() * 0.55 + 0.1;
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Faint horizontal "void" bands for an abstract geometric hint
  ctx.strokeStyle = 'rgba(50,55,80,0.18)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 40; i++) {
    const y = Math.random() * c.height;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(c.width, y + (Math.random() - 0.5) * 30);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  nightSkyboxTex = tex;
  scene.background = tex;
  daySkyboxTex = makeDaySkybox();
}

function makeDaySkybox() {
  const c = document.createElement('canvas');
  c.width = 2048;
  c.height = 1024;
  const ctx = c.getContext('2d');

  // Bright sky gradient: blue at top, hazy at horizon
  const grad = ctx.createLinearGradient(0, 0, 0, c.height);
  grad.addColorStop(0.00, '#3d7fb8');
  grad.addColorStop(0.45, '#8bbfe0');
  grad.addColorStop(0.55, '#d8e8ee');
  grad.addColorStop(0.65, '#c7b894');
  grad.addColorStop(1.00, '#8a7456');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, c.width, c.height);

  // Sun
  const sunX = c.width * 0.68;
  const sunY = c.height * 0.22;
  const sunGrad = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 260);
  sunGrad.addColorStop(0.00, 'rgba(255, 252, 230, 1)');
  sunGrad.addColorStop(0.15, 'rgba(255, 235, 180, 0.9)');
  sunGrad.addColorStop(0.50, 'rgba(255, 210, 140, 0.35)');
  sunGrad.addColorStop(1.00, 'rgba(255, 200, 120, 0)');
  ctx.fillStyle = sunGrad;
  ctx.fillRect(0, 0, c.width, c.height);

  // Wispy clouds
  for (let i = 0; i < 28; i++) {
    const cx = Math.random() * c.width;
    const cy = Math.random() * c.height * 0.45;
    const cw = 120 + Math.random() * 240;
    const ch = 18 + Math.random() * 28;
    ctx.fillStyle = `rgba(255, 255, 255, ${0.25 + Math.random() * 0.35})`;
    ctx.beginPath();
    ctx.ellipse(cx, cy, cw, ch, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Faint distant horizon band for a subtle hint of ground/scenery
  ctx.fillStyle = 'rgba(120, 130, 110, 0.18)';
  ctx.fillRect(0, c.height * 0.58, c.width, c.height * 0.04);

  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function setupIBL() {
  // Use RoomEnvironment for IBL so metallic materials have realistic reflections
  // without affecting the visible dark-void background.
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
}

function setupFloor() {
  // Procedural checkerboard floor (CanvasTexture with NearestFilter)
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d');
  const size = 64;
  for (let y = 0; y < 512; y += size) {
    for (let x = 0; x < 512; x += size) {
      ctx.fillStyle = ((x / size + y / size) & 1) === 0 ? '#dcdcdc' : '#0a0a0a';
      ctx.fillRect(x, y, size, size);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.repeat.set(20, 20);
  tex.colorSpace = THREE.SRGBColorSpace;

  const floorGeo = new THREE.PlaneGeometry(200, 200);
  const floorMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, metalness: 0.0 });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0;
  floor.receiveShadow = true;
  scene.add(floor);
}

function setupLights() {
  RectAreaLightUniformsLib.init();

  // Ambient — low-level cool fill
  scene.add(new THREE.AmbientLight(0x222244, 0.35));

  // Directional — harsh overhead key
  const dir = new THREE.DirectionalLight(0xffffff, 2.5);
  dir.position.set(20, 35, 15);
  dir.castShadow = true;
  dir.shadow.mapSize.set(2048, 2048);
  dir.shadow.camera.near = 0.5;
  dir.shadow.camera.far = 150;
  dir.shadow.camera.left = -60;
  dir.shadow.camera.right = 60;
  dir.shadow.camera.top = 60;
  dir.shadow.camera.bottom = -60;
  dir.shadow.bias = -0.0005;
  scene.add(dir);

  // SpotLight — theatrical red on knight
  spotLight = new THREE.SpotLight(0xff4444, 80, 40, Math.PI / 6, 0.3, 1.5);
  spotLight.position.set(0, 18, -22);
  spotLight.target.position.set(0, 2, -28);
  spotLight.castShadow = true;
  scene.add(spotLight);
  scene.add(spotLight.target);

  // RectAreaLight — fluorescent ceiling panel
  const rect = new THREE.RectAreaLight(0xddddff, 5, 12, 4);
  rect.position.set(0, 18, -25);
  rect.lookAt(0, 0, -25);
  scene.add(rect);
}

function setupShapes() {
  // ---------- 1. Hero floating cube (textured, rotating, NOT dynamic) ----------
  const cubeTex = makeCheckerTexture(2, 32, '#f0f0f0', '#101010');
  const heroCube = new THREE.Mesh(
    new THREE.BoxGeometry(3, 3, 3),
    new THREE.MeshStandardMaterial({ map: cubeTex, roughness: 0.55, metalness: 0.15 })
  );
  heroCube.position.set(0, 5, -12);
  heroCube.castShadow = true;
  heroCube.receiveShadow = true;
  scene.add(heroCube);
  animated.push({ mesh: heroCube, type: 'rot', ax: 0.3, ay: 0.5, az: 0.2 });

  // ---------- 2-4. Three large monolith cubes (static) ----------
  const monoliths = [
    { x: -25, y: 4, z: 5,   s: [4, 8, 4] },
    { x:  28, y: 3, z: -8,  s: [5, 6, 5] },
    { x: -35, y: 5, z: -25, s: [3, 10, 3] },
  ];
  monoliths.forEach((p) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(...p.s), M.darkMatte);
    m.position.set(p.x, p.y, p.z);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
  });

  // ---------- 5-7. Three small scattered cubes (DYNAMIC) ----------
  const smallCubes = [
    { x:  8,  y: 0.8, z: -5 },
    { x: -10, y: 0.8, z:  4 },
    { x:  12, y: 0.8, z: 15 },
  ];
  smallCubes.forEach((p, i) => {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 1.4, 1.4),
      i % 2 === 0 ? M.lightMatte : M.midGray
    );
    m.position.set(p.x, p.y, p.z);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
    addDynamicBox(m, 0.7, 0.7, 0.7, 1.0);
  });

  // ---------- 8-12. Five spheres (mix of bobbing + dynamic) ----------
  const sphereData = [
    { x:  12, y: 3,   z: -8,  r: 1.5, mat: M.darkMetal,   bob: true,  dyn: false },
    { x:  -8, y: 2.5, z:  12, r: 1.0, mat: M.nearWhite,   bob: true,  dyn: false },
    { x:  18, y: 1.5, z:  3,  r: 1.0, mat: M.midGray,     bob: false, dyn: true  },
    { x: -22, y: 1.2, z:  -5, r: 0.8, mat: M.darkMetal,   bob: false, dyn: true  },
    { x:   0, y: 1.2, z:  25, r: 0.6, mat: M.lightMatte,  bob: false, dyn: true  },
  ];
  sphereData.forEach((p) => {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(p.r, 32, 24),
      p.mat
    );
    m.position.set(p.x, p.y, p.z);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
    if (p.bob) {
      animated.push({
        mesh: m, type: 'bob',
        baseY: p.y,
        speed: 0.8 + Math.random() * 0.6,
        amp:   0.25 + Math.random() * 0.25,
        offset: Math.random() * Math.PI * 2,
      });
    }
    if (p.dyn) addDynamicSphere(m, p.r, 1.5);
  });

  // ---------- 13-15. Three tall cylinder pillars (static) ----------
  const pillars = [
    { x: -12, y: 5,  z: -18, r: 0.6, h: 10, mat: M.lightMatte },
    { x:  22, y: 3,  z:  10, r: 1.0, h:  6, mat: M.midGray    },
    { x:  -5, y: 4,  z:  35, r: 0.8, h:  8, mat: M.darkMatte  },
  ];
  pillars.forEach((p) => {
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(p.r, p.r, p.h, 24),
      p.mat
    );
    m.position.set(p.x, p.y, p.z);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
  });

  // ---------- 16-17. Two tori (one spinning via physics, one static) ----------
  const t1 = new THREE.Mesh(
    new THREE.TorusGeometry(2.0, 0.4, 16, 32),
    M.darkMetal
  );
  t1.position.set(-8, 6, 25);
  t1.rotation.x = Math.PI / 2;
  t1.castShadow = true;
  t1.receiveShadow = true;
  scene.add(t1);
  addDynamicBox(t1, 2.0, 0.4, 2.0, 0.8, { ax: 0, ay: 0, az: 0.6 }); // spinning

  const t2 = new THREE.Mesh(
    new THREE.TorusGeometry(1.2, 0.3, 16, 32),
    M.nearWhite
  );
  t2.position.set(15, 4, -20);
  t2.castShadow = true;
  t2.receiveShadow = true;
  scene.add(t2);

  // ---------- 18-19. Two cones (obelisks, static) ----------
  const c1 = new THREE.Mesh(new THREE.ConeGeometry(0.8, 6, 16), M.darkMatte);
  c1.position.set(-18, 3, 22);
  c1.castShadow = c1.receiveShadow = true;
  scene.add(c1);

  const c2 = new THREE.Mesh(new THREE.ConeGeometry(1.2, 8, 16), M.midGray);
  c2.position.set(30, 4, -25);
  c2.castShadow = c2.receiveShadow = true;
  scene.add(c2);

  // ---------- 20. Icosahedron (DYNAMIC, low-poly crystal) ----------
  const ico = new THREE.Mesh(new THREE.IcosahedronGeometry(1.5, 1), M.lightMatte);
  ico.position.set(-30, 2, -20);
  ico.castShadow = ico.receiveShadow = true;
  scene.add(ico);
  addDynamicSphere(ico, 1.5, 1.2, { ax: 0.2, ay: 0.4, az: 0.1 });

  // ---------- 21. TorusKnot (DYNAMIC, complex floating form) ----------
  const tk = new THREE.Mesh(
    new THREE.TorusKnotGeometry(1.0, 0.35, 64, 16),
    M.darkMetal
  );
  tk.position.set(30, 4, 15);
  tk.castShadow = tk.receiveShadow = true;
  scene.add(tk);
  addDynamicSphere(tk, 1.5, 0.8, { ax: 0.2, ay: 0.3, az: 0.15 });

  // ---------- 22-24. Three pedestals under the .glb sculptures ----------
  const peds = [
    { x:   0, y: 0.5, z: -28, r: 1.4, h: 1.0 },
    { x:  25, y: 0.5, z:  -3, r: 1.2, h: 1.0 },
    { x: -22, y: 0.5, z:  25, r: 1.4, h: 1.0 },
  ];
  peds.forEach((p) => {
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(p.r, p.r * 1.1, p.h, 24),
      M.pedestal
    );
    m.position.set(p.x, p.y, p.z);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
  });

  // Total: 1 + 3 + 3 + 5 + 3 + 2 + 2 + 1 + 1 + 3 = 24 primary shapes
}

function loadModels() {
  const loader = new GLTFLoader();
  const base = 'models/';

  function placeModel(file, pos, scale, rotY = 0, storeRef = null) {
    loader.load(base + file, (gltf) => {
      const obj = gltf.scene;
      obj.position.set(pos[0], pos[1], pos[2]);
      obj.scale.setScalar(scale);
      obj.rotation.y = rotY;
      obj.traverse((c) => {
        if (c.isMesh) {
          c.castShadow = true;
          c.receiveShadow = true;
        }
      });
      scene.add(obj);
      if (storeRef) storeRef(obj);
    }, undefined, (err) => {
      console.error('Failed to load model', file, err);
    });
  }

  // Knight: directly under the spotlight
  placeModel('Knight_chess_piece.glb', [0, 1.0, -28], 3.5);
  // Pawn: offset to the right
  placeModel('Pawn.glb',                 [25, 1.0, -3], 3.0);
  // Clock: opposite corner (stored for easter egg)
  placeModel('Analog_clock.glb',         [-22, 1.0, 25], 3.0, 0, (o) => {
    easterEgg.clockObj = o;
    easterEgg.clockBaseScale = 3.0;
    // Use the model's bounding-box center for hit detection, not the .glb origin
    // (the .glb's origin is typically at the bottom of the model).
    const box = new THREE.Box3().setFromObject(o);
    easterEgg.clockCenter = new THREE.Vector3();
    box.getCenter(easterEgg.clockCenter);
  });
}

function setupOrbs() {
  const orbPositions = [
    { x: -20, y: 1.2, z: -30 },
    { x:  25, y: 1.2, z: -25 },
    { x:  15, y: 1.2, z:  30 },
  ];
  orbPositions.forEach((p) => {
    const orb = new THREE.Mesh(
      new THREE.SphereGeometry(0.6, 24, 24),
      M.redEmissive
    );
    orb.position.set(p.x, p.y, p.z);
    orb.castShadow = true;
    scene.add(orb);
    // Tiny attached point light so the orb illuminates its surroundings
    const pl = new THREE.PointLight(0xff2222, 1.5, 8, 2);
    orb.add(pl);
    orbs.push(orb);
  });
  updateOrbHUD();
}

function setupPhysics() {
  world = new CANNON.World();
  world.gravity.set(0, -9.82, 0);
  world.broadphase = new CANNON.NaiveBroadphase();
  world.solver.iterations = 10;
  world.defaultContactMaterial.friction = 0.4;
  world.defaultContactMaterial.restitution = 0.2;

  // Ground plane
  const ground = new CANNON.Body({
    mass: 0,
    shape: new CANNON.Plane(),
    material: groundCMat,
  });
  ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(ground);

  // Player kinematic body — follows camera, pushes dynamic objects
  const playerShape = new CANNON.Sphere(0.5);
  playerBody = new CANNON.Body({
    type: CANNON.Body.KINEMATIC,
    shape: playerShape,
  });
  world.addBody(playerBody);
}

function addDynamicBox(mesh, hx, hy, hz, mass, spin = null) {
  const shape = new CANNON.Box(new CANNON.Vec3(hx, hy, hz));
  const body = new CANNON.Body({ mass, shape, material: objectCMat });
  body.position.set(mesh.position.x, mesh.position.y, mesh.position.z);
  body.linearDamping = 0.25;
  body.angularDamping = 0.25;
  if (spin) body.angularVelocity.set(spin.ax, spin.ay, spin.az);
  world.addBody(body);
  dynamicPairs.push({
    mesh, body,
    initPos:  body.position.clone(),
    initQuat: body.quaternion.clone(),
  });
}

function addDynamicSphere(mesh, radius, mass, spin = null) {
  const shape = new CANNON.Sphere(radius);
  const body = new CANNON.Body({ mass, shape, material: objectCMat });
  body.position.set(mesh.position.x, mesh.position.y, mesh.position.z);
  body.linearDamping = 0.25;
  body.angularDamping = 0.25;
  if (spin) body.angularVelocity.set(spin.ax, spin.ay, spin.az);
  world.addBody(body);
  dynamicPairs.push({
    mesh, body,
    initPos:  body.position.clone(),
    initQuat: body.quaternion.clone(),
  });
}

function shootProjectile() {
  const now = clock.getElapsedTime();
  if (now - lastShotTime < shotCooldown) return;
  lastShotTime = now;

  // Reward: once all orbs are collected, projectiles turn red and grow larger
  const powered = (collected === totalOrbs);
  const radius  = powered ? 0.35 : 0.2;
  const color   = powered ? 0xff2222 : 0xffffff;
  const emiss   = powered ? 0xff0000 : 0xffffff;
  const lightC  = powered ? 0xff4040 : 0xffffff;
  const emI     = powered ? 1.2 : 0.8;
  const lightI  = powered ? 1.6 : 0.8;

  // Compute spawn position slightly in front of the camera
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const start = camera.position.clone().add(dir.clone().multiplyScalar(1.5));

  // Visual mesh
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 12, 12),
    new THREE.MeshStandardMaterial({
      color, emissive: emiss, emissiveIntensity: emI,
    })
  );
  mesh.position.copy(start);
  scene.add(mesh);

  // Physics body
  const shape = new CANNON.Sphere(radius);
  const body = new CANNON.Body({ mass: 0.5, shape, material: objectCMat });
  body.position.set(start.x, start.y, start.z);
  body.velocity.set(dir.x * 30, dir.y * 30, dir.z * 30);
  world.addBody(body);

  // Small attached light so the projectile glows as it flies
  const pl = new THREE.PointLight(lightC, lightI, 4, 2);
  mesh.add(pl);

  projectiles.push({ mesh, body, age: 0 });
}

function reset() {
  // Restore orbs
  for (const o of orbs) o.visible = true;
  collected = 0;
  updateOrbHUD();

  // Reset dynamic bodies to their starting transforms
  for (const p of dynamicPairs) {
    p.body.position.copy(p.initPos);
    p.body.quaternion.copy(p.initQuat);
    p.body.velocity.set(0, 0, 0);
    p.body.angularVelocity.set(0, 0, 0);
    p.body.wakeUp();
  }

  // Remove any projectiles
  for (const pr of projectiles) {
    scene.remove(pr.mesh);
    world.removeBody(pr.body);
  }
  projectiles.length = 0;

  // Reset easter egg
  easterEgg.triggered = false;
  easterEgg.clockHits = 0;
  easterEgg.flashAlpha = 0;
  easterEgg.clockPulse = 0;
  flashEl.style.opacity = 0;
  clockHitsEl.style.display = 'none';
  if (easterEgg.clockObj) {
    easterEgg.clockObj.rotation.y = 0;
    easterEgg.clockObj.scale.setScalar(easterEgg.clockBaseScale);
  }
  scene.background = nightSkyboxTex;
  if (easterEgg.blurbTimer) { clearTimeout(easterEgg.blurbTimer); easterEgg.blurbTimer = null; }
  // Always restore the orbs-win panel HTML so old easter-egg text doesn't persist
  winMessageEl.innerHTML = WIN_MESSAGE_DEFAULT_HTML;
  updateOrbHUD();
}

function updateOrbHUD() {
  orbCountEl.textContent = collected;
  winMessageEl.style.display = (collected === totalOrbs) ? 'block' : 'none';
}

function updateClockHUD() {
  if (easterEgg.clockHits > 0) {
    clockHitsEl.style.display = 'block';
    clockHitCountEl.textContent = easterEgg.clockHits;
  }
}

function triggerEasterEgg() {
  easterEgg.triggered = true;
  // Rotate the clock 180° around Y
  if (easterEgg.clockObj) easterEgg.clockObj.rotation.y = Math.PI;
  // Swap the skybox to the day version
  scene.background = daySkyboxTex;
  // Trigger the screen flash
  easterEgg.flashAlpha = 1.0;
  // Brief celebratory blurb (restore the orb-win HTML after ~1.8s)
  winMessageEl.innerHTML = 'Day mode unlocked!';
  winMessageEl.style.display = 'block';
  easterEgg.blurbTimer = setTimeout(() => {
    winMessageEl.innerHTML = WIN_MESSAGE_DEFAULT_HTML;
    updateOrbHUD();
  }, 1800);
}

function updateMovement(dt) {
  if (!controls.isLocked) return;

  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  dir.y = 0;
  dir.normalize();
  const right = new THREE.Vector3().crossVectors(dir, camera.up).normalize();

  const speed = moveSpeed * dt;
  if (keys.KeyW) camera.position.addScaledVector(dir, speed);
  if (keys.KeyS) camera.position.addScaledVector(dir, -speed);
  if (keys.KeyD) camera.position.addScaledVector(right, speed);
  if (keys.KeyA) camera.position.addScaledVector(right, -speed);

  // Clamp to ground level and scene boundary
  camera.position.y = playerHeight;
  camera.position.x = Math.max(-boundary, Math.min(boundary, camera.position.x));
  camera.position.z = Math.max(-boundary, Math.min(boundary, camera.position.z));
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function makeCheckerTexture(divisions, cellPx, lightHex, darkHex) {
  const c = document.createElement('canvas');
  c.width = c.height = divisions * cellPx;
  const ctx = c.getContext('2d');
  for (let y = 0; y < divisions; y++) {
    for (let x = 0; x < divisions; x++) {
      ctx.fillStyle = ((x + y) & 1) === 0 ? lightHex : darkHex;
      ctx.fillRect(x * cellPx, y * cellPx, cellPx, cellPx);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// =============================================================================
//  Animation loop
// =============================================================================
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const time = clock.getElapsedTime();

  // 1. Player movement
  updateMovement(dt);

  // 2. Sync player kinematic body to camera (track previous for velocity)
  if (playerBody) {
    const prevX = playerBody.position.x;
    const prevZ = playerBody.position.z;
    playerBody.position.set(camera.position.x, camera.position.y, camera.position.z);
    if (dt > 0) {
      playerBody.velocity.set(
        (playerBody.position.x - prevX) / dt,
        0,
        (playerBody.position.z - prevZ) / dt
      );
    }
  }

  // 3. Step physics
  world.step(1 / 60, dt, 3);

  // 4. Sync dynamic meshes from their physics bodies
  for (const p of dynamicPairs) {
    p.mesh.position.copy(p.body.position);
    p.mesh.quaternion.copy(p.body.quaternion);
  }

  // 5. Animate non-dynamic objects
  for (const a of animated) {
    if (a.type === 'rot') {
      a.mesh.rotation.x = time * a.ax;
      a.mesh.rotation.y = time * a.ay;
      a.mesh.rotation.z = time * a.az;
    } else if (a.type === 'bob') {
      a.mesh.position.y = a.baseY + Math.sin(time * a.speed + a.offset) * a.amp;
    }
  }

  // 6. Spotlight sweeps slowly across the knight
  spotLight.target.position.x = Math.sin(time * 0.3) * 4;
  spotLight.target.position.z = -28 + Math.cos(time * 0.3) * 2;
  spotLight.target.updateMatrixWorld();

  // 7. Orb collection check + pulse animation
  for (const orb of orbs) {
    if (!orb.visible) continue;
    const d = camera.position.distanceTo(orb.position);
    if (d < 3) {
      orb.visible = false;
      collected++;
      updateOrbHUD();
    } else {
      const s = 1 + Math.sin(time * 4) * 0.12;
      orb.scale.set(s, s, s);
    }
  }

  // 8. Projectiles: sync mesh from body, age out, check clock hits
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const pr = projectiles[i];
    pr.age += dt;
    pr.mesh.position.copy(pr.body.position);

    // Easter egg: projectile-near-clock hit detection (generous radius)
    if (!easterEgg.triggered && easterEgg.clockObj && easterEgg.clockCenter) {
      const d = pr.mesh.position.distanceTo(easterEgg.clockCenter);
      if (d < 6.0 && time - easterEgg.lastClockHit > 0.25) {
        easterEgg.clockHits++;
        easterEgg.lastClockHit = time;
        easterEgg.clockPulse = 0.35; // brief scale-up pulse for feedback
        updateClockHUD();
        if (easterEgg.clockHits >= 5) triggerEasterEgg();
      }
    }

    if (pr.age > 5) {
      scene.remove(pr.mesh);
      world.removeBody(pr.body);
      projectiles.splice(i, 1);
    }
  }

  // 9. Easter-egg flash fade
  if (easterEgg.flashAlpha > 0) {
    easterEgg.flashAlpha = Math.max(0, easterEgg.flashAlpha - dt * 1.6);
    flashEl.style.opacity = easterEgg.flashAlpha;
  }

  // 10. Clock hit-pulse decay
  if (easterEgg.clockObj && easterEgg.clockPulse > 0) {
    easterEgg.clockPulse = Math.max(0, easterEgg.clockPulse - dt * 1.4);
    const s = easterEgg.clockBaseScale * (1 + easterEgg.clockPulse * 0.25);
    easterEgg.clockObj.scale.setScalar(s);
  }

  renderer.render(scene, camera);
}

// =============================================================================
//  Go
// =============================================================================
init();
animate();
