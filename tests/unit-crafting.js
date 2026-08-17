"use strict";
// Test unitario del sistema de crafteo por patrón y hornos (crafting.js).
// Cubre matchRecipe (offsets, materiales, casos negativos) y el ciclo completo
// del horno (combustible, progreso, salida, enfriado, restauración, snapshot).
const crafting = require("../server/crafting.js");
const state = require("../server/state.js");

let fails = 0;
const failedChecks = [];
// Fase 15 (cierre): reporte uniforme de checks fallidos (lo parsea run.js).
process.on("exit", () => {
	if (failedChecks?.length)
		console.log(
			`# checks fallidos: ${failedChecks.length} — ${failedChecks.join("; ")}`
		);
});
function check(_name, ok, _extra = "") {
	if (!ok) {
		fails++;
		failedChecks.push(_name);
	}
}

crafting.loadRecipes();

// Grid 3x3 helper: pares [índice, id] sobre las 9 celdas (null = vacío)
function grid(...cells) {
	const g = new Array(9).fill(null);
	for (const [idx, id] of cells) g[idx] = { id, count: 1 };
	return g;
}

// ============================================================
// CRAFTEO POR PATRÓN (matchRecipe)
// ============================================================

// 1) Grid vacío → sin receta
check("grid vacio -> sin receta", crafting.matchRecipe(grid()) === null);

// 2) Un tronco (4) suelto → planks (7) x4
{
	const r = crafting.matchRecipe(grid([4, 4]));
	check(
		"tronco suelto -> planks x4",
		r && r.result.id === 7 && r.result.count === 4,
		JSON.stringify(r?.result)
	);
}

// 3) Offsets: el mismo patrón en la esquina inferior derecha también matchea
{
	const r = crafting.matchRecipe(grid([8, 4]));
	check(
		"tronco en esquina (offset) -> planks",
		r && r.result.id === 7,
		JSON.stringify(r?.result)
	);
}

// 4) Dos planks (7) apilados en vertical → stick (100)
{
	const r = crafting.matchRecipe(grid([0, 7], [3, 7]));
	check(
		"planks verticales -> stick",
		r && r.result.id === 100,
		JSON.stringify(r?.result)
	);
}

// 5) Negativo: dos planks en horizontal NO son un stick (el patrón es vertical)
check(
	"planks horizontales no -> stick",
	crafting.matchRecipe(grid([0, 7], [1, 7])) === null
);

// 6) Mesa de crafteo: 2x2 planks → 15
{
	const r = crafting.matchRecipe(grid([0, 7], [1, 7], [3, 7], [4, 7]));
	check(
		"2x2 planks -> crafting_table (15)",
		r && r.result.id === 15,
		JSON.stringify(r?.result)
	);
}

// 7) Horno: anillo de cobblestone (8) con el centro vacío → 16
{
	const ring = [
		[0, 8],
		[1, 8],
		[2, 8],
		[3, 8],
		[5, 8],
		[6, 8],
		[7, 8],
		[8, 8]
	];
	const r = crafting.matchRecipe(grid(...ring));
	check(
		"anillo de cobblestone -> horno (16)",
		r && r.result.id === 16,
		JSON.stringify(r?.result)
	);
}

// 8) Pico de madera: planks arriba + sticks en el eje central → 200
{
	const r = crafting.matchRecipe(
		grid([0, 7], [1, 7], [2, 7], [4, 100], [7, 100])
	);
	check(
		"pico de madera (200)",
		r && r.result.id === 200,
		JSON.stringify(r?.result)
	);
}

// 9) Pico de piedra: mismo patrón con cobblestone → 201
{
	const r = crafting.matchRecipe(
		grid([0, 8], [1, 8], [2, 8], [4, 100], [7, 100])
	);
	check(
		"pico de piedra (201)",
		r && r.result.id === 201,
		JSON.stringify(r?.result)
	);
}

// 10) Un bloque de arena (6) suelto → vidrio (17)
{
	const r = crafting.matchRecipe(grid([4, 6]));
	check(
		"arena suelta -> vidrio (17)",
		r && r.result.id === 17,
		JSON.stringify(r?.result)
	);
}

// 11) Negativo: un bloque de tierra (1) no tiene receta
check(
	"tierra suelta -> sin receta",
	crafting.matchRecipe(grid([4, 1])) === null
);

// 12) Negativo: material incorrecto en el patrón de pico (arena en vez de planks)
check(
	"pico con material malo -> null",
	crafting.matchRecipe(grid([0, 6], [1, 6], [2, 6], [4, 100], [7, 100])) ===
		null
);

// 13) Negativo: patrón válido de stick + un ítem extra fuera del patrón → null
check(
	"stick + item extra -> null",
	crafting.matchRecipe(grid([0, 7], [3, 7], [2, 4])) === null
);

// ============================================================
// HORNOS
// ============================================================

// Helper: horno fresco (limpia el mapa para que tickFurnaces no vea otros)
function freshFurnace(over = {}) {
	state.furnaces.clear();
	const f = crafting.getOrCreateFurnace("0,0,0");
	return Object.assign(
		f,
		{
			fuelItem: null,
			fuelCount: 0, // Fase 16 (D1): unidades de combustible reales
			fuelTicksLeft: 0,
			inputItem: null,
			progress: 0,
			requiredTicks: 0,
			outputItem: null,
			outputCount: 0
		},
		over
	);
}

// 14) isCookable: tronco (carbón vegetal), arena, comida cruda y el CRUDO de
// hierro/oro sí; planks y aire no. (Fase 18, C-7 + Fase 20 B3: el bloque de
// mena no es cocinable — se mina a crudo (RAW) y ESE sí funde a lingote;
// el tronco funde a carbón vegetal 257.)
check("isCookable(4) tronco -> true", crafting.isCookable(4) === true);
check("isCookable(107) carne cruda -> true", crafting.isCookable(107) === true);
check("isCookable(6) arena -> true", crafting.isCookable(6) === true);
check(
	"isCookable(258) hierro crudo -> true",
	crafting.isCookable(258) === true
);
check("isCookable(259) oro crudo -> true", crafting.isCookable(259) === true);
check(
	"isCookable(9) mena (bloque) NO -> false",
	crafting.isCookable(9) === false
);
check("isCookable(7) planks no -> false", crafting.isCookable(7) === false);
check("isCookable(0) aire no -> false", crafting.isCookable(0) === false);

// 15) getOrCreateFurnace: estado inicial por defecto y reutiliza la misma instancia
{
	state.furnaces.clear();
	const a = crafting.getOrCreateFurnace("k1");
	check(
		"getOrCreateFurnace estado inicial",
		a.fuelTicksLeft === 0 &&
			a.progress === 0 &&
			a.inputItem === null &&
			a.outputItem === null
	);
	const b = crafting.getOrCreateFurnace("k1");
	check("getOrCreateFurnace reutiliza instancia", a === b);
}

// 16) Ciclo completo: tronco (4) -> carbón vegetal (257) en 200 ticks
// (Fase 18, C-7: las menas ya no se funden — ORE_DROP da el drop directo.
// Fase 16, D1: el combustible se consume de verdad — 1 unidad de tablones
// rinde FUEL_TICKS y se agota; aquí 1 tablón cubre los 200 ticks de la receta)
{
	const f = freshFurnace({
		inputItem: { id: 4, count: 1 },
		fuelItem: 7, // Fase 16 (D1): fuelItem es el ID numérico (igual que en el wire)
		fuelCount: 1
	});
	for (let i = 0; i < 200; i++) crafting.tickFurnaces();
	check(
		"cocinar tronco -> carbón vegetal 257 x1",
		f.outputItem === 257 && f.outputCount === 1,
		`out=${f.outputItem}x${f.outputCount}`
	);
	check("input consumido", f.inputItem === null, JSON.stringify(f.inputItem));
	check("requiredTicks 200", f.requiredTicks === 200, `req=${f.requiredTicks}`);
	check("progress reseteado a 0", f.progress === 0, `progress=${f.progress}`);
	check(
		"D1: la unidad de tablones se consumió (fuelItem null)",
		f.fuelItem === null,
		JSON.stringify(f.fuelItem)
	);
	check(
		"D1: 1 tablón rinde 300 ticks y tras 200 de cocción quedan 100",
		f.fuelTicksLeft === 100,
		`ticks=${f.fuelTicksLeft}`
	);
}

// 17) Dos unidades: 400 ticks -> 2 de salida (1 carbón de 1600 ticks)
// (Fase 16, D1: antes un combustible genérico rendía 400 ticks sin consumirse;
// ahora el carbón rinde FUEL_TICKS[101] = 1600 y se consume al encender)
{
	const f = freshFurnace({
		inputItem: { id: 4, count: 2 },
		fuelItem: 101, // carbón (ID numérico, formato D1 del wire)
		fuelCount: 1
	});
	for (let i = 0; i < 400; i++) crafting.tickFurnaces();
	check(
		"2 troncos -> 2 carbón vegetal (257)",
		f.outputItem === 257 && f.outputCount === 2,
		`out=${f.outputItem}x${f.outputCount}`
	);
	check("input agotado", f.inputItem === null, JSON.stringify(f.inputItem));
	check(
		"D1: la unidad de carbón se consumió",
		f.fuelItem === null && f.fuelTicksLeft === 1200, // 1600 − 400 de cocción
		`fuel=${f.fuelItem} ticks=${f.fuelTicksLeft}`
	);
}

// 18) Tiempo por receta: arena (6) -> vidrio (17) tarda 200 ticks
// (Fase 16, D4: paridad MC — antes 150; 1 tablón de 300 ticks cubre la receta)
{
	const f = freshFurnace({
		inputItem: { id: 6, count: 1 },
		fuelItem: 7, // tablones (ID numérico, formato D1 del wire)
		fuelCount: 1
	});
	for (let i = 0; i < 200; i++) crafting.tickFurnaces();
	check(
		"arena -> vidrio en 200 ticks",
		f.outputItem === 17 && f.outputCount === 1,
		`out=${f.outputItem}x${f.outputCount}`
	);
	check("requiredTicks 200", f.requiredTicks === 200, `req=${f.requiredTicks}`);
}

// 19) Sin combustible no se cocina y el progreso se enfría (-2 por tick)
{
	const f = freshFurnace({
		inputItem: { id: 4, count: 1 }, // tronco → carbón vegetal (C-7: sin menas)
		progress: 10,
		requiredTicks: 200
	});
	crafting.tickFurnaces();
	check(
		"sin combustible -> no avanza",
		f.progress === 8 && f.outputItem === null,
		`progress=${f.progress}`
	);
	for (let i = 0; i < 10; i++) crafting.tickFurnaces();
	check("enfriado hasta 0", f.progress === 0, `progress=${f.progress}`);
}

// 19b) Fase 18 (C-6): DESPERDICIO — el combustible se sigue quemando aunque
// el insumo se agote a mitad de quema (como Minecraft). Con 1 carbón (1600
// t) y 1 tronco (200 t → carbón vegetal): tras cocer, quedan 1400 t de fuego
// que se queman igualmente hasta 0 (antes se congelaban para siempre).
{
	const f = freshFurnace({
		inputItem: { id: 4, count: 1 }, // tronco → carbón vegetal (C-7)
		fuelItem: 101, // carbón
		fuelCount: 1
	});
	for (let i = 0; i < 200; i++) crafting.tickFurnaces(); // termina la receta
	check(
		"C-6: receta completada",
		f.outputItem === 257 && f.outputCount === 1,
		`out=${f.outputItem}x${f.outputCount}`
	);
	check(
		"C-6: tras cocer quedan 1400 t de fuego",
		f.fuelTicksLeft === 1400,
		`ticks=${f.fuelTicksLeft}`
	);
	// Sin insumo: el fuego se desperdicia (se consume hasta 0).
	for (let i = 0; i < 1400; i++) crafting.tickFurnaces();
	check(
		"C-6: el fuego se desperdicia hasta 0 (no se congela)",
		f.fuelTicksLeft === 0 && f.fuelItem === null,
		`ticks=${f.fuelTicksLeft} fuel=${f.fuelItem}`
	);
}

// 19c) Fase 18 (C-6): DESPERDICIO con combustible SOBRANTE en el tanque —
// tras agotar la primera unidad sin insumo, la siguiente unidad del tanque
// NO entra sola (MC: el horno solo arranca si hay algo que cocinar).
{
	const f = freshFurnace({
		inputItem: { id: 4, count: 1 }, // tronco → carbón vegetal (C-7)
		fuelItem: 101, // carbón
		fuelCount: 2 // dos unidades cargadas
	});
	for (let i = 0; i < 200; i++) crafting.tickFurnaces(); // receta completa
	for (let i = 0; i < 1400; i++) crafting.tickFurnaces(); // quema el resto de la 1ª
	check(
		"C-6: 1ª unidad de carbón agotada (fuego a 0)",
		f.fuelTicksLeft === 0,
		`ticks=${f.fuelTicksLeft} fuel=${f.fuelItem}`
	);
	// La 2ª unidad queda en el tanque (fuelCount 1, fuelItem 101) — no
	// arranca sin insumo (MC solo desperdicia la unidad YA encendida).
	check(
		"C-6: la 2ª unidad NO se quema sin insumo (queda en el tanque)",
		f.fuelItem === 101 && f.fuelCount === 1,
		`fuel=${f.fuelItem} count=${f.fuelCount}`
	);
}

// 19d) Fase 18 (C-6): ENCOLADO FIFO — con una unidad de carbón en el tanque
// y otra de otro combustible en la cola, al agotarse el carbón (con insumo
// pendiente) entra el encolado y se quema en orden.
{
	const f = freshFurnace({
		inputItem: { id: 4, count: 9 }, // 9 troncos = 1800 t (más que 1 carbón)
		fuelItem: 101, // carbón en el tanque (1600 t = 8 recetas)
		fuelCount: 1,
		fuelQueue: [{ id: 7, count: 1 }] // tablones encolados (FIFO, 300 t)
	});
	for (let i = 0; i < 1600; i++) crafting.tickFurnaces(); // carbón agotado
	check(
		"C-6: el carbón cocinó 8 recetas y se agotó",
		f.outputItem === 257 && f.outputCount === 8 && f.fuelTicksLeft === 0,
		`out=${f.outputItem}x${f.outputCount} ticks=${f.fuelTicksLeft}`
	);
	// Queda 1 tronco sin cocinar: con insumo, entra la unidad encolada. El
	// tick de encendido ya quema 1 t (paridad D1: carga+quema en el mismo
	// tick), así que quedan 299 t del tablón y la cola se vació.
	crafting.tickFurnaces();
	check(
		"C-6: con insumo pendiente, al agotar el carbón entra el encolado (300 t)",
		f.fuelTicksLeft === 299 && f.fuelCount === 0 && f.fuelQueue.length === 0,
		`ticks=${f.fuelTicksLeft} count=${f.fuelCount} q=${f.fuelQueue.length}`
	);
	for (let i = 0; i < 200; i++) crafting.tickFurnaces();
	check(
		"C-6: el tablón encolado completa la 9ª receta",
		f.outputCount === 9,
		`out=${f.outputItem}x${f.outputCount}`
	);
}

// 20) Salida ocupada con otro ítem: el resultado se pierde (horno lleno, simplificado)
{
	const f = freshFurnace({
		inputItem: { id: 4, count: 1 }, // tronco → carbón vegetal (C-7)
		fuelItem: 7, // tablones (formato D1: ID numérico)
		fuelCount: 1,
		outputItem: 999,
		outputCount: 5
	});
	for (let i = 0; i < 200; i++) crafting.tickFurnaces();
	check(
		"salida ocupada -> se pierde el resultado",
		f.outputItem === 999 && f.outputCount === 5,
		`out=${f.outputItem}x${f.outputCount}`
	);
	check(
		"pero el input se consume",
		f.inputItem === null,
		JSON.stringify(f.inputItem)
	);
}

// 21) furnaceSnapshot expone los campos correctos
{
	const f = freshFurnace({
		inputItem: { id: 107, count: 3 },
		fuelItem: { id: 4, count: 1 },
		progress: 50,
		requiredTicks: 200
	});
	const s = crafting.furnaceSnapshot(f);
	check(
		"snapshot campos",
		s.fuelItem &&
			s.fuelTicksLeft === 0 &&
			s.inputItem === 107 &&
			s.inputCount === 3 &&
			s.progress === 50 &&
			s.requiredTicks === 200 &&
			s.outputItem === null &&
			s.outputCount === 0,
		JSON.stringify(s)
	);
}

// 22) restoreFurnaces: limpia el mapa y restaura las entradas dadas
{
	state.furnaces.clear();
	const fake = {
		fuelItem: { id: 4, count: 1 },
		fuelTicksLeft: 123,
		inputItem: { id: 9, count: 1 },
		progress: 10,
		requiredTicks: 200,
		outputItem: null,
		outputCount: 0
	};
	crafting.restoreFurnaces([["0,1,0", fake]]);
	check(
		"restoreFurnaces carga entradas",
		state.furnaces.size === 1 && state.furnaces.get("0,1,0") === fake
	);
	const got = crafting.getOrCreateFurnace("0,1,0");
	check("restoreFurnaces no duplica", got === fake);
}
state.furnaces.clear();
crafting.tickFurnaces();
check("tickFurnaces mapa vacio", true);
process.exit(fails === 0 ? 0 : 1);
