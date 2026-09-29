import { useEffect, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  ContactShadows,
  Environment,
  Grid,
  Lightformer,
  OrbitControls,
  PerformanceMonitor,
} from '@react-three/drei';
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { color } from '../ui/tokens';
import { CAMERA_PRESETS, cylinderPose } from './layout';
import { Engine, type PartId } from './Engine';

/** Smoothly flies the camera to a preset, then hands control back to the user's orbit. */
function CameraRig({ preset }: { preset: string }) {
  const { camera } = useThree();
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const flying = useRef(true);
  const goal = useRef({ pos: new THREE.Vector3(), target: new THREE.Vector3() });

  useEffect(() => {
    const p = CAMERA_PRESETS[preset] ?? CAMERA_PRESETS.front!;
    goal.current.pos.set(...p.pos);
    goal.current.target.set(...p.target);
    flying.current = true;
  }, [preset]);

  useFrame((_, dt) => {
    if (!flying.current || !controls) return;
    const k = Math.min(1, dt * 3.5);
    camera.position.lerp(goal.current.pos, k);
    controls.target.lerp(goal.current.target, k);
    controls.update();
    if (camera.position.distanceTo(goal.current.pos) < 0.02) flying.current = false;
  });
  return null;
}

/**
 * Exposes fps / mesh / draw-call counts on window.__ignisense3d so the performance budget
 * (60 fps, < 100 meshes) can be checked in a real browser, plus the display crank angle readout.
 */
function Probe({ quality }: { quality: number }) {
  const { gl, scene } = useThree();
  const frames = useRef(0);
  const acc = useRef(0);
  useFrame((_, dt) => {
    frames.current++;
    acc.current += dt;
    if (acc.current >= 1) {
      let meshes = 0;
      scene.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) meshes++;
      });
      (window as unknown as { __ignisense3d: object }).__ignisense3d = {
        fps: Math.round(frames.current / acc.current),
        meshes,
        calls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
        piston1PinY: cylinderPose(0, 1).pinY,
        quality,
      };
      frames.current = 0;
      acc.current = 0;
    }
  });
  return null;
}

export default function EngineScene({
  preset,
  onPart,
}: {
  preset: string;
  onPart: (p: PartId) => void;
}) {
  // Adaptive quality (Q-36): if the GPU cannot hold the frame rate, shed effects instead of stuttering.
  // 0 = full, 1 = no contact shadows / MSAA at 1× pixel ratio, 2 = no bloom either. Only steps down.
  const [quality, setQuality] = useState(0);
  return (
    <Canvas
      className="absolute! inset-0"
      dpr={quality >= 1 ? 1 : [1, 2]}
      camera={{ fov: 32, near: 0.1, far: 100, position: CAMERA_PRESETS.front!.pos }}
      gl={{ antialias: false }}
    >
      <PerformanceMonitor
        bounds={() => [28, 200]}
        flipflops={2}
        onDecline={() => setQuality((q) => Math.min(2, q + 1))}
      />
      <color attach="background" args={[color.bg]} />
      <fog attach="fog" args={[color.bg, 13, 30]} />

      {/*
        Studio lighting built from light panels inside the scene (no HDR download), rendered once
        into an environment map: it gives the metal parts real reflections and works offline.
      */}
      <Environment resolution={256} frames={1}>
        <Lightformer
          form="rect"
          intensity={2.2}
          position={[0, 7, 0]}
          rotation-x={Math.PI / 2}
          scale={[12, 4, 1]}
        />
        <Lightformer
          form="rect"
          intensity={1.4}
          position={[-7, 2.5, 3]}
          rotation-y={Math.PI / 2}
          scale={[6, 3, 1]}
        />
        <Lightformer
          form="rect"
          intensity={1.1}
          color="#35e0f0"
          position={[7, 2, -3]}
          rotation-y={-Math.PI / 2}
          scale={[5, 2.5, 1]}
        />
        <Lightformer form="ring" intensity={0.8} position={[0, 2, 8]} scale={3} />
        {/* soft bounce from below so the crankshaft reads as metal, not a silhouette */}
        <Lightformer
          form="rect"
          intensity={0.5}
          position={[0, -5, 0]}
          rotation-x={-Math.PI / 2}
          scale={[12, 6, 1]}
        />
      </Environment>
      <hemisphereLight args={['#cfe9ff', '#0c131c', 0.35]} />
      <directionalLight position={[-4, 8, 6]} intensity={1.1} />
      <directionalLight position={[5, 3, -5]} intensity={0.6} color="#35e0f0" />

      <Engine explode={preset === 'explode'} onPart={onPart} />

      {quality < 1 && (
        <ContactShadows
          position={[0, -1.34, 0]}
          scale={14}
          opacity={0.55}
          blur={2.6}
          far={4}
          resolution={512}
          color="#000000"
        />
      )}
      <Grid
        position={[0, -1.35, 0]}
        args={[40, 40]}
        cellSize={0.5}
        cellThickness={0.6}
        cellColor={color.line}
        sectionSize={2}
        sectionThickness={1}
        sectionColor={color.lineStrong}
        fadeDistance={24}
        fadeStrength={1.6}
        infiniteGrid
      />

      <OrbitControls
        makeDefault
        enableDamping
        minDistance={4}
        maxDistance={20}
        maxPolarAngle={Math.PI * 0.55}
      />
      <CameraRig preset={preset} />
      <Probe quality={quality} />

      {/* bloom only catches genuinely bright things: firing flashes, the oil gallery, fault glows */}
      <EffectComposer multisampling={quality >= 1 ? 0 : 4}>
        {quality < 2 ? (
          <Bloom mipmapBlur luminanceThreshold={0.9} intensity={0.65} radius={0.55} />
        ) : (
          <></>
        )}
        <Vignette offset={0.3} darkness={0.55} />
      </EffectComposer>
    </Canvas>
  );
}
