var VSHADER_SOURCE =
  'attribute vec4 a_Position;\n' +
  'uniform float u_Size;\n' +
  'void main() {\n' +
  '  gl_Position = a_Position;\n' +
  '  gl_PointSize = u_Size;\n' +
  '}\n';

var FSHADER_SOURCE =
  'precision mediump float;\n' +
  'uniform vec4 u_FragColor;\n' +
  'void main() {\n' +
  '  gl_FragColor = u_FragColor;\n' +
  '}\n';

const POINT = 0;
const TRIANGLE = 1;
const CIRCLE = 2;

let canvas;
let gl;
let a_Position;
let u_FragColor;
let u_Size;

let g_selectedColor = [1.0, 0.0, 0.0, 1.0];
let g_selectedSize = 10;
let g_selectedType = POINT;
let g_selectedSegments = 10;
let g_shapesList = [];

function main() {
  setupWebGL();
  connectVariablesToGLSL();
  addActionsForHtmlUI();

  canvas.onmousedown = click;
  canvas.onmousemove = function(ev) {
    if (ev.buttons === 1) {
      click(ev);
    }
  };

  gl.clearColor(0.0, 0.0, 0.0, 1.0);
  renderAllShapes();
}

function setupWebGL() {
  canvas = document.getElementById('webgl');
  gl = canvas.getContext('webgl', { preserveDrawingBuffer: true });
  if (!gl) {
    console.log('Failed to get the rendering context for WebGL');
  }
}

function connectVariablesToGLSL() {
  if (!initShaders(gl, VSHADER_SOURCE, FSHADER_SOURCE)) {
    console.log('Failed to intialize shaders.');
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

  u_Size = gl.getUniformLocation(gl.program, 'u_Size');
  if (!u_Size) {
    console.log('Failed to get the storage location of u_Size');
    return;
  }
}

function addActionsForHtmlUI() {
  document.getElementById('clearButton').onclick = function() {
    g_shapesList = [];
    renderAllShapes();
  };

  document.getElementById('pointButton').onclick = function() {
    g_selectedType = POINT;
  };

  document.getElementById('triangleButton').onclick = function() {
    g_selectedType = TRIANGLE;
  };

  document.getElementById('circleButton').onclick = function() {
    g_selectedType = CIRCLE;
  };

  document.getElementById('redSlide').addEventListener('input', updateSelectedColor);
  document.getElementById('greenSlide').addEventListener('input', updateSelectedColor);
  document.getElementById('blueSlide').addEventListener('input', updateSelectedColor);

  document.getElementById('sizeSlide').addEventListener('input', function() {
    g_selectedSize = Number(this.value);
  });

  document.getElementById('segmentSlide').addEventListener('input', function() {
    g_selectedSegments = Number(this.value);
  });

  document.getElementById('drawPictureButton').onclick = drawPicture;
}

function updateSelectedColor() {
  g_selectedColor = [
    Number(document.getElementById('redSlide').value) / 100,
    Number(document.getElementById('greenSlide').value) / 100,
    Number(document.getElementById('blueSlide').value) / 100,
    1.0
  ];
}

function click(ev) {
  let [x, y] = convertCoordinatesEventToGL(ev);

  let shape;
  if (g_selectedType === POINT) {
    shape = new Point();
  } else if (g_selectedType === TRIANGLE) {
    shape = new Triangle();
  } else {
    shape = new Circle();
    shape.segments = g_selectedSegments;
  }

  shape.position = [x, y];
  shape.color = g_selectedColor.slice();
  shape.size = g_selectedSize;

  g_shapesList.push(shape);
  renderAllShapes();
}

function convertCoordinatesEventToGL(ev) {
  let x = ev.clientX;
  let y = ev.clientY;
  let rect = ev.target.getBoundingClientRect();

  x = ((x - rect.left) - canvas.width / 2) / (canvas.width / 2);
  y = (canvas.height / 2 - (y - rect.top)) / (canvas.height / 2);

  return [x, y];
}

function renderAllShapes() {
  gl.clear(gl.COLOR_BUFFER_BIT);

  for (let i = 0; i < g_shapesList.length; i++) {
    g_shapesList[i].render();
  }
}

class Point {
  constructor() {
    this.type = 'point';
    this.position = [0.0, 0.0];
    this.color = [1.0, 1.0, 1.0, 1.0];
    this.size = 10.0;
  }

  render() {
    let xy = this.position;
    let rgba = this.color;
    let size = this.size;

    gl.disableVertexAttribArray(a_Position);
    gl.vertexAttrib3f(a_Position, xy[0], xy[1], 0.0);
    gl.uniform4f(u_FragColor, rgba[0], rgba[1], rgba[2], rgba[3]);
    gl.uniform1f(u_Size, size);
    gl.drawArrays(gl.POINTS, 0, 1);
  }
}

class Triangle {
  constructor() {
    this.type = 'triangle';
    this.position = [0.0, 0.0];
    this.color = [1.0, 1.0, 1.0, 1.0];
    this.size = 10.0;
  }

  render() {
    let xy = this.position;
    let rgba = this.color;
    let d = this.size / 200.0;

    gl.uniform4f(u_FragColor, rgba[0], rgba[1], rgba[2], rgba[3]);
    gl.uniform1f(u_Size, this.size);
    drawTriangle([
      xy[0], xy[1] + d,
      xy[0] - d, xy[1] - d,
      xy[0] + d, xy[1] - d
    ]);
  }
}

class Circle {
  constructor() {
    this.type = 'circle';
    this.position = [0.0, 0.0];
    this.color = [1.0, 1.0, 1.0, 1.0];
    this.size = 10.0;
    this.segments = 10;
  }

  render() {
    let xy = this.position;
    let rgba = this.color;
    let radius = this.size / 200.0;

    gl.uniform4f(u_FragColor, rgba[0], rgba[1], rgba[2], rgba[3]);
    gl.uniform1f(u_Size, this.size);

    let angleStep = 360 / this.segments;
    for (let angle = 0; angle < 360; angle += angleStep) {
      let angle1 = angle * Math.PI / 180;
      let angle2 = (angle + angleStep) * Math.PI / 180;

      drawTriangle([
        xy[0], xy[1],
        xy[0] + Math.cos(angle1) * radius, xy[1] + Math.sin(angle1) * radius,
        xy[0] + Math.cos(angle2) * radius, xy[1] + Math.sin(angle2) * radius
      ]);
    }
  }
}

function drawTriangle(vertices) {
  let vertexBuffer = gl.createBuffer();
  if (!vertexBuffer) {
    console.log('Failed to create the buffer object');
    return;
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.DYNAMIC_DRAW);
  gl.vertexAttribPointer(a_Position, 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(a_Position);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

function drawPicture() {
  renderAllShapes();

  // Replace the triangles below with your own picture.
  // The assignment wants a picture made from WebGL triangles,
  // typically at least 20 triangles for the final version.
  // making image out of triangles, prob around 20
  let picture = [
    // Example starter triangles. Delete or edit these.
    // basic triangles here
    { color: [0.2, 0.6, 0.9, 1.0], vertices: [-0.8, -0.8, 0.8, -0.8, -0.8, 0.0] },
    { color: [0.2, 0.6, 0.9, 1.0], vertices: [0.8, -0.8, 0.8, 0.0, -0.8, 0.0] },

    // im gonna:
    // sketch on paper first.
    // break the picture into triangles.
    // add one triangle at a time here.
    // use the Draw Picture button often while adjusting coordinates to see changes

    // template:
    // { color: [r, g, b, 1.0], vertices: [x1, y1, x2, y2, x3, y3] },
  ];

  for (let i = 0; i < picture.length; i++) {
    let tri = picture[i];
    gl.uniform4f(u_FragColor, tri.color[0], tri.color[1], tri.color[2], tri.color[3]);
    drawTriangle(tri.vertices);
  }
}
