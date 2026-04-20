#!/usr/bin/env python3
"""
Execute a Jupyter notebook and report per-cell success / failure.

Usage:
    python scripts/execute-notebook.py <input.ipynb> <output.ipynb> [kernel_name]

Prints a single JSON object to stdout with per-cell status. Exit code:
    0 — all code cells passed
    1 — one or more code cells failed
    2 — notebook failed to load / executor crashed

Why Python? nbclient (the standard notebook-execution library) is Python-native.
Shelling out from TS is simpler than reimplementing cell-by-cell execution.

Per-cell timeout is 300s (5 min) by default; override with CELL_TIMEOUT env.
"""

import json
import os
import sys
from pathlib import Path

import nbformat
from nbclient import NotebookClient
from nbclient.exceptions import CellExecutionError


def report_cell(idx: int, cell: nbformat.NotebookNode, status: str, error=None) -> dict:
    out = {"index": idx, "type": cell.cell_type}
    if cell.cell_type == "code":
        out["status"] = status
        out["execution_count"] = cell.get("execution_count")
        src = cell.get("source", "")
        out["source_preview"] = (src[:120] + "…") if len(src) > 120 else src
        if error is not None:
            out["error"] = {
                "name": error.get("ename", ""),
                "message": error.get("evalue", ""),
                "traceback": error.get("traceback", []),
            }
    return out


def main() -> int:
    if len(sys.argv) < 3:
        print(
            json.dumps({"error": "usage: execute-notebook.py <input> <output> [kernel]"}),
            file=sys.stderr,
        )
        return 2
    inp, outp = Path(sys.argv[1]), Path(sys.argv[2])
    kernel = sys.argv[3] if len(sys.argv) >= 4 else "python3"
    timeout = int(os.environ.get("CELL_TIMEOUT", "300"))

    try:
        nb = nbformat.read(str(inp), as_version=4)
    except Exception as e:
        print(json.dumps({"error": f"load failed: {e}"}), file=sys.stderr)
        return 2

    # Ensure every code cell has a proper empty outputs list so nbclient
    # doesn't complain about missing fields.
    for c in nb.cells:
        if c.cell_type == "code":
            c.setdefault("outputs", [])
            c.setdefault("execution_count", None)
            c.setdefault("metadata", {})

    # allow_errors=True so execution continues after a cell fails — we want
    # to know about all failures, not just the first.
    client = NotebookClient(
        nb,
        timeout=timeout,
        kernel_name=kernel,
        allow_errors=True,
        record_timing=False,
        resources={"metadata": {"path": str(inp.parent)}},
    )

    try:
        client.execute()
    except CellExecutionError as e:
        # Shouldn't hit with allow_errors=True, but belt-and-suspenders.
        print(json.dumps({"error": f"execution error: {e}"}), file=sys.stderr)
        return 2
    except Exception as e:
        print(json.dumps({"error": f"client crashed: {e}"}), file=sys.stderr)
        return 2

    # Build per-cell report
    cells_report = []
    summary = {
        "total": len(nb.cells),
        "markdown": 0,
        "code": 0,
        "code_ok": 0,
        "code_error": 0,
    }

    for idx, cell in enumerate(nb.cells):
        if cell.cell_type == "markdown":
            summary["markdown"] += 1
            cells_report.append(report_cell(idx, cell, "markdown"))
            continue

        if cell.cell_type != "code":
            continue
        summary["code"] += 1

        # Find the first "error" output, if any.
        error_out = None
        for out in cell.get("outputs", []):
            if out.get("output_type") == "error":
                error_out = out
                break

        if error_out is not None:
            summary["code_error"] += 1
            cells_report.append(report_cell(idx, cell, "error", error_out))
        else:
            summary["code_ok"] += 1
            cells_report.append(report_cell(idx, cell, "ok"))

    # Save the executed notebook
    try:
        outp.parent.mkdir(parents=True, exist_ok=True)
        nbformat.write(nb, str(outp))
    except Exception as e:
        print(json.dumps({"error": f"write failed: {e}"}), file=sys.stderr)
        return 2

    print(json.dumps({"cells": cells_report, "summary": summary}))
    return 1 if summary["code_error"] > 0 else 0


if __name__ == "__main__":
    sys.exit(main())
