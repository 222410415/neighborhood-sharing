#!/usr/bin/env node
/**
 * Summarise the team's manual scores for the policy assistant evaluation.
 *   node scripts/quality/summarize-policy-evaluation.mjs reports/policy-assistant-YYYY-MM-DD.csv
 * Counts manual_score values (correct / partial / wrong) and reports the share
 * of correct answers against the 85 percent target. Unscored rows are listed,
 * never guessed.
 */

import { readFileSync } from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/quality/summarize-policy-evaluation.mjs <csv file>");
  process.exit(1);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

const [header, ...data] = parseCsv(readFileSync(file, "utf-8"));
const idx = (name) => header.indexOf(name);
const scores = { correct: 0, partial: 0, wrong: 0 };
const unscored = [];
for (const r of data) {
  const s = (r[idx("manual_score")] ?? "").trim().toLowerCase();
  if (s in scores) scores[s]++;
  else unscored.push(r[idx("id")]);
}
const scored = scores.correct + scores.partial + scores.wrong;
console.log(`Rows: ${data.length}, scored: ${scored}, unscored: ${unscored.length}`);
console.log(`Correct ${scores.correct}, partially correct ${scores.partial}, wrong ${scores.wrong}`);
if (scored > 0) {
  const pct = ((scores.correct / scored) * 100).toFixed(1);
  console.log(`Correct share of scored answers: ${pct}% (target 85%)`);
}
if (unscored.length) console.log(`Not yet scored: ${unscored.join(", ")}`);
