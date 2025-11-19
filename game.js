// Matter.js module aliases
const Engine = Matter.Engine;
const Render = Matter.Render;
const Runner = Matter.Runner;
const Bodies = Matter.Bodies;
const Body = Matter.Body;
const Composite = Matter.Composite;
const Constraint = Matter.Constraint;
const Mouse = Matter.Mouse;
const MouseConstraint = Matter.MouseConstraint;
const Events = Matter.Events;

// Game class
class UrbanStepsGame {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.canvas.width = 1400;
        this.canvas.height = 600;

        this.engine = null;
        this.world = null;
        this.runner = null;
        this.mouseConstraint = null;

        this.selectedShoe = null;
        this.gameState = 'selection'; // selection, playing, gameover, win

        this.leftLeg = null;
        this.rightLeg = null;

        this.finishLine = 1250;
        this.fallDetected = false;
        this.hasWon = false;

        this.noiseOffset = 0;
    }

    selectShoe(type) {
        this.selectedShoe = type;
        document.getElementById('shoe-selection').classList.add('hidden');
        document.getElementById('instructions').classList.remove('hidden');
        this.startGame();
    }

    startGame() {
        this.gameState = 'playing';
        this.fallDetected = false;
        this.hasWon = false;

        // Initialize physics engine
        this.engine = Engine.create({
            gravity: { x: 0, y: 1.5 }
        });
        this.world = this.engine.world;

        // Create ground
        const ground = Bodies.rectangle(700, 580, 1600, 40, {
            isStatic: true,
            friction: 0.8,
            label: 'ground'
        });
        Composite.add(this.world, ground);

        // Create legs
        this.createLeg('left', 300);
        this.createLeg('right', 400);

        // Setup mouse control
        this.setupMouseControl();

        // Start physics engine
        this.runner = Runner.create();
        Runner.run(this.runner, this.engine);

        // Start render loop
        this.animate();

        // Check for falls and wins
        Events.on(this.engine, 'afterUpdate', () => {
            this.checkGameConditions();
        });
    }

    createLeg(side, startX) {
        const isLeft = side === 'left';
        const legData = {
            side: side,
            bodies: {}
        };

        // Shoe properties based on selection
        let shoeWidth, shoeHeight, shoeFriction, shoeRestitution;

        if (this.selectedShoe === 'sneaker') {
            shoeWidth = 100;
            shoeHeight = 40;
            shoeFriction = 0.9;
            shoeRestitution = 0.1;
        } else { // heel
            shoeWidth = 80;
            shoeHeight = 100;
            shoeFriction = 0.3;
            shoeRestitution = 0.3;
        }

        // Create foot/shoe body
        const foot = Bodies.rectangle(startX, 450, shoeWidth, shoeHeight, {
            friction: shoeFriction,
            restitution: shoeRestitution,
            density: 0.01,
            label: `${side}-foot`
        });

        // Create ankle joint (small circle)
        const ankle = Bodies.circle(startX, 420, 15, {
            friction: 0.5,
            density: 0.005,
            label: `${side}-ankle`
        });

        // Create calf/lower leg
        const calf = Bodies.rectangle(startX, 350, 40, 120, {
            friction: 0.5,
            density: 0.008,
            label: `${side}-calf`
        });

        // Add bodies to world
        Composite.add(this.world, [foot, ankle, calf]);

        // Create constraints to connect leg parts
        const ankleToFoot = Constraint.create({
            bodyA: ankle,
            bodyB: foot,
            length: 40,
            stiffness: 0.9,
            damping: 0.1
        });

        const calfToAnkle = Constraint.create({
            bodyA: calf,
            bodyB: ankle,
            length: 70,
            stiffness: 0.8,
            damping: 0.1
        });

        // Add angle limits (anatomical constraints)
        Events.on(this.engine, 'beforeUpdate', () => {
            // Limit rotation
            if (Math.abs(foot.angle) > Math.PI / 3) {
                Body.setAngle(foot, Math.sign(foot.angle) * Math.PI / 3);
            }
            if (Math.abs(calf.angle) > Math.PI / 4) {
                Body.setAngle(calf, Math.sign(calf.angle) * Math.PI / 4);
            }
        });

        Composite.add(this.world, [ankleToFoot, calfToAnkle]);

        legData.bodies = { foot, ankle, calf };
        legData.constraints = { ankleToFoot, calfToAnkle };

        if (isLeft) {
            this.leftLeg = legData;
        } else {
            this.rightLeg = legData;
        }
    }

    setupMouseControl() {
        const mouse = Mouse.create(this.canvas);
        this.mouseConstraint = MouseConstraint.create(this.engine, {
            mouse: mouse,
            constraint: {
                stiffness: 0.2,
                damping: 0.1,
                render: { visible: false }
            }
        });

        Composite.add(this.world, this.mouseConstraint);

        // Keep mouse in sync with rendering
        Events.on(this.mouseConstraint, 'mousedown', () => {
            const body = this.mouseConstraint.body;
            if (body && (body.label.includes('foot') || body.label.includes('ankle'))) {
                this.mouseConstraint.constraint.stiffness = 0.3;
            }
        });
    }

    checkGameConditions() {
        if (this.gameState !== 'playing') return;

        // Check both legs
        const legs = [this.leftLeg, this.rightLeg];

        for (let leg of legs) {
            const { foot, ankle, calf } = leg.bodies;

            // Fail condition 1: Ankle touches ground (y > threshold)
            if (ankle.position.y > 520) {
                this.triggerFall('ankle');
                return;
            }

            // Fail condition 2: Leg rotates too much (parallel to ground)
            const calfAngle = Math.abs(calf.angle);
            if (calfAngle > Math.PI / 2.5) {
                this.triggerFall('rotation');
                return;
            }

            // Special fail for heels: foot tips over too much
            if (this.selectedShoe === 'heel') {
                const footAngle = Math.abs(foot.angle);
                if (footAngle > Math.PI / 4) {
                    this.triggerFall('tipped');
                    return;
                }
            }

            // Win condition: Both feet cross finish line
            if (foot.position.x > this.finishLine && !this.hasWon) {
                this.checkWinCondition();
            }
        }
    }

    checkWinCondition() {
        const leftFoot = this.leftLeg.bodies.foot;
        const rightFoot = this.rightLeg.bodies.foot;

        if (leftFoot.position.x > this.finishLine && rightFoot.position.x > this.finishLine) {
            this.hasWon = true;
            setTimeout(() => {
                this.triggerWin();
            }, 500);
        }
    }

    triggerFall(reason) {
        if (this.fallDetected) return;
        this.fallDetected = true;
        this.gameState = 'gameover';

        // Red flash effect
        this.ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        setTimeout(() => {
            document.getElementById('instructions').classList.add('hidden');
            const gameOver = document.getElementById('game-over');
            const title = document.getElementById('result-title');
            const message = document.getElementById('result-message');

            if (reason === 'ankle') {
                title.textContent = 'Painful Fall!';
                message.textContent = 'Your ankle touched the ground!';
            } else if (reason === 'rotation') {
                title.textContent = 'Lost Balance!';
                message.textContent = 'Your leg collapsed!';
            } else if (reason === 'tipped') {
                title.textContent = 'Twisted Ankle!';
                message.textContent = 'The heel gave way!';
            }

            gameOver.classList.remove('hidden');
        }, 300);
    }

    triggerWin() {
        this.gameState = 'win';
        document.getElementById('instructions').classList.add('hidden');
        document.getElementById('game-win').classList.remove('hidden');
    }

    restart() {
        // Clean up
        if (this.runner) {
            Runner.stop(this.runner);
        }
        if (this.engine) {
            Engine.clear(this.engine);
        }

        // Hide overlays
        document.getElementById('game-over').classList.add('hidden');
        document.getElementById('game-win').classList.add('hidden');
        document.getElementById('shoe-selection').classList.remove('hidden');
        document.getElementById('instructions').classList.add('hidden');

        // Reset state
        this.gameState = 'selection';
        this.selectedShoe = null;
        this.leftLeg = null;
        this.rightLeg = null;
        this.fallDetected = false;
        this.hasWon = false;
    }

    // Rendering functions with realistic graphics
    animate() {
        if (this.gameState !== 'playing') return;

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw environment
        this.drawEnvironment();

        // Draw legs
        if (this.leftLeg) this.drawLeg(this.leftLeg);
        if (this.rightLeg) this.drawLeg(this.rightLeg);

        // Draw finish line
        this.drawFinishLine();

        requestAnimationFrame(() => this.animate());
    }

    drawEnvironment() {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;

        // Sky gradient
        const skyGradient = ctx.createLinearGradient(0, 0, 0, h * 0.6);
        skyGradient.addColorStop(0, '#87CEEB');
        skyGradient.addColorStop(1, '#E0F6FF');
        ctx.fillStyle = skyGradient;
        ctx.fillRect(0, 0, w, h * 0.6);

        // Asphalt road
        const roadGradient = ctx.createLinearGradient(0, h * 0.6, 0, h);
        roadGradient.addColorStop(0, '#4a4a4a');
        roadGradient.addColorStop(0.5, '#3a3a3a');
        roadGradient.addColorStop(1, '#2a2a2a');
        ctx.fillStyle = roadGradient;
        ctx.fillRect(0, h * 0.6, w, h * 0.4);

        // Road texture (noise)
        this.noiseOffset += 0.001;
        for (let i = 0; i < 200; i++) {
            const x = Math.random() * w;
            const y = h * 0.6 + Math.random() * (h * 0.4);
            const size = Math.random() * 2;
            const opacity = Math.random() * 0.1;
            ctx.fillStyle = `rgba(${Math.random() > 0.5 ? 60 : 50}, ${Math.random() > 0.5 ? 60 : 50}, ${Math.random() > 0.5 ? 60 : 50}, ${opacity})`;
            ctx.fillRect(x, y, size, size);
        }

        // Road markings (white lines with wear)
        ctx.strokeStyle = 'rgba(220, 220, 220, 0.6)';
        ctx.lineWidth = 3;
        ctx.setLineDash([20, 10]);
        ctx.beginPath();
        ctx.moveTo(0, h * 0.75);
        ctx.lineTo(w, h * 0.75);
        ctx.stroke();
        ctx.setLineDash([]);

        // Oil stains
        ctx.fillStyle = 'rgba(20, 20, 30, 0.4)';
        ctx.beginPath();
        ctx.ellipse(300, 480, 40, 25, 0.3, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.ellipse(800, 500, 50, 30, -0.2, 0, Math.PI * 2);
        ctx.fill();

        // Shadows beneath feet area (simulating sun)
        ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
        ctx.shadowBlur = 15;
        ctx.shadowOffsetY = 5;
    }

    drawLeg(legData) {
        const { foot, ankle, calf } = legData.bodies;
        const ctx = this.ctx;

        // Save context
        ctx.save();

        // Draw calf (lower leg)
        ctx.translate(calf.position.x, calf.position.y);
        ctx.rotate(calf.angle);

        const legGradient = ctx.createLinearGradient(-20, 0, 20, 0);
        legGradient.addColorStop(0, '#E8C4A0');
        legGradient.addColorStop(0.5, '#D4A574');
        legGradient.addColorStop(1, '#C08F5C');

        ctx.fillStyle = legGradient;
        ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
        ctx.shadowBlur = 10;
        ctx.shadowOffsetX = 3;
        ctx.shadowOffsetY = 3;
        ctx.fillRect(-20, -60, 40, 120);

        // Highlight on leg
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.fillRect(-15, -50, 10, 100);

        ctx.restore();

        // Draw ankle
        ctx.save();
        ctx.translate(ankle.position.x, ankle.position.y);
        ctx.rotate(ankle.angle);

        ctx.fillStyle = '#D4A574';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 15, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();

        // Draw foot/shoe
        ctx.save();
        ctx.translate(foot.position.x, foot.position.y);
        ctx.rotate(foot.angle);

        if (this.selectedShoe === 'sneaker') {
            this.drawSneaker(ctx);
        } else {
            this.drawHeel(ctx);
        }

        ctx.restore();
    }

    drawSneaker(ctx) {
        // Chunky sneaker with realistic shading
        const shoeGradient = ctx.createLinearGradient(-50, -20, -50, 20);
        shoeGradient.addColorStop(0, '#444');
        shoeGradient.addColorStop(0.5, '#222');
        shoeGradient.addColorStop(1, '#111');

        ctx.fillStyle = shoeGradient;
        ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
        ctx.shadowBlur = 15;
        ctx.shadowOffsetX = 5;
        ctx.shadowOffsetY = 8;

        // Main shoe body
        ctx.beginPath();
        ctx.moveTo(-50, -15);
        ctx.lineTo(40, -15);
        ctx.quadraticCurveTo(50, -15, 50, -5);
        ctx.lineTo(50, 15);
        ctx.quadraticCurveTo(50, 20, 40, 20);
        ctx.lineTo(-50, 20);
        ctx.quadraticCurveTo(-55, 15, -50, -15);
        ctx.closePath();
        ctx.fill();

        // Rubber sole
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(-50, 15, 100, 5);

        // Highlight
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.beginPath();
        ctx.ellipse(-20, -5, 15, 8, 0, 0, Math.PI * 2);
        ctx.fill();

        // White swoosh/stripe
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-30, -5);
        ctx.quadraticCurveTo(0, -10, 20, 0);
        ctx.stroke();

        ctx.shadowColor = 'transparent';
    }

    drawHeel(ctx) {
        // Stiletto heel with glossy effect
        const heelGradient = ctx.createLinearGradient(-40, -50, -40, 50);
        heelGradient.addColorStop(0, '#DC143C');
        heelGradient.addColorStop(0.5, '#8B0000');
        heelGradient.addColorStop(1, '#5a0000');

        ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
        ctx.shadowBlur = 20;
        ctx.shadowOffsetX = 4;
        ctx.shadowOffsetY = 10;

        // Heel (thin point)
        ctx.fillStyle = '#2a2a2a';
        ctx.beginPath();
        ctx.moveTo(-10, 30);
        ctx.lineTo(-5, 50);
        ctx.lineTo(5, 50);
        ctx.lineTo(10, 30);
        ctx.closePath();
        ctx.fill();

        // Shoe body
        ctx.fillStyle = heelGradient;
        ctx.beginPath();
        ctx.moveTo(-40, -30);
        ctx.lineTo(30, -35);
        ctx.quadraticCurveTo(40, -35, 40, -25);
        ctx.lineTo(40, -10);
        ctx.lineTo(15, 30);
        ctx.lineTo(-15, 30);
        ctx.lineTo(-40, -10);
        ctx.closePath();
        ctx.fill();

        // Glossy highlight (patent leather)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.beginPath();
        ctx.ellipse(-10, -20, 20, 12, -0.2, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.beginPath();
        ctx.ellipse(10, -15, 15, 8, 0.3, 0, Math.PI * 2);
        ctx.fill();

        ctx.shadowColor = 'transparent';
    }

    drawFinishLine() {
        const ctx = this.ctx;
        const x = this.finishLine;

        // Checkered pattern
        ctx.fillStyle = '#fff';
        ctx.fillRect(x, 0, 20, this.canvas.height);

        ctx.fillStyle = '#000';
        for (let y = 0; y < this.canvas.height; y += 40) {
            ctx.fillRect(x, y, 20, 20);
        }

        // Label
        ctx.fillStyle = '#000';
        ctx.font = 'bold 24px Arial';
        ctx.fillText('FINISH', x - 30, 50);
    }
}

// Initialize game
const game = new UrbanStepsGame();
