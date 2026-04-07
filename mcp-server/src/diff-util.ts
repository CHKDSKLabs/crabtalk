import { createTwoFilesPatch } from "diff";

export function createDiff(
  filePath: string,
  localContent: string,
  remoteContent: string
): string {
  return createTwoFilesPatch(
    `a/${filePath} (local)`,
    `b/${filePath} (remote)`,
    localContent,
    remoteContent,
    undefined,
    undefined,
    { context: 3 }
  );
}
