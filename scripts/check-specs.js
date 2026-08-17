// scripts/check-specs.js — Verifica la salud de las specs
//
// Comprueba, por cada spec de docs/spec/:
//   1. Que tenga un estado válido en su cabecera ([COMPLETADA] / [EN CURSO] /
//      [PROSPECTIVA] / [ARCHIVADA]).
//   2. Que los archivos mencionados en las secciones "Archivos implicados" y en
//      la línea "Tests que cubren esta fase" existan (referencias rotas).
//      En specs [PROSPECTIVA] y [EN CURSO] los tests pendientes cuentan como
//      aviso, no error.
//   3. Que no queden rutas del antiguo layout (`docs/faseN-spec.md` /
//      `docs/auditoria-*`); ahora viven en docs/spec/ y docs/audits/.
//
// Uso: node scripts/check-specs.js  →  exit 0 si no hay errores (avisos OK).
//      node scripts/check-specs.js --verbose  →  detalle.
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const SPEC_DIR = path.join(ROOT, "docs", "spec");
const _AUDIT_DIR = path.join(ROOT, "docs", "audits");

const VALID_STATES = [
	"[COMPLETADA]",
	"[EN CURSO]",
	"[PROSPECTIVA]",
	"[ARCHIVADA]"
];

// Rutas que NO deben considerarse rotas: comandos (/tp), placeholders
// (world/<semilla>/), globs (tests/unit-*.js) o rutas tipo en la propia
// plantilla (tests/unit-faseN.js).
function isPlaceholder(ref) {
	return (
		ref.startsWith("/") ||
		/[<>*?]/.test(ref) ||
		/faseN\b/.test(ref) ||
		/\.\.\.$/.test(ref)
	);
}

function existsInRepo(rel) {
	if (!rel) return false;
	const clean = rel.replace(/^\.\//, "").replace(/^#.*/, "");
	if (!clean || clean.startsWith("#")) return false;
	if (/^https?:\/\//.test(clean)) return true;
	return fs.existsSync(path.join(ROOT, clean));
}

function refsInSection(content, startMarker, endMarker) {
	const refs = [];
	const start = content.indexOf(startMarker);
	if (start === -1) return refs;
	let end = content.indexOf(endMarker, start + startMarker.length);
	if (end === -1) end = content.length;
	const section = content.slice(start, end);
	for (const m of section.matchAll(/`([^`]+)`/g)) refs.push(m[1]);
	return refs;
}

// En [PROSPECTIVA] y [EN CURSO] los tests pendientes (previstos aún no
// creados) son aviso, no error: una fase en curso cubre sus tests conforme
// avanza su implementación.
function allowsPendingTests(content) {
	return /\[PROSPECTIVA\]|\[EN CURSO\]/.test(content.slice(0, 500));
}

function main() {
	const _verbose = process.argv.includes("--verbose");
	const errors = [];
	const warnings = [];
	let specCount = 0;

	if (!fs.existsSync(SPEC_DIR)) {
		console.error(`✗ No existe ${SPEC_DIR}`);
		process.exit(1);
	}

	const specs = fs
		.readdirSync(SPEC_DIR)
		.filter((f) => f.endsWith("-spec.md") && f !== "TEMPLATE.md")
		.sort();

	for (const file of specs) {
		specCount++;
		const full = path.join(SPEC_DIR, file);
		const content = fs.readFileSync(full, "utf8");
		const pendingTestsOk = allowsPendingTests(content);

		// 1. Estado válido en las primeras 15 líneas
		const head = content.split("\n").slice(0, 15).join(" ");
		if (!VALID_STATES.some((s) => head.includes(s))) {
			errors.push([
				file,
				`sin etiqueta de estado válida (${VALID_STATES.join(", ")})`
			]);
		}

		// 2. Archivos mencionados en "Archivos implicados" / "Tests que cubren"
		const testLine =
			content.match(/Tests que cubren esta fase[^\n]*/)?.[0] || "";
		const sections = refsInSection(content, "## Archivos implicados", "## ")
			.concat(refsInSection(content, "### Archivos implicados", "### "))
			.concat((testLine.match(/`[^`]+`/g) || []).map((t) => t.slice(1, -1)));
		const seen = new Set();
		for (const ref of sections) {
			if (isPlaceholder(ref)) continue;
			if (seen.has(ref)) continue;
			seen.add(ref);
			const isTest = ref.startsWith("tests/");
			if (!existsInRepo(ref)) {
				const entry = `archivo inexistente: \`${ref}\``;
				if (isTest && pendingTestsOk) warnings.push([file, entry]);
				else errors.push([file, entry]);
			}
		}

		// 3. Rutas del antiguo layout
		for (const m of content.matchAll(
			/`docs\/(fase[\d.]+-spec\.md|auditoria-[\d-]+\.md)`/g
		)) {
			errors.push([
				file,
				`ruta antigua (ahora en docs/spec/ o docs/audits/): docs/${m[1]}`
			]);
		}
	}

	const print = (list, label) => {
		if (!list.length) return;
		console[list === errors ? "error" : "log"](`\n── ${label}: ${list.length}`);
		for (const [f, p] of list) console.log(`  ${f}: ${p}`);
	};

	print(errors, "ERRORES");
	print(warnings, "AVISOS (specs prospectivas con tests pendientes)");

	console.log(`\nSpecs revisadas: ${specCount}`);
	if (errors.length === 0) {
		console.log(
			`✓ check-specs: ${errors.length} errores, ${warnings.length} avisos.`
		);
		return 0;
	}
	console.error(
		`✗ check-specs: ${errors.length} error(es) — corregir antes de entregar.`
	);
	return 1;
}

process.exit(main());
