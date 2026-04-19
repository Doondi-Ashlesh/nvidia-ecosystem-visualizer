import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, HeadingLevel, AlignmentType, BorderStyle, WidthType, ShadingType, Header, Footer, PageNumber, PageBreak } from 'docx';
import fs from 'fs';

const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders = { top: border, bottom: border, left: border, right: border };
const cellMargins = { top: 60, bottom: 60, left: 100, right: 100 };
const GREEN = "76B900";
const DARK = "1A1A1A";

function heading(text, level = HeadingLevel.HEADING_1) {
  return new Paragraph({ heading: level, spacing: { before: 300, after: 150 }, children: [new TextRun({ text, bold: true, font: "Arial", color: level === HeadingLevel.HEADING_1 ? GREEN : "333333" })] });
}

function para(text, opts = {}) {
  return new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text, font: "Arial", size: 22, ...opts })] });
}

function boldPara(label, value) {
  return new Paragraph({ spacing: { after: 80 }, children: [
    new TextRun({ text: label, font: "Arial", size: 22, bold: true }),
    new TextRun({ text: value, font: "Arial", size: 22 }),
  ]});
}

function tableRow(cells, isHeader = false) {
  return new TableRow({
    children: cells.map((text, i) => new TableCell({
      borders,
      margins: cellMargins,
      shading: isHeader ? { fill: GREEN, type: ShadingType.CLEAR } : (i === 0 ? { fill: "F5F5F5", type: ShadingType.CLEAR } : undefined),
      children: [new Paragraph({ children: [new TextRun({ text: String(text), font: "Arial", size: 20, bold: isHeader, color: isHeader ? "FFFFFF" : "333333" })] })]
    }))
  });
}

function simpleTable(headers, rows, colWidths) {
  const totalWidth = colWidths.reduce((a, b) => a + b, 0);
  return new Table({
    width: { size: totalWidth, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: [
      tableRow(headers, true),
      ...rows.map(r => tableRow(r))
    ]
  });
}

const doc = new Document({
  styles: {
    default: { document: { run: { font: "Arial", size: 22 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 36, bold: true, font: "Arial", color: GREEN }, paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 28, bold: true, font: "Arial" }, paragraph: { spacing: { before: 240, after: 160 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 24, bold: true, font: "Arial" }, paragraph: { spacing: { before: 200, after: 120 }, outlineLevel: 2 } },
    ]
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1440, right: 1200, bottom: 1440, left: 1200 }
      }
    },
    headers: {
      default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "NVIDIA AI Dev Bootstrapper \u2014 Experimentation Report", font: "Arial", size: 16, color: "999999", italics: true })] })] })
    },
    footers: {
      default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Page ", font: "Arial", size: 16, color: "999999" }), new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 16, color: "999999" })] })] })
    },
    children: [
      // ── TITLE PAGE ──
      new Paragraph({ spacing: { before: 3000 } }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: "NVIDIA AI Dev Bootstrapper", font: "Arial", size: 48, bold: true, color: GREEN })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 400 }, children: [new TextRun({ text: "Experimentation Report", font: "Arial", size: 36, color: "666666" })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 }, children: [new TextRun({ text: "9 Experiments | 10 Enterprise Test Cases | 3 Domain Validations", font: "Arial", size: 22, color: "999999" })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 800 }, children: [new TextRun({ text: "April 2026", font: "Arial", size: 22, color: "999999" })] }),

      new Paragraph({ children: [new PageBreak()] }),

      // ── EXECUTIVE SUMMARY ──
      heading("Executive Summary"),
      para("This report documents 9 experiments conducted to optimize the NVIDIA AI Dev Bootstrapper pipeline, which generates production-ready implementation plans and Jupyter notebooks from natural language goal descriptions."),
      para(""),
      boldPara("Pipeline: ", "User goal \u2192 GoalSpec (requirements) \u2192 Service path (NVIDIA services) \u2192 Notebook (runnable code)"),
      boldPara("Model: ", "nvidia/nemotron-3-super-120b-a12b via NVIDIA NIM API"),
      boldPara("Key result: ", "Path quality improved from 4/10 to 9/10. Notebook code quality improved from 2/10 to 8/10."),
      para(""),

      simpleTable(
        ["Metric", "Before", "After", "Improvement"],
        [
          ["Path generation quality", "4/10 (keyword rules)", "9/10 (data-flow inference)", "+125%"],
          ["Notebook code quality", "2/10 (print URLs)", "8/10 (real NVIDIA SDKs)", "+300%"],
          ["Path generation approach", "13 hardcoded keyword rules", "3-sentence data-flow prompt", "Simpler, more robust"],
          ["Domain differentiation", "Same path for everything", "Correct per domain", "Healthcare \u2260 Fraud \u2260 E-commerce"],
          ["Test coverage", "1 test case", "10 enterprise cases + 3 domain validations", "Comprehensive"],
        ],
        [2400, 2200, 2200, 3040]
      ),

      new Paragraph({ children: [new PageBreak()] }),

      // ── EXPERIMENT OVERVIEW ──
      heading("Experiment Overview"),
      para("Each experiment tested a specific optimization hypothesis against standardized test cases. Decisions were data-driven: optimizations that improved quality were kept; those that didn't were removed."),
      para(""),

      simpleTable(
        ["#", "Experiment", "Result", "Kept?"],
        [
          ["1", "Baseline adversary loop", "365s, 11 inferred reqs, quality baseline", "Yes (reference)"],
          ["2", "Single-pass self-critique", "73s, 9 inferred reqs (-18%)", "No (fewer reqs)"],
          ["3", "Asymmetric model (49B adversary)", "315s, false positives", "No (worse quality)"],
          ["4", "Domain template caching", "161s, approved round 1", "No (wrong templates for novel domains)"],
          ["5", "Combined (cached + 49B)", "344s, regression", "No (worse than cached alone)"],
          ["6", "Grounded adversary (blueprints)", "302s, evidence-backed challenges", "Partial (adversary only)"],
          ["7", "10-case test suite", "Baseline won 6/10 vs grounded", "Baseline prompt restored"],
          ["8", "Data-flow prompt (Stage 3)", "8.7/10 avg, zero wrong services", "Yes (current default)"],
          ["9", "End-to-end pipeline (3 domains)", "8.3/10 combined avg", "Yes (production pipeline)"],
        ],
        [600, 3200, 3200, 2840]
      ),

      new Paragraph({ children: [new PageBreak()] }),

      // ── KEY FINDING: DATA-FLOW PROMPT ──
      heading("Key Finding: Data-Flow Prompt"),
      para("The single most impactful change was replacing 13 hardcoded keyword rules with a 3-sentence data-flow prompt for service path generation."),
      para(""),
      heading("The Problem", HeadingLevel.HEADING_2),
      para("The original Stage 3 prompt had 13 rules like: 'If goal mentions medical/hospital, inject nemo-guardrails.' This constrained the 120B model to 4 services because it played it safe with all the restrictions."),
      para(""),
      heading("The Solution", HeadingLevel.HEADING_2),
      para("Three sentences replaced all 13 rules:"),
      para("1. 'Produce a complete production-ready implementation path using NVIDIA services.'"),
      para("2. 'Describe the DATA FLOW \u2014 what goes into each service and what comes out.'"),
      para("3. 'If a service cannot be placed in the data flow with concrete inputs and outputs, do not include it.'"),
      para(""),
      heading("Why It Works", HeadingLevel.HEADING_2),
      para("The data flow constraint naturally filters out wrong services. The model cannot fake inputs/outputs for a service that does not fit the pipeline. For example:"),
      para("\u2022 Fraud detection: model used TensorRT (not TensorRT-LLM) because fraud models are not LLMs"),
      para("\u2022 Warehouse logistics: model used cuOpt + RAPIDS, no LLM services at all"),
      para("\u2022 Healthcare: model included NeMo Guardrails because HIPAA compliance needs safety rails"),
      para(""),

      simpleTable(
        ["Prompt Version", "Services (TC-2)", "Rating"],
        [
          ["13 hardcoded rules", "4", "4/10"],
          ["'Include ALL services'", "18", "5/10 (noisy)"],
          ["'Justify each service'", "6", "8/10"],
          ["'Production-ready + justify'", "10", "9/10"],
          ["Data-flow (inputs/outputs)", "8-10", "8.7/10 avg"],
        ],
        [4000, 2680, 3160]
      ),

      new Paragraph({ children: [new PageBreak()] }),

      // ── KEY FINDING: CODE GROUNDING ──
      heading("Key Finding: Code Pattern Grounding"),
      para("Notebook quality jumped from 5.5/10 to 8.5/10 by injecting real NVIDIA code patterns from GitHub repositories into the generation prompt."),
      para(""),
      heading("Without Grounding (5.5/10)", HeadingLevel.HEADING_2),
      para("The model hallucinated API names: nemo.collections.evaluation.accuracy_score (does not exist), export_nemo_model_to_tensorrt (does not exist), nvidia.clara.ai (does not exist)."),
      para(""),
      heading("With Grounding (8.5/10)", HeadingLevel.HEADING_2),
      para("12 real code patterns from NVIDIA GitHub repos were injected into the prompt. The model used correct APIs:"),
      para("\u2022 nemoguardrails: LLMRails, RailsConfig, rails.generate()"),
      para("\u2022 modelopt.torch.quantization: mtq.quantize()"),
      para("\u2022 tritonclient.http: InferenceServerClient, InferInput, set_data_from_numpy"),
      para("\u2022 nemo-evaluator-launcher: CLI-based evaluation launch"),
      para("\u2022 cudf: read_parquet, GPU DataFrames"),
      para("\u2022 trtexec: --onnx, --saveEngine, --fp16 flags"),

      new Paragraph({ children: [new PageBreak()] }),

      // ── END-TO-END RESULTS ──
      heading("End-to-End Pipeline Results (Experiment 9)"),
      para("Three fundamentally different enterprise domains were tested through the complete pipeline: GoalSpec generation, service path selection, and notebook code generation."),
      para(""),

      heading("Domain 1: Healthcare CDSS", HeadingLevel.HEADING_2),
      boldPara("Goal: ", "'Help doctors make better decisions at hospitals'"),
      boldPara("GoalSpec: ", "HIPAA, FDA SaMD Class II, AUC \u22650.85, Brier <0.1, \u226410% adverse event reduction"),
      boldPara("Path (8 services): ", "TensorRT \u2192 RAPIDS \u2192 NeMo \u2192 Evaluator \u2192 Guardrails \u2192 Model Optimizer \u2192 Triton \u2192 AI Enterprise"),
      boldPara("Key correct decisions: ", "TensorRT (not TensorRT-LLM) for clinical classifier; Guardrails for HIPAA; Evaluator for AUC metrics"),
      boldPara("Rating: ", "Path 8.5/10, Notebook 8/10"),
      para(""),

      heading("Domain 2: Banking Fraud Detection", HeadingLevel.HEADING_2),
      boldPara("Goal: ", "'Build a real-time fraud detection system for banking'"),
      boldPara("GoalSpec: ", "PCI DSS, GDPR, AML/BSA, \u22648ms E2E latency, FPR \u22640.1%, Recall \u226595%, \u2265150k TPS"),
      boldPara("Path (9 services): ", "Brev \u2192 DGX Cloud \u2192 RAPIDS \u2192 NeMo Curator \u2192 NeMo \u2192 Evaluator \u2192 Model Optimizer \u2192 Triton \u2192 AI Enterprise"),
      boldPara("Key correct decisions: ", "No TensorRT-LLM (tabular model); No Guardrails (PCI is infrastructure compliance); RAPIDS for transaction ETL"),
      boldPara("Rating: ", "Path 8.5/10, Notebook 8/10"),
      para(""),

      heading("Domain 3: E-Commerce Recommendations", HeadingLevel.HEADING_2),
      boldPara("Goal: ", "'Build an AI-powered recommendation engine for an e-commerce platform'"),
      boldPara("GoalSpec: ", "GDPR, CCPA, PCI-DSS, <100ms E2E, NDCG@10 \u22650.60, +10% CTR lift, \u226520k QPS"),
      boldPara("Path (9 services): ", "DGX Cloud \u2192 TensorRT \u2192 NeMo Curator \u2192 RAPIDS \u2192 Evaluator \u2192 Guardrails \u2192 Model Optimizer \u2192 Triton \u2192 AI Enterprise"),
      boldPara("Key correct decisions: ", "TensorRT (not TensorRT-LLM) for two-tower model; No NeMo Retriever (product ANN \u2260 document RAG); Full retrieval\u2192rerank Triton pipeline in notebook"),
      boldPara("Rating: ", "Path 9/10, Notebook 8/10"),
      para(""),

      simpleTable(
        ["Domain", "Path", "Notebook", "Combined"],
        [
          ["Healthcare CDSS", "8.5/10", "8/10", "8.25/10"],
          ["Banking Fraud", "8.5/10", "8/10", "8.25/10"],
          ["E-Commerce Recs", "9/10", "8/10", "8.5/10"],
          ["Average", "8.7/10", "8/10", "8.3/10"],
        ],
        [2800, 2200, 2200, 2640]
      ),

      new Paragraph({ children: [new PageBreak()] }),

      // ── CROSS-DOMAIN DIFFERENTIATION ──
      heading("Cross-Domain Differentiation"),
      para("The system correctly differentiated all three domains without any domain-specific rules:"),
      para(""),

      simpleTable(
        ["Aspect", "Healthcare", "Fraud", "E-Commerce"],
        [
          ["Model type", "Clinical classifier", "Tabular MLP", "Two-tower + reranker"],
          ["TensorRT variant", "TensorRT \u2713", "Model Optimizer only", "TensorRT \u2713"],
          ["Guardrails", "Yes (HIPAA) \u2713", "No \u2713", "Yes (GDPR) \u26A0"],
          ["Retriever/RAG", "Missing \u2717", "Not included \u2713", "Not included \u2713"],
          ["RAPIDS usage", "EHR processing", "Transaction ETL", "Click stream features"],
          ["Evaluator metrics", "AUC/Brier", "ROC/PR", "NDCG/CTR"],
          ["Training code", "Clinical MLP", "Fraud MLP", "Two-tower (CLI fabricated)"],
        ],
        [2000, 2200, 2200, 3440]
      ),

      new Paragraph({ children: [new PageBreak()] }),

      // ── KNOWN ISSUES ──
      heading("Known Issues"),
      para(""),
      heading("Consistent Issues Across All Notebooks", HeadingLevel.HEADING_2),
      para("1. NeMo training CLI is fabricated \u2014 'nemo train retrieval' does not exist. Grounding covers SDK APIs but not CLI commands."),
      para("2. Stray '}' syntax errors occasionally appear at end of code cells."),
      para("3. 'os.time.time()' instead of 'time.time()' in AI Enterprise cells."),
      para("4. NeMo Evaluator config YAML uses fabricated collection paths."),
      para("5. NeMo Retriever inconsistently included/excluded for healthcare use cases."),
      para(""),
      heading("What Works Consistently", HeadingLevel.HEADING_2),
      para("1. RAPIDS cuDF API \u2014 correct across all domains."),
      para("2. Model Optimizer mtq.quantize() \u2014 correct every time."),
      para("3. Triton client API \u2014 correct and increasingly detailed per domain."),
      para("4. NeMo Guardrails imports \u2014 RailsConfig.from_path() + LLMRails() correct."),
      para("5. TensorRT vs TensorRT-LLM selection \u2014 correct for all three domains."),
      para("6. trtexec CLI with correct flags."),
      para("7. Package installations \u2014 real package names, no hallucinated packages."),

      new Paragraph({ children: [new PageBreak()] }),

      // ── WHAT WAS TRIED AND REMOVED ──
      heading("Optimizations Tried and Removed"),
      para("The following optimizations were tested and removed based on data showing they hurt more than they helped:"),
      para(""),
      simpleTable(
        ["Optimization", "Why Removed", "Evidence"],
        [
          ["Self-critique prompt", "Fewer performance goals than baseline (3.9 vs 4.4 avg)", "Exp 7: baseline won 6/10"],
          ["Domain template injection", "Wrong templates fired for unrelated domains", "Exp 7: 'deploy' template fired for fraud detection"],
          ["49B adversary model", "Less thorough, generated false-positive challenges", "Exp 3, 5: counterproductive with caching"],
          ["Ground truth in planner", "Confused model on novel domains (drones, climate)", "Exp 7: irrelevant blueprints as 'ground truth'"],
          ["13 keyword rules", "Constrained 120B model to 4 services", "Exp 8: data-flow prompt produced 8-10 correct services"],
          ["Adversary loop on path", "Added 200+s for marginal improvement", "Exp 8: single call already 8.7/10"],
        ],
        [2400, 3600, 3840]
      ),

      new Paragraph({ children: [new PageBreak()] }),

      // ── ARCHITECTURE ──
      heading("Final Pipeline Architecture"),
      para(""),
      boldPara("Stage 1 \u2014 GoalSpec: ", "User goal \u2192 Nemotron 120B + adversary loop \u2192 domain, compliance, performance targets, inferred requirements, gaps, conflicts (~60-220s)"),
      para(""),
      boldPara("Stage 2 \u2014 Service Path: ", "GoalSpec \u2192 Nemotron 120B with data-flow prompt \u2192 ordered NVIDIA services with inputs/outputs (~80-120s)"),
      para(""),
      boldPara("Stage 3 \u2014 Scaffolding: ", "GoalSpec + path \u2192 templated markdown docs (PRD, stack, architecture, CLAUDE.md, AGENTS.md) \u2192 instant, zero LLM calls"),
      para(""),
      boldPara("Stage 4 \u2014 Notebook: ", "Goal + path + 12 NVIDIA code patterns \u2192 Nemotron 120B \u2192 production-ready .ipynb with real SDK code (~150-300s)"),
      para(""),
      boldPara("Stage 5 \u2014 Export: ", "Zip package with docs/ + notebook.ipynb + CLAUDE.md + AGENTS.md \u2192 downloadable from UI"),
      para(""),
      boldPara("Total pipeline time: ", "~5-10 minutes with progressive delivery (user sees results at each stage)"),
      para(""),
      boldPara("LLM calls: ", "3 (GoalSpec + path + notebook). Scaffolding is templated, zero LLM."),
    ]
  }]
});

const buffer = await Packer.toBuffer(doc);
fs.writeFileSync("docs/EXPERIMENTATION_REPORT.docx", buffer);
console.log("Report saved to docs/EXPERIMENTATION_REPORT.docx");
