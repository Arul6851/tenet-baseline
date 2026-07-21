import { createHash } from "node:crypto";

import { eq } from "drizzle-orm";

import {
  IntentProposalSchema,
  TenetSchema,
  type IntentProposal,
  type RepositoryReference,
  type Tenet,
} from "@tenet/contracts";

import type { createDatabase } from "../db/client";
import { repositories, tenets } from "../db/schema";

export type ControlPlaneDatabase = ReturnType<typeof createDatabase>;

export interface ManagedRepository {
  databaseId: string;
  slug: string;
  name: string;
  displayName: string;
  defaultBranch: string;
}

export interface ActivatedControlPlaneTenet {
  tenet: Tenet;
  created: boolean;
  /**
   * Local validation reads `.tenet/tenet.json`; an active control-plane record
   * therefore needs an explicit repository sync before a local CLI check can
   * enforce a newly created policy.
   */
  localRepositorySyncRequired: true;
}

const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }

  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`);
    return `{${entries.join(",")}}`;
  }

  return JSON.stringify(value);
};

const hasSameValues = (
  left: readonly string[],
  right: readonly string[],
): boolean => {
  if (left.length !== right.length) {
    return false;
  }

  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();

  return sortedLeft.every((value, index) => value === sortedRight[index]);
};

/**
 * Repeated confirmation of the same proposal results in a stable external ID
 * rather than a duplicate policy record.
 */
export const controlPlaneTenetExternalId = (
  repositorySlug: string,
  proposal: IntentProposal,
): string => {
  const hash = createHash("sha256")
    .update(repositorySlug)
    .update("\u0000")
    .update(proposal.sourceIntent)
    .update("\u0000")
    .update(stableJson(proposal.proposedTenet))
    .digest("hex")
    .slice(0, 24);

  return `control-plane-${hash}`;
};

export const toRepositoryReference = (
  repository: ManagedRepository,
): RepositoryReference => ({
  id: repository.slug,
  name: repository.name,
  defaultBranch: repository.defaultBranch,
});

export const getManagedRepository = async (
  database: ControlPlaneDatabase,
  slug: string,
): Promise<ManagedRepository | undefined> => {
  const [repository] = await database
    .select({
      databaseId: repositories.id,
      slug: repositories.slug,
      name: repositories.name,
      displayName: repositories.displayName,
      defaultBranch: repositories.defaultBranch,
    })
    .from(repositories)
    .where(eq(repositories.slug, slug))
    .limit(1);

  return repository;
};

const isEquivalentActiveTenet = (
  persisted: {
    externalId: string;
    name: string;
    description: string;
    type: Tenet["type"];
    severity: Tenet["severity"];
    enforcement: Tenet["enforcement"];
    status: Tenet["status"];
    scope: string[];
    constraint: Record<string, unknown>;
  },
  proposed: IntentProposal["proposedTenet"],
): boolean =>
  persisted.status === "active" &&
  persisted.type === proposed.type &&
  persisted.severity === proposed.severity &&
  persisted.enforcement === proposed.enforcement &&
  hasSameValues(persisted.scope, proposed.scope) &&
  stableJson(persisted.constraint) === stableJson(proposed.constraint);

/**
 * Persists a human-confirmed policy into the control plane. It purposefully
 * does not write repository files or call the validation engine: local checks
 * remain independent of the control plane's availability.
 */
export class TenetActivationService {
  public constructor(private readonly database: ControlPlaneDatabase) {}

  public async confirm(
    repository: ManagedRepository,
    proposal: IntentProposal,
  ): Promise<ActivatedControlPlaneTenet> {
    const parsedProposal = IntentProposalSchema.parse(proposal);
    const existingTenets = await this.database
      .select({
        externalId: tenets.externalId,
        name: tenets.name,
        description: tenets.description,
        type: tenets.type,
        severity: tenets.severity,
        enforcement: tenets.enforcement,
        status: tenets.status,
        scope: tenets.scope,
        constraint: tenets.constraint,
      })
      .from(tenets)
      .where(eq(tenets.repositoryId, repository.databaseId));

    const equivalent = existingTenets.find((persisted) =>
      isEquivalentActiveTenet(persisted, parsedProposal.proposedTenet),
    );

    if (equivalent) {
      return {
        tenet: TenetSchema.parse({
          id: equivalent.externalId,
          name: equivalent.name,
          description: equivalent.description,
          type: equivalent.type,
          severity: equivalent.severity,
          enforcement: equivalent.enforcement,
          scope: equivalent.scope,
          constraint: equivalent.constraint,
          status: "active",
        }),
        created: false,
        localRepositorySyncRequired: true,
      };
    }

    const externalId = controlPlaneTenetExternalId(repository.slug, parsedProposal);
    const existingByExternalId = existingTenets.find(
      (tenet) => tenet.externalId === externalId,
    );
    const tenet = TenetSchema.parse({
      ...parsedProposal.proposedTenet,
      id: externalId,
      status: "active",
    });

    await this.database
      .insert(tenets)
      .values({
        repositoryId: repository.databaseId,
        externalId: tenet.id,
        name: tenet.name,
        description: tenet.description,
        type: tenet.type,
        severity: tenet.severity,
        enforcement: tenet.enforcement,
        status: tenet.status,
        scope: [...tenet.scope],
        constraint: tenet.constraint as Record<string, unknown>,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [tenets.repositoryId, tenets.externalId],
        set: {
          name: tenet.name,
          description: tenet.description,
          type: tenet.type,
          severity: tenet.severity,
          enforcement: tenet.enforcement,
          status: tenet.status,
          scope: [...tenet.scope],
          constraint: tenet.constraint as Record<string, unknown>,
          updatedAt: new Date(),
        },
      });

    return {
      tenet,
      created: existingByExternalId === undefined,
      localRepositorySyncRequired: true,
    };
  }
}

export const createTenetActivationService = (
  database: ControlPlaneDatabase,
): TenetActivationService => new TenetActivationService(database);
