import { useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

/** Procedural unit-cell generator for common lattice types. */
function latticePoints(kind: string): [number, number, number][] {
  const c: [number, number, number][] = [
    [-1, -1, -1], [1, -1, -1], [-1, 1, -1], [1, 1, -1],
    [-1, -1, 1], [1, -1, 1], [-1, 1, 1], [1, 1, 1],
  ];
  switch (kind) {
    case 'sc':
      return c;
    case 'bcc':
      return [...c, [0, 0, 0]];
    case 'fcc':
      return [
        ...c,
        [0, 0, -1], [0, 0, 1], [0, -1, 0], [0, 1, 0], [-1, 0, 0], [1, 0, 0],
      ];
    case 'hcp': {
      const pts: [number, number, number][] = [];
      // With in-plane spacing a = 1, adjacent close-packed layers are
      // sqrt(1 - (1 / sqrt(3))²) apart, giving ideal c/a = sqrt(8/3).
      const halfHeight = Math.sqrt(2 / 3);
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        pts.push([Math.cos(a), -halfHeight, Math.sin(a)]);
        pts.push([Math.cos(a), halfHeight, Math.sin(a)]);
      }
      pts.push([0, -halfHeight, 0], [0, halfHeight, 0]);
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2 + Math.PI / 6;
        pts.push([Math.cos(a) / Math.sqrt(3), 0, Math.sin(a) / Math.sqrt(3)]);
      }
      return pts;
    }
    case 'diamond': {
      const fcc = [
        ...c,
        [0, 0, -1], [0, 0, 1], [0, -1, 0], [0, 1, 0], [-1, 0, 0], [1, 0, 0],
      ] as [number, number, number][];
      const inner: [number, number, number][] = [
        [-0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, 0.5, 0.5],
      ];
      return [...fcc, ...inner];
    }
    default:
      return c;
  }
}

function Cell({ kind, color }: { kind: string; color: string }) {
  const pts = useMemo(() => latticePoints(kind), [kind]);

  // connect nearest neighbors with thin rods
  const bonds = useMemo(() => {
    const out: [number, number][] = [];
    const dists = pts.map((p, i) =>
      pts.map((q, j) => (i === j ? Infinity : Math.hypot(p[0]-q[0], p[1]-q[1], p[2]-q[2])))
    );
    const min = Math.min(...dists.flat());
    for (let i = 0; i < pts.length; i++)
      for (let j = i + 1; j < pts.length; j++)
        if (dists[i][j] < min * 1.05) out.push([i, j]);
    return out;
  }, [pts]);

  return (
    <group rotation={[0.35, 0.45, 0]} scale={0.78}>
      {pts.map((p, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[0.16, 20, 20]} />
          <meshStandardMaterial color={color} roughness={0.35} metalness={0.55} />
        </mesh>
      ))}
      {bonds.map(([i, j], k) => {
        const a = new THREE.Vector3(...pts[i]);
        const b = new THREE.Vector3(...pts[j]);
        const mid = a.clone().add(b).multiplyScalar(0.5);
        const dir = b.clone().sub(a);
        const len = dir.length();
        const quat = new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          dir.clone().normalize()
        );
        return (
          <mesh key={`b${k}`} position={mid} quaternion={quat}>
            <cylinderGeometry args={[0.035, 0.035, len, 8]} />
            <meshStandardMaterial color="#8b93a3" roughness={0.5} />
          </mesh>
        );
      })}
    </group>
  );
}

export default function LatticeView({ kind, color }: { kind: string; color: string }) {
  const [available] = useState(() => {
    try {
      const context = document.createElement('canvas').getContext('webgl2');
      if (!context) return false;
      context.getExtension('WEBGL_lose_context')?.loseContext();
      return true;
    } catch {
      return false;
    }
  });
  if (!available) return <div role="status" className="flex h-full items-center justify-center px-4 text-center text-[11px] leading-relaxed text-[#a8b3a3]">3D lattice preview is unavailable in this browser. The reference structure is listed below.</div>;
  return (
    <Canvas
      camera={{ position: [0, 0, 4.4], fov: 40 }}
      style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 8 }}
      dpr={[1, 1.5]}
      frameloop="demand"
    >
      <ambientLight intensity={0.7} />
      <directionalLight position={[4, 5, 6]} intensity={1.4} />
      <pointLight position={[-4, -3, -4]} intensity={0.5} color="#d5f582" />
      <Cell kind={kind} color={color} />
      <OrbitControls enablePan={false} enableZoom={false} enableDamping={false} />
    </Canvas>
  );
}
