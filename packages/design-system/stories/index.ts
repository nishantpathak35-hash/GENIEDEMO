import { readdirSync } from 'node:fs';
import type { ReactNode } from 'react';
import { stories as figures } from './figures.stories.js';
import { stories as illustration } from './illustration.stories.js';
import { stories as kit } from './kit.stories.js';
import { stories as list } from './list.stories.js';

/**
 * Every story file, listed. A file added to this folder and not to this list
 * is not rendered, not checked and not in the gallery — so `missingStoryFiles`
 * walks the folder, and `tests/stories.test.tsx` asserts it comes back empty.
 */
export interface StoryFile {
  readonly file: string;
  readonly stories: ReadonlyArray<{
    readonly component: string;
    readonly states: Record<string, () => ReactNode>;
  }>;
}

export const STORY_FILES: readonly StoryFile[] = [
  { file: 'figures.stories.tsx', stories: figures },
  { file: 'illustration.stories.tsx', stories: illustration },
  { file: 'kit.stories.tsx', stories: kit },
  { file: 'list.stories.tsx', stories: list },
];

export function missingStoryFiles(dir: string): string[] {
  const listed = new Set(STORY_FILES.map((f) => f.file));
  return readdirSync(dir)
    .filter((name) => name.endsWith('.stories.tsx'))
    .filter((name) => !listed.has(name));
}
