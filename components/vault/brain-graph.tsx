"use client";

import * as React from "react";

import {
  ChevronLeftIcon,
  FitIcon,
  FolderIcon,
  GraphIcon,
  LoadingIcon,
  MinusIcon,
  NoteIcon,
  PlusIcon,
  SearchIcon,
} from "@/components/vault/vault-icons";
import type {
  VaultGraphData,
  VaultGraphEdge,
  VaultGraphNode,
} from "@/lib/vault-graph-types";
import { cn, formatRussianCount } from "@/lib/utils";

type GraphScope = "all" | "folder";

type PositionedNode = VaultGraphNode & {
  degree: number;
  external: boolean;
  radius: number;
  x: number;
  y: number;
};

type GraphLayout = {
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  edges: VaultGraphEdge[];
  nodes: PositionedNode[];
  nodeById: Map<string, PositionedNode>;
};

type BrainGraphProps = {
  activeFolder: string;
  refreshKey: string;
  selectedPath: string | null;
  theme: "light" | "system" | "dark";
  onFolderChange: (folder: string) => void;
  onOpenNote: (path: string) => void;
};

const FOLDER_PALETTE = [
  "#8274f2",
  "#54a9bf",
  "#4ead91",
  "#789b68",
  "#d0a24d",
  "#dc786e",
  "#b878a3",
  "#7084b0",
  "#c17b53",
  "#5d8c7a",
  "#a779d0",
  "#8e8f5c",
] as const;

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const COLOR_STORAGE_KEY = "archeion-brain-folder-colors";

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function defaultFolderColor(folder: string) {
  return FOLDER_PALETTE[stableHash(folder || "__root__") % FOLDER_PALETTE.length];
}

function parseColorOverrides(value: string) {
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

  return Object.fromEntries(
    Object.entries(parsed).filter((entry): entry is [string, string] => (
      typeof entry[1] === "string" && /^#[\da-f]{6}$/i.test(entry[1])
    )),
  );
}

function isInFolder(nodeFolder: string, selectedFolder: string) {
  if (!selectedFolder) return nodeFolder === "";
  return nodeFolder === selectedFolder || nodeFolder.startsWith(`${selectedFolder}/`);
}

function makeGraphLayout(data: VaultGraphData, scope: GraphScope, selectedFolder: string): GraphLayout {
  const degrees = new Map<string, number>();
  for (const edge of data.edges) {
    degrees.set(edge.source, (degrees.get(edge.source) ?? 0) + 1);
    degrees.set(edge.target, (degrees.get(edge.target) ?? 0) + 1);
  }

  const primaryIds = new Set(
    data.nodes
      .filter((node) => scope === "all" || isInFolder(node.folder, selectedFolder))
      .map((node) => node.id),
  );
  const visibleIds = new Set(primaryIds);

  if (scope === "folder") {
    for (const edge of data.edges) {
      if (primaryIds.has(edge.source)) visibleIds.add(edge.target);
      if (primaryIds.has(edge.target)) visibleIds.add(edge.source);
    }
  }

  const visibleEdges = data.edges.filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target));
  const groupedNodes = new Map<string, VaultGraphNode[]>();
  for (const node of data.nodes) {
    if (!visibleIds.has(node.id)) continue;
    groupedNodes.set(node.folder, [...(groupedNodes.get(node.folder) ?? []), node]);
  }

  const groups = [...groupedNodes.entries()].sort(([leftFolder, leftNodes], [rightFolder, rightNodes]) => {
    const leftSelected = scope === "folder" && isInFolder(leftFolder, selectedFolder);
    const rightSelected = scope === "folder" && isInFolder(rightFolder, selectedFolder);
    if (leftSelected !== rightSelected) return leftSelected ? -1 : 1;
    if (leftNodes.length !== rightNodes.length) return rightNodes.length - leftNodes.length;
    return leftFolder.localeCompare(rightFolder, "ru");
  });

  const positionedNodes: PositionedNode[] = [];
  const clusterRadii = groups.map(([, nodes]) => Math.max(68, 34 + Math.sqrt(nodes.length) * 24));
  const largestClusterRadius = clusterRadii.reduce((largest, radius) => Math.max(largest, radius), 68);
  const orbitStep = largestClusterRadius * 2 + 150;

  for (const [groupIndex, [folder, nodes]] of groups.entries()) {
    const clusterRadius = clusterRadii[groupIndex];
    let centerX = 0;
    let centerY = 0;

    if (groupIndex > 0) {
      let ring = 0;
      let ringIndex = groupIndex - 1;
      let consumedGroups = 0;
      let ringCapacity = 8;

      while (ringIndex >= ringCapacity) {
        ringIndex -= ringCapacity;
        consumedGroups += ringCapacity;
        ring += 1;
        ringCapacity = 8 + ring * 4;
      }

      const remainingGroups = groups.length - 1 - consumedGroups;
      const groupsOnRing = Math.min(ringCapacity, remainingGroups);
      const angleOffset = ring % 2 === 0 ? -Math.PI / 2 : -Math.PI / 2 + Math.PI / groupsOnRing;
      const angle = angleOffset + (ringIndex / groupsOnRing) * Math.PI * 2;
      const distance = orbitStep * (ring + 1);
      centerX = Math.cos(angle) * distance;
      centerY = Math.sin(angle) * distance;
    }

    const sortedNodes = [...nodes].sort((left, right) => {
      const degreeDifference = (degrees.get(right.id) ?? 0) - (degrees.get(left.id) ?? 0);
      return degreeDifference || left.title.localeCompare(right.title, "ru");
    });
    const rotation = (stableHash(folder) % 360) * (Math.PI / 180);

    sortedNodes.forEach((node, index) => {
      const degree = degrees.get(node.id) ?? 0;
      const progress = sortedNodes.length <= 1 ? 0 : Math.sqrt(index / (sortedNodes.length - 1));
      const angle = index * GOLDEN_ANGLE + rotation;
      const distance = clusterRadius * 0.82 * progress;

      positionedNodes.push({
        ...node,
        degree,
        external: scope === "folder" && !primaryIds.has(node.id),
        radius: 4.8 + Math.min(5.8, Math.sqrt(degree) * 1.45),
        x: centerX + Math.cos(angle) * distance,
        y: centerY + Math.sin(angle) * distance,
      });
    });
  }

  const nodeById = new Map(positionedNodes.map((node) => [node.id, node]));
  const padding = 90;
  const bounds = positionedNodes.reduce((current, node) => ({
    minX: Math.min(current.minX, node.x - padding),
    minY: Math.min(current.minY, node.y - padding),
    maxX: Math.max(current.maxX, node.x + padding),
    maxY: Math.max(current.maxY, node.y + padding),
  }), positionedNodes.length > 0
    ? { minX: Number.POSITIVE_INFINITY, minY: Number.POSITIVE_INFINITY, maxX: Number.NEGATIVE_INFINITY, maxY: Number.NEGATIVE_INFINITY }
    : { minX: -100, minY: -100, maxX: 100, maxY: 100 });

  return { bounds, edges: visibleEdges, nodes: positionedNodes, nodeById };
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function GraphCanvas({
  colors,
  layout,
  query,
  selectedPath,
  theme,
  onOpenNote,
}: {
  colors: Record<string, string>;
  layout: GraphLayout;
  query: string;
  selectedPath: string | null;
  theme: BrainGraphProps["theme"];
  onOpenNote: (path: string) => void;
}) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const positionsRef = React.useRef(new Map<string, { x: number; y: number }>());
  const viewportRef = React.useRef({ x: 0, y: 0, scale: 1 });
  const sizeRef = React.useRef({ width: 0, height: 0 });
  const frameRef = React.useRef<number | null>(null);
  const drawRef = React.useRef<() => void>(() => undefined);
  const dragRef = React.useRef<{
    kind: "node" | "pan";
    lastX: number;
    lastY: number;
    moved: boolean;
    nodeId?: string;
    pointerId: number;
  } | null>(null);
  const [hovered, setHovered] = React.useState<{ id: string; left: number; top: number } | null>(null);
  const [focusedNodeId, setFocusedNodeId] = React.useState<string | null>(null);
  const [zoomPercent, setZoomPercent] = React.useState(100);
  const [themeRevision, setThemeRevision] = React.useState(0);
  const normalisedQuery = query.trim().toLocaleLowerCase("ru");

  const scheduleDraw = React.useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      drawRef.current();
    });
  }, []);

  const fitGraph = React.useCallback(() => {
    const { width, height } = sizeRef.current;
    if (!width || !height) return;

    const { minX, minY, maxX, maxY } = layout.bounds;
    const graphWidth = Math.max(1, maxX - minX);
    const graphHeight = Math.max(1, maxY - minY);
    const padding = width < 720 ? 54 : 92;
    const scale = clamp(Math.min(
      (width - padding * 2) / graphWidth,
      (height - padding * 2) / graphHeight,
    ), 0.12, 1.7);

    viewportRef.current = {
      scale,
      x: width / 2 - ((minX + maxX) / 2) * scale,
      y: height / 2 - ((minY + maxY) / 2) * scale,
    };
    setZoomPercent(Math.round(scale * 100));
    setHovered(null);
    scheduleDraw();
  }, [layout.bounds, scheduleDraw]);

  React.useEffect(() => {
    positionsRef.current = new Map(layout.nodes.map((node) => [node.id, { x: node.x, y: node.y }]));
    const frame = window.requestAnimationFrame(() => {
      setFocusedNodeId((current) => (current && layout.nodeById.has(current) ? current : null));
      fitGraph();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [fitGraph, layout.nodeById, layout.nodes]);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return undefined;

    const resize = () => {
      const { width, height } = container.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const pixelWidth = Math.max(1, Math.round(width * ratio));
      const pixelHeight = Math.max(1, Math.round(height * ratio));
      sizeRef.current = { width, height };
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      scheduleDraw();
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    return () => observer.disconnect();
  }, [scheduleDraw]);

  React.useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setThemeRevision((revision) => revision + 1);
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributeFilter: ["class"], attributes: true });
    if (theme === "system") media.addEventListener("change", update);

    return () => {
      observer.disconnect();
      media.removeEventListener("change", update);
    };
  }, [theme]);

  React.useEffect(() => () => {
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
  }, []);

  const adjacency = React.useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const edge of layout.edges) {
      map.set(edge.source, new Set([...(map.get(edge.source) ?? []), edge.target]));
      map.set(edge.target, new Set([...(map.get(edge.target) ?? []), edge.source]));
    }
    return map;
  }, [layout.edges]);
  const nodesByRadius = React.useMemo(
    () => [...layout.nodes].sort((left, right) => left.radius - right.radius),
    [layout.nodes],
  );

  const drawGraph = React.useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const { width, height } = sizeRef.current;
    const viewport = viewportRef.current;
    const computed = window.getComputedStyle(container);
    const cssColor = (name: string, fallback: string) => computed.getPropertyValue(name).trim() || fallback;
    const activeNodeId = hovered?.id ?? focusedNodeId;
    const connectedIds = activeNodeId ? adjacency.get(activeNodeId) ?? new Set<string>() : new Set<string>();

    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    context.lineCap = "round";
    context.lineWidth = 0.72;
    context.strokeStyle = cssColor("--graph-edge", "#6f7180");
    context.globalAlpha = activeNodeId ? 0.07 : 0.2;
    context.beginPath();

    for (const edge of layout.edges) {
      const source = positionsRef.current.get(edge.source);
      const target = positionsRef.current.get(edge.target);
      if (!source || !target) continue;
      context.moveTo(source.x * viewport.scale + viewport.x, source.y * viewport.scale + viewport.y);
      context.lineTo(target.x * viewport.scale + viewport.x, target.y * viewport.scale + viewport.y);
    }
    context.stroke();

    if (activeNodeId) {
      context.globalAlpha = 0.72;
      context.lineWidth = 1.15;
      context.strokeStyle = cssColor("--graph-edge-active", "#9689ff");
      context.beginPath();
      for (const edge of layout.edges) {
        if (edge.source !== activeNodeId && edge.target !== activeNodeId) continue;
        const source = positionsRef.current.get(edge.source);
        const target = positionsRef.current.get(edge.target);
        if (!source || !target) continue;
        context.moveTo(source.x * viewport.scale + viewport.x, source.y * viewport.scale + viewport.y);
        context.lineTo(target.x * viewport.scale + viewport.x, target.y * viewport.scale + viewport.y);
      }
      context.stroke();
    }

    for (const node of nodesByRadius) {
      const position = positionsRef.current.get(node.id);
      if (!position) continue;

      const x = position.x * viewport.scale + viewport.x;
      const y = position.y * viewport.scale + viewport.y;
      const radius = clamp(node.radius * Math.sqrt(viewport.scale), 2.2, 11);
      const isActive = node.id === activeNodeId;
      const isConnected = connectedIds.has(node.id);
      const isSelected = node.id === selectedPath;
      const isMatch = normalisedQuery.length > 0 && (
        node.title.toLocaleLowerCase("ru").includes(normalisedQuery)
        || node.path.toLocaleLowerCase("ru").includes(normalisedQuery)
      );
      let opacity = node.external ? 0.34 : 0.9;
      if (activeNodeId && !isActive && !isConnected) opacity *= 0.24;
      if (normalisedQuery && !isMatch && !isActive) opacity *= 0.18;

      if (isActive || isSelected || isMatch) {
        context.globalAlpha = isActive ? 0.23 : 0.14;
        context.fillStyle = isActive
          ? cssColor("--graph-glow", "#9a8eff")
          : colors[node.folder] ?? defaultFolderColor(node.folder);
        context.beginPath();
        context.arc(x, y, radius + (isActive ? 9 : 5), 0, Math.PI * 2);
        context.fill();
      }

      context.globalAlpha = opacity;
      context.fillStyle = colors[node.folder] ?? defaultFolderColor(node.folder);
      context.beginPath();
      context.arc(x, y, radius + (isActive ? 1.4 : 0), 0, Math.PI * 2);
      context.fill();

      context.globalAlpha = Math.min(1, opacity + 0.12);
      context.lineWidth = isSelected ? 1.8 : 0.9;
      context.strokeStyle = isSelected
        ? cssColor("--graph-selected", "#b2a8ff")
        : cssColor("--graph-node-border", "#f2f0ff");
      context.stroke();
    }

    context.globalAlpha = 1;
  }, [
    adjacency,
    colors,
    focusedNodeId,
    hovered?.id,
    layout.edges,
    nodesByRadius,
    normalisedQuery,
    selectedPath,
  ]);

  React.useEffect(() => {
    drawRef.current = drawGraph;
    drawGraph();
  }, [
    drawGraph,
    themeRevision,
  ]);

  function pointInCanvas(clientX: number, clientY: number) {
    const rect = canvasRef.current?.getBoundingClientRect();
    return rect ? { x: clientX - rect.left, y: clientY - rect.top } : { x: 0, y: 0 };
  }

  function pickNode(screenX: number, screenY: number) {
    const viewport = viewportRef.current;
    let picked: PositionedNode | null = null;
    let closestDistance = Number.POSITIVE_INFINITY;

    for (const node of layout.nodes) {
      const position = positionsRef.current.get(node.id);
      if (!position) continue;
      const x = position.x * viewport.scale + viewport.x;
      const y = position.y * viewport.scale + viewport.y;
      const distance = Math.hypot(screenX - x, screenY - y);
      const hitRadius = Math.max(14, node.radius * Math.sqrt(viewport.scale) + 7);
      if (distance <= hitRadius && distance < closestDistance) {
        picked = node;
        closestDistance = distance;
      }
    }
    return picked;
  }

  function updateKeyboardFocus(nodeId: string) {
    const position = positionsRef.current.get(nodeId);
    if (!position) return;
    const viewport = viewportRef.current;
    const { width, height } = sizeRef.current;
    setFocusedNodeId(nodeId);
    setHovered({
      id: nodeId,
      left: clamp(position.x * viewport.scale + viewport.x + 14, 12, Math.max(12, width - 240)),
      top: clamp(position.y * viewport.scale + viewport.y + 14, 12, Math.max(12, height - 88)),
    });
  }

  const zoomAt = React.useCallback((factor: number, screenX?: number, screenY?: number) => {
    const viewport = viewportRef.current;
    const { width, height } = sizeRef.current;
    const anchorX = screenX ?? width / 2;
    const anchorY = screenY ?? height / 2;
    const worldX = (anchorX - viewport.x) / viewport.scale;
    const worldY = (anchorY - viewport.y) / viewport.scale;
    const scale = clamp(viewport.scale * factor, 0.08, 4);

    viewportRef.current = {
      scale,
      x: anchorX - worldX * scale,
      y: anchorY - worldY * scale,
    };
    setZoomPercent(Math.round(scale * 100));
    setHovered(null);
    scheduleDraw();
  }, [scheduleDraw]);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      zoomAt(
        Math.exp(-event.deltaY * 0.0012),
        event.clientX - rect.left,
        event.clientY - rect.top,
      );
    };

    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleWheel);
  }, [zoomAt]);

  const tooltipNode = hovered ? layout.nodeById.get(hovered.id) : null;

  return (
    <div className="absolute inset-0" ref={containerRef}>
      <p className="sr-only" id="brain-graph-instructions">
        Стрелки выбирают заметки. Enter открывает заметку. Плюс и минус меняют масштаб, ноль показывает весь граф.
      </p>
      <canvas
        aria-describedby="brain-graph-instructions"
        aria-label={`Граф знаний: ${formatRussianCount(layout.nodes.length, ["заметка", "заметки", "заметок"])} и ${formatRussianCount(layout.edges.length, ["связь", "связи", "связей"])}`}
        className="absolute inset-0 size-full cursor-grab touch-none outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70"
        onBlur={() => {
          setFocusedNodeId(null);
          setHovered(null);
        }}
        onKeyDown={(event) => {
          const currentIndex = focusedNodeId
            ? layout.nodes.findIndex((node) => node.id === focusedNodeId)
            : -1;
          const forward = event.key === "ArrowRight" || event.key === "ArrowDown";
          const backward = event.key === "ArrowLeft" || event.key === "ArrowUp";

          if ((forward || backward) && layout.nodes.length > 0) {
            event.preventDefault();
            const direction = forward ? 1 : -1;
            const nextIndex = (currentIndex + direction + layout.nodes.length) % layout.nodes.length;
            updateKeyboardFocus(layout.nodes[nextIndex].id);
            return;
          }
          if (event.key === "Enter" && focusedNodeId) {
            event.preventDefault();
            onOpenNote(focusedNodeId);
            return;
          }
          if (event.key === "+" || event.key === "=") {
            event.preventDefault();
            zoomAt(1.18);
            return;
          }
          if (event.key === "-") {
            event.preventDefault();
            zoomAt(1 / 1.18);
            return;
          }
          if (event.key === "0") {
            event.preventDefault();
            fitGraph();
            return;
          }
          if (event.key === "Escape") {
            setFocusedNodeId(null);
            setHovered(null);
          }
        }}
        onPointerCancel={(event) => {
          dragRef.current = null;
          event.currentTarget.style.cursor = "grab";
        }}
        onPointerDown={(event) => {
          const point = pointInCanvas(event.clientX, event.clientY);
          const node = pickNode(point.x, point.y);
          dragRef.current = {
            kind: node ? "node" : "pan",
            lastX: point.x,
            lastY: point.y,
            moved: false,
            nodeId: node?.id,
            pointerId: event.pointerId,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
          event.currentTarget.style.cursor = node ? "grabbing" : "grabbing";
          setHovered(null);
        }}
        onPointerLeave={(event) => {
          if (!dragRef.current) {
            setHovered(null);
            event.currentTarget.style.cursor = "grab";
          }
        }}
        onPointerMove={(event) => {
          const point = pointInCanvas(event.clientX, event.clientY);
          const drag = dragRef.current;

          if (drag) {
            const deltaX = point.x - drag.lastX;
            const deltaY = point.y - drag.lastY;
            if (Math.hypot(deltaX, deltaY) > 1) drag.moved = true;

            if (drag.kind === "node" && drag.nodeId) {
              const position = positionsRef.current.get(drag.nodeId);
              if (position) {
                position.x += deltaX / viewportRef.current.scale;
                position.y += deltaY / viewportRef.current.scale;
              }
            } else {
              viewportRef.current.x += deltaX;
              viewportRef.current.y += deltaY;
            }

            drag.lastX = point.x;
            drag.lastY = point.y;
            scheduleDraw();
            return;
          }

          const node = pickNode(point.x, point.y);
          event.currentTarget.style.cursor = node ? "pointer" : "grab";
          const nodePosition = node ? positionsRef.current.get(node.id) : null;
          const nextHovered = node && nodePosition ? {
            id: node.id,
            left: clamp(
              nodePosition.x * viewportRef.current.scale + viewportRef.current.x + 14,
              12,
              Math.max(12, sizeRef.current.width - 240),
            ),
            top: clamp(
              nodePosition.y * viewportRef.current.scale + viewportRef.current.y + 14,
              12,
              Math.max(12, sizeRef.current.height - 88),
            ),
          } : null;
          setHovered((current) => {
            if (!current && !nextHovered) return current;
            if (
              current
              && nextHovered
              && current.id === nextHovered.id
              && current.left === nextHovered.left
              && current.top === nextHovered.top
            ) return current;
            return nextHovered;
          });
        }}
        onPointerUp={(event) => {
          const drag = dragRef.current;
          dragRef.current = null;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          event.currentTarget.style.cursor = "grab";
          if (drag?.kind === "node" && drag.nodeId && !drag.moved) onOpenNote(drag.nodeId);
        }}
        ref={canvasRef}
        tabIndex={0}
      >
        Карта связей между Markdown-заметками.
      </canvas>

      {tooltipNode && hovered ? (
        <div
          className="pointer-events-none absolute z-30 max-w-60 rounded-md border bg-popover/96 px-3 py-2 text-popover-foreground shadow-md backdrop-blur"
          style={{ left: hovered.left, top: hovered.top }}
        >
          <p className="truncate text-sm font-medium">{tooltipNode.title}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {tooltipNode.folder || "Корень"} · {formatRussianCount(tooltipNode.degree, ["связь", "связи", "связей"])}
          </p>
        </div>
      ) : null}

      <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center rounded-lg border bg-popover/92 p-1 text-popover-foreground shadow-sm backdrop-blur">
        <button
          aria-label="Уменьшить масштаб"
          className="grid size-8 place-items-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/70"
          onClick={() => zoomAt(1 / 1.18)}
          type="button"
        >
          <MinusIcon className="size-4" motion="hover" />
        </button>
        <span className="w-14 text-center text-[11px] tabular-nums text-muted-foreground">{zoomPercent}%</span>
        <button
          aria-label="Увеличить масштаб"
          className="grid size-8 place-items-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/70"
          onClick={() => zoomAt(1.18)}
          type="button"
        >
          <PlusIcon className="size-4" motion="hover" />
        </button>
        <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />
        <button
          aria-label="Показать весь граф"
          className="grid size-8 place-items-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/70"
          onClick={fitGraph}
          title="Показать весь граф (0)"
          type="button"
        >
          <FitIcon className="size-4" motion="hover" />
        </button>
      </div>

      <p aria-live="polite" className="sr-only">
        {tooltipNode ? `${tooltipNode.title}, ${formatRussianCount(tooltipNode.degree, ["связь", "связи", "связей"])}` : ""}
      </p>
    </div>
  );
}

function BrainGraph({
  activeFolder,
  refreshKey,
  selectedPath,
  theme,
  onFolderChange,
  onOpenNote,
}: BrainGraphProps) {
  const [data, setData] = React.useState<VaultGraphData | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [scope, setScope] = React.useState<GraphScope>(activeFolder === "all" ? "all" : "folder");
  const [selectedFolder, setSelectedFolder] = React.useState(activeFolder === "all" ? "" : activeFolder);
  const [query, setQuery] = React.useState("");
  const [isLegendOpen, setIsLegendOpen] = React.useState(true);
  const [colorOverrides, setColorOverrides] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const stored = window.localStorage.getItem(COLOR_STORAGE_KEY);
        if (stored) setColorOverrides(parseColorOverrides(stored));
      } catch {
        window.localStorage.removeItem(COLOR_STORAGE_KEY);
      }

      if (window.matchMedia("(max-width: 767px)").matches) setIsLegendOpen(false);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  React.useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      await Promise.resolve();
      if (!controller.signal.aborted) setError(null);
      try {
        const response = await fetch("/api/vault/graph", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? "Не удалось построить граф");
        }
        const nextData = (await response.json()) as VaultGraphData;
        setData(nextData);
        setSelectedFolder((current) => {
          if (nextData.folders.some((folder) => folder.path === current)) return current;
          if (activeFolder !== "all" && nextData.folders.some((folder) => folder.path === activeFolder)) return activeFolder;
          return [...nextData.folders].sort((left, right) => right.count - left.count)[0]?.path ?? "";
        });
      } catch (requestError) {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(requestError instanceof Error ? requestError.message : "Не удалось построить граф");
      }
    })();

    return () => controller.abort();
  }, [activeFolder, refreshKey]);

  React.useEffect(() => {
    if (activeFolder === "all") return;
    const frame = window.requestAnimationFrame(() => setSelectedFolder(activeFolder));
    return () => window.cancelAnimationFrame(frame);
  }, [activeFolder]);

  const colors = React.useMemo(() => {
    const nodeFolders = [...new Set(data?.nodes.map((node) => node.folder) ?? [])]
      .sort((left, right) => left.localeCompare(right, "ru"));
    const filterFolders = (data?.folders.map((folder) => folder.path) ?? [])
      .filter((folder) => !nodeFolders.includes(folder))
      .sort((left, right) => left.localeCompare(right, "ru"));
    const folderPaths = [...nodeFolders, ...filterFolders];
    return Object.fromEntries(
      folderPaths.map((folder, index) => [
        folder,
        colorOverrides[folder] ?? FOLDER_PALETTE[index % FOLDER_PALETTE.length],
      ]),
    );
  }, [colorOverrides, data]);

  const layout = React.useMemo(
    () => makeGraphLayout(data ?? { nodes: [], edges: [], folders: [] }, scope, selectedFolder),
    [data, scope, selectedFolder],
  );
  const searchResults = React.useMemo(() => {
    const normalised = query.trim().toLocaleLowerCase("ru");
    if (!normalised || !data) return [];
    return data.nodes.filter((node) => (
      node.title.toLocaleLowerCase("ru").includes(normalised)
      || node.path.toLocaleLowerCase("ru").includes(normalised)
    )).slice(0, 6);
  }, [data, query]);

  function updateFolderColor(folder: string, color: string) {
    const affectedFolders = new Set([
      folder,
      ...(data?.nodes
        .filter((node) => isInFolder(node.folder, folder))
        .map((node) => node.folder) ?? []),
    ]);
    const nextColors = { ...colorOverrides };
    for (const affectedFolder of affectedFolders) nextColors[affectedFolder] = color;
    setColorOverrides(nextColors);
    window.localStorage.setItem(COLOR_STORAGE_KEY, JSON.stringify(nextColors));
  }

  function selectFolder(folder: string) {
    setSelectedFolder(folder);
    setScope("folder");
    onFolderChange(folder);
  }

  if (error) {
    return (
      <div className="flex h-full min-h-[32rem] items-center justify-center px-6 text-center">
        <div className="max-w-sm">
          <GraphIcon className="mx-auto size-8 text-muted-foreground" />
          <h2 className="mt-4 text-lg font-semibold">Граф пока недоступен</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div aria-busy="true" className="relative h-full min-h-[32rem] overflow-hidden bg-[var(--graph-background)]">
        <div className="absolute inset-0 brain-graph-field" />
        <div className="absolute left-6 top-6 h-10 w-56 animate-pulse rounded-lg bg-muted/70" />
        <div className="absolute inset-0 grid place-items-center">
          <LoadingIcon className="size-5 text-primary" motion="loop" />
        </div>
      </div>
    );
  }

  return (
    <section aria-label="Атлас — граф знаний" className="relative h-full min-h-[32rem] overflow-hidden bg-[var(--graph-background)]">
      <div aria-hidden="true" className="absolute inset-0 brain-graph-field" />

      {data.nodes.length > 0 ? (
        <GraphCanvas
          colors={colors}
          layout={layout}
          onOpenNote={onOpenNote}
          query={query}
          selectedPath={selectedPath}
          theme={theme}
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center px-6 text-center">
          <div className="max-w-sm">
            <NoteIcon className="mx-auto size-8 text-muted-foreground" />
            <h2 className="mt-4 text-lg font-semibold">Граф ждёт заметки</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">Создайте Markdown-файл — он сразу станет первым узлом.</p>
          </div>
        </div>
      )}

      <div className="absolute left-1/2 top-4 z-20 flex max-w-[calc(100%-7rem)] -translate-x-1/2 items-center gap-2 rounded-lg border bg-popover/92 p-1 text-popover-foreground shadow-sm backdrop-blur">
        <div aria-label="Область графа" className="flex items-center" role="tablist">
          <button
            aria-selected={scope === "all"}
            className={cn(
              "h-8 rounded-md px-3 text-xs font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/70",
              scope === "all" && "bg-muted text-foreground",
            )}
            onClick={() => setScope("all")}
            role="tab"
            type="button"
          >
            Весь Vault
          </button>
          <button
            aria-selected={scope === "folder"}
            className={cn(
              "h-8 rounded-md px-3 text-xs font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/70",
              scope === "folder" && "bg-muted text-foreground",
            )}
            onClick={() => setScope("folder")}
            role="tab"
            type="button"
          >
            Папка
          </button>
        </div>
        {scope === "folder" ? (
          <>
            <span aria-hidden="true" className="h-5 w-px bg-border" />
            <label className="sr-only" htmlFor="brain-folder-scope">Папка графа</label>
            <select
              className="h-8 min-w-0 max-w-44 rounded-md bg-transparent px-2 text-xs font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
              id="brain-folder-scope"
              onChange={(event) => selectFolder(event.target.value)}
              value={selectedFolder}
            >
              {data.folders.map((folder) => (
                <option key={folder.path || "root"} value={folder.path}>{folder.name} · {folder.count}</option>
              ))}
            </select>
          </>
        ) : null}
      </div>

      <button
        aria-expanded={isLegendOpen}
        className={cn(
          "absolute left-4 top-4 z-30 flex h-10 items-center gap-2 rounded-lg border bg-popover/92 px-3 text-xs font-medium text-popover-foreground shadow-sm outline-none backdrop-blur hover:bg-popover focus-visible:ring-2 focus-visible:ring-ring/70",
          isLegendOpen && "md:hidden",
        )}
        onClick={() => setIsLegendOpen((open) => !open)}
        type="button"
      >
        <FolderIcon className="size-4 text-primary" />
        Папки
      </button>

      {isLegendOpen ? (
        <aside className="absolute bottom-16 left-4 top-16 z-30 flex w-[min(17rem,calc(100%-2rem))] flex-col overflow-hidden rounded-xl border bg-popover/94 text-popover-foreground shadow-md backdrop-blur">
          <header className="flex items-center justify-between gap-3 border-b px-3 py-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold">Созвездия</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Цвета папок</p>
            </div>
            <button
              aria-label="Свернуть список папок"
              className="grid size-8 place-items-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/70"
              onClick={() => setIsLegendOpen(false)}
              type="button"
            >
              <ChevronLeftIcon className="size-4" motion="hover" />
            </button>
          </header>

          <div className="border-b p-3">
            <label className="relative block">
              <span className="sr-only">Найти заметку в графе</span>
              <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                className="h-9 w-full rounded-md border bg-background pl-8 pr-2.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/70"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Найти заметку"
                type="search"
                value={query}
              />
            </label>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {query.trim() ? (
              <section aria-label="Результаты поиска" className="mb-3 border-b pb-3">
                <p className="px-2 pb-1.5 text-[11px] font-medium text-muted-foreground">Найдено: {searchResults.length}</p>
                {searchResults.length > 0 ? searchResults.map((node) => (
                  <button
                    className="flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-left text-xs outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/70"
                    key={node.id}
                    onClick={() => onOpenNote(node.path)}
                    type="button"
                  >
                    <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: colors[node.folder] }} />
                    <span className="truncate">{node.title}</span>
                  </button>
                )) : (
                  <p className="px-2 py-2 text-xs text-muted-foreground">Совпадений нет.</p>
                )}
              </section>
            ) : null}

            <div className="grid gap-0.5">
              {data.folders.map((folder) => (
                <div
                  className={cn(
                    "group flex min-h-10 items-center gap-2 rounded-md px-2",
                    scope === "folder" && selectedFolder === folder.path && "bg-muted",
                  )}
                  key={folder.path || "root"}
                >
                  <label className="relative grid size-5 shrink-0 cursor-pointer place-items-center rounded-[5px] outline-none focus-within:ring-2 focus-within:ring-ring/70" title={`Изменить цвет: ${folder.name}`}>
                    <span className="size-3 rounded-full ring-1 ring-foreground/15" style={{ backgroundColor: colors[folder.path] }} />
                    <input
                      aria-label={`Цвет папки ${folder.name}`}
                      className="absolute inset-0 cursor-pointer opacity-0"
                      onChange={(event) => updateFolderColor(folder.path, event.target.value)}
                      type="color"
                      value={colors[folder.path]}
                    />
                  </label>
                  <button
                    className="flex min-w-0 flex-1 items-center gap-2 py-2 text-left text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
                    onClick={() => selectFolder(folder.path)}
                    type="button"
                  >
                    <span className="min-w-0 flex-1 truncate">{folder.name}</span>
                    <span className="tabular-nums text-muted-foreground">{folder.count}</span>
                  </button>
                </div>
              ))}
            </div>
          </div>

          {Object.keys(colorOverrides).length > 0 ? (
            <button
              className="border-t px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70"
              onClick={() => {
                setColorOverrides({});
                window.localStorage.removeItem(COLOR_STORAGE_KEY);
              }}
              type="button"
            >
              Вернуть автоматические цвета
            </button>
          ) : null}
        </aside>
      ) : null}

      <div className="absolute right-4 top-4 z-20 hidden items-center gap-2 rounded-lg border bg-popover/88 px-3 py-2 text-[11px] text-muted-foreground shadow-sm backdrop-blur lg:flex">
        <GraphIcon className="size-4 text-primary" />
        <span>{formatRussianCount(layout.nodes.length, ["узел", "узла", "узлов"])}</span>
        <span aria-hidden="true">·</span>
        <span>{formatRussianCount(layout.edges.length, ["связь", "связи", "связей"])}</span>
      </div>
    </section>
  );
}

export { BrainGraph };
