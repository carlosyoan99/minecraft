"use strict";
// Test unitario del sistema de crafteo por patrón y hornos (crafting.js).
// Cubre matchRecipe (offsets, materiales, casos negativos) y el ciclo completo
// del horno (combustible, progreso, salida, enfriado, restauración, snapshot).
const crafting = require("../server/crafting.js");
const state = require("../server/state.js");

let fails = 0;
function check(_name, ok, _extra = "") {
	if (!ok) fails++;
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

// 14) isCookable: minerales, arena y comida cruda sí; planks y aire no
check("isCookable(9) mineral -> true", crafting.isCookable(9) === true);
check("isCookable(107) carne cruda -> true", crafting.isCookable(107) === true);
check("isCookable(6) arena -> true", crafting.isCookable(6) === true);
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

// 16) Ciclo completo: mineral de carbón (9) -> carbón (101) en 200 ticks
{
	const f = freshFurnace({
		inputItem: { id: 9, count: 1 },
		fuelItem: { id: 7, count: 1 }
	});
	for (let i = 0; i < 200; i++) crafting.tickFurnaces();
	check(
		"cocinar carbon -> output 101 x1",
		f.outputItem === 101 && f.outputCount === 1,
		`out=${f.outputItem}x${f.outputCount}`
	);
	check("input consumido", f.inputItem === null, JSON.stringify(f.inputItem));
	check("requiredTicks 200", f.requiredTicks === 200, `req=${f.requiredTicks}`);
	check("progress reseteado a 0", f.progress === 0, `progress=${f.progress}`);
}

// 17) Dos unidades: 400 ticks -> 2 de salida (el combustible rinde 400 ticks)
{
	const f = freshFurnace({
		inputItem: { id: 9, count: 2 },
		fuelItem: { id: 7, count: 1 }
	});
	for (let i = 0; i < 400; i++) crafting.tickFurnaces();
	check(
		"2 minerales -> 2 carbon",
		f.outputItem === 101 && f.outputCount === 2,
		`out=${f.outputItem}x${f.outputCount}`
	);
	check("input agotado", f.inputItem === null, JSON.stringify(f.inputItem));
}

// 18) Tiempo por receta: arena (6) -> vidrio (17) tarda 150 ticks
{
	const f = freshFurnace({
		inputItem: { id: 6, count: 1 },
		fuelItem: { id: 7, count: 1 }
	});
	for (let i = 0; i < 150; i++) crafting.tickFurnaces();
	check(
		"arena -> vidrio en 150 ticks",
		f.outputItem === 17 && f.outputCount === 1,
		`out=${f.outputItem}x${f.outputCount}`
	);
	check("requiredTicks 150", f.requiredTicks === 150, `req=${f.requiredTicks}`);
}

// 19) Sin combustible no se cocina y el progreso se enfría (-2 por tick)
{
	const f = freshFurnace({
		inputItem: { id: 9, count: 1 },
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

// 20) Salida ocupada con otro ítem: el resultado se pierde (horno lleno, simplificado)
{
	const f = freshFurnace({
		inputItem: { id: 9, count: 1 },
		fuelItem: { id: 7, count: 1 },
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
