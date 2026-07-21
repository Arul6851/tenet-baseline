import { relative, resolve } from "node:path";

import {
  Project,
  SyntaxKind,
  type ExportDeclaration,
  type ImportDeclaration,
  type SourceFile,
} from "ts-morph";

import type { ArchitectureNode, DependencyEdge } from "@tenet/contracts";

export interface AnalysisRequest {
  repositoryRoot: string;
  tsconfigPath: string;
  modules: readonly ArchitectureNode[];
}

export interface AnalysisWarning {
  kind: "dynamic_import" | "unresolved_import";
  file: string;
  line: number;
  column: number;
  importSpecifier: string;
  message: string;
}

export interface RepositoryAnalysis {
  edges: readonly DependencyEdge[];
  warnings: readonly AnalysisWarning[];
}

export interface SourceAnalyzer {
  analyze(request: AnalysisRequest): Promise<RepositoryAnalysis>;
}

const supportedExtensions = [".ts", ".tsx", ".mts", ".cts"] as const;

const normalizePath = (value: string): string => value.replaceAll("\\", "/");

const isSupportedSourceFile = (sourceFile: SourceFile): boolean => {
  const filePath = sourceFile.getFilePath().toLowerCase();
  return (
    !filePath.endsWith(".d.ts") &&
    supportedExtensions.some((extension) => filePath.endsWith(extension))
  );
};

const globToRegExp = (pattern: string): RegExp => {
  let expression = "^";

  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index] ?? "";

    if (character === "*") {
      if (pattern[index + 1] === "*") {
        expression += ".*";
        index += 1;
      } else {
        expression += "[^/]*";
      }
      continue;
    }

    if ("\\^$+?.()|{}[]".includes(character)) {
      expression += `\\${character}`;
    } else {
      expression += character;
    }
  }

  return new RegExp(`${expression}$`);
};

const pathBelongsToModule = (
  relativeFilePath: string,
  module: ArchitectureNode,
): boolean =>
  module.paths.some((pathPattern) =>
    globToRegExp(normalizePath(pathPattern)).test(relativeFilePath),
  );

const moduleForFile = (
  relativeFilePath: string,
  modules: readonly ArchitectureNode[],
): ArchitectureNode | undefined =>
  [...modules]
    .filter((module) => pathBelongsToModule(relativeFilePath, module))
    .sort((left, right) => {
      const longestLeftPath = Math.max(...left.paths.map((path) => path.length));
      const longestRightPath = Math.max(
        ...right.paths.map((path) => path.length),
      );
      return longestRightPath - longestLeftPath || left.id.localeCompare(right.id);
    })[0];

const relativeToRepository = (
  repositoryRoot: string,
  filePath: string,
): string => normalizePath(relative(repositoryRoot, filePath));

const isRuntimeImport = (declaration: ImportDeclaration): boolean => {
  if (declaration.isTypeOnly()) {
    return false;
  }

  if (declaration.getDefaultImport() || declaration.getNamespaceImport()) {
    return true;
  }

  const namedImports = declaration.getNamedImports();
  return namedImports.length === 0 || namedImports.some((item) => !item.isTypeOnly());
};

const isRuntimeExport = (declaration: ExportDeclaration): boolean => {
  if (declaration.isTypeOnly()) {
    return false;
  }

  const namedExports = declaration.getNamedExports();
  return namedExports.length === 0 || namedExports.some((item) => !item.isTypeOnly());
};

const matchesPathAlias = (
  importSpecifier: string,
  paths: Record<string, readonly string[]> | undefined,
): boolean => {
  if (!paths) {
    return false;
  }

  return Object.keys(paths).some((pattern) => {
    const wildcardIndex = pattern.indexOf("*");

    if (wildcardIndex === -1) {
      return importSpecifier === pattern;
    }

    const prefix = pattern.slice(0, wildcardIndex);
    const suffix = pattern.slice(wildcardIndex + 1);
    return (
      importSpecifier.startsWith(prefix) && importSpecifier.endsWith(suffix)
    );
  });
};

const isPotentiallyLocalSpecifier = (
  importSpecifier: string,
  paths: Record<string, readonly string[]> | undefined,
): boolean =>
  importSpecifier.startsWith(".") ||
  importSpecifier.startsWith("/") ||
  matchesPathAlias(importSpecifier, paths);

const declarationLocation = (
  sourceFile: SourceFile,
  start: number,
): { line: number; column: number } => sourceFile.getLineAndColumnAtPos(start);

/**
 * Converts TypeScript source imports into direct, runtime module dependencies.
 * It deliberately does not infer call graphs or try to execute dynamic imports.
 */
export class TsMorphSourceAnalyzer implements SourceAnalyzer {
  async analyze(request: AnalysisRequest): Promise<RepositoryAnalysis> {
    const repositoryRoot = resolve(request.repositoryRoot);
    const project = new Project({
      tsConfigFilePath: resolve(request.tsconfigPath),
    });
    const compilerPaths = project.getCompilerOptions().paths as
      | Record<string, readonly string[]>
      | undefined;
    const edges: DependencyEdge[] = [];
    const warnings: AnalysisWarning[] = [];

    const sourceFiles = project
      .getSourceFiles()
      .filter(
        (sourceFile) =>
          !sourceFile.isFromExternalLibrary() && isSupportedSourceFile(sourceFile),
      );

    const addWarning = (
      kind: AnalysisWarning["kind"],
      sourceFile: SourceFile,
      start: number,
      importSpecifier: string,
      message: string,
    ): void => {
      const location = declarationLocation(sourceFile, start);
      warnings.push({
        kind,
        file: relativeToRepository(repositoryRoot, sourceFile.getFilePath()),
        line: location.line,
        column: location.column,
        importSpecifier,
        message,
      });
    };

    const addDependency = (
      sourceFile: SourceFile,
      declaration: ImportDeclaration | ExportDeclaration,
    ): void => {
      const moduleSpecifier = declaration.getModuleSpecifier();

      if (!moduleSpecifier) {
        return;
      }

      const importSpecifier = moduleSpecifier.getLiteralText();
      const resolvedSourceFile = declaration.getModuleSpecifierSourceFile();

      if (!resolvedSourceFile) {
        if (isPotentiallyLocalSpecifier(importSpecifier, compilerPaths)) {
          addWarning(
            "unresolved_import",
            sourceFile,
            moduleSpecifier.getStart(),
            importSpecifier,
            `Could not resolve local import "${importSpecifier}".`,
          );
        }
        return;
      }

      if (
        resolvedSourceFile.isFromExternalLibrary() ||
        !isSupportedSourceFile(resolvedSourceFile)
      ) {
        return;
      }

      const sourceFilePath = relativeToRepository(
        repositoryRoot,
        sourceFile.getFilePath(),
      );
      const targetFilePath = relativeToRepository(
        repositoryRoot,
        resolvedSourceFile.getFilePath(),
      );

      if (sourceFilePath.startsWith("../") || targetFilePath.startsWith("../")) {
        return;
      }

      const sourceModule = moduleForFile(sourceFilePath, request.modules);
      const targetModule = moduleForFile(targetFilePath, request.modules);

      if (!sourceModule || !targetModule || sourceModule.id === targetModule.id) {
        return;
      }

      const location = declarationLocation(sourceFile, moduleSpecifier.getStart());
      edges.push({
        sourceModule: sourceModule.id,
        targetModule: targetModule.id,
        sourceFile: sourceFilePath,
        targetFile: targetFilePath,
        importSpecifier,
        importKind: "runtime",
        line: location.line,
        column: location.column,
      });
    };

    for (const sourceFile of sourceFiles) {
      for (const declaration of sourceFile.getImportDeclarations()) {
        if (isRuntimeImport(declaration)) {
          addDependency(sourceFile, declaration);
        }
      }

      for (const declaration of sourceFile.getExportDeclarations()) {
        if (isRuntimeExport(declaration)) {
          addDependency(sourceFile, declaration);
        }
      }

      for (const callExpression of sourceFile.getDescendantsOfKind(
        SyntaxKind.CallExpression,
      )) {
        if (callExpression.getExpression().getKind() !== SyntaxKind.ImportKeyword) {
          continue;
        }

        const argument = callExpression.getArguments()[0];
        const importSpecifier = argument?.getText() ?? "<unknown>";
        addWarning(
          "dynamic_import",
          sourceFile,
          callExpression.getStart(),
          importSpecifier,
          "Dynamic imports are not used for runtime architecture enforcement.",
        );
      }
    }

    return {
      edges: edges.sort(
        (left, right) =>
          left.sourceFile.localeCompare(right.sourceFile) ||
          (left.line ?? 0) - (right.line ?? 0) ||
          left.importSpecifier.localeCompare(right.importSpecifier),
      ),
      warnings: warnings.sort(
        (left, right) =>
          left.file.localeCompare(right.file) ||
          left.line - right.line ||
          left.importSpecifier.localeCompare(right.importSpecifier),
      ),
    };
  }
}

export const analyzeTypeScriptRepository = async (
  request: AnalysisRequest,
): Promise<RepositoryAnalysis> => new TsMorphSourceAnalyzer().analyze(request);
