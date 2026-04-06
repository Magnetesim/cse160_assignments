// Retrieve <canvas> element
var canvas = document.getElementById('example');  
// Get the rendering context for 2DCG
var ctx = canvas.getContext('2d');

// DrawTriangle.js (c) 2012 matsuda
function main() {  
  clearCanvas(ctx, "black"); // clearing background

  v1 = new Vector3([2.25, 2.25, 0]);

  drawVector(ctx, v1, "red")
}

function clearCanvas(canvasCtx, color) {
  canvasCtx.fillStyle = color;
  canvasCtx.fillRect(0, 0, 400, 400);
}


function drawVector(ctx, v, color) {
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.moveTo(200, 200);
  ctx.lineTo(200 + v.elements[0] * 20, 200 - v.elements[1] * 20);
  ctx.stroke();
}

function handleDrawEvent() {
  // need to clear first
  clearCanvas(ctx, "black");


  var x_v1 = parseFloat(document.getElementById('xCoord_v1').value);
  var y_v1 = parseFloat(document.getElementById('yCoord_v1').value);

  v1 = new Vector3([x_v1, y_v1, 0]);
  drawVector(ctx, v1, "red");

  var x_v2 = parseFloat(document.getElementById('xCoord_v2').value);
  var y_v2 = parseFloat(document.getElementById('yCoord_v2').value);

  v2 = new Vector3([x_v2, y_v2, 0]);
  drawVector(ctx, v2, "blue");
}

function handleDrawOperationEvent() {
    // need to clear first
  clearCanvas(ctx, "black");


  var x_v1 = parseFloat(document.getElementById('xCoord_v1').value);
  var y_v1 = parseFloat(document.getElementById('yCoord_v1').value);

  v1 = new Vector3([x_v1, y_v1, 0]);
  drawVector(ctx, v1, "red");

  var x_v2 = parseFloat(document.getElementById('xCoord_v2').value);
  var y_v2 = parseFloat(document.getElementById('yCoord_v2').value);

  v2 = new Vector3([x_v2, y_v2, 0]);
  drawVector(ctx, v2, "blue");
  // copying code instead of calling function
  // so that i have v1 and v2 to play with

  operation = document.getElementById('operation').value;
  
  switch (operation) {
    case 'add':
      v1.add(v2);
      drawVector(ctx, v1, "green");
      break;
    case 'sub':
      v1.sub(v2);
      drawVector(ctx, v1, "green");
      break;
    case 'div':
      var scalar = parseFloat(document.getElementById('scalar').value);
      v1.div(scalar);
      v2.div(scalar);
      drawVector(ctx, v1, "green");
      drawVector(ctx, v2, "green");
      break;
    case 'mul':
      var scalar = parseFloat(document.getElementById('scalar').value);
      v1.mul(scalar);
      v2.mul(scalar);
      drawVector(ctx, v1, "green");
      drawVector(ctx, v2, "green");
      break;
    case 'mag':
      console.log("Magnitude v1:", v1.magnitude())
      console.log("Magnitude v2:", v2.magnitude())
      break;
    case 'norm':
      v1.normalize();
      v2.normalize();
      drawVector(ctx, v1, "green");
      drawVector(ctx, v2, "green");
      break;
    case 'angle':
      console.log("Angle: ", angleBetween(v1, v2));
      break;
    case 'area':
      console.log("Area of the triangle", areaTriangle(v1, v2));
      break;
    default:
      console.log("Broken..");
  }
}

function angleBetween(v1, v2) {
  var v1_magnitude = v1.magnitude();
  var v2_magnitude = v2.magnitude();

  var magnitude_product = v1_magnitude * v2_magnitude;

  var scaled_angle = Vector3.dot(v1, v2);

  var angle = Math.acos(scaled_angle / magnitude_product);

  return angle * (180 / Math.PI);
}


function areaTriangle(v1, v2) {
  var v3 = Vector3.cross(v1, v2);

  return v3.magnitude() / 2;
}
