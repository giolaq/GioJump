import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  CHECKPOINTS,
  COLLECTIBLES,
  DECORATIONS,
  ENEMIES,
  LEVEL_END,
  PLATFORMS,
  PLAYER_START,
  platformBounds,
  progressForX,
} from "./level.js";
import { ACTIONS, InputController } from "./input.js";
import {
  createCheckpointTexture,
  createEnemyTextures,
  createPlayerTextures,
} from "./textures.js";

const FIXED_STEP = 1 / 60;
const MENU_FRAME_INTERVAL = 1 / 30;
const SHADOW_UPDATE_DISTANCE = 0.75;
const PERFORMANCE_SAMPLE_FRAMES = 45;
const PERFORMANCE_FRAME_BUDGET = 1 / 48;
const PERFORMANCE_COOLDOWN = 1.5;
const MIN_PIXEL_RATIO = 0.75;
const PLAYER_WIDTH = 1.05;
const PLAYER_HEIGHT = 1.72;
const ENEMY_WIDTH = 1.25;
const ENEMY_HEIGHT = 1.2;
const GRAVITY = -25;
const MAX_FALL_SPEED = -17;
const JUMP_ACTIONS = [ACTIONS.UP, ACTIONS.CONFIRM];
const MENU_ACTIONS = [
  ACTIONS.UP,
  ACTIONS.DOWN,
  ACTIONS.LEFT,
  ACTIONS.RIGHT,
  ACTIONS.CONFIRM,
  ACTIONS.BACK,
];
const PLAYER_MOTION = Object.freeze({
  maxSpeed: 7.2,
  groundAcceleration: 42,
  airAcceleration: 25,
  groundDeceleration: 48,
  airDeceleration: 12,
  jumpVelocity: 15,
  jumpCut: 0.48,
  coyoteTime: 0.11,
  jumpBuffer: 0.14,
  fastFallAcceleration: 16,
});

const COLORS = Object.freeze({
  sky: 0x80d7eb,
  skyDeep: 0x54b9d4,
  cloud: 0xfffaf2,
  ink: 0x3e294f,
  mint: 0x61cf9b,
  mintDark: 0x2fae7b,
  berry: 0xff8d9a,
  berryDark: 0xd65369,
  lemon: 0xffd84d,
  lemonDark: 0xd99b30,
  lavender: 0xa995f1,
  plum: 0x684d78,
});

function moveToward(current, target, maxDelta) {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + Math.sign(target - current) * maxDelta;
}

function seededValue(index, salt = 0) {
  const value = Math.sin(index * 91.345 + salt * 17.17) * 47453.5453;
  return value - Math.floor(value);
}

function createStarShape(outerRadius = 0.48, innerRadius = 0.22) {
  const shape = new THREE.Shape();
  for (let point = 0; point < 10; point += 1) {
    const angle = -Math.PI / 2 + (point / 10) * Math.PI * 2;
    const radius = point % 2 === 0 ? outerRadius : innerRadius;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (point === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
}

function createRendererProfile() {
  const forcedQuality = new URLSearchParams(window.location.search).get("quality");
  const userAgent = navigator.userAgent;
  const lowPowerDevice =
    /Android|GioJumpFireTV/i.test(userAgent) ||
    (navigator.deviceMemory && navigator.deviceMemory <= 4) ||
    (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
  const balanced = forcedQuality === "low" ||
    (forcedQuality !== "high" && lowPowerDevice);

  return {
    tier: balanced ? "balanced" : "high",
    maxPixelRatio: balanced ? 1 : 1.25,
    shadows: !balanced,
    shadowMapSize: balanced ? 256 : 512,
  };
}

function mergeTransformedGeometry(source, transforms) {
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const matrix = new THREE.Matrix4();
  const geometries = transforms.map((transform) => {
    const geometry = source.clone();
    position.fromArray(transform.position ?? [0, 0, 0]);
    scale.fromArray(transform.scale ?? [1, 1, 1]);
    quaternion.identity();
    matrix.compose(position, quaternion, scale);
    geometry.applyMatrix4(matrix);
    return geometry;
  });
  const merged = mergeGeometries(geometries);
  geometries.forEach((geometry) => geometry.dispose());
  return merged;
}

function consumeAny(input, method, actions) {
  return actions.reduce(
    (consumed, action) => input[method](action) || consumed,
    false,
  );
}

function setSpriteTexture(sprite, texture) {
  if (sprite.material.map === texture) return;
  sprite.material.map = texture;
}

export class GioJumpGame {
  constructor(canvas, callbacks = {}) {
    this.canvas = canvas;
    this.callbacks = callbacks;
    this.input = new InputController();
    this.state = "start";
    this.time = 0;
    this.lastFrame = performance.now();
    this.accumulator = 0;
    this.animationFrame = null;
    this.cameraTargetX = 7;
    this.cameraTargetY = 3.4;
    this.activeCheckpoint = -1;
    this.collectedStars = 0;
    this.lives = 3;
    this.particles = [];
    this.rendererProfile = createRendererProfile();
    this.pixelRatio = 1;
    this.shadowAnchorX = Number.NEGATIVE_INFINITY;
    this.visualAccumulator = 0;
    this.lastRenderTime = Number.NEGATIVE_INFINITY;
    this.performanceAverage = FIXED_STEP;
    this.performanceSamples = 0;
    this.performanceCooldown = 0;
    this.playerTextures = createPlayerTextures();
    this.enemyTextures = createEnemyTextures();
    this.checkpointTextures = {
      inactive: createCheckpointTexture(false),
      active: createCheckpointTexture(true),
    };

    this.initializeRenderer();
    this.initializeScene();
    this.buildWorld();
    this.resetPlayer();
    this.resize();
    this.emitStats();
    this.callbacks.onProgress?.(0);

    this.frame = this.frame.bind(this);
    this.animationFrame = requestAnimationFrame(this.frame);
  }

  initializeRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.shadowMap.enabled = this.rendererProfile.shadows;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = this.rendererProfile.shadows;
    this.pixelRatio = Math.min(
      window.devicePixelRatio || 1,
      this.rendererProfile.maxPixelRatio,
    );
    this.renderer.setPixelRatio(this.pixelRatio);
  }

  initializeScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(COLORS.sky);
    this.scene.fog = new THREE.Fog(COLORS.sky, 28, 72);

    this.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 120);
    this.camera.position.set(7, 6.5, 17);
    this.camera.lookAt(10, 3.2, 0);

    const hemisphere = new THREE.HemisphereLight(0xc7f7ff, 0x92718a, 2.3);
    this.scene.add(hemisphere);

    const sun = new THREE.DirectionalLight(0xfff1c4, 3.2);
    sun.position.set(10, 18, 13);
    sun.castShadow = true;
    sun.shadow.mapSize.set(
      this.rendererProfile.shadowMapSize,
      this.rendererProfile.shadowMapSize,
    );
    sun.shadow.camera.left = -18;
    sun.shadow.camera.right = 18;
    sun.shadow.camera.top = 18;
    sun.shadow.camera.bottom = -12;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 50;
    sun.shadow.bias = -0.0005;
    this.scene.add(sun);
    this.scene.add(sun.target);
    this.sun = sun;
  }

  buildWorld() {
    this.world = new THREE.Group();
    this.scene.add(this.world);
    this.buildBackdrop();
    this.buildPlatforms();
    this.buildDecorations();
    this.buildCollectibles();
    this.buildEnemies();
    this.buildCheckpoints();
    this.buildFinishGate();
    this.buildPlayer();
    this.buildParticlePool();
  }

  buildBackdrop() {
    this.backdrop = new THREE.Group();
    this.world.add(this.backdrop);

    const cloudMaterial = new THREE.MeshLambertMaterial({ color: COLORS.cloud });
    const cloudPuffGeometry = new THREE.SphereGeometry(1, 10, 7);
    const cloudGeometry = mergeTransformedGeometry(cloudPuffGeometry, [
      { position: [-1.05, 0, 0], scale: [1.05, 0.7, 0.72] },
      { position: [0, 0.22, 0], scale: [1.35, 0.9, 0.72] },
      { position: [1.1, -0.03, 0], scale: [0.95, 0.64, 0.72] },
    ]);
    cloudPuffGeometry.dispose();

    this.clouds = [];
    for (let index = 0; index < 19; index += 1) {
      const cloud = new THREE.Mesh(cloudGeometry, cloudMaterial);
      const scale = 1.4 + seededValue(index, 1) * 1.5;
      cloud.position.set(
        -8 + index * 11.5 + seededValue(index, 2) * 3,
        8 + seededValue(index, 3) * 7,
        -12 - seededValue(index, 4) * 8,
      );
      cloud.scale.setScalar(scale);
      cloud.userData.baseY = cloud.position.y;
      cloud.userData.phase = seededValue(index, 5) * Math.PI * 2;
      this.backdrop.add(cloud);
      this.clouds.push(cloud);
    }

    const mountainGeometry = new THREE.ConeGeometry(5, 10, 8);
    const mountainMaterials = [
      new THREE.MeshLambertMaterial({ color: 0x9fb9e8 }),
      new THREE.MeshLambertMaterial({ color: 0xb9a8dc }),
      new THREE.MeshLambertMaterial({ color: 0x91c8bd }),
    ];
    for (let index = 0; index < 16; index += 1) {
      const mountain = new THREE.Mesh(
        mountainGeometry,
        mountainMaterials[index % mountainMaterials.length],
      );
      const scale = 0.8 + seededValue(index, 7) * 0.8;
      mountain.position.set(index * 13 - 8, -0.6, -18 - (index % 3) * 4);
      mountain.scale.set(scale, scale, scale);
      mountain.rotation.y = seededValue(index, 8) * 0.8;
      this.backdrop.add(mountain);
    }

    const sunGeometry = new THREE.SphereGeometry(3.2, 24, 16);
    const sunMaterial = new THREE.MeshBasicMaterial({ color: COLORS.lemon });
    const backdropSun = new THREE.Mesh(sunGeometry, sunMaterial);
    backdropSun.position.set(26, 13, -23);
    this.backdrop.add(backdropSun);

    const rayGeometry = new THREE.TorusGeometry(4.25, 0.12, 6, 32);
    const rayMaterial = new THREE.MeshBasicMaterial({ color: 0xffe891 });
    for (let index = 0; index < 3; index += 1) {
      const ray = new THREE.Mesh(rayGeometry, rayMaterial);
      ray.position.copy(backdropSun.position);
      ray.scale.setScalar(1 + index * 0.22);
      this.backdrop.add(ray);
    }
  }

  buildPlatforms() {
    const styleMaterials = {
      mint: {
        body: new THREE.MeshLambertMaterial({ color: COLORS.mintDark }),
        top: new THREE.MeshLambertMaterial({ color: COLORS.mint }),
      },
      berry: {
        body: new THREE.MeshLambertMaterial({ color: COLORS.berryDark }),
        top: new THREE.MeshLambertMaterial({ color: COLORS.berry }),
      },
      lemon: {
        body: new THREE.MeshLambertMaterial({ color: COLORS.lemonDark }),
        top: new THREE.MeshLambertMaterial({ color: COLORS.lemon }),
      },
    };

    const dotGeometry = new THREE.SphereGeometry(0.2, 8, 6);
    const dotMaterial = new THREE.MeshLambertMaterial({ color: 0xfff3cb });

    this.platformMeshes = [];
    PLATFORMS.forEach((platform, index) => {
      const height = 3.5 + (index % 3) * 0.7;
      const materials = styleMaterials[platform.style];
      const group = new THREE.Group();

      const body = new THREE.Mesh(
        new THREE.BoxGeometry(platform.width, height, platform.depth),
        materials.body,
      );
      body.position.y = platform.y - height / 2 - 0.18;
      body.castShadow = true;
      body.receiveShadow = true;
      group.add(body);

      const top = new THREE.Mesh(
        new THREE.BoxGeometry(platform.width + 0.18, 0.36, platform.depth + 0.18),
        materials.top,
      );
      top.position.y = platform.y - 0.02;
      top.castShadow = true;
      top.receiveShadow = true;
      group.add(top);

      const dotCount = Math.max(2, Math.floor(platform.width / 3.2));
      const dotTransforms = [];
      for (let dot = 0; dot < dotCount; dot += 1) {
        const t = (dot + 1) / (dotCount + 1);
        dotTransforms.push({
          position: [
            -platform.width / 2 + platform.width * t,
            -0.64 - (dot % 2) * 0.55,
            platform.depth / 2 + 0.03,
          ],
          scale: [1.25, 0.75, 0.35],
        });
      }
      const pebbles = new THREE.Mesh(
        mergeTransformedGeometry(dotGeometry, dotTransforms),
        dotMaterial,
      );
      group.add(pebbles);

      group.position.x = platform.x;
      this.world.add(group);
      this.platformMeshes.push(group);
    });
    dotGeometry.dispose();
  }

  buildDecorations() {
    const stemGeometry = new THREE.CylinderGeometry(0.06, 0.08, 0.8, 8);
    const stemMaterial = new THREE.MeshLambertMaterial({ color: 0x2ca779 });
    const petalGeometry = new THREE.SphereGeometry(0.18, 8, 6);
    const mergedPetalGeometry = mergeTransformedGeometry(
      petalGeometry,
      Array.from({ length: 5 }, (_, petal) => {
        const angle = (petal / 5) * Math.PI * 2;
        return {
          position: [Math.cos(angle) * 0.28, 0.88 + Math.sin(angle) * 0.28, 0],
          scale: [1, 1.35, 0.55],
        };
      }),
    );
    petalGeometry.dispose();
    const bushPuffGeometry = new THREE.SphereGeometry(0.5, 8, 6);
    const bushGeometry = mergeTransformedGeometry(
      bushPuffGeometry,
      Array.from({ length: 3 }, (_, puff) => ({
        position: [(puff - 1) * 0.48, 0.35 + (puff % 2) * 0.24, 0],
        scale: [1.15, 1, 0.65],
      })),
    );
    bushPuffGeometry.dispose();
    const centerGeometry = new THREE.SphereGeometry(0.15, 8, 6);
    const centerMaterial = new THREE.MeshLambertMaterial({ color: COLORS.lemon });
    const decorationColors = {
      pink: COLORS.berry,
      yellow: COLORS.lemon,
      white: COLORS.cloud,
      mint: COLORS.mint,
    };

    DECORATIONS.forEach((decoration, index) => {
      const group = new THREE.Group();
      if (decoration.type === "flower") {
        const stem = new THREE.Mesh(stemGeometry, stemMaterial);
        stem.position.y = 0.4;
        group.add(stem);
        const petalMaterial = new THREE.MeshLambertMaterial({
          color: decorationColors[decoration.color],
        });
        group.add(new THREE.Mesh(mergedPetalGeometry, petalMaterial));
        const center = new THREE.Mesh(centerGeometry, centerMaterial);
        center.position.set(0, 0.88, 0.15);
        group.add(center);
      } else {
        const bushMaterial = new THREE.MeshLambertMaterial({
          color: decorationColors[decoration.color],
        });
        group.add(new THREE.Mesh(bushGeometry, bushMaterial));
      }
      group.position.set(decoration.x, decoration.y, 3.2);
      group.rotation.z = (seededValue(index, 12) - 0.5) * 0.12;
      this.world.add(group);
    });
  }

  buildCollectibles() {
    const shape = createStarShape();
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.16,
      bevelEnabled: true,
      bevelSegments: 1,
      bevelSize: 0.05,
      bevelThickness: 0.05,
    });
    geometry.center();
    const material = new THREE.MeshLambertMaterial({
      color: COLORS.lemon,
      emissive: 0x8a5f00,
      emissiveIntensity: 0.18,
    });

    this.collectibles = COLLECTIBLES.map((item, index) => {
      const star = new THREE.Mesh(geometry, material);
      star.position.set(item.x, item.y, 3.15);
      star.scale.setScalar(1.08);
      star.castShadow = true;
      star.userData.baseY = item.y;
      star.userData.phase = seededValue(index, 15) * Math.PI * 2;
      star.userData.collected = false;
      this.world.add(star);
      return star;
    });
  }

  buildEnemies() {
    this.enemies = ENEMIES.map((config, index) => {
      const material = new THREE.SpriteMaterial({
        map: this.enemyTextures.idle,
        transparent: true,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(material);
      sprite.scale.set(1.9, 1.9, 1);
      sprite.position.set(config.x, config.y, 3.3);
      this.world.add(sprite);
      return {
        ...config,
        x: config.x,
        direction: index % 2 === 0 ? 1 : -1,
        alive: true,
        sprite,
      };
    });
  }

  buildCheckpoints() {
    const poleMaterial = new THREE.MeshLambertMaterial({ color: COLORS.cloud });
    const poleGeometry = new THREE.CylinderGeometry(0.09, 0.11, 2.8, 10);

    this.checkpoints = CHECKPOINTS.map((checkpoint) => {
      const group = new THREE.Group();
      const pole = new THREE.Mesh(poleGeometry, poleMaterial);
      pole.position.y = 1.35;
      pole.castShadow = true;
      group.add(pole);

      const material = new THREE.SpriteMaterial({
        map: this.checkpointTextures.inactive,
        transparent: true,
        depthWrite: false,
      });
      const flag = new THREE.Sprite(material);
      flag.position.set(0.72, 2.2, 0.3);
      flag.scale.set(1.6, 1.6, 1);
      group.add(flag);
      group.position.set(checkpoint.x, checkpoint.y - 1.2, 2.45);
      this.world.add(group);
      return { ...checkpoint, group, flag, active: false };
    });
  }

  buildFinishGate() {
    const group = new THREE.Group();
    const archColors = [COLORS.berry, COLORS.lemon, COLORS.mint, 0x78b5f2];
    archColors.forEach((color, index) => {
      const arch = new THREE.Mesh(
        new THREE.TorusGeometry(2.35 - index * 0.28, 0.16, 8, 36, Math.PI),
        new THREE.MeshLambertMaterial({ color }),
      );
      arch.position.y = 2.2;
      arch.rotation.z = 0;
      group.add(arch);
    });

    const pillarGeometry = new THREE.CylinderGeometry(0.28, 0.34, 2.4, 12);
    const pillarMaterial = new THREE.MeshLambertMaterial({ color: COLORS.cloud });
    for (const side of [-1, 1]) {
      const pillar = new THREE.Mesh(pillarGeometry, pillarMaterial);
      pillar.position.set(side * 2.35, 1.02, 0);
      pillar.castShadow = true;
      group.add(pillar);
    }
    group.position.set(LEVEL_END, 0, 1.2);
    this.world.add(group);
    this.finishGate = group;
  }

  buildPlayer() {
    const material = new THREE.SpriteMaterial({
      map: this.playerTextures.idle,
      transparent: true,
      depthWrite: false,
    });
    this.playerSprite = new THREE.Sprite(material);
    this.playerSprite.scale.set(2.2, 2.2, 1);
    this.playerSprite.position.z = 3.7;
    this.world.add(this.playerSprite);

    const shadowMaterial = new THREE.MeshBasicMaterial({
      color: COLORS.ink,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
    });
    this.playerShadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.66, 20),
      shadowMaterial,
    );
    this.playerShadow.rotation.x = -Math.PI / 2;
    this.playerShadow.position.z = 1.4;
    this.world.add(this.playerShadow);
  }

  buildParticlePool() {
    const geometry = new THREE.OctahedronGeometry(0.13, 0);
    const colors = [
      new THREE.Color(COLORS.lemon),
      new THREE.Color(COLORS.berry),
      new THREE.Color(COLORS.cloud),
      new THREE.Color(COLORS.mint),
    ];
    const material = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.particleMesh = new THREE.InstancedMesh(geometry, material, 56);
    this.particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.particleMesh.count = 0;
    this.particleMesh.visible = false;
    this.particleMesh.frustumCulled = false;
    this.world.add(this.particleMesh);
    this.particleMatrix = new THREE.Matrix4();
    this.particlePosition = new THREE.Vector3();
    this.particleScale = new THREE.Vector3();
    this.particleRotation = new THREE.Euler();
    this.particleQuaternion = new THREE.Quaternion();

    for (let index = 0; index < 56; index += 1) {
      this.particles.push({
        color: colors[index % colors.length],
        active: false,
        life: 0,
        x: 0,
        y: 0,
        z: 4,
        vx: 0,
        vy: 0,
        vz: 0,
        rotationX: 0,
        rotationY: 0,
        scale: 1,
      });
    }
  }

  resetPlayer() {
    this.player = {
      x: PLAYER_START.x,
      y: PLAYER_START.y,
      previousY: PLAYER_START.y,
      vx: 0,
      vy: 0,
      onGround: false,
      coyoteTime: 0,
      jumpBuffer: 0,
      facing: 1,
      invulnerable: 0,
    };
    this.updatePlayerMesh();
  }

  reset() {
    this.input.reset();
    this.accumulator = 0;
    this.activeCheckpoint = -1;
    this.collectedStars = 0;
    this.lives = 3;
    this.resetPlayer();

    this.collectibles.forEach((star) => {
      star.visible = true;
      star.userData.collected = false;
    });

    this.enemies.forEach((enemy, index) => {
      enemy.x = ENEMIES[index].x;
      enemy.alive = true;
      enemy.sprite.visible = true;
      enemy.direction = index % 2 === 0 ? 1 : -1;
    });

    this.checkpoints.forEach((checkpoint) => {
      this.setCheckpointActive(checkpoint, false);
    });

    this.particles.forEach((particle) => this.deactivateParticle(particle));
    this.syncParticleInstances();

    this.cameraTargetX = 7;
    this.cameraTargetY = 3.4;
    this.emitStats();
    this.callbacks.onProgress?.(0);
  }

  start() {
    this.reset();
    this.setState("playing");
  }

  pause() {
    if (this.state !== "playing") return;
    this.setState("paused");
    this.input.reset();
  }

  resume() {
    if (this.state !== "paused") return;
    this.lastFrame = performance.now();
    this.setState("playing");
  }

  setState(nextState) {
    this.state = nextState;
    this.callbacks.onState?.(nextState);
  }

  resize() {
    const width = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    const height = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.pixelRatio = Math.min(
      this.pixelRatio,
      window.devicePixelRatio || 1,
      this.rendererProfile.maxPixelRatio,
    );
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(width, height, false);
  }

  fixedUpdate(delta) {
    this.updateHorizontalMovement(delta);
    this.updateJumpState(delta);
    const movement = this.integratePlayer(delta);
    this.resolvePlayerLanding(movement);
    this.updateGameplaySystems(delta, movement);
  }

  updateHorizontalMovement(delta) {
    const player = this.player;
    const direction =
      Number(this.input.isDown(ACTIONS.RIGHT)) -
      Number(this.input.isDown(ACTIONS.LEFT));
    const acceleration = player.onGround
      ? PLAYER_MOTION.groundAcceleration
      : PLAYER_MOTION.airAcceleration;
    const deceleration = player.onGround
      ? PLAYER_MOTION.groundDeceleration
      : PLAYER_MOTION.airDeceleration;
    const rate = direction === 0 ? deceleration : acceleration;

    if (direction !== 0) {
      player.facing = direction;
    }
    player.vx = moveToward(
      player.vx,
      direction * PLAYER_MOTION.maxSpeed,
      rate * delta,
    );
  }

  updateJumpState(delta) {
    const player = this.player;
    player.coyoteTime = player.onGround
      ? PLAYER_MOTION.coyoteTime
      : Math.max(0, player.coyoteTime - delta);

    player.jumpBuffer = consumeAny(this.input, "consumePressed", JUMP_ACTIONS)
      ? PLAYER_MOTION.jumpBuffer
      : Math.max(0, player.jumpBuffer - delta);

    const jumpReleased = consumeAny(this.input, "consumeReleased", JUMP_ACTIONS);
    if (jumpReleased && player.vy > 0) player.vy *= PLAYER_MOTION.jumpCut;

    if (player.jumpBuffer > 0 && player.coyoteTime > 0) {
      this.startJump();
    }
  }

  startJump() {
    const player = this.player;
    player.vy = PLAYER_MOTION.jumpVelocity;
    player.onGround = false;
    player.coyoteTime = 0;
    player.jumpBuffer = 0;
    this.callbacks.onSound?.("jump");
    this.burst(player.x, player.y - 0.65, 4, 0.75);
  }

  integratePlayer(delta) {
    const player = this.player;
    player.previousY = player.y;
    player.x += player.vx * delta;
    player.x = THREE.MathUtils.clamp(player.x, -1, LEVEL_END + 2.5);
    const fastFall = this.input.isDown(ACTIONS.DOWN) && !player.onGround;
    const acceleration =
      GRAVITY - (fastFall ? PLAYER_MOTION.fastFallAcceleration : 0);
    player.vy = Math.max(MAX_FALL_SPEED, player.vy + acceleration * delta);
    player.y += player.vy * delta;

    return {
      oldBottom: player.previousY - PLAYER_HEIGHT / 2,
      newBottom: player.y - PLAYER_HEIGHT / 2,
    };
  }

  resolvePlayerLanding({ oldBottom, newBottom }) {
    const player = this.player;
    player.onGround = false;
    if (player.vy > 0) return;

    const landingPlatform = this.findLandingPlatform(oldBottom, newBottom);
    if (!landingPlatform) return;
    player.y = landingPlatform.y + PLAYER_HEIGHT / 2;
    player.vy = 0;
    player.onGround = true;
  }

  findLandingPlatform(oldBottom, newBottom) {
    return PLATFORMS.reduce((highest, platform) => {
      if (!this.canLandOn(platform, oldBottom, newBottom)) return highest;
      return !highest || platform.y > highest.y ? platform : highest;
    }, null);
  }

  canLandOn(platform, oldBottom, newBottom) {
    const bounds = platformBounds(platform);
    const overlaps =
      this.player.x + PLAYER_WIDTH / 2 > bounds.left + 0.06 &&
      this.player.x - PLAYER_WIDTH / 2 < bounds.right - 0.06;
    const crossedTop =
      oldBottom >= bounds.top - 0.08 && newBottom <= bounds.top + 0.08;
    return overlaps && crossedTop;
  }

  updateGameplaySystems(delta, movement) {
    const player = this.player;
    player.invulnerable = Math.max(0, player.invulnerable - delta);
    this.updateEnemies(delta, movement);
    this.updateCollectibles();
    this.updateCheckpoints();
    this.updateParticles(delta);
    if (player.y < -7) this.loseLife(true);
    if (player.x >= LEVEL_END - 0.35) this.win();
  }

  updateEnemies(delta, movement) {
    this.enemies.forEach((enemy) => {
      if (!enemy.alive) return;
      this.updateEnemyPatrol(enemy, delta);
      if (this.playerOverlapsEnemy(enemy)) {
        this.resolveEnemyCollision(enemy, movement);
      }
    });
  }

  updateEnemyPatrol(enemy, delta) {
    enemy.x += enemy.direction * enemy.speed * delta;
    if (enemy.x <= enemy.minX || enemy.x >= enemy.maxX) {
      enemy.x = THREE.MathUtils.clamp(enemy.x, enemy.minX, enemy.maxX);
      enemy.direction *= -1;
    }
    enemy.sprite.position.x = enemy.x;
    enemy.sprite.scale.x = enemy.direction > 0 ? 1.9 : -1.9;
  }

  playerOverlapsEnemy(enemy) {
    const horizontalOverlap =
      this.player.x + PLAYER_WIDTH / 2 > enemy.x - ENEMY_WIDTH / 2 &&
      this.player.x - PLAYER_WIDTH / 2 < enemy.x + ENEMY_WIDTH / 2;
    const verticalOverlap =
      this.player.y + PLAYER_HEIGHT / 2 > enemy.y - ENEMY_HEIGHT / 2 &&
      this.player.y - PLAYER_HEIGHT / 2 < enemy.y + ENEMY_HEIGHT / 2;
    return horizontalOverlap && verticalOverlap;
  }

  resolveEnemyCollision(enemy, { oldBottom, newBottom }) {
    const stomped = this.playerStompedEnemy(enemy, oldBottom, newBottom);
    this.defeatEnemy(enemy);
    if (stomped) {
      this.player.vy = 8.2;
      this.callbacks.onSound?.("stomp");
      this.burst(enemy.x, enemy.y + 0.45, 10, 1.4);
      return;
    }
    this.loseLife(false, Math.sign(this.player.x - enemy.x) || 1);
  }

  playerStompedEnemy(enemy, oldBottom, newBottom) {
    const enemyTop = enemy.y + ENEMY_HEIGHT / 2;
    return (
      this.player.vy < 1 &&
      this.player.y - PLAYER_HEIGHT / 2 > enemy.y - 0.05 &&
      oldBottom >= enemyTop - 0.45 &&
      newBottom <= enemyTop + 0.42
    );
  }

  defeatEnemy(enemy) {
    enemy.alive = false;
    enemy.sprite.visible = false;
  }

  updateCollectibles() {
    this.collectibles.forEach((star) => {
      if (star.userData.collected) return;
      const dx = this.player.x - star.position.x;
      const dy = this.player.y - star.position.y;
      if (dx * dx + dy * dy < 1.35) {
        this.collectStar(star);
      }
    });
  }

  collectStar(star) {
    star.userData.collected = true;
    star.visible = false;
    this.collectedStars += 1;
    this.callbacks.onSound?.("collect");
    this.callbacks.onAnnounce?.(`Star ${this.collectedStars}`);
    this.burst(star.position.x, star.position.y, 9, 1.5);
    this.emitStats();
  }

  updateCheckpoints() {
    CHECKPOINTS.forEach((checkpoint, index) => {
      if (index <= this.activeCheckpoint || this.player.x < checkpoint.x) return;
      this.activateCheckpoint(index, checkpoint);
    });
  }

  activateCheckpoint(index, checkpoint) {
    this.activeCheckpoint = index;
    this.setCheckpointActive(this.checkpoints[index], true);
    this.lives = 3;
    this.emitStats();
    this.callbacks.onSound?.("checkpoint");
    this.callbacks.onAnnounce?.("Checkpoint");
    this.burst(checkpoint.x, checkpoint.y + 1.7, 15, 1.7);
  }

  setCheckpointActive(checkpoint, active) {
    checkpoint.active = active;
    setSpriteTexture(
      checkpoint.flag,
      active ? this.checkpointTextures.active : this.checkpointTextures.inactive,
    );
  }

  loseLife(fell, knockDirection = 1) {
    if (this.state !== "playing") return;
    if (!fell && this.player.invulnerable > 0) return;
    this.lives -= 1;
    this.callbacks.onSound?.("hurt");
    this.burst(this.player.x, this.player.y, 12, 1.7);
    this.emitStats();

    if (this.lives <= 0) {
      this.setState("gameover");
      this.callbacks.onAnnounce?.("Try again");
      return;
    }

    if (fell) this.respawnPlayer();
    else this.knockPlayer(knockDirection);
    this.player.invulnerable = 1.8;
  }

  respawnPlayer() {
    const hasCheckpoint = this.activeCheckpoint >= 0;
    const respawn = hasCheckpoint
      ? CHECKPOINTS[this.activeCheckpoint]
      : PLAYER_START;
    this.player.x = respawn.x - (hasCheckpoint ? 1.4 : 0);
    this.player.y = respawn.y + (hasCheckpoint ? 2.2 : 0);
    this.player.vx = 0;
    this.player.vy = 0;
  }

  knockPlayer(direction) {
    this.player.vx = direction * 5.5;
    this.player.vy = 7.2;
  }

  win() {
    if (this.state !== "playing") return;
    this.setState("won");
    this.callbacks.onSound?.("win");
    this.callbacks.onAnnounce?.("Star clear");
    this.burst(LEVEL_END, 3.8, 28, 2.7);
  }

  burst(x, y, count, force) {
    const available = [];
    for (const particle of this.particles) {
      if (!particle.active) available.push(particle);
      if (available.length === count) break;
    }

    available.forEach((particle, index) => {
      const angle = (index / Math.max(1, available.length)) * Math.PI * 2;
      const variedForce = force * (0.55 + seededValue(index, this.time) * 0.65);
      particle.active = true;
      particle.life = 0.65 + seededValue(index, this.time + 1) * 0.45;
      particle.x = x;
      particle.y = y;
      particle.z = 4;
      particle.vx = Math.cos(angle) * variedForce * 2.4;
      particle.vy = Math.sin(angle) * variedForce * 2.4 + force * 1.5;
      particle.vz = (seededValue(index, this.time + 2) - 0.5) * force;
      particle.rotationX = 0;
      particle.rotationY = 0;
      particle.scale = 0.65 + seededValue(index, this.time + 3) * 0.9;
    });
    this.syncParticleInstances();
  }

  updateParticles(delta) {
    this.particles.forEach((particle) => {
      if (!particle.active) return;
      particle.life -= delta;
      if (particle.life <= 0) {
        this.deactivateParticle(particle);
        return;
      }
      particle.vy += GRAVITY * 0.35 * delta;
      particle.x += particle.vx * delta;
      particle.y += particle.vy * delta;
      particle.z += particle.vz * delta;
      particle.rotationX += delta * 7;
      particle.rotationY += delta * 9;
      particle.scale *= 0.985;
    });
    this.syncParticleInstances();
  }

  deactivateParticle(particle) {
    particle.active = false;
  }

  syncParticleInstances() {
    let instance = 0;
    this.particles.forEach((particle) => {
      if (!particle.active) return;
      this.particlePosition.set(particle.x, particle.y, particle.z);
      this.particleScale.setScalar(particle.scale);
      this.particleRotation.set(particle.rotationX, particle.rotationY, 0);
      this.particleQuaternion.setFromEuler(this.particleRotation);
      this.particleMatrix.compose(
        this.particlePosition,
        this.particleQuaternion,
        this.particleScale,
      );
      this.particleMesh.setMatrixAt(instance, this.particleMatrix);
      this.particleMesh.setColorAt(instance, particle.color);
      instance += 1;
    });

    this.particleMesh.count = instance;
    this.particleMesh.visible = instance > 0;
    if (instance > 0) {
      this.particleMesh.instanceMatrix.needsUpdate = true;
      this.particleMesh.instanceColor.needsUpdate = true;
    }
  }

  updatePlayerMesh() {
    if (!this.playerSprite || !this.player) return;
    this.playerSprite.position.x = this.player.x;
    this.playerSprite.position.y = this.player.y + 0.18;
    this.playerSprite.scale.x = this.player.facing > 0 ? 2.2 : -2.2;

    const floor = this.floorBelow(this.player.x, this.player.y);
    const floorY = floor?.y ?? -2.5;
    const height = Math.max(0, this.player.y - PLAYER_HEIGHT / 2 - floorY);
    this.playerShadow.position.set(this.player.x, floorY + 0.03, 2.7);
    const shadowScale = THREE.MathUtils.clamp(1 - height * 0.08, 0.45, 1);
    this.playerShadow.scale.set(1.15 * shadowScale, 0.65 * shadowScale, 1);
    this.playerShadow.material.opacity = THREE.MathUtils.clamp(0.2 - height * 0.018, 0.06, 0.2);
    this.playerShadow.visible = Boolean(floor);
  }

  floorBelow(x, y) {
    let result = null;
    for (const platform of PLATFORMS) {
      const bounds = platformBounds(platform);
      if (x >= bounds.left && x <= bounds.right && bounds.top <= y) {
        if (!result || bounds.top > result.y) result = platform;
      }
    }
    return result;
  }

  updateVisuals(delta) {
    this.time += delta;
    this.animateClouds();
    this.animateCollectibles(delta);
    this.animateEnemies();
    this.finishGate.rotation.y = Math.sin(this.time * 0.55) * 0.025;
    this.updatePlayerAnimation();
    this.updatePlayerMesh();
  }

  animateClouds() {
    this.clouds.forEach((cloud) => {
      cloud.position.y =
        cloud.userData.baseY + Math.sin(this.time * 0.24 + cloud.userData.phase) * 0.24;
    });
  }

  animateCollectibles(delta) {
    this.collectibles.forEach((star) => {
      if (!star.visible) return;
      star.position.y =
        star.userData.baseY + Math.sin(this.time * 2.8 + star.userData.phase) * 0.18;
      star.rotation.y += delta * 2.2;
      star.rotation.z = Math.sin(this.time * 1.5 + star.userData.phase) * 0.08;
    });
  }

  animateEnemies() {
    this.enemies.forEach((enemy, index) => {
      if (!enemy.alive) return;
      enemy.sprite.position.y =
        enemy.y + Math.sin(this.time * 3.2 + index * 1.4) * 0.07;
      const blink = Math.floor(this.time * 2 + index * 1.7) % 13 === 0;
      const texture = blink ? this.enemyTextures.blink : this.enemyTextures.idle;
      setSpriteTexture(enemy.sprite, texture);
    });
  }

  updatePlayerAnimation() {
    const hurt = this.player.invulnerable > 0;
    this.playerSprite.visible = !hurt || Math.floor(this.time * 14) % 2 === 0;
    setSpriteTexture(this.playerSprite, this.playerTextureForState());
  }

  playerTextureForState() {
    if (this.player.invulnerable > 0) return this.playerTextures.hurt;
    if (!this.player.onGround) {
      return this.player.vy > 0
        ? this.playerTextures.jump
        : this.playerTextures.fall;
    }
    if (Math.abs(this.player.vx) > 0.7) {
      return Math.floor(this.time * 9) % 2 === 0
        ? this.playerTextures.runA
        : this.playerTextures.runB;
    }
    return Math.floor(this.time * 1.3) % 11 === 0
      ? this.playerTextures.idleBlink
      : this.playerTextures.idle;
  }

  updateCamera(delta) {
    const narrowViewport = this.camera.aspect < 0.75;
    const lookAhead = narrowViewport ? 0.8 : 3.8;
    const minimumX = narrowViewport ? 3.7 : 7;
    const gameplayTarget = this.state === "start"
      ? minimumX + 1
      : this.player.x + lookAhead;
    const maxCameraX = LEVEL_END - (narrowViewport ? 1.5 : 4.5);
    const desiredX = THREE.MathUtils.clamp(gameplayTarget, minimumX, maxCameraX);
    const desiredY = this.state === "start"
      ? 3.4
      : THREE.MathUtils.clamp(this.player.y + 1.65, 3.3, 6.6);
    const cameraLerp = 1 - Math.exp(-delta * 5.2);
    this.cameraTargetX = THREE.MathUtils.lerp(this.cameraTargetX, desiredX, cameraLerp);
    this.cameraTargetY = THREE.MathUtils.lerp(this.cameraTargetY, desiredY, cameraLerp * 0.8);

    this.camera.position.set(this.cameraTargetX, this.cameraTargetY + 3.1, 17.2);
    this.camera.lookAt(
      this.cameraTargetX + (narrowViewport ? 0.15 : 0.8),
      this.cameraTargetY,
      0.7,
    );
    this.sun.position.x = this.cameraTargetX - 2;
    this.sun.target.position.set(this.cameraTargetX, 0, 0);
    if (
      this.renderer.shadowMap.enabled &&
      Math.abs(this.cameraTargetX - this.shadowAnchorX) >= SHADOW_UPDATE_DISTANCE
    ) {
      this.shadowAnchorX = this.cameraTargetX;
      this.renderer.shadowMap.needsUpdate = true;
    }
  }

  frame(now) {
    const rawDelta = Math.min(0.05, Math.max(0, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    this.input.pollGamepads();
    this.updateFrameState(rawDelta);
    this.updateAdaptiveQuality(rawDelta);
    this.visualAccumulator += rawDelta;

    const secondsSinceRender = (now - this.lastRenderTime) / 1000;
    const shouldRender =
      this.state === "playing" ||
      secondsSinceRender >= MENU_FRAME_INTERVAL;
    if (shouldRender) {
      this.updateVisuals(this.visualAccumulator);
      this.updateCamera(this.visualAccumulator);
      this.callbacks.onProgress?.(progressForX(this.player.x));
      this.renderer.render(this.scene, this.camera);
      this.visualAccumulator = 0;
      this.lastRenderTime = now;
    }
    this.input.endFrame();
    this.animationFrame = requestAnimationFrame(this.frame);
  }

  updateAdaptiveQuality(delta) {
    if (this.state !== "playing" || delta <= 0 || delta >= 0.1) return;
    this.performanceAverage += (delta - this.performanceAverage) * 0.04;
    this.performanceSamples += 1;
    this.performanceCooldown = Math.max(0, this.performanceCooldown - delta);
    if (
      this.performanceSamples < PERFORMANCE_SAMPLE_FRAMES ||
      this.performanceCooldown > 0 ||
      this.performanceAverage <= PERFORMANCE_FRAME_BUDGET
    ) {
      return;
    }

    this.performanceSamples = 0;
    this.performanceCooldown = PERFORMANCE_COOLDOWN;
    if (this.renderer.shadowMap.enabled) {
      this.renderer.shadowMap.enabled = false;
      this.rendererProfile.tier = "adaptive";
      return;
    }

    const nextPixelRatio = Math.max(
      MIN_PIXEL_RATIO,
      Number((this.pixelRatio - 0.2).toFixed(2)),
    );
    if (nextPixelRatio >= this.pixelRatio) return;
    this.pixelRatio = nextPixelRatio;
    this.rendererProfile.tier = "adaptive";
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(
      Math.max(1, this.canvas.clientWidth || window.innerWidth),
      Math.max(1, this.canvas.clientHeight || window.innerHeight),
      false,
    );
  }

  updateFrameState(delta) {
    if (this.state === "playing") {
      this.updatePlayingFrame(delta);
      return;
    }
    this.dispatchMenuActions();
  }

  updatePlayingFrame(delta) {
    if (consumeAny(this.input, "consumePressed", [ACTIONS.PAUSE, ACTIONS.BACK])) {
      this.pause();
      return;
    }
    this.accumulator += delta;
    this.runFixedUpdates();
  }

  runFixedUpdates() {
    let steps = 0;
    while (
      this.accumulator >= FIXED_STEP &&
      steps < 4 &&
      this.state === "playing"
    ) {
      this.fixedUpdate(FIXED_STEP);
      this.accumulator -= FIXED_STEP;
      steps += 1;
    }
  }

  dispatchMenuActions() {
    MENU_ACTIONS.forEach((action) => {
      if (this.input.consumePressed(action)) {
        this.callbacks.onMenuAction?.(action);
      }
    });
  }

  emitStats() {
    this.callbacks.onStats?.({
      stars: this.collectedStars,
      totalStars: COLLECTIBLES.length,
      lives: this.lives,
    });
  }

  snapshot() {
    const playerScreen = this.playerSprite.position.clone().project(this.camera);
    return {
      state: this.state,
      player: {
        x: Number(this.player.x.toFixed(3)),
        y: Number(this.player.y.toFixed(3)),
        vx: Number(this.player.vx.toFixed(3)),
        vy: Number(this.player.vy.toFixed(3)),
        onGround: this.player.onGround,
      },
      stars: this.collectedStars,
      totalStars: COLLECTIBLES.length,
      lives: this.lives,
      activeCheckpoint: this.activeCheckpoint,
      renderer: {
        triangles: this.renderer.info.render.triangles,
        calls: this.renderer.info.render.calls,
        pixelRatio: this.renderer.getPixelRatio(),
        quality: this.rendererProfile.tier,
        shadows: this.renderer.shadowMap.enabled,
        averageFrameMs: Number((this.performanceAverage * 1000).toFixed(2)),
        webgl2: this.renderer.capabilities.isWebGL2,
      },
      playerScreen: {
        x: Number(((playerScreen.x + 1) / 2).toFixed(3)),
        y: Number(((1 - playerScreen.y) / 2).toFixed(3)),
        visible:
          playerScreen.x >= -1 &&
          playerScreen.x <= 1 &&
          playerScreen.y >= -1 &&
          playerScreen.y <= 1,
      },
    };
  }

  destroy() {
    cancelAnimationFrame(this.animationFrame);
    Object.values(this.playerTextures).forEach((texture) => texture.dispose());
    Object.values(this.enemyTextures).forEach((texture) => texture.dispose());
    Object.values(this.checkpointTextures).forEach((texture) => texture.dispose());
    this.renderer.dispose();
  }
}
