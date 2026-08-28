import * as THREE from "three";

const INK = "#3e294f";
const CREAM = "#fffaf2";
const CORAL = "#ff6f77";
const CORAL_DARK = "#dc4f64";
const LEMON = "#ffd84d";
const SKIN = "#e3a27d";
const SKIN_SHADOW = "#bd745c";
const HAIR = "#2b171b";
const BEARD = "#382024";
const GLASSES = "#8b633d";

function textureFromDrawing(draw, size = 192) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, size, size);
  context.lineJoin = "round";
  context.lineCap = "round";
  draw(context, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function ellipse(context, x, y, rx, ry, fill, stroke = null, lineWidth = 0) {
  context.beginPath();
  context.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  context.fillStyle = fill;
  context.fill();
  if (stroke && lineWidth) {
    context.strokeStyle = stroke;
    context.lineWidth = lineWidth;
    context.stroke();
  }
}

function roundedPath(context, x, y, width, height, radius) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

function drawSpark(context, x, y, size, color) {
  context.save();
  context.translate(x, y);
  context.beginPath();
  for (let index = 0; index < 8; index += 1) {
    const angle = (index / 8) * Math.PI * 2 - Math.PI / 2;
    const radius = index % 2 === 0 ? size : size * 0.28;
    const px = Math.cos(angle) * radius;
    const py = Math.sin(angle) * radius;
    if (index === 0) context.moveTo(px, py);
    else context.lineTo(px, py);
  }
  context.closePath();
  context.fillStyle = color;
  context.fill();
  context.restore();
}

function drawGioFace(context, bob, squish, pose) {
  const centerY = 98 + bob;
  const faceHeight = 41 - squish * 2;

  ellipse(context, 96, centerY, 49, faceHeight, SKIN);
  context.save();
  context.beginPath();
  context.ellipse(96, centerY, 49, faceHeight, 0, 0, Math.PI * 2);
  context.clip();
  context.fillStyle = HAIR;
  context.beginPath();
  context.moveTo(45, 82 + bob);
  context.bezierCurveTo(49, 62 + bob, 66, 53 + bob, 88, 55 + bob);
  context.bezierCurveTo(106, 49 + bob, 132, 60 + bob, 146, 80 + bob);
  context.lineTo(133, 85 + bob);
  context.bezierCurveTo(121, 73 + bob, 110, 74 + bob, 103, 69 + bob);
  context.bezierCurveTo(92, 78 + bob, 80, 71 + bob, 68, 81 + bob);
  context.closePath();
  context.fill();
  context.restore();

  context.strokeStyle = BEARD;
  context.lineWidth = 8;
  context.beginPath();
  context.moveTo(59, 109 + bob);
  context.bezierCurveTo(63, 125 + bob, 77, 137 + bob, 96, 138 + bob);
  context.bezierCurveTo(115, 137 + bob, 129, 125 + bob, 133, 109 + bob);
  context.stroke();
  ellipse(context, 96, 122 + bob, 11, 10, BEARD);

  context.strokeStyle = HAIR;
  context.lineWidth = 5;
  context.beginPath();
  context.moveTo(65, 82 + bob);
  context.quadraticCurveTo(76, 76 + bob, 87, 82 + bob);
  context.moveTo(105, 82 + bob);
  context.quadraticCurveTo(116, 76 + bob, 127, 82 + bob);
  context.stroke();

  const lenses = [
    { x: 57, y: 84 + bob, width: 36, height: 23 },
    { x: 99, y: 84 + bob, width: 36, height: 23 },
  ];
  lenses.forEach((lens) => {
    context.fillStyle = "rgba(255, 244, 212, 0.2)";
    context.strokeStyle = GLASSES;
    context.lineWidth = 5;
    roundedPath(context, lens.x, lens.y, lens.width, lens.height, 7);
    context.fill();
    context.stroke();
  });
  context.strokeStyle = GLASSES;
  context.lineWidth = 5;
  context.beginPath();
  context.moveTo(92, 95 + bob);
  context.quadraticCurveTo(96, 91 + bob, 100, 95 + bob);
  context.moveTo(57, 91 + bob);
  context.lineTo(48, 87 + bob);
  context.moveTo(135, 91 + bob);
  context.lineTo(144, 87 + bob);
  context.stroke();

  if (pose.hurt) {
    context.strokeStyle = INK;
    context.lineWidth = 5;
    for (const x of [76, 117]) {
      context.beginPath();
      context.moveTo(x - 5, 91 + bob);
      context.lineTo(x + 5, 100 + bob);
      context.moveTo(x + 5, 91 + bob);
      context.lineTo(x - 5, 100 + bob);
      context.stroke();
    }
    context.beginPath();
    context.arc(96, 115 + bob, 7, Math.PI, Math.PI * 2);
    context.stroke();
  } else {
    ellipse(context, 76, 96 + bob, 4.5, pose.blink ? 1.5 : 6.5, INK);
    ellipse(context, 117, 96 + bob, 4.5, pose.blink ? 1.5 : 6.5, INK);
    ellipse(context, 61, 110 + bob, 6, 3, "#ef8d86");
    ellipse(context, 131, 110 + bob, 6, 3, "#ef8d86");

    context.strokeStyle = SKIN_SHADOW;
    context.lineWidth = 3;
    context.beginPath();
    context.arc(96, 101 + bob, 4, 0.1 * Math.PI, 0.8 * Math.PI);
    context.stroke();

    context.fillStyle = CREAM;
    context.strokeStyle = BEARD;
    context.lineWidth = 3;
    roundedPath(context, 78, 107 + bob, 36, 14, 7);
    context.fill();
    context.stroke();
    context.strokeStyle = BEARD;
    context.lineWidth = 4;
    context.beginPath();
    context.moveTo(96, 108 + bob);
    context.quadraticCurveTo(86, 102 + bob, 76, 108 + bob);
    context.moveTo(96, 108 + bob);
    context.quadraticCurveTo(106, 102 + bob, 116, 108 + bob);
    context.stroke();
  }

  context.strokeStyle = INK;
  context.lineWidth = 7;
  context.beginPath();
  context.ellipse(96, centerY, 49, faceHeight, 0, 0, Math.PI * 2);
  context.stroke();
}

function drawGio(context, size, pose) {
  const bob = pose.bob ?? 0;
  const squish = pose.squish ?? 0;
  const bodyTop = 56 + bob + squish * 5;
  const bodyHeight = 96 - squish * 8;
  const footLift = pose.footLift ?? 0;

  context.save();

  context.strokeStyle = INK;
  context.lineWidth = 8;
  context.fillStyle = CORAL;
  roundedPath(context, 45, 28 + bob, 35, 65, 18);
  context.fill();
  context.stroke();
  roundedPath(context, 112, 24 + bob, 35, 69, 18);
  context.fill();
  context.stroke();
  ellipse(context, 62, 52 + bob, 7, 17, "#ffadb0");
  ellipse(context, 129, 48 + bob, 7, 18, "#ffadb0");

  context.fillStyle = CORAL;
  context.strokeStyle = INK;
  context.lineWidth = 9;
  roundedPath(context, 28, bodyTop, 136, bodyHeight, 58);
  context.fill();
  context.stroke();

  drawGioFace(context, bob, squish, pose);

  drawSpark(context, 96, 145 + bob - squish * 2, 10, LEMON);
  context.strokeStyle = CORAL_DARK;
  context.lineWidth = 3;
  context.stroke();

  ellipse(context, 64, 162 + bob - footLift, 24, 13, CREAM, INK, 7);
  ellipse(context, 128, 162 + bob - (pose.otherFootLift ?? 0), 24, 13, CREAM, INK, 7);
  context.restore();
}

export function createPlayerTextures() {
  const poses = {
    idle: { bob: 0 },
    idleBlink: { bob: 1, blink: true },
    runA: { bob: 2, squish: 0.1, footLift: 9 },
    runB: { bob: 0, squish: 0.18, otherFootLift: 9 },
    jump: { bob: -5, squish: -0.18, footLift: 6, otherFootLift: 6 },
    fall: { bob: 3, squish: 0.18 },
    hurt: { bob: 0, squish: 0.1, hurt: true },
  };

  return Object.fromEntries(
    Object.entries(poses).map(([name, pose]) => [
      name,
      textureFromDrawing((context, size) => drawGio(context, size, pose)),
    ]),
  );
}

export function createEnemyTextures() {
  const drawBlob = (context, _size, blink) => {
    context.save();
    context.strokeStyle = INK;
    context.lineWidth = 8;

    context.fillStyle = "#745acb";
    roundedPath(context, 27, 65, 138, 91, 46);
    context.fill();
    context.stroke();

    ellipse(context, 60, 62, 18, 25, "#745acb", INK, 8);
    ellipse(context, 132, 62, 18, 25, "#745acb", INK, 8);
    ellipse(context, 60, 65, 6, 12, "#a995f1");
    ellipse(context, 132, 65, 6, 12, "#a995f1");

    ellipse(context, 74, 105, 6, blink ? 2 : 8, INK);
    ellipse(context, 118, 105, 6, blink ? 2 : 8, INK);
    ellipse(context, 61, 119, 9, 4, "#d8a1da");
    ellipse(context, 131, 119, 9, 4, "#d8a1da");

    context.strokeStyle = INK;
    context.lineWidth = 5;
    context.beginPath();
    context.arc(96, 112, 9, 0.15 * Math.PI, 0.85 * Math.PI);
    context.stroke();

    ellipse(context, 57, 151, 30, 12, "#5845a8", INK, 7);
    ellipse(context, 135, 151, 30, 12, "#5845a8", INK, 7);
    context.restore();
  };

  return {
    idle: textureFromDrawing((context, size) => drawBlob(context, size, false)),
    blink: textureFromDrawing((context, size) => drawBlob(context, size, true)),
  };
}

export function createCheckpointTexture(active = false) {
  return textureFromDrawing((context) => {
    context.save();
    context.translate(96, 95);
    context.rotate(-0.08);
    context.fillStyle = active ? LEMON : CREAM;
    context.strokeStyle = INK;
    context.lineWidth = 7;
    roundedPath(context, -54, -39, 108, 77, 24);
    context.fill();
    context.stroke();
    drawSpark(context, 0, 0, 20, active ? CORAL : "#a98cb6");
    context.restore();
  });
}
