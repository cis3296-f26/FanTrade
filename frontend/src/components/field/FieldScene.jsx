import { useRef, useEffect } from "react";
import * as THREE from "three";
import "./FieldScene.css";

// ── Constants ──────────────────────────────────────────────────────────────
const FIELD_W = 53.3;
const FIELD_D = 45;
const LANE_W = FIELD_W / 3;
const LANE_CENTERS = [-LANE_W, 0, LANE_W]; // left, middle, right

// Depth bands: [start, end] in yards from line of scrimmage
const BAND_RANGES = [[0, 5], [5, 10], [10, 15], [15, 20], [20, 30], [30, 40]];

const COLOR_A = 0x3d9f97; // teal (matches --teal)
const COLOR_B = 0xf59e0b; // amber (colorblind-safe contrast with teal)
const COL_W = 6.4;

// Column z-center for a band (field runs in -z direction downfield)
function bandZ(band) {
  const [start, end] = BAND_RANGES[band];
  return -((start + end) / 2);
}

// Column depth (z extent)
function bandLen(band) {
  const [start, end] = BAND_RANGES[band];
  return Math.min((end - start) * 0.7, 6);
}

function makeDepthLabel(text) {
  const canvas = document.createElement("canvas");
  canvas.width = 192;
  canvas.height = 48;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, 192, 48);
  ctx.font = "22px Inter, system-ui, sans-serif";
  ctx.fillStyle = "rgba(245,247,250,0.4)";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 185, 24);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(7, 1.75, 1);
  return sprite;
}

function makeNameSprite(name, color, img) {
  const W = 320, H = 64;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  function draw(image) {
    ctx.clearRect(0, 0, W, H);
    let textX = 160;
    if (image) {
      const size = 48;
      const x = W / 2 - size / 2 - 4;
      ctx.save();
      ctx.beginPath();
      ctx.arc(x + size / 2, H / 2, size / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(image, x, (H - size) / 2, size, size);
      ctx.restore();
      textX = W / 2 + size / 2 + 6;
    }
    ctx.font = "bold 26px Inter, system-ui, sans-serif";
    ctx.fillStyle = `#${color.toString(16).padStart(6, "0")}`;
    ctx.textAlign = image ? "left" : "center";
    ctx.textBaseline = "middle";
    ctx.fillText(name, textX, H / 2);
  }

  draw(img || null);

  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(10, 2, 1);

  // Return a redraw function so callers can update once image loads
  sprite.userData.redraw = (image) => {
    draw(image);
    tex.needsUpdate = true;
  };

  return sprite;
}

function loadHeadshot(id, onLoad) {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => onLoad(img);
  img.onerror = () => onLoad(null);
  img.src = `https://a.espncdn.com/i/headshots/nfl/players/full/${id}.png`;
}

function buildGoalpost(scene) {
  const disposables = [];
  const mat = new THREE.MeshLambertMaterial({ color: 0xf5c842 });
  disposables.push(mat);

  const POST_Z = -FIELD_D;
  const UPRIGHT_H = 10;
  const UPRIGHT_SPREAD = 9.1 / 2; // half the width between uprights (18.5ft / ~2)
  const CROSSBAR_H = 4.5;
  const STEM_H = CROSSBAR_H;
  const R = 0.18;

  function cyl(height, x, y, z) {
    const geo = new THREE.CylinderGeometry(R, R, height, 8);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y + height / 2, z);
    scene.add(mesh);
    disposables.push(geo);
  }

  // Vertical stem from ground to crossbar
  cyl(STEM_H, 0, 0, POST_Z);

  // Crossbar (horizontal, centered)
  const crossW = UPRIGHT_SPREAD * 2 + R * 2;
  const crossGeo = new THREE.CylinderGeometry(R, R, crossW, 8);
  crossGeo.rotateZ(Math.PI / 2);
  const cross = new THREE.Mesh(crossGeo, mat);
  cross.position.set(0, CROSSBAR_H, POST_Z);
  scene.add(cross);
  disposables.push(crossGeo);

  // Left and right uprights
  cyl(UPRIGHT_H, -UPRIGHT_SPREAD, CROSSBAR_H, POST_Z);
  cyl(UPRIGHT_H,  UPRIGHT_SPREAD, CROSSBAR_H, POST_Z);

  return disposables;
}

function buildField(scene) {
  const disposables = [];

  // Ground plane
  const groundGeo = new THREE.PlaneGeometry(FIELD_W, FIELD_D);
  const groundMat = new THREE.MeshLambertMaterial({ color: 0x0d2a0d });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, -FIELD_D / 2);
  scene.add(ground);
  disposables.push(groundGeo, groundMat);

  // Alternating turf stripes every 5 yards
  for (let y = 0; y < FIELD_D; y += 10) {
    const stripeGeo = new THREE.PlaneGeometry(FIELD_W, 5);
    const stripeMat = new THREE.MeshLambertMaterial({ color: 0x0f310f });
    const stripe = new THREE.Mesh(stripeGeo, stripeMat);
    stripe.rotation.x = -Math.PI / 2;
    stripe.position.set(0, 0.01, -(y + 2.5));
    scene.add(stripe);
    disposables.push(stripeGeo, stripeMat);
  }

  // Yard lines every 5 yards
  const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18 });
  disposables.push(lineMat);
  for (let y = 0; y <= FIELD_D; y += 5) {
    const pts = [new THREE.Vector3(-FIELD_W / 2, 0.05, -y), new THREE.Vector3(FIELD_W / 2, 0.05, -y)];
    const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
    scene.add(new THREE.Line(lineGeo, lineMat));
    disposables.push(lineGeo);
  }

  // Line of scrimmage (highlighted)
  const losMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 });
  const losPts = [new THREE.Vector3(-FIELD_W / 2, 0.06, 0), new THREE.Vector3(FIELD_W / 2, 0.06, 0)];
  const losGeo = new THREE.BufferGeometry().setFromPoints(losPts);
  scene.add(new THREE.Line(losGeo, losMat));
  disposables.push(losMat, losGeo);

  // Lane dividers (2 vertical lines dividing 3 lanes)
  const laneMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28 });
  disposables.push(laneMat);
  for (let i = 1; i <= 2; i++) {
    const x = -FIELD_W / 2 + i * LANE_W;
    const laneGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x, 0.05, 0),
      new THREE.Vector3(x, 0.05, -FIELD_D),
    ]);
    scene.add(new THREE.Line(laneGeo, laneMat));
    disposables.push(laneGeo);
  }

  // Depth labels on left edge
  const BAND_LABELS = ["0–5 yds", "5–10", "10–15", "15–20", "20–30", "30+ yds"];
  for (let b = 0; b < 6; b++) {
    const sprite = makeDepthLabel(BAND_LABELS[b]);
    sprite.position.set(-FIELD_W / 2 - 3.5, 0.5, bandZ(b));
    scene.add(sprite);
    disposables.push(sprite.material.map, sprite.material);
  }

  return disposables;
}

function buildColumns(scene, playerSlot) {
  // Returns { meshes: Mesh[18], currentHeights: Float32Array, targetHeights: Float32Array, disposables }
  const color = playerSlot === "A" ? COLOR_A : COLOR_B;
  const xOffset = playerSlot === "A" ? -3.6 : 3.6;
  const disposables = [];
  const meshes = [];
  const currentHeights = new Float32Array(18);
  const targetHeights = new Float32Array(18);

  const mat = new THREE.MeshLambertMaterial({
    color,
    transparent: true,
    opacity: 0.82,
  });
  disposables.push(mat);

  for (let lane = 0; lane < 3; lane++) {
    for (let band = 0; band < 6; band++) {
      const geo = new THREE.BoxGeometry(COL_W, 1, bandLen(band));
      // pivot at bottom: translate so y=0 is the bottom face
      geo.translate(0, 0.5, 0);
      const mesh = new THREE.Mesh(geo, mat);
      const laneX = LANE_CENTERS[lane] + xOffset;
      mesh.position.set(laneX, 0, bandZ(band));
      mesh.visible = false;
      scene.add(mesh);
      meshes.push(mesh);
      disposables.push(geo);
    }
  }

  return { meshes, currentHeights, targetHeights, disposables };
}

function buildFigure(scene, playerSlot, color) {
  const group = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color });

  const bodyGeo = new THREE.CapsuleGeometry(0.45, 1.1, 6, 8);
  const body = new THREE.Mesh(bodyGeo, mat);
  body.position.y = 1.25;
  group.add(body);

  const headGeo = new THREE.SphereGeometry(0.35, 8, 6);
  const head = new THREE.Mesh(headGeo, mat);
  head.position.y = 2.35;
  group.add(head);

  return { group, disposables: [bodyGeo, headGeo, mat] };
}

function buildBall(scene) {
  const geo = new THREE.SphereGeometry(0.22, 8, 6);
  const mat = new THREE.MeshLambertMaterial({ color: 0xc8914a });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.scale.set(1, 1.6, 1);
  mesh.visible = false;
  scene.add(mesh);

  // Shadow disc on the ground directly below the ball
  const shadowGeo = new THREE.CircleGeometry(0.5, 16);
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false });
  const shadow = new THREE.Mesh(shadowGeo, shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  shadow.visible = false;
  scene.add(shadow);

  return { mesh, shadow, disposables: [geo, mat, shadowGeo, shadowMat] };
}

// ── Main component ─────────────────────────────────────────────────────────

export default function FieldScene({
  playerA,
  playerB,
  simState,
  throwAnim,
  catchEvent,
  onAnimFrame,
}) {
  const containerRef = useRef(null);
  const stateRef = useRef(null);
  const onAnimFrameRef = useRef(onAnimFrame);

  // Keep the ref current every render so the render loop always calls the latest callback
  useEffect(() => {
    onAnimFrameRef.current = onAnimFrame;
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // ── WebGL check ──
    const testCanvas = document.createElement("canvas");
    const gl = testCanvas.getContext("webgl2") || testCanvas.getContext("webgl");
    if (!gl) {
      container.innerHTML = '<div class="field-scene-fallback">3D view unavailable — your browser does not support WebGL.</div>';
      return;
    }

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // ── Renderer ──
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x071515, 1);
    container.appendChild(renderer.domElement);

    // ── Scene & lighting ──
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x071515, 55, 110);

    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(10, 30, 10);
    scene.add(dirLight);

    // ── Camera ──
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
    let azimuth = 0.55;
    let polar = 1.0;
    let radius = 72;
    const target = new THREE.Vector3(0, 2, -18);

    function updateCamera() {
      camera.position.set(
        target.x + radius * Math.sin(polar) * Math.sin(azimuth),
        target.y + radius * Math.cos(polar),
        target.z + radius * Math.sin(polar) * Math.cos(azimuth),
      );
      camera.lookAt(target);
    }
    updateCamera();

    // ── Orbit controls (manual) ──
    let pointerDown = false;
    let lastPX = 0, lastPY = 0;

    function onPointerDown(e) {
      pointerDown = true;
      lastPX = e.clientX;
      lastPY = e.clientY;
      container.setPointerCapture(e.pointerId);
    }
    function onPointerMove(e) {
      if (!pointerDown) return;
      const dx = e.clientX - lastPX;
      const dy = e.clientY - lastPY;
      lastPX = e.clientX;
      lastPY = e.clientY;
      azimuth -= dx * 0.006;
      polar = Math.max(0.25, Math.min(1.45, polar - dy * 0.006));
      updateCamera();
    }
    function onPointerUp() { pointerDown = false; }
    function onWheel(e) {
      e.preventDefault();
      radius = Math.max(35, Math.min(110, radius + e.deltaY * 0.08));
      updateCamera();
    }

    container.addEventListener("pointerdown", onPointerDown);
    container.addEventListener("pointermove", onPointerMove);
    container.addEventListener("pointerup", onPointerUp);
    container.addEventListener("pointercancel", onPointerUp);
    container.addEventListener("wheel", onWheel, { passive: false });

    // ── Field ──
    const fieldDisposables = buildField(scene);

    // ── Goalpost ──
    const goalpostDisposables = buildGoalpost(scene);

    // ── Columns ──
    const colsA = buildColumns(scene, "A");
    const colsB = buildColumns(scene, "B");

    // ── Figures ──
    const qbMat = new THREE.MeshLambertMaterial({ color: 0x888888 });
    const qbBodyGeo = new THREE.CapsuleGeometry(0.45, 1.1, 6, 8);
    const qbHeadGeo = new THREE.SphereGeometry(0.35, 8, 6);
    const qbGroup = new THREE.Group();
    const qbBody = new THREE.Mesh(qbBodyGeo, qbMat);
    qbBody.position.set(0, 1.25, 0);
    const qbHead = new THREE.Mesh(qbHeadGeo, qbMat);
    qbHead.position.set(0, 2.35, 0);
    qbGroup.add(qbBody);
    qbGroup.add(qbHead);
    qbGroup.position.set(0, 0, 5.5);
    scene.add(qbGroup);

    const figA = buildFigure(scene, "A", COLOR_A);
    figA.group.position.set(-5, 0, 4);
    scene.add(figA.group);

    const figB = buildFigure(scene, "B", COLOR_B);
    figB.group.position.set(5, 0, 4);
    scene.add(figB.group);

    // ── Ball ──
    const { mesh: ball, shadow: ballShadow, disposables: ballDisp } = buildBall(scene);

    // ── Catch ring pool ──
    const rings = [];
    function spawnRing(pos, color) {
      for (let i = 0; i < 3; i++) {
        const delay = i * 0.09;
        const geo = new THREE.RingGeometry(0.3, 0.6, 32);
        const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.copy(pos);
        mesh.position.y = 0.1;
        scene.add(mesh);
        rings.push({ mesh, geo, mat, elapsed: -delay, duration: 0.55 });
      }
    }

    // ── Resize ──
    function resize() {
      const w = container.clientWidth;
      const h = container.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    // ── Per-frame state (updated via ref from parent) ──
    stateRef.current = {
      prefersReducedMotion,
      colsA, colsB,
      figA, figB,
      ball, ballShadow, rings,
      spawnRing,
      scene,
      homeA: { x: -5, z: 4 },
      homeB: { x: 5, z: 4 },
      returnA: null, // { x, z } target while animating back, null when idle
      returnB: null,
      sprites: { A: null, B: null },
    };

    // ── Render loop ──
    let lastTime = null;
    let rafId;

    function tick(ts) {
      rafId = requestAnimationFrame(tick);
      const dt = lastTime == null ? 0 : Math.min((ts - lastTime) / 1000, 0.05);
      lastTime = ts;

      // Animate column heights
      for (let i = 0; i < 18; i++) {
        const ta = colsA.targetHeights[i];
        const tb = colsB.targetHeights[i];
        colsA.currentHeights[i] += (ta - colsA.currentHeights[i]) * 0.14;
        colsB.currentHeights[i] += (tb - colsB.currentHeights[i]) * 0.14;

        const yA = colsA.currentHeights[i];
        const yB = colsB.currentHeights[i];

        if (yA < 0.06) {
          colsA.meshes[i].visible = false;
        } else {
          colsA.meshes[i].visible = true;
          colsA.meshes[i].scale.y = yA;
        }
        if (yB < 0.06) {
          colsB.meshes[i].visible = false;
        } else {
          colsB.meshes[i].visible = true;
          colsB.meshes[i].scale.y = yB;
        }
      }

      // Animate catch rings
      for (let r = rings.length - 1; r >= 0; r--) {
        const ring = rings[r];
        ring.elapsed += dt;
        if (ring.elapsed < 0) {
          ring.mesh.visible = false;
          continue;
        }
        ring.mesh.visible = true;
        const u = Math.min(ring.elapsed / ring.duration, 1);
        if (u >= 1) {
          scene.remove(ring.mesh);
          ring.geo.dispose();
          ring.mat.dispose();
          rings.splice(r, 1);
        } else {
          const scale = 1 + u * 4;
          ring.mesh.scale.set(scale, scale, scale);
          ring.mat.opacity = 0.7 * Math.pow(1 - u, 1.5);
        }
      }

      if (onAnimFrameRef.current) onAnimFrameRef.current(dt);

      // Lerp figures back to home when returning
      const st = stateRef.current;
      if (st?.returnA) {
        figA.group.position.x += (st.returnA.x - figA.group.position.x) * 0.1;
        figA.group.position.z += (st.returnA.z - figA.group.position.z) * 0.1;
        if (Math.abs(figA.group.position.x - st.returnA.x) < 0.05 && Math.abs(figA.group.position.z - st.returnA.z) < 0.05) {
          figA.group.position.set(st.returnA.x, 0, st.returnA.z);
          st.returnA = null;
        }
      }
      if (st?.returnB) {
        figB.group.position.x += (st.returnB.x - figB.group.position.x) * 0.1;
        figB.group.position.z += (st.returnB.z - figB.group.position.z) * 0.1;
        if (Math.abs(figB.group.position.x - st.returnB.x) < 0.05 && Math.abs(figB.group.position.z - st.returnB.z) < 0.05) {
          figB.group.position.set(st.returnB.x, 0, st.returnB.z);
          st.returnB = null;
        }
      }

      // Keep name sprites above their figures
      const sprites = stateRef.current?.sprites;
      if (sprites?.A) { sprites.A.position.x = figA.group.position.x; sprites.A.position.z = figA.group.position.z; }
      if (sprites?.B) { sprites.B.position.x = figB.group.position.x; sprites.B.position.z = figB.group.position.z; }

      renderer.render(scene, camera);
    }
    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      container.removeEventListener("pointerdown", onPointerDown);
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerup", onPointerUp);
      container.removeEventListener("pointercancel", onPointerUp);
      container.removeEventListener("wheel", onWheel);

      // Dispose everything
      fieldDisposables.forEach((d) => d && d.dispose && d.dispose());
      goalpostDisposables.forEach((d) => d && d.dispose && d.dispose());
      [...colsA.disposables, ...colsB.disposables].forEach((d) => d && d.dispose && d.dispose());
      [...figA.disposables, ...figB.disposables].forEach((d) => d && d.dispose && d.dispose());
      [qbBodyGeo, qbHeadGeo, qbMat].forEach((d) => d.dispose());
      ballDisp.forEach((d) => d.dispose());
      rings.forEach(({ mesh, geo, mat }) => { scene.remove(mesh); geo.dispose(); mat.dispose(); });
      const sr = stateRef.current;
      if (sr?.sprites?.A) { sr.sprites.A.material.map.dispose(); sr.sprites.A.material.dispose(); }
      if (sr?.sprites?.B) { sr.sprites.B.material.map.dispose(); sr.sprites.B.material.dispose(); }
      renderer.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
      stateRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Sync column targets when props change ──
  useEffect(() => {
    const s = stateRef.current;
    if (!s) return;
    if (playerA) {
      for (let i = 0; i < 18; i++) s.colsA.targetHeights[i] = Math.min(playerA.shares[i], 22);
      if (s.sprites.A) { s.scene.remove(s.sprites.A); s.sprites.A.material.map.dispose(); s.sprites.A.material.dispose(); }
      const sp = makeNameSprite(playerA.name, COLOR_A);
      sp.position.copy(s.figA.group.position);
      sp.position.y = 4.2;
      s.scene.add(sp);
      s.sprites.A = sp;
      loadHeadshot(playerA.espn_id, (img) => {
        if (s.sprites.A === sp) sp.userData.redraw(img);
      });
    } else {
      s.colsA.targetHeights.fill(0);
      if (s.sprites.A) { s.scene.remove(s.sprites.A); s.sprites.A.material.map.dispose(); s.sprites.A.material.dispose(); s.sprites.A = null; }
    }
  }, [playerA]);

  useEffect(() => {
    const s = stateRef.current;
    if (!s) return;
    if (playerB) {
      for (let i = 0; i < 18; i++) s.colsB.targetHeights[i] = Math.min(playerB.shares[i], 22);
      if (s.sprites.B) { s.scene.remove(s.sprites.B); s.sprites.B.material.map.dispose(); s.sprites.B.material.dispose(); }
      const sp = makeNameSprite(playerB.name, COLOR_B);
      sp.position.copy(s.figB.group.position);
      sp.position.y = 4.2;
      s.scene.add(sp);
      s.sprites.B = sp;
      loadHeadshot(playerB.espn_id, (img) => {
        if (s.sprites.B === sp) sp.userData.redraw(img);
      });
    } else {
      s.colsB.targetHeights.fill(0);
      if (s.sprites.B) { s.scene.remove(s.sprites.B); s.sprites.B.material.map.dispose(); s.sprites.B.material.dispose(); s.sprites.B = null; }
    }
  }, [playerB]);

  // ── Sync sim column targets ──
  useEffect(() => {
    const s = stateRef.current;
    if (!s) return;
    if (!simState) {
      // Sim was cancelled — restore full distribution and reset figure positions
      if (playerA) {
        for (let i = 0; i < 18; i++) s.colsA.targetHeights[i] = Math.min(playerA.shares[i], 22);
      } else {
        s.colsA.targetHeights.fill(0);
      }
      if (playerB) {
        for (let i = 0; i < 18; i++) s.colsB.targetHeights[i] = Math.min(playerB.shares[i], 22);
      } else {
        s.colsB.targetHeights.fill(0);
      }
      s.returnA = { ...s.homeA };
      s.returnB = { ...s.homeB };
      s.ball.visible = false;
      s.ballShadow.visible = false;
      return;
    }

    const { countsA, countsB, throwsA, throwsB } = simState;
    for (let i = 0; i < 18; i++) {
      s.colsA.targetHeights[i] = throwsA > 0
        ? Math.min((countsA[i] / throwsA) * 100, 22)
        : 0;
      s.colsB.targetHeights[i] = throwsB > 0
        ? Math.min((countsB[i] / throwsB) * 100, 22)
        : 0;
    }
  }, [simState, playerA, playerB]);

  // ── Sync throw animation (ball + receiver) ──
  useEffect(() => {
    const s = stateRef.current;
    if (!s || !throwAnim) {
      if (s) { s.ball.visible = false; s.ballShadow.visible = false; }
      return;
    }

    const { slot, receiverStart, receiverTarget, landingPos, elapsed, duration, reducedMotion } = throwAnim;
    const fig = slot === "A" ? s.figA.group : s.figB.group;

    if (reducedMotion || duration === 0) {
      fig.position.set(landingPos.x, 0, landingPos.z);
      s.ball.visible = false;
      s.ballShadow.visible = false;
      return;
    }

    const u = Math.min(elapsed / duration, 1);
    const ease = 1 - Math.pow(1 - u, 2);

    // Receiver moves with ease-out
    fig.position.set(
      receiverStart.x + (receiverTarget.x - receiverStart.x) * ease,
      0,
      receiverStart.z + (receiverTarget.z - receiverStart.z) * ease,
    );

    // Ball: linear x/z from QB hand, sinusoidal height
    const depth = Math.abs(landingPos.z);
    const qbHand = new THREE.Vector3(0, 2.4, 5.8);
    const ballX = qbHand.x + (landingPos.x - qbHand.x) * u;
    const ballZ = qbHand.z + (landingPos.z - qbHand.z) * u;
    const ballY = 2.4 - 0.6 * u + Math.sin(Math.PI * u) * (2.5 + depth * 0.12);
    s.ball.position.set(ballX, ballY, ballZ);
    s.ball.visible = true;

    // Shadow tracks ball x/z; shrinks and fades as ball rises
    const arcPeak = Math.sin(Math.PI * u);
    const shadowScale = Math.max(0.3, 1 - arcPeak * 0.6);
    s.ballShadow.position.set(ballX, 0.02, ballZ);
    s.ballShadow.scale.set(shadowScale, shadowScale, shadowScale);
    s.ballShadow.material.opacity = 0.45 * shadowScale;
    s.ballShadow.visible = true;

    if (u >= 1) {
      s.ball.visible = false;
      s.ballShadow.visible = false;
    }
  }, [throwAnim]);

  useEffect(() => {
    const s = stateRef.current;
    if (!s || !catchEvent) return;
    const color = catchEvent.slot === "A" ? COLOR_A : COLOR_B;
    s.spawnRing(new THREE.Vector3(catchEvent.x, 0, catchEvent.z), color);
  }, [catchEvent]);

  return (
    <div ref={containerRef} className="field-scene-container" />
  );
}
