import { useMemo } from "react";
import ReactFlow, {
  Background,
  Controls,
  type Node,
  type Edge,
  Position,
  type NodeProps,
} from "reactflow";
import "reactflow/dist/style.css";
import type { DAGNode, DAGEdge } from "@/types";
import type { AnalysisWarning } from "@/lib/sqlParser";

interface DAGVisualizationProps {
  nodes: DAGNode[];
  edges: DAGEdge[];
  analysis?: AnalysisWarning[];
}

const nodeColors: Record<string, { bg: string; border: string; text: string }> = {
  table: { bg: "#1e1b4b", border: "#7c5bf5", text: "#c4b5fd" },
  operation: { bg: "#1a2e1a", border: "#22c55e", text: "#bbf7d0" },
  output: { bg: "#2a1a1a", border: "#f59e0b", text: "#fde68a" },
};

function buildLayout(
  dagNodes: DAGNode[],
  dagEdges: DAGEdge[],
  analysis: AnalysisWarning[] = []
) {
  const warningMap = new Map<string, AnalysisWarning[]>();
  for (const w of analysis) {
    const existing = warningMap.get(w.nodeId) || [];
    existing.push(w);
    warningMap.set(w.nodeId, existing);
  }

  const nodes: Node[] = dagNodes.map((n) => {
    const colors = nodeColors[n.type] || nodeColors.operation;
    const warnings = warningMap.get(n.id) || [];
    const hasWarning = warnings.length > 0;

    return {
      id: n.id,
      data: { label: n.label, nodeType: n.type, warnings },
      position: { x: 0, y: 0 },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      style: {
        background: hasWarning ? "#2a1a0a" : colors.bg,
        border: `1px solid ${hasWarning ? "#f59e0b" : colors.border}`,
        borderRadius: "8px",
        padding: "8px 16px",
        color: hasWarning ? "#fde68a" : colors.text,
        fontSize: "12px",
        fontWeight: 500,
        minWidth: "80px",
        textAlign: "center" as const,
        boxShadow: hasWarning ? "0 0 8px rgba(245, 158, 11, 0.3)" : "none",
      },
    };
  });

  const edges: Edge[] = dagEdges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label,
    animated: true,
    style: { stroke: "#7c5bf5", strokeWidth: 1.5 },
    labelStyle: { fill: "#a1a1aa", fontSize: "10px", fontWeight: 400 },
    labelBgStyle: { fill: "#09090b", fillOpacity: 0.8 },
    labelBgPadding: [4, 2] as [number, number],
    labelBgBorderRadius: 4,
  }));

  // Topological sort for layers
  const adj = new Map<string, string[]>();
  const inDeg = new Map<string, number>();
  for (const n of dagNodes) {
    adj.set(n.id, []);
    inDeg.set(n.id, 0);
  }
  for (const e of dagEdges) {
    adj.get(e.source)?.push(e.target);
    inDeg.set(e.target, (inDeg.get(e.target) || 0) + 1);
  }

  const layers: string[][] = [];
  const queue = dagNodes.filter((n) => (inDeg.get(n.id) || 0) === 0).map((n) => n.id);
  const visited = new Set<string>();
  let currentLayer = [...queue];

  while (currentLayer.length > 0) {
    layers.push(currentLayer);
    for (const id of currentLayer) visited.add(id);
    const next: string[] = [];
    for (const id of currentLayer) {
      for (const child of adj.get(id) || []) {
        if (!visited.has(child)) {
          const remaining = (inDeg.get(child) || 0) - 1;
          inDeg.set(child, remaining);
          if (remaining <= 0) next.push(child);
        }
      }
    }
    currentLayer = next;
  }

  const LAYER_GAP = 180;
  const NODE_GAP = 70;
  for (let li = 0; li < layers.length; li++) {
    const layer = layers[li];
    const totalHeight = (layer.length - 1) * NODE_GAP;
    for (let ni = 0; ni < layer.length; ni++) {
      const node = nodes.find((n) => n.id === layer[ni]);
      if (node) {
        node.position = {
          x: li * LAYER_GAP + 40,
          y: ni * NODE_GAP + 40 - totalHeight / 2 + 100,
        };
      }
    }
  }

  return { nodes, edges };
}

// Custom node with warning indicator
function DAGNodeComponent({ data }: NodeProps) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="text-xs font-medium">{data.label}</div>
      {data.warnings?.length > 0 && (
        <div className="flex flex-col gap-0.5 mt-1">
          {data.warnings.map((w: AnalysisWarning, i: number) => (
            <div
              key={i}
              className="text-[9px] text-yellow-300/80 bg-yellow-500/10 px-1.5 py-0.5 rounded whitespace-nowrap"
            >
              {w.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const nodeTypes = { dagNode: DAGNodeComponent };

export function DAGVisualization({ nodes: dagNodes, edges: dagEdges, analysis }: DAGVisualizationProps) {
  const { nodes, edges } = useMemo(() => {
    const layout = buildLayout(dagNodes, dagEdges, analysis || []);
    // Assign custom node type for warning display
    for (const node of layout.nodes) {
      if (node.data.warnings?.length > 0) {
        node.type = "dagNode";
      }
    }
    return layout;
  }, [dagNodes, dagEdges, analysis]);

  if (dagNodes.length === 0) {
    return (
      <div className="h-48 rounded-lg bg-background/50 border border-border/20 flex items-center justify-center">
        <p className="text-sm text-muted-foreground">无 DAG 数据</p>
      </div>
    );
  }

  return (
    <div className="h-64 rounded-lg bg-background/50 border border-border/20 overflow-hidden">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
      >
        <Background color="#27272a" gap={16} size={1} />
        <Controls
          showInteractive={false}
          style={{ borderRadius: "8px", overflow: "hidden" }}
        />
      </ReactFlow>
    </div>
  );
}
