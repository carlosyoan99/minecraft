// ============================================================
// JUGADORES REMOTOS Y MOBS (meshes en la escena)
// ============================================================
import * as THREE from "three";
import { getMobAtlas, mobFaceRects } from "./mobtextures.js";
import { scene } from "./scene.js";

const remotePlayers = new Map(); // id -> mesh
export const mobMeshes = new Map(); // id -> mesh

function makeHumanoid(color) {
	const mesh = new THREE.Mesh(
		new THREE.BoxGeometry(0.6, 1.8, 0.6),
		new THREE.MeshLambertMaterial({ color })
	);
	mesh.castShadow = true;
	return mesh;
}

// ============================================================
// MESH DE MOB TEXTURIZADO POR CARA (Fase 7)
// En vez del color plano de MOB_COLORS, cada mob usa su atlas 2x2 de
// mobtextures.js (frente/lado/arriba/abajo): se reasignan los UV de cada
// cara del BoxGeometry hacia la tesela correspondiente del atlas.
// BoxGeometry genera 6 grupos en el orden +X, -X, +Y, -Y, +Z, -Z.
// ============================================================
const BOX_FACE_TEX = ["side", "side", "top", "bottom", "front", "side"]; // -Z usa lado

function makeMobMesh(type, fallbackColor = 0x999999) {
	const atlas = getMobAtlas(type);
	const geo = new THREE.BoxGeometry(0.6, 1.8, 0.6);
	const material = atlas
		? new THREE.MeshLambertMaterial({ map: atlas, color: 0xffffff })
		: new THREE.MeshLambertMaterial({ color: fallbackColor }); // tipo sin textura
	if (atlas && geo.groups.length === 6) {
		// BoxGeometry es indexada: cada grupo cubre 6 índices (2 triángulos)
		// que referencian 4 vértices de la cara. Se recogen los vértices únicos
		// del grupo y se remapean sus UV a la tesela de esa cara en el atlas.
		const rects = mobFaceRects();
		const uv = geo.attributes.uv;
		const index = geo.index;
		geo.groups.forEach((group, g) => {
			const rect = rects[BOX_FACE_TEX[g]];
			const [u0, v0, u1, v1] = rect;
			const seen = new Set();
			for (let k = 0; k < group.count; k++) {
				const v = index.getX(group.start + k);
				if (seen.has(v)) continue;
				seen.add(v);
				const ox = uv.getX(v),
					oy = uv.getY(v);
				uv.setXY(v, u0 + (u1 - u0) * ox, v0 + (v1 - v0) * oy);
			}
		});
		uv.needsUpdate = true;
	}
	const mesh = new THREE.Mesh(geo, material);
	mesh.castShadow = true;
	// updateMobs lo usa para el color base (quema solar): con textura el color
	// del material es multiplicativo (base blanco), sin textura el plano.
	mesh.userData.textured = !!atlas;
	return mesh;
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
		if (burning !== mesh.userData.burning) {
			mesh.userData.burning = burning;
			mesh.material.color.setHex(burning ? 0xff7710 : mesh.userData.baseColor);
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
