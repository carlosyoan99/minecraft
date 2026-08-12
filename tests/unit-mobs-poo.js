"use strict";
// ============================================================
// TESTS UNITARIOS DE POO DE MOBS (Fase 13, C2)
// Verifica la herencia por especie: cada tipo tiene su subclase de
// Mob, `createMob` elige la clase correcta (fábrica tipo→clase), el
// hook `onDeath` está sobrescrito solo donde hace falta (slime) y el
// `new Mob(tipo)` de los tests antiguos sigue funcionando.
// ============================================================
const mobs = require("../server/mobs.js");
const state = require("../server/state.js");

// Sin zona segura de spawn y sin agua, como los tests de IA pura.
mobs.setSpawnSafeRadius(0);

let fails = 0;
const failedChecks = [];
// Fase 15 (cierre): reporte uniforme de checks fallidos (lo parsea run.js).
process.on("exit", () => {
	if (failedChecks?.length)
		console.log(
			`# checks fallidos: ${failedChecks.length} — ${failedChecks.join("; ")}`
		);
});
const check = (name, ok, extra = "") => {
	if (!ok) {
		fails++;
		failedChecks.push(name);
	}
	console.log(`${ok ? "🟢" : "🔴"} ${name}${extra ? " — " + extra : ""}`);
};

// --- 1. La fábrica devuelve la subclase correcta por tipo -------------
const cases = [
	["zombie", "Zombie"],
	["spider", "Spider"],
	["wolf", "Wolf"],
	["slime", "Slime"],
	["drowned", "Drowned"],
	["creeper", "Creeper"],
	["skeleton", "Skeleton"],
	["enderman", "Enderman"],
	["cow", "Cow"],
	["pig", "Pig"],
	["chicken", "Chicken"],
	["sheep", "Sheep"],
	["rabbit", "Rabbit"],
	["bee", "Bee"],
	["ocelot", "Ocelot"]
];
for (const [type, cls] of cases) {
	const m = mobs.createMob(type, 0, 10, 0);
	const Cls = mobs[cls];
	check(
		`createMob("${type}") → ${cls}`,
		m instanceof Cls && m instanceof mobs.Mob && m.type === type,
		`ctor=${m.constructor.name}`
	);
}

// --- 2. Tipos sin clase propia caen en la base -------------------------
{
	const cat = mobs.createMob("cat", 0, 10, 0); // "cat" solo existe como type runtime
	check(
		'tipo sin registro ("cat") cae en Mob base',
		cat instanceof mobs.Mob &&
			cat.constructor === mobs.Mob &&
			cat.type === "cat"
	);
}

// --- 3. tickSpecies sobrescrito por cada subclase ----------------------
for (const [type, cls] of cases) {
	const m = mobs.createMob(type, 0, 10, 0);
	check(
		`${cls}.prototype.tickSpecies ≠ Mob base`,
		m.tickSpecies !== mobs.Mob.prototype.tickSpecies,
		m.tickSpecies === mobs.Mob.prototype.tickSpecies
			? "usa el switch base"
			: "propio"
	);
}

// --- 4. El hook onDeath: base vacía, slime la sobrescribe --------------
{
	const base = mobs.createMob("cow", 0, 10, 0);
	check(
		"onDeath base no hace nada (hook vacío)",
		base.onDeath() === undefined &&
			base.onDeath !== mobs.Slime.prototype.onDeath
	);
	const slime = mobs.createMob("slime", 0, 10, 0);
	check(
		"Slime sobrescribe onDeath (se divide al morir)",
		slime.onDeath !== mobs.Mob.prototype.onDeath
	);
}

// --- 5. Compatibilidad: `new Mob(tipo)` de los tests antiguos ----------
{
	const z = new mobs.Mob("zombie", 0, 10, 0);
	check(
		'new Mob("zombie") mantiene API (health, tick)',
		z.type === "zombie" &&
			z.health === 20 &&
			typeof z.tick === "function" &&
			typeof z.tickSpecies === "function"
	);
	// El switch base sigue despachando (compatibilidad): un zombie con un
	// jugador hostil cerca entra en chase. El jugador debe estar registrado
	// en state.players (lo busca findNearestPlayer).
	const CLOSED = 3;
	const p = {
		id: "ppoo",
		ws: { readyState: CLOSED, send() {} },
		health: 20,
		x: 3,
		y: 10,
		z: 0
	};
	state.players.clear();
	state.players.set(p.id, p);
	z.state = "idle";
	z.tick(true, p, 3); // de noche, jugador a 3 bloques → persigue
	check(
		"tick() base despacha al switch (zombie → chase)",
		z.state === "chase",
		`state=${z.state}`
	);
	state.players.clear();
}

// --- 6. createMob usado en spawnMobs (smoke sin spawn) ------------------
{
	const created = mobs.spawnMobs(true);
	check(
		"spawnMobs devuelve array con instancias de Mob",
		Array.isArray(created) && created.every((m) => m instanceof mobs.Mob),
		`${created.length} mobs`
	);
}

console.log(fails ? `\n${fails} FALLO(S)` : "\nTodo en verde (POO de mobs).");
process.exit(fails ? 1 : 0);
