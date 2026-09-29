import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { firingOffset_deg } from '../physics';
import { PROFILE } from '../engine/profile';
import { BORE, L, PISTON_H, PITCH, R, cylinderX } from './layout';

/**
 * Procedural part geometry. Everything is built from lathes, extrusions and tubes, so every part
 * is ours (no downloaded model) and a single mesh each keeps the draw-call budget small.
 */

const V = (x: number, y: number) => new THREE.Vector2(x, y);
const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Piston: skirt, three ring grooves, dished crown. Origin at the skirt bottom, axis +y. */
export function pistonGeometry() {
  const r = BORE / 2 - 0.02;
  const g = r - 0.018; // groove depth
  const h = PISTON_H;
  const pts = [
    V(r - 0.03, 0),
    V(r, 0.03),
    V(r, h - 0.22),
    V(g, h - 0.215),
    V(g, h - 0.19),
    V(r, h - 0.185),
    V(r, h - 0.15),
    V(g, h - 0.145),
    V(g, h - 0.12),
    V(r, h - 0.115),
    V(r, h - 0.08),
    V(g, h - 0.075),
    V(g, h - 0.05),
    V(r, h - 0.045),
    V(r, h - 0.01),
    V(r - 0.02, h),
    V(r * 0.62, h),
    V(r * 0.45, h - 0.035), // combustion bowl
    V(0.001, h - 0.045),
  ];
  return new THREE.LatheGeometry(pts, 48);
}

/**
 * I-beam connecting rod with big-end and small-end eyes. Origin at the big-end centre, long axis +y,
 * thin along x (it swings in the y-z plane).
 */
export function rodGeometry() {
  const big = 0.2;
  const small = 0.11;
  const s = new THREE.Shape();
  s.moveTo(-big, 0);
  s.absarc(0, 0, big, Math.PI, 2 * Math.PI, false);
  s.lineTo(0.085, 0.34);
  s.lineTo(0.055, L - 0.16);
  s.lineTo(small, L);
  s.absarc(0, L, small, 0, Math.PI, false);
  s.lineTo(-0.055, L - 0.16);
  s.lineTo(-0.085, 0.34);
  s.lineTo(-big, 0);
  const bigHole = new THREE.Path();
  bigHole.absarc(0, 0, 0.125, 0, Math.PI * 2, true);
  const smallHole = new THREE.Path();
  smallHole.absarc(0, L, 0.055, 0, Math.PI * 2, true);
  s.holes.push(bigHole, smallHole);
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: 0.1,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.012,
    bevelSegments: 2,
    curveSegments: 24,
  });
  geo.translate(0, 0, -0.05);
  geo.rotateY(Math.PI / 2); // width → z, thickness → x
  return geo;
}

/**
 * Crank web with its counterweight: a boss around the crank pin and a half-disc opposite it.
 * Origin on the crank axis, +y towards the pin; thin along x.
 */
export function webGeometry() {
  const s = new THREE.Shape();
  s.moveTo(0.2, R);
  s.absarc(0, R, 0.2, 0, Math.PI, false);
  s.lineTo(-0.24, 0);
  s.lineTo(-0.47, 0);
  s.absarc(0, 0, 0.47, Math.PI, 2 * Math.PI, false);
  s.lineTo(0.24, 0);
  s.lineTo(0.2, R);
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: 0.1,
    bevelEnabled: true,
    bevelThickness: 0.01,
    bevelSize: 0.01,
    bevelSegments: 1,
    curveSegments: 20,
  });
  geo.translate(0, 0, -0.05);
  geo.rotateY(Math.PI / 2);
  return geo;
}

/** Poppet valve: head disc + stem. Origin at the valve face, stem up +y. */
export function valveGeometry() {
  return new THREE.LatheGeometry(
    [
      V(0.001, 0),
      V(0.13, 0),
      V(0.13, 0.02),
      V(0.05, 0.07),
      V(0.022, 0.12),
      V(0.022, 0.55),
      V(0.001, 0.56),
    ],
    24,
  );
}

/**
 * Camshaft along x with one eccentric lobe per cylinder. Lobes are oriented so that, when the
 * shaft turns at θ/2, each lobe points down at its valve exactly at peak lift (cycle phase `peak`).
 */
export function camshaftGeometry(peakPhase_deg: number) {
  const parts: THREE.BufferGeometry[] = [];
  const shaft = new THREE.CylinderGeometry(0.045, 0.045, 4 * PITCH + 0.2, 16);
  shaft.rotateZ(Math.PI / 2);
  parts.push(shaft);
  for (const c of [1, 2, 3, 4]) {
    // lobe direction a: rotation.x = θ/2 turns +y by θ/2; "down" is π
    const a = Math.PI - ((firingOffset_deg(c) + peakPhase_deg) * Math.PI) / 360;
    const lobe = new THREE.CylinderGeometry(0.085, 0.085, 0.13, 20);
    lobe.rotateZ(Math.PI / 2);
    lobe.translate(cylinderX(c), 0.035 * Math.cos(a), 0.035 * Math.sin(a));
    parts.push(lobe);
  }
  return mergeGeometries(parts)!;
}

const tube = (pts: THREE.Vector3[], r: number, seg = 40) =>
  new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg, r, 12, false);

/** Exhaust manifold (−z side, behind the engine from the default camera): 4-into-1 and down-pipe. */
export function exhaustGeometry() {
  const runners = [1, 2, 3, 4].map((c) =>
    tube(
      [
        V3(cylinderX(c), 2.72, -0.6),
        V3(cylinderX(c), 2.7, -0.95),
        V3(cylinderX(c) * 0.5, 2.0, -1.15),
        V3(0.35, 1.35, -1.2),
      ],
      0.075,
    ),
  );
  runners.push(tube([V3(0.35, 1.35, -1.2), V3(0.55, 0.6, -1.25), V3(0.9, -0.2, -1.3)], 0.1));
  return mergeGeometries(runners)!;
}

/** Intake (+z side, kept high so it never hides the cylinders): plenum, 4 runners, throttle body. */
export function intakeGeometry() {
  const plenum = new THREE.CylinderGeometry(0.19, 0.19, 4 * PITCH, 24);
  plenum.rotateZ(Math.PI / 2);
  plenum.translate(0, 3.0, 1.05);
  const runners = [1, 2, 3, 4].map((c) =>
    tube(
      [V3(cylinderX(c), 2.72, 0.6), V3(cylinderX(c), 2.86, 0.82), V3(cylinderX(c), 2.98, 1.0)],
      0.07,
      24,
    ),
  );
  const throttle = new THREE.CylinderGeometry(0.15, 0.15, 0.3, 24);
  throttle.rotateZ(Math.PI / 2);
  throttle.translate(-2.1, 3.0, 1.05);
  return mergeGeometries([plenum, ...runners, throttle])!;
}

/** Radiator hoses: top (hot) to the thermostat housing, bottom to the water pump. */
export function hoseGeometry() {
  return mergeGeometries([
    tube(
      [V3(-3.1, 2.25, 0.55), V3(-2.7, 2.6, 0.5), V3(-2.2, 2.75, 0.3), V3(-1.95, 2.72, 0.2)],
      0.07,
    ),
    tube(
      [V3(-3.1, 0.45, -0.55), V3(-2.7, 0.3, -0.5), V3(-2.3, 0.75, -0.35), V3(-2.05, 0.95, -0.3)],
      0.07,
    ),
  ])!;
}

/** Accessory belt around the crank pulley and alternator pulley (plane x = beltX). */
export function beltGeometry(beltX: number) {
  const a = { y: 0, z: 0, r: 0.36 };
  const b = { y: 1.25, z: -0.8, r: 0.18 };
  const pts: THREE.Vector3[] = [];
  const ang = Math.atan2(b.z - a.z, b.y - a.y);
  const arc = (c: typeof a, from: number, to: number) => {
    for (let i = 0; i <= 12; i++) {
      const t = from + ((to - from) * i) / 12;
      pts.push(V3(beltX, c.y + c.r * Math.cos(t), c.z + c.r * Math.sin(t)));
    }
  };
  arc(a, ang + Math.PI / 2, ang + (3 * Math.PI) / 2);
  arc(b, ang - Math.PI / 2, ang + Math.PI / 2);
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 120, 0.025, 8, true);
}

/** Radiator core texture: fine vertical fins crossed by coolant tubes (drawn on a canvas, offline). */
export function finTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#1a2532';
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = '#3a4858';
  ctx.lineWidth = 1;
  for (let x = 0; x < 256; x += 4) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, 256);
    ctx.stroke();
  }
  ctx.fillStyle = '#7f8fa3';
  for (let y = 8; y < 256; y += 24) ctx.fillRect(0, y, 256, 5);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Fan blade: a twisted flat plate (rotated about its own axis for pitch). */
export function bladeGeometry() {
  const g = new THREE.BoxGeometry(0.03, 0.62, 0.24);
  g.translate(0, 0.38, 0);
  return g;
}

export const INTAKE_PEAK = 470; // cycle degrees
export const EXHAUST_PEAK = 250;
export const VALVE_Z = 0.2;
export const DECK_Y = 2.5; // top of the block
export const VALVE_SEAT_Y = DECK_Y - 0.03;
export const LIFT_SCALE = 10; // m → scene units
export const MAX_LIFT = PROFILE.geometry.maxValveLift_m * LIFT_SCALE;
