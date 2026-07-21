import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import {
  TenetConfigurationSchema,
  type TenetConfiguration,
} from "@tenet/contracts";

export const defaultTenetConfigPath = (repositoryRoot: string): string =>
  join(resolve(repositoryRoot), ".tenet", "tenet.json");

export const parseTenetConfiguration = (
  value: unknown,
): TenetConfiguration => TenetConfigurationSchema.parse(value);

export const loadTenetConfiguration = async (
  configPath: string,
): Promise<TenetConfiguration> => {
  const source = await readFile(resolve(configPath), "utf8");
  return parseTenetConfiguration(JSON.parse(source) as unknown);
};
