"use strict";

// ============================================================
// SUBCLASES POR ESPECIE (Fase 18, D-2)
// Extraído de mobs.js (C2: herencia por especie — Fase 13). Cada especie es
// una subclase de Mob que solo despacha a su método del prototipo
// (tickSpecies → tickZombie/tickWolf/...) y, en su caso, al hook `onDeath`
// (el slime se divide). Las pasivas usan el genérico tickPassive; el
// ocelote/gato conserva su IA propia.
//
// Se exporta una FÁBRICA (createSpecies) que recibe la clase base Mob y los
// hooks splitSlime/tickBee — que viven en mobs.js — para NO crear el ciclo
// de require mobs→mob-species→mobs: mobs.js define Mob, splitSlime y
// tickBee, y llama a createSpecies(Mob, splitSlime, tickBee) en su cargue.
// También devuelve MOB_CLASSES y createMob (el registro tipo→clase es
// inherente a las especies); mobs.js los re-exporta como fachadas.
// ============================================================

function createSpecies(Mob, splitSlime, tickBee) {
	class Zombie extends Mob {
		constructor(x, y, z) {
			super("zombie", x, y, z);
		}
		tickSpecies(isNight, nearest, dist) {
			this.tickZombie(isNight, nearest, dist);
		}
	}

	class Spider extends Mob {
		constructor(x, y, z) {
			super("spider", x, y, z);
		}
		tickSpecies(isNight, nearest, dist) {
			this.tickSpider(isNight, nearest, dist);
		}
	}

	class Wolf extends Mob {
		constructor(x, y, z) {
			super("wolf", x, y, z);
		}
		tickSpecies(isNight, nearest, dist) {
			this.tickWolf(isNight, nearest, dist);
		}
	}

	class Slime extends Mob {
		constructor(x, y, z) {
			super("slime", x, y, z);
		}
		tickSpecies(isNight, nearest, dist) {
			this.tickSlime(isNight, nearest, dist);
		}
		// Al morir se divide (grande → 2 medianos → 2 pequeños); el hook evita
		// que los llamadores repitan el `if (type === "slime") splitSlime(...)`.
		onDeath() {
			if (this.alive) splitSlime(this);
		}
	}

	class Drowned extends Mob {
		constructor(x, y, z) {
			super("drowned", x, y, z);
		}
		tickSpecies(isNight, nearest, dist) {
			this.tickDrowned(isNight, nearest, dist);
		}
	}

	class Creeper extends Mob {
		constructor(x, y, z) {
			super("creeper", x, y, z);
		}
		tickSpecies(isNight, nearest, dist) {
			this.tickCreeper(isNight, nearest, dist);
		}
	}

	class Skeleton extends Mob {
		constructor(x, y, z) {
			super("skeleton", x, y, z);
		}
		tickSpecies(isNight, nearest, dist) {
			this.tickSkeleton(isNight, nearest, dist);
		}
	}

	class Enderman extends Mob {
		constructor(x, y, z) {
			super("enderman", x, y, z);
		}
		tickSpecies(isNight, nearest, dist) {
			this.tickEnderman(isNight, nearest, dist);
		}
	}

	// Pasivos: el genérico tickPassive (huida/rebaño/sueño) es el común; el
	// ocelote y la abeja conservan su IA propia de la base. El gato domado usa
	// la clase Ocelot con type "cat" (applyTame lo cambia en runtime, como MC).
	class Cow extends Mob {
		constructor(x, y, z) {
			super("cow", x, y, z);
		}
		tickSpecies(isNight, nearest, dist) {
			this.tickPassive(isNight, nearest, dist);
		}
	}

	class Pig extends Mob {
		constructor(x, y, z) {
			super("pig", x, y, z);
		}
		tickSpecies(isNight, nearest, dist) {
			this.tickPassive(isNight, nearest, dist);
		}
	}

	class Chicken extends Mob {
		constructor(x, y, z) {
			super("chicken", x, y, z);
		}
		tickSpecies(isNight, nearest, dist) {
			this.tickPassive(isNight, nearest, dist);
		}
	}

	class Sheep extends Mob {
		constructor(x, y, z) {
			super("sheep", x, y, z);
		}
		tickSpecies(isNight, nearest, dist) {
			this.tickPassive(isNight, nearest, dist);
		}
	}

	class Rabbit extends Mob {
		constructor(x, y, z) {
			super("rabbit", x, y, z);
		}
		tickSpecies(isNight, nearest, dist) {
			this.tickPassive(isNight, nearest, dist);
		}
	}

	class Bee extends Mob {
		constructor(x, y, z) {
			super("bee", x, y, z);
		}
		tickSpecies(isNight, nearest, dist) {
			tickBee(this);
		}
	}

	class Ocelot extends Mob {
		constructor(x, y, z) {
			super("ocelot", x, y, z);
		}
		tickSpecies(isNight, nearest, dist) {
			// Domado → type "cat" (runtime, ver applyTame): el gato usa tickCat.
			if (this.type === "cat") this.tickCat(nearest, dist);
			else this.tickOcelot(nearest, dist);
		}
	}

	// Registro tipo → clase (C2): createMob elige aquí. Los tipos sin clase
	// (p. ej. "cat" solo existe como type runtime de Ocelot) caen en Mob base.
	const MOB_CLASSES = {
		zombie: Zombie,
		spider: Spider,
		wolf: Wolf,
		slime: Slime,
		drowned: Drowned,
		creeper: Creeper,
		skeleton: Skeleton,
		enderman: Enderman,
		cow: Cow,
		pig: Pig,
		chicken: Chicken,
		sheep: Sheep,
		rabbit: Rabbit,
		bee: Bee,
		ocelot: Ocelot
	};

	// Crea un mob de la clase correcta según el tipo (fábrica tipo→clase).
	function createMob(type, x, y, z) {
		const Cls = MOB_CLASSES[type];
		return Cls ? new Cls(x, y, z) : new Mob(type, x, y, z);
	}

	return {
		Zombie,
		Spider,
		Wolf,
		Slime,
		Drowned,
		Creeper,
		Skeleton,
		Enderman,
		Cow,
		Pig,
		Chicken,
		Sheep,
		Rabbit,
		Bee,
		Ocelot,
		MOB_CLASSES,
		createMob
	};
}

module.exports = { createSpecies };
