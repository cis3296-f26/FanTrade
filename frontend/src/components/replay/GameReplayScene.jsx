import { useRef, useEffect, useCallback, useState } from "react";
import * as THREE from "three";
import "./GameReplayScene.css";

// ── Field dimensions (yards) ────────────────────────────────────────────────
const FIELD_W = 53.33;     // 160 feet
const FIELD_LEN = 120;     // 100 yards + two 10-yard end zones
const EZ_LEN = 10;         // end zone length
const PLAY_LEN = 100;      // between goal lines

// Convert yardline_100 (100=own goal line → 0=opp goal line) to world Z
// Home team attacks in +Z direction (left half of field is home end zone)
function yardToZ(yardline_100, posteam, homeTeam) {
  // yardline_100: 100 = possession team's own goal line, 0 = opp goal line
  // We always keep home team starting from Z=-50 (their end zone)
  const attackingHome = posteam === homeTeam;
  const pct = yardline_100 / 100; // 1.0 = own goal line, 0.0 = opp goal line
  if (attackingHome) {
    // Home attacks toward +Z: own goal line at Z=-50, opp at Z=+50
    return -50 + (1 - pct) * 100;
  } else {
    // Away attacks toward -Z: own goal line at Z=+50, opp at Z=-50
    return 50 - (1 - pct) * 100;
  }
}

// ── Team colors (primary, secondary) ────────────────────────────────────────
const TEAM_COLORS = {
  ARI: [0x97233f, 0xffb612], ATL: [0xa71930, 0xa5acaf], BAL: [0x241773, 0x9e7c0c],
  BUF: [0x00338d, 0xc60c30], CAR: [0x0085ca, 0x101820], CHI: [0x0b162a, 0xc83803],
  CIN: [0xfb4f14, 0x000000], CLE: [0x311d00, 0xff3c00], DAL: [0x003594, 0x869397],
  DEN: [0xfb4f14, 0x002244], DET: [0x0076b6, 0xb0b7bc], GB:  [0x203731, 0xffb612],
  HOU: [0x03202f, 0xa71930], IND: [0x002c5f, 0xa2aaad], JAX: [0x006778, 0xd7a22a],
  KC:  [0xe31837, 0xffb81c], LV:  [0x000000, 0xa5acaf], LAC: [0x0080c6, 0xffc20e],
  LA:  [0x003594, 0xffd100], LAR: [0x003594, 0xffd100], MIA: [0x008e97, 0xfc4c02],
  MIN: [0x4f2683, 0xffc62f], NE:  [0x002244, 0xc60c30], NO:  [0xd3bc8d, 0x101820],
  NYG: [0x0b2265, 0xa71930], NYJ: [0x125740, 0x000000], PHI: [0x004c54, 0xa5acaf],
  PIT: [0xffb612, 0x101820], SF:  [0xaa0000, 0xb3995d], SEA: [0x002244, 0x69be28],
  TB:  [0xd50a0a, 0x34302b], TEN: [0x0c2340, 0x4b92db], WAS: [0x5a1414, 0xffb612],
};

function teamColor(abbr, slot) {
  const c = TEAM_COLORS[abbr] || TEAM_COLORS["NE"];
  return c[slot] || c[0];
}

// ── Formation positions ──────────────────────────────────────────────────────
// Returns arrays of {x, z} for 11 offense + 11 defense relative to LOS
// LOS is at z=0, offense is behind (positive z), defense in front (negative z)

function shotgunFormation() {
  return {
    offense: [
      // OL: 5 across the line
      { x: -4, z: 0, role: "OL" }, { x: -2, z: 0, role: "OL" },
      { x: 0, z: 0, role: "C" }, { x: 2, z: 0, role: "OL" },
      { x: 4, z: 0, role: "OL" },
      { x: -7, z: 0, role: "WR" },   // split WR left
      { x: 7, z: 0, role: "WR" },    // split WR right
      { x: 5.5, z: 3, role: "WR" },  // slot WR right
      { x: 0, z: 4.5, role: "QB" },  // shotgun QB
      { x: -1.5, z: 3, role: "RB" }, // offset RB
      { x: 2.5, z: 1, role: "TE" },  // TE on right
    ],
    defense: [
      // DL: 4
      { x: -3, z: -0.8, role: "DL" }, { x: -1, z: -0.8, role: "DL" },
      { x: 1, z: -0.8, role: "DL" }, { x: 3, z: -0.8, role: "DL" },
      // LB: 3
      { x: -2, z: -3, role: "LB" }, { x: 0, z: -3, role: "LB" },
      { x: 2, z: -3, role: "LB" },
      // CB: 2
      { x: -8, z: -1, role: "CB" }, { x: 8, z: -1, role: "CB" },
      // S: 2
      { x: -4, z: -6, role: "S" }, { x: 4, z: -6, role: "S" },
    ],
  };
}

function underCenterFormation() {
  return {
    offense: [
      { x: -4, z: 0, role: "OL" }, { x: -2, z: 0, role: "OL" },
      { x: 0, z: 0, role: "C" }, { x: 2, z: 0, role: "OL" },
      { x: 4, z: 0, role: "OL" },
      { x: -7.5, z: 0, role: "WR" }, { x: 7.5, z: 0, role: "WR" },
      { x: 4.5, z: 1.5, role: "TE" },
      { x: 0, z: 1, role: "QB" },     // under center
      { x: -1, z: 3, role: "RB" }, { x: 1, z: 3, role: "FB" },
    ],
    defense: [
      { x: -3, z: -0.8, role: "DL" }, { x: -1, z: -0.8, role: "DL" },
      { x: 1, z: -0.8, role: "DL" }, { x: 3, z: -0.8, role: "DL" },
      { x: -5, z: -0.7, role: "DE" }, { x: 5, z: -0.7, role: "DE" },
      { x: 0, z: -3, role: "LB" }, { x: -2.5, z: -3.5, role: "LB" },
      { x: -8, z: -1, role: "CB" }, { x: 8, z: -1, role: "CB" },
      { x: 0, z: -7, role: "S" },
    ],
  };
}

function puntFormation() {
  return {
    offense: [
      { x: -3, z: 0, role: "OL" }, { x: -1.5, z: 0, role: "OL" },
      { x: 0, z: 0, role: "C" }, { x: 1.5, z: 0, role: "OL" },
      { x: 3, z: 0, role: "OL" },
      { x: -10, z: 0, role: "WR" }, { x: 10, z: 0, role: "WR" },
      { x: -5, z: 0, role: "OL" }, { x: 5, z: 0, role: "OL" },
      { x: 0, z: 2, role: "LS" },   // long snapper
      { x: 0, z: 8, role: "P" },    // punter
    ],
    defense: [
      { x: -3, z: -0.8, role: "DL" }, { x: -1, z: -0.8, role: "DL" },
      { x: 1, z: -0.8, role: "DL" }, { x: 3, z: -0.8, role: "DL" },
      { x: -7, z: -1, role: "CB" }, { x: 7, z: -1, role: "CB" },
      { x: -10, z: -5, role: "CB" }, { x: 10, z: -5, role: "CB" },
      { x: 0, z: -4, role: "LB" }, { x: -4, z: -8, role: "S" },
      { x: 4, z: -8, role: "S" },
    ],
  };
}

function kickoffFormation() {
  return {
    offense: [
      { x: -16, z: 0, role: "K" },
      ...[-12, -8, -4, 0, 4, 8, 12, 16].map((x) => ({ x, z: 0, role: "KO" })),
      { x: -20, z: 0, role: "KO" }, { x: 20, z: 0, role: "KO" },
    ].slice(0, 11),
    defense: [-20, -10, 0, 10, 20].flatMap(x => [
      { x, z: -20, role: "KR" }, { x: x + 5, z: -28, role: "KR" },
    ]).slice(0, 11),
  };
}

function fieldGoalFormation() {
  return {
    offense: [
      { x: -3, z: 0, role: "OL" }, { x: -1.5, z: 0, role: "OL" },
      { x: 0, z: 0, role: "C" }, { x: 1.5, z: 0, role: "OL" },
      { x: 3, z: 0, role: "OL" },
      { x: -4.5, z: 0, role: "OL" }, { x: 4.5, z: 0, role: "OL" },
      { x: -6, z: 0, role: "OL" }, { x: 6, z: 0, role: "OL" },
      { x: 0, z: 2, role: "H" },    // holder
      { x: 2, z: 4, role: "K" },    // kicker offset
    ],
    defense: [
      { x: -3, z: -0.5, role: "DL" }, { x: -1, z: -0.5, role: "DL" },
      { x: 1, z: -0.5, role: "DL" }, { x: 3, z: -0.5, role: "DL" },
      { x: -5, z: -0.5, role: "DE" }, { x: 5, z: -0.5, role: "DE" },
      { x: 0, z: -2.5, role: "LB" }, { x: -2.5, z: -3, role: "LB" },
      { x: 2.5, z: -3, role: "LB" },
      { x: -8, z: -1, role: "CB" }, { x: 8, z: -1, role: "CB" },
    ],
  };
}

function getFormation(play) {
  const pt = play?.play_type;
  if (!pt) return shotgunFormation();
  if (pt === "kickoff") return kickoffFormation();
  if (pt === "punt") return puntFormation();
  if (pt === "field_goal" || pt === "extra_point") return fieldGoalFormation();
  if (pt === "pass" || pt === "run" || pt === "no_play") {
    return play.shotgun ? shotgunFormation() : underCenterFormation();
  }
  return shotgunFormation();
}

// ── Formation role labels ─────────────────────────────────────────────────────
const OFF_ROLES = ["OL", "OL", "C", "OL", "OL", "WR", "WR", "Slot", "QB", "RB", "TE"];
const DEF_ROLES = ["DL", "DL", "DL", "DL", "LB", "LB", "LB", "CB", "CB", "S", "S"];

function buildRosterMap(plays) {
  const map = new Map();
  for (const p of plays) {
    if (p.passer_id && p.passer_name) map.set(p.passer_id, p.passer_name);
    if (p.receiver_id && p.receiver_name) map.set(p.receiver_id, p.receiver_name);
    if (p.rusher_id && p.rusher_name) map.set(p.rusher_id, p.rusher_name);
  }
  return map;
}

// ── Sprite helpers ───────────────────────────────────────────────────────────
function makeTextSprite(text, opts = {}) {
  const W = opts.width || 256, H = opts.height || 64;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (opts.bg) {
    ctx.fillStyle = opts.bg;
    ctx.roundRect(0, 0, W, H, 8);
    ctx.fill();
  }
  ctx.font = `${opts.bold ? "bold " : ""}${opts.size || 28}px Inter, system-ui, sans-serif`;
  ctx.fillStyle = opts.color || "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, W / 2, H / 2);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  const scale = opts.scale || 8;
  sprite.scale.set(scale, scale * (H / W), 1);
  return { sprite, tex, mat };
}

// ── Build helpers ────────────────────────────────────────────────────────────
function buildFullField(scene) {
  const disp = [];

  // Main playing surface — dark green matching FieldScene
  const surfGeo = new THREE.PlaneGeometry(FIELD_W, FIELD_LEN);
  const surfMat = new THREE.MeshLambertMaterial({ color: 0x0d2a0d });
  const surf = new THREE.Mesh(surfGeo, surfMat);
  surf.rotation.x = -Math.PI / 2;
  scene.add(surf);
  disp.push(surfGeo, surfMat);

  // Alternating 5-yard stripes (subtle)
  for (let i = 0; i < PLAY_LEN / 5; i++) {
    if (i % 2 === 0) continue;
    const sGeo = new THREE.PlaneGeometry(FIELD_W, 5);
    const sMat = new THREE.MeshLambertMaterial({ color: 0x0f310f });
    const sm = new THREE.Mesh(sGeo, sMat);
    sm.rotation.x = -Math.PI / 2;
    sm.position.set(0, 0.005, -50 + 5 + i * 5 + 2.5);
    scene.add(sm);
    disp.push(sGeo, sMat);
  }

  // End zones — dark teal to blend with fog
  for (const [z, color] of [[-55, 0x071e2e], [55, 0x0d1a0d]]) {
    const ezGeo = new THREE.PlaneGeometry(FIELD_W, EZ_LEN);
    const ezMat = new THREE.MeshLambertMaterial({ color });
    const ez = new THREE.Mesh(ezGeo, ezMat);
    ez.rotation.x = -Math.PI / 2;
    ez.position.set(0, 0.003, z);
    scene.add(ez);
    disp.push(ezGeo, ezMat);
  }

  // Yard lines — subtle, matching FieldScene opacity
  const yLineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18 });
  disp.push(yLineMat);
  for (let y = -50; y <= 50; y += 5) {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-FIELD_W / 2, 0.02, y),
      new THREE.Vector3(FIELD_W / 2, 0.02, y),
    ]);
    scene.add(new THREE.Line(geo, yLineMat));
    disp.push(geo);
  }

  // Goal lines — more visible
  const goalMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 });
  disp.push(goalMat);
  for (const z of [-50, 50]) {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-FIELD_W / 2, 0.04, z),
      new THREE.Vector3(FIELD_W / 2, 0.04, z),
    ]);
    scene.add(new THREE.Line(geo, goalMat));
    disp.push(geo);
  }

  // Sideline / end line borders
  const borderMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 });
  disp.push(borderMat);
  const halfW = FIELD_W / 2;
  const corners = [[-halfW, -60], [halfW, -60], [halfW, 60], [-halfW, 60]];
  for (let i = 0; i < 4; i++) {
    const [x1, z1] = corners[i];
    const [x2, z2] = corners[(i + 1) % 4];
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x1, 0.03, z1),
      new THREE.Vector3(x2, 0.03, z2),
    ]);
    scene.add(new THREE.Line(geo, borderMat));
    disp.push(geo);
  }

  // Yard number decals — flat on the surface
  for (let y = -40; y <= 40; y += 10) {
    const num = y === 0 ? "50" : `${Math.abs(y)}`;
    for (const xPos of [-14, 14]) {
      const canvas = document.createElement("canvas");
      canvas.width = 128; canvas.height = 128;
      const ctx = canvas.getContext("2d");
      ctx.font = "bold 80px Inter, system-ui, sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(num, 64, 64);
      const tex = new THREE.CanvasTexture(canvas);
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide });
      const geo = new THREE.PlaneGeometry(4, 4);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(xPos, 0.02, y);
      scene.add(mesh);
      disp.push(geo, mat, tex);
    }
  }

  return disp;
}

function buildGoalpost(scene, z) {
  const disp = [];
  const mat = new THREE.MeshLambertMaterial({ color: 0xf5c842 });
  disp.push(mat);
  const R = 0.2;

  function cyl(h, x, y, zPos) {
    const geo = new THREE.CylinderGeometry(R, R, h, 8);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y + h / 2, zPos);
    scene.add(mesh);
    disp.push(geo);
  }
  // Stem
  cyl(5.5, 0, 0, z);
  // Crossbar
  const crossGeo = new THREE.CylinderGeometry(R, R, 9.14, 8);
  crossGeo.rotateZ(Math.PI / 2);
  const cross = new THREE.Mesh(crossGeo, mat);
  cross.position.set(0, 5.5, z);
  scene.add(cross);
  disp.push(crossGeo);
  // Uprights
  cyl(9, -4.57, 5.5, z);
  cyl(9, 4.57, 5.5, z);
  return disp;
}

function buildStadium(scene) {
  return [];
}

function buildPlayers(scene, offColor, defColor) {
  const TOTAL = 22;
  const bodyGeo = new THREE.CapsuleGeometry(0.4, 1.0, 4, 6);
  const headGeo = new THREE.SphereGeometry(0.3, 6, 4);
  const disp = [];

  const offMat = new THREE.MeshLambertMaterial({ color: offColor });
  const defMat = new THREE.MeshLambertMaterial({ color: defColor });
  const helmOff = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const helmDef = new THREE.MeshLambertMaterial({ color: 0x111111 });
  disp.push(bodyGeo, headGeo, offMat, defMat, helmOff, helmDef);

  // Shared tag materials/geometry pool
  const tagCanvas = document.createElement("canvas");
  tagCanvas.width = 256; tagCanvas.height = 48;
  const tagCtx = tagCanvas.getContext("2d");

  const groups = [];
  for (let i = 0; i < TOTAL; i++) {
    const isOff = i < 11;
    const mat = isOff ? offMat : defMat;
    const helmMat = isOff ? helmOff : helmDef;
    const group = new THREE.Group();

    const body = new THREE.Mesh(bodyGeo, mat);
    body.position.y = 1.15;
    group.add(body);

    const head = new THREE.Mesh(headGeo, helmMat);
    head.position.y = 2.15;
    group.add(head);

    // Name tag sprite above the head
    const tc = document.createElement("canvas");
    tc.width = 256; tc.height = 48;
    const tx = tc.getContext("2d");
    const tex = new THREE.CanvasTexture(tc);
    const tagMat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const tag = new THREE.Sprite(tagMat);
    tag.scale.set(5, 0.94, 1);
    tag.position.y = 3.8;
    tag.visible = false;
    group.add(tag);
    disp.push(tex, tagMat);

    group.userData.tag = tag;
    group.userData.tagCtx = tx;
    group.userData.tagTex = tex;
    group.userData.setTag = function(name) {
      tx.clearRect(0, 0, 256, 48);
      if (!name) { tag.visible = false; return; }
      // Pill background
      tx.fillStyle = "rgba(0,0,0,0.72)";
      const tw = tx.measureText(name).width + 20;
      const px = (256 - Math.min(tw, 250)) / 2;
      tx.beginPath();
      tx.roundRect(px, 6, Math.min(tw, 250), 36, 8);
      tx.fill();
      tx.font = "bold 24px Inter, system-ui, sans-serif";
      tx.fillStyle = "#ffffff";
      tx.textAlign = "center";
      tx.textBaseline = "middle";
      tx.fillText(name, 128, 26);
      tex.needsUpdate = true;
      tag.visible = true;
    };

    group.position.set((i - 11) * 2, 0, 0);
    group.visible = false;
    scene.add(group);
    groups.push({ group, isOff, index: i < 11 ? i : i - 11 });
  }

  return { groups, disp };
}

function buildBallAndMarkers(scene) {
  const disp = [];

  // Football
  const ballGeo = new THREE.SphereGeometry(0.22, 8, 6);
  const ballMat = new THREE.MeshLambertMaterial({ color: 0xc8914a });
  const ball = new THREE.Mesh(ballGeo, ballMat);
  ball.scale.set(1, 1.6, 1);
  ball.position.y = 0.4;
  scene.add(ball);
  disp.push(ballGeo, ballMat);

  // LOS line (blue)
  const losGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-FIELD_W / 2, 0.08, 0),
    new THREE.Vector3(FIELD_W / 2, 0.08, 0),
  ]);
  const losMat = new THREE.LineBasicMaterial({ color: 0x4488ff, transparent: true, opacity: 0.85 });
  const los = new THREE.Line(losGeo, losMat);
  scene.add(los);
  disp.push(losGeo, losMat);

  // First-down line (yellow)
  const fdGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-FIELD_W / 2, 0.09, 0),
    new THREE.Vector3(FIELD_W / 2, 0.09, 0),
  ]);
  const fdMat = new THREE.LineBasicMaterial({ color: 0xffee00, transparent: true, opacity: 0.85 });
  const fd = new THREE.Line(fdGeo, fdMat);
  scene.add(fd);
  disp.push(fdGeo, fdMat);

  // Ball shadow
  const shadowGeo = new THREE.CircleGeometry(0.4, 12);
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false });
  const ballShadow = new THREE.Mesh(shadowGeo, shadowMat);
  ballShadow.rotation.x = -Math.PI / 2;
  ballShadow.position.y = 0.01;
  scene.add(ballShadow);
  disp.push(shadowGeo, shadowMat);

  // Ball-carrier halo ring
  const ringGeo = new THREE.RingGeometry(0.65, 1.0, 32);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd700, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false });
  const carrierRing = new THREE.Mesh(ringGeo, ringMat);
  carrierRing.rotation.x = -Math.PI / 2;
  carrierRing.position.y = 0.03;
  carrierRing.visible = false;
  scene.add(carrierRing);
  disp.push(ringGeo, ringMat);

  return { ball, ballShadow, los, fd, carrierRing, disp };
}

function buildEventOverlay(el) {
  function show(text, color = "#ffffff", bg = null) {
    el.textContent = text;
    el.style.color = color;
    el.style.background = bg || "rgba(0,0,0,0.7)";
    el.style.opacity = "1";
    el.style.transform = "translate(-50%, -50%) scale(1)";
  }
  function hide() {
    el.style.opacity = "0";
    el.style.transform = "translate(-50%, -50%) scale(0.88)";
  }
  function setOpacity(v) { el.style.opacity = String(v); }
  hide();
  return { show, hide, setOpacity, disp: [] };
}

// ── Camera director ──────────────────────────────────────────────────────────
function createCameraDirector(camera) {
  let camAz = Math.PI * 0.5, camPolar = 1.0, camRadius = 85;
  let camTarget = new THREE.Vector3(0, 2, 0);

  let tAz = camAz, tPolar = camPolar, tRadius = camRadius;
  let tTarget = camTarget.clone();

  // Shots:
  // "broadcast"    — near sideline, full-field view
  // "far_sideline" — opposite sideline (~-X), shows whole field from other side
  // "corner"       — diagonal elevated corner view
  // "pov"          — tight low beside QB, near sideline
  // "balltrack"    — sideline tracking the ball in flight
  // "chase"        — tight trailing cam directly behind ball carrier
  // "overhead"     — almost straight down, for punts
  // "endzone"      — behind kicker looking downfield (direction-aware)
  // "fieldgoal"    — low behind ball looking at upright (direction-aware)
  // "spin"         — orbiting victory spin after TD
  let dynamicMode = "broadcast";
  let spinSpeed = 0.9;
  let povOffset = { x: 0 };
  let attackDir = 1;   // +1 or -1 — which direction offense attacks in Z
  let ballPos = new THREE.Vector3(0, 0.4, 0);
  let focusZ = 0;

  function lerpAngle(a, b, t) {
    const diff = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    return a + diff * t;
  }

  function update(dt) {
    const slow = Math.min(dt * 1.5, 0.13);
    const fast = Math.min(dt * 5.0, 0.32);

    // D=1 attacks -Z: downfield Az=0 (camera behind kicker at +Z looking toward -Z)
    // D=-1 attacks +Z: downfield Az=PI (camera at -Z looking toward +Z)
    const downfieldAz = attackDir > 0 ? 0 : Math.PI;
    // Camera behind carrier: D=1 carrier runs to -Z, came from +Z, camera at +Z side
    const chaseAz = attackDir > 0 ? Math.PI * 0.12 : Math.PI * 0.88;

    switch (dynamicMode) {
      case "broadcast": {
        tAz = Math.PI * 0.5;
        tPolar = 1.1;
        tRadius = 32;
        tTarget.set(0, 2, focusZ);
        break;
      }
      case "far_sideline": {
        tAz = -Math.PI * 0.5;
        tPolar = 1.1;
        tRadius = 32;
        tTarget.set(0, 2, focusZ);
        break;
      }
      case "corner_near": {
        tAz = Math.PI * 0.22;
        tPolar = 0.95;
        tRadius = 36;
        tTarget.set(0, 2, focusZ);
        break;
      }
      case "corner_far": {
        tAz = Math.PI * 0.78;
        tPolar = 0.95;
        tRadius = 36;
        tTarget.set(0, 2, focusZ);
        break;
      }
      case "pov": {
        tAz = Math.PI * 0.5;
        tPolar = 1.38;
        tRadius = 18;
        tTarget.set(povOffset.x * 0.25, 1.5, focusZ);
        break;
      }
      case "balltrack": {
        tTarget.set(ballPos.x * 0.15, Math.max(ballPos.y * 0.3 + 1, 2), ballPos.z);
        tAz = Math.PI * 0.5;
        tPolar = 0.92;
        tRadius = 28;
        break;
      }
      case "chase": {
        tAz = chaseAz;
        tPolar = 1.44;
        tRadius = 14;
        tTarget.set(ballPos.x * 0.5, 1.0, ballPos.z);
        break;
      }
      case "overhead": {
        tAz = Math.PI * 0.5;
        tPolar = 0.28;
        tRadius = 55;
        tTarget.set(0, 2, ballPos.z * 0.65 + focusZ * 0.35);
        break;
      }
      case "endzone": {
        tAz = downfieldAz;
        tPolar = 0.92;
        tRadius = 32;
        tTarget.set(0, 2, focusZ);
        break;
      }
      case "fieldgoal": {
        tAz = downfieldAz;
        tPolar = 1.1;
        tRadius = 22;
        tTarget.set(0, 3, focusZ - attackDir * 10);
        break;
      }
      case "spin": {
        tAz += spinSpeed * dt;
        camAz = tAz;
        tPolar = 0.7;
        tRadius = 30;
        tTarget.set(ballPos.x * 0.2, 3, focusZ);
        break;
      }
      default: {
        tAz = Math.PI * 0.5;
        tPolar = 1.1;
        tRadius = 32;
        tTarget.set(0, 2, focusZ);
      }
    }

    const dynamic = dynamicMode === "balltrack" || dynamicMode === "spin" || dynamicMode === "chase";
    const spd = dynamic ? fast : slow;
    camAz = lerpAngle(camAz, tAz, spd);
    camPolar += (tPolar - camPolar) * spd;
    camRadius += (tRadius - camRadius) * spd;
    camTarget.lerp(tTarget, spd);

    camera.position.set(
      camTarget.x + camRadius * Math.sin(camPolar) * Math.sin(camAz),
      camTarget.y + camRadius * Math.cos(camPolar),
      camTarget.z + camRadius * Math.sin(camPolar) * Math.cos(camAz),
    );
    camera.lookAt(camTarget);
  }

  // opts: { attackDir, povOffset }
  function setShot(shot, fz, opts) {
    focusZ = fz || 0;
    dynamicMode = shot;
    spinSpeed = 0.9;
    if (opts?.attackDir !== undefined) attackDir = opts.attackDir;
    if (opts?.povOffset !== undefined) povOffset = opts.povOffset;
  }

  function setBallPos(pos) {
    ballPos.copy(pos);
  }

  function setFocusZ(fz) {
    focusZ = fz;
  }

  return { update, setShot, setBallPos, setFocusZ };
}

// ── Main component ───────────────────────────────────────────────────────────

export default function GameReplayScene({
  game,
  playIndex,
  playing,
  speed,
  spotlightIds,
  homeTeam,
  awayTeam,
}) {
  const containerRef = useRef(null);
  const overlayRef = useRef(null);
  const stateRef = useRef(null);
  const [camMode, setCamMode] = useState("dynamic"); // "dynamic" | "sideline" | "free"
  const propsRef = useRef({ game, playIndex, playing, speed, spotlightIds, homeTeam, awayTeam, camMode });

  useEffect(() => {
    propsRef.current = { game, playIndex, playing, speed, spotlightIds, homeTeam, awayTeam, camMode };
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const testCanvas = document.createElement("canvas");
    const gl = testCanvas.getContext("webgl2") || testCanvas.getContext("webgl");
    if (!gl) {
      container.innerHTML = '<div class="replay-scene-fallback">3D view unavailable — your browser does not support WebGL.</div>';
      return;
    }

    // ── Renderer ──
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x071515, 1);
    container.appendChild(renderer.domElement);

    // ── Scene & lighting ──
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x071515, 90, 160);

    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(10, 30, 10);
    scene.add(dirLight);

    // ── Camera ──
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 400);
    const director = createCameraDirector(camera);
    director.setShot("broadcast", 0);

    // ── Manual orbit (free mode) ──
    let pointerDown = false, lastPX = 0, lastPY = 0;
    let manualAz = Math.PI * 0.5, manualPolar = 1.1, manualRadius = 35;

    function onPointerDown(e) {
      if (propsRef.current.camMode !== "free") return;
      pointerDown = true; lastPX = e.clientX; lastPY = e.clientY;
      container.setPointerCapture(e.pointerId);
    }
    function onPointerMove(e) {
      if (!pointerDown) return;
      const dx = e.clientX - lastPX, dy = e.clientY - lastPY;
      lastPX = e.clientX; lastPY = e.clientY;
      manualAz -= dx * 0.006;
      manualPolar = Math.max(0.2, Math.min(1.5, manualPolar - dy * 0.006));
      camera.position.set(
        manualRadius * Math.sin(manualPolar) * Math.sin(manualAz),
        2 + manualRadius * Math.cos(manualPolar),
        manualRadius * Math.sin(manualPolar) * Math.cos(manualAz),
      );
      camera.lookAt(0, 2, 0);
    }
    function onPointerUp() { pointerDown = false; }
    function onWheel(e) {
      e.preventDefault();
      if (propsRef.current.camMode !== "free") return;
      manualRadius = Math.max(30, Math.min(160, manualRadius + e.deltaY * 0.1));
      camera.position.set(
        manualRadius * Math.sin(manualPolar) * Math.sin(manualAz),
        2 + manualRadius * Math.cos(manualPolar),
        manualRadius * Math.sin(manualPolar) * Math.cos(manualAz),
      );
      camera.lookAt(0, 2, 0);
    }
    container.addEventListener("pointerdown", onPointerDown);
    container.addEventListener("pointermove", onPointerMove);
    container.addEventListener("pointerup", onPointerUp);
    container.addEventListener("pointercancel", onPointerUp);
    container.addEventListener("wheel", onWheel, { passive: false });

    // ── Build scene objects ──
    const props = propsRef.current;
    const hTeam = props.homeTeam || "KC";
    const aTeam = props.awayTeam || "BAL";

    const fieldDisp = buildFullField(scene);
    const gpHomeDisp = buildGoalpost(scene, -60);
    const gpAwayDisp = buildGoalpost(scene, 60);
    const stadiumDisp = buildStadium(scene);

    const offColor = teamColor(aTeam, 0); // away team attacks toward home end initially
    const defColor = teamColor(hTeam, 0);

    const { groups: playerGroups, disp: playerDisp } = buildPlayers(scene, offColor, defColor);
    const { ball, ballShadow, los, fd, carrierRing, disp: markerDisp } = buildBallAndMarkers(scene);
    const overlay = buildEventOverlay(overlayRef.current);

    // Highlight ring for spotlighted players
    const hlRingGeo = new THREE.RingGeometry(0.8, 1.2, 24);
    const hlRingMat = new THREE.MeshBasicMaterial({ color: 0x3d9f97, transparent: true, opacity: 0.75, side: THREE.DoubleSide });
    const hlRings = playerGroups.map(() => {
      const ring = new THREE.Mesh(hlRingGeo, hlRingMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.05;
      ring.visible = false;
      scene.add(ring);
      return ring;
    });

    // ── Scene state ──
    let overlayTimer = 0;
    let lastPlayIndex = -1;

    // Roster map: player id → name, built from all plays once
    const rosterMap = buildRosterMap(props.game?.plays || []);

    // smoothstep easing
    function E(u) { u = Math.max(0, Math.min(1, u)); return u * u * (3 - 2 * u); }

    // S holds all per-play animation state
    let S = null;
    let sceneT = 0; // local scene clock, reset each play

    function yardToWorld(yardline_100, posteam) {
      return yardToZ(yardline_100, posteam, hTeam);
    }

    // Build formation world positions for a play
    function buildFormation(play) {
      const form = getFormation(play);
      const plos = yardToWorld(play.yardline_100 || 50, play.posteam);
      const D = play.posteam === hTeam ? 1 : -1;

      // Pad to exactly 11 so we never get undefined at index i
      const fallbackOff = { x: 0, z: 0 };
      const fallbackDef = { x: 0, z: -2 };
      const offSrc = form.offense.slice(0, 11);
      const defSrc = form.defense.slice(0, 11);
      while (offSrc.length < 11) offSrc.push(fallbackOff);
      while (defSrc.length < 11) defSrc.push(fallbackDef);

      const offPos = offSrc.map(pos => ({ x: pos.x, z: plos + pos.z * D }));
      const defPos = defSrc.map(pos => ({ x: pos.x, z: plos + pos.z * D }));
      return { offPos, defPos, plos, D };
    }

    // Clamp world Z to field bounds
    function clampZ(z) { return Math.max(-58, Math.min(58, z)); }

    // Assign name tags to all 22 player models for the current play
    function assignPlayNames(play, offGrps, defGrps) {
      const recSlot = play.pass_location === "left" ? 5 : (play.pass_location === "right" ? 6 : 7);
      // Reset all highlight rings
      hlRings.forEach(r => { r.visible = false; });
      offGrps.forEach((g, i) => {
        let name = OFF_ROLES[i] || "OL";
        let highlight = false;
        if (i === 8 && play.passer_name) { name = play.passer_name; highlight = true; }
        else if (i === 9 && play.rusher_name) { name = play.rusher_name; highlight = true; }
        else if (i === recSlot && play.receiver_name) { name = play.receiver_name; highlight = true; }
        g.group.userData.setTag?.(name);
        g.group.userData.highlighted = highlight;
      });
      defGrps.forEach((g, i) => {
        g.group.userData.setTag?.(DEF_ROLES[i] || "DEF");
        g.group.userData.highlighted = false;
      });
    }

    // Build the play-action animation closure for the current play
    function buildAct(play, offGrps, defGrps, offHome, defHome) {
      const plos = yardToWorld(play.yardline_100 || 50, play.posteam);
      const D = play.posteam === hTeam ? 1 : -1;
      const yg = play.yards_gained || 0;
      const endZ = clampZ(plos + yg * D);
      const pt = play.play_type;

      // Helpers
      function hOff(i) { return offHome[i]; }
      function hDef(i) { return defHome[i]; }
      function mvGroup(grp, from, tx, tz, w) {
        grp.group.position.x = from.x + (tx - from.x) * w;
        grp.group.position.z = from.z + (tz - from.z) * w;
      }
      function base() {
        offGrps.forEach((g, i) => { g.group.position.x = hOff(i).x; g.group.position.z = hOff(i).z; });
        defGrps.forEach((g, i) => { g.group.position.x = hDef(i).x; g.group.position.z = hDef(i).z; });
      }
      function setBall(x, y, z) {
        ball.position.set(x, y, z);
        ballShadow.position.set(x, 0.01, z);
      }
      function setShadowScale(s) {
        ballShadow.scale.set(s, s, s);
        ballShadow.material.opacity = 0.4 * s;
      }
      function setCarrier(grp) {
        carrierRing.visible = true;
        carrierRing.position.x = grp.group.position.x;
        carrierRing.position.z = grp.group.position.z;
      }
      function clearCarrier() {
        carrierRing.visible = false;
      }
      // Dissolve ball to nothing starting at dissolveU over a 0.12 window
      function dissolveBall(u, dissolveU) {
        if (u < dissolveU) return;
        const t = Math.min((u - dissolveU) / 0.12, 1);
        const s = 1 - t;
        ball.scale.set(s, s * 1.6, s);
        ballShadow.material.opacity = 0.4 * s;
        if (t >= 1) { ball.visible = false; ballShadow.visible = false; }
      }

      if (pt === "pass") {
        const recIdx = play.pass_location === "left" ? 5 : (play.pass_location === "right" ? 6 : 7);
        const qbIdx = 8;
        const qbX = hOff(qbIdx).x;
        const qbZ = hOff(qbIdx).z;
        const dropZ = qbZ - D * 2;
        const catchZ = clampZ(plos + (play.air_yards || yg) * D);
        const catchX = hOff(recIdx).x;
        const airDist = Math.abs(catchZ - dropZ);
        const dur = 1.8 + airDist * 0.025;
        // arc completes at u = 0.18 + 0.67 = 0.85; dissolve starts there
        const catchU = 0.85;

        return {
          dur,
          upd(u) {
            base();
            for (let i = 0; i < 5; i++) {
              mvGroup(offGrps[i], hOff(i), hOff(i).x, hOff(i).z - D * 1.2, E(u / 0.5));
            }
            const qbW = E(Math.min(u / 0.12, 1));
            mvGroup(offGrps[qbIdx], hOff(qbIdx), qbX, dropZ, qbW);
            mvGroup(offGrps[recIdx], hOff(recIdx), catchX, catchZ, E(u / 0.75));

            if (u < 0.18) {
              const qbCurZ = qbZ + (dropZ - qbZ) * E(Math.min(u / 0.12, 1));
              setBall(qbX, 0.4, qbCurZ);
              setShadowScale(1);
              setCarrier(offGrps[qbIdx]);
            } else {
              const f = Math.min((u - 0.18) / 0.67, 1);
              if (f < 1) {
                const bx = qbX + (catchX - qbX) * f;
                const bz = dropZ + (catchZ - dropZ) * f;
                const arcH = Math.sin(Math.PI * f) * Math.max(3, airDist * 0.1);
                setBall(bx, 0.4 + arcH, bz);
                const ss = Math.max(0.3, 1 - Math.sin(Math.PI * f) * 0.7);
                setShadowScale(ss);
                clearCarrier(); // ball in air, no carrier ring
              } else {
                // landed — dissolve ball, ring moves to receiver
                setBall(catchX, 0.4, catchZ);
                setShadowScale(1);
                dissolveBall(u, catchU);
                setCarrier(offGrps[recIdx]);
              }
            }

            defGrps.slice(0, 4).forEach((g, i) => {
              mvGroup(g, hDef(i), hDef(i).x, dropZ, E(Math.min(u / 0.6, 1)) * 0.65);
            });
            if (u > 0.3) {
              const w3 = E((u - 0.3) / 0.7);
              defGrps.slice(4).forEach((g, i) => {
                mvGroup(g, hDef(i + 4), catchX, catchZ, w3 * 0.5);
              });
            }
          },
        };

      } else if (pt === "run") {
        const rbIdx = 9;
        const endX = hOff(rbIdx).x;
        const dur = 1.6 + Math.abs(yg) * 0.05;

        return {
          dur,
          upd(u) {
            base();
            for (let i = 0; i < 5; i++) {
              mvGroup(offGrps[i], hOff(i), hOff(i).x, hOff(i).z - D * 1.5, E(u / 0.7));
            }
            const rbW = E(Math.max(0, (u - 0.08) / 0.92));
            mvGroup(offGrps[rbIdx], hOff(rbIdx), endX, endZ, rbW);
            const rp = offGrps[rbIdx].group.position;
            setBall(rp.x, 0.4, rp.z);
            setShadowScale(1);
            setCarrier(offGrps[rbIdx]);
            const w = E(u / 0.65);
            defGrps.forEach((g, i) => {
              mvGroup(g, hDef(i), rp.x, rp.z, w * 0.5);
            });
          },
        };

      } else if (pt === "punt") {
        const punterIdx = 10;
        const kd = play.kick_distance || 45;
        const landZ = clampZ(plos - kd * D);
        const dur = 1.8 + kd * 0.02;

        return {
          dur,
          upd(u) {
            base();
            clearCarrier();
            const f = E(u);
            const arcH = Math.sin(Math.PI * u) * Math.min(24, kd * 0.4);
            setBall(0, 0.4 + arcH, plos + (landZ - plos) * f);
            setShadowScale(Math.max(0.25, 1 - Math.sin(Math.PI * u) * 0.75));
            dissolveBall(u, 0.88);
            const w = E(u);
            offGrps.forEach((g, i) => {
              if (i === punterIdx) return;
              mvGroup(g, hOff(i), hOff(i).x, landZ, w * 0.8);
            });
            defGrps.forEach((g, i) => {
              mvGroup(g, hDef(i), hDef(i).x, landZ, w * 0.5);
            });
          },
        };

      } else if (pt === "kickoff") {
        const kd = play.kick_distance || 65;
        const landZ = clampZ(plos - kd * D);
        const dur = 2.0;

        return {
          dur,
          upd(u) {
            base();
            clearCarrier();
            const f = E(u);
            const arcH = Math.sin(Math.PI * u) * Math.min(28, kd * 0.35);
            setBall(0, 0.4 + arcH, plos + (landZ - plos) * f);
            setShadowScale(Math.max(0.2, 1 - Math.sin(Math.PI * u) * 0.8));
            dissolveBall(u, 0.88);
            const w = E(u);
            offGrps.forEach((g, i) => { mvGroup(g, hOff(i), hOff(i).x, landZ, w * 0.9); });
            defGrps.forEach((g, i) => { mvGroup(g, hDef(i), hDef(i).x, landZ, w * 0.6); });
          },
        };

      } else if (pt === "field_goal" || pt === "extra_point") {
        const goalZ = D > 0 ? 60 : -60;
        const kickerIdx = 10;
        const dur = 2.2;

        return {
          dur,
          upd(u) {
            base();
            clearCarrier();
            const kz = hOff(kickerIdx).z;
            if (u < 0.3) {
              setBall(0, 0.4, kz);
              setShadowScale(1);
            } else {
              const g2 = (u - 0.3) / 0.7;
              const arcH = Math.sin(Math.PI * g2) * 8 + g2 * 5;
              setBall(0, 0.4 + arcH, kz + (goalZ - kz) * g2);
              setShadowScale(Math.max(0.2, 1 - Math.sin(Math.PI * g2) * 0.8));
              dissolveBall(u, 0.92);
            }
          },
        };

      } else {
        return {
          dur: 1.0,
          upd(u) {
            base();
            clearCarrier();
            setBall(0, 0.4, plos);
            setShadowScale(1);
          },
        };
      }
    }

    // Called when playIndex changes — capture from-positions and build new S
    function initPlay(play, isFirst) {
      if (!play) return;
      const { offPos, defPos, plos, D } = buildFormation(play);
      const ydstogo = play.ydstogo || 10;
      const fdTarget = clampZ(plos + ydstogo * D);

      // Assign player groups to the two teams
      // offGrps = first 11 playerGroups, defGrps = next 11
      const offGrps = playerGroups.slice(0, 11);
      const defGrps = playerGroups.slice(11, 22);

      // "home" positions (formation targets) as plain {x,z}
      const offHome = offPos;
      const defHome = defPos;

      // "from" positions captured right now
      const offFrom = offGrps.map(g => ({ x: g.group.position.x, z: g.group.position.z }));
      const defFrom = defGrps.map(g => ({ x: g.group.position.x, z: g.group.position.z }));
      const ballFrom = { x: ball.position.x, z: ball.position.z };
      const losPrev = los.position.z;
      const fdPrev = fd.position.z;

      // Compute max travel distance to set pre duration
      let maxDist = 0;
      offFrom.forEach((f, i) => {
        const dx = offHome[i].x - f.x, dz = offHome[i].z - f.z;
        maxDist = Math.max(maxDist, Math.sqrt(dx * dx + dz * dz));
      });
      defFrom.forEach((f, i) => {
        const dx = defHome[i].x - f.x, dz = defHome[i].z - f.z;
        maxDist = Math.max(maxDist, Math.sqrt(dx * dx + dz * dz));
      });
      const preDur = isFirst ? 0 : Math.max(0.5, Math.min(2.0, 0.4 + maxDist * 0.035));

      // Assign name tags to all 22 models for this play
      assignPlayNames(play, offGrps, defGrps);

      // Set player/rotation visibility
      const attackDir = D;
      offGrps.forEach((g, i) => {
        g.group.visible = true;
        g.group.rotation.y = attackDir > 0 ? 0 : Math.PI;
      });
      defGrps.forEach((g, i) => {
        g.group.visible = true;
        g.group.rotation.y = attackDir > 0 ? Math.PI : 0;
      });

      const pl = buildAct(play, offGrps, defGrps, offHome, defHome);

      S = {
        play, plos, D,
        offGrps, defGrps,
        offHome, defHome,
        offFrom, defFrom,
        ballFrom,
        ballHome: { x: 0, z: plos },
        losPrev, losCur: plos,
        fdPrev, fdCur: fdTarget,
        hasFd: !!play.ydstogo,
        preDur,
        pl,
        done: false,
        actionStarted: false,
      };

      if (isFirst) {
        // Snap immediately: no lerp
        offGrps.forEach((g, i) => { g.group.position.x = offHome[i].x; g.group.position.z = offHome[i].z; });
        defGrps.forEach((g, i) => { g.group.position.x = defHome[i].x; g.group.position.z = defHome[i].z; });
        ball.position.set(0, 0.4, plos);
        ballShadow.position.set(0, 0.01, plos);
        los.position.z = plos;
        fd.position.z = fdTarget;
        fd.visible = S.hasFd;
      }
    }

    function getEventText(play) {
      if (!play) return null;
      if (play.touchdown) {
        const who = play.receiver_name || play.rusher_name || play.passer_name || "";
        return { text: `TOUCHDOWN! ${who}`.trim(), color: "#ffee00", bg: "rgba(30,100,30,0.85)" };
      }
      if (play.field_goal_result === "made") return { text: "FIELD GOAL IS GOOD", color: "#ffee00", bg: "rgba(10,50,10,0.85)" };
      if (play.field_goal_result === "missed") return { text: "FIELD GOAL NO GOOD", color: "#ff4444", bg: "rgba(60,10,10,0.8)" };
      if (play.field_goal_result === "blocked") return { text: "FIELD GOAL BLOCKED!", color: "#ff4444", bg: "rgba(60,10,10,0.8)" };
      if (play.interception) return { text: "INTERCEPTION!", color: "#ff8800", bg: "rgba(60,30,0,0.8)" };
      if (play.fumble_lost) return { text: "FUMBLE RECOVERED!", color: "#ff8800", bg: "rgba(60,30,0,0.8)" };
      if (play.sack) return { text: "SACK!", color: "#ff4444", bg: "rgba(50,0,0,0.8)" };
      if (play.extra_point_result === "good") return { text: "EXTRA POINT GOOD", color: "#aaffaa", bg: null };
      return null;
    }

    function chooseInitialShot(play) {
      if (!play) return "broadcast";
      if (play.touchdown) return "spin";
      if (play.play_type === "kickoff") return "endzone";
      if (play.play_type === "field_goal" || play.play_type === "extra_point") return "fieldgoal";
      if (play.play_type === "punt") return "overhead";
      if (play.play_type === "pass") return "pov";
      if (play.play_type === "run") return "chase";
      if (play.sack) return "pov";
      return "broadcast";
    }

    // ── Resize ──
    function resize() {
      const w = container.clientWidth, h = container.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    // ── Render loop ──
    let lastTs = null;
    let rafId;

    // Init first play immediately
    const firstPlay = propsRef.current.game?.plays?.[0];
    if (firstPlay) {
      initPlay(firstPlay, true);
      sceneT = S.preDur; // skip pre phase on first load
    }

    let lastCamMode = "dynamic";

    function tick(ts) {
      rafId = requestAnimationFrame(tick);
      const dt = lastTs == null ? 0 : Math.min((ts - lastTs) / 1000, 0.05);
      lastTs = ts;

      const p = propsRef.current;
      const currentPlay = p.game?.plays?.[p.playIndex];

      // Camera mode changed — re-apply shot so director has a good starting point
      if (p.camMode !== lastCamMode) {
        lastCamMode = p.camMode;
        if (p.camMode !== "free" && currentPlay) {
          const fz = yardToWorld(currentPlay.yardline_100 || 50, currentPlay.posteam);
          const D = currentPlay.posteam === hTeam ? 1 : -1;
          if (p.camMode === "dynamic") director.setShot(chooseInitialShot(currentPlay), fz, { attackDir: D });
          else director.setShot("broadcast", fz, { attackDir: D });
        }
      }

      // Play index changed — re-init
      if (p.playIndex !== lastPlayIndex) {
        lastPlayIndex = p.playIndex;
        sceneT = 0;
        initPlay(currentPlay, false);

        const fz = currentPlay ? yardToWorld(currentPlay.yardline_100 || 50, currentPlay.posteam) : 0;
        const D = currentPlay ? (currentPlay.posteam === hTeam ? 1 : -1) : 1;
        if (p.camMode === "dynamic") {
          const shot = chooseInitialShot(currentPlay);
          const qbX = S?.offHome?.[8]?.x || 0;
          director.setShot(shot, fz, { attackDir: D, povOffset: { x: qbX } });
        } else if (p.camMode === "sideline") {
          director.setShot("broadcast", fz, { attackDir: D });
        }
      }

      // Advance scene time when playing
      if (p.playing) sceneT += dt * p.speed;

      if (S && currentPlay) {
        if (sceneT < S.preDur) {
          // ── Pre phase: all players slide to formation ──
          const k = S.preDur > 0 ? E(sceneT / S.preDur) : 1;
          S.offGrps.forEach((g, i) => {
            g.group.position.x = S.offFrom[i].x + (S.offHome[i].x - S.offFrom[i].x) * k;
            g.group.position.z = S.offFrom[i].z + (S.offHome[i].z - S.offFrom[i].z) * k;
          });
          S.defGrps.forEach((g, i) => {
            g.group.position.x = S.defFrom[i].x + (S.defHome[i].x - S.defFrom[i].x) * k;
            g.group.position.z = S.defFrom[i].z + (S.defHome[i].z - S.defFrom[i].z) * k;
          });
          // Ball stays put during pre phase — only moves during action
          ball.visible = true;
          ball.scale.set(1, 1.6, 1);
          ball.position.set(S.ballFrom.x, 0.4, S.ballFrom.z);
          ballShadow.visible = true;
          ballShadow.position.set(ball.position.x, 0.01, ball.position.z);
          ballShadow.scale.set(1, 1, 1);
          ballShadow.material.opacity = 0.4;
          carrierRing.visible = false;
          los.position.z = S.losPrev + (S.losCur - S.losPrev) * k;
          fd.position.z = S.fdPrev + (S.fdCur - S.fdPrev) * k;
          fd.visible = S.hasFd;

        } else {
          // ── Action phase ──
          // Ensure ball is visible and full-size at the start of each action phase
          if (!S.actionStarted) {
            S.actionStarted = true;
            ball.visible = true;
            ball.scale.set(1, 1.6, 1);
            ballShadow.visible = true;
            ballShadow.scale.set(1, 1, 1);
          }
          const actT = sceneT - S.preDur;
          const u = S.pl.dur > 0 ? Math.min(actT / S.pl.dur, 1) : 1;
          S.pl.upd(u);
          los.position.z = S.losCur;
          fd.position.z = S.fdCur;
          fd.visible = S.hasFd;

          if (u >= 1 && !S.done) {
            S.done = true;
            const ev = getEventText(currentPlay);
            if (ev) {
              overlay.show(ev.text, ev.color, ev.bg);
              overlayTimer = 2.5;
            } else {
              overlay.hide();
              overlayTimer = 0;
            }
          }
        }
      }

      // Overlay fade
      if (overlayTimer > 0) {
        overlayTimer -= dt;
        if (overlayTimer <= 0.5) overlay.setOpacity(Math.max(0, overlayTimer / 0.5));
        if (overlayTimer <= 0) overlay.hide();
      }

      // Update highlight rings — follow named players
      playerGroups.forEach((g, i) => {
        const ring = hlRings[i];
        if (g.group.userData.highlighted && g.group.visible) {
          ring.visible = true;
          ring.position.x = g.group.position.x;
          ring.position.z = g.group.position.z;
        } else {
          ring.visible = false;
        }
      });

      // Camera update
      const mode = p.camMode;
      if (mode === "free") {
        // updated by pointer/wheel handlers only
      } else if (mode === "sideline") {
        if (S) director.setFocusZ(S.losCur);
        director.update(dt);
      } else {
        // Dynamic mode — feed ball position, drive per-phase shot transitions
        director.setBallPos(ball.position);
        if (S && currentPlay) {
          const actT = sceneT - S.preDur;
          const u = S.pl.dur > 0 ? Math.min(actT / S.pl.dur, 1) : 1;
          const pt = currentPlay.play_type;
          const D = S.D;
          const plos = S.plos;
          // Use playIndex parity for shot variety so consecutive plays don't look identical
          const even = (p.playIndex % 2 === 0);
          const mod3 = p.playIndex % 3;
          const airYards = currentPlay.air_yards || 0;

          if (currentPlay.touchdown && S.done) {
            // Victory spin over the landing spot
            director.setFocusZ(ball.position.z);
          } else if (pt === "pass") {
            if (sceneT < S.preDur || u < 0.20) {
              // Pre-snap + dropback: tight POV beside QB from near sideline
              director.setShot("pov", plos, { attackDir: D, povOffset: { x: S.offHome?.[8]?.x || 0 } });
            } else if (u < 0.82) {
              // Ball in air:
              //   short/mid air → sideline balltrack
              //   deep air (>12 yards) → elevated corner so ball travels diagonally across frame
              if (airYards > 12) {
                const corner = even ? "corner_near" : "corner_far";
                director.setShot(corner, plos, { attackDir: D });
              } else {
                director.setShot("balltrack", plos, { attackDir: D });
              }
            } else {
              // After catch: opposite sideline pull-out for variety
              const post = even ? "far_sideline" : "broadcast";
              director.setShot(post, ball.position.z, { attackDir: D });
            }
          } else if (pt === "run") {
            // Alternate: chase (tight behind carrier) vs far_sideline vs broadcast
            if (mod3 === 0) {
              director.setShot("chase", plos, { attackDir: D });
              director.setFocusZ(ball.position.z);
            } else if (mod3 === 1) {
              director.setShot("far_sideline", ball.position.z, { attackDir: D });
            } else {
              director.setShot("broadcast", ball.position.z, { attackDir: D });
            }
          } else if (pt === "punt") {
            if (u < 0.42) {
              director.setShot("overhead", plos, { attackDir: D });
            } else {
              director.setShot("balltrack", plos, { attackDir: D });
            }
          } else if (pt === "kickoff") {
            if (u < 0.12) {
              // Very brief endzone shot behind kicker at the kick
              director.setShot("endzone", plos, { attackDir: D });
            } else {
              // Switch to sideline balltrack to follow the ball
              director.setShot("balltrack", plos, { attackDir: D });
            }
          } else if (pt === "field_goal" || pt === "extra_point") {
            if (u < 0.28) {
              director.setShot("fieldgoal", plos, { attackDir: D });
            } else {
              director.setShot("balltrack", plos, { attackDir: D });
            }
          } else {
            // no_play, timeout, etc — sit at broadcast tracking LOS
            director.setShot(even ? "broadcast" : "far_sideline", plos, { attackDir: D });
            director.setFocusZ(S.losCur);
          }
        }
        director.update(dt);
      }
      renderer.render(scene, camera);
    }
    rafId = requestAnimationFrame(tick);

    stateRef.current = { scene, overlay, playerGroups, hlRings };

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      container.removeEventListener("pointerdown", onPointerDown);
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerup", onPointerUp);
      container.removeEventListener("pointercancel", onPointerUp);
      container.removeEventListener("wheel", onWheel);

      fieldDisp.forEach(d => d?.dispose?.());
      gpHomeDisp.forEach(d => d?.dispose?.());
      gpAwayDisp.forEach(d => d?.dispose?.());
      stadiumDisp.forEach(d => d?.dispose?.());
      playerDisp.forEach(d => d?.dispose?.());
      markerDisp.forEach(d => d?.dispose?.());
      overlay.disp.forEach(d => d?.dispose?.());
      hlRings.forEach(r => scene.remove(r));
      hlRingGeo.dispose(); hlRingMat.dispose();

      renderer.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
      stateRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={containerRef} className={`replay-scene-container${camMode === "free" ? " replay-scene-container--free" : ""}`}>
      <div ref={overlayRef} className="replay-event-overlay" />
      <div className="replay-cam-controls">
        {[["dynamic", "Dynamic"], ["sideline", "Sideline"], ["free", "Free"]].map(([mode, label]) => (
          <button
            key={mode}
            className={`replay-cam-btn${camMode === mode ? " replay-cam-btn--active" : ""}`}
            onClick={() => setCamMode(mode)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
