import { useState, useCallback } from "react";
import type { AIResponse, AppState, QueryMode, DAGNode, DAGEdge } from "@/types";
import type { AIConfig } from "@/data/config";
import { generateSQLPrompt } from "@/lib/aiService";
import { validateAIResponse, type ValidationResult } from "@/lib/sqlValidator";
import { parseSQLToDAG, type AnalysisWarning } from "@/lib/sqlParser";
import { loadConfig } from "@/data/config";

export interface AIResult {
  response: AIResponse;
  astNodes: DAGNode[];
  astEdges: DAGEdge[];
  analysis: AnalysisWarning[];
  validation: ValidationResult;
}

export function useAI() {
  const [state, setState] = useState<AppState>("idle");
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async (query: string, mode: QueryMode = "generate") => {
    setState("loading");
    setError(null);
    setResult(null);

    try {
      const config: AIConfig = loadConfig();
      const response = await generateSQLPrompt(query, config, mode);

      // Post-generation validation
      const { getCurrentSchema } = await import("@/lib/schemaRAG");
      const schema = getCurrentSchema();
      const validation = validateAIResponse(response, schema);

      // SQL AST → DAG
      const parseResult = parseSQLToDAG(response.optimized_prompt);

      // Use AST-based DAG if available, fallback to LLM-generated
      const astNodes = parseResult.nodes.length > 0 ? parseResult.nodes : response.dag_nodes;
      const astEdges = parseResult.edges.length > 0 ? parseResult.edges : response.dag_edges;

      setResult({
        response,
        astNodes,
        astEdges,
        analysis: parseResult.analysis,
        validation,
      });
      setState("result");
    } catch (err) {
      setError(err instanceof Error ? err.message : "未知错误");
      setState("error");
    }
  }, []);

  const clear = useCallback(() => {
    setResult(null);
    setState("idle");
    setError(null);
  }, []);

  return { state, result, error, submit, clear };
}
