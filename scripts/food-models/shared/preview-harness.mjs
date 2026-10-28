/**
 * Shared headless Playwright Three.js visual preview & verification helper for food assets (feat-103..108).
 * Renders 3 angles (front/side/top-iso) of full/partial/empty states + tray & small table fixtures.
 */
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";

export async function renderFoodEvidence({ foodId, fullGlbPath, liteGlbPath, outputDir }) {
  await mkdir(outputDir, { recursive: true });
  const fullBytes = await readFile(resolve(fullGlbPath));
  const liteBytes = await readFile(resolve(liteGlbPath));

  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 960, height: 640 } });
    const page = await context.newPage();

    // Serve local bundle modules via route interception so we need zero external network calls
    await page.route("http://food-preview.local/**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/") {
        await route.fulfill({
          status: 200,
          contentType: "text/html; charset=utf-8",
          body: `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#f4f6fb;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;}canvas{box-shadow:0 8px 24px rgba(30,43,64,0.12);border-radius:12px;}</style>
          <script type="importmap">
          {
            "imports": {
              "three": "http://food-preview.local/three/build/three.module.js",
              "three/addons/": "http://food-preview.local/three/examples/jsm/"
            }
          }
          </script></head><body><script type="module" src="http://food-preview.local/app.js"></script></body></html>`,
        });
        return;
      }
      if (url.pathname.startsWith("/three/")) {
        const rel = url.pathname.replace(/^\/three\//, "node_modules/three/");
        const content = await readFile(resolve(rel));
        await route.fulfill({ status: 200, contentType: "application/javascript", body: content });
        return;
      }
      if (url.pathname === "/model-full.glb") {
        await route.fulfill({ status: 200, contentType: "model/gltf-binary", body: fullBytes });
        return;
      }
      if (url.pathname === "/model-lite.glb") {
        await route.fulfill({ status: 200, contentType: "model/gltf-binary", body: liteBytes });
        return;
      }
      if (url.pathname === "/app.js") {
        await route.fulfill({
          status: 200,
          contentType: "application/javascript",
          body: `
            import * as THREE from "three";
            import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
            import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

            const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
            renderer.setSize(900, 580);
            renderer.setPixelRatio(1);
            renderer.shadowMap.enabled = true;
            document.body.appendChild(renderer.domElement);

            const scene = new THREE.Scene();
            scene.background = new THREE.Color(0xf4f6fb);

            const hemi = new THREE.HemisphereLight(0xffffff, 0xd8dee9, 1.15);
            scene.add(hemi);
            const key = new THREE.DirectionalLight(0xfff8ec, 1.35);
            key.position.set(1.2, 2.2, 1.4);
            key.castShadow = true;
            scene.add(key);

            const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
            const fullGltf = await loader.loadAsync("http://food-preview.local/model-full.glb");
            const liteGltf = await loader.loadAsync("http://food-preview.local/model-lite.glb");

            function setStateVisibility(root, state) {
              const full = root.getObjectByName("FoodFull");
              const partial = root.getObjectByName("FoodPartial");
              const empty = root.getObjectByName("FoodEmpty");
              const vessel = root.getObjectByName("Vessel");
              const utensil = root.getObjectByName("Utensil");
              if (vessel) vessel.visible = true;
              if (utensil) utensil.visible = true;
              if (full) full.visible = state === "full";
              if (partial) partial.visible = state === "partial";
              if (empty) empty.visible = state === "empty";
            }

            window.renderShowcase = (mode) => {
              while (scene.children.length > 2) {
                scene.remove(scene.children[scene.children.length - 1]);
              }
              const cam = new THREE.PerspectiveCamera(32, 900 / 580, 0.05, 10);
              if (mode === "states-3-angles") {
                // Pedestal surface
                const floor = new THREE.Mesh(
                  new THREE.BoxGeometry(1.1, 0.02, 0.5),
                  new THREE.MeshStandardMaterial({ color: 0xe5eaf2, roughness: 0.8 })
                );
                floor.position.set(0, -0.01, 0);
                floor.receiveShadow = true;
                scene.add(floor);

                const states = ["full", "partial", "empty"];
                states.forEach((st, idx) => {
                  const clone = fullGltf.scene.clone(true);
                  setStateVisibility(clone, st);
                  clone.position.set((idx - 1) * 0.32, 0, 0);
                  scene.add(clone);
                });
                cam.position.set(0, 0.36, 0.78);
                cam.lookAt(0, 0.03, 0);
              } else if (mode === "angles-comparison") {
                const floor = new THREE.Mesh(
                  new THREE.BoxGeometry(1.1, 0.02, 0.5),
                  new THREE.MeshStandardMaterial({ color: 0xe5eaf2, roughness: 0.8 })
                );
                floor.position.set(0, -0.01, 0);
                scene.add(floor);

                // Left: front/iso, Center: top-down tilted, Right: lite variant
                const c1 = fullGltf.scene.clone(true);
                setStateVisibility(c1, "full");
                c1.position.set(-0.32, 0, 0);

                const c2 = fullGltf.scene.clone(true);
                setStateVisibility(c2, "full");
                c2.rotation.x = 0.55;
                c2.position.set(0, 0.06, 0);

                const c3 = liteGltf.scene.clone(true);
                setStateVisibility(c3, "full");
                c3.position.set(0.32, 0, 0);

                scene.add(c1, c2, c3);
                cam.position.set(0, 0.28, 0.76);
                cam.lookAt(0, 0.04, 0);
              } else if (mode === "tray-and-table") {
                // Left: serving tray (0.42 x 0.30m) with 2 dishes; Right: small 2-seat table (0.60 x 0.60m) with 2 dishes
                const tray = new THREE.Mesh(
                  new THREE.BoxGeometry(0.42, 0.022, 0.30),
                  new THREE.MeshStandardMaterial({ color: 0x3c4150, roughness: 0.65 })
                );
                tray.position.set(-0.38, 0.011, 0);
                scene.add(tray);

                for (const dx of [-0.095, 0.095]) {
                  const dish = fullGltf.scene.clone(true);
                  setStateVisibility(dish, "full");
                  dish.position.set(-0.38 + dx, 0.022, 0);
                  scene.add(dish);
                }

                const tableTop = new THREE.Mesh(
                  new THREE.BoxGeometry(0.60, 0.04, 0.60),
                  new THREE.MeshStandardMaterial({ color: 0xbd7a45, roughness: 0.65 })
                );
                tableTop.position.set(0.28, 0.02, 0);
                scene.add(tableTop);

                const dNorth = fullGltf.scene.clone(true);
                setStateVisibility(dNorth, "full");
                dNorth.position.set(0.28, 0.04, -0.16);
                dNorth.rotation.y = Math.PI;

                const dSouth = fullGltf.scene.clone(true);
                setStateVisibility(dSouth, "partial");
                dSouth.position.set(0.28, 0.04, 0.16);

                scene.add(dNorth, dSouth);
                cam.position.set(-0.04, 0.62, 0.92);
                cam.lookAt(-0.04, 0.03, 0);
              }
              renderer.render(scene, cam);
              return true;
            };
            window.__foodPreviewReady = true;
          `,
        });
        return;
      }
      await route.abort();
    });

    await page.goto("http://food-preview.local/");
    await page.waitForFunction(() => window.__foodPreviewReady === true, null, { timeout: 15000 });

    const screenshots = {};
    for (const mode of ["states-3-angles", "angles-comparison", "tray-and-table"]) {
      await page.evaluate((m) => window.renderShowcase(m), mode);
      const file = resolve(outputDir, `${foodId}-${mode}.png`);
      await page.locator("canvas").screenshot({ path: file });
      screenshots[mode] = file;
    }
    return screenshots;
  } finally {
    await browser.close();
  }
}
