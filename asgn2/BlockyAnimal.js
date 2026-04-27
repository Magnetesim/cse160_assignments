// Vertex shader
var VSHADER_SOURCE =
  'attribute vec4 a_Position;\n' +
  'uniform mat4 u_ModelMatrix;\n' +
  'uniform mat4 u_GlobalRotation;\n' +
  'void main() {\n' +
  '  gl_Position = u_GlobalRotation * u_ModelMatrix * a_Position;\n' +
  '}\n';

// Fragment shader
var FSHADER_SOURCE =
  'precision mediump float;\n' +
  'uniform vec4 u_FragColor;\n' +
  'void main() {\n' +
  '  gl_FragColor = u_FragColor;\n' +
  '}\n';

// Global WebGL variables
let canvas;
let gl;
let a_Position;
let u_FragColor;
let u_ModelMatrix;
let u_GlobalRotation;

// Geometry buffers (created once for performance)
let g_cubeBuffer = null;
let g_pyramidBuffer = null;

// Global rotation and animation
let gAnimalGlobalRotation = 30;
let gAnimalGlobalRotationX = 0;
let g_animationOn = false;
let g_time = 0;
let g_startTime = performance.now();

// Poke animation
let g_pokeAnimation = false;
let g_pokeStartTime = 0;
let g_pokeBodyTilt = 0;
let g_pokeBodyLift = 0;

// Performance tracking
let g_frames = 0;
let g_lastFPSTime = 0;
let g_fps = 0;

// Mouse drag
let g_lastMouseX = 0;
let g_lastMouseY = 0;
let g_mouseDragging = false;

// Camel joint angles
let g_lfThighAngle = 0;
let g_lfCalfAngle = 0;
let g_lfFootAngle = 0;
let g_rfThighAngle = 0;
let g_rfCalfAngle = 0;
let g_rfFootAngle = 0;
let g_lbThighAngle = 0;
let g_lbCalfAngle = 0;
let g_lbFootAngle = 0;
let g_rbThighAngle = 0;
let g_rbCalfAngle = 0;
let g_rbFootAngle = 0;
let g_neckAngle = 0;
let g_headAngle = 0;
let g_tailAngle = 0;

// Colors
const COLOR_BODY = [0.82, 0.70, 0.55, 1.0];
const COLOR_HUMP = [0.75, 0.62, 0.48, 1.0];
const COLOR_LEG  = [0.72, 0.58, 0.44, 1.0];
const COLOR_FOOT = [0.55, 0.42, 0.30, 1.0];
const COLOR_NECK = [0.82, 0.70, 0.55, 1.0];
const COLOR_HEAD = [0.82, 0.70, 0.55, 1.0];
const COLOR_TAIL = [0.72, 0.58, 0.44, 1.0];
const COLOR_EAR  = [0.65, 0.50, 0.38, 1.0];
const COLOR_EYE  = [0.1, 0.1, 0.1, 1.0];
const COLOR_NOSE = [0.65, 0.50, 0.38, 1.0];

function main() {
  setupWebGL();
  connectVariablesToGLSL();
  initBuffers();
  addActionsForHtmlUI();

  gl.clearColor(0.2, 0.4, 0.6, 1.0);
  gl.enable(gl.DEPTH_TEST);

  // Mouse interaction
  canvas.onmousedown = handleMouseDown;
  canvas.onmousemove = handleMouseMove;
  canvas.onmouseup = handleMouseUp;
  canvas.onmouseleave = handleMouseUp;

  requestAnimationFrame(tick);
}

function setupWebGL() {
  canvas = document.getElementById('webgl');
  gl = canvas.getContext('webgl', { preserveDrawingBuffer: true });
  if (!gl) {
    console.log('Failed to get the rendering context for WebGL');
    return;
  }
}

function connectVariablesToGLSL() {
  if (!initShaders(gl, VSHADER_SOURCE, FSHADER_SOURCE)) {
    console.log('Failed to initialize shaders.');
    return;
  }

  a_Position = gl.getAttribLocation(gl.program, 'a_Position');
  if (a_Position < 0) {
    console.log('Failed to get the storage location of a_Position');
    return;
  }

  u_FragColor = gl.getUniformLocation(gl.program, 'u_FragColor');
  if (!u_FragColor) {
    console.log('Failed to get the storage location of u_FragColor');
    return;
  }

  u_ModelMatrix = gl.getUniformLocation(gl.program, 'u_ModelMatrix');
  if (!u_ModelMatrix) {
    console.log('Failed to get the storage location of u_ModelMatrix');
    return;
  }

  u_GlobalRotation = gl.getUniformLocation(gl.program, 'u_GlobalRotation');
  if (!u_GlobalRotation) {
    console.log('Failed to get the storage location of u_GlobalRotation');
    return;
  }
}

function initBuffers() {
  // Cube vertices: 36 vertices (12 triangles)
  const cubeVertices = new Float32Array([
    // Front face
    -0.5, -0.5,  0.5,   0.5, -0.5,  0.5,  -0.5,  0.5,  0.5,
    -0.5,  0.5,  0.5,   0.5, -0.5,  0.5,   0.5,  0.5,  0.5,
    // Back face
    -0.5, -0.5, -0.5,  -0.5,  0.5, -0.5,   0.5, -0.5, -0.5,
     0.5, -0.5, -0.5,  -0.5,  0.5, -0.5,   0.5,  0.5, -0.5,
    // Top face
    -0.5,  0.5, -0.5,  -0.5,  0.5,  0.5,   0.5,  0.5, -0.5,
     0.5,  0.5, -0.5,  -0.5,  0.5,  0.5,   0.5,  0.5,  0.5,
    // Bottom face
    -0.5, -0.5, -0.5,   0.5, -0.5, -0.5,  -0.5, -0.5,  0.5,
     0.5, -0.5, -0.5,   0.5, -0.5,  0.5,  -0.5, -0.5,  0.5,
    // Right face
     0.5, -0.5, -0.5,   0.5,  0.5, -0.5,   0.5, -0.5,  0.5,
     0.5, -0.5,  0.5,   0.5,  0.5, -0.5,   0.5,  0.5,  0.5,
    // Left face
    -0.5, -0.5, -0.5,  -0.5, -0.5,  0.5,  -0.5,  0.5, -0.5,
    -0.5,  0.5, -0.5,  -0.5, -0.5,  0.5,  -0.5,  0.5,  0.5,
  ]);

  g_cubeBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, g_cubeBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, cubeVertices, gl.STATIC_DRAW);

  // Pyramid vertices: 18 vertices (6 triangles)
  const pyramidVertices = new Float32Array([
    // Base
    -0.5, -0.5, -0.5,   0.5, -0.5, -0.5,   0.5, -0.5,  0.5,
    -0.5, -0.5, -0.5,   0.5, -0.5,  0.5,  -0.5, -0.5,  0.5,
    // Front
    -0.5, -0.5,  0.5,   0.5, -0.5,  0.5,   0.0,  0.5,  0.0,
    // Right
     0.5, -0.5,  0.5,   0.5, -0.5, -0.5,   0.0,  0.5,  0.0,
    // Back
     0.5, -0.5, -0.5,  -0.5, -0.5, -0.5,   0.0,  0.5,  0.0,
    // Left
    -0.5, -0.5, -0.5,  -0.5, -0.5,  0.5,   0.0,  0.5,  0.0,
  ]);

  g_pyramidBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, g_pyramidBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, pyramidVertices, gl.STATIC_DRAW);
}

function addActionsForHtmlUI() {
  document.getElementById('globalRotation').addEventListener('input', function() {
    gAnimalGlobalRotation = Number(this.value);
  });

  document.getElementById('lfThigh').addEventListener('input', function() {
    g_lfThighAngle = Number(this.value);
  });
  document.getElementById('lfCalf').addEventListener('input', function() {
    g_lfCalfAngle = Number(this.value);
  });
  document.getElementById('lfFoot').addEventListener('input', function() {
    g_lfFootAngle = Number(this.value);
  });

  document.getElementById('rfThigh').addEventListener('input', function() {
    g_rfThighAngle = Number(this.value);
  });
  document.getElementById('rfCalf').addEventListener('input', function() {
    g_rfCalfAngle = Number(this.value);
  });
  document.getElementById('rfFoot').addEventListener('input', function() {
    g_rfFootAngle = Number(this.value);
  });

  document.getElementById('lbThigh').addEventListener('input', function() {
    g_lbThighAngle = Number(this.value);
  });
  document.getElementById('lbCalf').addEventListener('input', function() {
    g_lbCalfAngle = Number(this.value);
  });
  document.getElementById('lbFoot').addEventListener('input', function() {
    g_lbFootAngle = Number(this.value);
  });

  document.getElementById('rbThigh').addEventListener('input', function() {
    g_rbThighAngle = Number(this.value);
  });
  document.getElementById('rbCalf').addEventListener('input', function() {
    g_rbCalfAngle = Number(this.value);
  });
  document.getElementById('rbFoot').addEventListener('input', function() {
    g_rbFootAngle = Number(this.value);
  });

  document.getElementById('neck').addEventListener('input', function() {
    g_neckAngle = Number(this.value);
  });
  document.getElementById('head').addEventListener('input', function() {
    g_headAngle = Number(this.value);
  });
  document.getElementById('tail').addEventListener('input', function() {
    g_tailAngle = Number(this.value);
  });

  document.getElementById('animOnButton').onclick = function() {
    g_animationOn = true;
  };
  document.getElementById('animOffButton').onclick = function() {
    g_animationOn = false;
  };
}

function handleMouseDown(ev) {
  if (ev.shiftKey) {
    g_pokeAnimation = true;
    g_pokeStartTime = g_time;
    return;
  }
  g_mouseDragging = true;
  g_lastMouseX = ev.clientX;
  g_lastMouseY = ev.clientY;
}

function handleMouseMove(ev) {
  if (!g_mouseDragging) return;
  let dx = ev.clientX - g_lastMouseX;
  let dy = ev.clientY - g_lastMouseY;
  gAnimalGlobalRotation -= dx * 0.5;
  gAnimalGlobalRotationX -= dy * 0.5;
  g_lastMouseX = ev.clientX;
  g_lastMouseY = ev.clientY;
}

function handleMouseUp() {
  g_mouseDragging = false;
}

function drawCube(matrix, color) {
  gl.uniformMatrix4fv(u_ModelMatrix, false, matrix.elements);
  gl.uniform4f(u_FragColor, color[0], color[1], color[2], color[3]);
  gl.bindBuffer(gl.ARRAY_BUFFER, g_cubeBuffer);
  gl.vertexAttribPointer(a_Position, 3, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(a_Position);
  gl.drawArrays(gl.TRIANGLES, 0, 36);
}

function drawPyramid(matrix, color) {
  gl.uniformMatrix4fv(u_ModelMatrix, false, matrix.elements);
  gl.uniform4f(u_FragColor, color[0], color[1], color[2], color[3]);
  gl.bindBuffer(gl.ARRAY_BUFFER, g_pyramidBuffer);
  gl.vertexAttribPointer(a_Position, 3, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(a_Position);
  gl.drawArrays(gl.TRIANGLES, 0, 18);
}

function drawLeg(baseMatrix, x, z, thighAngle, calfAngle, footAngle) {
  let THIGH_H = 0.32;
  let CALF_H  = 0.22;
  let FOOT_H  = 0.06;

  // Thigh: pivot at top (body attachment), cube extends downward
  let thighM = new Matrix4(baseMatrix);
  thighM.translate(x, -0.19, z); // body bottom
  thighM.rotate(thighAngle, 1, 0, 0);
  let thighJoint = new Matrix4(thighM);
  thighM.translate(0, -THIGH_H / 2, 0);
  thighM.scale(0.11, THIGH_H, 0.11);
  drawCube(thighM, COLOR_LEG);

  // Calf: pivot at top (thigh bottom), cube extends downward
  let calfM = new Matrix4(thighJoint);
  calfM.translate(0, -THIGH_H, 0);
  calfM.rotate(calfAngle, 1, 0, 0);
  let calfJoint = new Matrix4(calfM);
  calfM.translate(0, -CALF_H / 2, 0);
  calfM.scale(0.09, CALF_H, 0.09);
  drawCube(calfM, COLOR_LEG);

  // Foot: pivot at top (calf bottom), cube extends downward
  let footM = new Matrix4(calfJoint);
  footM.translate(0, -CALF_H, 0);
  footM.rotate(footAngle, 1, 0, 0);
  footM.translate(0, -FOOT_H / 2, 0);
  footM.scale(0.11, FOOT_H, 0.15);
  drawCube(footM, COLOR_FOOT);
}

function renderScene() {
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // Global rotation
  let globalM = new Matrix4();
  globalM.rotate(gAnimalGlobalRotationX, 1, 0, 0);
  globalM.rotate(gAnimalGlobalRotation, 0, 1, 0);
  gl.uniformMatrix4fv(u_GlobalRotation, false, globalM.elements);

  // Body base (affected by poke animation)
  let bodyBase = new Matrix4();
  bodyBase.rotate(g_pokeBodyTilt, 1, 0, 0);
  bodyBase.translate(0, g_pokeBodyLift, 0);

  // Body
  let bodyM = new Matrix4(bodyBase);
  bodyM.scale(0.55, 0.38, 0.95);
  drawCube(bodyM, COLOR_BODY);

  // Hump (pyramid - non-cube primitive)
  let humpM = new Matrix4(bodyBase);
  humpM.translate(0, 0.295, -0.18);
  humpM.scale(0.28, 0.22, 0.35);
  drawPyramid(humpM, COLOR_HUMP);

  let NECK_H = 0.24;
  let HEAD_H = 0.15;

  // Neck: pivot at base (body top), extends upward
  let neckM = new Matrix4(bodyBase);
  neckM.translate(0, 0.17, 0.40);
  neckM.rotate(-15 + g_neckAngle, 1, 0, 0);
  let neckJoint = new Matrix4(neckM);
  neckM.translate(0, NECK_H / 2, 0);
  neckM.scale(0.13, NECK_H, 0.13);
  drawCube(neckM, COLOR_NECK);

  // Head: pivot at neck top
  let headM = new Matrix4(neckJoint);
  headM.translate(0, NECK_H, 0.08);
  headM.rotate(g_headAngle, 1, 0, 0);
  let headJoint = new Matrix4(headM);
  headM.translate(0, HEAD_H / 2, 0);
  headM.scale(0.20, HEAD_H, 0.28);
  drawCube(headM, COLOR_HEAD);

  // Left ear (pyramid)
  let leftEarM = new Matrix4(headJoint);
  leftEarM.translate(-0.12, HEAD_H / 2 + 0.10, -0.05);
  leftEarM.scale(0.05, 0.08, 0.04);
  drawPyramid(leftEarM, COLOR_EAR);

  // Right ear (pyramid)
  let rightEarM = new Matrix4(headJoint);
  rightEarM.translate(0.12, HEAD_H / 2 + 0.10, -0.05);
  rightEarM.scale(0.05, 0.08, 0.04);
  drawPyramid(rightEarM, COLOR_EAR);

  // Eyes (pushed slightly forward to avoid z-fighting with head)
  let leftEyeM = new Matrix4(headJoint);
  leftEyeM.translate(-0.09, HEAD_H / 2 + 0.02, 0.155);
  leftEyeM.scale(0.03, 0.03, 0.02);
  drawCube(leftEyeM, COLOR_EYE);

  let rightEyeM = new Matrix4(headJoint);
  rightEyeM.translate(0.09, HEAD_H / 2 + 0.02, 0.155);
  rightEyeM.scale(0.03, 0.03, 0.02);
  drawCube(rightEyeM, COLOR_EYE);

  // Nose (pushed slightly forward to avoid z-fighting with head)
  let noseM = new Matrix4(headJoint);
  noseM.translate(0, HEAD_H / 2 - 0.04, 0.165);
  noseM.scale(0.10, 0.06, 0.04);
  drawCube(noseM, COLOR_NOSE);

  // Tail: pivot at base (body back), extends backward/down
  let tailM = new Matrix4(bodyBase);
  tailM.translate(0, 0.12, -0.48);
  tailM.rotate(25, 1, 0, 0);
  tailM.rotate(g_tailAngle, 0, 0, 1);
  let tailJoint = new Matrix4(tailM);
  tailM.translate(0, -0.09, 0);
  tailM.scale(0.06, 0.18, 0.06);
  drawCube(tailM, COLOR_TAIL);

  // Legs (flush with body edges)
  drawLeg(bodyBase, -0.22,  0.40, g_lfThighAngle, g_lfCalfAngle, g_lfFootAngle);
  drawLeg(bodyBase,  0.22,  0.40, g_rfThighAngle, g_rfCalfAngle, g_rfFootAngle);
  drawLeg(bodyBase, -0.22, -0.38, g_lbThighAngle, g_lbCalfAngle, g_lbFootAngle);
  drawLeg(bodyBase,  0.22, -0.38, g_rbThighAngle, g_rbCalfAngle, g_rbFootAngle);
}

function updateAnimationAngles() {
  if (g_pokeAnimation) {
    let elapsed = g_time - g_pokeStartTime;
    if (elapsed > 1500) {
      g_pokeAnimation = false;
      g_pokeBodyTilt = 0;
      g_pokeBodyLift = 0;
    } else {
      let t = elapsed / 1500;
      let wave = Math.sin(t * Math.PI);
      g_pokeBodyTilt = -35 * wave;
      g_pokeBodyLift = 0.15 * wave;
      g_lfThighAngle = -50 * wave;
      g_rfThighAngle = -50 * wave;
      g_lbThighAngle = 30 * wave;
      g_rbThighAngle = 30 * wave;
      g_lfCalfAngle = 40 * wave;
      g_rfCalfAngle = 40 * wave;
      g_lbCalfAngle = -20 * wave;
      g_rbCalfAngle = -20 * wave;
      g_tailAngle = 40 * wave;
      return;
    }
  }

  if (!g_animationOn) return;

  let speed = 0.005;
  let t = g_time * speed;

  g_pokeBodyTilt = 0;
  g_pokeBodyLift = 0;

  // Walking gait: diagonal pairs move together
  g_lfThighAngle = 20 * Math.sin(t);
  g_lfCalfAngle = 10 * Math.sin(t - Math.PI / 4);
  g_lfFootAngle = 5 * Math.sin(t - Math.PI / 2);

  g_rbThighAngle = 20 * Math.sin(t);
  g_rbCalfAngle = 10 * Math.sin(t - Math.PI / 4);
  g_rbFootAngle = 5 * Math.sin(t - Math.PI / 2);

  g_rfThighAngle = 20 * Math.sin(t + Math.PI);
  g_rfCalfAngle = 10 * Math.sin(t + Math.PI - Math.PI / 4);
  g_rfFootAngle = 5 * Math.sin(t + Math.PI - Math.PI / 2);

  g_lbThighAngle = 20 * Math.sin(t + Math.PI);
  g_lbCalfAngle = 10 * Math.sin(t + Math.PI - Math.PI / 4);
  g_lbFootAngle = 5 * Math.sin(t + Math.PI - Math.PI / 2);

  g_neckAngle = 5 * Math.sin(t * 0.5);
  g_headAngle = 3 * Math.sin(t * 0.5 + 1.0);
  g_tailAngle = 15 * Math.sin(t * 2.0);
}

function tick() {
  g_time = performance.now() - g_startTime;
  g_frames++;

  if (g_time - g_lastFPSTime >= 1000) {
    g_fps = g_frames;
    g_frames = 0;
    g_lastFPSTime = g_time;
    let perfElem = document.getElementById('performance');
    if (perfElem) {
      perfElem.textContent = 'FPS: ' + g_fps;
    }
  }

  updateAnimationAngles();
  renderScene();
  requestAnimationFrame(tick);
}
