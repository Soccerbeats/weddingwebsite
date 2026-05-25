'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useViewport } from '@xyflow/react';

export interface Wall {
  id: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface WallOverlayProps {
  walls: Wall[];
  drawMode: boolean;
  onWallAdded: (wall: Wall) => void;
  onWallDeleted: (id: number) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export default function WallOverlay({
  walls,
  drawMode,
  onWallAdded,
  onWallDeleted,
  containerRef,
}: WallOverlayProps) {
  const { x: vpX, y: vpY, zoom } = useViewport();
  const [pendingStart, setPendingStart] = useState<{ x: number; y: number } | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [hoveredWall, setHoveredWall] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Convert screen coords → flow canvas coords
  const screenToCanvas = useCallback(
    (screenX: number, screenY: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return {
        x: (screenX - rect.left - vpX) / zoom,
        y: (screenY - rect.top - vpY) / zoom,
      };
    },
    [vpX, vpY, zoom, containerRef]
  );

  const handleSvgClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!drawMode) return;
      // Don't trigger if clicking a delete button
      if ((e.target as SVGElement).closest('.wall-delete')) return;

      const canvas = screenToCanvas(e.clientX, e.clientY);

      if (!pendingStart) {
        setPendingStart(canvas);
      } else {
        // Complete the wall
        const newWall = { x1: pendingStart.x, y1: pendingStart.y, x2: canvas.x, y2: canvas.y };
        setPendingStart(null);

        fetch('/api/admin/seating/walls', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newWall),
        })
          .then(r => r.json())
          .then(data => { if (data.wall) onWallAdded(data.wall); });
      }
    },
    [drawMode, pendingStart, screenToCanvas, onWallAdded]
  );

  const handleSvgMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!drawMode || !pendingStart) return;
      setMousePos(screenToCanvas(e.clientX, e.clientY));
    },
    [drawMode, pendingStart, screenToCanvas]
  );

  // Cancel pending line on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPendingStart(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Convert canvas coords → SVG screen coords
  const toSvg = (cx: number, cy: number) => ({
    x: cx * zoom + vpX,
    y: cy * zoom + vpY,
  });

  const deleteBtnSize = 14;

  return (
    <svg
      ref={svgRef}
      className="absolute inset-0 w-full h-full"
      style={{
        pointerEvents: drawMode ? 'all' : 'none',
        cursor: drawMode ? (pendingStart ? 'crosshair' : 'crosshair') : 'default',
        zIndex: 5,
      }}
      onClick={handleSvgClick}
      onMouseMove={handleSvgMouseMove}
    >
      {/* Existing walls */}
      {walls.map(wall => {
        const p1 = toSvg(wall.x1, wall.y1);
        const p2 = toSvg(wall.x2, wall.y2);
        const mx = (p1.x + p2.x) / 2;
        const my = (p1.y + p2.y) / 2;
        const isHovered = hoveredWall === wall.id;

        return (
          <g
            key={wall.id}
            onMouseEnter={() => !drawMode && setHoveredWall(wall.id)}
            onMouseLeave={() => setHoveredWall(null)}
            style={{ pointerEvents: drawMode ? 'none' : 'all' }}
          >
            {/* Thick invisible hit target */}
            <line
              x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
              stroke="transparent"
              strokeWidth={16}
              style={{ cursor: 'pointer' }}
            />
            {/* Visible wall line */}
            <line
              x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
              stroke={isHovered ? '#ef4444' : '#374151'}
              strokeWidth={isHovered ? 3 : 2}
              strokeLinecap="round"
            />
            {/* Endpoint dots */}
            <circle cx={p1.x} cy={p1.y} r={3} fill={isHovered ? '#ef4444' : '#6b7280'} />
            <circle cx={p2.x} cy={p2.y} r={3} fill={isHovered ? '#ef4444' : '#6b7280'} />

            {/* Delete button on hover */}
            {isHovered && (
              <g
                className="wall-delete"
                transform={`translate(${mx - deleteBtnSize / 2}, ${my - deleteBtnSize / 2})`}
                onClick={e => { e.stopPropagation(); onWallDeleted(wall.id); setHoveredWall(null); }}
                style={{ cursor: 'pointer' }}
              >
                <circle
                  cx={deleteBtnSize / 2} cy={deleteBtnSize / 2} r={deleteBtnSize / 2}
                  fill="#ef4444"
                />
                <text
                  x={deleteBtnSize / 2} y={deleteBtnSize / 2 + 4}
                  textAnchor="middle"
                  fill="white"
                  fontSize={11}
                  fontWeight="bold"
                  style={{ userSelect: 'none' }}
                >
                  ×
                </text>
              </g>
            )}
          </g>
        );
      })}

      {/* Preview line while drawing */}
      {drawMode && pendingStart && mousePos && (() => {
        const p1 = toSvg(pendingStart.x, pendingStart.y);
        const p2 = toSvg(mousePos.x, mousePos.y);
        return (
          <>
            <line
              x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
              stroke="#3b82f6"
              strokeWidth={2}
              strokeDasharray="6 3"
              strokeLinecap="round"
            />
            <circle cx={p1.x} cy={p1.y} r={5} fill="#3b82f6" opacity={0.8} />
            <circle cx={p2.x} cy={p2.y} r={4} fill="#3b82f6" opacity={0.5} />
          </>
        );
      })()}

      {/* Start point indicator when draw mode is active but no pending line */}
      {drawMode && pendingStart && !mousePos && (() => {
        const p = toSvg(pendingStart.x, pendingStart.y);
        return <circle cx={p.x} cy={p.y} r={5} fill="#3b82f6" opacity={0.8} />;
      })()}
    </svg>
  );
}
