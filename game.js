// game.js
// ПЕРЕРАБОТАННАЯ версия игры "Лесоруб Tycoon" для Telegram Mini Apps
// Решены все проблемы: полноэкранный режим, наложение элементов, дублирование интерфейса, визуал деревьев

// ==================== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ====================
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

let chopBarBg, chopBar;
let shopOpen = false;
let shopGroup = [];

const SELL_INTERVAL = 10000;
const PRICE_PER_LOG = 10;
const TREE_REGEN_MS = 15000;
const SAVE_KEY = 'lumberjack_save';

// ==================== КОНФИГ ПИНЕРА (ПОЛНОЭКРАННЫЙ) ====================
const config = {
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#b7e0a6',
    scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: window.innerWidth,
        height: window.innerHeight
    },
    scene: {
        preload: preload,
        create: create,
        update: update
    }
};

const game = new Phaser.Game(config);

// ==================== ФУНКЦИЯ СОЗДАНИЯ КРОНЫ ДЕРЕВА ====================
function createTreeCrown(scene, x, y) {
    // Создаем многоугольник для кроны (неправильная форма, не круг)
    const points = [];
    const sides = 8; // Восьмиугольник с разными радиусами
    const baseRadius = TREE_RADIUS;
    
    for (let i = 0; i < sides; i++) {
        const angle = (i / sides) * Math.PI * 2;
        // Добавляем случайные вариации радиуса для неровной формы
        const radiusVariance = baseRadius * (0.8 + Math.random() * 0.4);
        const px = Math.cos(angle) * radiusVariance;
        const py = Math.sin(angle) * radiusVariance;
        points.push(px);
        points.push(py);
    }
    
    return scene.add.polygon(x, y, points, 0x2e8b57)
        .setStrokeStyle(2, 0x1e5b3f)
        .setOrigin(0.5)
        .setDepth(1);
}

// ==================== ИНИЦИАЛИЗАЦИЯ TELEGRAM ====================
function initTelegram() {
    if (typeof Telegram !== 'undefined' && Telegram.WebApp) {
        Telegram.WebApp.ready();
        Telegram.WebApp.expand();
        Telegram.WebApp.setHeaderColor('#b7e0a6');
        Telegram.WebApp.BackButton.hide();
        Telegram.WebApp.MainButton.hide();
        
        // Адаптируем масштаб под экран Telegram
        if (Telegram.WebApp.viewportHeight < 600) {
            game.scale.setZoom(0.8);
        }
        
        return true;
    }
    return false;
}

// ==================== PRELOAD ====================
function preload() {
    // Ассеты не используются, оставляем пустым
}

// ==================== CREATE ====================
function create() {
    const scene = this;
    const screenWidth = scene.scale.width;
    const screenHeight = scene.scale.height;
    
    // Инициализация Telegram
    initTelegram();
    
    // ============ ИГРОК ============
    player = scene.add.circle(screenWidth / 2, screenHeight / 2, 16, 0x3333ff);
    
    // ============ ДЕРЕВЬЯ (С ИСПРАВЛЕННЫМИ ПОЗИЦИЯМИ) ============
    // Убрали дерево, которое перекрывалось складом (было на 700,80)
    const treePositions = [
        {x: screenWidth * 0.2, y: screenHeight * 0.2},
        {x: screenWidth * 0.15, y: screenHeight * 0.7},
        {x: screenWidth * 0.6, y: screenHeight * 0.45},
        {x: screenWidth * 0.8, y: screenHeight * 0.75},
        {x: screenWidth * 0.35, y: screenHeight * 0.3} // Новое дерево вместо удаленного
    ];
    
    trees = [];
    treePositions.forEach(pos => {
        const crown = createTreeCrown(scene, pos.x, pos.y);
        trees.push({
            crown: crown,
            stump: null,
            x: pos.x,
            y: pos.y,
            alive: true,
            regenTimer: 0
        });
    });
    
    // ============ СКЛАД ============
    const whX = screenWidth - 80;
    const whY = 80;
    const whRect = scene.add.rectangle(whX, whY, 140, 80, 0xaaaaaa)
        .setOrigin(0.5)
        .setStrokeStyle(2, 0x666666);
    
    scene.add.text(whX, whY - 12, 'Склад', {
        font: '14px Arial',
        fill: '#000',
        backgroundColor: 'rgba(255,255,255,0.7)',
        padding: { x: 5, y: 2 }
    }).setOrigin(0.5);
    
    window.warehouse = { x: whX, y: whY, sprite: whRect };
    
    // ============ ПРОГРЕСС-БАР РУБКИ ============
    chopBarBg = scene.add.rectangle(0, 0, 120, 12, 0x000000)
        .setVisible(false)
        .setOrigin(0.5)
        .setDepth(10);
    
    chopBar = scene.add.rectangle(0, 0, 0, 10, 0xff0000)
        .setVisible(false)
        .setOrigin(0, 0.5)
        .setDepth(11);
    
    // ============ ОБРАБОТКА КЛИКОВ ============
    scene.input.on('pointerdown', (pointer) => {
        const px = pointer.worldX;
        const py = pointer.worldY;
        
        // Поиск ближайшего дерева
        let nearest = null;
        let minDistance = Infinity;
        
        trees.forEach(tree => {
            if (!tree.alive) return;
            const distance = Phaser.Math.Distance.Between(px, py, tree.x, tree.y);
            if (distance < minDistance && distance <= 40) {
                minDistance = distance;
                nearest = tree;
            }
        });
        
        if (nearest && nearest.alive) {
            targetPoint = { x: nearest.x, y: nearest.y, targetTree: nearest };
        } else {
            targetPoint = { x: px, y: py, targetTree: null };
        }
    });
    
    // ============ АВТОМАТИЧЕСКАЯ ПРОДАЖА ============
    scene.time.addEvent({
        delay: SELL_INTERVAL,
        loop: true,
        callback: () => {
            if (warehouseStock > 0) {
                const sold = warehouseStock;
                const earned = sold * PRICE_PER_LOG;
                warehouseStock = 0;
                money += earned;
                console.log(`Продано ${sold} брёвен за ${earned} монет`);
                updateUI();
            }
        }
    });
    
    // ============ АВТОСОХРАНЕНИЕ ============
    scene.time.addEvent({
        delay: 30000,
        loop: true,
        callback: saveGame
    });
    
    window.addEventListener('beforeunload', saveGame);
    
    // ============ НАСТРОЙКА КНОПКИ УЛУЧШЕНИЙ ============
    setupShopButton();
    
    // ============ ЗАГРУЗКА СОХРАНЕНИЯ ============
    loadGame();
    
    // Обновляем интерфейс после загрузки
    updateUI();
}

// ==================== UPDATE ====================
function update(time, delta) {
    const scene = game.scene.scenes[0];
    
    // ---------- ДВИЖЕНИЕ ИГРОКА ----------
    if (!chopping && targetPoint) {
        const dx = targetPoint.x - player.x;
        const dy = targetPoint.y - player.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const speed = 120;
        
        if (distance < 4) {
            targetPoint.x = player.x;
            targetPoint.y = player.y;
        } else {
            const moveX = (dx / distance) * speed * (delta / 1000);
            const moveY = (dy / distance) * speed * (delta / 1000);
            player.x += moveX;
            player.y += moveY;
        }
    }
    
    // ---------- РУБКА ДЕРЕВА ----------
    if (!chopping && targetPoint && targetPoint.targetTree) {
        const tree = targetPoint.targetTree;
        const distance = Phaser.Math.Distance.Between(player.x, player.y, tree.x, tree.y);
        
        if (distance < 34 && tree.alive && carry < carryMax) {
            chopping = true;
            chopProgress = 0;
        }
    }
    
    if (chopping) {
        const effectiveDuration = chopDuration / (1 + 0.5 * axeLevel);
        chopProgress += delta;
        
        // Анимация игрока при рубке
        player.scale = 1 + 0.05 * Math.sin(chopProgress / 100);
        
        // Обновление прогресс-бара
        chopBarBg.setVisible(true);
        chopBar.setVisible(true);
        chopBarBg.x = player.x;
        chopBarBg.y = player.y - 30;
        chopBar.x = player.x - 60;
        chopBar.y = player.y - 30;
        
        const progressPercent = Math.min(1, chopProgress / effectiveDuration);
        chopBar.width = 120 * progressPercent;
        
        if (chopProgress >= effectiveDuration) {
            // Добавляем бревно
            carry = Math.min(carryMax, carry + 1);
            
            // Превращаем дерево в пенек
            const tree = targetPoint.targetTree;
            if (tree) {
                tree.alive = false;
                if (tree.crown) {
                    tree.crown.destroy();
                    tree.crown = null;
                }
                tree.stump = scene.add.circle(tree.x, tree.y, TREE_RADIUS * 0.5, 0x8b4513)
                    .setStrokeStyle(1, 0x5d2906)
                    .setDepth(2);
                tree.regenTimer = TREE_REGEN_MS;
            }
            
            // Сбрасываем состояние рубки
            chopping = false;
            chopProgress = 0;
            player.scale = 1;
            
            // Если груз полный, сбрасываем цель
            if (carry >= carryMax) {
                targetPoint = { x: player.x, y: player.y, targetTree: null };
            }
            
            updateUI();
        }
    } else {
        chopBarBg.setVisible(false);
        chopBar.setVisible(false);
        player.scale = 1;
    }
    
    // ---------- РЕГЕНЕРАЦИЯ ДЕРЕВЬЕВ ----------
    trees.forEach(tree => {
        if (!tree.alive && tree.regenTimer > 0) {
            tree.regenTimer -= delta;
            if (tree.regenTimer <= 0) {
                // Удаляем пенек и восстанавливаем крону
                if (tree.stump) {
                    tree.stump.destroy();
                    tree.stump = null;
                }
                tree.crown = createTreeCrown(scene, tree.x, tree.y);
                tree.alive = true;
                tree.regenTimer = 0;
            }
        }
    });
    
    // ---------- СДАЧА БРЕВЕН НА СКЛАД ----------
    if (Phaser.Math.Distance.Between(player.x, player.y, window.warehouse.x, window.warehouse.y) < 50) {
        if (carry > 0) {
            warehouseStock += carry;
            carry = 0;
            updateUI();
        }
    }
    
    // ---------- АВТОМАТИЧЕСКОЕ ОБНОВЛЕНИЕ UI ----------
    if (Math.floor(time / 100) % 5 === 0) { // Каждые 0.5 секунды
        updateUI();
    }
}

// ==================== ОБНОВЛЕНИЕ ИНТЕРФЕЙСА ====================
function updateUI() {
    try {
        // Обновляем только DOM-элементы (убраны дублирующие Phaser-тексты)
        const moneyElement = document.getElementById('money');
        const woodElement = document.getElementById('wood-storage');
        const carryElement = document.getElementById('bottom-info');
        
        if (moneyElement) moneyElement.textContent = `💰 ${money}`;
        if (woodElement) woodElement.textContent = `🪵 ${warehouseStock}`;
        if (carryElement) carryElement.textContent = `Груз: ${carry}/${carryMax}`;
    } catch (error) {
        console.log('Ошибка обновления UI:', error);
    }
}

// ==================== МАГАЗИН УЛУЧШЕНИЙ ====================
function openShop(scene) {
    if (shopOpen) {
        closeShop();
        return;
    }
    
    shopOpen = true;
    shopGroup = [];
    
    const screenWidth = scene.scale.width;
    const screenHeight = scene.scale.height;
    
    // Фон магазина
    const bg = scene.add.rectangle(screenWidth / 2, screenHeight / 2, 
        Math.min(screenWidth * 0.9, 500), Math.min(screenHeight * 0.8, 350), 
        0xffffff)
        .setStrokeStyle(3, 0x8b4513)
        .setDepth(20);
    shopGroup.push(bg);
    
    // Заголовок
    const title = scene.add.text(screenWidth / 2, screenHeight / 2 - 120, 
        'УЛУЧШЕНИЯ', {
            font: '22px Arial',
            fill: '#8b4513',
            fontWeight: 'bold'
        }).setOrigin(0.5).setDepth(21);
    shopGroup.push(title);
    
    // Улучшение топора
    const axePrice = Math.floor(50 * Math.pow(1.5, axeLevel));
    const axeText = `Топор Lv${axeLevel + 1}\n+50% скорости\n${axePrice} монет`;
    
    const axeBtn = scene.add.text(screenWidth / 2, screenHeight / 2 - 40, 
        axeText, {
            font: '16px Arial',
            fill: '#000',
            backgroundColor: '#d4a76a',
            padding: { x: 15, y: 10 },
            align: 'center'
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })
        .setDepth(21)
        .on('pointerdown', () => {
            if (money >= axePrice) {
                money -= axePrice;
                axeLevel += 1;
                closeShop();
                updateUI();
            }
        });
    shopGroup.push(axeBtn);
    
    // Улучшение вместимости
    const capPrice = Math.floor(100 * Math.pow(1.6, capacityLevel));
    const capText = `Рюкзак Lv${capacityLevel + 1}\n+5 к вместимости\n${capPrice} монет`;
    
    const capBtn = scene.add.text(screenWidth / 2, screenHeight / 2 + 40, 
        capText, {
            font: '16px Arial',
            fill: '#000',
            backgroundColor: '#d4a76a',
            padding: { x: 15, y: 10 },
            align: 'center'
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })
        .setDepth(21)
        .on('pointerdown', () => {
            if (money >= capPrice) {
                money -= capPrice;
                capacityLevel += 1;
                carryMax += 5;
                closeShop();
                updateUI();
            }
        });
    shopGroup.push(capBtn);
    
    // Кнопка закрытия
    const closeBtn = scene.add.text(screenWidth / 2, screenHeight / 2 + 120, 
        'ЗАКРЫТЬ', {
            font: '18px Arial',
            fill: '#fff',
            backgroundColor: '#8b4513',
            padding: { x: 20, y: 10 }
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })
        .setDepth(21)
        .on('pointerdown', closeShop);
    shopGroup.push(closeBtn);
}

function closeShop() {
    shopGroup.forEach(obj => {
        if (obj && obj.destroy) obj.destroy();
    });
    shopGroup = [];
    shopOpen = false;
}

// ==================== НАСТРОЙКА КНОПКИ УЛУЧШЕНИЙ ====================
function setupShopButton() {
    try {
        const shopBtn = document.getElementById('shop-btn');
        if (!shopBtn) return;
        
        shopBtn.onclick = () => {
            const scene = game.scene.scenes[0];
            if (scene) {
                openShop(scene);
            }
        };
    } catch (error) {
        console.log('Ошибка настройки кнопки магазина:', error);
    }
}

// ==================== СОХРАНЕНИЕ И ЗАГРУЗКА ====================
function saveGame() {
    try {
        const saveData = {
            money: money,
            warehouseStock: warehouseStock,
            carry: carry,
            carryMax: carryMax,
            axeLevel: axeLevel,
            capacityLevel: capacityLevel,
            trees: trees.map(tree => ({
                x: tree.x,
                y: tree.y,
                alive: tree.alive,
                regenTimer: tree.regenTimer
            }))
        };
        
        localStorage.setItem(SAVE_KEY, JSON.stringify(saveData));
        console.log('Игра сохранена');
    } catch (error) {
        console.error('Ошибка сохранения:', error);
    }
}

function loadGame() {
    try {
        const savedData = localStorage.getItem(SAVE_KEY);
        if (!savedData) return;
        
        const data = JSON.parse(savedData);
        
        // Загружаем основные данные
        money = data.money || 0;
        warehouseStock = data.warehouseStock || 0;
        carry = data.carry || 0;
        carryMax = data.carryMax || 10;
        axeLevel = data.axeLevel || 0;
        capacityLevel = data.capacityLevel || 0;
        
        // Загружаем состояние деревьев
        if (data.trees && data.trees.length === trees.length) {
            const scene = game.scene.scenes[0];
            
            data.trees.forEach((treeData, index) => {
                if (index < trees.length) {
                    trees[index].alive = treeData.alive;
                    trees[index].regenTimer = treeData.regenTimer || 0;
                    
                    if (!treeData.alive) {
                        // Дерево срублено - показываем пенек
                        if (trees[index].crown) {
                            trees[index].crown.destroy();
                            trees[index].crown = null;
                        }
                        if (!trees[index].stump && scene) {
                            trees[index].stump = scene.add.circle(
                                treeData.x || trees[index].x,
                                treeData.y || trees[index].y,
                                TREE_RADIUS * 0.5,
                                0x8b4513
                            ).setDepth(2);
                        }
                    }
                }
            });
        }
        
        console.log('Сохранение загружено');
    } catch (error) {
        console.error('Ошибка загрузки:', error);
    }
}

// ==================== АДАПТАЦИЯ ПОД РАЗНЫЕ УСТРОЙСТВА ====================
window.addEventListener('resize', () => {
    if (game && game.scale) {
        game.scale.resize(window.innerWidth, window.innerHeight);
    }
});