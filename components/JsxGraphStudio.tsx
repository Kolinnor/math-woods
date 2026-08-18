"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CircleDot,
  Copy,
  Download,
  FlipHorizontal2,
  FunctionSquare,
  MousePointer2,
  PencilRuler,
  PilcrowSquare,
  Redo2,
  Save,
  Slash,
  Square,
  Trash2,
  Undo2,
  Upload
} from "lucide-react";
import styles from "./JsxGraphStudio.module.css";

type Coordinate = number | string;
type Tool = "select" | "point" | "segment" | "line" | "polygon";

type PointObject = {
  id: string;
  type: "point";
  jsxType?: "point" | "glider";
  x: Coordinate;
  y: Coordinate;
  onId?: string;
  name: string;
  color: string;
  size: number;
  fixed: boolean;
  visible: boolean;
  withLabel: boolean;
};

type SegmentObject = {
  id: string;
  type: "segment" | "line";
  pointIds: [string, string];
  color: string;
  strokeWidth: number;
  dash?: number;
};

type PolygonObject = {
  id: string;
  type: "polygon";
  pointIds: string[];
  fillColor: string;
  fillOpacity: number;
  strokeColor: string;
  strokeWidth: number;
};

type FunctionObject = {
  id: string;
  type: "functiongraph";
  expression: string;
  min?: number;
  max?: number;
  color: string;
  strokeWidth: number;
};

type SceneObject = PointObject | SegmentObject | PolygonObject | FunctionObject;

type StudioScene = {
  version: 1;
  boundingBox: [number, number, number, number];
  axis: boolean;
  grid: boolean;
  keepAspectRatio: boolean;
  height: number;
  objects: SceneObject[];
};

type JsxGraphElement = {
  id?: string;
  type: string;
  parents: unknown[];
  attributes: Record<string, unknown>;
};

type BoardLike = {
  create: (type: string, parents: unknown[], attributes?: Record<string, unknown>) => unknown;
  on: (eventName: string, handler: (event: MouseEvent | PointerEvent) => void) => void;
  getUsrCoordsOfMouse?: (event: MouseEvent | PointerEvent) => [number, number];
  resizeContainer: (width: number, height: number) => unknown;
  suspendUpdate?: () => void;
  unsuspendUpdate?: () => void;
  update: () => unknown;
};

type RuntimeElement = {
  X?: () => number;
  Y?: () => number;
  on?: (eventName: string, handler: (event: MouseEvent | PointerEvent) => void) => void;
};

const STORAGE_KEY = "math-woods-jsxgraph-studio-scene";

const DEFAULT_SCENE: StudioScene = {
  version: 1,
  boundingBox: [-5, 5, 5, -2],
  axis: false,
  grid: false,
  keepAspectRatio: true,
  height: 530,
  objects: [
    { id: "f", type: "functiongraph", expression: "x^2/4", min: -4.5, max: 4.5, color: "#24b6f0", strokeWidth: 2 },
    { id: "A", type: "point", x: 0, y: 0, name: "A", color: "#333333", size: 2, fixed: true, visible: true, withLabel: true },
    { id: "F", type: "point", x: 0, y: 1, name: "F", color: "#333333", size: 3, fixed: true, visible: true, withLabel: true },
    { id: "B", type: "point", jsxType: "glider", x: 2.8, y: 1.96, onId: "f", name: "B", color: "#ff4d4d", size: 3, fixed: false, visible: true, withLabel: true },
    { id: "BF", type: "segment", pointIds: ["B", "F"], color: "#ff4d4d", strokeWidth: 2 }
  ]
};

const PARABOLA_SCENE: StudioScene = {
  version: 1,
  boundingBox: [-5, 5.5, 5, -2],
  axis: false,
  grid: false,
  keepAspectRatio: true,
  height: 530,
  objects: [
    { id: "parabola", type: "functiongraph", expression: "x^2/4", min: -4.5, max: 4.5, color: "#24b6f0", strokeWidth: 2 },
    { id: "D1a", type: "point", x: -5, y: -1, name: "", color: "#333333", size: 0, fixed: true, visible: false, withLabel: false },
    { id: "D1b", type: "point", x: 5, y: -1, name: "", color: "#333333", size: 0, fixed: true, visible: false, withLabel: false },
    { id: "D2a", type: "point", x: 0, y: -1.5, name: "", color: "#24b6f0", size: 0, fixed: true, visible: false, withLabel: false },
    { id: "D2b", type: "point", x: 0, y: 5, name: "", color: "#24b6f0", size: 0, fixed: true, visible: false, withLabel: false },
    { id: "ADa", type: "point", x: -4.5, y: 0, name: "", color: "#333333", size: 0, fixed: true, visible: false, withLabel: false },
    { id: "ADb", type: "point", x: 4.5, y: 0, name: "", color: "#333333", size: 0, fixed: true, visible: false, withLabel: false },
    { id: "D1", type: "line", pointIds: ["D1a", "D1b"], color: "#333333", strokeWidth: 2 },
    { id: "D2", type: "line", pointIds: ["D2a", "D2b"], color: "#24b6f0", strokeWidth: 2 },
    { id: "ADaxis", type: "line", pointIds: ["ADa", "ADb"], color: "#333333", strokeWidth: 2 },
    { id: "A", type: "point", x: 0, y: 0, name: "A", color: "#333333", size: 2, fixed: true, visible: true, withLabel: true },
    { id: "F", type: "point", x: 0, y: 1, name: "F", color: "#333333", size: 3, fixed: true, visible: true, withLabel: true },
    { id: "G", type: "point", x: 0, y: 4, name: "G", color: "#333333", size: 2, fixed: true, visible: true, withLabel: true },
    { id: "B", type: "point", jsxType: "glider", x: 2.8, y: 1.96, onId: "parabola", name: "B", color: "#ff4d4d", size: 3, fixed: false, visible: true, withLabel: true },
    { id: "D", type: "point", x: "B.X()", y: 0, name: "D", color: "#333333", size: 2, fixed: true, visible: true, withLabel: true },
    { id: "E", type: "point", x: 0, y: "B.Y()", name: "E", color: "#333333", size: 2, fixed: true, visible: true, withLabel: true },
    { id: "H", type: "point", x: "B.X()", y: -1, name: "H", color: "#333333", size: 2, fixed: true, visible: true, withLabel: true },
    { id: "BF", type: "segment", pointIds: ["B", "F"], color: "#ff4d4d", strokeWidth: 2 },
    { id: "BH", type: "segment", pointIds: ["B", "H"], color: "#ff4d4d", strokeWidth: 2 },
    { id: "EB", type: "segment", pointIds: ["E", "B"], color: "#555555", strokeWidth: 1.5, dash: 2 },
    { id: "S1", type: "point", x: "B.X()", y: "abs(B.X())", name: "", color: "#333333", size: 0, fixed: true, visible: false, withLabel: false },
    { id: "S2", type: "point", x: 0, y: "abs(B.X())", name: "", color: "#333333", size: 0, fixed: true, visible: false, withLabel: false },
    { id: "square", type: "polygon", pointIds: ["A", "D", "S1", "S2"], fillColor: "#f4df62", fillOpacity: 0.22, strokeColor: "#d8c958", strokeWidth: 1.5 },
    { id: "C", type: "point", x: 4, y: 0, name: "", color: "#333333", size: 0, fixed: true, visible: false, withLabel: false },
    { id: "R", type: "point", x: 4, y: "B.Y()", name: "", color: "#333333", size: 0, fixed: true, visible: false, withLabel: false },
    { id: "rectangle", type: "polygon", pointIds: ["A", "C", "R", "E"], fillColor: "#b9e7c4", fillOpacity: 0.24, strokeColor: "#9dcaaa", strokeWidth: 1.5 }
  ]
};

function cloneScene(scene: StudioScene): StudioScene {
  return JSON.parse(JSON.stringify(scene)) as StudioScene;
}

function isPointObject(object: SceneObject): object is PointObject {
  return object.type === "point";
}

function nextObjectId(objects: SceneObject[], prefix: string) {
  const used = new Set(objects.map((object) => object.id));
  let index = 1;
  while (used.has(`${prefix}${index}`)) index += 1;
  return `${prefix}${index}`;
}

function pointAttributes(object: PointObject, selected: boolean) {
  return {
    name: object.name,
    fixed: object.fixed,
    visible: object.visible,
    withLabel: object.withLabel,
    size: selected ? object.size + 1 : object.size,
    fillColor: object.color,
    strokeColor: selected ? "#1d6a47" : object.color,
    strokeWidth: selected ? 3 : 1,
    highlight: false
  };
}

function objectLabel(object: SceneObject) {
  if (object.type === "point") return object.name || object.id;
  if (object.type === "functiongraph") return `${object.id}: y=${object.expression}`;
  return `${object.id}: ${object.type}`;
}

function objectKind(object: SceneObject) {
  if (object.type === "functiongraph") return "function";
  if (object.type === "point" && object.jsxType === "glider") return "glider";
  return object.type;
}

function toFiniteNumber(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readCoordinate(value: string): Coordinate {
  const trimmed = value.trim();
  if (trimmed === "") return 0;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : trimmed;
}

function formatCoordinate(value: Coordinate) {
  return typeof value === "number" ? String(Math.round(value * 1000) / 1000) : value;
}

function elementForObject(object: SceneObject, selected = false): JsxGraphElement {
  if (object.type === "point") {
    const attributes = pointAttributes(object, selected);
    if (object.jsxType === "glider" && object.onId) {
      return { id: object.id, type: "glider", parents: [object.x, object.y, object.onId], attributes };
    }
    return { id: object.id, type: "point", parents: [object.x, object.y], attributes };
  }

  if (object.type === "functiongraph") {
    return {
      id: object.id,
      type: "functiongraph",
      parents: object.min === undefined || object.max === undefined ? [object.expression] : [object.expression, object.min, object.max],
      attributes: {
        strokeColor: selected ? "#1d6a47" : object.color,
        strokeWidth: selected ? object.strokeWidth + 1 : object.strokeWidth,
        highlight: false
      }
    };
  }

  if (object.type === "polygon") {
    return {
      id: object.id,
      type: "polygon",
      parents: object.pointIds,
      attributes: {
        fillColor: object.fillColor,
        fillOpacity: object.fillOpacity,
        strokeColor: selected ? "#1d6a47" : object.strokeColor,
        strokeWidth: selected ? object.strokeWidth + 1 : object.strokeWidth,
        highlight: false
      }
    };
  }

  return {
    id: object.id,
    type: object.type,
    parents: object.pointIds,
    attributes: {
      strokeColor: selected ? "#1d6a47" : object.color,
      strokeWidth: selected ? object.strokeWidth + 1 : object.strokeWidth,
      ...(object.dash ? { dash: object.dash } : {}),
      ...(object.type === "line" ? { straightFirst: false, straightLast: false } : {}),
      fixed: true,
      highlight: false
    }
  };
}

function mathWoodsExport(scene: StudioScene) {
  return {
    boundingBox: scene.boundingBox,
    axis: scene.axis,
    grid: scene.grid,
    keepAspectRatio: scene.keepAspectRatio,
    height: scene.height,
    elements: scene.objects.map((object) => {
      const element = elementForObject(object);
      return {
        ...(element.id ? { id: element.id } : {}),
        type: element.type,
        parents: element.parents,
        attributes: Object.fromEntries(Object.entries(element.attributes).filter(([, value]) => value !== undefined))
      };
    })
  };
}

function fencedExport(scene: StudioScene) {
  return `\`\`\`jsxgraph\n${JSON.stringify(mathWoodsExport(scene), null, 2)}\n\`\`\``;
}

function updateObject(scene: StudioScene, id: string, updater: (object: SceneObject) => SceneObject) {
  return {
    ...scene,
    objects: scene.objects.map((object) => object.id === id ? updater(object) : object)
  };
}

function eventCoordinates(board: BoardLike, event: MouseEvent | PointerEvent): [number, number] {
  if (!board.getUsrCoordsOfMouse) return [0, 0];
  return board.getUsrCoordsOfMouse(event);
}

export function JsxGraphStudio() {
  const [scene, setScene] = useState<StudioScene>(() => cloneScene(DEFAULT_SCENE));
  const [past, setPast] = useState<StudioScene[]>([]);
  const [future, setFuture] = useState<StudioScene[]>([]);
  const [selectedId, setSelectedId] = useState("B");
  const [tool, setTool] = useState<Tool>("select");
  const [pendingPointIds, setPendingPointIds] = useState<string[]>([]);
  const [functionExpression, setFunctionExpression] = useState("x^2/4");
  const [sceneImport, setSceneImport] = useState("");
  const [toast, setToast] = useState("");
  const boardRef = useRef<HTMLDivElement | null>(null);
  const skipBoardClickRef = useRef(false);

  const selectedObject = scene.objects.find((object) => object.id === selectedId) ?? null;
  const exportJson = useMemo(() => JSON.stringify(mathWoodsExport(scene), null, 2), [scene]);

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2400);
  }, []);

  const commitScene = useCallback((nextScene: StudioScene, nextSelectedId = selectedId) => {
    setPast((items) => [...items.slice(-39), cloneScene(scene)]);
    setFuture([]);
    setScene(nextScene);
    setSelectedId(nextSelectedId);
  }, [scene, selectedId]);

  const commitUpdater = useCallback((updater: (current: StudioScene) => StudioScene, nextSelectedId = selectedId) => {
    commitScene(updater(scene), nextSelectedId);
  }, [commitScene, scene, selectedId]);

  const selectPointForTool = useCallback((pointId: string) => {
    if (tool === "select" || tool === "point") {
      setSelectedId(pointId);
      return;
    }

    if (tool === "polygon") {
      setPendingPointIds((ids) => ids.includes(pointId) ? ids : [...ids, pointId]);
      setSelectedId(pointId);
      return;
    }

    const firstPointId = pendingPointIds[0];
    if (!firstPointId || firstPointId === pointId) {
      setPendingPointIds([pointId]);
      setSelectedId(pointId);
      return;
    }

    const id = nextObjectId(scene.objects, tool === "segment" ? "s" : "l");
    commitScene({
      ...scene,
      objects: [
        ...scene.objects,
        { id, type: tool, pointIds: [firstPointId, pointId], color: "#333333", strokeWidth: 2 }
      ]
    }, id);
    setPendingPointIds([]);
  }, [commitScene, pendingPointIds, scene, tool]);

  useEffect(() => {
    const holder = boardRef.current;
    if (!holder) return;
    const host = holder;

    let disposed = false;
    let resizeFrame = 0;
    let board: BoardLike | null = null;
    let freeBoard: ((board: BoardLike) => void) | null = null;
    let disposeResize: (() => void) | undefined;

    async function mount() {
      // JSXGraph's package exports omit the browser bundle and its matching declaration path.
      // @ts-expect-error The runtime API is typed by the root jsxgraph package.
      const module = await import("../node_modules/jsxgraph/distrib/jsxgraphcore.js");
      if (disposed) return;
      const JXG = module.default ?? module;
      const boardId = `jsxgraph-studio-board-${Date.now()}`;
      host.replaceChildren();
      const boardNode = document.createElement("div");
      boardNode.id = boardId;
      boardNode.className = `jxgbox ${styles.board}`;
      boardNode.style.height = `${scene.height}px`;
      host.appendChild(boardNode);

      board = JXG.JSXGraph.initBoard(boardId, {
        boundingbox: scene.boundingBox,
        axis: scene.axis,
        grid: scene.grid,
        keepaspectratio: scene.keepAspectRatio,
        showCopyright: false,
        showNavigation: false,
        pan: { enabled: true, needShift: true },
        zoom: { enabled: true, wheel: true }
      }) as BoardLike;
      freeBoard = (mountedBoard) => JXG.JSXGraph.freeBoard(mountedBoard as never);

      const runtimeElements = new Map<string, RuntimeElement>();
      board.suspendUpdate?.();
      for (const object of scene.objects) {
        const element = elementForObject(object, object.id === selectedId);
        const runtime = board.create(element.type, element.parents, { ...element.attributes, id: element.id }) as RuntimeElement;
        runtimeElements.set(object.id, runtime);
      }
      board.unsuspendUpdate?.();
      board.update();

      for (const object of scene.objects) {
        const runtime = runtimeElements.get(object.id);
        runtime?.on?.("down", () => {
          skipBoardClickRef.current = true;
          if (object.type === "point") selectPointForTool(object.id);
          else setSelectedId(object.id);
        });
        if (object.type === "point" && !object.fixed && typeof object.x === "number" && typeof object.y === "number") {
          runtime?.on?.("up", () => {
            if (!runtime.X || !runtime.Y) return;
            const x = Math.round(runtime.X() * 1000) / 1000;
            const y = Math.round(runtime.Y() * 1000) / 1000;
            setScene((current) => updateObject(current, object.id, (item) =>
              item.type === "point" ? { ...item, x, y } : item
            ));
          });
        }
      }

      board.on("down", (event) => {
        if (skipBoardClickRef.current) {
          skipBoardClickRef.current = false;
          return;
        }
        if (tool !== "point" || !board) return;
        const [x, y] = eventCoordinates(board, event);
        const id = nextObjectId(scene.objects, "P");
        commitScene({
          ...scene,
          objects: [
            ...scene.objects,
            {
              id,
              type: "point",
              x: Math.round(x * 1000) / 1000,
              y: Math.round(y * 1000) / 1000,
              name: id,
              color: "#333333",
              size: 3,
              fixed: false,
              visible: true,
              withLabel: true
            }
          ]
        }, id);
      });

      const resizeObserver = new ResizeObserver((entries) => {
        const width = Math.round(entries[0]?.contentRect.width ?? host.clientWidth);
        if (!board || width <= 0) return;
        window.cancelAnimationFrame(resizeFrame);
        resizeFrame = window.requestAnimationFrame(() => {
          board?.resizeContainer(width, scene.height);
        });
      });
      resizeObserver.observe(host);
      disposeResize = () => resizeObserver.disconnect();
    }

    void mount();

    return () => {
      disposed = true;
      disposeResize?.();
      window.cancelAnimationFrame(resizeFrame);
      if (board && freeBoard) freeBoard(board);
    };
  }, [commitScene, scene, selectPointForTool, selectedId, tool]);

  const loadScene = (nextScene: StudioScene, selected = "") => {
    const copy = cloneScene(nextScene);
    commitScene(copy, selected || copy.objects[0]?.id || "");
    setPendingPointIds([]);
  };

  const addFunction = () => {
    const expression = functionExpression.trim();
    if (!expression) return;
    const id = nextObjectId(scene.objects, "f");
    commitUpdater((current) => ({
      ...current,
      objects: [
        ...current.objects,
        { id, type: "functiongraph", expression, min: -5, max: 5, color: "#24b6f0", strokeWidth: 2 }
      ]
    }), id);
  };

  const finishPolygon = () => {
    if (pendingPointIds.length < 3) return;
    const id = nextObjectId(scene.objects, "poly");
    commitUpdater((current) => ({
      ...current,
      objects: [
        ...current.objects,
        { id, type: "polygon", pointIds: pendingPointIds, fillColor: "#f4df62", fillOpacity: 0.24, strokeColor: "#d8c958", strokeWidth: 1.5 }
      ]
    }), id);
    setPendingPointIds([]);
  };

  const deleteSelected = () => {
    if (!selectedObject) return;
    commitUpdater((current) => ({
      ...current,
      objects: current.objects.filter((object) => {
        if (object.id === selectedId) return false;
        if (object.type === "segment" || object.type === "line" || object.type === "polygon") {
          return !object.pointIds.includes(selectedId);
        }
        return true;
      })
    }), "");
  };

  const undo = () => {
    const previous = past[past.length - 1];
    if (!previous) return;
    setFuture((items) => [cloneScene(scene), ...items]);
    setPast((items) => items.slice(0, -1));
    setScene(previous);
    setSelectedId(previous.objects[0]?.id ?? "");
  };

  const redo = () => {
    const next = future[0];
    if (!next) return;
    setPast((items) => [...items, cloneScene(scene)]);
    setFuture((items) => items.slice(1));
    setScene(next);
    setSelectedId(next.objects[0]?.id ?? "");
  };

  const saveLocally = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scene));
    notify("Scene saved in this browser.");
  };

  const loadLocal = () => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      notify("No saved scene found.");
      return;
    }
    try {
      loadScene(JSON.parse(raw) as StudioScene);
      notify("Saved scene loaded.");
    } catch {
      notify("Saved scene could not be read.");
    }
  };

  const copyText = async (value: string, message: string) => {
    await navigator.clipboard.writeText(value);
    notify(message);
  };

  const importScene = () => {
    try {
      const parsed = JSON.parse(sceneImport) as StudioScene;
      if (!Array.isArray(parsed.objects)) throw new Error("Missing objects.");
      loadScene(parsed);
      notify("Scene JSON imported.");
    } catch {
      notify("Scene JSON is invalid.");
    }
  };

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div>
          <h1>JSXGraph Studio</h1>
          <p>Build a structured interactive figure, keep it editable, then export a Math Woods JSXGraph block.</p>
        </div>
        <div className={styles.headerActions}>
          <button type="button" className={styles.quietButton} onClick={() => loadScene(PARABOLA_SCENE, "B")}>
            <PencilRuler size={16} /> Parabola template
          </button>
          <button type="button" className={styles.quietButton} onClick={loadLocal}>
            <Upload size={16} /> Load
          </button>
          <button type="button" className={styles.button} onClick={saveLocally}>
            <Save size={16} /> Save
          </button>
        </div>
      </header>

      <div className={styles.toolbar} aria-label="Figure tools">
        <div className={styles.toolGroup}>
          {([
            ["select", MousePointer2, "Select"],
            ["point", CircleDot, "Point"],
            ["segment", Slash, "Segment"],
            ["line", FlipHorizontal2, "Line"],
            ["polygon", Square, "Polygon"]
          ] as const).map(([id, Icon, label]) => (
            <button
              key={id}
              type="button"
              className={`${styles.iconButton} ${tool === id ? styles.active : ""}`}
              onClick={() => {
                setTool(id);
                setPendingPointIds([]);
              }}
              title={label}
              aria-label={label}
            >
              <Icon size={18} />
            </button>
          ))}
        </div>
        <div className={styles.toolGroup}>
          <button type="button" className={styles.iconButton} onClick={undo} disabled={!past.length} title="Undo" aria-label="Undo">
            <Undo2 size={18} />
          </button>
          <button type="button" className={styles.iconButton} onClick={redo} disabled={!future.length} title="Redo" aria-label="Redo">
            <Redo2 size={18} />
          </button>
          <button type="button" className={styles.iconButton} onClick={deleteSelected} disabled={!selectedObject} title="Delete" aria-label="Delete">
            <Trash2 size={18} />
          </button>
        </div>
        <label className={styles.field} style={{ minWidth: 220 }}>
          <span>Function</span>
          <input value={functionExpression} onChange={(event) => setFunctionExpression(event.target.value)} />
        </label>
        <button type="button" className={styles.quietButton} onClick={addFunction}>
          <FunctionSquare size={16} /> Add
        </button>
        {tool === "polygon" && (
          <button type="button" className={styles.button} onClick={finishPolygon} disabled={pendingPointIds.length < 3}>
            <PilcrowSquare size={16} /> Finish polygon
          </button>
        )}
      </div>

      <section className={styles.workspace}>
        <aside className={styles.panel}>
          <div>
            <p className={styles.panelTitle}>Objects</p>
            <div className={styles.objectList}>
              {scene.objects.map((object) => (
                <button
                  key={object.id}
                  type="button"
                  className={`${styles.objectRow} ${selectedId === object.id ? styles.selected : ""}`}
                  onClick={() => setSelectedId(object.id)}
                >
                  <span>{objectLabel(object)}</span>
                  <small>{objectKind(object)}</small>
                </button>
              ))}
            </div>
          </div>

          <div className={styles.inspector}>
            <p className={styles.panelTitle}>Board</p>
            <div className={styles.inlineFields}>
              <label className={styles.checkboxField}>
                <input type="checkbox" checked={scene.axis} onChange={(event) => commitUpdater((current) => ({ ...current, axis: event.target.checked }))} />
                <span>Axis</span>
              </label>
              <label className={styles.checkboxField}>
                <input type="checkbox" checked={scene.grid} onChange={(event) => commitUpdater((current) => ({ ...current, grid: event.target.checked }))} />
                <span>Grid</span>
              </label>
            </div>
            <label className={styles.field}>
              <span>Bounding box</span>
              <input
                value={scene.boundingBox.join(", ")}
                onChange={(event) => {
                  const values = event.target.value.split(",").map((item) => Number(item.trim()));
                  if (values.length === 4 && values.every(Number.isFinite)) {
                    commitUpdater((current) => ({ ...current, boundingBox: values as [number, number, number, number] }));
                  }
                }}
              />
            </label>
          </div>
        </aside>

        <main className={styles.canvasPanel}>
          <div className={styles.boardWrap} ref={boardRef} />
          <div className={styles.statusBar}>
            <span><strong>{tool}</strong>{pendingPointIds.length ? ` - ${pendingPointIds.join(" -> ")}` : ""}</span>
            <span>{scene.objects.length} objects</span>
          </div>
          <div className={styles.statusHint}>
            {tool === "point" && "Click the board to create a point."}
            {(tool === "segment" || tool === "line") && "Click two existing points to create the object."}
            {tool === "polygon" && "Click at least three existing points, then finish the polygon."}
            {tool === "select" && "Select objects on the board or in the object list, then adjust them in the inspector."}
          </div>
        </main>

        <aside className={styles.panel}>
          <div className={styles.inspector}>
            <p className={styles.panelTitle}>Inspector</p>
            {!selectedObject && <p className={styles.emptyState}>No object selected.</p>}

            {selectedObject?.type === "point" && (
              <>
                <label className={styles.field}>
                  <span>Label</span>
                  <input value={selectedObject.name} onChange={(event) => commitUpdater((current) => updateObject(current, selectedObject.id, (object) => object.type === "point" ? { ...object, name: event.target.value } : object))} />
                </label>
                <div className={styles.inlineFields}>
                  <label className={styles.field}>
                    <span>X</span>
                    <input value={formatCoordinate(selectedObject.x)} onChange={(event) => commitUpdater((current) => updateObject(current, selectedObject.id, (object) => object.type === "point" ? { ...object, x: readCoordinate(event.target.value) } : object))} />
                  </label>
                  <label className={styles.field}>
                    <span>Y</span>
                    <input value={formatCoordinate(selectedObject.y)} onChange={(event) => commitUpdater((current) => updateObject(current, selectedObject.id, (object) => object.type === "point" ? { ...object, y: readCoordinate(event.target.value) } : object))} />
                  </label>
                </div>
                <div className={styles.inlineFields}>
                  <label className={styles.field}>
                    <span>Color</span>
                    <input type="color" value={selectedObject.color} onChange={(event) => commitUpdater((current) => updateObject(current, selectedObject.id, (object) => object.type === "point" ? { ...object, color: event.target.value } : object))} />
                  </label>
                  <label className={styles.field}>
                    <span>Size</span>
                    <input type="number" min={0} max={12} value={selectedObject.size} onChange={(event) => commitUpdater((current) => updateObject(current, selectedObject.id, (object) => object.type === "point" ? { ...object, size: toFiniteNumber(event.target.value, object.size) } : object))} />
                  </label>
                </div>
                <label className={styles.checkboxField}>
                  <input type="checkbox" checked={selectedObject.fixed} onChange={(event) => commitUpdater((current) => updateObject(current, selectedObject.id, (object) => object.type === "point" ? { ...object, fixed: event.target.checked } : object))} />
                  <span>Fixed</span>
                </label>
                <label className={styles.checkboxField}>
                  <input type="checkbox" checked={selectedObject.visible} onChange={(event) => commitUpdater((current) => updateObject(current, selectedObject.id, (object) => object.type === "point" ? { ...object, visible: event.target.checked } : object))} />
                  <span>Visible</span>
                </label>
              </>
            )}

            {(selectedObject?.type === "segment" || selectedObject?.type === "line") && (
              <>
                <div className={styles.inspectorRow}>
                  <span className={styles.swatch} style={{ background: selectedObject.color }} />
                  <strong>{selectedObject.pointIds.join(" to ")}</strong>
                </div>
                <label className={styles.field}>
                  <span>Color</span>
                  <input type="color" value={selectedObject.color} onChange={(event) => commitUpdater((current) => updateObject(current, selectedObject.id, (object) => object.type === "segment" || object.type === "line" ? { ...object, color: event.target.value } : object))} />
                </label>
                <label className={styles.field}>
                  <span>Stroke width</span>
                  <input type="number" min={1} max={8} value={selectedObject.strokeWidth} onChange={(event) => commitUpdater((current) => updateObject(current, selectedObject.id, (object) => object.type === "segment" || object.type === "line" ? { ...object, strokeWidth: toFiniteNumber(event.target.value, object.strokeWidth) } : object))} />
                </label>
              </>
            )}

            {selectedObject?.type === "functiongraph" && (
              <>
                <label className={styles.field}>
                  <span>Expression</span>
                  <input value={selectedObject.expression} onChange={(event) => commitUpdater((current) => updateObject(current, selectedObject.id, (object) => object.type === "functiongraph" ? { ...object, expression: event.target.value } : object))} />
                </label>
                <div className={styles.inlineFields}>
                  <label className={styles.field}>
                    <span>Min</span>
                    <input type="number" value={selectedObject.min ?? ""} onChange={(event) => commitUpdater((current) => updateObject(current, selectedObject.id, (object) => object.type === "functiongraph" ? { ...object, min: toFiniteNumber(event.target.value, -5) } : object))} />
                  </label>
                  <label className={styles.field}>
                    <span>Max</span>
                    <input type="number" value={selectedObject.max ?? ""} onChange={(event) => commitUpdater((current) => updateObject(current, selectedObject.id, (object) => object.type === "functiongraph" ? { ...object, max: toFiniteNumber(event.target.value, 5) } : object))} />
                  </label>
                </div>
              </>
            )}

            {selectedObject?.type === "polygon" && (
              <>
                <p className={styles.emptyState}>{selectedObject.pointIds.join(" -> ")}</p>
                <div className={styles.inlineFields}>
                  <label className={styles.field}>
                    <span>Fill</span>
                    <input type="color" value={selectedObject.fillColor} onChange={(event) => commitUpdater((current) => updateObject(current, selectedObject.id, (object) => object.type === "polygon" ? { ...object, fillColor: event.target.value } : object))} />
                  </label>
                  <label className={styles.field}>
                    <span>Stroke</span>
                    <input type="color" value={selectedObject.strokeColor} onChange={(event) => commitUpdater((current) => updateObject(current, selectedObject.id, (object) => object.type === "polygon" ? { ...object, strokeColor: event.target.value } : object))} />
                  </label>
                </div>
                <label className={styles.field}>
                  <span>Fill opacity</span>
                  <input type="number" min={0} max={1} step={0.05} value={selectedObject.fillOpacity} onChange={(event) => commitUpdater((current) => updateObject(current, selectedObject.id, (object) => object.type === "polygon" ? { ...object, fillOpacity: toFiniteNumber(event.target.value, object.fillOpacity) } : object))} />
                </label>
              </>
            )}
          </div>
        </aside>

        <section className={styles.exportPanel}>
          <div className={styles.actions}>
            <button type="button" className={styles.quietButton} onClick={() => void copyText(exportJson, "Math Woods JSON copied.")}>
              <Copy size={16} /> Copy JSON
            </button>
            <button type="button" className={styles.quietButton} onClick={() => void copyText(fencedExport(scene), "Markdown block copied.")}>
              <Download size={16} /> Copy block
            </button>
          </div>
          {toast && <div className={styles.toast}>{toast}</div>}
          <textarea className={styles.exportCode} readOnly value={exportJson} aria-label="Math Woods JSXGraph JSON export" />
          <label className={styles.field}>
            <span>Import editable scene JSON</span>
            <textarea value={sceneImport} onChange={(event) => setSceneImport(event.target.value)} />
          </label>
          <button type="button" className={styles.quietButton} onClick={importScene}>
            <Upload size={16} /> Import scene
          </button>
        </section>
      </section>
    </div>
  );
}
