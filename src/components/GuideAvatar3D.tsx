"use client";
/**
 * Procedural holographic face for Gideon (react-three-fiber). No external
 * assets, textures or network. Display only; driven by the avatar state.
 */
import { Canvas, useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import type { GuideVisual } from "./guide-avatar-visual";

const PARTICLES = 70;

/** Deterministic particle shell around the head (no Math.random in render). */
function particlePositions(): Float32Array {
  const out = new Float32Array(PARTICLES * 3);
  for (let i = 0; i < PARTICLES; i++) {
    const y = 1 - (2 * (i + 0.5)) / PARTICLES;
    const r = Math.sqrt(1 - y * y);
    const theta = i * 2.39996;
    const radius = 1.45 + 0.25 * Math.abs(Math.sin(i * 12.9898));
    out[i * 3] = Math.cos(theta) * r * radius;
    out[i * 3 + 1] = y * radius;
    out[i * 3 + 2] = Math.sin(theta) * r * radius;
  }
  return out;
}

const PARTICLE_POSITIONS = particlePositions();

const glow = {
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
} as const;

function Face({ visual, animate }: { visual: GuideVisual; animate: boolean }) {
  const group = useRef<THREE.Group>(null);
  const orbit = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  const mouth = useRef<THREE.Group>(null);
  const eyes = useRef<THREE.Group>(null);
  const dust = useRef<THREE.Points>(null);
  const head = useRef<THREE.MeshBasicMaterial>(null);

  useFrame(({ clock }, delta) => {
    if (!animate) return;
    const t = clock.elapsedTime;
    if (group.current) {
      group.current.rotation.y = Math.sin(t * 0.5) * 0.22;
      group.current.position.y = Math.sin(t * 1.1) * 0.04;
    }
    if (orbit.current) orbit.current.rotation.z += delta * 0.9;
    if (dust.current) dust.current.rotation.y -= delta * 0.12;
    if (ring.current) {
      const s = 1 + 0.1 * Math.sin(t * visual.pulse);
      ring.current.scale.set(s, s, s);
    }
    if (eyes.current) {
      // Brief blink every ~5 s.
      const phase = t % 5;
      eyes.current.scale.y = phase < 0.12 ? 0.15 : 1;
    }
    if (mouth.current) {
      mouth.current.scale.y = visual.talk
        ? 1 + 3.2 * Math.abs(Math.sin(t * 11)) * Math.abs(Math.sin(t * 3.7))
        : 1;
    }
    if (head.current) {
      head.current.opacity =
        0.16 *
        visual.intensity *
        (visual.pulse > 0 ? 0.7 + 0.3 * Math.sin(t * visual.pulse) : 1);
    }
  });

  const c = visual.color;
  const mouthWidth = 0.34 + 0.18 * visual.mouthOpen;
  return (
    <group ref={group}>
      {/* Inner glow volume */}
      <mesh scale={[0.88, 1.08, 0.9]}>
        <sphereGeometry args={[0.97, 32, 32]} />
        <meshBasicMaterial
          color={c}
          opacity={0.07 * visual.intensity}
          {...glow}
        />
      </mesh>
      {/* Holographic lattice */}
      <mesh scale={[0.9, 1.1, 0.92]}>
        <icosahedronGeometry args={[1, 3]} />
        <meshBasicMaterial
          ref={head}
          color={c}
          wireframe
          opacity={0.16 * visual.intensity}
          {...glow}
        />
      </mesh>
      <group ref={eyes} position={[0, 0.2, 0]}>
        {[-0.34, 0.34].map((x) => (
          <group key={x} position={[x, 0, 0.9]}>
            <mesh scale={[1, 1.3, 0.45]}>
              <sphereGeometry args={[0.085, 16, 16]} />
              <meshBasicMaterial
                color="#ecfeff"
                opacity={Math.min(1, 0.6 + 0.3 * visual.intensity)}
                {...glow}
              />
            </mesh>
            <mesh scale={[1, 1.2, 0.3]}>
              <sphereGeometry args={[0.19, 16, 16]} />
              <meshBasicMaterial
                color={c}
                opacity={0.22 * visual.intensity}
                {...glow}
              />
            </mesh>
          </group>
        ))}
      </group>
      <group ref={mouth} position={[0, -0.36, 0.92]}>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <capsuleGeometry args={[0.03, mouthWidth, 4, 12]} />
          <meshBasicMaterial color={c} opacity={0.95} {...glow} />
        </mesh>
      </group>
      <points ref={dust}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[PARTICLE_POSITIONS, 3]}
          />
        </bufferGeometry>
        <pointsMaterial
          color={c}
          size={0.035}
          opacity={0.65 * Math.min(1, visual.intensity)}
          {...glow}
        />
      </points>
      {visual.orbit && (
        <mesh ref={orbit} rotation={[1.2, 0.3, 0]}>
          <torusGeometry args={[1.32, 0.012, 8, 96]} />
          <meshBasicMaterial color={c} opacity={0.75} {...glow} />
        </mesh>
      )}
      {visual.listenRing && (
        <mesh ref={ring} position={[0, 0, 0.2]}>
          <torusGeometry args={[1.22, 0.016, 8, 96]} />
          <meshBasicMaterial color={c} opacity={0.8} {...glow} />
        </mesh>
      )}
    </group>
  );
}

export default function GuideAvatar3D({
  visual,
  animate,
}: {
  visual: GuideVisual;
  animate: boolean;
}) {
  return (
    <Canvas
      frameloop={animate ? "always" : "demand"}
      dpr={[1, 1.5]}
      camera={{ position: [0, 0, 3.9], fov: 40 }}
      gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
      style={{ width: "100%", height: "100%" }}
    >
      <Face visual={visual} animate={animate} />
    </Canvas>
  );
}
