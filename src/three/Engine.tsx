import { useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { PROFILE } from '../engine/profile';
import {
  combustionGlow,
  cyclePhase_deg,
  rpmToRadps,
  secondaryAccel_ms2,
  valveLift_m,
} from '../physics';
import { useSim } from '../ui/sim/simClient';
import { color, scoreStatus, type Status } from '../ui/tokens';
import { calloutEls } from './callouts';
import {
  BORE,
  PISTON_H,
  PIN_TO_CROWN,
  PITCH,
  R,
  cylinderPose,
  cylinderX,
  heatColor,
} from './layout';
import {
  DECK_Y,
  EXHAUST_PEAK,
  INTAKE_PEAK,
  LIFT_SCALE,
  VALVE_SEAT_Y,
  VALVE_Z,
  beltGeometry,
  bladeGeometry,
  camshaftGeometry,
  exhaustGeometry,
  finTexture,
  hoseGeometry,
  intakeGeometry,
  pistonGeometry,
  rodGeometry,
  valveGeometry,
  webGeometry,
} from './geometry';

export type PartId = 'oilPump' | 'radiator';

const CYLS = [1, 2, 3, 4] as const;
const BELT_X = -2.3;
const BLOCK_W = 4 * PITCH + 0.3;
const v3 = new THREE.Vector3();
const STATUS_HEX: Record<Status, string> = {
  ok: color.ok,
  watch: color.watch,
  warn: color.warn,
  crit: color.crit,
  invalid: color.invalid,
};

/* ---------- geometry (built once) ---------- */
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const edges = (g: THREE.BufferGeometry) => new THREE.EdgesGeometry(g, 20);
const cylX = (r: number, len: number, seg = 32) => {
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  g.rotateZ(Math.PI / 2);
  return g;
};

const G = {
  block: box(BLOCK_W, 1.9, 1.15),
  crankcase: box(BLOCK_W, 1.1, 1.35),
  head: box(BLOCK_W, 0.5, 1.2),
  sleeve: new THREE.CylinderGeometry(BORE / 2 + 0.03, BORE / 2 + 0.03, 1.6, 40, 1, true),
  piston: pistonGeometry(),
  rod: rodGeometry(),
  web: webGeometry(),
  journal: cylX(0.19, 0.3),
  crankPin: cylX(0.17, 0.34),
  valve: valveGeometry(),
  camIntake: camshaftGeometry(INTAKE_PEAK),
  camExhaust: camshaftGeometry(EXHAUST_PEAK),
  exhaust: exhaustGeometry(),
  intake: intakeGeometry(),
  hoses: hoseGeometry(),
  belt: beltGeometry(BELT_X),
  blade: bladeGeometry(),
  flash: new THREE.SphereGeometry(0.2, 20, 14),
};
const E = {
  block: edges(G.block),
  crankcase: edges(G.crankcase),
  head: edges(G.head),
};

/* ---------- materials (one engine in the app: module scope; the frame loop mutates them) ---------- */
const metal = (
  hex: string,
  rough: number,
  extra: Partial<THREE.MeshStandardMaterialParameters> = {},
) => new THREE.MeshStandardMaterial({ color: hex, metalness: 1, roughness: rough, ...extra });
const glass = (hex: string, opacity: number) =>
  new THREE.MeshStandardMaterial({
    color: hex,
    transparent: true,
    opacity,
    metalness: 0.3,
    roughness: 0.2,
    depthWrite: false,
  });

const M = {
  block: glass('#1a2532', 0.1),
  head: glass('#1f2a37', 0.16),
  cover: glass('#121b26', 0.22),
  edge: new THREE.LineBasicMaterial({ color: color.accent, transparent: true, opacity: 0.55 }),
  headEdge: new THREE.LineBasicMaterial({
    color: color.lineStrong,
    transparent: true,
    opacity: 0.7,
  }),
  sleeve: new THREE.MeshStandardMaterial({
    color: '#3a4858',
    transparent: true,
    opacity: 0.22,
    side: THREE.DoubleSide,
    emissive: color.accentStrong,
    emissiveIntensity: 0.05,
    depthWrite: false,
  }),
  piston: metal('#d3dae2', 0.26, { side: THREE.DoubleSide }),
  rod: metal('#aab3bd', 0.32, { metalness: 0.9 }),
  crank: metal('#a3adb8', 0.3, { metalness: 0.85 }),
  cam: metal('#8d97a3', 0.3),
  valve: metal('#bcc5cf', 0.22),
  flywheel: metal('#7c8794', 0.4, { metalness: 0.85 }),
  pulley: metal('#7c8794', 0.3),
  alternator: metal('#aeb7c1', 0.34),
  exhaust: metal('#6b6f76', 0.5, { emissive: '#1fb8c8', emissiveIntensity: 0 }),
  intake: new THREE.MeshStandardMaterial({ color: '#233040', metalness: 0.4, roughness: 0.45 }),
  sump: metal('#2b3542', 0.45),
  pump: metal('#5d6875', 0.35),
  gallery: new THREE.MeshStandardMaterial({
    color: '#1a2532',
    emissive: color.accent,
    emissiveIntensity: 1,
  }),
  core: new THREE.MeshStandardMaterial({ map: finTexture(), metalness: 0.6, roughness: 0.5 }),
  tank: new THREE.MeshStandardMaterial({ color: '#1a2532', metalness: 0.1, roughness: 0.7 }),
  fan: new THREE.MeshStandardMaterial({ color: '#1f2a37', metalness: 0.2, roughness: 0.55 }),
  hose: new THREE.MeshStandardMaterial({ color: '#141a22', metalness: 0, roughness: 0.85 }),
  belt: new THREE.MeshStandardMaterial({ color: '#0f1319', metalness: 0, roughness: 0.9 }),
  flash: CYLS.map(
    () =>
      new THREE.MeshBasicMaterial({
        color: '#dffcff',
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
  ),
};

/** Scene units of block shake per m/s² of second-order acceleration at the sensor (subtle at 3,000 rpm). */
const SHAKE_GAIN = 0.007;

/** Faulty subsystem parts pulse their status colour (design system §11); healthy parts don't glow. */
function tint(m: THREE.MeshStandardMaterial, s: Status, t: number) {
  if (s === 'ok') {
    m.emissive.set('#000000');
    m.emissiveIntensity = 0;
    return;
  }
  m.emissive.set(STATUS_HEX[s]);
  m.emissiveIntensity = 0.55 + 0.35 * Math.sin(t * 2 * Math.PI);
}
const statusOf = (h: number | null | undefined): Status => scoreStatus(h ?? 100);

/**
 * Procedural inline-4 cutaway. Every moving part is placed each frame from the physics:
 * pistons and rods from the slider-crank equation, valves from the 4-stroke valve timing,
 * flashes at each cylinder's firing TDC (firing order 1-3-4-2). No React state in the loop.
 */
export function Engine({ explode, onPart }: { explode: boolean; onPart: (p: PartId) => void }) {
  const crank = useRef<THREE.Group>(null);
  const pistons = useRef<(THREE.Mesh | null)[]>([]);
  const rods = useRef<(THREE.Mesh | null)[]>([]);
  const valvesIn = useRef<(THREE.Mesh | null)[]>([]);
  const valvesEx = useRef<(THREE.Mesh | null)[]>([]);
  const lights = useRef<(THREE.PointLight | null)[]>([]);
  const flashes = useRef<(THREE.Mesh | null)[]>([]);
  const camIn = useRef<THREE.Mesh>(null);
  const camEx = useRef<THREE.Mesh>(null);
  const head = useRef<THREE.Group>(null);
  const shake = useRef<THREE.Group>(null);
  const sump = useRef<THREE.Group>(null);
  const radiator = useRef<THREE.Group>(null);
  const fan = useRef<THREE.Group>(null);
  const altPulley = useRef<THREE.Mesh>(null);
  const pumpAnchor = useRef<THREE.Object3D>(null);
  const radiatorAnchor = useRef<THREE.Object3D>(null);
  const theta = useRef(0);
  const ex = useRef(0);
  const clock = useRef(0);

  useFrame(({ camera, size }, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1);
    clock.current += dt;
    const t = clock.current;
    const snap = useSim.getState().snapshot;
    const tel = snap?.telemetry;
    const subs = snap?.analytics?.subsystems;

    // crank angle: real engine speed, displayed 100× slower; 720° cycle
    const rpm = tel?.rpm ?? 0;
    theta.current =
      (theta.current + (rpmToRadps(rpm) * dt) / PROFILE.sim.displaySlowdown) % (4 * Math.PI);
    const th = theta.current;
    if (crank.current) crank.current.rotation.x = th;
    if (camIn.current) camIn.current.rotation.x = th / 2;
    if (camEx.current) camEx.current.rotation.x = th / 2;
    if (altPulley.current) altPulley.current.rotation.x = th * 2;
    const firing = rpm > PROFILE.electrical.crankingBelow_rpm;

    // What the monitor has concluded about combustion: the cylinder named by the 0.5× phase and
    // how much of its torque is missing. The view shows the diagnosis, not the hidden fault.
    const an = snap?.analytics;
    const mis = an && an.levels.combustion !== 'NORMAL' && an.spectral ? an.spectral.misfire : null;

    // F₂ block shake: 4 m r ω² λ cos 2θ, at twice the (slowed) crank frequency; grows with
    // measured vibration above the Twin's expectation
    if (shake.current) {
      const excess = Math.min(2.5, Math.max(1, an?.spectral?.ratios.rms ?? 1));
      shake.current.position.y = firing
        ? SHAKE_GAIN * secondaryAccel_ms2(rpm) * Math.cos(2 * th) * excess
        : 0;
    }

    for (const c of CYLS) {
      const i = c - 1;
      const pose = cylinderPose(th, c);
      const p = pistons.current[i];
      if (p) p.position.y = pose.pinY + PIN_TO_CROWN - PISTON_H;
      const rod = rods.current[i];
      if (rod) {
        rod.position.set(cylinderX(c), pose.crankPinY, pose.crankPinZ);
        rod.rotation.x = pose.rodRotX;
      }
      const phase = cyclePhase_deg(th, c);
      const vi = valvesIn.current[i];
      if (vi) vi.position.y = VALVE_SEAT_Y - valveLift_m(phase, 'intake') * LIFT_SCALE;
      const ve = valvesEx.current[i];
      if (ve) ve.position.y = VALVE_SEAT_Y - valveLift_m(phase, 'exhaust') * LIFT_SCALE;
      // combustion flash: fades with the torque a diagnosed misfiring cylinder is missing
      const dead = mis && mis.cylinder === c ? Math.min(1, mis.missing) : 0;
      const glow = firing ? combustionGlow(phase) * (1 - dead) : 0;
      M.flash[i]!.opacity = 0.85 * glow;
      const f = flashes.current[i];
      if (f) f.scale.setScalar(0.6 + 0.6 * glow);
      const l = lights.current[i];
      if (l) l.intensity = 5 * glow;
    }

    // explode view
    ex.current += ((explode ? 1 : 0) - ex.current) * Math.min(1, dt * 4);
    const e = ex.current;
    if (head.current) head.current.position.y = e * 1.4;
    if (sump.current) sump.current.position.y = -e * 1.1;
    if (radiator.current) radiator.current.position.x = -e * 1.5;

    // heat map on the block outline, sleeves and exhaust (steel → cyan → white, never a status)
    if (tel?.coolantC != null) {
      const heat = heatColor(tel.coolantC);
      M.edge.color.set(heat);
      M.sleeve.emissive.set(heat);
      M.exhaust.emissive.set(heat);
      M.exhaust.emissiveIntensity =
        0.12 * Math.min(1, Math.max(0, (tel.coolantC - 30) / 70)) * (0.5 + tel.load);
    }

    // health overlay
    const lube = statusOf(subs?.find((s) => s.id === 'lubrication')?.health);
    const thermal = statusOf(subs?.find((s) => s.id === 'thermal')?.health);
    const press = tel?.oilPressBar ?? 0;
    M.gallery.emissive.set(lube === 'ok' ? color.accent : STATUS_HEX[lube]);
    M.gallery.emissiveIntensity =
      lube === 'ok' ? 0.2 + 1.6 * Math.min(1, press / 4) : 1.2 + 0.8 * Math.sin(t * 2 * Math.PI);
    tint(M.sump, lube, t);
    tint(M.pump, lube, t);
    tint(M.core, thermal, t);
    tint(M.hose, thermal, t);

    if (fan.current && tel?.fanOn) fan.current.rotation.x += dt * 10;

    // DOM markers: project each part's anchor; open the label on the side with room
    for (const [part, obj] of [
      ['oilPump', pumpAnchor.current],
      ['radiator', radiatorAnchor.current],
    ] as const) {
      const el = calloutEls[part];
      if (!el || !obj) continue;
      obj.getWorldPosition(v3).project(camera);
      const x = ((v3.x + 1) / 2) * size.width;
      const y = ((1 - v3.y) / 2) * size.height;
      const room = 220;
      const side =
        x < size.width / 2
          ? x > room
            ? 'left'
            : 'right'
          : size.width - x > room
            ? 'right'
            : 'left';
      el.dataset.side = side;
      el.style.opacity = v3.z < 1 ? '1' : '0';
      el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    }
  });

  const pick = (p: PartId) => (ev: ThreeEvent<MouseEvent>) => {
    ev.stopPropagation();
    onPart(p);
  };

  return (
    <group ref={shake}>
      {/* block + crankcase: see-through, drawn with a heat-mapped outline */}
      <mesh geometry={G.block} material={M.block} position={[0, 1.55, 0]} />
      <lineSegments geometry={E.block} material={M.edge} position={[0, 1.55, 0]} />
      <mesh geometry={G.crankcase} material={M.block} position={[0, 0.05, 0]} />
      <lineSegments geometry={E.crankcase} material={M.edge} position={[0, 0.05, 0]} />
      {CYLS.map((c) => (
        <mesh
          key={`s${c}`}
          geometry={G.sleeve}
          material={M.sleeve}
          position={[cylinderX(c), 1.7, 0]}
        />
      ))}

      {/* head: valve train, cam cover, manifolds (lifts off in explode view) */}
      <group ref={head}>
        <mesh geometry={G.head} material={M.head} position={[0, DECK_Y + 0.25, 0]} />
        <lineSegments geometry={E.head} material={M.headEdge} position={[0, DECK_Y + 0.25, 0]} />
        <RoundedBox
          args={[BLOCK_W - 0.1, 0.34, 0.95]}
          radius={0.1}
          position={[0, 3.18, 0]}
          material={M.cover}
        />
        <mesh ref={camIn} geometry={G.camIntake} material={M.cam} position={[0, 3.12, VALVE_Z]} />
        <mesh ref={camEx} geometry={G.camExhaust} material={M.cam} position={[0, 3.12, -VALVE_Z]} />
        {CYLS.map((c) => (
          <group key={`v${c}`}>
            <mesh
              ref={(m) => {
                valvesIn.current[c - 1] = m;
              }}
              geometry={G.valve}
              material={M.valve}
              position={[cylinderX(c), VALVE_SEAT_Y, VALVE_Z]}
            />
            <mesh
              ref={(m) => {
                valvesEx.current[c - 1] = m;
              }}
              geometry={G.valve}
              material={M.valve}
              position={[cylinderX(c), VALVE_SEAT_Y, -VALVE_Z]}
            />
          </group>
        ))}
        <mesh geometry={G.intake} material={M.intake} />
        <mesh geometry={G.exhaust} material={M.exhaust} />
      </group>

      {/* combustion chambers: flash + light at each cylinder's firing TDC */}
      {CYLS.map((c) => (
        <group key={`f${c}`} position={[cylinderX(c), 2.36, 0]}>
          <mesh
            ref={(m) => {
              flashes.current[c - 1] = m;
            }}
            geometry={G.flash}
            material={M.flash[c - 1]}
          />
          <pointLight
            ref={(l) => {
              lights.current[c - 1] = l;
            }}
            color="#bff8ff"
            intensity={0}
            distance={2.4}
            decay={2}
          />
        </group>
      ))}

      {/* pistons and rods (positioned every frame) */}
      {CYLS.map((c) => (
        <mesh
          key={`p${c}`}
          ref={(m) => {
            pistons.current[c - 1] = m;
          }}
          geometry={G.piston}
          material={M.piston}
          position={[cylinderX(c), 1.5, 0]}
        />
      ))}
      {CYLS.map((c) => (
        <mesh
          key={`r${c}`}
          ref={(m) => {
            rods.current[c - 1] = m;
          }}
          geometry={G.rod}
          material={M.rod}
        />
      ))}

      {/* crankshaft: journals, pins, counterweighted webs, flywheel and pulley; rotation.x = θ */}
      <group ref={crank}>
        {[0, 1, 2, 3, 4].map((j) => (
          <mesh
            key={`j${j}`}
            geometry={G.journal}
            material={M.crank}
            position={[(j - 2) * PITCH, 0, 0]}
          />
        ))}
        {CYLS.map((c) => {
          const throwRad = (PROFILE.geometry.crankThrow_deg[c - 1]! * Math.PI) / 180;
          const x = cylinderX(c);
          return (
            <group key={`t${c}`} rotation={[throwRad, 0, 0]}>
              <mesh geometry={G.crankPin} material={M.crank} position={[x, R, 0]} />
              <mesh geometry={G.web} material={M.crank} position={[x - 0.23, 0, 0]} />
              <mesh geometry={G.web} material={M.crank} position={[x + 0.23, 0, 0]} />
            </group>
          );
        })}
        <mesh
          material={M.flywheel}
          position={[2 * PITCH + 0.35, 0, 0]}
          rotation={[0, 0, Math.PI / 2]}
        >
          <cylinderGeometry args={[0.95, 0.95, 0.12, 64]} />
        </mesh>
        <mesh material={M.crank} position={[2 * PITCH + 0.35, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[0.95, 0.045, 10, 96]} />
        </mesh>
        <mesh material={M.pulley} position={[BELT_X, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.36, 0.36, 0.1, 40]} />
        </mesh>
      </group>

      {/* accessory drive */}
      <mesh geometry={G.belt} material={M.belt} />
      <mesh
        material={M.alternator}
        position={[BELT_X + 0.3, 1.25, -0.8]}
        rotation={[0, 0, Math.PI / 2]}
      >
        <cylinderGeometry args={[0.27, 0.27, 0.46, 32]} />
      </mesh>
      <mesh
        ref={altPulley}
        material={M.pulley}
        position={[BELT_X, 1.25, -0.8]}
        rotation={[0, 0, Math.PI / 2]}
      >
        <cylinderGeometry args={[0.18, 0.18, 0.1, 24]} />
      </mesh>

      {/* lubrication: sump, oil pump, main gallery */}
      <group ref={sump} onClick={pick('oilPump')}>
        <RoundedBox
          args={[BLOCK_W - 0.2, 0.45, 1.1]}
          radius={0.08}
          position={[0.1, -0.95, 0]}
          material={M.sump}
        />
        <mesh material={M.pump} position={[-1.75, -0.55, 0.35]}>
          <boxGeometry args={[0.36, 0.4, 0.36]} />
        </mesh>
        <object3D ref={pumpAnchor} position={[-1.75, -0.5, 0.55]} />
      </group>
      <mesh material={M.gallery} position={[0, 0.72, -0.62]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.045, 0.045, BLOCK_W - 0.3, 12]} />
      </mesh>

      {/* cooling: radiator core + tanks, thermo-fan with shroud, hoses */}
      <group ref={radiator} onClick={pick('radiator')}>
        <mesh material={M.core} position={[-3.15, 1.3, 0]}>
          <boxGeometry args={[0.16, 1.8, 1.9]} />
        </mesh>
        <mesh material={M.tank} position={[-3.15, 2.3, 0]}>
          <boxGeometry args={[0.24, 0.22, 2.0]} />
        </mesh>
        <mesh material={M.tank} position={[-3.15, 0.3, 0]}>
          <boxGeometry args={[0.24, 0.22, 2.0]} />
        </mesh>
        <mesh material={M.fan} position={[-2.9, 1.3, 0]} rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[0.78, 0.04, 8, 64]} />
        </mesh>
        <group ref={fan} position={[-2.9, 1.3, 0]}>
          <mesh material={M.fan} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.13, 0.13, 0.14, 20]} />
          </mesh>
          {[0, 1, 2, 3, 4].map((b) => (
            <group key={b} rotation={[(b * 2 * Math.PI) / 5, 0, 0]}>
              <mesh geometry={G.blade} material={M.fan} rotation={[0, 0.45, 0]} />
            </group>
          ))}
        </group>
        <object3D ref={radiatorAnchor} position={[-3.15, 2.45, 0.95]} />
      </group>
      <mesh geometry={G.hoses} material={M.hose} />
    </group>
  );
}
