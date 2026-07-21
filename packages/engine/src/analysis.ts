import { relative, resolve } from "node:path";

import {
  Node,
  Project,
  SyntaxKind,
  type CallExpression,
  type Expression,
  type ExportDeclaration,
  type ImportDeclaration,
  type ObjectLiteralExpression,
  type SourceFile,
} from "ts-morph";

import type {
  AnalysisWarning as SharedAnalysisWarning,
  ArchitectureNode,
  DependencyEdge,
  DiscountFact,
} from "@tenet/contracts";

export interface AnalysisRequest {
  repositoryRoot: string;
  tsconfigPath: string;
  modules: readonly ArchitectureNode[];
}

export type AnalysisWarning = SharedAnalysisWarning;

export interface RepositoryAnalysis {
  edges: readonly DependencyEdge[];
  discounts: readonly DiscountFact[];
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

const literalPropertyInitializer = (
  objectLiteral: ObjectLiteralExpression,
  name: string,
): Expression | undefined => {
  const property = objectLiteral.getProperty(name);
  return property && Node.isPropertyAssignment(property)
    ? property.getInitializer()
    : undefined;
};

const stringLiteralValue = (expression: Expression | undefined): string | undefined =>
  expression && Node.isStringLiteral(expression)
    ? expression.getLiteralText()
    : undefined;

const numericLiteralValue = (expression: Expression | undefined): number | undefined => {
  if (!expression || !Node.isNumericLiteral(expression)) {
    return undefined;
  }

  const value = Number(expression.getText());
  return Number.isFinite(value) && value >= 0 && value <= 100 ? value : undefined;
};

const booleanLiteralValue = (
  expression: Expression | undefined,
): boolean | undefined => {
  if (!expression) {
    return undefined;
  }

  if (expression.getKind() === SyntaxKind.TrueKeyword) {
    return true;
  }

  if (expression.getKind() === SyntaxKind.FalseKeyword) {
    return false;
  }

  return undefined;
};

const isDefineDiscountCall = (callExpression: CallExpression): boolean => {
  const expression = callExpression.getExpression();
  return Node.isIdentifier(expression) && expression.getText() === "defineDiscount";
};

const compactExcerpt = (value: string): string => {
  const normalized = value.replace(/\s+/gu, " ").trim();
  const maximumLength = 240;
  return normalized.length <= maximumLength
    ? normalized
    : `${normalized.slice(0, maximumLength - 1)}…`;
};

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
    const extractedDiscounts: DiscountFact[] = [];
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

    const addDiscountWarning = (
      sourceFile: SourceFile,
      callExpression: CallExpression,
      message: string,
    ): void => {
      addWarning(
        "unsupported_discount_declaration",
        sourceFile,
        callExpression.getStart(),
        "defineDiscount",
        message,
      );
    };

    const extractDiscount = (
      sourceFile: SourceFile,
      callExpression: CallExpression,
    ): void => {
      if (!isDefineDiscountCall(callExpression)) {
        return;
      }

      const [argument] = callExpression.getArguments();
      if (!argument || !Node.isObjectLiteralExpression(argument)) {
        addDiscountWarning(
          sourceFile,
          callExpression,
          "defineDiscount requires an object literal for deterministic semantic analysis.",
        );
        return;
      }

      const id = stringLiteralValue(literalPropertyInitializer(argument, "id"));
      const percent = numericLiteralValue(
        literalPropertyInitializer(argument, "percent"),
      );
      const stackGroup = stringLiteralValue(
        literalPropertyInitializer(argument, "stackGroup"),
      );
      const combinable = booleanLiteralValue(
        literalPropertyInitializer(argument, "combinable"),
      );

      const missingFields = [
        ...(id === undefined ? ["id"] : []),
        ...(percent === undefined ? ["percent"] : []),
        ...(stackGroup === undefined ? ["stackGroup"] : []),
        ...(combinable === undefined ? ["combinable"] : []),
      ];

      if (missingFields.length > 0) {
        addDiscountWarning(
          sourceFile,
          callExpression,
          `defineDiscount has non-literal or unsupported ${missingFields.join(", ")}; it is not blocking evidence.`,
        );
        return;
      }

      if (
        id === undefined ||
        percent === undefined ||
        stackGroup === undefined ||
        combinable === undefined
      ) {
        return;
      }

      const sourceFilePath = relativeToRepository(
        repositoryRoot,
        sourceFile.getFilePath(),
      );
      if (sourceFilePath.startsWith("../")) {
        return;
      }

      const sourceModule = moduleForFile(sourceFilePath, request.modules);
      const location = declarationLocation(sourceFile, callExpression.getStart());
      const variableDeclaration = callExpression.getFirstAncestorByKind(
        SyntaxKind.VariableDeclaration,
      );
      const declaredName = stringLiteralValue(
        literalPropertyInitializer(argument, "name"),
      );
      const name = declaredName ?? variableDeclaration?.getName();

      extractedDiscounts.push({
        kind: "discount",
        id,
        ...(name ? { name } : {}),
        percent,
        stackGroup,
        combinable,
        ...(sourceModule ? { sourceModule: sourceModule.id } : {}),
        sourceFile: sourceFilePath,
        line: location.line,
        column: location.column,
        excerpt: compactExcerpt(callExpression.getText()),
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
        extractDiscount(sourceFile, callExpression);

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

    const discountsByIdentity = new Map<string, DiscountFact[]>();
    for (const discount of extractedDiscounts) {
      const identity = `${discount.stackGroup}\u0000${discount.id}`;
      const existing = discountsByIdentity.get(identity);
      if (existing) {
        existing.push(discount);
      } else {
        discountsByIdentity.set(identity, [discount]);
      }
    }

    const discounts: DiscountFact[] = [];
    for (const [, occurrences] of [...discountsByIdentity.entries()].sort(
      ([left], [right]) => left.localeCompare(right),
    )) {
      const orderedOccurrences = [...occurrences].sort(
        (left, right) =>
          left.sourceFile.localeCompare(right.sourceFile) ||
          left.line - right.line ||
          left.column - right.column,
      );
      const [canonical] = orderedOccurrences;

      if (!canonical) {
        continue;
      }

      const signatures = new Set(
        orderedOccurrences.map(
          (discount) =>
            `${discount.percent}\u0000${discount.combinable}\u0000${discount.name ?? ""}`,
        ),
      );

      if (signatures.size === 1) {
        discounts.push(canonical);
        for (const duplicate of orderedOccurrences.slice(1)) {
          warnings.push({
            kind: "duplicate_discount_declaration",
            file: duplicate.sourceFile,
            line: duplicate.line,
            column: duplicate.column,
            importSpecifier: duplicate.id,
            message: `Duplicate discount declaration "${duplicate.id}" is counted once for ${duplicate.stackGroup}.`,
          });
        }
        continue;
      }

      for (const conflictingDiscount of orderedOccurrences) {
        warnings.push({
          kind: "duplicate_discount_declaration",
          file: conflictingDiscount.sourceFile,
          line: conflictingDiscount.line,
          column: conflictingDiscount.column,
          importSpecifier: conflictingDiscount.id,
          message: `Conflicting declarations for discount "${conflictingDiscount.id}" are not used as blocking evidence.`,
        });
      }
    }

    return {
      edges: edges.sort(
        (left, right) =>
          left.sourceFile.localeCompare(right.sourceFile) ||
          (left.line ?? 0) - (right.line ?? 0) ||
          left.importSpecifier.localeCompare(right.importSpecifier),
      ),
      discounts: discounts.sort(
        (left, right) =>
          left.stackGroup.localeCompare(right.stackGroup) ||
          left.id.localeCompare(right.id) ||
          left.sourceFile.localeCompare(right.sourceFile) ||
          left.line - right.line,
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
