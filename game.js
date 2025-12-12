// game.js - МОНОТОННАЯ ТРАВА, ПТИЦА И ЦВЕТЫ КАК БЫЛИ

// ==================== КОНСТАНТЫ ====================
const CONFIG = {
    TREE_RADIUS: 32,
    PLAYER_SPEED: 120,
    CHOP_DURATION: 1000,
    SELL_INTERVAL: 10000,
    PRICE_PER_LOG: 3,
    TREE_REGEN_MS: 15000,
    SAVE_KEY: 'lumberjack_save',
    WAREHOUSE_MARGIN: 120, // Отступ от краев для склада
    FLOWERS_COUNT: 12,
    BIRD_SPEED: 60,
    MIN_TREE_DISTANCE_FROM_WAREHOUSE: 150 // Минимальное расстояние от склада до дерева
};

// ==================== СОСТОЯНИЕ ====================
const Game = {
    player: null,
    target: null,
    trees: [],
    flowers: [],
    bird: null,
    birdDirection: 1,
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
    createTree(scene, x, y) {
        const mainCircle = scene.add.circle(0, 0, CONFIG.TREE_RADIUS, 0x2e8b57);
        mainCircle.setStrokeStyle(2, 0x1e5b3f);
        mainCircle.setOrigin(0.5, 0.5);
        
        const volumeCircle = scene.add.circle(0, 0, CONFIG.TREE_RADIUS * 0.7, 0x3cb371);
        volumeCircle.setStrokeStyle(1, 0x2e8b57);
        volumeCircle.setOrigin(0.5, 0.5);
        
        const treeContainer = scene.add.container(x, y, [mainCircle, volumeCircle]);
        
        return {
            container: treeContainer,
            mainCircle: mainCircle,
            volumeCircle: volumeCircle,
            stump: null,
            x: x,
            y: y,
            alive: true,
            regenTimer: 0
        };
    },
    
    createStump(scene, x, y) {
        const stump = scene.add.circle(0, 0, CONFIG.TREE_RADIUS * 0.5, 0x8b4513);
        stump.setStrokeStyle(1, 0x5d2906);
        stump.setOrigin(0.5, 0.5);
        
        const stumpContainer = scene.add.container(x, y, [stump]);
        
        return {
            container: stumpContainer,
            circle: stump
        };
    }
};

// ==================== ДЕКОРАЦИИ (ПТИЦА И ЦВЕТЫ КАК БЫЛИ) ====================
const Decorations = {
    // Цветы как были (с лепестками и стеблями)
    createFlowers(scene, width, height) {
        const flowers = [];
        const flowerColors = [0xFF69B4, 0xFFD700, 0x87CEEB, 0x98FB98, 0xDDA0DD];
        
        for (let i = 0; i < CONFIG.FLOWERS_COUNT; i++) {
            let x, y, validPosition;
            
            do {
                validPosition = true;
                x = 50 + Math.random() * (width - 100);
                y = 50 + Math.random() * (height - 100);
                
                if (Game.trees.length > 0) {
                    for (const tree of Game.trees) {
                        const dist = Phaser.Math.Distance.Between(x, y, tree.x, tree.y);
                        if (dist < CONFIG.TREE_RADIUS * 2) {
                            validPosition = false;
                            break;
                        }
                    }
                }
                
                if (window.warehouse) {
                    const dist = Phaser.Math.Distance.Between(x, y, window.warehouse.x, window.warehouse.y);
                    if (dist < 100) validPosition = false;
                }
                
            } while (!validPosition);
            
            // Центр цветка
            const color = flowerColors[Math.floor(Math.random() * flowerColors.length)];
            const center = scene.add.circle(x, y, 3, color);
            
            // Лепестки (4-6 штук)
            const petals = [];
            const petalCount = 4 + Math.floor(Math.random() * 3);
            
            for (let p = 0; p < petalCount; p++) {
                const angle = (p / petalCount) * Math.PI * 2;
                const px = x + Math.cos(angle) * 8;
                const py = y + Math.sin(angle) * 8;
                const petal = scene.add.circle(px, py, 4, color);
                petals.push(petal);
            }
            
            // Стебель
            const stemLength = 10 + Math.random() * 15;
            const stem = scene.add.rectangle(x, y + stemLength/2, 2, stemLength, 0x228B22);
            stem.setOrigin(0.5, 1);
            
            flowers.push({
                center: center,
                petals: petals,
                stem: stem,
                x: x,
                y: y
            });
        }
        
        return flowers;
    },
    
    // Птичка как была (с телом, головой, клювом, глазом, крылом)
    createBird(scene, width, height) {
        // Тело птички
        const body = scene.add.circle(0, 0, 6, 0x8B4513);
        
        // Голова
        const head = scene.add.circle(8, -3, 4, 0x8B4513);
        
        // Клюв
        const beak = scene.add.triangle(12, -3, 0, 0, 6, 2, 0, 4, 0xFFA500);
        
        // Глаз
        const eye = scene.add.circle(9, -4, 1, 0x000000);
        
        // Крыло
        const wing = scene.add.ellipse(-4, 4, 10, 6, 0x8B4513);
        
        // Контейнер для птички
        const birdContainer = scene.add.container(-50, height * 0.2, [body, head, beak, eye, wing]);
        
        return birdContainer;
    },
    
    // Обновление птички (полет с анимацией крыльев)
    updateBird(bird, delta, width) {
        if (!bird) return;
        
        bird.x += CONFIG.BIRD_SPEED * Game.birdDirection * (delta / 1000);
        
        // Анимация крыльев (покачивание)
        if (bird.list[4]) { // крыло
            bird.list[4].scaleY = 0.8 + 0.2 * Math.sin(Date.now() / 200);
        }
        
        // Разворот при достижении края
        if (bird.x > width + 50) {
            bird.x = width + 50;
            Game.birdDirection = -1;
            bird.scaleX = -1; // отражаем по горизонтали
        } else if (bird.x < -50) {
            bird.x = -50;
            Game.birdDirection = 1;
            bird.scaleX = 1; // нормальное отображение
        }
        
        // Легкое покачивание по вертикали
        bird.y += Math.sin(Date.now() / 500) * 0.5;
    }
};

// ==================== УПРАВЛЕНИЕ ДЕРЕВЬЯМИ ====================
const TreeManager = {
    getTreePositions(width, height, warehousePos) {
        const positions = [];
        const attemptsPerTree = 20; // Попыток разместить каждое дерево
        
        // Зоны, где нельзя размещать деревья (вокруг склада)
        const noTreeZones = [];
        if (warehousePos) {
            noTreeZones.push({
                x: warehousePos.x,
                y: warehousePos.y,
                radius: CONFIG.MIN_TREE_DISTANCE_FROM_WAREHOUSE
            });
        }
        
        // Функция проверки, можно ли разместить дерево в этой позиции
        function isValidPosition(x, y, existingPositions) {
            // Проверка на границы экрана
            if (x < 50 || x > width - 50 || y < 50 || y > height - 150) {
                return false;
            }
            
            // Проверка на расстояние от других деревьев
            for (const pos of existingPositions) {
                const dist = Phaser.Math.Distance.Between(x, y, pos.x, pos.y);
                if (dist < CONFIG.TREE_RADIUS * 3) {
                    return false;
                }
            }
            
            // Проверка на расстояние от запретных зон (склада)
            for (const zone of noTreeZones) {
                const dist = Phaser.Math.Distance.Between(x, y, zone.x, zone.y);
                if (dist < zone.radius) {
                    return false;
                }
            }
            
            return true;
        }
        
        // Пытаемся разместить 5 деревьев
        for (let i = 0; i < 5; i++) {
            let x, y;
            let foundPosition = false;
            
            for (let attempt = 0; attempt < attemptsPerTree; attempt++) {
                // Предпочтительные зоны для деревьев (левая и центральная часть экрана)
                if (attempt < 10) {
                    // Первые 10 попыток - предпочтительные зоны
                    const section = i % 3;
                    if (section === 0) {
                        // Левая верхняя часть
                        x = 50 + Math.random() * (width * 0.4);
                        y = 50 + Math.random() * (height * 0.4);
                    } else if (section === 1) {
                        // Левая нижняя часть
                        x = 50 + Math.random() * (width * 0.4);
                        y = height * 0.5 + Math.random() * (height * 0.4 - 100);
                    } else {
                        // Центральная часть
                        x = width * 0.3 + Math.random() * (width * 0.4);
                        y = 100 + Math.random() * (height * 0.6 - 150);
                    }
                } else {
                    // Случайные позиции
                    x = 50 + Math.random() * (width - 100);
                    y = 50 + Math.random() * (height - 200);
                }
                
                if (isValidPosition(x, y, positions)) {
                    positions.push({x: Math.floor(x), y: Math.floor(y)});
                    foundPosition = true;
                    break;
                }
            }
            
            // Если не нашли подходящую позицию, размещаем вручную с проверкой
            if (!foundPosition) {
                // Запасные позиции (смещенные влево от склада)
                const fallbackPositions = [
                    {x: width * 0.2, y: height * 0.2},
                    {x: width * 0.15, y: height * 0.6},
                    {x: width * 0.25, y: height * 0.4},
                    {x: width * 0.35, y: height * 0.3},
                    {x: width * 0.15, y: height * 0.3}
                ];
                
                // Используем запасные позиции, отодвигая их от склада если нужно
                const pos = fallbackPositions[i];
                let adjustedX = pos.x;
                let adjustedY = pos.y;
                
                // Если склад существует, отодвигаем дерево дальше от него
                if (warehousePos) {
                    const distToWarehouse = Phaser.Math.Distance.Between(adjustedX, adjustedY, warehousePos.x, warehousePos.y);
                    if (distToWarehouse < CONFIG.MIN_TREE_DISTANCE_FROM_WAREHOUSE) {
                        // Сдвигаем дерево влево и/или вверх
                        adjustedX = Math.max(50, adjustedX - (CONFIG.MIN_TREE_DISTANCE_FROM_WAREHOUSE - distToWarehouse));
                        if (warehousePos.y < height / 2) {
                            // Склад в верхней части, сдвигаем дерево вниз
                            adjustedY = Math.min(height - 150, adjustedY + 50);
                        }
                    }
                }
                
                positions.push({x: Math.floor(adjustedX), y: Math.floor(adjustedY)});
            }
        }
        
        return positions;
    },
    
    createTree(scene, x, y) {
        return TreeGraphics.createTree(scene, x, y);
    },
    
    chopTree(tree, scene) {
        if (!tree.alive) return;
        
        tree.container.destroy();
        tree.mainCircle.destroy();
        tree.volumeCircle.destroy();
        
        tree.stump = TreeGraphics.createStump(scene, tree.x, tree.y);
        tree.alive = false;
        tree.regenTimer = CONFIG.TREE_REGEN_MS;
        tree.container = null;
        tree.mainCircle = null;
        tree.volumeCircle = null;
    },
    
    restoreTree(tree, scene) {
        if (tree.alive) return;
        
        if (tree.stump) {
            tree.stump.container.destroy();
            tree.stump.circle.destroy();
            tree.stump = null;
        }
        
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
        
        const bg = scene.add.rectangle(width/2, height/2, 400, 300, 0xffffff)
            .setStrokeStyle(3, 0x8b4513).setDepth(20);
        
        const title = scene.add.text(width/2, height/2 - 100, 'УЛУЧШЕНИЯ', {
            font: '22px Arial', fill: '#8b4513', fontWeight: 'bold'
        }).setOrigin(0.5).setDepth(21);
        
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
                        tree.container?.destroy();
                        tree.mainCircle?.destroy();
                        tree.volumeCircle?.destroy();
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
    backgroundColor: '#b7e0a6', // МОНОТОННАЯ ТРАВА КАК В НАЧАЛЕ
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
    
    if (window.Telegram?.WebApp) {
        Telegram.WebApp.ready();
        Telegram.WebApp.expand();
        Telegram.WebApp.setHeaderColor('#b7e0a6');
        Telegram.WebApp.BackButton?.hide();
    }
    
    // Сначала создаем склад, чтобы знать его позицию для размещения деревьев
    const whX = width - CONFIG.WAREHOUSE_MARGIN;
    const whY = height - CONFIG.WAREHOUSE_MARGIN;
    
    // Основной прямоугольник склада
    const warehouseRect = scene.add.rectangle(whX, whY, 140, 80, 0xaaaaaa)
        .setOrigin(0.5).setStrokeStyle(2, 0x666666);
    
    // Крыша склада
    const roof = scene.add.triangle(whX, whY - 45, 0, 0, 70, 0, 35, -25, 0x8b4513);
    
    // Дверь
    const door = scene.add.rectangle(whX, whY + 10, 40, 50, 0x5d2906)
        .setStrokeStyle(2, 0x3a1803);
    
    // Табличка "Склад"
    const sign = scene.add.text(whX, whY - 55, 'Склад', {
        font: '16px Arial', fill: '#ffffff',
        backgroundColor: 'rgba(139, 69, 19, 0.9)',
        padding: {x: 10, y: 5}
    }).setOrigin(0.5);
    
    window.warehouse = {x: whX, y: whY};
    
    // Игрок
    Game.player = scene.add.circle(width/2, height/2, 16, 0x3333ff);
    Game.player.setOrigin(0.5, 0.5);
    
    // Деревья - теперь позиции вычисляются с учетом склада
    const warehousePos = {x: whX, y: whY};
    const positions = TreeManager.getTreePositions(width, height, warehousePos);
    Game.trees = positions.map(pos => TreeManager.createTree(scene, pos.x, pos.y));
    
    // Цветы (как были)
    Game.flowers = Decorations.createFlowers(scene, width, height);
    
    // Птичка (как была)
    Game.bird = Decorations.createBird(scene, width, height);
    Game.bird.setDepth(5);
    
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
    
    // Птичка
    Decorations.updateBird(Game.bird, delta, scene.scale.width);
    
    // Движение игрока
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

window.addEventListener('resize', () => {
    game.scale?.resize(window.innerWidth, window.innerHeight);
});