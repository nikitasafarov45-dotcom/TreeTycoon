// game.js - ДЕРЕВЬЯ С ОБЪЕМОМ, ПЕНЬКИ НЕ СМЕЩАЮТСЯ

// ==================== КОНСТАНТЫ ====================
const CONFIG = {
    TREE_RADIUS: 32,           // Увеличил диаметр
    PLAYER_SPEED: 120,
    CHOP_DURATION: 1000,
    SELL_INTERVAL: 10000,
    PRICE_PER_LOG: 10,
    TREE_REGEN_MS: 15000,
    SAVE_KEY: 'lumberjack_save',
    WAREHOUSE_Y: 100
};

// ==================== СОСТОЯНИЕ ====================
const Game = {
    player: null,
    target: null,
    trees: [],
    carry: 0,
    carryMax: 10,
    warehouse: 0,
    money: 0,
    chopping: false,
    chopProgress: 0,
    axeLevel: 0,
    capacityLevel: 0,
    shopOpen: false,
    shopGroup: []
};

// ==================== ГРАФИКА ДЕРЕВЬЕВ ====================
const TreeGraphics = {
    // Создание дерева с объемом (два круга)
    createTree(scene, x, y) {
        // Основной круг (большой)
        const mainCircle = scene.add.circle(0, 0, CONFIG.TREE_RADIUS, 0x2e8b57);
        mainCircle.setStrokeStyle(2, 0x1e5b3f);
        mainCircle.setOrigin(0.5, 0.5);
        
        // Второй круг поменьше для объема
        const volumeCircle = scene.add.circle(0, 0, CONFIG.TREE_RADIUS * 0.7, 0x3cb371);
        volumeCircle.setStrokeStyle(1, 0x2e8b57);
        volumeCircle.setOrigin(0.5, 0.5);
        
        // Группируем оба круга
        const treeGroup = scene.add.container(x, y, [mainCircle, volumeCircle]);
        
        return {
            container: treeGroup,
            mainCircle: mainCircle,
            volumeCircle: volumeCircle,
            stump: null,
            x: x,
            y: y,
            alive: true,
            regenTimer: 0
        };
    },
    
    // Создание пенька
    createStump(scene, x, y) {
        const stump = scene.add.circle(0, 0, CONFIG.TREE_RADIUS * 0.5, 0x8b4513);
        stump.setStrokeStyle(1, 0x5d2906);
        stump.setOrigin(0.5, 0.5);
        
        // Создаем контейнер для точного позиционирования
        const stumpContainer = scene.add.container(x, y, [stump]);
        
        return {
            container: stumpContainer,
            circle: stump
        };
    },
    
    // Уничтожение дерева
    destroyTree(tree) {
        if (tree.container) {
            tree.container.destroy();
        }
        if (tree.mainCircle) {
            tree.mainCircle.destroy();
        }
        if (tree.volumeCircle) {
            tree.volumeCircle.destroy();
        }
    },
    
    // Уничтожение пенька
    destroyStump(stump) {
        if (stump.container) {
            stump.container.destroy();
        }
        if (stump.circle) {
            stump.circle.destroy();
        }
    }
};

// ==================== УПРАВЛЕНИЕ ДЕРЕВЬЯМИ ====================
const TreeManager = {
    getTreePositions(width, height) {
        return [
            {x: Math.floor(width * 0.2), y: Math.floor(height * 0.2)},
            {x: Math.floor(width * 0.15), y: Math.floor(height * 0.7)},
            {x: Math.floor(width * 0.6), y: Math.floor(height * 0.45)},
            {x: Math.floor(width * 0.8), y: Math.floor(height * 0.75)},
            {x: Math.floor(width * 0.35), y: Math.floor(height * 0.3)}
        ];
    },
    
    createTree(scene, x, y) {
        return TreeGraphics.createTree(scene, x, y);
    },
    
    chopTree(tree, scene) {
        if (!tree.alive) return;
        
        // Уничтожаем дерево
        TreeGraphics.destroyTree(tree);
        
        // Создаем пенек на ТОЧНОЙ позиции
        tree.stump = TreeGraphics.createStump(scene, tree.x, tree.y);
        tree.alive = false;
        tree.regenTimer = CONFIG.TREE_REGEN_MS;
        tree.container = null;
        tree.mainCircle = null;
        tree.volumeCircle = null;
    },
    
    restoreTree(tree, scene) {
        if (tree.alive) return;
        
        // Уничтожаем пенек
        if (tree.stump) {
            TreeGraphics.destroyStump(tree.stump);
            tree.stump = null;
        }
        
        // Восстанавливаем дерево на ТОЧНОЙ позиции
        const newTree = TreeGraphics.createTree(scene, tree.x, tree.y);
        tree.container = newTree.container;
        tree.mainCircle = newTree.mainCircle;
        tree.volumeCircle = newTree.volumeCircle;
        tree.alive = true;
        tree.regenTimer = 0;
    }
};

// ==================== ИНТЕРФЕЙС ====================
const UI = {
    update() {
        try {
            document.getElementById('money').textContent = `💰 ${Game.money}`;
            document.getElementById('wood-storage').textContent = `🪵 ${Game.warehouse}`;
            document.getElementById('bottom-info').textContent = `Груз: ${Game.carry}/${Game.carryMax}`;
        } catch(e) {}
    }
};

// ==================== МАГАЗИН ====================
const Shop = {
    open(scene) {
        if (Game.shopOpen) return this.close();
        Game.shopOpen = true;
        
        const {width, height} = scene.scale;
        
        // Фон
        const bg = scene.add.rectangle(width/2, height/2, 400, 300, 0xffffff)
            .setStrokeStyle(3, 0x8b4513).setDepth(20);
        
        // Заголовок
        const title = scene.add.text(width/2, height/2 - 100, 'УЛУЧШЕНИЯ', {
            font: '22px Arial', fill: '#8b4513', fontWeight: 'bold'
        }).setOrigin(0.5).setDepth(21);
        
        // Улучшения
        const axePrice = Math.floor(50 * Math.pow(1.5, Game.axeLevel));
        const capPrice = Math.floor(100 * Math.pow(1.6, Game.capacityLevel));
        
        const axeBtn = scene.add.text(width/2, height/2 - 20, `Топор Lv${Game.axeLevel+1}\n${axePrice} монет`, {
            font: '16px Arial', fill: '#000', backgroundColor: '#d4a76a',
            padding: {x: 15, y: 10}, align: 'center'
        }).setOrigin(0.5).setInteractive().on('pointerdown', () => {
            if (Game.money >= axePrice) {
                Game.money -= axePrice;
                Game.axeLevel++;
                this.close();
                UI.update();
            }
        }).setDepth(21);
        
        const capBtn = scene.add.text(width/2, height/2 + 50, `Рюкзак Lv${Game.capacityLevel+1}\n${capPrice} монет`, {
            font: '16px Arial', fill: '#000', backgroundColor: '#d4a76a',
            padding: {x: 15, y: 10}, align: 'center'
        }).setOrigin(0.5).setInteractive().on('pointerdown', () => {
            if (Game.money >= capPrice) {
                Game.money -= capPrice;
                Game.capacityLevel++;
                Game.carryMax += 5;
                this.close();
                UI.update();
            }
        }).setDepth(21);
        
        // Закрыть
        const closeBtn = scene.add.text(width/2, height/2 + 120, 'ЗАКРЫТЬ', {
            font: '18px Arial', fill: '#fff', backgroundColor: '#8b4513',
            padding: {x: 20, y: 10}
        }).setOrigin(0.5).setInteractive().on('pointerdown', () => this.close()).setDepth(21);
        
        Game.shopGroup = [bg, title, axeBtn, capBtn, closeBtn];
    },
    
    close() {
        Game.shopGroup.forEach(obj => obj.destroy?.());
        Game.shopGroup = [];
        Game.shopOpen = false;
    }
};

// ==================== СОХРАНЕНИЕ ====================
const Save = {
    save() {
        try {
            const data = {
                money: Game.money,
                warehouse: Game.warehouse,
                carry: Game.carry,
                carryMax: Game.carryMax,
                axeLevel: Game.axeLevel,
                capacityLevel: Game.capacityLevel,
                trees: Game.trees.map(t => ({
                    x: t.x, y: t.y,
                    alive: t.alive,
                    regenTimer: t.regenTimer
                }))
            };
            localStorage.setItem(CONFIG.SAVE_KEY, JSON.stringify(data));
        } catch(e) {}
    },
    
    load(scene) {
        try {
            const data = JSON.parse(localStorage.getItem(CONFIG.SAVE_KEY));
            if (!data) return;
            
            Game.money = data.money || 0;
            Game.warehouse = data.warehouse || 0;
            Game.carry = data.carry || 0;
            Game.carryMax = data.carryMax || 10;
            Game.axeLevel = data.axeLevel || 0;
            Game.capacityLevel = data.capacityLevel || 0;
            
            if (data.trees?.length === Game.trees.length) {
                data.trees.forEach((tData, i) => {
                    const tree = Game.trees[i];
                    tree.alive = tData.alive;
                    tree.regenTimer = tData.regenTimer || 0;
                    
                    if (!tData.alive) {
                        TreeGraphics.destroyTree(tree);
                        tree.stump = TreeGraphics.createStump(scene, tData.x, tData.y);
                    }
                });
            }
        } catch(e) {}
    }
};

// ==================== ИГРА ====================
const game = new Phaser.Game({
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
});

// ==================== СЦЕНА ====================
function preload() {}

function create() {
    const scene = this;
    const {width, height} = scene.scale;
    
    // Telegram
    if (window.Telegram?.WebApp) {
        Telegram.WebApp.ready();
        Telegram.WebApp.expand();
        Telegram.WebApp.setHeaderColor('#b7e0a6');
        Telegram.WebApp.BackButton?.hide();
    }
    
    // Игрок
    Game.player = scene.add.circle(width/2, height/2, 16, 0x3333ff);
    Game.player.setOrigin(0.5, 0.5);
    
    // Деревья
    const positions = TreeManager.getTreePositions(width, height);
    Game.trees = positions.map(pos => TreeManager.createTree(scene, pos.x, pos.y));
    
    // Склад
    const whX = width - 80;
    const whY = CONFIG.WAREHOUSE_Y;
    
    scene.add.rectangle(whX, whY, 140, 80, 0xaaaaaa)
        .setOrigin(0.5).setStrokeStyle(2, 0x666666);
    
    scene.add.text(whX, whY - 12, 'Склад', {
        font: '16px Arial', fill: '#000',
        backgroundColor: 'rgba(255,255,255,0.8)',
        padding: {x: 10, y: 5}
    }).setOrigin(0.5);
    
    window.warehouse = {x: whX, y: whY};
    
    // Прогресс-бар
    Game.chopBarBg = scene.add.rectangle(0, 0, 120, 12, 0x000000)
        .setVisible(false).setOrigin(0.5).setDepth(10);
    Game.chopBar = scene.add.rectangle(0, 0, 0, 10, 0xff0000)
        .setVisible(false).setOrigin(0, 0.5).setDepth(11);
    
    // Клики
    scene.input.on('pointerdown', (pointer) => {
        const px = pointer.worldX, py = pointer.worldY;
        let nearest = null, minDist = Infinity;
        
        Game.trees.forEach(tree => {
            if (!tree.alive) return;
            const dist = Phaser.Math.Distance.Between(px, py, tree.x, tree.y);
            if (dist < minDist && dist <= 40) {
                minDist = dist;
                nearest = tree;
            }
        });
        
        Game.target = nearest ? 
            {x: nearest.x, y: nearest.y, tree: nearest} : 
            {x: px, y: py, tree: null};
    });
    
    // Таймеры
    scene.time.addEvent({
        delay: CONFIG.SELL_INTERVAL,
        loop: true,
        callback: () => {
            if (Game.warehouse > 0) {
                Game.money += Game.warehouse * CONFIG.PRICE_PER_LOG;
                Game.warehouse = 0;
                UI.update();
            }
        }
    });
    
    scene.time.addEvent({
        delay: 30000,
        loop: true,
        callback: Save.save
    });
    
    // Кнопка магазина
    document.getElementById('shop-btn')?.addEventListener('click', 
        () => Shop.open(scene));
    
    window.addEventListener('beforeunload', Save.save);
    
    // Загрузка
    Save.load(scene);
    UI.update();
}

function update(time, delta) {
    const scene = game.scene.scenes[0];
    if (!scene) return;
    
    // Движение
    if (!Game.chopping && Game.target) {
        const dx = Game.target.x - Game.player.x;
        const dy = Game.target.y - Game.player.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        
        if (dist < 4) {
            Game.target.x = Game.player.x;
            Game.target.y = Game.player.y;
        } else {
            const speed = CONFIG.PLAYER_SPEED * (delta/1000);
            Game.player.x += (dx/dist) * speed;
            Game.player.y += (dy/dist) * speed;
        }
    }
    
    // Рубка
    if (!Game.chopping && Game.target?.tree) {
        const tree = Game.target.tree;
        const dist = Phaser.Math.Distance.Between(
            Game.player.x, Game.player.y, tree.x, tree.y
        );
        if (dist < 34 && tree.alive && Game.carry < Game.carryMax) {
            Game.chopping = true;
            Game.chopProgress = 0;
        }
    }
    
    // Процесс рубки
    if (Game.chopping) {
        const duration = CONFIG.CHOP_DURATION / (1 + 0.5 * Game.axeLevel);
        Game.chopProgress += delta;
        
        Game.player.scale = 1 + 0.05 * Math.sin(Game.chopProgress/100);
        
        Game.chopBarBg.setVisible(true);
        Game.chopBar.setVisible(true);
        Game.chopBarBg.x = Game.player.x;
        Game.chopBarBg.y = Game.player.y - 30;
        Game.chopBar.x = Game.player.x - 60;
        Game.chopBar.y = Game.player.y - 30;
        Game.chopBar.width = 120 * Math.min(1, Game.chopProgress/duration);
        
        // Завершение
        if (Game.chopProgress >= duration) {
            Game.carry = Math.min(Game.carryMax, Game.carry + 1);
            
            if (Game.target?.tree?.alive) {
                TreeManager.chopTree(Game.target.tree, scene);
            }
            
            Game.chopping = false;
            Game.chopProgress = 0;
            Game.player.scale = 1;
            
            if (Game.carry >= Game.carryMax) {
                Game.target.tree = null;
            }
            
            UI.update();
        }
    } else {
        Game.chopBarBg.setVisible(false);
        Game.chopBar.setVisible(false);
        Game.player.scale = 1;
    }
    
    // Регенерация
    Game.trees.forEach(tree => {
        if (!tree.alive && tree.regenTimer > 0) {
            tree.regenTimer -= delta;
            if (tree.regenTimer <= 0) {
                TreeManager.restoreTree(tree, scene);
            }
        }
    });
    
    // Склад
    if (window.warehouse) {
        const dist = Phaser.Math.Distance.Between(
            Game.player.x, Game.player.y,
            window.warehouse.x, window.warehouse.y
        );
        if (dist < 50 && Game.carry > 0) {
            Game.warehouse += Game.carry;
            Game.carry = 0;
            UI.update();
        }
    }
    
    // Авто-UI
    if (time % 500 < delta) UI.update();
}

// Ресайз
window.addEventListener('resize', () => {
    game.scale?.resize(window.innerWidth, window.innerHeight);
});