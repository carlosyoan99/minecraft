'use strict';

// ============================================================
// CRAFTEO (recetas por patrón 3x3) Y HORNOS
// ============================================================
const fs = require('fs');
const path = require('path');
const state = require('./state.js');

const { furnaces } = state;
let recipes = {};
let furnaceRecipes = {};

function loadRecipes() {
  try {
    recipes = JSON.parse(fs.readFileSync(path.join(__dirname, 'recetas.json'), 'utf8'));
    furnaceRecipes = JSON.parse(fs.readFileSync(path.join(__dirname, 'recetas_horno.json'), 'utf8'));
    console.log(`📜 ${Object.keys(recipes).length} recetas de crafteo, ${Object.keys(furnaceRecipes).length} recetas de horno`);
  } catch (e) {
    console.error('⚠️  No se pudieron cargar las recetas:', e.message);
    recipes = {}; furnaceRecipes = {};
  }
}

// grid: array de 9 celdas, cada una null o { id, count }
function matchRecipe(grid) {
  for (const recipe of Object.values(recipes)) {
    const shape = recipe.shape;
    const rows = shape.length, cols = Math.max(...shape.map((r) => r.length));
    // Probar todas las posiciones de desplazamiento posibles dentro del grid 3x3
    for (let offR = 0; offR <= 3 - rows; offR++) {
      for (let offC = 0; offC <= 3 - cols; offC++) {
        let match = true;
        for (let r = 0; r < 3 && match; r++) {
          for (let c = 0; c < 3 && match; c++) {
            const cell = grid[r * 3 + c];
            const inShape = r >= offR && r < offR + rows && c >= offC && c < offC + cols;
            const patternChar = inShape ? (shape[r - offR][c - offC] || ' ') : ' ';
            if (patternChar === ' ') {
              if (cell) match = false;
            } else {
              const expectedId = recipe.ingredients[patternChar];
              if (!cell || cell.id !== expectedId) match = false;
            }
          }
        }
        if (match) return recipe;
      }
    }
  }
  return null;
}

// ============================================================
// HORNOS
// ============================================================
function getOrCreateFurnace(key) {
  let f = furnaces.get(key);
  if (!f) {
    f = { fuelItem: null, fuelTicksLeft: 0, inputItem: null, progress: 0, requiredTicks: 0, outputItem: null, outputCount: 0 };
    furnaces.set(key, f);
  }
  return f;
}

function furnaceSnapshot(f) {
  return {
    fuelItem: f.fuelItem, fuelTicksLeft: f.fuelTicksLeft,
    inputItem: f.inputItem ? f.inputItem.id : null, inputCount: f.inputItem ? f.inputItem.count : 0,
    progress: f.progress, requiredTicks: f.requiredTicks,
    outputItem: f.outputItem, outputCount: f.outputCount,
  };
}

function isCookable(itemId) {
  return !!furnaceRecipes[String(itemId)];
}

function tickFurnaces() {
  for (const [key, f] of furnaces) {
    const recipe = f.inputItem ? furnaceRecipes[String(f.inputItem.id)] : null;
    const canCook = recipe && f.inputItem.count > 0 && (f.fuelTicksLeft > 0 || f.fuelItem);

    if (canCook) {
      if (f.fuelTicksLeft <= 0 && f.fuelItem) {
        // Consumir una unidad de combustible
        f.fuelTicksLeft = 400; // ticks de combustible por unidad
      }
      if (f.fuelTicksLeft > 0) {
        f.fuelTicksLeft--;
        f.requiredTicks = recipe.time;
        f.progress++;
        if (f.progress >= f.requiredTicks) {
          f.progress = 0;
          f.inputItem.count--;
          if (f.inputItem.count <= 0) f.inputItem = null;
          if (f.outputItem === recipe.result.id) f.outputCount += recipe.result.count;
          else if (!f.outputItem) { f.outputItem = recipe.result.id; f.outputCount = recipe.result.count; }
          // Si el hueco de salida tiene otro item, el resultado se pierde (horno lleno) -- simplificado
        }
      }
    } else {
      f.progress = Math.max(0, f.progress - 2); // se enfría si no hay combustible/insumo
    }
  }
}

function restoreFurnaces(entries) {
  furnaces.clear();
  for (const [k, v] of entries || []) furnaces.set(k, v);
}

module.exports = {
  loadRecipes, matchRecipe,
  getOrCreateFurnace, furnaceSnapshot, tickFurnaces, restoreFurnaces, isCookable,
};
