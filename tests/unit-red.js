'use strict';
// ============================================================
// TESTS UNITARIOS DE LOS HANDLERS DE RED (Fase 0)
// Ejercita handleConnection de net.js con un ws fake (sin levantar
// el servidor): init, move (anti-cheat y chunks), block_action
// (break/place con restricciones), craft, grid_set/grid_clear,
// furnace_open/furnace_action, inventory_select, eat (rechazo por
// 'full'), feed_mob, chat y attack_mob (daño espada, wear, drops, XP).
// ============================================================
const net = require('../net.js');
const state = require('../state.js');
const world = require('../world.js');
const crafting = require('../crafting.js');
const mobs = require('../mobs.js');
const mining = require('../mining.js');
const playerHelpers = require('../players.js');
const { B, I } = require('../constants.js');

// Forzar generación fresca (sin leer el world/ real del proyecto).
world.setDiskLoader(() => null);
crafting.loadRecipes();

let fails = 0;
const check = (name, ok, extra = '') => {
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? ' — ' + extra : ''}`);
};

// --- ws fake: captura mensajes salientes y permite inyectar entrantes ---
class FakeWS {
  constructor() {
    this.sent = [];
    this.handlers = {};
    this.readyState = 1; // WebSocket.OPEN
  }
  send(str) { this.sent.push(JSON.parse(str)); }
  on(ev, fn) { this.handlers[ev] = fn; }
  emit(ev, data) { if (this.handlers[ev]) this.handlers[ev](data); }
  events(name) { return this.sent.filter((m) => m.event === name); }
}

function connect() {
  const ws = new FakeWS();
  state.players.clear();
  net.handleConnection(ws);
  const init = ws.events('init')[0];
  const player = state.players.get(init.data.playerId);
  return { ws, init, player };
}

// ============================================================
// INIT
// ============================================================
{
  const { ws, init, player } = connect();
  check('init: playerId y spawn presentes', typeof init.data.playerId === 'string' &&
    typeof init.data.spawnX === 'number' && typeof init.data.spawnY === 'number' && typeof init.data.spawnZ === 'number');
  check('init: dayTime (reloj del ciclo día/noche)', typeof init.data.dayTime === 'number');
  check('init: inventario de 36 slots', Array.isArray(init.data.inventory) && init.data.inventory.length === 36);
  check('init: salud, comida y saturación a 20', init.data.health === 20 && init.data.food === 20 && init.data.saturation === 20);
  check('init: XP/nivel (Fase 5)', init.data.xp === 0 && init.data.level === 0);
  check('init: mobs snapshot array', Array.isArray(init.data.mobs));
  check('init: chunkData presente', init.data.chunkData && Object.keys(init.data.chunkData).length > 0,
    Object.keys(init.data.chunkData || {}).length + ' chunks');
  check('el jugador queda registrado en state', !!player);
  check('broadcast player_join no llega a sí mismo', ws.events('player_join').length === 0);
  global.__PLAYER = player;
  global.__WS = ws;
}

// ============================================================
// MOVE (anti-cheat)
// ============================================================
{
  const p = global.__PLAYER;
  const ws = global.__WS;
  // Move válido: distancia < 1.2 y sin bloques sólidos
  ws.sent.length = 0;
  const before = { x: p.x, y: p.y, z: p.z };
  ws.emit('message', JSON.stringify({ event: 'move', data: { x: before.x + 0.5, y: before.y, z: before.z, yaw: 10, pitch: 0 } }));
  check('move válido actualiza la posición', p.x === before.x + 0.5, `x=${p.x}`);
  check('move válido no devuelve teleport', ws.events('teleport').length === 0);
  check('move marca lastMoveTime (el hambre decae más rápido moviéndose)', p.lastMoveTime > 0);

  // Move inválido: salto > 1.2 → teleport de vuelta
  ws.sent.length = 0;
  const bx = p.x;
  ws.emit('message', JSON.stringify({ event: 'move', data: { x: bx + 10, y: p.y, z: p.z } }));
  check('move demasiado rápido → teleport', ws.events('teleport').length === 1, ws.events('teleport').length + '');
  check('la posición NO se corrompe (vuelve a la autoritativa)', p.x === bx);

  // Move dentro de un sólido → teleport (paso corto de 0.5 para no disparar
  // el anti-cheat de velocidad: debe caer en la rama de bloque sólido)
  const sx = Math.floor(p.x + 0.5), sy = Math.floor(p.y), sz = Math.floor(p.z);
  world.setBlock(sx, sy, sz, B.STONE);
  ws.sent.length = 0;
  ws.emit('message', JSON.stringify({ event: 'move', data: { x: p.x + 0.5, y: p.y, z: p.z } }));
  check('move dentro de un sólido → teleport', ws.events('teleport').length === 1);
  world.setBlock(sx, sy, sz, B.AIR);
}

// ============================================================
// BLOCK_ACTION: BREAK (Fase 6: sesión de minería con progreso)
// El break ya no rompe al instante: inicia una sesión que avanza en el
// bucle principal (aquí se conduce con mining.tickMining, como hace net).
// ============================================================
{
  const p = global.__PLAYER;
  const ws = global.__WS;
  const sendToClient = (pl, event, data) => pl.ws.send(JSON.stringify({ event, data }));
  const bx = Math.floor(p.x + 1), by = Math.floor(p.y), bz = Math.floor(p.z);

  // 1) Minar piedra con un pico de piedra hasta romperla
  world.setBlock(bx, by, bz, B.STONE);
  p.inventory[0] = { id: I.STONE_PICKAXE, count: 1, durability: 132 };
  p.selectedSlot = 0;
  ws.sent.length = 0;
  ws.emit('message', JSON.stringify({ event: 'block_action', data: { action: 'break', x: bx, y: by, z: bz } }));
  check('break inicia una sesión de minería (no rompe al instante)', !!p.mining && world.getBlock(bx, by, bz) === B.STONE);
  let result = null;
  for (let i = 0; i < 200 && !result; i++) result = mining.tickMining(p, 50, world, playerHelpers, sendToClient);
  check('al completar la mina el bloque se rompe (AIR)', world.getBlock(bx, by, bz) === B.AIR);
  check('drop de adoquín al inventario', p.inventory.some((s) => s && s.id === B.COBBLESTONE));
  check('el pico se desgasta (-1)', p.inventory[0].durability === 131, 'dur=' + p.inventory[0].durability);
  check('inventory_update enviado', ws.events('inventory_update').length >= 1);
  check('block_break_progress enviado durante la mina (grietas)', ws.events('block_break_progress').length >= 1);

  // 2) break_cancel detiene la sesión (stage -1, bloque intacto)
  const cx = bx, cy = by + 1, cz = bz;
  world.setBlock(cx, cy, cz, B.STONE);
  ws.sent.length = 0;
  ws.emit('message', JSON.stringify({ event: 'block_action', data: { action: 'break', x: cx, y: cy, z: cz } }));
  check('break inicia otra sesión', !!p.mining);
  ws.emit('message', JSON.stringify({ event: 'block_action', data: { action: 'break_cancel' } }));
  check('break_cancel cancela la sesión', p.mining === null);
  check('break_cancel avisa con stage -1', ws.events('block_break_progress').some((m) => m.data.stage === -1));
  check('el bloque cancelado sigue intacto', world.getBlock(cx, cy, cz) === B.STONE);

  // 3) Agua: NOT_MINEABLE → no inicia sesión
  const wx = bx + 1, wy = by, wz = bz;
  world.setBlock(wx, wy, wz, B.WATER);
  ws.sent.length = 0;
  ws.emit('message', JSON.stringify({ event: 'block_action', data: { action: 'break', x: wx, y: wy, z: wz } }));
  check('el agua no inicia sesión (NOT_MINEABLE)', p.mining === null && world.getBlock(wx, wy, wz) === B.WATER);

  // 4) A >7 bloques → ignorado (fuera de alcance, sin sesión)
  const farX = Math.floor(p.x) + 10;
  world.setBlock(farX, by, bz, B.STONE);
  ws.sent.length = 0;
  ws.emit('message', JSON.stringify({ event: 'block_action', data: { action: 'break', x: farX, y: by, z: bz } }));
  check('romper a >7 bloques → ignorado (sin sesión)', p.mining === null && world.getBlock(farX, by, bz) === B.STONE);
}

// ============================================================
// BLOCK_ACTION: BREAK EN CREATIVE (minería instantánea, Fase 6)
// /gamemode creative: romper es inmediato, sin sesión de progreso,
// sin grietas, sin drops y sin desgaste de herramienta.
// ============================================================
{
  const p = global.__PLAYER;
  const ws = global.__WS;
  const sendToClient = (pl, event, data) => pl.ws.send(JSON.stringify({ event, data }));
  const bx = Math.floor(p.x + 1), by = Math.floor(p.y), bz = Math.floor(p.z);

  p.gamemode = 'creative';
  p.inventory[0] = { id: I.DIAMOND_PICKAXE, count: 1, durability: 1562 };
  p.selectedSlot = 0;
  // El jugador ya tiene adoquín del test de break survival anterior: contar
  // antes/después (romper en creative no debe AÑADIR drop, no exigir que no
  // exista ninguno).
  const cobbleBefore = p.inventory.reduce((acc, s) => acc + (s && s.id === B.COBBLESTONE ? s.count : 0), 0);

  // 1) Romper piedra en creative → AIR inmediato, sin sesión ni grietas
  world.setBlock(bx, by, bz, B.STONE);
  ws.sent.length = 0;
  ws.emit('message', JSON.stringify({ event: 'block_action', data: { action: 'break', x: bx, y: by, z: bz } }));
  check('creative: rompe al instante (AIR sin esperar ticks)', world.getBlock(bx, by, bz) === B.AIR);
  check('creative: no crea sesión de minería', p.mining === null);
  check('creative: no envía block_break_progress (sin grietas)', ws.events('block_break_progress').length === 0);
  check('creative: la herramienta NO se desgasta (durabilidad plena)',
    p.inventory[0].durability === 1562, 'dur=' + p.inventory[0].durability);
  const cobbleAfter = p.inventory.reduce((acc, s) => acc + (s && s.id === B.COBBLESTONE ? s.count : 0), 0);
  check('creative: sin drop de adoquín (no añade al inventario)', cobbleAfter === cobbleBefore,
    `${cobbleBefore} → ${cobbleAfter}`);

  // 2) Un mineral también se rompe al instante y sin drop ni XP
  world.setBlock(bx, by + 1, bz, B.DIAMOND_ORE);
  p.xp = 0;
  ws.sent.length = 0;
  ws.emit('message', JSON.stringify({ event: 'block_action', data: { action: 'break', x: bx, y: by + 1, z: bz } }));
  check('creative: mineral roto al instante sin drop', world.getBlock(bx, by + 1, bz) === B.AIR &&
    !p.inventory.some((s) => s && s.id === B.DIAMOND_ORE));
  check('creative: sin XP de mineral', p.xp === 0, 'xp=' + p.xp);

  // 3) NOT_MINEABLE sigue protegido (agua) aunque sea creative
  const wx2 = bx + 1, wz2 = bz;
  world.setBlock(wx2, by, wz2, B.WATER);
  ws.sent.length = 0;
  ws.emit('message', JSON.stringify({ event: 'block_action', data: { action: 'break', x: wx2, y: by, z: wz2 } }));
  check('creative: el agua sigue sin poder romperse (NOT_MINEABLE)', world.getBlock(wx2, by, wz2) === B.WATER);

  // 4) Con una sesión activa (simulada), el creative la cancela y rompe al momento
  world.setBlock(bx + 2, by, bz, B.STONE);
  mining.startMining(p, bx + 2, by, bz, B.STONE);
  ws.sent.length = 0;
  ws.emit('message', JSON.stringify({ event: 'block_action', data: { action: 'break', x: bx + 2, y: by, z: bz } }));
  check('creative: cancela la sesión previa (grietas ocultas, stage -1)',
    p.mining === null && ws.events('block_break_progress').some((m) => m.data.stage === -1));
  check('creative: el bloque objetivo se rompió al instante', world.getBlock(bx + 2, by, bz) === B.AIR);

  p.gamemode = 'survival'; // restaurar para el resto de la suite
  p.inventory.fill(null);
}

// ============================================================
// BLOCK_ACTION: PLACE
// ============================================================
{
  const p = global.__PLAYER;
  const ws = global.__WS;
  const px = Math.floor(p.x + 2), py = Math.floor(p.y), pz = Math.floor(p.z);
  world.setBlock(px, py, pz, B.AIR);
  p.inventory[0] = { id: B.DIRT, count: 5 };
  ws.sent.length = 0;
  ws.emit('message', JSON.stringify({ event: 'block_action', data: { action: 'place', x: px, y: py, z: pz, itemId: B.DIRT } }));
  check('colocar tierra → bloque colocado', world.getBlock(px, py, pz) === B.DIRT);
  check('se consume 1 del slot', p.inventory[0].count === 4, 'count=' + p.inventory[0].count);

  // Colocar donde ya hay un bloque → rechazado
  ws.sent.length = 0;
  ws.emit('message', JSON.stringify({ event: 'block_action', data: { action: 'place', x: px, y: py, z: pz, itemId: B.DIRT } }));
  check('colocar sobre bloque ocupado → rechazado', world.getBlock(px, py, pz) === B.DIRT && p.inventory[0].count === 4);
}

// ============================================================
// CRAFT (consumir grid y entregar resultado)
// ============================================================
{
  const p = global.__PLAYER;
  const ws = global.__WS;
  const grid = new Array(9).fill(null);
  grid[4] = { id: B.OAK_LOG, count: 1 }; // un tronco → 4 planks
  ws.sent.length = 0;
  ws.emit('message', JSON.stringify({ event: 'craft', data: { grid } }));
  check('craft tronco → planks al inventario', p.inventory.some((s) => s && s.id === B.PLANKS && s.count >= 4),
    JSON.stringify(p.inventory.filter(Boolean).map((s) => [s.id, s.count])));
  check('crafting_grid_update con success', ws.events('crafting_grid_update').length >= 1 &&
    ws.events('crafting_grid_update').at(-1).data.success === true);
}

// ============================================================
// GRID_SET / GRID_CLEAR (conservan durabilidad por la mesa)
// ============================================================
{
  const p = global.__PLAYER;
  const ws = global.__WS;
  p.inventory[0] = { id: I.WOODEN_PICKAXE, count: 1, durability: 30 };
  ws.emit('message', JSON.stringify({ event: 'grid_set', data: { fromInventorySlot: 0, toGridSlot: 0 } }));
  check('grid_set mueve el item a la celda con su durabilidad',
    p.craftingGrid[0] && p.craftingGrid[0].id === I.WOODEN_PICKAXE && p.craftingGrid[0].durability === 30,
    JSON.stringify(p.craftingGrid[0]));
  check('grid_set vacía el slot del inventario', p.inventory[0] === null);
  ws.emit('message', JSON.stringify({ event: 'grid_clear', data: {} }));
  check('grid_clear devuelve el item con la misma durabilidad (sin repararlo gratis)',
    p.inventory.some((s) => s && s.id === I.WOODEN_PICKAXE && s.durability === 30),
    JSON.stringify(p.inventory.filter(Boolean).map((s) => [s.id, s.durability])));
  p.craftingGrid.fill(null);
}

// ============================================================
// FURNACE_OPEN / FURNACE_ACTION (ciclo completo)
// ============================================================
{
  const p = global.__PLAYER;
  const ws = global.__WS;
  const fx = Math.floor(p.x + 3), fy = Math.floor(p.y), fz = Math.floor(p.z);
  world.setBlock(fx, fy, fz, B.FURNACE);
  ws.emit('message', JSON.stringify({ event: 'furnace_open', data: { x: fx, y: fy, z: fz } }));
  const key = `${fx},${fy},${fz}`;
  check('furnace_open: abre el horno y envía estado', ws.events('furnace_state').length >= 1 && p.openFurnace === key);

  // Añadir combustible (planks) e insumo (mineral de carbón). add_fuel
  // consume UNA unidad (2 → 1), no vacía el slot de golpe.
  p.inventory[0] = { id: B.PLANKS, count: 2 };
  ws.emit('message', JSON.stringify({ event: 'furnace_action', data: { action: 'add_fuel', invSlot: 0 } }));
  const f = crafting.getOrCreateFurnace(key);
  check('add_fuel: fija el combustible y consume una unidad', f.fuelItem === B.PLANKS && p.inventory[0].count === 1,
    'count=' + (p.inventory[0] && p.inventory[0].count));

  p.inventory[0] = { id: B.COAL_ORE, count: 1 };
  ws.emit('message', JSON.stringify({ event: 'furnace_action', data: { action: 'add_input', invSlot: 0 } }));
  check('add_input: fija el insumo', f.inputItem && f.inputItem.id === B.COAL_ORE, JSON.stringify(f.inputItem));
  check('add_input: consume el slot', p.inventory[0] === null);

  // Cocinar los 200 ticks necesarios
  for (let i = 0; i < 200; i++) crafting.tickFurnaces();
  check('cocinar 200 ticks → salida de carbón', f.outputItem === I.COAL && f.outputCount === 1, `out=${f.outputItem}x${f.outputCount}`);

  ws.emit('message', JSON.stringify({ event: 'furnace_action', data: { action: 'collect_output', invSlot: 0 } }));
  check('collect_output: entrega el carbón al inventario', p.inventory.some((s) => s && s.id === I.COAL));
  check('collect_output: limpia la salida', f.outputItem === null);

  ws.emit('message', JSON.stringify({ event: 'furnace_action', data: { action: 'close' } }));
  check('close: cierra el horno', p.openFurnace === null);
}

// ============================================================
// INVENTORY_SELECT
// ============================================================
{
  const p = global.__PLAYER;
  const ws = global.__WS;
  ws.emit('message', JSON.stringify({ event: 'inventory_select', data: { slot: 5 } }));
  check('inventory_select cambia el slot seleccionado', p.selectedSlot === 5);
  ws.emit('message', JSON.stringify({ event: 'inventory_select', data: { slot: 99 } }));
  check('inventory_select ignora slots fuera de rango', p.selectedSlot === 5);
}

// ============================================================
// EAT (comer y rechazo por estómago lleno)
// ============================================================
{
  const p = global.__PLAYER;
  const ws = global.__WS;
  p.food = 10;
  p.saturation = 5;
  p.inventory[0] = { id: I.COOKED_BEEF, count: 1 };
  p.selectedSlot = 0;
  ws.sent.length = 0;
  ws.emit('message', JSON.stringify({ event: 'eat', data: {} }));
  check('comer carne cocinada restaura hambre y saturación', p.food === 18 && p.saturation > 5,
    `food=${p.food} sat=${p.saturation}`);
  check('comer consume el item', p.inventory[0] === null || p.inventory[0].count === 0);

  // Estómago lleno → eat_rejected (feedback 'no tienes hambre')
  p.food = 20;
  p.saturation = 20;
  p.inventory[0] = { id: I.COOKED_BEEF, count: 1 };
  ws.sent.length = 0;
  ws.emit('message', JSON.stringify({ event: 'eat', data: {} }));
  check('comer con el estómago lleno → eat_rejected', ws.events('eat_rejected').length === 1);
  check('comer con el estómago lleno NO consume el item', p.inventory[0] && p.inventory[0].count === 1);
}

// ============================================================
// FEED_MOB (alimentar animales)
// ============================================================
{
  const p = global.__PLAYER;
  const ws = global.__WS;
  const cow = new mobs.Mob('cow', Math.floor(p.x) + 1, Math.floor(p.y), Math.floor(p.z));
  state.mobs.push(cow);
  p.inventory[0] = { id: I.WHEAT, count: 3 };
  p.selectedSlot = 0;
  ws.emit('message', JSON.stringify({ event: 'feed_mob', data: { mobId: cow.id } }));
  check('feed_mob: consume el trigo', p.inventory[0].count === 2, 'count=' + p.inventory[0].count);
  check('feed_mob: el animal entra en modo amor', cow.loveUntil > 0, 'love=' + cow.loveUntil);

  // Comida equivocada → rechazado (no consume)
  p.inventory[0] = { id: I.CARROT, count: 1 };
  ws.emit('message', JSON.stringify({ event: 'feed_mob', data: { mobId: cow.id } }));
  check('feed_mob: comida equivocada no se consume', p.inventory[0].count === 1);

  // Mob inexistente / fuera de rango → rechazado
  p.inventory[0] = { id: I.WHEAT, count: 1 };
  ws.emit('message', JSON.stringify({ event: 'feed_mob', data: { mobId: 'no-existe' } }));
  check('feed_mob: mob inexistente no consume', p.inventory[0].count === 1);
  state.mobs = state.mobs.filter((m) => m !== cow);
}

// ============================================================
// CHAT (broadcast)
// ============================================================
{
  const ws = global.__WS;
  ws.sent.length = 0;
  ws.emit('message', JSON.stringify({ event: 'chat', data: { message: 'hola mundo' } }));
  check('chat: reenvía el mensaje a los clientes', ws.events('chat').some((m) => m.data.message === 'hola mundo'));
}

// ============================================================
// CHAT: COMANDO /reload (Fase 6: hot-reload de recetas + atlas)
// ============================================================
{
  const ws = global.__WS;
  ws.sent.length = 0;
  ws.emit('message', JSON.stringify({ event: 'chat', data: { message: '/reload' } }));
  const systemChats = ws.events('chat').filter((m) => m.data.id === 'Server' && typeof m.data.message === 'string');
  // Acepta la respuesta de éxito O el rechazo controlado: solo falla si el
  // servidor no responde nada de sistema al /reload (el repo mantiene
  // recetas.json válido, así que lo normal es el éxito).
  const reloadReply = systemChats.find((m) => m.data.message.includes('Recetas'));
  check('/reload responde recargando (o rechazando) recetas', !!reloadReply,
    reloadReply ? reloadReply.data.message : 'sin respuesta de sistema');
  check('/reload pide a los clientes regenerar el atlas (textures_reload)',
    ws.events('textures_reload').length >= 1, ws.events('textures_reload').length + '');
}

// ============================================================
// ATTACK_MOB (daño de espada, wear, drops y XP)
// ============================================================
{
  const p = global.__PLAYER;
  const ws = global.__WS;
  const zombie = new mobs.Mob('zombie', Math.floor(p.x) + 1, Math.floor(p.y), Math.floor(p.z));
  state.mobs.push(zombie);
  p.inventory[0] = { id: I.IRON_SWORD, count: 1, durability: 251 };
  p.selectedSlot = 0;
  p.xp = 0;
  ws.sent.length = 0;
  ws.emit('message', JSON.stringify({ event: 'attack_mob', data: { mobId: zombie.id } }));
  check('attack_mob: espada de hierro hace 5 de daño', zombie.health === 15, 'health=' + zombie.health);
  check('attack_mob: la espada se desgasta (-1)', p.inventory[0].durability === 250, 'dur=' + p.inventory[0].durability);

  // Matar el mob → drops + XP + mob_death
  zombie.health = 1;
  p.xp = 0;
  ws.sent.length = 0;
  ws.emit('message', JSON.stringify({ event: 'attack_mob', data: { mobId: zombie.id } }));
  check('attack_mob: al matar el mob queda alive=false', zombie.alive === false);
  check('attack_mob: broadcast mob_death', ws.events('mob_death').length === 1);
  check('attack_mob: XP por matar zombie (MOB_XP)', p.xp === 5, 'xp=' + p.xp);

  // Mob fuera de rango (>4) → rechazado
  const lejos = new mobs.Mob('cow', Math.floor(p.x) + 10, Math.floor(p.y), Math.floor(p.z));
  state.mobs.push(lejos);
  p.xp = 0;
  ws.emit('message', JSON.stringify({ event: 'attack_mob', data: { mobId: lejos.id } }));
  check('attack_mob: fuera de alcance no daña', lejos.health === 10 && p.xp === 0);
  state.mobs = state.mobs.filter((m) => m !== zombie && m !== lejos);
}

// ============================================================
// FASE 7: NOMBRE DE JUGADOR (init con nombre, set_name, chat por nombre)
// ============================================================
{
  const p = global.__PLAYER;
  const ws = global.__WS;
  check('init: el jugador trae nombre por defecto "Jugador-XXXX"',
    typeof p.name === 'string' && /^Jugador-[A-Za-z0-9]+$/.test(p.name), 'name=' + p.name);

  // set_name: cambia el nombre y lo propaga a los demás (player_rename)
  ws.sent.length = 0;
  ws.emit('message', JSON.stringify({ event: 'set_name', data: { name: 'Carlos' } }));
  check('set_name: actualiza p.name', p.name === 'Carlos');
  check('set_name: broadcast player_rename', ws.events('player_rename').some((m) => m.data.id === p.id && m.data.name === 'Carlos'));

  // set_name con nombre ilegal (vacío / demasiado largo / solo espacios)
  ws.emit('message', JSON.stringify({ event: 'set_name', data: { name: '   ' } }));
  check('set_name: nombre vacío se ignora', p.name === 'Carlos');
  ws.emit('message', JSON.stringify({ event: 'set_name', data: { name: 'x'.repeat(50) } }));
  check('set_name: nombre recortado a 16 caracteres', p.name === 'x'.repeat(16), 'len=' + p.name.length);

  // Volver a un nombre normal para los checks siguientes
  ws.emit('message', JSON.stringify({ event: 'set_name', data: { name: 'Carlos' } }));

  // chat: el id del emisor es el NOMBRE, no el uuid. Se compara contra p.name
  // (el nombre vigente — el test anterior lo recortó a 16 x's, no 'Carlos').
  ws.sent.length = 0;
  ws.emit('message', JSON.stringify({ event: 'chat', data: { message: 'hola desde el nombre' } }));
  check('chat: el id del remitente es el nombre', ws.events('chat').some((m) => m.data.id === p.name && m.data.message === 'hola desde el nombre'),
    'name=' + p.name);

  // init: otherPlayers incluye el nombre (con otro jugador conectado)
  const ws2 = new FakeWS();
  net.handleConnection(ws2);
  const init2 = ws2.events('init')[0];
  const other = init2.data.otherPlayers.find((q) => q.id === p.id);
  check('init: otherPlayers incluye el nombre del otro jugador', !!other && other.name === p.name,
    JSON.stringify(init2.data.otherPlayers));
  ws2.emit('message', JSON.stringify({ event: 'set_name', data: { name: 'Ana' } }));
  check('player_join incluye el nombre del nuevo jugador',
    ws.events('player_join').some((m) => m.data.id === init2.data.playerId && typeof m.data.name === 'string' && m.data.name !== ''),
    JSON.stringify(ws.events('player_join').map((m) => [m.data.id, m.data.name])));
  state.players.delete(init2.data.playerId);
}

// ============================================================
// FASE 7: AJUSTES (distancia de render) Y MUNDOS (worlds_list)
// ============================================================
{
  const p = global.__PLAYER;
  const ws = global.__WS;
  check('ajustes: renderDistance inicial = VIEW_DISTANCE_CHUNKS (6)', p.renderDistance === 6, 'rd=' + p.renderDistance);

  ws.sent.length = 0;
  ws.emit('message', JSON.stringify({ event: 'settings', data: { renderDistance: 4 } }));
  check('settings: reduce la distancia de render', p.renderDistance === 4);
  check('settings: envía chunks_add con los del radio (el cliente los vuelve a pedir)',
    ws.events('chunks_add').length >= 1, ws.events('chunks_add').length + '');

  ws.emit('message', JSON.stringify({ event: 'settings', data: { renderDistance: 99 } }));
  check('settings: recorta a 10 (máximo)', p.renderDistance === 10, 'rd=' + p.renderDistance);

  ws.emit('message', JSON.stringify({ event: 'settings', data: { renderDistance: 1 } }));
  check('settings: recorta a 2 (mínimo)', p.renderDistance === 2, 'rd=' + p.renderDistance);

  ws.emit('message', JSON.stringify({ event: 'settings', data: { renderDistance: 'abc' } }));
  check('settings: valores no numéricos se ignoran', p.renderDistance === 2);

  ws.sent.length = 0;
  ws.emit('message', JSON.stringify({ event: 'worlds_list', data: {} }));
  const wl = ws.events('worlds_list')[0];
  check('worlds_list: el servidor responde una lista de mundos', !!wl && Array.isArray(wl.data.worlds),
    wl ? wl.data.worlds.length + ' mundos' : 'sin respuesta');
}

world.setDiskLoader(null);
console.log(fails === 0 ? '\n✅ Todos los tests pasan' : `\n❌ ${fails} tests fallaron`);
process.exit(fails ? 1 : 0);
