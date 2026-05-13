const VSHADER_SOURCE = `
attribute vec4 a_Position;
attribute vec2 a_TexCoord;
varying vec2 v_TexCoord;
uniform mat4 u_ModelMatrix;
uniform mat4 u_ViewMatrix;
uniform mat4 u_ProjectionMatrix;

void main() {
  gl_Position = u_ProjectionMatrix * u_ViewMatrix * u_ModelMatrix * a_Position;
  v_TexCoord = a_TexCoord;
}
`;

const FSHADER_SOURCE = `
precision mediump float;
uniform sampler2D u_Sampler;
uniform vec4 u_Color;
uniform float u_texColorWeight;
uniform vec3 u_GlobalTint;
varying vec2 v_TexCoord;

void main() {
  vec4 texColor = texture2D(u_Sampler, v_TexCoord);
  vec4 baseColor = (1.0 - u_texColorWeight) * u_Color + u_texColorWeight * texColor;
  gl_FragColor = vec4(baseColor.rgb * u_GlobalTint, baseColor.a);
}
`;

const WORLD_SIZE = 32;
const MAX_WALL_HEIGHT = 4;
const HALF_WORLD = WORLD_SIZE / 2;
const DAY_SKY_COLOR = [0.52, 0.74, 0.98, 1.0];
const NIGHT_SKY_COLOR = [0.03, 0.05, 0.12, 1.0];
const COLOR_WHITE = [1.0, 1.0, 1.0, 1.0];
const COLOR_STONE_TINT = [0.92, 0.94, 0.98, 1.0];
const COLOR_MOSS_TINT = [0.88, 0.96, 0.88, 1.0];
const COLOR_DIRT_TINT = [0.95, 0.9, 0.84, 1.0];
const COLOR_PLANK_TINT = [0.96, 0.92, 0.82, 1.0];
const COLOR_GOLD_TINT = [1.0, 0.97, 0.85, 1.0];
const TREASURE_CELL = [24, 23];
const DAY_NIGHT_CYCLE_MS = 120000;

const TEXTURE_SOURCES = {
  dirt: 'img/dirt.png',
  grass: 'img/grass_block_top.png',
  stone: 'img/stone_bricks.png',
  moss: 'img/moss_block.png',
  planks: 'img/oak_planks.png',
  gold: 'img/gold_block.png'
};

const FACE_DATA = {
  front: [
    0, 0, 1, 0, 0,
    1, 0, 1, 1, 0,
    0, 1, 1, 0, 1,
    0, 1, 1, 0, 1,
    1, 0, 1, 1, 0,
    1, 1, 1, 1, 1
  ],
  back: [
    1, 0, 0, 0, 0,
    0, 0, 0, 1, 0,
    1, 1, 0, 0, 1,
    1, 1, 0, 0, 1,
    0, 0, 0, 1, 0,
    0, 1, 0, 1, 1
  ],
  top: [
    0, 1, 1, 0, 0,
    1, 1, 1, 1, 0,
    0, 1, 0, 0, 1,
    0, 1, 0, 0, 1,
    1, 1, 1, 1, 0,
    1, 1, 0, 1, 1
  ],
  bottom: [
    0, 0, 0, 0, 0,
    1, 0, 0, 1, 0,
    0, 0, 1, 0, 1,
    0, 0, 1, 0, 1,
    1, 0, 0, 1, 0,
    1, 0, 1, 1, 1
  ],
  right: [
    1, 0, 1, 0, 0,
    1, 0, 0, 1, 0,
    1, 1, 1, 0, 1,
    1, 1, 1, 0, 1,
    1, 0, 0, 1, 0,
    1, 1, 0, 1, 1
  ],
  left: [
    0, 0, 0, 0, 0,
    0, 0, 1, 1, 0,
    0, 1, 0, 0, 1,
    0, 1, 0, 0, 1,
    0, 0, 1, 1, 0,
    0, 1, 1, 1, 1
  ]
};

let canvas;
let gl;

let a_Position;
let a_TexCoord;
let u_ModelMatrix;
let u_ViewMatrix;
let u_ProjectionMatrix;
let u_Sampler;
let u_Color;
let u_texColorWeight;
let u_GlobalTint;

let g_cubeBuffer = null;
let g_cubeVertexCount = 0;
let g_worldBatches = [];
let g_textures = {};
let g_loadedTextureCount = 0;
let g_totalTextureCount = Object.keys(TEXTURE_SOURCES).length;
let g_statusLine;
let g_objectiveLine;
let g_cycleLine;
let g_fpsLine;
let g_cameraLine;
let g_treasureOverlay;
let g_camera;
let g_worldHeightMap = [];
let g_worldTextureMap = [];
let g_lastFrameTime = 0;
let g_fpsFrameCount = 0;
let g_fpsTimeAccumulator = 0;
let g_dragActive = false;
let g_lastMouseX = 0;
let g_lastMouseY = 0;
let g_treasureFound = false;
let g_sceneTimeMs = 0;

function main() {
  canvas = document.getElementById('webgl');
  g_statusLine = document.getElementById('statusLine');
  g_objectiveLine = document.getElementById('objectiveLine');
  g_cycleLine = document.getElementById('cycleLine');
  g_fpsLine = document.getElementById('fpsLine');
  g_cameraLine = document.getElementById('cameraLine');
  g_treasureOverlay = document.getElementById('treasureOverlay');

  setupWebGL();
  if (!gl) {
    return;
  }

  if (!initShaders(gl, VSHADER_SOURCE, FSHADER_SOURCE)) {
    setStatus('Shader setup failed.');
    return;
  }

  connectVariablesToGLSL();
  initCubeBuffer();
  createWorldData();
  buildWorldBuffers();

  g_camera = new Camera();
  resizeCanvas();
  initTextures();
  installEventHandlers();

  gl.clearColor(0.62, 0.81, 1.0, 1.0);
  gl.enable(gl.DEPTH_TEST);
  setStatus('Loading textures...');

  requestAnimationFrame(tick);
}

function setupWebGL() {
  gl = getWebGLContext(canvas, false);
  if (!gl) {
    setStatus('WebGL is unavailable in this browser.');
  }
}

function connectVariablesToGLSL() {
  a_Position = gl.getAttribLocation(gl.program, 'a_Position');
  a_TexCoord = gl.getAttribLocation(gl.program, 'a_TexCoord');
  u_ModelMatrix = gl.getUniformLocation(gl.program, 'u_ModelMatrix');
  u_ViewMatrix = gl.getUniformLocation(gl.program, 'u_ViewMatrix');
  u_ProjectionMatrix = gl.getUniformLocation(gl.program, 'u_ProjectionMatrix');
  u_Sampler = gl.getUniformLocation(gl.program, 'u_Sampler');
  u_Color = gl.getUniformLocation(gl.program, 'u_Color');
  u_texColorWeight = gl.getUniformLocation(gl.program, 'u_texColorWeight');
  u_GlobalTint = gl.getUniformLocation(gl.program, 'u_GlobalTint');
}

function initCubeBuffer() {
  const cubeVertices = new Float32Array([
    ...FACE_DATA.front,
    ...FACE_DATA.back,
    ...FACE_DATA.top,
    ...FACE_DATA.bottom,
    ...FACE_DATA.right,
    ...FACE_DATA.left
  ]);

  g_cubeBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, g_cubeBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, cubeVertices, gl.STATIC_DRAW);
  g_cubeVertexCount = cubeVertices.length / 5;
}

function initTextures() {
  Object.keys(TEXTURE_SOURCES).forEach(function(name) {
    const texture = gl.createTexture();
    g_textures[name] = texture;

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([160, 110, 90, 255])
    );

    const image = new Image();
    image.onload = function() {
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      gl.generateMipmap(gl.TEXTURE_2D);

      g_loadedTextureCount += 1;
      if (g_loadedTextureCount === g_totalTextureCount) {
        setStatus('Textures loaded, explore the world!');
      } else {
        setStatus('Loaded ' + g_loadedTextureCount + ' / ' + g_totalTextureCount + ' textures...');
      }
    };

    image.onerror = function() {
      setStatus('A texture failed to load. Run this from a local web server.');
    };

    image.src = TEXTURE_SOURCES[name];
  });
}

function installEventHandlers() {
  document.addEventListener('keydown', handleKeyDown);
  window.addEventListener('resize', resizeCanvas);

  canvas.addEventListener('mousedown', function(ev) {
    g_dragActive = true;
    g_lastMouseX = ev.clientX;
    g_lastMouseY = ev.clientY;
  });

  window.addEventListener('mouseup', function() {
    g_dragActive = false;
  });

  window.addEventListener('mouseleave', function() {
    g_dragActive = false;
  });

  window.addEventListener('mousemove', function(ev) {
    if (!g_dragActive) {
      return;
    }

    const dx = ev.clientX - g_lastMouseX;
    const dy = ev.clientY - g_lastMouseY;
    g_lastMouseX = ev.clientX;
    g_lastMouseY = ev.clientY;

    g_camera.panBy(dx * 0.18);
    g_camera.tiltBy(-dy * 0.14);
  });
}

function handleKeyDown(ev) {
  const key = ev.key.toLowerCase();
  let handled = true;

  switch (key) {
    case 'w':
      g_camera.moveForward();
      break;
    case 's':
      g_camera.moveBackwards();
      break;
    case 'a':
      g_camera.moveLeft();
      break;
    case 'd':
      g_camera.moveRight();
      break;
    case 'q':
      g_camera.panLeft();
      break;
    case 'e':
      g_camera.panRight();
      break;
    case 'f':
      addBlockInFront();
      break;
    case 'g':
      removeBlockInFront();
      break;
    default:
      handled = false;
  }

  if (handled) {
    ev.preventDefault();
  }
}

function resizeCanvas() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  if (gl) {
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  if (g_camera) {
    g_camera.updateProjectionMatrix();
  }
}

function tick(now) {
  if (!g_lastFrameTime) {
    g_lastFrameTime = now;
  }

  const deltaMs = now - g_lastFrameTime;
  g_lastFrameTime = now;
  g_sceneTimeMs = now;
  updateFps(deltaMs);
  updateTreasureState();
  renderScene();
  requestAnimationFrame(tick);
}

function updateFps(deltaMs) {
  g_fpsFrameCount += 1;
  g_fpsTimeAccumulator += deltaMs;

  if (g_fpsTimeAccumulator >= 1000) {
    const fps = (g_fpsFrameCount * 1000) / g_fpsTimeAccumulator;
    g_fpsLine.textContent = 'FPS: ' + fps.toFixed(1);
    g_fpsFrameCount = 0;
    g_fpsTimeAccumulator = 0;
  }
}

function renderScene() {
  const cycle = getDayNightState();
  gl.clearColor(cycle.skyColor[0], cycle.skyColor[1], cycle.skyColor[2], 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  gl.uniformMatrix4fv(u_ViewMatrix, false, g_camera.viewMatrix.elements);
  gl.uniformMatrix4fv(u_ProjectionMatrix, false, g_camera.projectionMatrix.elements);
  gl.uniform3f(u_GlobalTint, cycle.tint[0], cycle.tint[1], cycle.tint[2]);

  drawSky(cycle.skyColor);
  drawGround();
  drawWorld();
  updateCameraText();
  updateCycleText(cycle);
}

function drawSky(skyColor) {
  gl.depthMask(false);
  const skyMatrix = new Matrix4();
  skyMatrix.translate(-60, -40, -60);
  skyMatrix.scale(120, 120, 120);
  drawCube(skyMatrix, skyColor, 0.0, 'grass');
  gl.depthMask(true);
}

function drawGround() {
  const groundMatrix = new Matrix4();
  groundMatrix.translate(-HALF_WORLD, -0.12, -HALF_WORLD);
  groundMatrix.scale(WORLD_SIZE, 0.14, WORLD_SIZE);
  drawCube(groundMatrix, COLOR_WHITE, 1.0, 'grass');
}

function drawWorld() {
  const identity = new Matrix4();
  for (let i = 0; i < g_worldBatches.length; i += 1) {
    const batch = g_worldBatches[i];
    drawBuffer(batch.buffer, batch.vertexCount, identity, batch.color, 1.0, batch.textureName);
  }
}

function drawCube(matrix, color, texWeight, textureName) {
  drawBuffer(g_cubeBuffer, g_cubeVertexCount, matrix, color, texWeight, textureName);
}

function drawBuffer(buffer, vertexCount, modelMatrix, color, texWeight, textureName) {
  gl.uniformMatrix4fv(u_ModelMatrix, false, modelMatrix.elements);
  gl.uniform4f(u_Color, color[0], color[1], color[2], color[3]);
  gl.uniform1f(u_texColorWeight, texWeight);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, g_textures[textureName]);
  gl.uniform1i(u_Sampler, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  const stride = Float32Array.BYTES_PER_ELEMENT * 5;
  gl.vertexAttribPointer(a_Position, 3, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(a_Position);
  gl.vertexAttribPointer(a_TexCoord, 2, gl.FLOAT, false, stride, Float32Array.BYTES_PER_ELEMENT * 3);
  gl.enableVertexAttribArray(a_TexCoord);
  gl.drawArrays(gl.TRIANGLES, 0, vertexCount);
}

function createWorldData() {
  g_worldHeightMap = [];
  g_worldTextureMap = [];

  for (let x = 0; x < WORLD_SIZE; x += 1) {
    g_worldHeightMap[x] = [];
    g_worldTextureMap[x] = [];
    for (let z = 0; z < WORLD_SIZE; z += 1) {
      g_worldHeightMap[x][z] = 0;
      g_worldTextureMap[x][z] = 'dirt';
    }
  }

  for (let x = 0; x < WORLD_SIZE; x += 1) {
    for (let z = 0; z < WORLD_SIZE; z += 1) {
      if (x === 0 || z === 0 || x === WORLD_SIZE - 1 || z === WORLD_SIZE - 1) {
        setCell(x, z, 3, 'stone');
      }
    }
  }

  for (let x = 3; x < WORLD_SIZE - 3; x += 1) {
    for (let z = 3; z < WORLD_SIZE - 3; z += 1) {
      if (x === 5 || x === 26 || z === 5 || z === 26) {
        if (Math.abs(x - 16) > 2 && Math.abs(z - 16) > 2) {
          setCell(x, z, 2, 'stone');
        }
      }
    }
  }

  for (let x = 9; x <= 22; x += 1) {
    for (let z = 9; z <= 22; z += 1) {
      if (x === 9 || x === 22 || z === 9 || z === 22) {
        if (Math.abs(x - 16) > 1 && Math.abs(z - 16) > 1) {
          setCell(x, z, 1, 'planks');
        }
      }
    }
  }

  const towers = [
    [8, 8],
    [8, 23],
    [23, 8],
    [23, 23],
    [12, 12],
    [12, 19],
    [19, 12],
    [19, 19]
  ];

  for (let i = 0; i < towers.length; i += 1) {
    setCell(towers[i][0], towers[i][1], 4, 'moss');
  }

  for (let x = 2; x < WORLD_SIZE - 2; x += 1) {
    for (let z = 2; z < WORLD_SIZE - 2; z += 1) {
      if (g_worldHeightMap[x][z] !== 0) {
        continue;
      }

      if (Math.abs(x - 16) <= 1 || Math.abs(z - 16) <= 1) {
        continue;
      }

      if ((x + z) % 9 === 0 && (x < 12 || x > 19) && (z < 12 || z > 19)) {
        setCell(x, z, 1 + ((x * 7 + z * 11) % 2), 'dirt');
      }

      if ((x * 5 + z * 3) % 29 === 0 && x > 5 && x < 26 && z > 5 && z < 26) {
        setCell(x, z, 2, 'moss');
      }
    }
  }

  for (let x = 13; x <= 18; x += 1) {
    for (let z = 13; z <= 18; z += 1) {
      setCell(x, z, 0, 'dirt');
    }
  }

  for (let i = 6; i < 26; i += 1) {
    setCell(i, 16, 0, 'dirt');
    setCell(16, i, 0, 'dirt');
  }

  setCell(TREASURE_CELL[0], TREASURE_CELL[1], 1, 'gold');
}

function setCell(x, z, height, textureName) {
  g_worldHeightMap[x][z] = Math.max(0, Math.min(MAX_WALL_HEIGHT, height));
  g_worldTextureMap[x][z] = textureName;
}

function buildWorldBuffers() {
  for (let i = 0; i < g_worldBatches.length; i += 1) {
    gl.deleteBuffer(g_worldBatches[i].buffer);
  }

  const groupedVertices = {
    dirt: [],
    stone: [],
    moss: [],
    planks: [],
    gold: []
  };

  for (let x = 0; x < WORLD_SIZE; x += 1) {
    for (let z = 0; z < WORLD_SIZE; z += 1) {
      const height = g_worldHeightMap[x][z];
      if (!height) {
        continue;
      }

      const textureName = g_worldTextureMap[x][z];
      const worldX = x - HALF_WORLD;
      const worldZ = z - HALF_WORLD;

      for (let y = 0; y < height; y += 1) {
        if (z === WORLD_SIZE - 1 || g_worldHeightMap[x][z + 1] <= y) {
          appendFace(groupedVertices[textureName], FACE_DATA.front, worldX, y, worldZ);
        }

        if (z === 0 || g_worldHeightMap[x][z - 1] <= y) {
          appendFace(groupedVertices[textureName], FACE_DATA.back, worldX, y, worldZ);
        }

        if (x === WORLD_SIZE - 1 || g_worldHeightMap[x + 1][z] <= y) {
          appendFace(groupedVertices[textureName], FACE_DATA.right, worldX, y, worldZ);
        }

        if (x === 0 || g_worldHeightMap[x - 1][z] <= y) {
          appendFace(groupedVertices[textureName], FACE_DATA.left, worldX, y, worldZ);
        }

        if (y === height - 1) {
          appendFace(groupedVertices[textureName], FACE_DATA.top, worldX, y, worldZ);
        }

        if (y === 0) {
          appendFace(groupedVertices[textureName], FACE_DATA.bottom, worldX, y, worldZ);
        }
      }
    }
  }

  g_worldBatches = [];

  addBatch(groupedVertices.dirt, 'dirt', COLOR_DIRT_TINT);
  addBatch(groupedVertices.stone, 'stone', COLOR_STONE_TINT);
  addBatch(groupedVertices.moss, 'moss', COLOR_MOSS_TINT);
  addBatch(groupedVertices.planks, 'planks', COLOR_PLANK_TINT);
  addBatch(groupedVertices.gold, 'gold', COLOR_GOLD_TINT);
}

function addBatch(vertexArray, textureName, color) {
  if (!vertexArray.length) {
    return;
  }

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertexArray), gl.STATIC_DRAW);
  g_worldBatches.push({
    buffer: buffer,
    vertexCount: vertexArray.length / 5,
    textureName: textureName,
    color: color
  });
}

function appendFace(target, face, tx, ty, tz) {
  for (let i = 0; i < face.length; i += 5) {
    target.push(face[i] + tx, face[i + 1] + ty, face[i + 2] + tz, face[i + 3], face[i + 4]);
  }
}

function addBlockInFront() {
  const target = getTargetCell();
  if (!target) {
    setStatus('No editable block is in front of the camera.');
    return;
  }

  const x = target[0];
  const z = target[1];
  if (g_worldHeightMap[x][z] >= MAX_WALL_HEIGHT) {
    setStatus('That column is already at the max height.');
    return;
  }

  g_worldHeightMap[x][z] += 1;
  if (g_worldHeightMap[x][z] === 1) {
    g_worldTextureMap[x][z] = chooseTextureForCell(x, z);
  }
  buildWorldBuffers();
  setStatus('Added a block at (' + x + ', ' + z + ').');
}

function removeBlockInFront() {
  const target = getTargetCell();
  if (!target) {
    setStatus('No editable block is in front of the camera.');
    return;
  }

  const x = target[0];
  const z = target[1];
  if (g_worldHeightMap[x][z] <= 0) {
    setStatus('There is no block there to remove.');
    return;
  }

  g_worldHeightMap[x][z] -= 1;
  buildWorldBuffers();
  setStatus('Removed a block at (' + x + ', ' + z + ').');
}

function getTargetCell() {
  const forward = g_camera.getForwardVector();
  const sample = vec3Add(g_camera.eye, vec3Scale(forward, 2.0));

  const cellX = Math.floor(sample.elements[0] + HALF_WORLD);
  const cellZ = Math.floor(sample.elements[2] + HALF_WORLD);
  if (cellX < 0 || cellX >= WORLD_SIZE || cellZ < 0 || cellZ >= WORLD_SIZE) {
    return null;
  }

  return [cellX, cellZ];
}

function chooseTextureForCell(x, z) {
  if (x === TREASURE_CELL[0] && z === TREASURE_CELL[1]) {
    return 'gold';
  }
  if (x < 3 || z < 3 || x > 28 || z > 28) {
    return 'stone';
  }
  if ((x + z) % 5 === 0) {
    return 'moss';
  }
  if (Math.abs(x - 16) < 4 && Math.abs(z - 16) < 4) {
    return 'planks';
  }
  return 'dirt';
}

function updateCameraText() {
  const eye = g_camera.eye.elements;
  g_cameraLine.textContent =
    'Camera: x=' + eye[0].toFixed(1) + ' y=' + eye[1].toFixed(1) + ' z=' + eye[2].toFixed(1);
}

function updateTreasureState() {
  if (g_treasureFound) {
    return;
  }

  const treasureWorldX = TREASURE_CELL[0] - HALF_WORLD + 0.5;
  const treasureWorldY = 0.5;
  const treasureWorldZ = TREASURE_CELL[1] - HALF_WORLD + 0.5;
  const eye = g_camera.eye.elements;
  const dx = eye[0] - treasureWorldX;
  const dy = eye[1] - treasureWorldY;
  const dz = eye[2] - treasureWorldZ;
  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

  if (distance < 2.2) {
    g_treasureFound = true;
    setStatus('You found the hidden gold block!');
    setObjective('Objective complete: treasure recovered!');
    if (g_treasureOverlay) {
      g_treasureOverlay.classList.add('visible');
      g_treasureOverlay.setAttribute('aria-hidden', 'false');
    }
  }
}

function getDayNightState() {
  const cycleTime = g_sceneTimeMs % DAY_NIGHT_CYCLE_MS;
  const normalized = cycleTime / DAY_NIGHT_CYCLE_MS;
  const daylight = 0.5 + 0.5 * Math.cos(normalized * Math.PI * 2.0);
  const tintStrength = 0.25 + 0.75 * daylight;
  const tint = [
    lerp(0.36, 1.0, tintStrength),
    lerp(0.42, 1.0, tintStrength),
    lerp(0.6, 1.0, tintStrength)
  ];

  return {
    daylight: daylight,
    skyColor: [
      lerp(NIGHT_SKY_COLOR[0], DAY_SKY_COLOR[0], daylight),
      lerp(NIGHT_SKY_COLOR[1], DAY_SKY_COLOR[1], daylight),
      lerp(NIGHT_SKY_COLOR[2], DAY_SKY_COLOR[2], daylight),
      1.0
    ],
    tint: tint,
    cycleTime: cycleTime
  };
}

function updateCycleText(cycle) {
  if (!g_cycleLine) {
    return;
  }

  const phaseName = cycle.cycleTime < DAY_NIGHT_CYCLE_MS / 2 ? 'Day to Night' : 'Night to Day';
  const seconds = Math.ceil(((DAY_NIGHT_CYCLE_MS / 2) - (cycle.cycleTime % (DAY_NIGHT_CYCLE_MS / 2))) / 1000);
  g_cycleLine.textContent =
    'Cycle: ' + phaseName + ' (' + seconds + 's to next shift, light ' + Math.round(cycle.daylight * 100) + '%)';
}

function setStatus(message) {
  if (g_statusLine) {
    g_statusLine.textContent = message;
  }
}

function setObjective(message) {
  if (g_objectiveLine) {
    g_objectiveLine.textContent = message;
  }
}

function Camera() {
  this.fov = 60;
  this.eye = new Vector3([0, 1.8, 12]);
  this.at = new Vector3([0, 1.8, 11]);
  this.up = new Vector3([0, 1, 0]);
  this.speed = 0.35;
  this.alpha = 4;
  this.pitch = 0;
  this.yaw = -90;
  this.viewMatrix = new Matrix4();
  this.projectionMatrix = new Matrix4();
  this.updateYawPitchFromLook();
  this.updateViewMatrix();
  this.updateProjectionMatrix();
}

Camera.prototype.updateProjectionMatrix = function() {
  this.projectionMatrix.setPerspective(this.fov, canvas.width / canvas.height, 0.1, 220);
};

Camera.prototype.updateViewMatrix = function() {
  this.viewMatrix.setLookAt(
    this.eye.elements[0], this.eye.elements[1], this.eye.elements[2],
    this.at.elements[0], this.at.elements[1], this.at.elements[2],
    this.up.elements[0], this.up.elements[1], this.up.elements[2]
  );
};

Camera.prototype.updateYawPitchFromLook = function() {
  const forward = vec3Sub(this.at, this.eye).normalize();
  this.yaw = Math.atan2(forward.elements[2], forward.elements[0]) * 180 / Math.PI;
  this.pitch = Math.asin(clamp(forward.elements[1], -1, 1)) * 180 / Math.PI;
};

Camera.prototype.updateLookDirection = function() {
  const yawRad = this.yaw * Math.PI / 180;
  const pitchRad = this.pitch * Math.PI / 180;
  const cosPitch = Math.cos(pitchRad);

  const direction = new Vector3([
    Math.cos(yawRad) * cosPitch,
    Math.sin(pitchRad),
    Math.sin(yawRad) * cosPitch
  ]);

  this.at = vec3Add(this.eye, direction);
  this.updateViewMatrix();
};

Camera.prototype.getForwardVector = function() {
  const forward = vec3Sub(this.at, this.eye);
  forward.normalize();
  return forward;
};

Camera.prototype.moveForward = function() {
  const delta = vec3Scale(this.getForwardVector(), this.speed);
  this.eye = vec3Add(this.eye, delta);
  this.at = vec3Add(this.at, delta);
  this.constrain();
};

Camera.prototype.moveBackwards = function() {
  const delta = vec3Scale(this.getForwardVector(), this.speed);
  this.eye = vec3Sub(this.eye, delta);
  this.at = vec3Sub(this.at, delta);
  this.constrain();
};

Camera.prototype.moveLeft = function() {
  const side = vec3Scale(vec3Cross(this.up, this.getForwardVector()).normalize(), this.speed);
  this.eye = vec3Add(this.eye, side);
  this.at = vec3Add(this.at, side);
  this.constrain();
};

Camera.prototype.moveRight = function() {
  const side = vec3Scale(vec3Cross(this.getForwardVector(), this.up).normalize(), this.speed);
  this.eye = vec3Add(this.eye, side);
  this.at = vec3Add(this.at, side);
  this.constrain();
};

Camera.prototype.panLeft = function() {
  this.panBy(this.alpha);
};

Camera.prototype.panRight = function() {
  this.panBy(-this.alpha);
};

Camera.prototype.panBy = function(angle) {
  this.yaw += angle;
  this.updateLookDirection();
};

Camera.prototype.tiltBy = function(angle) {
  this.pitch = clamp(this.pitch + angle, -80, 80);
  this.updateLookDirection();
};

Camera.prototype.constrain = function() {
  this.eye.elements[0] = clamp(this.eye.elements[0], -HALF_WORLD + 1.2, HALF_WORLD - 1.2);
  this.eye.elements[2] = clamp(this.eye.elements[2], -HALF_WORLD + 1.2, HALF_WORLD - 1.2);
  this.at.elements[0] = clamp(this.at.elements[0], -HALF_WORLD - 8, HALF_WORLD + 8);
  this.at.elements[2] = clamp(this.at.elements[2], -HALF_WORLD - 8, HALF_WORLD + 8);
  this.eye.elements[1] = 1.8;
  this.updateLookDirection();
};

function vec3Add(a, b) {
  return new Vector3([
    a.elements[0] + b.elements[0],
    a.elements[1] + b.elements[1],
    a.elements[2] + b.elements[2]
  ]);
}

function vec3Sub(a, b) {
  return new Vector3([
    a.elements[0] - b.elements[0],
    a.elements[1] - b.elements[1],
    a.elements[2] - b.elements[2]
  ]);
}

function vec3Scale(v, scalar) {
  return new Vector3([
    v.elements[0] * scalar,
    v.elements[1] * scalar,
    v.elements[2] * scalar
  ]);
}

function vec3Cross(a, b) {
  return new Vector3([
    a.elements[1] * b.elements[2] - a.elements[2] * b.elements[1],
    a.elements[2] * b.elements[0] - a.elements[0] * b.elements[2],
    a.elements[0] * b.elements[1] - a.elements[1] * b.elements[0]
  ]);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
