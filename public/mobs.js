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
import { playArrowHit, playCreeperHiss, playSheepBaa } from "./audio.js";
import { getMobAtlas, MOB_PARTS, mobPartRects } from "./mobtextures.js";
import { scene } from "./scene.js";
import { isValidSkin } from "./skins.js";
import { getSkinAtlas } from "./skintextures.js"; // skins de jugador

const remotePlayers = new Map(); // id -> mesh
export const mobMeshes = new Map(); // id -> mesh (grupo raíz)

// Auditoría 2026-08-09 (§3.5): libera un mesh y sus recursos GPU de forma
// robusta. Recorre el grupo, dispose de cada geometría y del material por
// parte; luego dispose del material compartido (mobs: userData.material;
// nametag: SpriteMaterial + CanvasTexture). Las flechas NO pasan por aquí:
// reutilizan geometrías y materiales compartidos del pool (arrowGeo/cone,
// arrowMaterial), así que solo se desvinculan de la escena.
function disposeMesh(mesh) {
	mesh.traverse((o) => {
		if (o.geometry) {
			// La geometría de las PARTES es exclusiva del mob (buildPartGroup
			// crea una por mob); la del nametag también.
			o.geometry.dispose();
		}
		if (o.material && !o.userData?.sharedMaterial) o.material.dispose();
	});
	const shared = mesh.userData?.material;
	if (shared && shared.dispose) shared.dispose();
	const nt = mesh.userData?.nameTag;
	if (nt?.tag?.material) {
		if (nt.tag.material.map?.dispose) nt.tag.material.map.dispose();
		nt.tag.material.dispose();
	}
}

// Fase 17: libera el CanvasTexture del atlas de skin del humanoide (el
// `map` del material compartido). disposeMesh NO toca material.map a
// propósito (los atlas de mobs pueden estar cacheados/compartidos); el de
// skin se crea NUEVO por humanoide en getSkinAtlas, así que se dispone
// aquí, en los caminos exclusivos de jugador (removeRemotePlayer y
// updateRemotePlayerSkin). Sin esto, cada cambio de skin en vivo y cada
// desconexión de un jugador remoto filtraba la textura en GPU.
function disposeSkinAtlas(mesh) {
	const shared = mesh.userData?.material;
	if (shared?.map?.dispose) shared.map.dispose();
}

// ============================================================
// CONSTRUCCIÓN DE UN GRUPO DE PARTES
// `parts` es el array de MOB_PARTS[type]; `material` es compartido
// por todo el grupo. Con textura se remapean los UV de cada caja a
// su tesela (mobPartRects); sin textura (fallback/jugadores remotos)
// se dejan los UV por defecto y el color del material decide.
// ============================================================
function buildPartGroup(parts, material, rects = null) {
	const group = new THREE.Group();
	// Fase 10 (nota del usuario "mobs en caja"): lista de extremidades
	// animables (patas y brazos) con su índice par/impar — se balancean al
	// caminar en updateMobs para que los mobs no parezcan cajas estáticas.
	const limbs = [];
	for (let i = 0; i < parts.length; i++) {
		const part = parts[i];
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
		// Las extremidades conservan su pivote en la cadera/hombro (no se
		// mueve el pivote): al girar en X alrededor de su propio centro el
		// efecto visual de "paso" se logra con ángulos pequeños (ver
		// setMobWalk). El índice sirve para alternar izquierda/derecha.
		if (part.name === "leg" || part.name === "arm") {
			mesh.userData.limbIndex = limbs.length;
			// Rotación base de la parte (p. ej. patas de la araña con ángulo en
			// X): el balanceo SUMA a esa pose, nunca la pisa (bug de Fase 10
			// detectado en revisión — al pararse la araña "enderezaba" las patas).
			mesh.userData.baseRotX = part.rot?.[0] || 0;
			limbs.push(mesh);
		}
		group.add(mesh);
	}
	if (limbs.length > 0) group.userData.limbs = limbs;
	return group;
}

// Esqueleto humanoide genérico para jugadores remotos (misma silueta que el
// zombi: cabeza + cuerpo + brazos + piernas). Con skin se texturiza con el
// atlas procedural de public/skintextures.js (cada parte a su tesela); sin
// skin válida cae al color plano histórico (defensivo).
const HUMANOID_PARTS = MOB_PARTS.zombie?.parts || [];

// Exportado para la vista previa 3D del menú (skinpreview.js) y para los
// jugadores remotos. Construye el humanoide SIN añadirlo a la escena.
export function makeHumanoid(skinId) {
	if (isValidSkin(skinId)) {
		const { texture, rects } = getSkinAtlas(skinId);
		const material = new THREE.MeshLambertMaterial({
			map: texture,
			color: 0xffffff
		});
		const group = buildPartGroup(HUMANOID_PARTS, material, rects);
		group.userData.material = material;
		group.userData.skin = skinId;
		return group;
	}
	const material = new THREE.MeshLambertMaterial({ color: 0xdd4444 });
	const group = buildPartGroup(HUMANOID_PARTS, material);
	group.userData.material = material;
	group.userData.skin = "steve";
	return group;
}

// ============================================================
// MESH DE MOB MULTIBLOQUE (Fase 8, B9)
// Grupo de partes según MOB_PARTS[type], texturizadas con su atlas
// de una fila. Un material compartido por mob (base blanco con mapa):
// la quema solar y el flash tiñen el grupo entero multiplicativamente.
// ============================================================
// ============================================================
// ORBE DE XP (Fase 18, C-8): esferita verde brillante estilo MC, con un
// halo. El tamaño escala con la XP del snapshot (más XP = orbe más grande).
// ============================================================
function makeXpOrbMesh() {
	const group = new THREE.Group();
	const core = new THREE.Mesh(
		new THREE.SphereGeometry(0.22, 12, 10),
		new THREE.MeshBasicMaterial({ color: 0x7cf67c }) // verde brillante
	);
	core.position.y = 0.22; // levitar sobre el suelo (como en MC)
	const glow = new THREE.Mesh(
		new THREE.SphereGeometry(0.34, 12, 10),
		new THREE.MeshBasicMaterial({
			color: 0xb6f7b6,
			transparent: true,
			opacity: 0.35,
			depthWrite: false
		})
	);
	glow.position.y = 0.22;
	group.add(glow);
	group.add(core);
	// Material compartido para el flash de daño (no aplica, pero el código
	// de quema lo consulta) — se usa el del core.
	group.userData.material = core.material;
	group.userData.textured = false;
	return group;
}

function makeMobMesh(type, fallbackColor = 0x999999) {
	// Fase 18 (C-8): los orbes de XP son entidades con render propio (no
	// usan MOB_PARTS ni atlas de mobs).
	if (type === "xp_orb") return makeXpOrbMesh();
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

export function spawnRemotePlayer(id, x, y, z, name = "", skin) {
	const mesh = makeHumanoid(skin);
	mesh.position.set(x, y, z);
	const nameTag = makeNameTag(name || id.slice(0, 6));
	mesh.add(nameTag.tag);
	mesh.userData.nameTag = nameTag;
	mesh.userData.playerName = name;
	scene.add(mesh);
	remotePlayers.set(id, mesh);
}

// Cambio de skin en vivo (broadcast player_skin del servidor): reconstruye el
// humanoide con el atlas nuevo conservando posición, yaw y nametag. Si el
// jugador aún no está en escena (llegó antes que el player_join) no hay nada
// que actualizar: el init/player_join trae la skin ya actualizada.
export function updateRemotePlayerSkin(id, skin) {
	const mesh = remotePlayers.get(id);
	if (!mesh || !isValidSkin(skin) || skin === mesh.userData.skin) return;
	const x = mesh.position.x,
		y = mesh.position.y,
		z = mesh.position.z;
	const yaw = mesh.rotation.y;
	const name = mesh.userData.playerName || "";
	disposeSkinAtlas(mesh); // Fase 17: atlas de skin anterior (material.map)
	disposeMesh(mesh);
	scene.remove(mesh);
	const fresh = makeHumanoid(skin);
	fresh.position.set(x, y, z);
	fresh.rotation.y = yaw;
	const nameTag = makeNameTag(name);
	fresh.add(nameTag.tag);
	fresh.userData.nameTag = nameTag;
	fresh.userData.playerName = name;
	scene.add(fresh);
	remotePlayers.set(id, fresh);
}

export function renameRemotePlayer(id, name) {
	const mesh = remotePlayers.get(id);
	if (mesh?.userData.nameTag && name) mesh.userData.nameTag.draw(name);
}

export function removeRemotePlayer(id) {
	const mesh = remotePlayers.get(id);
	if (mesh) {
		// Auditoría 2026-08-09 (§3.5): liberar geometrías/materiales/texturas.
		// Antes solo se quitaba de la escena: los buffers GPU de las cajas del
		// humanoid, del Lambert y del CanvasTexture del nametag quedaban
		// retenidos hasta que el GC los recogiera.
		disposeSkinAtlas(mesh); // Fase 17: atlas de skin (material.map)
		disposeMesh(mesh);
		scene.remove(mesh);
		remotePlayers.delete(id);
	}
}

export function updateRemotePlayer(id, x, y, z, yaw) {
	const mesh = remotePlayers.get(id);
	if (mesh) {
		// Fase 10: los jugadores remotos también mueven las piernas al caminar.
		const last = mesh.userData.lastPos;
		const dx = last ? x - last.x : 0;
		const dz = last ? z - last.z : 0;
		if (Math.hypot(dx, dz) > 0.001) setMobWalk(mesh, dx, dz);
		else resetMobWalk(mesh);
		mesh.userData.lastPos = { x, y, z };
		mesh.position.set(x, y, z);
		mesh.rotation.y = yaw;
	}
}

// Escala por tipo (Fase 5): la araña y el conejo son pequeños, el lobo
// es algo más grande que un humanoide. Los bebés se renderizan a media escala.
// Fase 12 (Bloque A): slime escala por TAMAÑO (2/1/0 → 2.0/1.0/0.5, la
// multiplica updateMobs con el slimeSize del snapshot); ocelote/gato son
// pequeños (0.6); el ahogado usa la escala humana por defecto.
const MOB_SCALE = {
	spider: 0.7,
	rabbit: 0.55,
	wolf: 1.05,
	ocelot: 0.6,
	cat: 0.6,
	slime: 1.0
};
// Escala del slime según su tamaño (snapshot.slimeSize): grande 2, mediano
// 1, pequeño 0.5 — como en Minecraft.
function slimeScale(size) {
	if (size === 2) return 2.0;
	if (size === 1) return 1.0;
	return 0.5;
}

// Fase 10 (nota "mobs en caja"): balanceo de extremidades al caminar.
// Avanza una fase por la distancia recorrida (setMobWalk) y convierte esa
// fase en rotaciones alternadas de patas/brazos (seno). Se llama desde
// updateMobs y updateRemotePlayer.
const WALK_STRIDE = 2.2; // distancia (bloques) por ciclo completo de paso
const WALK_SWING = 0.5; // amplitud del balanceo en radianes
function setMobWalk(mesh, dx, dz) {
	const limbs = mesh.userData?.limbs;
	if (!limbs || limbs.length === 0) return;
	// Fase acumulada por distancia: caminar despacio mueve las patas despacio.
	mesh.userData.walkPhase =
		(mesh.userData.walkPhase || 0) + Math.hypot(dx, dz) / WALK_STRIDE;
	const ph = mesh.userData.walkPhase;
	for (const limb of limbs) {
		// Alternar: pares a un lado, impares al otro (contrafase entre patas
		// contiguas). El balanceo SUMA a la rotación base de la parte
		// (baseRotX — las patas de la araña ya vienen con ángulo propio).
		const side = limb.userData.limbIndex % 2 === 0 ? 1 : -1;
		limb.rotation.x =
			(limb.userData.baseRotX || 0) +
			Math.sin(ph * Math.PI * 2 + side) * WALK_SWING * side;
	}
}

// Restablece el balanceo (mob quieto): vuelve las extremidades a su pose base
// (no a 0 — respeta la rotación original de la parte, p. ej. la araña).
function resetMobWalk(mesh) {
	const limbs = mesh.userData?.limbs;
	if (!limbs) return;
	for (const limb of limbs) limb.rotation.x = limb.userData.baseRotX || 0;
}

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
		// Fase 10 ("mobs en caja"): balancear las patas si el mob se movió
		// respecto a la snapshot anterior (el servidor manda posición por tick).
		const sitting = !!m.sitting;
		const last = mesh.userData.lastPos;
		if (sitting) {
			// Auditoría CL-2 (mascotas sentadas): un mob sentado NO camina — con
			// micro-jitter de posición del servidor setMobWalk activaba el
			// balanceo de un lobo/gato que el servidor tiene "sentado". Siempre
			// pose quieta (patas en su base), nunca la animación de paso.
			resetMobWalk(mesh);
		} else if (last) {
			const dx = m.x - last.x,
				dz = m.z - last.z;
			if (Math.hypot(dx, dz) > 0.001) setMobWalk(mesh, dx, dz);
			else resetMobWalk(mesh);
		} else {
			mesh.userData.walkPhase = 0;
		}
		mesh.userData.lastPos = { x: m.x, y: m.y, z: m.z };
		mesh.position.set(m.x, m.y, m.z);
		// Fase 12 (A): el slime escala por tamaño y el lobo domado lleva el
		// collar rojo (visual de la doma, ver A5 del spec).
		const slimeS = m.type === "slime" ? slimeScale(m.slimeSize) : 1;
		// Auditoría CL-2: la mascota sentada se agazapa (menos altura) en vez
		// de renderizarse de pie; el servidor manda `sitting` en el snapshot.
		const sitY = sitting ? 0.72 : 1;
		// Fase 18 (C-8): el orbe de XP escala con la cantidad (más XP → más
		// grande, como en Minecraft); no se aplican ni bebé ni MOB_SCALE.
		let s = (m.isBaby ? 0.5 : 1) * (MOB_SCALE[m.type] || 1) * slimeS;
		if (m.type === "xp_orb") {
			// 1..2 según XP: poca XP (1) → base, mucha (100+) → doble tamaño.
			const orbScale = 1 + Math.min(1, (m.xp || 1) / 100);
			s = orbScale;
		}
		mesh.scale.set(s, s * sitY, s);
		if (m.type === "wolf" && m.ownerId && !mesh.userData.collar) {
			mesh.userData.collar = true;
			// Collar rojo: caja fina alrededor del cuello del lobo.
			const collar = new THREE.Mesh(
				new THREE.BoxGeometry(0.42, 0.12, 0.42),
				new THREE.MeshLambertMaterial({ color: 0xd43d2a })
			);
			collar.position.set(0, 0.82, 0.5);
			mesh.add(collar);
		}
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
		// Fase 11 (C4): al EMPEZAR el fuse suena el siseo de mecha.
		const fusing = !!m.fuse;
		if (fusing && !mesh.userData.fusing) {
			mesh.userData.fusing = true;
			mesh.scale.set(s * 1.25, s * 1.25 * sitY, s * 1.25);
			if (material) material.color.setHex(0xffffff);
			if (m.type === "creeper") playCreeperHiss();
		} else if (!fusing && mesh.userData.fusing) {
			mesh.userData.fusing = false;
			mesh.scale.set(s, s * sitY, s);
			if (material) {
				material.color.setHex(
					mesh.userData.burning ? 0xff7710 : mesh.userData.baseColor
				);
			}
		}
		// Fase 11 (C4): balido ambiental de las ovejas — raro, con probabilidad
		// por snapshot (los mobs_update llegan varias veces por segundo; un
		// 0.002 da ~1 balido cada ~30-60s por oveja visible).
		if (m.type === "sheep" && Math.random() < 0.002) playSheepBaa();
	}
	for (const [id, mesh] of mobMeshes) {
		if (!seen.has(id)) {
			// Auditoría 2026-08-09 (§3.5): liberar geometrías/material del mob
			// que desaparece (antes quedarían retenidos hasta el GC).
			disposeMesh(mesh);
			scene.remove(mesh);
			mobMeshes.delete(id);
		}
	}
}

export function removeMob(id) {
	const mesh = mobMeshes.get(id);
	if (mesh) {
		// Auditoría 2026-08-09 (§3.5): liberar recursos del mob eliminado.
		disposeMesh(mesh);
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
// Fase 12 (A4): material del tridente — acero azulado con punta clara.
const tridentMaterial = new THREE.MeshLambertMaterial({ color: 0x6fa8dc });
const ARROW_LIFE_MS = 4000; // los meshes huérfanos se limpian a los 4s
const arrowLastSeen = new Map(); // id -> performance.now()

function arrowId(a) {
	return `${a.x.toFixed(2)},${a.y.toFixed(2)},${a.z.toFixed(2)}`;
}

// Fase 12 (A4): el tridente se dibuja como lanza — astil largo + punta de 3
// púas (tres conos pequeños) + guarda. Misma física que la flecha, otra forma.
function makeTridentMesh(id) {
	const group = new THREE.Group();
	const shaft = new THREE.Mesh(
		new THREE.CylinderGeometry(0.035, 0.045, 0.8, 6),
		tridentMaterial
	);
	shaft.position.y = 0;
	group.add(shaft);
	const prongGeo = new THREE.ConeGeometry(0.05, 0.16, 5);
	for (const dx of [-0.09, 0, 0.09]) {
		const prong = new THREE.Mesh(prongGeo, tridentMaterial);
		prong.position.set(dx, 0.47, 0);
		group.add(prong);
	}
	// Guarda (barra transversal) y contrapeso.
	const guard = new THREE.Mesh(
		new THREE.BoxGeometry(0.22, 0.05, 0.05),
		tridentMaterial
	);
	guard.position.y = 0.3;
	group.add(guard);
	scene.add(group);
	arrowMeshes.set(id, { shaft, tip: null, group, trident: true });
	return group;
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
		// Fase 12 (A4): kind distingue tridente de flecha — si el proyectil
		// cambia de tipo (no debería), se reconstruye con la forma correcta.
		const isTrident = a.kind === "trident";
		if (mesh && isTrident !== !!mesh.trident) {
			scene.remove(mesh.group);
			arrowMeshes.delete(id);
			mesh = null;
		}
		if (!mesh) mesh = isTrident ? makeTridentMesh(id) : makeArrowMesh(id);
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
	// Fase 18 (C-9): al desaparecer (impacto o fin de vida) suena el thock —
	// la flecha se clava, paridad §2.2 (antes el impacto era silencioso).
	for (const [id, m] of arrowMeshes) {
		if (!seen.has(id) && now - (arrowLastSeen.get(id) || 0) > ARROW_LIFE_MS) {
			scene.remove(m.group);
			arrowMeshes.delete(id);
			arrowLastSeen.delete(id);
			playArrowHit();
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
