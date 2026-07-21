import type { ArchitectureNode, DependencyEdge } from "@tenet/contracts";

export interface AnalysisRequest {
  repositoryRoot: string;
  tsconfigPath: string;
  modules: readonly ArchitectureNode[];
}

export interface AnalysisWarning {
  file: string;
  message: string;
}

export interface RepositoryAnalysis {
  edges: readonly DependencyEdge[];
  warnings: readonly AnalysisWarning[];
}

/**
 * The future implementation is backed by ts-morph. It must report only
 * statically-resolved local edges; nonliteral imports remain warnings.
 */
export interface SourceAnalyzer {
  analyze(request: AnalysisRequest): Promise<RepositoryAnalysis>;
}
