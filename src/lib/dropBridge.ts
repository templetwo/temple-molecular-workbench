/** HTML drag-and-drop handoff, registered only while the 3D scene is mounted. */
export const dropBridge: {
  fn: ((clientX: number, clientY: number, rect: DOMRect, sym: string) => void) | null;
} = { fn: null };
