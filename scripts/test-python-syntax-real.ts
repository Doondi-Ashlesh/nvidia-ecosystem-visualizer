import { validatePythonSyntax } from '../lib/validators/python-syntax';

const cells = [
  { cell_type: 'code', source: 'def foo(\n    pass  # missing closing paren' },
  { cell_type: 'code', source: 'if True\n    print("x")  # missing colon' },
  { cell_type: 'code', source: 'x = (\n# unclosed bracket' },
  { cell_type: 'code', source: 'def ok():\n    return 1  # valid' },
];
const r = validatePythonSyntax(cells);
console.log('Cells checked:', r.stats.codeCellsChecked);
console.log('Violations:', r.violations.length);
for (const v of r.violations) {
  console.log(`  cell ${v.cellIndex + 1} line ${v.lineNumber}: ${v.message}`);
}
