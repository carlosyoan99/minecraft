// ============================================================
// JUGADORES REMOTOS Y MOBS (meshes en la escena)
// Fase 8 (B9): los mobs son GRUPOS de partes (cabeza, cuerpo,
// extremidades) según el esquema MOB_PARTS de mobtextures.js — cada
// parte es un BoxGeometry con los UVs remapeados hacia su tesela del
// atlas de una fila. Un SOLO material por mob (el atlas completo,
// base 0xffffff): la quema solar y el flash de daño tiñen el grupo
// entero. El grupo raíz conserva userData.mobId/mobType para el
// raycast de combate (input.js intersecta los hijos y sube al raíz).
// ============================================================
import * as THREE from "three";
import { getMobAtlas, MOB_PARTS, mobPartRects } from "./mobtextures.js";
import { scene } from "./scene.js";

const remotePlayers = new Map(); // id -> mesh
export const mobMeshes = new Map(); // id -> mesh (grupo raíz)

// ============================================================
// CONSTRUCCIÓN DE UN GRUPO DE PARTES
// `parts` es el array de MOB_PARTS[type]; `material` es compartido
// por todo el grupo. Con textura se remapean los UV de cada caja a
// su tesela (mobPartRects); sin textura (fallback/jugadores remotos)
// se dejan los UV por defecto y el color del material decide.
// ============================================================
function buildPartGroup(parts, material, rects = null) {
	const group = new THREE.Group();
	for (const part of parts) {
		const [w, h, d] = part.size;
		const geo = new THREE.BoxGeometry(w, h, d);
		if (rects) {
			// BoxGeometry es indexada con 6 grupos (+X, -X, +Y, -Y, +Z, -Z):
			// se remapean TODOS sus vértices a la tesela de la parte (una
			// tesela cubre las 6 caras de la caja — opción mínima del spec).
			const rect = rects[part.tile || part.name];
			if (rect) {
				const [u0, v0, u1, v1] = rect;
				const uv = geo.attributes.uv;
				const index = geo.index;
				const seen = new Set();
				geo.groups.forEach((g) => {
					for (let k = 0; k < g.count; k++) {
						const v = index.getX(g.start + k);
						if (seen.has(v)) continue;
						seen.add(v);
						const ox = uv.getX(v),
							oy = uv.getY(v);
						uv.setXY(v, u0 + (u1 - u0) * ox, v0 + (v1 - v0) * oy);
					}
				});
				uv.needsUpdate = true;
			}
		}
		const mesh = new THREE.Mesh(geo, material);
		mesh.castShadow = true;
		mesh.position.set(part.pos[0], part.pos[1], part.pos[2]);
		if (part.rot) mesh.rotation.set(part.rot[0], part.rot[1], part.rot[2]);
		group.add(mesh);
	}
	return group;
}

// Esqueleto humanoide genérico para jugadores remotos (misma silueta que el
// zombi: cabeza + cuerpo + brazos + piernas) con el color plano del jugador.
const HUMANOID_PARTS = MOB_PARTS.zombie?.parts || [];

// buildPartGroup ya pone castShadow en cada parte; el material es plano.
function makeHumanoid(color) {
	const material = new THREE.MeshLambertMaterial({ color });
	return buildPartGroup(HUMANOID_PARTS, material);
}

// ============================================================
// MESH DE MOB MULTIBLOQUE (Fase 8, B9)
// Grupo de partes según MOB_PARTS[type], texturizadas con su atlas
// de una fila. Un material compartido por mob (base blanco con mapa):
// la quema solar y el flash tiñen el grupo entero multiplicativamente.
// ============================================================
function makeMobMesh(type, fallbackColor = 0x999999) {
	const atlas = getMobAtlas(type);
	const material = atlas
		? new THREE.MeshLambertMaterial({ map: atlas, color: 0xffffff })
		: new THREE.MeshLambertMaterial({ color: fallbackColor }); // tipo sin textura
	const parts = MOB_PARTS[type]?.parts || [
		{ name: "body", size: [0.6, 1.8, 0.6], pos: [0, 0.9, 0] } // fallback: box único
	];
	const rects = atlas ? mobPartRects(type) : null;
	const group = buildPartGroup(parts, material, rects);
	// El material compartido se guarda en el grupo raíz: la quema solar y el
	// flash de daño lo tiñen entero (antes mesh.material del box único).
	group.userData.material = material;
	group.userData.textured = !!atlas;
	return group;
}

// ============================================================
// ETIQUETA DE NOMBRE FLOTANTE (Fase 7)
// Sprite de texto encima de la cabeza del jugador remoto. Se redibuja en un
// canvas y se sube al GPU con needsUpdate cuando el nombre cambia.
// ============================================================
function makeNameTag(name) {
	const c = document.createElement("canvas");
	c.width = 256;
	c.height = 64;
	const g = c.getContext("2d");
	const tex = new THREE.CanvasTexture(c);
	tex.anisotropy = 4;
	const mat = new THREE.SpriteMaterial({
		map: tex,
		transparent: true,
		depthWrite: false
	});
	const tag = new THREE.Sprite(mat);
	const draw = (text) => {
		g.clearRect(0, 0, c.width, c.height);
		g.font = "bold 40px monospace";
		g.textAlign = "center";
		g.textBaseline = "middle";
		g.lineWidth = 7;
		g.strokeStyle = "rgba(0,0,0,0.75)";
		g.strokeText(text, c.width / 2, c.height / 2);
		g.fillStyle = "#ffffff";
		g.fillText(text, c.width / 2, c.height / 2);
		tex.needsUpdate = true;
	};
	draw(name);
	tag.scale.set(2.4, 0.6, 1);
	tag.position.set(0, 2.25, 0); // flotando sobre la cabeza
	return { tag, draw };
}

export function spawnRemotePlayer(id, x, y, z, name = "") {
	const mesh = makeHumanoid(0xdd4444);
	mesh.position.set(x, y, z);
	const nameTag = makeNameTag(name || id.slice(0, 6));
	mesh.add(nameTag.tag);
	mesh.userData.nameTag = nameTag;
	scene.add(mesh);
	remotePlayers.set(id, mesh);
}

export function renameRemotePlayer(id, name) {
	const mesh = remotePlayers.get(id);
	if (mesh?.userData.nameTag && name) mesh.userData.nameTag.draw(name);
}

export function removeRemotePlayer(id) {
	const mesh = remotePlayers.get(id);
	if (mesh) {
		scene.remove(mesh);
		remotePlayers.delete(id);
	}
}

export function updateRemotePlayer(id, x, y, z, yaw) {
	const mesh = remotePlayers.get(id);
	if (mesh) {
		mesh.position.set(x, y, z);
		mesh.rotation.y = yaw;
	}
}

// Escala por tipo (Fase 5): la araña y el conejo son pequeños, el lobo
// es algo más grande que un humanoide. Los bebés se renderizan a media escala.
const MOB_SCALE = {
	spider: 0.7,
	rabbit: 0.55,
	wolf: 1.05
};

export function updateMobs(list) {
	const seen = new Set();
	for (const m of list) {
		seen.add(m.id);
		let mesh = mobMeshes.get(m.id);
		if (!mesh) {
			mesh = makeMobMesh(m.type, m.color);
			mesh.userData.mobId = m.id;
			mesh.userData.mobType = m.type;
			// Con textura, el color del material es multiplicativo (base blanco);
			// la quema solar tiñe a naranja fuego. Sin atlas, el base es el color
			// plano de MOB_COLORS que envía el servidor (fallback).
			mesh.userData.baseColor = mesh.userData.textured ? 0xffffff : m.color;
			scene.add(mesh);
			mobMeshes.set(m.id, mesh);
		}
		mesh.position.set(m.x, m.y, m.z);
		const s = (m.isBaby ? 0.5 : 1) * (MOB_SCALE[m.type] || 1);
		mesh.scale.set(s, s, s);
		// Quema solar (Fase 6): el mob en llamas se tiñe de fuego; al apagarse
		// (noche/techo) vuelve a su color base. El servidor manda `burning` en
		// cada mobs_update.
		const burning = !!m.burning;
		const material = mesh.userData.material;
		if (material && burning !== mesh.userData.burning) {
			mesh.userData.burning = burning;
			material.color.setHex(burning ? 0xff7710 : mesh.userData.baseColor);
		}
		// Fase 9 (Bloque D): creeper en fuse — el servidor manda `fuse: 1`
		// mientras silba antes de explotar; el cliente agranda y aclara el mob
		// para que "se hinche" como en Minecraft (adelanto de la explosión).
		const fusing = !!m.fuse;
		if (fusing && !mesh.userData.fusing) {
			mesh.userData.fusing = true;
			mesh.scale.set(s * 1.25, s * 1.25, s * 1.25);
			if (material) material.color.setHex(0xffffff);
		} else if (!fusing && mesh.userData.fusing) {
			mesh.userData.fusing = false;
			mesh.scale.set(s, s, s);
			if (material) {
				material.color.setHex(
					mesh.userData.burning ? 0xff7710 : mesh.userData.baseColor
				);
			}
		}
	}
	for (const [id, mesh] of mobMeshes) {
		if (!seen.has(id)) {
			scene.remove(mesh);
			mobMeshes.delete(id);
		}
	}
}

export function removeMob(id) {
	const mesh = mobMeshes.get(id);
	if (mesh) {
		scene.remove(mesh);
		mobMeshes.delete(id);
	}
}

// ============================================================
// FLECHAS DEL ESQUELETO (Fase 9, Bloque D)
// Primera entidad proyectil: el servidor hace broadcast de las flechas
// vivas (arrows_update) con posición y velocidad; el cliente mantiene un
// pool de meshes de flecha (cilindro delgado + punta) que coloca según
// las snapshots. No hay física local: el servidor la integra y manda el
// resultado cada tick.
// ============================================================
const arrowMeshes = new Map(); // id -> { mesh, cone }
let arrowGeo = null;
let arrowConeGeo = null;
const arrowMaterial = new THREE.MeshLambertMaterial({ color: 0x8f6b3e });
const arrowTipMaterial = new THREE.MeshLambertMaterial({ color: 0xd8d8d8 });
const ARROW_LIFE_MS = 4000; // los meshes huérfanos se limpian a los 4s
const arrowLastSeen = new Map(); // id -> performance.now()

function arrowId(a) {
	return `${a.x.toFixed(2)},${a.y.toFixed(2)},${a.z.toFixed(2)}`;
}

function makeArrowMesh(id) {
	if (!arrowGeo) {
		arrowGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.55, 6);
		arrowConeGeo = new THREE.ConeGeometry(0.06, 0.14, 6);
	}
	const shaft = new THREE.Mesh(arrowGeo, arrowMaterial);
	const tip = new THREE.Mesh(arrowConeGeo, arrowTipMaterial);
	tip.position.y = 0.34;
	const group = new THREE.Group();
	group.add(shaft);
	group.add(tip);
	scene.add(group);
	arrowMeshes.set(id, { shaft, tip, group });
	return group;
}

// Reemplaza el conjunto de flechas vivas por las del broadcast. Las nuevas
// se orientan por su velocidad (apuntando a donde viajan).
export function updateArrows(arrows) {
	const now = performance.now();
	const seen = new Set();
	for (const a of arrows) {
		const id = arrowId(a);
		seen.add(id);
		let mesh = arrowMeshes.get(id);
		if (!mesh) mesh = makeArrowMesh(id);
		mesh.group.position.set(a.x, a.y, a.z);
		// Orientar por velocidad: forward = v, up = Y (normalizar, defensivo).
		const speed = Math.hypot(a.vx, a.vy, a.vz) || 1;
		mesh.group.lookAt(
			a.x + a.vx / speed,
			a.y + a.vy / speed,
			a.z + a.vz / speed
		);
		arrowLastSeen.set(id, now);
	}
	// Limpiar flechas que ya no están en el broadcast (impactaron o expiraron).
	for (const [id, m] of arrowMeshes) {
		if (!seen.has(id) && now - (arrowLastSeen.get(id) || 0) > ARROW_LIFE_MS) {
			scene.remove(m.group);
			arrowMeshes.delete(id);
			arrowLastSeen.delete(id);
		}
	}
}

// ============================================================
// FLASH DE DAÑO (Fase 8, B10): feedback visual al golpear un mob.
// Tiñe el mob de rojo durante ~120ms (mob_hit del servidor) y lo
// restaura a su color base. El material es COMPARTIDO por las partes
// (userData.material del grupo raíz), así que un flash tiñe el mob
// entero. Se guarda el timeout por mob para no pisar el color base
// con flashes consecutivos.
// ============================================================
const hitFlashTimeouts = new Map();
const hitFlashBase = new Map();
const HIT_FLASH_MS = 120;
export function flashMob(id) {
	const mesh = mobMeshes.get(id);
	const material = mesh?.userData.material;
	if (!mesh || !material) return;
	const prev = hitFlashTimeouts.get(id);
	if (prev) clearTimeout(prev);
	// Captura la base solo en el primer golpe de la ráfaga (respeta la quema
	// solar que pueda estar activa en el mob).
	if (!hitFlashBase.has(id)) hitFlashBase.set(id, material.color.getHex());
	material.color.setHex(0xff4444); // rojo de daño
	const base = hitFlashBase.get(id);
	hitFlashTimeouts.set(
		id,
		setTimeout(() => {
			material.color.setHex(base);
			hitFlashTimeouts.delete(id);
			hitFlashBase.delete(id);
		}, HIT_FLASH_MS)
	);
}

// ============================================================
// CORAZONES DE CRÍA (partículas simples que suben flotando)
// ============================================================
let heartTexture = null;
function getHeartTexture() {
	if (heartTexture) return heartTexture;
	const c = document.createElement("canvas");
	c.width = c.height = 16;
	const g = c.getContext("2d");
	g.fillStyle = "#ff4d6d";
	g.beginPath();
	g.arc(5, 6, 3.5, 0, Math.PI * 2);
	g.arc(11, 6, 3.5, 0, Math.PI * 2);
	g.fill();
	g.beginPath();
	g.moveTo(2.5, 7.5);
	g.lineTo(8, 14.5);
	g.lineTo(13.5, 7.5);
	g.closePath();
	g.fill();
	heartTexture = new THREE.CanvasTexture(c);
	return heartTexture;
}

// Ráfaga de corazones que suben flotando y se desvanecen (~1s)
export function spawnHearts(x, y, z) {
	const mat = new THREE.SpriteMaterial({
		map: getHeartTexture(),
		transparent: true,
		depthWrite: false
	});
	const sprites = [];
	for (let i = 0; i < 4; i++) {
		const s = new THREE.Sprite(mat);
		s.position.set(
			x + (Math.random() - 0.5) * 0.8,
			y + 0.6 + i * 0.15,
			z + (Math.random() - 0.5) * 0.8
		);
		s.scale.set(0.35, 0.35, 0.35);
		scene.add(s);
		sprites.push(s);
	}
	const start = performance.now();
	const DURATION = 1000;
	function animate() {
		const k = Math.min(1, (performance.now() - start) / DURATION);
		for (const s of sprites) {
			s.position.y += 0.004;
			s.material.opacity = 1 - k;
		}
		if (k < 1) {
			requestAnimationFrame(animate);
		} else {
			for (const s of sprites) {
				scene.remove(s);
			}
			mat.dispose();
			sprites.length = 0;
		}
	}
	requestAnimationFrame(animate);
}
