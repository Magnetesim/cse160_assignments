'use strict';

const VSHADER_SOURCE = `
attribute vec4 a_Position;
attribute vec3 a_Normal;

uniform mat4 u_ModelMatrix;
uniform mat4 u_ViewMatrix;
uniform mat4 u_ProjMatrix;
uniform mat4 u_NormalMatrix;

varying vec3 v_WorldPos;
varying vec3 v_WorldNormal;

void main() {
  vec4 worldPos = u_ModelMatrix * a_Position;
  v_WorldPos = worldPos.xyz;
  v_WorldNormal = normalize((u_NormalMatrix * vec4(a_Normal, 0.0)).xyz);
  gl_Position = u_ProjMatrix * u_ViewMatrix * worldPos;
}
`;

const FSHADER_SOURCE = `
precision mediump float;

uniform vec3 u_CameraPosition;
uniform vec3 u_BaseColor;
uniform vec3 u_PointLightPosition;
uniform vec3 u_LightColor;
uniform vec3 u_SpotDirection;
uniform float u_SpotCutoffCos;
uniform bool u_LightingEnabled;
uniform bool u_PointLightEnabled;
uniform bool u_SpotlightEnabled;
uniform bool u_NormalVisualization;

varying vec3 v_WorldPos;
varying vec3 v_WorldNormal;

vec3 applyLight(vec3 normalDir, vec3 viewDir, vec3 lightDir, vec3 lightColor, float intensity) {
  float ndotl = max(dot(normalDir, lightDir), 0.0);
  vec3 diffuse = u_BaseColor * lightColor * ndotl * intensity;
  vec3 specular = vec3(0.0);

  if (ndotl > 0.0) {
    vec3 reflectionDir = reflect(-lightDir, normalDir);
    float spec = pow(max(dot(reflectionDir, viewDir), 0.0), 48.0);
    specular = lightColor * 0.45 * spec * intensity;
  }

  return diffuse + specular;
}

void main() {
  vec3 normalDir = normalize(v_WorldNormal);

  if (u_NormalVisualization) {
    gl_FragColor = vec4(normalDir * 0.5 + 0.5, 1.0);
    return;
  }

  if (!u_LightingEnabled) {
    gl_FragColor = vec4(u_BaseColor, 1.0);
    return;
  }

  vec3 viewDir = normalize(u_CameraPosition - v_WorldPos);
  vec3 color = u_BaseColor * 0.18;

  vec3 lightVector = u_PointLightPosition - v_WorldPos;
  float lightDistance = max(length(lightVector), 0.0001);
  vec3 lightDir = lightVector / lightDistance;
  float attenuation = 1.0 / (1.0 + 0.03 * lightDistance + 0.015 * lightDistance * lightDistance);

  if (u_PointLightEnabled) {
    color += applyLight(normalDir, viewDir, lightDir, u_LightColor, attenuation);
  }

  if (u_SpotlightEnabled) {
    vec3 lightToFragment = normalize(v_WorldPos - u_PointLightPosition);
    float spotCos = dot(lightToFragment, normalize(u_SpotDirection));
    float spotFactor = smoothstep(u_SpotCutoffCos - 0.04, u_SpotCutoffCos, spotCos);
    color += applyLight(normalDir, viewDir, lightDir, u_LightColor, attenuation * spotFactor);
  }

  gl_FragColor = vec4(min(color, vec3(1.0)), 1.0);
}
`;

const state = {
  gl: null,
  canvas: null,
  attribs: {},
  uniforms: {},
  meshes: {
    cube: null,
    sphere: null,
    head: null,
  },
  headInfo: null,
  ui: {},
  keys: Object.create(null),
  lastTime: 0,
  lightingEnabled: true,
  normalVisualization: false,
  pointLight: {
    radius: 7.5,
    theta: 35,
    phi: 55,
    color: [1.0, 0.92, 0.82],
    enabled: true,
    animateTheta: true,
    animatePhi: false,
    thetaSpeed: 36,
    phiSpeed: 18,
    phiDirection: 1,
  },
  spotlight: {
    theta: 220,
    phi: 70,
    cutoff: 22,
    enabled: true,
  },
  camera: {
    position: [0, 2.4, 11.5],
    yaw: 0,
    pitch: -8,
    moveSpeed: 5.0,
    lookSpeed: 85,
  },
};

window.addEventListener('load', main);

function main() {
  state.canvas = document.getElementById('gl-canvas');
  const gl = getWebGLContext(state.canvas, false);
  if (!gl) {
    setObjStatus('Failed to create WebGL context.');
    return;
  }

  state.gl = gl;

  if (!initShaders(gl, VSHADER_SOURCE, FSHADER_SOURCE)) {
    setObjStatus('Shader compilation failed. Check the console for details.');
    return;
  }

  cacheLocations(gl);
  gl.clearColor(0.06, 0.08, 0.11, 1.0);
  gl.enable(gl.DEPTH_TEST);

  state.meshes.cube = createMesh(gl, createCubeData(1.8));
  state.meshes.sphere = createMesh(gl, createSphereData(1.0, 36, 36));

  setupUI();
  setupKeyboard();
  resizeCanvasToDisplaySize();

  setObjStatus('Loading head.obj…');
  loadHeadModel();

  requestAnimationFrame(render);
}

function cacheLocations(gl) {
  const program = gl.program;

  state.attribs = {
    position: gl.getAttribLocation(program, 'a_Position'),
    normal: gl.getAttribLocation(program, 'a_Normal'),
  };

  state.uniforms = {
    modelMatrix: gl.getUniformLocation(program, 'u_ModelMatrix'),
    viewMatrix: gl.getUniformLocation(program, 'u_ViewMatrix'),
    projMatrix: gl.getUniformLocation(program, 'u_ProjMatrix'),
    normalMatrix: gl.getUniformLocation(program, 'u_NormalMatrix'),
    cameraPosition: gl.getUniformLocation(program, 'u_CameraPosition'),
    baseColor: gl.getUniformLocation(program, 'u_BaseColor'),
    pointLightPosition: gl.getUniformLocation(program, 'u_PointLightPosition'),
    lightColor: gl.getUniformLocation(program, 'u_LightColor'),
    spotDirection: gl.getUniformLocation(program, 'u_SpotDirection'),
    spotCutoffCos: gl.getUniformLocation(program, 'u_SpotCutoffCos'),
    lightingEnabled: gl.getUniformLocation(program, 'u_LightingEnabled'),
    pointLightEnabled: gl.getUniformLocation(program, 'u_PointLightEnabled'),
    spotlightEnabled: gl.getUniformLocation(program, 'u_SpotlightEnabled'),
    normalVisualization: gl.getUniformLocation(program, 'u_NormalVisualization'),
  };
}

function setupUI() {
  state.ui.objStatus = document.getElementById('obj-status');

  state.ui.lightingEnabled = bindCheckbox('lighting-enabled', state.lightingEnabled, function(checked) {
    state.lightingEnabled = checked;
  });

  state.ui.normalVisualization = bindCheckbox('normal-visualization', state.normalVisualization, function(checked) {
    state.normalVisualization = checked;
  });

  state.ui.lightThetaAnimate = bindCheckbox('light-theta-animate', state.pointLight.animateTheta, function(checked) {
    state.pointLight.animateTheta = checked;
  });

  state.ui.lightPhiAnimate = bindCheckbox('light-phi-animate', state.pointLight.animatePhi, function(checked) {
    state.pointLight.animatePhi = checked;
  });

  state.ui.pointLightEnabled = bindCheckbox('point-light-enabled', state.pointLight.enabled, function(checked) {
    state.pointLight.enabled = checked;
  });

  state.ui.spotlightEnabled = bindCheckbox('spotlight-enabled', state.spotlight.enabled, function(checked) {
    state.spotlight.enabled = checked;
  });

  state.ui.lightTheta = bindLinkedPair({
    rangeId: 'light-theta-range',
    numberId: 'light-theta-number',
    min: 0,
    max: 360,
    step: 1,
    initial: state.pointLight.theta,
    digits: 0,
    onUserChange: function(value) {
      state.pointLight.theta = value;
      state.pointLight.animateTheta = false;
      state.ui.lightThetaAnimate.set(false);
    },
  });

  state.ui.lightPhi = bindLinkedPair({
    rangeId: 'light-phi-range',
    numberId: 'light-phi-number',
    min: 0,
    max: 180,
    step: 1,
    initial: state.pointLight.phi,
    digits: 0,
    onUserChange: function(value) {
      state.pointLight.phi = value;
      state.pointLight.animatePhi = false;
      state.ui.lightPhiAnimate.set(false);
    },
  });

  state.ui.lightR = bindLinkedPair({
    rangeId: 'light-r-range',
    numberId: 'light-r-number',
    min: 0,
    max: 1,
    step: 0.01,
    initial: state.pointLight.color[0],
    digits: 2,
    onUserChange: function(value) {
      state.pointLight.color[0] = value;
    },
  });

  state.ui.lightG = bindLinkedPair({
    rangeId: 'light-g-range',
    numberId: 'light-g-number',
    min: 0,
    max: 1,
    step: 0.01,
    initial: state.pointLight.color[1],
    digits: 2,
    onUserChange: function(value) {
      state.pointLight.color[1] = value;
    },
  });

  state.ui.lightB = bindLinkedPair({
    rangeId: 'light-b-range',
    numberId: 'light-b-number',
    min: 0,
    max: 1,
    step: 0.01,
    initial: state.pointLight.color[2],
    digits: 2,
    onUserChange: function(value) {
      state.pointLight.color[2] = value;
    },
  });

  state.ui.spotTheta = bindLinkedPair({
    rangeId: 'spot-theta-range',
    numberId: 'spot-theta-number',
    min: 0,
    max: 360,
    step: 1,
    initial: state.spotlight.theta,
    digits: 0,
    onUserChange: function(value) {
      state.spotlight.theta = value;
    },
  });

  state.ui.spotPhi = bindLinkedPair({
    rangeId: 'spot-phi-range',
    numberId: 'spot-phi-number',
    min: 0,
    max: 180,
    step: 1,
    initial: state.spotlight.phi,
    digits: 0,
    onUserChange: function(value) {
      state.spotlight.phi = value;
    },
  });

  state.ui.spotCutoff = bindLinkedPair({
    rangeId: 'spot-cutoff-range',
    numberId: 'spot-cutoff-number',
    min: 1,
    max: 90,
    step: 1,
    initial: state.spotlight.cutoff,
    digits: 0,
    onUserChange: function(value) {
      state.spotlight.cutoff = value;
    },
  });
}

function bindCheckbox(id, initial, onChange) {
  const element = document.getElementById(id);
  element.checked = initial;
  element.addEventListener('change', function() {
    onChange(element.checked);
  });

  return {
    element: element,
    set: function(value) {
      element.checked = !!value;
      onChange(element.checked);
    },
  };
}

function bindLinkedPair(options) {
  const range = document.getElementById(options.rangeId);
  const number = document.getElementById(options.numberId);
  const digits = options.digits || 0;

  function format(value) {
    return digits > 0 ? Number(value).toFixed(digits) : String(Math.round(value));
  }

  function applyValue(value, fromUser) {
    if (!Number.isFinite(value)) {
      return;
    }

    const clamped = clamp(value, options.min, options.max);
    range.value = String(clamped);
    number.value = format(clamped);

    if (fromUser && options.onUserChange) {
      options.onUserChange(clamped);
    }
  }

  range.min = String(options.min);
  range.max = String(options.max);
  range.step = String(options.step);
  number.min = String(options.min);
  number.max = String(options.max);
  number.step = String(options.step);

  range.addEventListener('input', function() {
    applyValue(parseFloat(range.value), true);
  });

  number.addEventListener('input', function() {
    const parsed = parseFloat(number.value);
    if (Number.isFinite(parsed)) {
      applyValue(parsed, true);
    }
  });

  applyValue(options.initial, false);

  return {
    set: function(value) {
      applyValue(value, false);
    },
  };
}

function setupKeyboard() {
  const trackedKeys = new Set([
    'w', 'a', 's', 'd', 'r', 'f',
    'arrowleft', 'arrowright', 'arrowup', 'arrowdown',
  ]);

  window.addEventListener('keydown', function(event) {
    const key = event.key.toLowerCase();
    if (trackedKeys.has(key)) {
      state.keys[key] = true;
      event.preventDefault();
    }
  });

  window.addEventListener('keyup', function(event) {
    const key = event.key.toLowerCase();
    if (trackedKeys.has(key)) {
      state.keys[key] = false;
      event.preventDefault();
    }
  });

  window.addEventListener('blur', function() {
    state.keys = Object.create(null);
  });

  window.addEventListener('resize', resizeCanvasToDisplaySize);
}

function render(nowMillis) {
  const nowSeconds = nowMillis * 0.001;
  const dt = state.lastTime ? Math.min(nowSeconds - state.lastTime, 0.05) : 0;
  state.lastTime = nowSeconds;

  updateAnimation(dt);
  updateCamera(dt);
  drawScene(nowSeconds);

  requestAnimationFrame(render);
}

function updateAnimation(dt) {
  if (state.pointLight.animateTheta) {
    state.pointLight.theta = wrapAngle(state.pointLight.theta + state.pointLight.thetaSpeed * dt);
    state.ui.lightTheta.set(state.pointLight.theta);
  }

  if (state.pointLight.animatePhi) {
    state.pointLight.phi += state.pointLight.phiDirection * state.pointLight.phiSpeed * dt;
    if (state.pointLight.phi >= 170) {
      state.pointLight.phi = 170;
      state.pointLight.phiDirection = -1;
    }
    if (state.pointLight.phi <= 10) {
      state.pointLight.phi = 10;
      state.pointLight.phiDirection = 1;
    }
    state.ui.lightPhi.set(state.pointLight.phi);
  }
}

function updateCamera(dt) {
  const camera = state.camera;
  const lookStep = camera.lookSpeed * dt;

  if (state.keys.arrowleft) {
    camera.yaw -= lookStep;
  }
  if (state.keys.arrowright) {
    camera.yaw += lookStep;
  }
  if (state.keys.arrowup) {
    camera.pitch = clamp(camera.pitch + lookStep, -89, 89);
  }
  if (state.keys.arrowdown) {
    camera.pitch = clamp(camera.pitch - lookStep, -89, 89);
  }

  const front = getCameraForward(camera);
  let right = normalizeVec3(cross(front, [0, 1, 0]));
  if (lengthVec3(right) < 0.0001) {
    right = [1, 0, 0];
  }

  const moveAmount = camera.moveSpeed * dt;

  if (state.keys.w) {
    camera.position = addVec3(camera.position, scaleVec3(front, moveAmount));
  }
  if (state.keys.s) {
    camera.position = subtractVec3(camera.position, scaleVec3(front, moveAmount));
  }
  if (state.keys.a) {
    camera.position = subtractVec3(camera.position, scaleVec3(right, moveAmount));
  }
  if (state.keys.d) {
    camera.position = addVec3(camera.position, scaleVec3(right, moveAmount));
  }
  if (state.keys.r) {
    camera.position = addVec3(camera.position, [0, moveAmount, 0]);
  }
  if (state.keys.f) {
    camera.position = addVec3(camera.position, [0, -moveAmount, 0]);
  }
}

function drawScene(timeSeconds) {
  const gl = state.gl;
  resizeCanvasToDisplaySize();
  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  const aspect = gl.canvas.width / Math.max(gl.canvas.height, 1);
  const projMatrix = new Matrix4();
  projMatrix.setPerspective(45, aspect, 0.1, 100.0);

  const camera = state.camera;
  const cameraForward = getCameraForward(camera);
  const cameraTarget = addVec3(camera.position, cameraForward);
  const viewMatrix = new Matrix4();
  viewMatrix.setLookAt(
    camera.position[0], camera.position[1], camera.position[2],
    cameraTarget[0], cameraTarget[1], cameraTarget[2],
    0, 1, 0
  );

  const lightPosition = sphericalToCartesian(state.pointLight.theta, state.pointLight.phi, state.pointLight.radius);
  const spotDirection = normalizeVec3(sphericalToCartesian(state.spotlight.theta, state.spotlight.phi, 1.0));

  gl.useProgram(gl.program);
  gl.uniformMatrix4fv(state.uniforms.viewMatrix, false, viewMatrix.elements);
  gl.uniformMatrix4fv(state.uniforms.projMatrix, false, projMatrix.elements);
  gl.uniform3fv(state.uniforms.cameraPosition, new Float32Array(camera.position));
  gl.uniform3fv(state.uniforms.pointLightPosition, new Float32Array(lightPosition));
  gl.uniform3fv(state.uniforms.lightColor, new Float32Array(state.pointLight.color));
  gl.uniform3fv(state.uniforms.spotDirection, new Float32Array(spotDirection));
  gl.uniform1f(state.uniforms.spotCutoffCos, Math.cos(degToRad(state.spotlight.cutoff)));
  gl.uniform1i(state.uniforms.lightingEnabled, state.lightingEnabled ? 1 : 0);
  gl.uniform1i(state.uniforms.pointLightEnabled, state.pointLight.enabled ? 1 : 0);
  gl.uniform1i(state.uniforms.spotlightEnabled, state.spotlight.enabled ? 1 : 0);
  gl.uniform1i(state.uniforms.normalVisualization, state.normalVisualization ? 1 : 0);

  const cubeModel = new Matrix4();
  cubeModel.rotate(timeSeconds * 22, 0, 1, 0);
  cubeModel.rotate(18, 1, 0, 0);
  drawMesh(state.meshes.cube, cubeModel, [0.18, 0.64, 1.0]);

  const sphereModel = new Matrix4();
  sphereModel.translate(-3.0, 0.0, 1.2);
  sphereModel.rotate(timeSeconds * 14, 0, 1, 0);
  drawMesh(state.meshes.sphere, sphereModel, [1.0, 0.48, 0.24]);

  if (state.meshes.head && state.headInfo) {
    const headModel = new Matrix4();
    headModel.translate(3.05, -0.55, 0.0);
    headModel.scale(state.headInfo.scale, state.headInfo.scale, state.headInfo.scale);
    headModel.translate(-state.headInfo.center[0], -state.headInfo.center[1], -state.headInfo.center[2]);
    drawMesh(state.meshes.head, headModel, [0.82, 0.78, 0.74]);
  }

  const markerModel = new Matrix4();
  markerModel.translate(lightPosition[0], lightPosition[1], lightPosition[2]);
  markerModel.scale(0.28, 0.28, 0.28);
  markerModel.rotate(timeSeconds * 45, 0, 1, 0);
  drawMesh(state.meshes.cube, markerModel, state.pointLight.color);
}

function drawMesh(mesh, modelMatrix, color) {
  const gl = state.gl;
  const normalMatrix = new Matrix4();
  normalMatrix.setInverseOf(modelMatrix);
  normalMatrix.transpose();

  gl.uniformMatrix4fv(state.uniforms.modelMatrix, false, modelMatrix.elements);
  gl.uniformMatrix4fv(state.uniforms.normalMatrix, false, normalMatrix.elements);
  gl.uniform3fv(state.uniforms.baseColor, new Float32Array(color));

  bindArrayBuffer(mesh.positionBuffer, state.attribs.position, 3);
  bindArrayBuffer(mesh.normalBuffer, state.attribs.normal, 3);
  gl.drawArrays(gl.TRIANGLES, 0, mesh.vertexCount);
}

function bindArrayBuffer(buffer, attributeLocation, size) {
  const gl = state.gl;
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.vertexAttribPointer(attributeLocation, size, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(attributeLocation);
}

function createMesh(gl, data) {
  return {
    positionBuffer: createFloatBuffer(gl, data.positions),
    normalBuffer: createFloatBuffer(gl, data.normals),
    vertexCount: data.positions.length / 3,
  };
}

function createFloatBuffer(gl, data) {
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
  return buffer;
}

async function loadHeadModel() {
  try {
    const response = await fetch('head.obj');
    if (!response.ok) {
      throw new Error('HTTP ' + response.status + ' while loading head.obj');
    }

    const text = await response.text();
    const parsed = parseOBJ(text);
    state.meshes.head = createMesh(state.gl, parsed);

    const size = parsed.bounds.size;
    const maxDimension = Math.max(size[0], size[1], size[2]);
    state.headInfo = {
      center: parsed.bounds.center,
      scale: 2.8 / Math.max(maxDimension, 0.0001),
    };

    setObjStatus('Loaded head.obj (' + formatInteger(state.meshes.head.vertexCount) + ' vertices after triangulation).');
  } catch (error) {
    console.error(error);
    setObjStatus('Failed to load head.obj. Use a web server (not file://).');
  }
}

function parseOBJ(text) {
  const sourcePositions = [null];
  const sourceNormals = [null];
  const finalPositions = [];
  const finalNormals = [];
  const boundsMin = [Infinity, Infinity, Infinity];
  const boundsMax = [-Infinity, -Infinity, -Infinity];

  const lines = text.split(/\r?\n/);

  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i].trim();
    if (!rawLine || rawLine.charAt(0) === '#') {
      continue;
    }

    const parts = rawLine.split(/\s+/);
    const keyword = parts[0];

    if (keyword === 'v') {
      const vertex = [parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3])];
      sourcePositions.push(vertex);
      updateBounds(boundsMin, boundsMax, vertex);
    } else if (keyword === 'vn') {
      sourceNormals.push([parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3])]);
    } else if (keyword === 'f') {
      const faceVertices = [];
      for (let j = 1; j < parts.length; j += 1) {
        faceVertices.push(parseOBJVertex(parts[j], sourcePositions.length, sourceNormals.length));
      }

      for (let j = 1; j < faceVertices.length - 1; j += 1) {
        const tri = [faceVertices[0], faceVertices[j], faceVertices[j + 1]];
        appendTriangle(tri, sourcePositions, sourceNormals, finalPositions, finalNormals);
      }
    }
  }

  return {
    positions: finalPositions,
    normals: finalNormals,
    bounds: {
      min: boundsMin,
      max: boundsMax,
      center: [
        (boundsMin[0] + boundsMax[0]) * 0.5,
        (boundsMin[1] + boundsMax[1]) * 0.5,
        (boundsMin[2] + boundsMax[2]) * 0.5,
      ],
      size: [
        boundsMax[0] - boundsMin[0],
        boundsMax[1] - boundsMin[1],
        boundsMax[2] - boundsMin[2],
      ],
    },
  };
}

function parseOBJVertex(token, positionCount, normalCount) {
  const indices = token.split('/');
  return {
    positionIndex: resolveOBJIndex(indices[0], positionCount),
    normalIndex: indices.length > 2 && indices[2] ? resolveOBJIndex(indices[2], normalCount) : 0,
  };
}

function resolveOBJIndex(indexText, count) {
  const index = parseInt(indexText, 10);
  if (!Number.isFinite(index)) {
    return 0;
  }
  return index >= 0 ? index : count + index;
}

function appendTriangle(triangle, sourcePositions, sourceNormals, finalPositions, finalNormals) {
  const p0 = sourcePositions[triangle[0].positionIndex];
  const p1 = sourcePositions[triangle[1].positionIndex];
  const p2 = sourcePositions[triangle[2].positionIndex];

  let computedNormal = null;
  const needsComputedNormal = !triangle[0].normalIndex || !triangle[1].normalIndex || !triangle[2].normalIndex;
  if (needsComputedNormal) {
    computedNormal = normalizeVec3(cross(subtractVec3(p1, p0), subtractVec3(p2, p0)));
  }

  for (let i = 0; i < 3; i += 1) {
    const vertex = triangle[i];
    const position = sourcePositions[vertex.positionIndex];
    const normal = vertex.normalIndex ? sourceNormals[vertex.normalIndex] : computedNormal;

    finalPositions.push(position[0], position[1], position[2]);
    finalNormals.push(normal[0], normal[1], normal[2]);
  }
}

function createCubeData(size) {
  const s = size * 0.5;
  const positions = [
    -s, -s,  s,   s, -s,  s,   s,  s,  s,
    -s, -s,  s,   s,  s,  s,  -s,  s,  s,

     s, -s, -s,  -s, -s, -s,  -s,  s, -s,
     s, -s, -s,  -s,  s, -s,   s,  s, -s,

    -s, -s, -s,  -s, -s,  s,  -s,  s,  s,
    -s, -s, -s,  -s,  s,  s,  -s,  s, -s,

     s, -s,  s,   s, -s, -s,   s,  s, -s,
     s, -s,  s,   s,  s, -s,   s,  s,  s,

    -s,  s,  s,   s,  s,  s,   s,  s, -s,
    -s,  s,  s,   s,  s, -s,  -s,  s, -s,

    -s, -s, -s,   s, -s, -s,   s, -s,  s,
    -s, -s, -s,   s, -s,  s,  -s, -s,  s,
  ];

  const normals = [];
  const faceNormals = [
    [0, 0, 1],
    [0, 0, -1],
    [-1, 0, 0],
    [1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
  ];

  for (let face = 0; face < faceNormals.length; face += 1) {
    const normal = faceNormals[face];
    for (let i = 0; i < 6; i += 1) {
      normals.push(normal[0], normal[1], normal[2]);
    }
  }

  return { positions: positions, normals: normals };
}

function createSphereData(radius, stacks, slices) {
  const positions = [];
  const normals = [];

  for (let lat = 0; lat < stacks; lat += 1) {
    const phi0 = (lat / stacks) * Math.PI;
    const phi1 = ((lat + 1) / stacks) * Math.PI;

    for (let lon = 0; lon < slices; lon += 1) {
      const theta0 = (lon / slices) * Math.PI * 2;
      const theta1 = ((lon + 1) / slices) * Math.PI * 2;

      const v00 = spherePoint(radius, phi0, theta0);
      const v01 = spherePoint(radius, phi0, theta1);
      const v10 = spherePoint(radius, phi1, theta0);
      const v11 = spherePoint(radius, phi1, theta1);

      pushVertex(positions, normals, v00, radius);
      pushVertex(positions, normals, v10, radius);
      pushVertex(positions, normals, v11, radius);

      pushVertex(positions, normals, v00, radius);
      pushVertex(positions, normals, v11, radius);
      pushVertex(positions, normals, v01, radius);
    }
  }

  return { positions: positions, normals: normals };
}

function spherePoint(radius, phi, theta) {
  return [
    radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  ];
}

function pushVertex(positions, normals, point, radius) {
  positions.push(point[0], point[1], point[2]);
  const normal = radius !== 0 ? [point[0] / radius, point[1] / radius, point[2] / radius] : [0, 1, 0];
  normals.push(normal[0], normal[1], normal[2]);
}

function resizeCanvasToDisplaySize() {
  const canvas = state.canvas;
  if (!canvas) {
    return;
  }

  const dpr = Math.max(window.devicePixelRatio || 1, 1);
  const displayWidth = Math.max(1, Math.floor(canvas.clientWidth * dpr));
  const displayHeight = Math.max(1, Math.floor(canvas.clientHeight * dpr));

  if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
    canvas.width = displayWidth;
    canvas.height = displayHeight;
  }
}

function setObjStatus(message) {
  if (state.ui.objStatus) {
    state.ui.objStatus.textContent = message;
  } else {
    const element = document.getElementById('obj-status');
    if (element) {
      element.textContent = message;
    }
  }
}

function sphericalToCartesian(thetaDeg, phiDeg, radius) {
  const theta = degToRad(thetaDeg);
  const phi = degToRad(phiDeg);
  return [
    radius * Math.sin(phi) * Math.sin(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.cos(theta),
  ];
}

function getCameraForward(camera) {
  const yaw = degToRad(camera.yaw);
  const pitch = degToRad(camera.pitch);
  return normalizeVec3([
    Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch),
    -Math.cos(yaw) * Math.cos(pitch),
  ]);
}

function updateBounds(minimums, maximums, point) {
  minimums[0] = Math.min(minimums[0], point[0]);
  minimums[1] = Math.min(minimums[1], point[1]);
  minimums[2] = Math.min(minimums[2], point[2]);
  maximums[0] = Math.max(maximums[0], point[0]);
  maximums[1] = Math.max(maximums[1], point[1]);
  maximums[2] = Math.max(maximums[2], point[2]);
}

function degToRad(degrees) {
  return degrees * Math.PI / 180;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function wrapAngle(degrees) {
  let value = degrees % 360;
  if (value < 0) {
    value += 360;
  }
  return value;
}

function addVec3(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function subtractVec3(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function scaleVec3(v, scalar) {
  return [v[0] * scalar, v[1] * scalar, v[2] * scalar];
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function lengthVec3(v) {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

function normalizeVec3(v) {
  const length = lengthVec3(v);
  if (length < 0.000001) {
    return [0, 0, 0];
  }
  return [v[0] / length, v[1] / length, v[2] / length];
}

function formatInteger(value) {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
