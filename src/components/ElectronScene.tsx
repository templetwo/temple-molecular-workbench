import { Component, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Billboard, Html, OrbitControls } from '@react-three/drei';
import { Focus } from 'lucide-react';
import * as THREE from 'three';
import { generateAtomicCloud, generateBondCloud, HYDROGEN_BOND_STEPS } from '@/lib/electrons';
import './electron-scene.css';

interface ElectronSceneProps {
  mode: 'atom' | 'bond';
  orbital: '1s' | '2s' | '2p';
  stepIndex: number;
  showNuclei?: boolean;
}

type OrbitController = {
  target: THREE.Vector3;
  maxDistance: number;
  enableDamping: boolean;
  update: () => void;
};
const SAMPLE_SEED = 2718;
const ATOM_SAMPLES = 14_000;
const BOND_SAMPLES = 18_000;
const ATOM_COLOR = '#90ded1';
const BOND_COLOR = '#d5f582';
const noopRaycast = () => {};

// A point is one probability sample, not an animated electron or a trajectory.
// The same color is used throughout each cloud: it encodes neither sign nor charge.
const vertexShader = `
  uniform float pointSize;
  uniform float pixelRatio;
  uniform float referenceDistance;
  void main() {
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewPosition;
    float attenuation = referenceDistance / max(-viewPosition.z, 0.2);
    gl_PointSize = clamp(pointSize * pixelRatio * attenuation, 1.0, 12.0 * pixelRatio);
  }
`;
const fragmentShader = `
  uniform vec3 cloudColor;
  uniform float opacity;
  void main() {
    vec2 offset = gl_PointCoord - vec2(0.5);
    float radiusSquared = dot(offset, offset);
    if (radiusSquared > 0.25) discard;
    float glow = exp(-radiusSquared * 20.0);
    float edge = 1.0 - smoothstep(0.15, 0.25, radiusSquared);
    gl_FragColor = vec4(cloudColor, glow * edge * opacity);
    #include <colorspace_fragment>
  }
`;

function framingRadius(positions: Float32Array) {
  const radii: number[] = [];
  for (let index = 0; index < positions.length; index += 3) {
    const radius = Math.hypot(positions[index], positions[index + 1], positions[index + 2]);
    if (!Number.isFinite(radius))
      throw new Error('The probability sample contains invalid coordinates.');
    radii.push(radius);
  }
  if (!radii.length) throw new Error('No probability samples are available.');
  radii.sort((a, b) => a - b);
  // Frame the central 98.5% without deleting any samples. Orbitals have no hard edge.
  return Math.max(1.4, radii[Math.floor((radii.length - 1) * 0.985)]);
}

function ProbabilityPoints({
  positions,
  radius,
  color,
  compact,
}: {
  positions: Float32Array;
  radius: number;
  color: string;
  compact: boolean;
}) {
  const pixelRatio = useThree((state) => state.viewport.dpr);
  const uniforms = useMemo(
    () => ({
      cloudColor: { value: new THREE.Color(color) },
      // Bond clouds share a fixed wide frame, so their projected points are denser.
      pointSize: { value: compact ? 1.8 : 2.5 },
      opacity: { value: compact ? 0.26 : 0.53 },
      pixelRatio: { value: pixelRatio },
      referenceDistance: { value: radius * 3.3 },
    }),
    [color, compact, pixelRatio, radius],
  );
  const haloUniforms = useMemo(
    () => ({
      ...uniforms,
      pointSize: { value: compact ? 5.4 : 7.4 },
      opacity: { value: compact ? 0.01 : 0.024 },
    }),
    [compact, uniforms],
  );
  return (
    <group>
      {[haloUniforms, uniforms].map((materialUniforms, layer) => (
        <points key={layer} frustumCulled={false} raycast={noopRaycast}>
          {/* Declarative ownership lets Fiber dispose replaced geometry and attributes. */}
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[positions, 3]} />
          </bufferGeometry>
          <shaderMaterial
            uniforms={materialUniforms}
            vertexShader={vertexShader}
            fragmentShader={fragmentShader}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </points>
      ))}
    </group>
  );
}

function Nucleus({
  position,
  label,
  markerSize,
}: {
  position: [number, number, number];
  label: 'H' | 'A' | 'B';
  markerSize: number;
}) {
  return (
    <group position={position}>
      <mesh raycast={noopRaycast} renderOrder={2}>
        <sphereGeometry args={[markerSize, 20, 16]} />
        <meshBasicMaterial color="#f0f5dd" transparent opacity={0.95} />
      </mesh>
      <Billboard>
        <mesh raycast={noopRaycast}>
          <ringGeometry args={[markerSize * 1.8, markerSize * 1.8 + 0.008, 48]} />
          <meshBasicMaterial
            color="#d9e4c5"
            transparent
            opacity={0.36}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      </Billboard>
      <Html
        center
        position={[label === 'A' ? -0.24 : label === 'B' ? 0.24 : 0, 0, markerSize * 3.8]}
        zIndexRange={[3, 0]}
        style={{ pointerEvents: 'none' }}
      >
        <span className="electron-nucleus-label" aria-hidden="true">
          H{label !== 'H' && <sub>{label}</sub>}
        </span>
      </Html>
    </group>
  );
}

function CameraView({
  radius,
  viewKey,
  resetToken,
}: {
  radius: number;
  viewKey: string;
  resetToken: number;
}) {
  const getScene = useThree((state) => state.get);
  const activeControls = useThree((state) => state.controls);
  const size = useThree((state) => state.size);
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    const camera = getScene().camera;
    const controls = getScene().controls as unknown as OrbitController | null;
    if (!(camera instanceof THREE.PerspectiveCamera) || !controls) return;
    const verticalFov = THREE.MathUtils.degToRad(camera.fov);
    const aspect = Math.max(size.width / Math.max(size.height, 1), 0.25);
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * aspect);
    const distance = (radius / Math.sin(Math.min(verticalFov, horizontalFov) / 2)) * 1.15;
    // Flush any remaining drag inertia before applying the exact fitted pose.
    // Updating once without damping consumes and clears OrbitControls' private deltas.
    const wasDamping = controls.enableDamping;
    controls.enableDamping = false;
    controls.update();
    // Scientific z-up view keeps 2p_z upright and the H–H x axis horizontal.
    camera.up.set(0, 0, 1);
    camera.position.set(0.32, 1, 0.22).normalize().multiplyScalar(distance);
    camera.near = 0.02;
    camera.far = Math.max(200, distance * 8);
    camera.updateProjectionMatrix();
    controls.target.set(0, 0, 0);
    controls.maxDistance = distance * 4;
    controls.update();
    controls.enableDamping = wasDamping;
    invalidate();
  }, [activeControls, getScene, invalidate, radius, resetToken, size.height, size.width, viewKey]);
  return (
    <OrbitControls
      makeDefault
      enablePan={false}
      enableDamping
      dampingFactor={0.1}
      rotateSpeed={0.6}
      zoomSpeed={0.75}
      minDistance={radius * 0.7}
      maxDistance={radius * 20}
      minPolarAngle={0.04}
      maxPolarAngle={Math.PI - 0.04}
    />
  );
}

function ContextWatcher({ onContextLost }: { onContextLost: () => void }) {
  const gl = useThree((state) => state.gl);
  useEffect(() => {
    const canvas = gl.domElement;
    const onLost = (event: Event) => {
      event.preventDefault();
      onContextLost();
    };
    canvas.addEventListener('webglcontextlost', onLost);
    return () => canvas.removeEventListener('webglcontextlost', onLost);
  }, [gl, onContextLost]);
  return null;
}

function CloudViewport({
  mode,
  orbital,
  stepIndex,
  showNuclei,
  resetToken,
  eventSource,
  onContextLost,
}: ElectronSceneProps & {
  resetToken: number;
  eventSource: HTMLDivElement;
  onContextLost: () => void;
}) {
  const index = Math.max(0, Math.min(HYDROGEN_BOND_STEPS.length - 1, Math.trunc(stepIndex) || 0));
  const cloud = useMemo(
    () =>
      mode === 'atom'
        ? generateAtomicCloud(orbital, ATOM_SAMPLES, SAMPLE_SEED)
        : generateBondCloud(index, BOND_SAMPLES, SAMPLE_SEED),
    [index, mode, orbital],
  );
  const sampledRadius = useMemo(() => framingRadius(cloud), [cloud]);
  // Keep a fixed spatial scale as the two nuclei approach; no camera chasing the slider.
  const radius =
    mode === 'atom'
      ? sampledRadius
      : Math.max(...HYDROGEN_BOND_STEPS.map((step) => step.distanceAngstrom)) / 2 + 1.1;
  const separation = HYDROGEN_BOND_STEPS[index].distanceAngstrom;
  const color = mode === 'atom' ? ATOM_COLOR : BOND_COLOR;
  const markerSize = mode === 'atom' && orbital !== '1s' ? 0.085 : 0.045;
  return (
    <Canvas
      frameloop="demand"
      eventSource={eventSource}
      dpr={[1, 1.65]}
      camera={{ position: [0, 8, 2], up: [0, 0, 1], fov: 39, near: 0.02, far: 200 }}
      gl={{ antialias: false, alpha: true, powerPreference: 'low-power' }}
      style={{ touchAction: 'none' }}
      aria-label={
        mode === 'atom'
          ? `Rotatable hydrogen ${orbital === '2p' ? '2p z' : orbital} electron probability cloud`
          : `Rotatable hydrogen molecule electron density at ${separation.toFixed(2)} angstrom separation`
      }
    >
      <ContextWatcher onContextLost={onContextLost} />
      <ProbabilityPoints
        positions={cloud}
        radius={radius}
        color={color}
        compact={mode === 'bond'}
      />
      {showNuclei &&
        (mode === 'atom' ? (
          <Nucleus position={[0, 0, 0]} label="H" markerSize={markerSize} />
        ) : (
          <>
            <Nucleus position={[-separation / 2, 0, 0]} label="A" markerSize={markerSize} />
            <Nucleus position={[separation / 2, 0, 0]} label="B" markerSize={markerSize} />
          </>
        ))}
      <CameraView
        radius={radius}
        viewKey={`${mode}-${mode === 'atom' ? orbital : 'fixed-bond-scale'}`}
        resetToken={resetToken}
      />
    </Canvas>
  );
}

function WebGLFallback({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="electron-cloud-fallback" role="status">
      <div className="electron-fallback-mark" aria-hidden="true">
        <span />
        <i />
        <b />
      </div>
      <strong>Electron cloud view is unavailable</strong>
      <p>
        Try enabling browser hardware acceleration. The orbital explanations and energy data are
        still available.
      </p>
      <button type="button" onClick={onRetry}>
        Retry electron cloud view
      </button>
    </div>
  );
}

class CloudBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function supportsWebGL() {
  if (typeof document === 'undefined') return true;
  try {
    const context = document.createElement('canvas').getContext('webgl2');
    if (!context) return false;
    context.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

export default function ElectronScene({
  mode,
  orbital,
  stepIndex,
  showNuclei = true,
}: ElectronSceneProps) {
  const [generation, setGeneration] = useState(0);
  const [resetToken, setResetToken] = useState(0);
  // Capture the element itself: Fiber may finish async setup after a tab unmounts,
  // when its own default event-source ref has already been cleared to null.
  const [eventSource, setEventSource] = useState<HTMLDivElement | null>(null);
  const [unavailable, setUnavailable] = useState(() => !supportsWebGL());
  const onContextLost = useCallback(() => setUnavailable(true), []);
  const onRetry = useCallback(() => {
    setUnavailable(!supportsWebGL());
    setGeneration((value) => value + 1);
  }, []);
  const fallback = <WebGLFallback onRetry={onRetry} />;
  return (
    <div
      className={`electron-cloud electron-cloud--${mode}`}
      data-testid="electron-scene"
      role="figure"
      aria-label={
        mode === 'atom'
          ? 'Hydrogen electron probability density'
          : 'Hydrogen molecule electron density'
      }
    >
      <div className="electron-cloud-canvas" ref={setEventSource}>
        <CloudBoundary key={generation} fallback={fallback}>
          {unavailable ? (
            fallback
          ) : eventSource ? (
            <CloudViewport
              mode={mode}
              orbital={orbital}
              stepIndex={stepIndex}
              showNuclei={showNuclei}
              resetToken={resetToken}
              eventSource={eventSource}
              onContextLost={onContextLost}
            />
          ) : null}
        </CloudBoundary>
      </div>
      <div className="electron-cloud-topline">
        <button
          type="button"
          aria-label="Reset electron cloud view"
          title="Reset view"
          onClick={() => setResetToken((value) => value + 1)}
          disabled={unavailable}
        >
          <Focus size={17} />
        </button>
      </div>
      <span className="sr-only">
        {mode === 'atom' ? ATOM_SAMPLES : BOND_SAMPLES} samples of a continuous spatial density, in
        ångströms. Dots show possible positions, not individual electrons. Brightness follows sample
        concentration, not phase or charge. Nucleus markers are enlarged. No electron trajectories
        are shown.
      </span>
    </div>
  );
}
