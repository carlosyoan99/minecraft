"use strict";

// ============================================================
// ITEMSTACK (Fase 13, C3): { id, count, durability } como clase
// Un slot de inventario/cofre/drop: el ítem (id), cuántos hay (count) y la
// durabilidad restante (solo herramientas/armadura/arco la llevan). Antes
// eran literales { id, count, durability } repartidos por todo el servidor;
// ahora son instancias de esta clase con los mismos campos planos.
//
// CLAVE DE COMPATIBILIDAD: JSON.stringify de una instancia produce el MISMO
// objeto que antes ({ id, count } o { id, count, durability }), porque solo
// serializa las propiedades propias enumerables. El wire (cliente) y el
// guardado (world.json/chunks) no distinguen clase de literal: ningún test
// ni formato cambia.
// ============================================================
class ItemStack {
	constructor(id, count = 1, durability) {
		this.id = id;
		this.count = count;
		// La durabilidad es opcional: solo herramientas/armadura/arco la
		// llevan; los stacks apilables no (undefined se omite al serializar,
		// como los literales anteriores).
		if (durability !== undefined && durability !== null)
			this.durability = durability;
	}

	// Normaliza un slot cualquiera (null | literal | ItemStack) a ItemStack
	// o null. Sirve para migrar datos del disco/red a la clase sin romper
	// los que ya eran instancias.
	static from(slot) {
		if (!slot) return null;
		if (slot instanceof ItemStack) return slot;
		return new ItemStack(slot.id, slot.count, slot.durability);
	}

	// Crea un array de `n` slots vacíos (null), patrón del inventario/cofres.
	static slots(n) {
		return new Array(n).fill(null);
	}

	add(n = 1) {
		this.count += n;
		return this;
	}

	consume(n = 1) {
		this.count -= n;
		return this;
	}

	// ¿Se agotó el stack (count ≤ 0)? El llamador lo retira del slot.
	get empty() {
		return this.count <= 0;
	}

	// Copia plana para snapshots/wire: el shape histórico { id, count,
	// durability } para que los consumidores (chestSnapshot, init, ...)
	// sigan serializando igual.
	toPlain() {
		const o = { id: this.id, count: this.count };
		if (this.durability !== undefined) o.durability = this.durability;
		return o;
	}
}

module.exports = { ItemStack };
