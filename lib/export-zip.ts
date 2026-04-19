/**
 * Client-side zip packaging for the complete pipeline output.
 *
 * Creates a downloadable zip containing:
 *   docs/PRD.md
 *   docs/stack.md
 *   docs/architecture.md
 *   docs/features/<service>.md (one per service)
 *   notebook.ipynb
 *   CLAUDE.md
 *   AGENTS.md
 */

import { zipSync, strToU8 } from 'fflate';

interface FeatureFile {
  name: string;
  content: string;
}

interface ExportInput {
  prd: string;
  stack: string;
  architecture: string;
  features: FeatureFile[];
  claudeMd: string;
  agentsMd: string;
  notebookJson: string; // raw .ipynb JSON string
  goalName?: string;    // used for zip filename
}

/**
 * Build a zip file in the browser and trigger download.
 */
export function downloadPipelineZip(input: ExportInput): void {
  const files: Record<string, Uint8Array> = {
    'docs/PRD.md': strToU8(input.prd),
    'docs/stack.md': strToU8(input.stack),
    'docs/architecture.md': strToU8(input.architecture),
    'CLAUDE.md': strToU8(input.claudeMd),
    'AGENTS.md': strToU8(input.agentsMd),
    'notebook.ipynb': strToU8(input.notebookJson),
  };

  for (const feat of input.features) {
    files[`docs/features/${feat.name}.md`] = strToU8(feat.content);
  }

  const zipped = zipSync(files);
  const blob = new Blob([zipped.buffer as ArrayBuffer], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);

  const safeName = (input.goalName ?? 'nvidia-pipeline')
    .replace(/[^a-zA-Z0-9-_]/g, '_')
    .slice(0, 64);

  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeName}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}
