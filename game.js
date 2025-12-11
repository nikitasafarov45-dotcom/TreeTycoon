// game.js
// Исходный код игры с минимальными правками для корректного масштабирования в WebView (Telegram).
// Сохранена логика, переменные и поведение — изменён только конфиг Phaser, несколько вспомогательных связок с DOM.

/* ---------------------------
   Глобальные переменные (как в оригинале)
   --------------------------- */
let player;
let targetPoint = null;

let trees = [];
const TREE_RADIUS = 28;

let carry = 0;
let carryMax = 10;
let warehouseStock = 0;
let money = 0;

let chopping = false;
let chopProgress = 0;
let chopDuration = 1000;
let axeLevel = 0;
let capacityLevel = 0;

let moneyText, warehouseText, carryText, shopButton;
let chopBarBg, chopBar;
let shopOpen = false;
let shopGroup = [];

const SELL_INTERVAL = 10000;
const PRICE_PER_LOG = 10;
const TREE_REGEN_MS = 15000;

const SAVE_KEY = 'lumberjack_save';

// Глобальная helper-функция для создания кроны (используется при регене)
function createCrown(scene, x, y) {
  const points = [
    0, -34,
    22, -12,
    34, 8,
    16, 30,
    -8, 26,
    -28, 10,
    -20, -10
  ];
  return scene.add.polygon(x, y, points, 0x2e8b57).setOrigin(0.5).setDepth(3);
}

/* ---------------------------
   Phaser конфиг (адаптивный)
   - mode: FIT -> подгоняет canvas в контейнер #game
   - autoCenter: CENTER_BOTH -> центрирует
   - parent: 'game' -> совпадает с id контейнера в index.html
   --------------------------- */
const config = {
  type: Phaser.AUTO,
  parent: 'game', // <--- важно: совпадает с <div id="game">
  backgroundColor: '#b7e0a6',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 800,   // виртуальная ширина сцены (логика сохраняется)
    height: 600   // виртуальная высота сцены
  },
  scene: {
    preload: preload,
    create: create,
    update: update
  }
};

const game = new Phaser.Game(config);
// expose game globally for resize helper
window.game = game;

/* Обработчик окна: при ресайзе - подгоняем Phaser */
window.addEventListener('resize', () => {
  try {
    if (window.game && window.game.scale) {
      window.game.scale.resize(window.innerWidth, window.innerHeight);
    }
  } catch (e) {}
});

/* ----------------------------
   preload (как раньше — пусто/минимум)
   ---------------------------- */
function preload() {
  // Оригинально у тебя здесь ничего не грузилось — оставляем как есть.
}

/* ----------------------------
   create — (логика той же, небольшие правки)
   ---------------------------- */
function create() {
  const scene = this;

  // Сохраняем сцену глобально — чтобы DOM-кнопка могла вызвать openShop(scene)
  window.currentScene = scene;

  // Игрок (если player ещё не создан в старом коде — создаём простой круг как ранее)
  player = scene.add.circle(400, 300, 16, 0x3333ff);

  // Деревья — используем позиции, убираем дерево, которое накладывалось на склад
  const treePositions = [
    {x: 150, y: 120},
    // removed overlapping tree {x: 700, y: 80},
    {x: 120, y: 420},
    {x: 500, y: 260},
    {x: 650, y: 440},
    {x: 300, y: 200}
  ];



  treePositions.forEach(pos => {
    const crown = createCrown(scene, pos.x, pos.y);
    trees.push({
      crown: crown,   // polygon for crown
      stump: null,    // created when cut
      x: pos.x,
      y: pos.y,
      alive: true,
      regenTimer: 0
    });
  });

  // Склад (как раньше)
  const whX = 720, whY = 60;
  const whRect = scene.add.rectangle(whX, whY, 140, 80, 0xaaaaaa).setOrigin(0.5);
  const whText = scene.add.text(whX-52, whY-12, 'Склад', {font:'14px Arial', fill:'#000'});
  window.warehouse = { x: whX, y: whY, sprite: whRect };

  // UI: используем DOM-HUD (index.html) — Phaser-тексты удалены чтобы не дублировать интерфейс
  // Удаляем in-canvas кнопку улучшений (оставляем DOM-кнопку в углу)

  // Progress bar
  chopBarBg = scene.add.rectangle(0, 0, 120, 12, 0x000000).setVisible(false).setOrigin(0.5).setDepth(6);
  chopBar = scene.add.rectangle(0, 0, 0, 10, 0xff0000).setVisible(false).setOrigin(0,0.5).setDepth(7);

  // Input
  scene.input.on('pointerdown', (pointer) => {
    const px = pointer.worldX, py = pointer.worldY;
    let nearest = null;
    let nd = Infinity;
    trees.forEach(t => {
      const d = Phaser.Math.Distance.Between(px, py, t.x, t.y);
      if (d < nd) { nd = d; nearest = t; }
    });

    if (nearest && nd <= 40 && nearest.alive) {
      targetPoint = { x: nearest.x, y: nearest.y, targetTree: nearest };
    } else {
      targetPoint = { x: px, y: py, targetTree: null };
    }
  });

  // Автопродажа
  scene.time.addEvent({
    delay: SELL_INTERVAL,
    loop: true,
    callback: () => {
      if (warehouseStock > 0) {
        const sold = warehouseStock;
        warehouseStock = 0;
        money += sold * PRICE_PER_LOG;
        console.log(`Продано ${sold} брёвен за ${sold * PRICE_PER_LOG} монет`);
      }
    }
  });

  // Сохранение
  scene.time.addEvent({
    delay: 30000,
    loop: true,
    callback: saveGame
  });
  window.addEventListener('beforeunload', saveGame);

  // Настройка DOM-кнопки (если она есть)
  setupShopButton();

  // Принудительно подгоняем размер Phaser canvas к контейнеру (#game)
  try {
    const gdiv = document.getElementById('game');
    if (gdiv && window.game && window.game.scale) {
      window.game.scale.resize(gdiv.clientWidth, gdiv.clientHeight);
    }
  } catch (e) {}

  // Попытка загрузки
  loadGame();
}

/* ----------------------------
   update — логика игры (без изменений, + глобальные алиасы)
   ---------------------------- */
function update(time, delta) {
  const scene = game.scene.scenes[0];
  // Движение игрока
  if (!chopping && targetPoint) {
    const dx = targetPoint.x - player.x;
    const dy = targetPoint.y - player.y;
    const dist = Math.sqrt(dx*dx + dy*dy);
    const speed = 120;
    if (dist < 4) {
      targetPoint.x = player.x;
      targetPoint.y = player.y;
    } else {
      const vx = (dx / dist) * speed * (delta / 1000);
      const vy = (dy / dist) * speed * (delta / 1000);
      player.x += vx;
      player.y += vy;
    }
  }

  // Рубка
  if (!chopping && targetPoint && targetPoint.targetTree) {
    const t = targetPoint.targetTree;
    const dist = Phaser.Math.Distance.Between(player.x, player.y, t.x, t.y);
    if (dist < 34 && t.alive && carry < carryMax) {
      chopping = true;
      chopProgress = 0;
    }
  }

  if (chopping) {
    const effectiveDuration = chopDuration / (1 + 0.5 * axeLevel);
    chopProgress += delta;
    player.scale = 1 + 0.05 * Math.sin(chopProgress / 100);

    chopBarBg.setVisible(true);
    chopBar.setVisible(true);
    chopBarBg.x = player.x;
    chopBarBg.y = player.y - 30;
    chopBar.x = player.x - 60;
    chopBar.y = player.y - 30;
    const pct = Math.min(1, chopProgress / effectiveDuration);
    chopBar.width = 120 * pct;

    if (chopProgress >= effectiveDuration) {
      carry = Math.min(carryMax, carry + 1);
      const t = targetPoint.targetTree;
      if (t) {
        // replace crown with stump
        if (t.crown) { t.crown.destroy(); t.crown = null; }
        t.stump = scene.add.circle(t.x, t.y, TREE_RADIUS * 0.5, 0x8b4513).setDepth(4);
        t.alive = false;
        t.regenTimer = TREE_REGEN_MS;
      }
      chopping = false;
      chopProgress = 0;
      player.scale = 1;
      if (carry >= carryMax) {
        targetPoint = { x: player.x, y: player.y, targetTree: null };
      }
    }
  } else {
    chopBarBg.setVisible(false);
    chopBar.setVisible(false);
    player.scale = 1;
  }

  // Регенерация деревьев
  trees.forEach(t => {
    if (!t.alive && t.regenTimer > 0) {
      t.regenTimer -= delta;
      if (t.regenTimer <= 0) {
        // remove stump and recreate crown
        if (t.stump) { t.stump.destroy(); t.stump = null; }
        t.crown = createCrown(scene, t.x, t.y);
        t.alive = true;
        t.regenTimer = 0;
      }
    }
  });

  // Сдача на склад
  if (Phaser.Math.Distance.Between(player.x, player.y, window.warehouse.x, window.warehouse.y) < 40) {
    if (carry > 0) {
      warehouseStock += carry;
      carry = 0;
    }
  }

  // Обновление DOM-HUD (единственный источник интерфейса):
  try {
    const m = document.getElementById('money');
    const w = document.getElementById('wood-storage');
    const c = document.getElementById('bottom-info');
    if (m) m.textContent = `💰 ${money}`;
    if (w) w.textContent = `🪵 ${warehouseStock}`;
    if (c) c.textContent = `Груз: ${carry}/${carryMax}`;
  } catch(e){}
}

/* ----------------------------
   openShop (Phaser modal backup)
   ---------------------------- */
function openShop(scene) {
  if (shopOpen) {
    shopGroup.forEach(obj => { if (obj && obj.destroy) obj.destroy(); });
    shopGroup = [];
    shopOpen = false;
    return;
  }

  shopOpen = true;
  shopGroup = [];

  const bg = scene.add.rectangle(400, 300, 520, 320, 0xffffff).setStrokeStyle(2, 0x000000);
  shopGroup.push(bg);

  const title = scene.add.text(260, 170, 'УЛУЧШЕНИЕ УЛУЧШЕНИЙ', {font: '20px Arial', fill: '#000'});
  shopGroup.push(title);

  const axePrice = Math.floor(50 * Math.pow(1.5, axeLevel));
  const axeBtn = scene.add.text(280, 220, `Топор (скорость) Lv ${axeLevel} — ${axePrice} монет`, {font:'16px Arial', fill:'#000', backgroundColor:'#cfcfcf'})
    .setInteractive()
    .on('pointerdown', () => {
      if (money >= axePrice) {
        money -= axePrice;
        axeLevel += 1;
        openShop(scene);
      } else {
        console.log('Недостаточно денег для покупки топора');
      }
    });
  shopGroup.push(axeBtn);

  const capPrice = Math.floor(100 * Math.pow(1.6, capacityLevel));
  const capBtn = scene.add.text(280, 260, `Вместимость +5 Lv ${capacityLevel} — ${capPrice} монет`, {font:'16px Arial', fill:'#000', backgroundColor:'#cfcfcf'})
    .setInteractive()
    .on('pointerdown', () => {
      if (money >= capPrice) {
        money -= capPrice;
        capacityLevel += 1;
        carryMax += 5;
        openShop(scene);
      } else {
        console.log('Недостаточно денег для покупки вместимости');
      }
    });
  shopGroup.push(capBtn);

  const closeBtn = scene.add.text(420, 360, 'Закрыть', {font:'16px Arial', fill:'#fff', backgroundColor:'#333'})
    .setInteractive()
    .on('pointerdown', () => {
      openShop(scene);
    });
  shopGroup.push(closeBtn);
}

/* ----------------------------
   Сохранение / Загрузка (как было)
   ---------------------------- */
function saveGame() {
  try {
    const state = {
      money,
      warehouseStock,
      carry,
      carryMax,
      axeLevel,
      capacityLevel,
      trees: trees.map(t => ({ alive: t.alive, regenTimer: t.regenTimer, x: t.x, y: t.y }))
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    console.log('Игра сохранена');
  } catch (e) {
    console.error('Ошибка сохранения', e);
  }
}

function loadGame() {
  try {
    const s = localStorage.getItem(SAVE_KEY);
    if (!s) return;
    const st = JSON.parse(s);
    money = st.money || 0;
    warehouseStock = st.warehouseStock || 0;
    carry = st.carry || 0;
    carryMax = st.carryMax || 10;
    axeLevel = st.axeLevel || 0;
    capacityLevel = st.capacityLevel || 0;

    if (st.trees && st.trees.length === trees.length) {
      st.trees.forEach((tst, idx) => {
        if (!tst.alive) {
          trees[idx].alive = false;
          // remove crown if exists
          if (trees[idx].crown) { trees[idx].crown.destroy(); trees[idx].crown = null; }
          // create stump
          if (!trees[idx].stump) trees[idx].stump = window.currentScene.add.circle(tst.x, tst.y, TREE_RADIUS * 0.5, 0x8b4513).setDepth(4);
          trees[idx].regenTimer = tst.regenTimer || TREE_REGEN_MS;
        } else {
          trees[idx].alive = true;
          // ensure crown exists
          if (!trees[idx].crown) trees[idx].crown = createCrown(window.currentScene, tst.x, tst.y);
          // destroy stump if any
          if (trees[idx].stump) { trees[idx].stump.destroy(); trees[idx].stump = null; }
          trees[idx].regenTimer = 0;
        }
      });
    }
    console.log('Сохранение загружено');
  } catch (e) {
    console.error('Ошибка загрузки сохранения', e);
  }
}

/* ----------------------------
   Вспомогательная: привязка DOM-кнопки улучшений
   ---------------------------- */
function setupShopButton() {
  try {
    const btn = document.getElementById('shop-btn');
    if (!btn) return;
    btn.onclick = () => {
      // prefer DOM modal: если есть currentScene - используем Phaser openShop,
      // иначе показываем простое alert
      if (window.currentScene) {
        openShop(window.currentScene);
      } else {
        alert('Улучшение (сцена пока не готова)');
      }
    };
  } catch (e) {}
}

// Не трогаем остальное — логика сохранена.