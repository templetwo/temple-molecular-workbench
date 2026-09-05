import {
  Component,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber';
import { Billboard, Environment, Grid, Html, Lightformer, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import {
  useBench,
  atomRadius,
  atomColor,
  type PlacedAtom,
  type Bond,
  type DisplayStyle,
} from '@/state/store';
import { dropBridge } from '@/lib/dropBridge';

type SceneControls = {
  enabled: boolean;
  autoRotate: boolean;
  maxDistance: number;
  target: THREE.Vector3;
  update: () => void;
};
const ACCENT = '#d5f582';
const BACKGROUND = '#181c1e';
const MAX_COORDINATE = 100;
const ignoreRaycast = () => {};

function displayRadius(sym: string, style: DisplayStyle) {
  const radius = atomRadius(sym);
  if (style === 'wireframe') return Math.max(0.12, radius * 0.27);
  // These are illustration radii; atom coordinates remain in ångströms.
  if (style === 'space-fill') return radius * 1.9;
  return radius * 0.79;
}

function clampPosition(position: THREE.Vector3): [number, number, number] {
  return position
    .toArray()
    .map((value) => THREE.MathUtils.clamp(value, -MAX_COORDINATE, MAX_COORDINATE)) as [
    number,
    number,
    number,
  ];
}

/** Use the actual canvas bounds: the workbench may sit between HTML panels. */
function DropBridge() {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  useEffect(() => {
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const hit = new THREE.Vector3();
    const normal = new THREE.Vector3();
    const center = new THREE.Vector3();
    const plane = new THREE.Plane();
    const drop = (clientX: number, clientY: number, _rect: DOMRect, sym: string) => {
      const rect = gl.domElement.getBoundingClientRect();
      if (
        !rect.width ||
        !rect.height ||
        clientX < rect.left ||
        clientX > rect.right ||
        clientY < rect.top ||
        clientY > rect.bottom
      )
        return;
      const { atoms, addAtom } = useBench.getState();
      center.set(0, 0, 0);
      for (const atom of atoms) center.add(new THREE.Vector3(...atom.pos));
      if (atoms.length) center.divideScalar(atoms.length);
      camera.getWorldDirection(normal);
      plane.setFromNormalAndCoplanarPoint(normal, center);
      ndc.set(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, camera);
      if (raycaster.ray.intersectPlane(plane, hit)) addAtom(sym, clampPosition(hit));
    };
    dropBridge.fn = drop;
    return () => {
      if (dropBridge.fn === drop) dropBridge.fn = null;
    };
  }, [camera, gl]);
  return null;
}

/** A single pointer listener set serves every atom, with one undo entry per drag. */
function useAtomInteraction() {
  const getScene = useThree((state) => state.get);
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const controls = useThree((state) => state.controls) as unknown as SceneControls | null;
  const drag = useRef<{
    id: string;
    pointerId: number;
    plane: THREE.Plane;
    offset: THREE.Vector3;
    controlsWereEnabled: boolean;
    resetToken: number;
    history: ReturnType<typeof useBench.getState>['past'];
  } | null>(null);

  useEffect(() => {
    const mutableControls = getScene().controls as unknown as SceneControls | null;
    const canvas = gl.domElement;
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const hit = new THREE.Vector3();
    const finish = (event?: PointerEvent) => {
      const active = drag.current;
      if (!active || (event && event.pointerId !== active.pointerId)) return;
      drag.current = null;
      if (mutableControls) {
        mutableControls.enabled = active.controlsWereEnabled;
        mutableControls.autoRotate = useBench.getState().autoRotate;
      }
      canvas.style.cursor = '';
      if (canvas.hasPointerCapture(active.pointerId))
        canvas.releasePointerCapture(active.pointerId);
      useBench.getState().endMove();
    };
    const onMove = (event: PointerEvent) => {
      const active = drag.current;
      if (!active || event.pointerId !== active.pointerId) return;
      if (event.pointerType === 'mouse' && (event.buttons & 1) === 0) {
        finish(event);
        return;
      }
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      ndc.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, camera);
      if (raycaster.ray.intersectPlane(active.plane, hit)) {
        useBench.getState().moveAtom(active.id, clampPosition(hit.add(active.offset)));
      }
    };
    const onBlur = () => finish();
    const unsubscribe = useBench.subscribe((state) => {
      const active = drag.current;
      if (
        active &&
        (state.mode !== 'move' ||
          state.selectedId !== active.id ||
          state.resetViewToken !== active.resetToken ||
          state.past !== active.history ||
          !state.atoms.some((atom) => atom.id === active.id))
      )
        finish();
    });
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    window.addEventListener('blur', onBlur);
    canvas.addEventListener('lostpointercapture', finish);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      window.removeEventListener('blur', onBlur);
      canvas.removeEventListener('lostpointercapture', finish);
      unsubscribe();
      finish();
      canvas.style.cursor = '';
    };
  }, [camera, controls, getScene, gl]);

  const onAtomDown = useCallback(
    (event: ThreeEvent<PointerEvent>, atom: PlacedAtom) => {
      if (event.button !== 0 || drag.current) return;
      event.stopPropagation();
      const state = useBench.getState();
      const mutableControls = getScene().controls as unknown as SceneControls | null;
      if (state.mode === 'delete') {
        state.removeAtom(atom.id);
        return;
      }
      if (state.mode === 'bond') {
        state.clickAtomBond(atom.id);
        return;
      }
      const position = new THREE.Vector3(...atom.pos);
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
        camera.getWorldDirection(new THREE.Vector3()),
        position,
      );
      const hit = event.ray.intersectPlane(plane, new THREE.Vector3());
      if (!hit) return;
      drag.current = {
        id: atom.id,
        pointerId: event.pointerId,
        plane,
        offset: position.sub(hit),
        controlsWereEnabled: mutableControls?.enabled ?? true,
        resetToken: state.resetViewToken,
        history: state.past,
      };
      state.beginMove();
      state.select(atom.id);
      if (mutableControls) {
        mutableControls.enabled = false;
        mutableControls.autoRotate = false;
      }
      gl.domElement.style.setProperty('cursor', 'grabbing');
      gl.domElement.setPointerCapture(event.pointerId);
    },
    [camera, getScene, gl],
  );

  const onHover = useCallback(
    (hovering: boolean) => {
      if (drag.current) return;
      const mode = useBench.getState().mode;
      gl.domElement.style.setProperty(
        'cursor',
        hovering
          ? mode === 'delete'
            ? 'not-allowed'
            : mode === 'bond'
              ? 'crosshair'
              : 'grab'
          : '',
      );
    },
    [gl],
  );
  return { onAtomDown, onHover };
}

const AtomMesh = memo(function AtomMesh({
  atom,
  style,
  labels,
  selected,
  source,
  onAtomDown,
  onHover,
}: {
  atom: PlacedAtom;
  style: DisplayStyle;
  labels: boolean;
  selected: boolean;
  source: boolean;
  onAtomDown: (event: ThreeEvent<PointerEvent>, atom: PlacedAtom) => void;
  onHover: (hovering: boolean) => void;
}) {
  const radius = displayRadius(atom.sym, style);
  return (
    <group position={atom.pos}>
      <mesh
        castShadow
        receiveShadow
        onPointerDown={(event) => onAtomDown(event, atom)}
        onClick={(event) => {
          if (event.button === 0) event.stopPropagation();
        }}
        onPointerOver={(event) => {
          event.stopPropagation();
          onHover(true);
        }}
        onPointerOut={() => onHover(false)}
      >
        <sphereGeometry args={[radius, 40, 32]} />
        <meshPhysicalMaterial
          color={atomColor(atom.sym)}
          roughness={0.23}
          metalness={0.12}
          clearcoat={0.85}
          clearcoatRoughness={0.2}
          envMapIntensity={0.65}
          emissive={source || selected ? ACCENT : '#000000'}
          emissiveIntensity={source ? 0.22 : selected ? 0.08 : 0}
        />
      </mesh>
      {(selected || source) && (
        <Billboard>
          <mesh raycast={ignoreRaycast}>
            <ringGeometry args={[radius * 1.17, radius * 1.17 + 0.025, 64]} />
            <meshBasicMaterial
              color={ACCENT}
              transparent
              opacity={source ? 1 : 0.8}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
        </Billboard>
      )}
      {labels && (
        <Html
          center
          distanceFactor={9}
          position={[0, radius + 0.2, 0]}
          zIndexRange={[8, 0]}
          style={{ pointerEvents: 'none' }}
        >
          <span
            style={{
              display: 'block',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 11,
              color: selected || source ? ACCENT : '#eef0e8',
              textShadow: '0 1px 5px #101314',
              background: '#171b1ed9',
              padding: '2px 5px',
              borderRadius: 4,
              userSelect: 'none',
              border: '1px solid #ffffff12',
            }}
          >
            {atom.sym}
          </span>
        </Html>
      )}
    </group>
  );
});

const BondMesh = memo(function BondMesh({
  bond,
  a,
  b,
  style,
}: {
  bond: Bond;
  a: PlacedAtom;
  b: PlacedAtom;
  style: DisplayStyle;
}) {
  const parts = useMemo(() => {
    const start = new THREE.Vector3(...a.pos);
    const end = new THREE.Vector3(...b.pos);
    const direction = end.clone().sub(start);
    const length = direction.length();
    if (length < 0.001) return [];
    direction.divideScalar(length);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction,
    );
    const reference =
      Math.abs(direction.z) < 0.85 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
    const perpendicular = reference.cross(direction).normalize();
    const gap = style === 'wireframe' ? 0.09 : 0.19;
    const offsets =
      bond.order === 1 ? [0] : bond.order === 2 ? [-gap / 2, gap / 2] : [-gap, 0, gap];
    return offsets.map((offset) => ({
      position: start.clone().add(end).multiplyScalar(0.5).addScaledVector(perpendicular, offset),
      quaternion,
      length,
    }));
  }, [a.pos, b.pos, bond.order, style]);
  if (style === 'space-fill') return null;
  const radius = style === 'wireframe' ? 0.026 : bond.order === 1 ? 0.087 : 0.065;
  const onClick = (event: ThreeEvent<MouseEvent>) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    const state = useBench.getState();
    if (state.mode === 'move' || state.mode === 'bond') state.cycleBond(bond.id);
    else if (state.mode === 'delete') state.removeBond(bond.id);
  };
  return (
    <group>
      {parts.map((part, index) => (
        <group key={index} position={part.position} quaternion={part.quaternion}>
          <mesh castShadow position={[0, -part.length / 4, 0]} onClick={onClick}>
            <cylinderGeometry args={[radius, radius, part.length / 2, 16]} />
            <meshStandardMaterial color={atomColor(a.sym)} roughness={0.28} metalness={0.12} />
          </mesh>
          <mesh castShadow position={[0, part.length / 4, 0]} onClick={onClick}>
            <cylinderGeometry args={[radius, radius, part.length / 2, 16]} />
            <meshStandardMaterial color={atomColor(b.sym)} roughness={0.28} metalness={0.12} />
          </mesh>
        </group>
      ))}
    </group>
  );
});

function CameraRig() {
  const resetViewToken = useBench((state) => state.resetViewToken);
  const autoRotate = useBench((state) => state.autoRotate);
  const getScene = useThree((state) => state.get);
  const activeControls = useThree((state) => state.controls);
  const size = useThree((state) => state.size);
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    const camera = getScene().camera;
    const controls = getScene().controls as unknown as SceneControls | null;
    if (!controls || !(camera instanceof THREE.PerspectiveCamera)) return;
    const { atoms, displayStyle } = useBench.getState();
    const bounds = new THREE.Box3();
    for (const atom of atoms) {
      const position = new THREE.Vector3(...atom.pos);
      const radius = displayRadius(atom.sym, displayStyle) + 0.16;
      bounds.expandByPoint(position.clone().addScalar(radius));
      bounds.expandByPoint(position.clone().subScalar(radius));
    }
    const center = atoms.length ? bounds.getCenter(new THREE.Vector3()) : new THREE.Vector3();
    const radius = atoms.length
      ? Math.max(1.5, bounds.getBoundingSphere(new THREE.Sphere()).radius)
      : 2.5;
    const verticalFov = THREE.MathUtils.degToRad(camera.fov);
    const horizontalFov =
      2 *
      Math.atan(Math.tan(verticalFov / 2) * Math.max(size.width / Math.max(size.height, 1), 0.2));
    const distance = Math.max(
      6.5,
      (radius / Math.sin(Math.min(verticalFov, horizontalFov) / 2)) * 1.12,
    );
    const direction = new THREE.Vector3(0.65, 0.45, 2).normalize();
    camera.position.copy(center).addScaledVector(direction, distance);
    camera.near = 0.05;
    camera.far = Math.max(500, distance * 6);
    camera.updateProjectionMatrix();
    controls.target.copy(center);
    controls.maxDistance = Math.max(60, distance * 4);
    controls.update();
    invalidate();
  }, [getScene, activeControls, invalidate, resetViewToken, size.width, size.height]);
  return (
    <OrbitControls
      makeDefault
      enableDamping
      dampingFactor={0.09}
      rotateSpeed={0.7}
      panSpeed={0.75}
      autoRotate={autoRotate}
      autoRotateSpeed={0.7}
      minDistance={1.6}
      maxDistance={700}
      minPolarAngle={0.05}
      maxPolarAngle={Math.PI - 0.05}
    />
  );
}

function ContextGuard({ onContextLost }: { onContextLost: () => void }) {
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

// Keep environment children stable so dragging an atom does not rebake the cubemap.
const StudioLighting = memo(function StudioLighting() {
  return (
    <>
      <ambientLight intensity={0.35} />
      <hemisphereLight args={['#e8f2ee', '#3f4850', 1.05]} />
      <directionalLight
        position={[-4, 9, 6]}
        intensity={2.3}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
        shadow-camera-near={0.1}
        shadow-camera-far={40}
        shadow-normalBias={0.035}
        shadow-bias={-0.00015}
      />
      <directionalLight position={[5, 1, -4]} intensity={1.7} color="#dcebc2" />
      <directionalLight position={[-7, -2, 3]} intensity={0.55} color="#91a9c1" />
      <Environment resolution={128} frames={1}>
        <Lightformer
          form="rect"
          intensity={3}
          color="#ffffff"
          position={[-4, 5, 4]}
          scale={[4, 5, 1]}
        />
        <Lightformer
          form="rect"
          intensity={1.8}
          color="#dbe7f3"
          position={[5, 2, 0]}
          scale={[3, 7, 1]}
        />
        <Lightformer
          form="rect"
          intensity={2}
          color="#d5f582"
          position={[0, 4, -5]}
          scale={[5, 2, 1]}
        />
      </Environment>
    </>
  );
});

function MoleculeScene() {
  const atoms = useBench((state) => state.atoms);
  const bonds = useBench((state) => state.bonds);
  const selectedId = useBench((state) => state.selectedId);
  const bondSourceId = useBench((state) => state.bondSourceId);
  const displayStyle = useBench((state) => state.displayStyle);
  const showLabels = useBench((state) => state.showLabels);
  const showGrid = useBench((state) => state.showGrid);
  const { onAtomDown, onHover } = useAtomInteraction();
  const atomMap = useMemo(() => new Map(atoms.map((atom) => [atom.id, atom])), [atoms]);
  const floorY = useMemo(
    () =>
      atoms.length
        ? Math.min(...atoms.map((atom) => atom.pos[1] - displayRadius(atom.sym, displayStyle))) -
          0.65
        : -1.5,
    [atoms, displayStyle],
  );
  return (
    <>
      <color attach="background" args={[BACKGROUND]} />
      <StudioLighting />
      {showGrid && (
        <>
          <Grid
            position={[0, floorY, 0]}
            args={[80, 80]}
            cellSize={1}
            cellThickness={0.55}
            cellColor="#30383a"
            sectionSize={5}
            sectionThickness={0.8}
            sectionColor="#46514d"
            fadeDistance={24}
            fadeStrength={2.5}
            infiniteGrid
          />
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, floorY - 0.01, 0]}
            receiveShadow
            raycast={ignoreRaycast}
          >
            <planeGeometry args={[160, 160]} />
            <shadowMaterial transparent opacity={0.24} depthWrite={false} />
          </mesh>
        </>
      )}
      <DropBridge />
      {bonds.map((bond) => {
        const a = atomMap.get(bond.a);
        const b = atomMap.get(bond.b);
        return a && b ? (
          <BondMesh key={bond.id} bond={bond} a={a} b={b} style={displayStyle} />
        ) : null;
      })}
      {atoms.map((atom) => (
        <AtomMesh
          key={atom.id}
          atom={atom}
          style={displayStyle}
          labels={showLabels}
          selected={selectedId === atom.id}
          source={bondSourceId === atom.id}
          onAtomDown={onAtomDown}
          onHover={onHover}
        />
      ))}
      <CameraRig />
    </>
  );
}

function SceneFallback({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="status"
      style={{
        height: '100%',
        minHeight: 300,
        display: 'grid',
        placeContent: 'center',
        padding: 32,
        textAlign: 'center',
        color: '#edf0e5',
        background: BACKGROUND,
      }}
    >
      <svg
        width="66"
        height="60"
        viewBox="0 0 66 60"
        fill="none"
        aria-hidden="true"
        style={{ margin: '0 auto 20px' }}
      >
        <path d="M15 39 33 15 53 40 15 39Z" stroke="#637149" strokeWidth="2" />
        <circle cx="33" cy="15" r="10" fill="#d5f582" />
        <circle cx="15" cy="39" r="8" fill="#6d7971" />
        <circle cx="53" cy="40" r="8" fill="#9aaca0" />
      </svg>
      <strong style={{ fontSize: 18 }}>3D view is unavailable</strong>
      <p
        style={{
          maxWidth: 330,
          fontSize: 13,
          lineHeight: 1.7,
          color: '#9ca7a4',
          margin: '12px auto 20px',
        }}
      >
        Enable hardware acceleration or try another browser. Your molecule and editing tools are
        still available.
      </p>
      <button
        type="button"
        onClick={onRetry}
        style={{
          justifySelf: 'center',
          cursor: 'pointer',
          border: '1px solid #d5f58250',
          borderRadius: 8,
          background: '#d5f58218',
          padding: '10px 16px',
          color: ACCENT,
          fontSize: 13,
        }}
      >
        Retry 3D view
      </button>
    </div>
  );
}

class SceneBoundary extends Component<
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

export default function Bench3D() {
  const autoRotate = useBench((state) => state.autoRotate);
  const [generation, setGeneration] = useState(0);
  const [contextLost, setContextLost] = useState(() => !supportsWebGL());
  const onContextLost = useCallback(() => setContextLost(true), []);
  const onRetry = useCallback(() => {
    setContextLost(!supportsWebGL());
    setGeneration((value) => value + 1);
  }, []);
  const fallback = <SceneFallback onRetry={onRetry} />;
  return (
    <SceneBoundary key={generation} fallback={fallback}>
      {contextLost ? (
        fallback
      ) : (
        <Canvas
          camera={{ position: [5, 5, 12], fov: 40, near: 0.05, far: 500 }}
          dpr={[1, 1.75]}
          shadows
          frameloop={autoRotate ? 'always' : 'demand'}
          gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
          fallback={fallback}
          onPointerMissed={(event) => {
            if (event.button === 0 && useBench.getState().mode === 'move')
              useBench.getState().select(null);
          }}
          style={{ touchAction: 'none', background: BACKGROUND }}
          aria-label="Interactive 3D molecule. Drag atoms to move; drag empty space to orbit; scroll to zoom."
        >
          <ContextGuard onContextLost={onContextLost} />
          <MoleculeScene />
        </Canvas>
      )}
    </SceneBoundary>
  );
}
