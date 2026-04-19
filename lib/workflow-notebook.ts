/**
 * Jupyter notebook types and helpers (nbformat 4).
 */

export type NotebookCell =
  | { cell_type: 'markdown'; metadata: Record<string, unknown>; source: string[] }
  | {
      cell_type: 'code';
      metadata: Record<string, unknown>;
      execution_count: null;
      outputs: unknown[];
      source: string[];
    };

export type JupyterNotebook = {
  nbformat: number;
  nbformat_minor: number;
  metadata: Record<string, unknown>;
  cells: NotebookCell[];
};

/** Wrap an array of cells into a complete nbformat 4 notebook. */
export function buildNotebookJson(cells: NotebookCell[]): JupyterNotebook {
  return {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: {
      kernelspec: { display_name: 'Python 3', language: 'python', name: 'python3' },
      language_info: { name: 'python', version: '3.10.0' },
    },
    cells,
  };
}

/** Convert a single string source into the line-array format notebooks expect. */
export function toSourceLines(text: string): string[] {
  return text.split('\n').map((line, i, a) => (i < a.length - 1 ? `${line}\n` : line));
}
