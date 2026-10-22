// TS Trainer のテスト（依存ゼロ・Node標準のみ）
// 実行: node test.mjs
// index.html の <script id="engine"> を抽出して検証する:
//   1. 型ストリッパーが TS → 実行可能な JS に正しく変換できる
//   2. 全レッスンの解答例が型チェック・動作テストの両方に合格する
//   3. starter（未完成コード）はそのままでは合格しない
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const m = html.match(/<script id="engine">([\s\S]*?)<\/script>/);
if (!m) { console.error("engine スクリプトが見つかりません"); process.exit(1); }
const { CHAPTERS, ALL, runCode, stripTypes } = new Function(
  m[1] + "\n;return { CHAPTERS, ALL, runCode, stripTypes };"
)();

let pass = 0, fail = 0;
const failures = [];
function assert(name, cond, detail = "") {
  if (cond) { pass++; }
  else { fail++; failures.push(name + (detail ? ` — ${detail}` : "")); }
}

/* ---- 1. 型ストリッパー単体テスト ---- */
function evalStripped(tsCode, expr) {
  const js = stripTypes(tsCode);
  try { return new Function(`"use strict";\n${js}\n;return (${expr});`)(); }
  catch (e) { throw new Error(`${e.message}\n--- stripped ---\n${js}`); }
}
const stripCases = [
  ["変数の注釈", 'const x: number = 1;', "x", 1],
  ["リテラル型ユニオン", 'let mode: "major" | "minor" = "major";', "mode", "major"],
  ["引数と戻り値の注釈", 'function f(a: string, b: number): string { return a.repeat(b); }', 'f("ab", 2)', "abab"],
  ["オプショナル引数", 'function g(name: string, h?: string): string { return `${name}${h ?? "さん"}`; }', 'g("太郎")', "太郎さん"],
  ["デフォルト引数", 'function h(v: number, s: number = 10): number { return v - s; }', "h(30)", 20],
  ["interface 除去", 'interface T { a: number; b: string; }\nfunction f(t: T): number { return t.a; }', "f({a: 7, b: ''})", 7],
  ["type エイリアス除去", 'type P = { x: number; y: number };\nfunction f(p: P): number { return p.x + p.y; }', "f({x: 1, y: 2})", 3],
  ["単一行 type 除去", 'type ID = string | number;\nconst v: ID = 5;', "v", 5],
  ["ジェネリクス", 'function first<T>(items: T[]): T | undefined { return items[0]; }', "first([9, 8])", 9],
  ["Record と辞書", 'function c(xs: string[]): Record<string, number> { const r: Record<string, number> = {}; for (const x of xs) r[x] = (r[x] ?? 0) + 1; return r; }', 'c(["a","a","b"]).a', 2],
  ["オブジェクトリテラルは壊さない", 'function f(): { x: number } { return { x: 42 }; }', "f().x", 42],
  ["三項演算子は壊さない", 'function f(n: number): string { return n > 0 ? "plus" : "minus"; }', "f(1)", "plus"],
  ["引数内の三項演算子", 'function f(n: number): number { return Math.max(n > 0 ? n : 0, 1); }', "f(-5)", 1],
  ["テンプレート内のコロン", 'function f(t: number): string { return `time: ${t}`; }', "f(3)", "time: 3"],
  ["switch の case は壊さない", 'function f(n: number): string { switch (n) { case 1: return "one"; default: return "other"; } }', "f(1)", "one"],
  ["アロー関数の注釈", 'const d = (n: number): number => n * 2;', "d(4)", 8],
  ["コールバックの注釈", 'function f(xs: number[]): number[] { return xs.map((n: number) => n * 2); }', "f([1,2])[1]", 4],
  ["分割代入引数の注釈", 'function f({ title, duration }: { title: string; duration: number }): string { return `${title}:${duration}`; }', 'f({title:"a", duration:1})', "a:1"],
  ["ユニオン + typeof ガード", 'function f(id: number | string): string { if (typeof id === "number") return `No.${id}`; return id.toUpperCase(); }', 'f("ab")', "AB"],
  ["交差型", 'type A = { a: number };\ntype B = { b: number };\ntype AB = A & B;\nfunction f(x: AB): number { return x.a + x.b; }', "f({a:1, b:2})", 3],
  ["as キャスト除去", 'const n = ("5" as unknown) as number;', "n", "5"],
  ["?? と ?. は壊さない", 'function f(o?: { v?: number }): number { return o?.v ?? -1; }', "f()", -1],
  ["オブジェクト内の三項演算子", 'function f(n: number) { return { v: n > 0 ? "p" : "m" }; }', "f(1).v", "p"],
  ["文字列内の as は壊さない", 'const s: string = "known as Miku";', "s", "known as Miku"],
  ["テンプレート内の as は壊さない", 'const t = "x";\nconst s: string = `same as ${t}`;', "s", "same as x"],
  ["テンプレート式の中の as は除去", 'const v: unknown = 5;\nconst s = `${(v as number) + 1}`;', "s", "6"],
  ["文字列内の type/interface は壊さない", 'const s = "a;type X = 1;interface Y {}";', "s", "a;type X = 1;interface Y {}"],
  ["コメント内の as でコードがずれない", 'const a: number = 1; // same as b\nconst b: number = a + 1;', "b", 2],
];
for (const [name, code, expr, want] of stripCases) {
  try {
    const got = evalStripped(code, expr);
    assert(`strip: ${name}`, Object.is(got, want) || JSON.stringify(got) === JSON.stringify(want), `期待 ${JSON.stringify(want)} / 実際 ${JSON.stringify(got)}`);
  } catch (e) {
    assert(`strip: ${name}`, false, e.message.split("\n")[0]);
  }
}

/* ---- 2. 全レッスン: 解答例が合格する ---- */
assert("レッスン数は20問", ALL.length === 20, `実際 ${ALL.length}問`);
assert("章数は5章", CHAPTERS.length === 5, `実際 ${CHAPTERS.length}章`);
for (const ch of CHAPTERS) {
  assert(`${ch.title}: 📚リソースあり`, Array.isArray(ch.resources) && ch.resources.length > 0);
}
for (const l of ALL) {
  const r = await runCode(l, l.solution);
  const ng = (r.results ?? []).filter(x => !x.pass);
  assert(`解答例が合格: ${l.id}`, !r.error && ng.length === 0,
    r.error ?? ng.map(f => `${f.name}(${f.detail ?? ""})`).join("; "));
}

/* ---- 3. starter は合格しない（未完成であることの確認） ---- */
for (const l of ALL) {
  const r = await runCode(l, l.starter);
  const ok = !!r.error || (r.results ?? []).some(x => !x.pass);
  assert(`starterは不合格: ${l.id}`, ok, "starter がそのまま合格してしまいます");
}

/* ---- 4. 型チェックはコメントを見ない ---- */
{
  const byId = id => ALL.find(l => l.id === id);
  const typeFails = async (id, code) => (await runCode(byId(id), code)).results.filter(x => !x.pass && x.name.startsWith("[型]"));
  const commented = '// const title: string\n// const bpm: number\n// const isPlaying: boolean\nconst title = "Night Drive";\nconst bpm = 128;\nconst isPlaying = false;';
  assert("型チェック: コメントに書いただけの注釈は合格にしない", (await typeFails("annotate", commented)).length === 3);
  const anyInComment = 'function describeValue(value: unknown): string {\n  /* 型: any は使わない */\n  if (typeof value === "number") return `数値: ${value}`;\n  return "その他";\n}';
  const ng = await typeFails("describeValue", anyInComment);
  assert("型チェック: コメント中の any では不合格にしない", ng.length === 0, ng.map(x => x.name).join("; "));
}

/* ---- 結果 ---- */
console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log("\n失敗:");
  for (const f of failures) console.log("  ✗ " + f);
  process.exit(1);
}
