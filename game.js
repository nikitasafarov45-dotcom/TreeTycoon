// game.js
// Полный рабочий код простой Tycoon-игры "Лесоруб" на Phaser 3.
// Скопируй файл целиком и помести рядом с index.html и style.css.

// ----------------------------
// Глобальные переменные игры
// ----------------------------

// Игровые объекты и состояние
let player;                 // объект игрока (круг)
let targetPoint = null;     // куда идти по клику: {x, y, targetTree}

// Деревья
let trees = [];             // массив объектов деревьев
const TREE_RADIUS = 28;     // радиус круга-дерева

// Инвентарь и склад
let carry = 0;              // текущее количество брёвен у игрока (в руках)
let carryMax = 10;          // максимальная вместимость игрока (по умолчанию 10)
let warehouseStock = 0;     // количество брёвен на складе
let money = 0;              // деньги игрока

// Рубка
let chopping = false;       // флаг — идёт процесс рубки
let chopProgress = 0;       // прогресс рубки в миллисекундах
let chopDuration = 1000;    // базовая длительность рубки в ms (1 секунда)
let axeLevel = 0;           // уровень топора (каждый уровень +50% скорости)
let capacityLevel = 0;      // уровень улучшения вместимости

// Интерфейс (Phaser тексты/элементы)
let moneyText, warehouseText, carryText, shopButton;
let chopBarBg, chopBar;     // прогресс-бар рубки
let shopOpen = false;
let shopGroup = [];         // группа объектов улучшения (для удаления)

// Таймеры и константы
const SELL_INTERVAL = 10000;   // интервал автоматической продажи на складе (10 сек)
const PRICE_PER_LOG = 10;      // цена за одно бревно при продаже
const TREE_REGEN_MS = 15000;   // время регенерации дерева после рубки (15 сек)

// Сохранение
const SAVE_KEY = 'lumberjack_save'; // ключ в localStorage

// ----------------------------
// Phaser конфиг и запуск игры
// ----------------------------
const config = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  parent: 'game-container',
  backgroundColor: '#b7e0a6', // светло-зелёный фон
  scene: {
    preload: preload,
    create: create,
    update: update
  }
};

const game = new Phaser.Game(config);

// ----------------------------
// preload — место для ассетов (мы используем простые фигуры)
// ----------------------------
function preload() {
  // Для минимального проекта ассетов не требуется.
  // Если захочешь добавить изображения, загрузи их здесь через this.load.image(...)
}

// ----------------------------
// Создание сцены — создаём игрока, деревья, склад, UI, таймеры
// ----------------------------
function create() {
  const scene = this; // чтобы внутри колбеков был доступ к this

  // ---- Игрок ----
  // ЭТО СОЗДАЁТ КРУГ (игрока) В ПОЗИЦИИ (400,300), РАДИУС 16, ЦВЕТ 0x3333ff
  player = scene.add.circle(400, 300, 16, 0x3333ff);

  // ---- Деревья ----
  // Позиции деревьев заданы статически (можно менять/добавлять)
  const treePositions = [
    {x: 150, y: 120},
    {x: 700, y: 80},
    {x: 120, y: 420},
    {x: 500, y: 260},
    {x: 650, y: 440}
  ];

  // Создаём объекты деревьев и добавляем в массив trees
  treePositions.forEach(pos => {
    // ЭТО РИСУЕТ КРУГ, ИМЕНИЕЙ ЦВЕТ 0x2e8b57 (зелёный)
    const spr = scene.add.circle(pos.x, pos.y, TREE_RADIUS, 0x2e8b57);
    // Сохраняем объект и состояние дерева
    trees.push({
      sprite: spr,   // сам игровой объект (Phaser.GameObjects)
      x: pos.x,      // координаты (на будущее)
      y: pos.y,
      alive: true,   // true — дерево растёт, false — срублено (пень)
      regenTimer: 0  // если срублено — сколько осталось до регена (ms)
    });
  });

  // ---- Склад ----
  // Рисуем склад как прямоугольник в правом верхнем углу
  const whX = 720, whY = 60;
  const whRect = scene.add.rectangle(whX, whY, 140, 80, 0xaaaaaa).setOrigin(0.5);
  const whText = scene.add.text(whX-52, whY-12, 'Склад', {font:'14px Arial', fill:'#000'});

  // Сохраняем координаты склада в объекте warehouse (упростим доступ)
  window.warehouse = { x: whX, y: whY, sprite: whRect };

  // ---- UI: деньги, склад, груз, кнопка улучшение ----
  moneyText = scene.add.text(10, 10, '', { font: '18px Arial', fill: '#000' });
  warehouseText = scene.add.text(10, 36, '', { font: '16px Arial', fill: '#000' });
  carryText = scene.add.text(10, 560, '', { font: '16px Arial', fill: '#000' });

  // Кнопка "УЛУЧШЕНИЕ" — простой текст с обработчиком клика
  shopButton = scene.add.text(680, 10, 'УЛУЧШЕНИЕ', { font: '18px Arial', fill: '#000', backgroundColor: '#ffd700' })
    .setInteractive()
    .on('pointerdown', () => {
      openShop(scene);
    });

  // ---- Прогресс-бар рубки (скрыт по умолчанию) ----
  chopBarBg = scene.add.rectangle(0, 0, 120, 12, 0x000000).setVisible(false).setOrigin(0.5);
  chopBar = scene.add.rectangle(0, 0, 0, 10, 0xff0000).setVisible(false).setOrigin(0,0.5);

  // ---- Вход: обработка клика по сцене ----
  // При клике определим — клик по дереву или просто по земле
  scene.input.on('pointerdown', (pointer) => {
    const px = pointer.worldX, py = pointer.worldY;
    // Ищем ближайшее дерево к месту клика
    let nearest = null;
    let nd = Infinity;
    trees.forEach(t => {
      const d = Phaser.Math.Distance.Between(px, py, t.x, t.y);
      if (d < nd) { nd = d; nearest = t; }
    });

    // Если клик рядом с деревом (<= 30 пикс) и дерево живое — цель = дерево (рубка)
    if (nearest && nd <= 40 && nearest.alive) {
      targetPoint = { x: nearest.x, y: nearest.y, targetTree: nearest };
    } else {
      // Иначе — обычное перемещение
      targetPoint = { x: px, y: py, targetTree: null };
    }
  });

  // ---- Автоматическая продажа: таймер каждые 10 секунд ----
  scene.time.addEvent({
    delay: SELL_INTERVAL,
    loop: true,
    callback: () => {
      if (warehouseStock > 0) {
        const sold = warehouseStock;
        warehouseStock = 0;
        money += sold * PRICE_PER_LOG;
        // Можно показывать уведомление, но для простоты выводим в консоль:
        console.log(`Продано ${sold} брёвен за ${sold * PRICE_PER_LOG} монет`);
      }
    }
  });

  // ---- Автосохранение каждые 30 секунд ----
  scene.time.addEvent({
    delay: 30000,
    loop: true,
    callback: saveGame
  });

  // Сохранение при закрытии вкладки
  window.addEventListener('beforeunload', saveGame);

  // ---- Попытка загрузки сохранения (после создания деревьев) ----
  loadGame();
}

// ----------------------------
// update — логика каждого кадра
// ----------------------------
function update(time, delta) {
  // delta — миллисекунды, прошедшие с прошлого кадра (нужно для корректной скорости)

  // ---- Движение игрока ----
  // Если идёт процесс рубки — игрок не двигается
  if (!chopping && targetPoint) {
    // вычисляем вектор к цели
    const dx = targetPoint.x - player.x;
    const dy = targetPoint.y - player.y;
    const dist = Math.sqrt(dx*dx + dy*dy);
    const speed = 120; // пикселей в секунду
    if (dist < 4) {
      // достигли точки
      // Если цель была дерево — остаёмся рядом; далее обработка рубки будет запущена ниже
      // Обнулим цель перемещения (но оставим targetTree — чтобы сработала рубка)
      targetPoint.x = player.x;
      targetPoint.y = player.y;
    } else {
      // движение: нормализуем вектор и перемещаем на speed * delta
      const vx = (dx / dist) * speed * (delta / 1000);
      const vy = (dy / dist) * speed * (delta / 1000);
      player.x += vx;
      player.y += vy;
    }
  }

  // ---- Рубка деревьев ----
  // Запускаем рубку если игрок стоит рядом с живым деревом и есть место в руках
  if (!chopping && targetPoint && targetPoint.targetTree) {
    const t = targetPoint.targetTree;
    const dist = Phaser.Math.Distance.Between(player.x, player.y, t.x, t.y);
    // Если рядом (например < 24 пикселей) — начинаем рубку
    if (dist < 34 && t.alive && carry < carryMax) {
      chopping = true;
      chopProgress = 0;
      // Остановим перемещение
      // (мы оставляем targetPoint, чтобы знать, за каким деревом пришли)
    }
  }

  // Если рубим — увеличиваем прогресс и при завершении даём бревно
  if (chopping) {
    // ЭТА СТРОКА ВЫЧИСЛЯЕТ ЭФФЕКТИВНУЮ ДЛИТЕЛЬНОСТЬ С УЧЁТОМ ТОПОРА:
    // Каждый уровень топора даёт +50% скорости => делим длительность на (1 + 0.5*axeLevel)
    const effectiveDuration = chopDuration / (1 + 0.5 * axeLevel);
    chopProgress += delta;

    // Простая "анимация" — пульсация размера
    player.scale = 1 + 0.05 * Math.sin(chopProgress / 100);

    // Показываем прогресс-бар над игроком
    chopBarBg.setVisible(true);
    chopBar.setVisible(true);
    chopBarBg.x = player.x;
    chopBarBg.y = player.y - 30;
    chopBar.x = player.x - 60;
    chopBar.y = player.y - 30;
    const pct = Math.min(1, chopProgress / effectiveDuration);
    chopBar.width = 120 * pct;

    if (chopProgress >= effectiveDuration) {
      // Завершили рубку — добавляем бревно
      carry = Math.min(carryMax, carry + 1);
      // Отмечаем дерево как срубленное
      const t = targetPoint.targetTree;
      if (t) {
        t.alive = false;
        t.sprite.setRadius(TREE_RADIUS * 0.5); // Пенек в 2 раза меньше
t.sprite.setFillStyle(0x8b4513); // коричневый цвет — пень
        t.regenTimer = TREE_REGEN_MS;     // стартуем таймер регенерации
      }
      // Сбрасываем рубку
      chopping = false;
      chopProgress = 0;
      player.scale = 1;

      // Если вместимость достигнута — сбрасываем targetTree, чтобы не пытаться рубить снова
      if (carry >= carryMax) {
        targetPoint = { x: player.x, y: player.y, targetTree: null };
      }
    }
  } else {
    // скрываем прогресс-бар когда не рубим
    chopBarBg.setVisible(false);
    chopBar.setVisible(false);
    player.scale = 1;
  }

  // ---- Регенерация деревьев ----
  trees.forEach(t => {
    if (!t.alive && t.regenTimer > 0) {
      t.regenTimer -= delta;
      if (t.regenTimer <= 0) {
        t.alive = true;
t.sprite.setRadius(TREE_RADIUS); // Восстанавливаем полный размер
t.sprite.setFillStyle(0x2e8b57);
        t.regenTimer = 0;
      }
    }
  });

  // ---- Сдача брёвен на склад при подходе ----
  if (Phaser.Math.Distance.Between(player.x, player.y, window.warehouse.x, window.warehouse.y) < 40) {
    if (carry > 0) {
      // Переносим всё, что у игрока, на склад
      warehouseStock += carry;
      carry = 0;
      // Если улучшение открыто — обновим его (он будет обновлён при рендере UI)
    }
  }

  // ---- Обновление UI ----
  moneyText.setText(`💰 ${money}`);
  warehouseText.setText(`🪵 Склад: ${warehouseStock}`);
  carryText.setText(`Груз: ${carry}/${carryMax}`);
}

// ----------------------------
// Улучшение — простая реализация на Phaser (текст/прямоугольники)
// ----------------------------
function openShop(scene) {
  if (shopOpen) {
    // Закрываем улучшение — удаляем все объекты из shopGroup
    shopGroup.forEach(obj => { if (obj && obj.destroy) obj.destroy(); });
    shopGroup = [];
    shopOpen = false;
    return;
  }

  shopOpen = true;
  shopGroup = [];

  // Фон модального окна
  const bg = scene.add.rectangle(400, 300, 520, 320, 0xffffff).setStrokeStyle(2, 0x000000);
  shopGroup.push(bg);

  // Заголовок
  const title = scene.add.text(260, 170, 'УЛУЧШЕНИЕ УЛУЧШЕНИЙ', {font: '20px Arial', fill: '#000'});
  shopGroup.push(title);

  // Кнопка: Топор (скорость рубки)
  const axePrice = Math.floor(50 * Math.pow(1.5, axeLevel));
  const axeBtn = scene.add.text(280, 220, `Топор (скорость) Lv ${axeLevel} — ${axePrice} монет`, {font:'16px Arial', fill:'#000', backgroundColor:'#cfcfcf'})
    .setInteractive()
    .on('pointerdown', () => {
      if (money >= axePrice) {
        money -= axePrice;
        axeLevel += 1;
        // Обновляем текст кнопки (удаляем и создаём заново чтобы обновился текст)
        openShop(scene);
      } else {
        // Можно добавить уведомление "недостаточно денег"
        console.log('Недостаточно денег для покупки топора');
      }
    });
  shopGroup.push(axeBtn);

  // Кнопка: Вместимость (+5 к грузу)
  const capPrice = Math.floor(100 * Math.pow(1.6, capacityLevel));
  const capBtn = scene.add.text(280, 260, `Вместимость +5 Lv ${capacityLevel} — ${capPrice} монет`, {font:'16px Arial', fill:'#000', backgroundColor:'#cfcfcf'})
    .setInteractive()
    .on('pointerdown', () => {
      if (money >= capPrice) {
        money -= capPrice;
        capacityLevel += 1;
        carryMax += 5; // применяем эффект вместимости
        openShop(scene); // перерисуем улучшение
      } else {
        console.log('Недостаточно денег для покупки вместимости');
      }
    });
  shopGroup.push(capBtn);

  // Кнопка закрыть
  const closeBtn = scene.add.text(420, 360, 'Закрыть', {font:'16px Arial', fill:'#fff', backgroundColor:'#333'})
    .setInteractive()
    .on('pointerdown', () => {
      openShop(scene); // закроет улучшение
    });
  shopGroup.push(closeBtn);
}

// ----------------------------
// Сохранение и загрузка (localStorage)
// ----------------------------
function saveGame() {
  try {
    const state = {
      money,
      warehouseStock,
      carry,
      carryMax,
      axeLevel,
      capacityLevel,
      // Сохраняем состояние деревьев (alive + оставшийся regenTimer)
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

    // Восстанавливаем деревья (если дерево было срублено — перекрасим и установим таймер)
    if (st.trees && st.trees.length === trees.length) {
      st.trees.forEach((tst, idx) => {
        if (!tst.alive) {
  trees[idx].alive = false;
  trees[idx].sprite.setRadius(TREE_RADIUS * 0.5); // Пенек меньше
  trees[idx].sprite.setFillStyle(0x8b4513);
  trees[idx].regenTimer = tst.regenTimer || TREE_REGEN_MS;
} else {
  trees[idx].alive = true;
  trees[idx].sprite.setRadius(TREE_RADIUS); // Полный размер
  trees[idx].sprite.setFillStyle(0x2e8b57);
  trees[idx].regenTimer = 0;
}
      });
    }
    console.log('Сохранение загружено');
  } catch (e) {
    console.error('Ошибка загрузки сохранения', e);
  }
}

// ----------------------------
// --- Конец game.js ---
// ----------------------------

/*
Короткие подсказки/объяснения (повторно, "для чайников"):

- player = scene.add.circle(x, y, r, color);
  // ЭТО СОЗДАЁТ КРУГ — нашего лесоруба.

- scene.input.on('pointerdown', (pointer) => { ... });
  // ЭТА СТРОКА НАСТРАИВАЕТ ОБРАБОТЧИК КЛИКОВ/ТАПОВ.

- this.time.addEvent({ delay: ..., loop: true, callback: ... });
  // ЭТО СОЗДАЁТ ТАЙМЕР, КОТОРЫЙ ВЫЗЫВАЕТ ФУНКЦИЮ С ПЕРИОДОМ delay.

- localStorage.setItem('ключ', JSON.stringify(obj));
- JSON.parse(localStorage.getItem('ключ'));
  // ТАК МЫ СОХРАНЯЕМ И ЗАГРУЖАЕМ СОСТОЯНИЕ ИЗ ЛОКАЛЬНОГО ХРАНИЛИЩА БРАУЗЕРА.

Запусти `npx http-server . -p 8080` в папке с проектом и открой http://localhost:8080
*/