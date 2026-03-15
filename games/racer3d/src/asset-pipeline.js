import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export class AssetPipeline {
  constructor(manifest) {
    this.manifest = manifest;
    this.loader = new GLTFLoader();
    this.cache = new Map();
  }

  async loadAll() {
    const playerTemplate = await this.loadVehicle("player", 0xff5a43);
    const aiTemplate = await this.loadVehicle("ai", 0x4aa8ff);
    return {
      vehicles: {
        player: playerTemplate,
        ai: aiTemplate
      }
    };
  }

  async loadVehicle(key, fallbackColor) {
    const url = this.manifest && this.manifest.vehicles ? this.manifest.vehicles[key] : "";
    if (!url) {
      return this.createFallbackCar(fallbackColor);
    }

    if (this.cache.has(url)) {
      return this.cloneTemplate(this.cache.get(url), fallbackColor);
    }

    try {
      const gltf = await this.loader.loadAsync(url);
      const scene = gltf.scene || gltf.scenes[0];
      if (!scene) {
        throw new Error("Vehicle model scene is missing.");
      }
      scene.scale.setScalar(0.32);
      scene.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      this.cache.set(url, scene);
      return this.cloneTemplate(scene, fallbackColor);
    } catch (_err) {
      return this.createFallbackCar(fallbackColor);
    }
  }

  cloneTemplate(template, tint) {
    const clone = template.clone(true);
    clone.traverse((child) => {
      if (!child.isMesh || !child.material) {
        return;
      }
      const mat = child.material.clone();
      if (mat.color) {
        mat.color = mat.color.clone().lerp(new THREE.Color(tint), 0.22);
      }
      child.material = mat;
    });
    return clone;
  }

  createFallbackCar(colorHex) {
    const car = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.65, 0.56, 3.1),
      new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.4, metalness: 0.2 })
    );
    body.position.y = 0.58;
    car.add(body);

    const canopy = new THREE.Mesh(
      new THREE.BoxGeometry(1.0, 0.42, 1.4),
      new THREE.MeshStandardMaterial({ color: 0xc8d7ea, roughness: 0.3, metalness: 0.2 })
    );
    canopy.position.set(0, 0.96, -0.2);
    car.add(canopy);

    const brakeLight = new THREE.Mesh(
      new THREE.BoxGeometry(0.72, 0.08, 0.05),
      new THREE.MeshStandardMaterial({ color: 0xed3e4f, emissive: 0x6f151d, emissiveIntensity: 0.8 })
    );
    brakeLight.position.set(0, 0.52, 1.54);
    car.add(brakeLight);

    return car;
  }
}
