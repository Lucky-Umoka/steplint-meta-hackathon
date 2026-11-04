"use client";
/**
 * Gideon's holographic human face (react-three-fiber). Fully procedural: a
 * sphere is sculpted into a head (cranium, brow, eye sockets, nose, cheeks,
 * lips, jaw, chin, ears, neck) and rendered as a glowing hologram — a fresnel
 * surface shader that brightens contours, a fine wire mesh and mesh points.
 * The head faces the learner and only breathes and tilts slightly (no spin).
 * Eyes blink and glance; the lips open with the utterance really being spoken
 * (shared speech clock). Display only — it never verifies anything.
 */
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { GuideVisual } from "./guide-avatar-visual";
import { mouthOpennessAt, type SpeechSnapshot } from "./guide-speech-clock";

const g = (x: number, y: number, sx: number, sy: number) =>
  Math.exp(-((x * x) / sx + (y * y) / sy));

/** Sculpt a unit sphere into a human head (front = +z, eyes at y ≈ 0.14). */
function headGeometry(segments: number): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(1, segments, segments);
  const p = geo.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    let { x, y, z } = v;
    x *= 0.66;
    z *= 0.86;
    const front = Math.max(0, z / 0.86) ** 1.5;
    if (y < -0.1) {
      const k = Math.min(1, (-0.1 - y) / 0.9);
      x *= 1 - 0.5 * k * k * k;
      z *= 1 - 0.1 * k;
      y -= 0.08 * k * front;
    }
    if (y > 0.3) x *= 1 + 0.03 * Math.sin(((y - 0.3) / 0.7) * Math.PI);
    // Brow ridge.
    z += 0.06 * front * g(x, y - 0.27, 0.13, 0.003);
    // Eye sockets.
    z -=
      0.13 *
      front *
      (g(x - 0.26, y - 0.14, 0.012, 0.005) + g(x + 0.26, y - 0.14, 0.012, 0.005));
    // Cheekbones and hollows.
    z += 0.05 * front * (g(x - 0.33, y + 0.06, 0.02, 0.008) + g(x + 0.33, y + 0.06, 0.02, 0.008));
    z -= 0.03 * front * (g(x - 0.3, y + 0.3, 0.02, 0.02) + g(x + 0.3, y + 0.3, 0.02, 0.02));
    // Nose: bridge, tip and wings.
    z += 0.15 * front * g(x, y - 0.0, 0.006, 0.04);
    z += 0.22 * front * g(x, y + 0.2, 0.009, 0.007);
    z += 0.06 * front * (g(x - 0.07, y + 0.23, 0.002, 0.002) + g(x + 0.07, y + 0.23, 0.002, 0.002));
    // Philtrum and lips.
    z += 0.03 * front * g(x, y + 0.32, 0.004, 0.004);
    z += 0.06 * front * g(x, y + 0.42, 0.025, 0.0025);
    z += 0.055 * front * g(x, y + 0.5, 0.02, 0.0025);
    // Chin.
    z += 0.07 * front * g(x, y + 0.72, 0.018, 0.01);
    p.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();
  return geo;
}

const VERTEX = /* glsl */ `
  varying vec3 vNormal; varying vec3 vView; varying float vY;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = normalize(-mv.xyz);
    vY = position.y;
    gl_Position = projectionMatrix * mv;
  }`;
const FRAGMENT = /* glsl */ `
  uniform vec3 uColor; uniform float uIntensity; uniform float uTime;
  varying vec3 vNormal; varying vec3 vView; varying float vY;
  void main() {
    float facing = clamp(dot(vNormal, vView), 0.0, 1.0);
    float rim = pow(1.0 - facing, 2.2);
    float key = pow(clamp(dot(vNormal, normalize(vec3(-0.45, 0.25, 0.85))), 0.0, 1.0), 3.0);
    float scan = 0.88 + 0.12 * sin(vY * 160.0 - uTime * 3.0);
    float a = (rim * 1.1 + key * 0.16 + 0.015) * scan * uIntensity;
    gl_FragColor = vec4(uColor * (0.55 + rim * 0.9 + key * 0.5), a);
  }`;

function almond(width: number, top: number, bottom: number) {
  const s = new THREE.Shape();
  s.moveTo(-width, 0);
  s.quadraticCurveTo(0, top, width, 0.005);
  s.quadraticCurveTo(0, -bottom, -width, 0);
  return new THREE.ShapeGeometry(s, 16);
}

function Face({
  visual,
  animate,
  speech,
}: {
  visual: GuideVisual;
  animate: boolean;
  speech: SpeechSnapshot;
}) {
  const head = useMemo(() => headGeometry(64), []);
  const wire = useMemo(() => new THREE.WireframeGeometry(headGeometry(36)), []);
  const ear = useMemo(() => {
    const geo = new THREE.TorusGeometry(0.11, 0.035, 8, 24, Math.PI * 1.6);
    geo.rotateY(Math.PI / 2);
    geo.rotateX(-Math.PI / 2 - 0.9);
    return geo;
  }, []);
  const neck = useMemo(
    () =>
      new THREE.WireframeGeometry(
        new THREE.CylinderGeometry(0.3, 0.42, 0.8, 40, 8, true),
      ),
    [],
  );
  const eye = useMemo(() => almond(0.115, 0.075, 0.055), []);
  const lip = useMemo(() => almond(0.16, 0.04, 0.025), []);
  const color = useMemo(() => new THREE.Color(visual.color), [visual.color]);
  const uniforms = useMemo(
    () => ({
      uColor: { value: new THREE.Color("#22d3ee") },
      uIntensity: { value: 1 },
      uTime: { value: 0 },
    }),
    [],
  );

  const shader = useRef<THREE.ShaderMaterial>(null);
  const group = useRef<THREE.Group>(null);
  const lids = useRef<THREE.Group>(null);
  const irises = useRef<THREE.Group>(null);
  const mouthGap = useRef<THREE.Mesh>(null);
  const lowerLip = useRef<THREE.Mesh>(null);
  const wireMat = useRef<THREE.LineBasicMaterial>(null);
  const pointMat = useRef<THREE.PointsMaterial>(null);
  const blink = useRef({ next: 2.2, until: 0 });
  const mouth = useRef(0);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const talking = speech.startedAt > 0;
    if (group.current) {
      const nod = talking ? Math.sin(t * 3.1) * 0.012 : 0;
      group.current.rotation.y = animate ? Math.sin(t * 0.3) * 0.07 : 0;
      group.current.rotation.x = animate ? Math.sin(t * 0.23) * 0.025 + nod : 0;
      group.current.position.y = animate ? Math.sin(t * 1.1) * 0.01 : 0;
    }
    const b = blink.current;
    if (animate && t > b.next) {
      b.until = t + 0.13;
      b.next = t + 2.5 + ((Math.sin(t * 12.9898) + 1) / 2) * 3.5;
    }
    const open = animate && t < b.until ? 0.06 : 1;
    if (lids.current) lids.current.scale.y += (open - lids.current.scale.y) * 0.55;
    if (irises.current) {
      irises.current.scale.y = lids.current?.scale.y ?? 1;
      irises.current.position.x = animate ? Math.sin(t * 0.41) * 0.014 : 0;
      irises.current.position.y = animate ? Math.sin(t * 0.29) * 0.007 : 0;
    }
    const target = talking
      ? mouthOpennessAt(speech, performance.now())
      : visual.state === "success"
        ? 0.12
        : 0.02;
    mouth.current += (target - mouth.current) * 0.4;
    const m = mouth.current;
    if (mouthGap.current) mouthGap.current.scale.set(0.9 - m * 0.2, 0.06 + m * 0.55, 1);
    if (lowerLip.current) lowerLip.current.position.y = -0.505 - m * 0.06;
    const pulse = visual.pulse ? 0.78 + 0.22 * Math.sin(t * visual.pulse) : 1;
    const u = shader.current?.uniforms;
    if (u) {
      (u.uColor.value as THREE.Color).copy(color);
      u.uIntensity.value = visual.intensity * pulse;
      u.uTime.value = t;
    }
    if (wireMat.current)
      wireMat.current.opacity = Math.min(0.6, 0.24 * visual.intensity * pulse);
    if (pointMat.current)
      pointMat.current.opacity = Math.min(1, 0.55 * visual.intensity * pulse);
  });

  const glow = {
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  } as const;
  return (
    <group ref={group}>
      {/* Depth-only occluder: back-facing lines never show through. */}
      <mesh geometry={head} renderOrder={0}>
        <meshBasicMaterial colorWrite={false} />
      </mesh>
      <mesh geometry={head} renderOrder={1}>
        <shaderMaterial
          ref={shader}
          vertexShader={VERTEX}
          fragmentShader={FRAGMENT}
          uniforms={uniforms}
          {...glow}
        />
      </mesh>
      <lineSegments geometry={wire} renderOrder={2}>
        <lineBasicMaterial ref={wireMat} color={color} {...glow} opacity={0.14} />
      </lineSegments>
      <points geometry={head} renderOrder={3}>
        <pointsMaterial
          ref={pointMat}
          color={color}
          size={0.009}
          sizeAttenuation
          {...glow}
          opacity={0.55}
        />
      </points>
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          geometry={ear}
          position={[side * 0.655, 0.08, -0.02]}
          scale={[side, 1, 1]}
        >
          <meshBasicMaterial color={color} {...glow} opacity={0.6} />
        </mesh>
      ))}
      <lineSegments geometry={neck} position={[0, -1.18, -0.12]}>
        <lineBasicMaterial color={color} {...glow} opacity={0.22} />
      </lineSegments>
      <group ref={lids} position={[0, 0.14, 0]}>
        {[-0.26, 0.26].map((x) => (
          <mesh key={x} geometry={eye} position={[x, 0, 0.8]}>
            <meshBasicMaterial color={color} {...glow} opacity={0.28} />
          </mesh>
        ))}
      </group>
      <group position={[0, 0.145, 0.815]}>
        <group ref={irises}>
          {[-0.26, 0.26].map((x) => (
            <group key={x} position={[x, 0, 0]}>
              <mesh>
                <circleGeometry args={[0.016, 20]} />
                <meshBasicMaterial color="#e0faff" {...glow} opacity={0.95} />
              </mesh>
              <mesh>
                <ringGeometry args={[0.024, 0.042, 28]} />
                <meshBasicMaterial color={color} {...glow} opacity={0.85} />
              </mesh>
            </group>
          ))}
        </group>
      </group>
      <mesh geometry={lip} position={[0, -0.455, 0.865]}>
        <meshBasicMaterial color={color} {...glow} opacity={0.6} />
      </mesh>
      <mesh ref={mouthGap} position={[0, -0.478, 0.862]} scale={[1, 0.08, 1]}>
        <circleGeometry args={[0.12, 32]} />
        <meshBasicMaterial color="#020a14" transparent opacity={0.9} />
      </mesh>
      <mesh
        ref={lowerLip}
        geometry={lip}
        position={[0, -0.505, 0.86]}
        rotation={[0, 0, Math.PI]}
        scale={[0.9, 1.1, 1]}
      >
        <meshBasicMaterial color={color} {...glow} opacity={0.55} />
      </mesh>
    </group>
  );
}

/**
 * Render budget: Gideon is decorative, live tracking is not. Draw at most
 * ~24 frames/s (on demand) so the face never competes with the tracking
 * worker for CPU/GPU, and stop entirely while the tab is hidden.
 */
const FPS = 12;
function FrameBudget() {
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") invalidate();
    }, 1000 / FPS);
    return () => window.clearInterval(id);
  }, [invalidate]);
  return null;
}

export default function GuideAvatar3D({
  visual,
  animate,
  speech,
}: {
  visual: GuideVisual;
  animate: boolean;
  speech: SpeechSnapshot;
}) {
  return (
    <Canvas
      camera={{ position: [0, -0.12, 3.25], fov: 42 }}
      dpr={1}
      frameloop="demand"
      gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
      style={{ width: "100%", height: "100%" }}
    >
      {animate && <FrameBudget />}
      <Face visual={visual} animate={animate} speech={speech} />
    </Canvas>
  );
}
