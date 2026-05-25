'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useViewport } from '@xyflow/react';

export interface Vertex { x: number; y: number; }
export interface RoomShape { id: number; vertices: Vertex[]; }

interface RoomEditorProps {
  room: RoomShape | null;
  active: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onRoomChange: (vertices: Vertex[]) => void;
  onSave: (vertices: Vertex[]) => Promise<void>;
  onDelete: () => Promise<void>;
}

const DEFAULT_SIZE = 400;
const DEFAULT_ORIGIN = { x: 80, y: 80 };
const JOINT_STEP = 80; // initial step size when adding a joint

// Determine if edge i→j is horizontal or vertical from vertex coordinates
function edgeOrientation(A: Vertex, B: Vertex): 'H' | 'V' {
  const dx = Math.abs(A.x - B.x);
  const dy = Math.abs(A.y - B.y);
  // For zero-length edges, caller should fall back to index parity
  return dx >= dy ? 'H' : 'V';
}

// Add a joint to edge [edgeIndex → (edgeIndex+1)%n]
// Replaces the second vertex (B) with P1, P2, B_new,
// where P1→P2 is the new perpendicular segment (initially JOINT_STEP deep)
function addJointToEdge(vertices: Vertex[], edgeIndex: number): Vertex[] {
  const n = vertices.length;
  const i = edgeIndex;
  const j = (i + 1) % n;
  const A = vertices[i];
  const B = vertices[j];

  const isH = edgeOrientation(A, B) === 'H';
  let P1: Vertex, P2: Vertex, B_new: Vertex;

  if (isH) {
    const midX = (A.x + B.x) / 2;
    // Step downward (positive y) by JOINT_STEP
    P1 = { x: midX, y: A.y };
    P2 = { x: midX, y: A.y + JOINT_STEP };
    B_new = { x: B.x, y: A.y + JOINT_STEP };
  } else {
    const midY = (A.y + B.y) / 2;
    // Step rightward (positive x) by JOINT_STEP
    P1 = { x: A.x, y: midY };
    P2 = { x: A.x + JOINT_STEP, y: midY };
    B_new = { x: A.x + JOINT_STEP, y: B.y };
  }

  const newVertices = [...vertices];
  if (j === 0) {
    // Wrap-around edge: B is index 0
    newVertices[0] = B_new;
    newVertices.splice(n, 0, P1, P2); // append at end (before wrap)
    // Actually splice at i+1
    newVertices.splice(i + 1, 0, P1, P2);
    newVertices[0] = B_new;
    // Redo: just rebuild
    const rebuilt = [...vertices];
    rebuilt.splice(i + 1, 0, P1, P2);
    rebuilt[0] = B_new;
    return rebuilt;
  } else {
    // Replace vertex j with P1, P2, B_new
    newVertices.splice(j, 1, P1, P2, B_new);
    return newVertices;
  }
}

export default function RoomEditor({
  room,
  active,
  containerRef,
  onRoomChange,
  onSave,
  onDelete,
}: RoomEditorProps) {
  const { x: vpX, y: vpY, zoom } = useViewport();

  // Local vertices for smooth dragging (no round-trips during drag)
  const [localVertices, setLocalVertices] = useState<Vertex[] | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<number | null>(null);
  const [newlyAddedEdge, setNewlyAddedEdge] = useState<number | null>(null);

  const dragging = useRef<{
    edgeIndex: number;
    isH: boolean;
    startMX: number; // mouse canvas coords at drag start
    startMY: number;
    startVertices: Vertex[];
  } | null>(null);

  const vertices = localVertices ?? room?.vertices ?? [];

  // Convert screen → canvas flow coords
  const toCanvas = useCallback((sx: number, sy: number): Vertex => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: (sx - rect.left - vpX) / zoom, y: (sy - rect.top - vpY) / zoom };
  }, [vpX, vpY, zoom, containerRef]);

  // Convert canvas flow coords → SVG screen pixels
  const toSvg = useCallback((cx: number, cy: number) => ({
    x: cx * zoom + vpX,
    y: cy * zoom + vpY,
  }), [vpX, vpY, zoom]);

  // Sync local vertices when room changes (and not dragging)
  useEffect(() => {
    if (!dragging.current && room) {
      setLocalVertices(room.vertices);
    }
  }, [room]);

  const handleEdgeMouseDown = useCallback((e: React.MouseEvent, edgeIndex: number) => {
    if (!active || vertices.length === 0) return;
    e.preventDefault();
    e.stopPropagation();

    const n = vertices.length;
    const i = edgeIndex;
    const j = (i + 1) % n;
    const A = vertices[i];
    const B = vertices[j];
    const ori = edgeOrientation(A, B);
    // For zero-length edge, use parity fallback
    const isH = (A.x === B.x && A.y === B.y) ? (edgeIndex % 2 === 0) : (ori === 'H');

    const mouse = toCanvas(e.clientX, e.clientY);
    dragging.current = {
      edgeIndex,
      isH,
      startMX: mouse.x,
      startMY: mouse.y,
      startVertices: vertices.map(v => ({ ...v })),
    };
  }, [active, vertices, toCanvas]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragging.current) return;
    const { edgeIndex, isH, startMX, startMY, startVertices } = dragging.current;
    const n = startVertices.length;
    const i = edgeIndex;
    const j = (i + 1) % n;

    const mouse = toCanvas(e.clientX, e.clientY);
    const dx = mouse.x - startMX;
    const dy = mouse.y - startMY;

    const newV = startVertices.map(v => ({ ...v }));
    if (isH) {
      // Horizontal edge: drag up/down → change y of both endpoints
      newV[i] = { ...newV[i], y: startVertices[i].y + dy };
      newV[j] = { ...newV[j], y: startVertices[j].y + dy };
    } else {
      // Vertical edge: drag left/right → change x of both endpoints
      newV[i] = { ...newV[i], x: startVertices[i].x + dx };
      newV[j] = { ...newV[j], x: startVertices[j].x + dx };
    }
    setLocalVertices(newV);
    onRoomChange(newV);
  }, [toCanvas, onRoomChange]);

  const handleMouseUp = useCallback(async () => {
    if (!dragging.current || !localVertices) return;
    dragging.current = null;
    await onSave(localVertices);
  }, [localVertices, onSave]);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  const handleAddJoint = useCallback(async (edgeIndex: number) => {
    const newV = addJointToEdge(vertices, edgeIndex);
    setLocalVertices(newV);
    onRoomChange(newV);
    await onSave(newV);
    // The new perpendicular edge is at edgeIndex+1 (P1→P2)
    setNewlyAddedEdge(edgeIndex + 1);
    setTimeout(() => setNewlyAddedEdge(null), 2000);
  }, [vertices, onRoomChange, onSave]);

  // Build SVG polygon path
  const n = vertices.length;
  if (n < 3) {
    return (
      <svg className="absolute inset-0 w-full h-full" style={{ zIndex: 4, pointerEvents: 'none' }} />
    );
  }

  const svgPts = vertices.map(v => toSvg(v.x, v.y));
  const pathD = svgPts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') + ' Z';

  return (
    <svg
      className="absolute inset-0 w-full h-full"
      style={{ zIndex: 4, pointerEvents: 'none' }}
    >
      {/* Room fill */}
      <path
        d={pathD}
        fill="rgba(99,102,241,0.06)"
        stroke="#6366f1"
        strokeWidth={2}
        strokeDasharray={active ? undefined : '6 3'}
      />

      {/* Per-edge handles */}
      {vertices.map((v, i) => {
        const j = (i + 1) % n;
        const A = svgPts[i];
        const B = svgPts[j];
        const mx = (A.x + B.x) / 2;
        const my = (A.y + B.y) / 2;

        const Ac = vertices[i];
        const Bc = vertices[j];
        const ori = edgeOrientation(Ac, Bc);
        const isH = (Ac.x === Bc.x && Ac.y === Bc.y) ? (i % 2 === 0) : (ori === 'H');

        const edgeLenSvg = Math.hypot(B.x - A.x, B.y - A.y);
        const isHovered = hoveredEdge === i;
        const isNew = newlyAddedEdge === i;

        // Hamburger cursor direction
        const cursor = isH ? 'ns-resize' : 'ew-resize';

        return (
          <g key={i} style={{ pointerEvents: active ? 'all' : 'none' }}>
            {/* Invisible wide hit target for hover detection */}
            <line
              x1={A.x} y1={A.y} x2={B.x} y2={B.y}
              stroke="transparent"
              strokeWidth={20}
              onMouseEnter={() => setHoveredEdge(i)}
              onMouseLeave={() => setHoveredEdge(null)}
            />

            {/* Hamburger handle — always shown when active, highlighted when hovered/new */}
            {active && edgeLenSvg > 2 && (
              <g
                transform={`translate(${mx},${my})`}
                style={{ cursor, pointerEvents: 'all' }}
                onMouseEnter={() => setHoveredEdge(i)}
                onMouseLeave={() => setHoveredEdge(null)}
                onMouseDown={e => handleEdgeMouseDown(e, i)}
              >
                {/* Handle background */}
                <rect
                  x={-14} y={-12}
                  width={28} height={24}
                  rx={5}
                  fill="white"
                  stroke={isNew ? '#10b981' : isHovered ? '#6366f1' : '#9ca3af'}
                  strokeWidth={isNew ? 2 : 1.5}
                  filter={isNew ? 'drop-shadow(0 0 4px #10b981)' : undefined}
                />
                {/* Hamburger lines */}
                {[-4, 0, 4].map(dy => (
                  <line
                    key={dy}
                    x1={-7} y1={dy} x2={7} y2={dy}
                    stroke={isNew ? '#10b981' : isHovered ? '#6366f1' : '#9ca3af'}
                    strokeWidth={1.5}
                    strokeLinecap="round"
                  />
                ))}
                {/* Direction arrow hint */}
                {isHovered && (
                  <text
                    y={isH ? 22 : 22}
                    textAnchor="middle"
                    fill={isH ? '#6366f1' : '#6366f1'}
                    fontSize={9}
                    style={{ userSelect: 'none', pointerEvents: 'none' }}
                  >
                    {isH ? '↕' : '↔'}
                  </text>
                )}
              </g>
            )}

            {/* Add Joint button — shows on hover when edge is long enough */}
            {active && isHovered && edgeLenSvg > 80 && (
              <g
                transform={`translate(${mx + (isH ? 26 : 0)},${my + (isH ? 0 : 26)})`}
                style={{ cursor: 'pointer', pointerEvents: 'all' }}
                onClick={() => handleAddJoint(i)}
                onMouseEnter={() => setHoveredEdge(i)}
                onMouseLeave={() => setHoveredEdge(null)}
              >
                <circle r={11} fill="#10b981" />
                <text
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="white"
                  fontSize={16}
                  fontWeight="bold"
                  style={{ userSelect: 'none' }}
                >
                  +
                </text>
              </g>
            )}
          </g>
        );
      })}

      {/* Legend when active */}
      {active && (
        <g transform="translate(12, 12)" style={{ pointerEvents: 'none' }}>
          <rect width={220} height={46} rx={6} fill="white" stroke="#e5e7eb" strokeWidth={1} opacity={0.95} />
          <text x={10} y={17} fontSize={11} fill="#374151" fontWeight="600">Edit Room Shape</text>
          <text x={10} y={32} fontSize={10} fill="#6b7280">≡ drag to resize wall  ·  + add a joint</text>
          <text x={10} y={44} fontSize={10} fill="#6b7280">Press Esc or click Done to exit</text>
        </g>
      )}
    </svg>
  );
}
