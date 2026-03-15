import * as THREE from "three";
import {
  EffectComposer,
  RenderPass,
  EffectPass,
  BloomEffect,
  VignetteEffect,
  FXAAEffect,
  SSAOEffect,
  ChromaticAberrationEffect,
  ToneMappingEffect,
  ToneMappingMode,
  SMAAEffect
} from "postprocessing";

function buildTrackGeometry(curve, width, segments) {
  const sampleCount = Math.max(220, segments);
  const points = curve.getSpacedPoints(sampleCount);
  const normals = [];
  const tangents = [];
  for (let i = 0; i <= sampleCount; i += 1) {
    const t = i / sampleCount;
    const tangent = curve.getTangentAt(t).normalize();
    tangents.push(tangent);
    const right = new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();
    normals.push(right);
  }

  const positions = [];
  const uvs = [];
  const indices = [];

  for (let i = 0; i <= sampleCount; i += 1) {
    const p = points[i];
    const r = normals[i];
    const left = p.clone().addScaledVector(r, -width * 0.5);
    const right = p.clone().addScaledVector(r, width * 0.5);

    positions.push(left.x, left.y + 0.02, left.z);
    positions.push(right.x, right.y + 0.02, right.z);
    uvs.push(0, i / sampleCount);
    uvs.push(1, i / sampleCount);

    if (i < sampleCount) {
      const n = i * 2;
      indices.push(n, n + 1, n + 2);
      indices.push(n + 1, n + 3, n + 2);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(indices);
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return { geometry, points, tangents, normals };
}

function createBillboard(text, color = "#ffffff") {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "rgba(10, 20, 38, 0.82)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "rgba(168, 212, 255, 0.7)";
  ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);
  ctx.fillStyle = color;
  ctx.font = "700 52px Segoe UI";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(
    new THREE.PlaneGeometry(10, 4),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true })
  );
}

export class RendererSystem {
  constructor(host, hudRefs, config) {
    this.host = host;
    this.hudRefs = hudRefs;
    this.config = config;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x8fb7d9, 35, 300);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.camera = new THREE.PerspectiveCamera(68, 1, 0.1, 1200);
    this.camera.position.set(0, 5.8, 10.5);

    this.roadGroup = new THREE.Group();
    this.propGroup = new THREE.Group();
    this.vehicleGroup = new THREE.Group();
    this.scene.add(this.roadGroup, this.propGroup, this.vehicleGroup);

    this.trackCurve = null;
    this.trackSamples = [];
    this.trackTangents = [];
    this.trackNormals = [];

    this.vehicleVisuals = new Map();
    this.effectsEnabled = false;

    this.host.appendChild(this.renderer.domElement);
    this.setupEnvironment();
    this.setupPostEffects();
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  setupEnvironment() {
    const hemi = new THREE.HemisphereLight(0xe1f0ff, 0x2d4830, 0.9);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xffffff, 1.05);
    sun.position.set(28, 44, 18);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -130;
    sun.shadow.camera.right = 130;
    sun.shadow.camera.top = 130;
    sun.shadow.camera.bottom = -130;
    this.scene.add(sun);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(2400, 2400),
      new THREE.MeshStandardMaterial({ color: 0x2d7138, roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.08;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(900, 32, 16),
      new THREE.MeshBasicMaterial({ color: 0x7eaed7, side: THREE.BackSide })
    );
    this.scene.add(sky);
  }

  setupPostEffects() {
    this.composer = new EffectComposer(this.renderer);
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    const effects = [];
    effects.push(new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC }));
    if (this.config.graphics.bloom) {
      effects.push(new BloomEffect({ intensity: 0.34, luminanceThreshold: 0.52, luminanceSmoothing: 0.2 }));
    }
    if (this.config.graphics.ssao) {
      effects.push(new SSAOEffect(this.camera, undefined, { blendFunction: 20, samples: 12, rings: 4, radius: 0.18, intensity: 1.35 }));
    }
    if (this.config.graphics.vignette) {
      effects.push(new VignetteEffect({ darkness: 0.3, offset: 0.2 }));
    }
    if (this.config.graphics.motionBlur) {
      effects.push(new ChromaticAberrationEffect(new THREE.Vector2(0.0006, 0.0008)));
    }
    if (this.config.graphics.fxaa) {
      effects.push(new FXAAEffect());
      effects.push(new SMAAEffect());
    }

    const pass = new EffectPass(this.camera, ...effects);
    this.composer.addPass(pass);
    this.effectsEnabled = true;
  }

  setTrack(track) {
    while (this.roadGroup.children.length > 0) {
      const child = this.roadGroup.children.pop();
      child.geometry?.dispose?.();
      child.material?.dispose?.();
    }
    while (this.propGroup.children.length > 0) {
      const child = this.propGroup.children.pop();
      child.geometry?.dispose?.();
      if (Array.isArray(child.material)) {
        child.material.forEach((m) => m.dispose?.());
      } else {
        child.material?.dispose?.();
      }
    }

    const points = track.controlPoints.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
    this.trackCurve = new THREE.CatmullRomCurve3(points, true, "catmullrom", 0.25);

    const { geometry, points: samples, tangents, normals } = buildTrackGeometry(this.trackCurve, track.width, 640);
    this.trackSamples = samples;
    this.trackTangents = tangents;
    this.trackNormals = normals;

    const roadMaterial = new THREE.MeshStandardMaterial({ color: 0x494f5c, roughness: 0.92, metalness: 0.06 });
    const road = new THREE.Mesh(geometry, roadMaterial);
    road.receiveShadow = true;
    this.roadGroup.add(road);

    const lineGeom = new THREE.TubeGeometry(this.trackCurve, 640, 0.05, 6, true);
    const line = new THREE.Mesh(
      lineGeom,
      new THREE.MeshStandardMaterial({ color: 0xe9edf5, roughness: 0.8, emissive: 0x111111 })
    );
    line.position.y = 0.05;
    this.roadGroup.add(line);

    for (let i = 0; i < 26; i += 1) {
      const t = i / 26;
      const center = this.trackCurve.getPointAt(t);
      const tangent = this.trackCurve.getTangentAt(t);
      const right = new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();
      const side = i % 2 === 0 ? 1 : -1;
      const sign = createBillboard(i % 3 === 0 ? "BOOST" : (i % 3 === 1 ? "RACE" : "NITRO"), i % 3 === 0 ? "#89e2ff" : "#ffd47c");
      sign.position.copy(center).addScaledVector(right, side * (track.width * 0.7 + 4.8));
      sign.position.y = 2.5;
      sign.lookAt(center.x, 2.5, center.z);
      this.propGroup.add(sign);

      const stand = new THREE.Mesh(
        new THREE.BoxGeometry(7.2, 2.2, 3.4),
        new THREE.MeshStandardMaterial({ color: i % 2 === 0 ? 0x30465d : 0x394e64, roughness: 0.86 })
      );
      stand.position.copy(center).addScaledVector(right, -side * (track.width * 0.7 + 8.2));
      stand.position.y = 1.1;
      stand.castShadow = true;
      stand.receiveShadow = true;
      this.propGroup.add(stand);
    }

    this.hudRefs.track.textContent = track.name;
  }

  createVehicleVisual(id, template, color) {
    const visual = template.clone(true);
    visual.name = id;
    visual.scale.setScalar(0.95);
    visual.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        if (child.material && child.material.color) {
          child.material = child.material.clone();
          child.material.color = child.material.color.clone().lerp(new THREE.Color(color), 0.24);
        }
      }
    });
    this.vehicleGroup.add(visual);
    this.vehicleVisuals.set(id, visual);
    return visual;
  }

  setEnvironmentPreset(preset) {
    if (preset === "sunset") {
      this.scene.background = new THREE.Color(0x8f6d5c);
      this.scene.fog.color = new THREE.Color(0x7d6659);
      this.renderer.toneMappingExposure = 1.12;
    } else {
      this.scene.background = new THREE.Color(0x7faed5);
      this.scene.fog.color = new THREE.Color(0x8fb7d9);
      this.renderer.toneMappingExposure = 1.04;
    }
  }

  findNearestSampleIndex(position, hintIndex) {
    if (this.trackSamples.length === 0) {
      return 0;
    }
    const total = this.trackSamples.length;
    const start = Number.isInteger(hintIndex) ? hintIndex : 0;
    let best = start;
    let bestDist = Infinity;

    for (let offset = -36; offset <= 36; offset += 1) {
      const idx = (start + offset + total) % total;
      const p = this.trackSamples[idx];
      const dx = p.x - position.x;
      const dz = p.z - position.z;
      const d = dx * dx + dz * dz;
      if (d < bestDist) {
        bestDist = d;
        best = idx;
      }
    }

    return best;
  }

  getTrackFrameAtS(s) {
    const safeS = ((s % 1) + 1) % 1;
    const p = this.trackCurve.getPointAt(safeS);
    const tangent = this.trackCurve.getTangentAt(safeS).normalize();
    const right = new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();
    return { point: p, tangent, right };
  }

  updateVehicleVisual(id, state) {
    const visual = this.vehicleVisuals.get(id);
    if (!visual) {
      return;
    }
    visual.position.set(state.position.x, state.position.y, state.position.z);
    visual.rotation.set(0, state.yaw, 0);
  }

  updateCamera(playerState) {
    const yaw = playerState.yaw;
    const followDist = 8.8;
    const followHeight = 4.6;
    const behindX = playerState.position.x - Math.sin(yaw) * followDist;
    const behindZ = playerState.position.z - Math.cos(yaw) * followDist;

    this.camera.position.x += (behindX - this.camera.position.x) * 0.08;
    this.camera.position.y += (playerState.position.y + followHeight - this.camera.position.y) * 0.09;
    this.camera.position.z += (behindZ - this.camera.position.z) * 0.08;

    this.camera.lookAt(playerState.position.x, playerState.position.y + 1.15, playerState.position.z + 0.2);
  }

  updateHud(data) {
    this.hudRefs.speed.textContent = String(Math.round(data.speedKmh)).padStart(3, "0");
    this.hudRefs.lap.textContent = `${data.lap}/${data.totalLaps}`;
    this.hudRefs.position.textContent = `P${data.position}`;
    this.hudRefs.difficulty.textContent = data.difficulty.toUpperCase();
    this.hudRefs.state.textContent = data.state;
    this.hudRefs.bestLap.textContent = data.bestLapText;
  }

  render() {
    if (this.effectsEnabled) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.composer.setSize(width, height);
  }
}
