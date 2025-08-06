// Константы
const API_KEY = "A9P886A459EDF4PKBQFSACZMY";
const LAT = 55.75222;
const LON = 37.61556;

// Кэшированные DOM-элементы
const weatherContainer = document.getElementById("weather");
const frostOverlay = document.getElementById('frost-overlay');
const rainReflection = document.getElementById('rain-reflection');
const stormDarken = document.getElementById('storm-darken');
const cssCloudContainer = document.getElementById('css-clouds');

const conditionMap = Object.freeze({
    "clear-day": "Ясно",
    "clear-night": "Ясная ночь",
    "partly-cloudy-day": "Переменная облачность",
    "partly-cloudy-night": "Облачно ночью",
    "cloudy": "Пасмурно",
    "fog": "Туман",
    "rain": "Дождь",
    "snow": "Снег",
    "wind": "Ветрено",
    "hail": "Град",
    "thunderstorm": "Гроза",
    "showers-day": "Ливень",
    "showers-night": "Ночной ливень"
});

// Кэш для вычислений времени суток
const sunTimesCache = new Map();

function translateCondition(code, fallback) {
    return conditionMap[code] || fallback || code;
}

function getAnimationType(icon) {
    if (!icon) return null;
    icon = icon.toLowerCase();
    
    if (icon.includes('rain') || icon.includes('showers')) return 'rain';
    if (icon.includes('snow')) return 'snow';
    if (icon.includes('thunderstorm') || icon.includes('tstorm')) return 'thunderstorm';
    if (icon.includes('fog')) return 'fog';
    if (icon.includes('wind')) return 'wind';
    if (icon.includes('hail')) return 'hail';
    if (icon.includes('clear-day')) return 'clear-day';
    if (icon.includes('clear-night')) return 'clear-night';
    if (icon.includes('partly-cloudy')) return 'partly-cloudy';
    if (icon.includes('cloudy')) return 'cloudy';
    
    return null;
}

// Канвасы и контексты
const canvas = document.getElementById('weather-canvas');
const ctx = canvas.getContext('2d');
const bgCanvas = document.getElementById('background-canvas');
const bgCtx = bgCanvas.getContext('2d');

let width, height;
let animationId, bgAnimationId;
let weatherType = null;
let particles = [];
let lightningAlpha = 0;
let lightningTimer = 0;
let windParticles = [];
let fogParticles = [];
let stars = [];
let sunRays = [];
let hailParticles = [];
let time = 0;
let isPageVisible = true;

// Оптимизация производительности
let performanceMode = 'high';

// Определение производительности устройства
function detectPerformance() {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    
    if (!gl) {
        performanceMode = 'low';
        return;
    }

    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (debugInfo) {
        const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
        if (renderer.includes('Intel') || renderer.includes('Mali')) {
            performanceMode = 'medium';
        } else {
            performanceMode = 'high';
        }
    }

    if (/Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
        performanceMode = performanceMode === 'high' ? 'medium' : 'low';
    }
}

// Пауза анимаций при неактивной вкладке
document.addEventListener('visibilitychange', () => {
    isPageVisible = !document.hidden;
    if (!isPageVisible) {
        if (animationId) cancelAnimationFrame(animationId);
        if (bgAnimationId) cancelAnimationFrame(bgAnimationId);
    } else {
        animate();
        animateBackground();
    }
});

detectPerformance();

function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    
    canvas.width = width * devicePixelRatio;
    canvas.height = height * devicePixelRatio;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(devicePixelRatio, devicePixelRatio);
    
    bgCanvas.width = width * devicePixelRatio;
    bgCanvas.height = height * devicePixelRatio;
    bgCanvas.style.width = width + 'px';
    bgCanvas.style.height = height + 'px';
    bgCtx.setTransform(1, 0, 0, 1, 0, 0);
    bgCtx.scale(devicePixelRatio, devicePixelRatio);
}

window.addEventListener('resize', resize);
resize();

// Функция для вычисления времени заката и рассвета с кэшированием
function getSunTimes(lat, lon, date = new Date()) {
    const key = `${lat}-${lon}-${date.toDateString()}`;
    if (sunTimesCache.has(key)) {
        return sunTimesCache.get(key);
    }

    const dayOfYear = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 86400000);
    const P = Math.asin(0.39795 * Math.cos(0.98563 * (dayOfYear - 173) * Math.PI / 180));
    
    const argument = -Math.tan(lat * Math.PI / 180) * Math.tan(P);
    let hourAngle = Math.acos(Math.max(-1, Math.min(1, argument)));
    
    const decimalHours = 12 * (1 + hourAngle / Math.PI);
    const sunrise = 12 - decimalHours;
    const sunset = 12 + decimalHours;
    
    const result = { sunrise, sunset };
    sunTimesCache.set(key, result);
    return result;
}

// Умное определение времени суток
function isNightTime(weatherType = null) {
    const now = new Date();
    const hour = now.getHours();
    const minutes = now.getMinutes();
    const currentTime = hour + minutes / 60;
    
    const sunTimes = getSunTimes(LAT * Math.PI / 180, LON * Math.PI / 180);
    let sunrise = sunTimes.sunrise;
    let sunset = sunTimes.sunset;
    
    sunrise += 3;
    sunset += 3;
    
    if (weatherType && (weatherType.includes('cloudy') || weatherType.includes('rain') || 
                       weatherType.includes('thunderstorm') || weatherType.includes('fog'))) {
        sunset -= 0.5;
        sunrise += 0.5;
    }
    
    return currentTime < sunrise || currentTime > sunset;
}

// Оптимизированная функция updateBackground с объектом градиентов
const gradients = {
    'clear-day': {
        day: 'linear-gradient(135deg, #87CEEB 0%, #98D8E8 50%, #F0E68C 100%)',
        night: 'linear-gradient(135deg, #0F0F23 0%, #1a1a3e 50%, #2D1B69 100%)'
    },
    'clear-night': {
        night: 'linear-gradient(135deg, #0F0F23 0%, #1a1a3e 50%, #2D1B69 100%)'
    },
    'rain': {
        day: 'linear-gradient(135deg, #2C3E50 0%, #34495E 50%, #5D6D7E 100%)',
        night: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)'
    },
    'thunderstorm': {
        day: 'linear-gradient(135deg, #2C3E50 0%, #34495E 50%, #5D6D7E 100%)',
        night: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)'
    },
    'snow': {
        day: 'linear-gradient(135deg, #E8E8E8 0%, #D5D5D5 50%, #C0C0C0 100%)',
        night: 'linear-gradient(135deg, #2c3e50 0%, #34495e 50%, #5d6d7e 100%)'
    },
    'cloudy': {
        day: 'linear-gradient(135deg, #BDC3C7 0%, #95A5A6 50%, #7F8C8D 100%)',
        night: 'linear-gradient(135deg, #34495e 0%, #2c3e50 50%, #1a252f 100%)'
    },
    'fog': {
        day: 'linear-gradient(135deg, #D5DBDB 0%, #AEB6BF 50%, #85929E 100%)',
        night: 'linear-gradient(135deg, #2c3e50 0%, #34495e 50%, #5d6d7e 100%)'
    },
    'wind': {
        day: 'linear-gradient(135deg, #BDC3C7 0%, #95A5A6 50%, #7F8C8D 100%)',
        night: 'linear-gradient(135deg, #2c3e50 0%, #34495e 50%, #5d6d7e 100%)'
    },
    'hail': {
        day: 'linear-gradient(135deg, #85929E 0%, #AEB6BF 50%, #D5DBDB 100%)',
        night: 'linear-gradient(135deg, #1a252f 0%, #2c3e50 50%, #34495e 100%)'
    }
};

function updateBackground(weatherType, forceNight = null) {
    const isNight = forceNight !== null ? forceNight : isNightTime(weatherType);
    const timeOfDay = isNight ? 'night' : 'day';
    const gradient = gradients[weatherType]?.[timeOfDay] || gradients['clear-day'].day;

    document.body.style.background = `${gradient}, url('https://storage.yandexcloud.net/fotora.ru/uploads/870f953768ce9045.png') no-repeat center center fixed`;
    document.body.style.backgroundSize = 'cover';
    document.body.style.backgroundBlendMode = 'overlay';
}

// Звезды для ночного неба
class Star {
    constructor() {
        this.x = Math.random() * width;
        this.y = Math.random() * height * 0.6;
        this.size = Math.random() * 2 + 0.5;
        this.opacity = Math.random() * 0.8 + 0.2;
        this.twinkleSpeed = Math.random() * 0.02 + 0.01;
        this.twinkleOffset = Math.random() * Math.PI * 2;
    }

    update() {
        this.opacity = 0.3 + Math.sin(time * this.twinkleSpeed + this.twinkleOffset) * 0.5;
    }

    draw() {
        bgCtx.save();
        bgCtx.globalAlpha = Math.max(0, this.opacity);
        bgCtx.fillStyle = 'white';
        bgCtx.beginPath();
        bgCtx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        bgCtx.fill();
        
        // Крестообразное свечение
        bgCtx.strokeStyle = 'white';
        bgCtx.lineWidth = 0.5;
        bgCtx.beginPath();
        bgCtx.moveTo(this.x - this.size * 2, this.y);
        bgCtx.lineTo(this.x + this.size * 2, this.y);
        bgCtx.moveTo(this.x, this.y - this.size * 2);
        bgCtx.lineTo(this.x, this.y + this.size * 2);
        bgCtx.stroke();
        
        bgCtx.restore();
    }
}

// Солнечные лучи
class SunRay {
    constructor() {
        this.x = width * 0.8;
        this.y = height * 0.2;
        this.length = 100 + Math.random() * 200;
        this.angle = Math.random() * Math.PI * 2;
        this.opacity = 0.1 + Math.random() * 0.2;
        this.speed = 0.005 + Math.random() * 0.01;
    }

    update() {
        this.angle += this.speed;
    }

    draw() {
        bgCtx.save();
        bgCtx.globalAlpha = this.opacity;
        bgCtx.strokeStyle = '#FFD700';
        bgCtx.lineWidth = 2;
        bgCtx.lineCap = 'round';
        
        const endX = this.x + Math.cos(this.angle) * this.length;
        const endY = this.y + Math.sin(this.angle) * this.length;
        
        bgCtx.beginPath();
        bgCtx.moveTo(this.x, this.y);
        bgCtx.lineTo(endX, endY);
        bgCtx.stroke();
        bgCtx.restore();
    }
}

// Улучшенные классы частиц
class RainDrop {
    constructor() {
        this.reset();
        this.size = 0.5 + Math.random() * 1.5;
        this.wind = (Math.random() - 0.5) * 0.5;
    }

    reset() {
        this.x = Math.random() * (width + 200) - 100;
        this.y = Math.random() * -height - 100;
        this.length = 8 + Math.random() * 15;
        this.speed = 6 + Math.random() * 8;
        this.opacity = 0.3 + Math.random() * 0.4;
        this.angle = Math.PI / 2 + (Math.random() - 0.5) * 0.2;
    }

    update() {
        this.y += this.speed;
        this.x += this.wind + Math.sin(time * 0.01) * 0.5;
        
        if (this.y > height + 50) {
            this.reset();
        }
        if (this.x > width + 100 || this.x < -100) {
            this.x = Math.random() * (width + 200) - 100;
        }
    }

    draw() {
        ctx.save();
        ctx.globalAlpha = this.opacity;
        ctx.strokeStyle = '#aec2e0';
        ctx.lineWidth = this.size;
        ctx.lineCap = 'round';
        
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(
            this.x + Math.cos(this.angle) * this.length,
            this.y + Math.sin(this.angle) * this.length
        );
        ctx.stroke();
        ctx.restore();
    }
}

class SnowFlake {
    constructor() {
        this.reset();
        this.rotation = Math.random() * Math.PI * 2;
        this.rotationSpeed = (Math.random() - 0.5) * 0.02;
        this.swaySpeed = 0.01 + Math.random() * 0.02;
        this.swayAmount = 0.5 + Math.random() * 1;
    }

    reset() {
        this.x = Math.random() * (width + 200) - 100;
        this.y = Math.random() * -height - 100;
        this.radius = 1 + Math.random() * 3;
        this.speed = 0.5 + Math.random() * 2;
        this.opacity = 0.4 + Math.random() * 0.6;
        this.baseX = this.x;
    }

    update() {
        this.y += this.speed;
        this.rotation += this.rotationSpeed;
        this.x = this.baseX + Math.sin(this.y * this.swaySpeed) * this.swayAmount * 20;
        
        if (this.y > height + 50) {
            this.reset();
        }
        if (this.x > width + 100) {
            this.baseX -= width + 200;
        } else if (this.x < -100) {
            this.baseX += width + 200;
        }
    }

    draw() {
        ctx.save();
        ctx.globalAlpha = this.opacity;
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);
        
        ctx.fillStyle = 'white';
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 0.5;
        
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 0.3, 0, Math.PI * 2);
        ctx.fill();
        
        for (let i = 0; i < 6; i++) {
            ctx.save();
            ctx.rotate((Math.PI * 2 / 6) * i);
            
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(0, -this.radius);
            ctx.stroke();
            
            ctx.beginPath();
            ctx.moveTo(0, -this.radius * 0.7);
            ctx.lineTo(-this.radius * 0.2, -this.radius * 0.5);
            ctx.moveTo(0, -this.radius * 0.7);
            ctx.lineTo(this.radius * 0.2, -this.radius * 0.5);
            ctx.stroke();
            
            ctx.restore();
        }
        
        ctx.restore();
    }
}

// Новый класс для града
class HailStone {
    constructor() {
        this.reset();
        this.bounceHeight = 0;
        this.bouncing = false;
        this.bounceSpeed = 0;
    }

    reset() {
        this.x = Math.random() * width;
        this.y = Math.random() * -height - 100;
        this.size = 2 + Math.random() * 4;
        this.speed = 8 + Math.random() * 6;
        this.opacity = 0.7 + Math.random() * 0.3;
        this.rotation = 0;
        this.rotationSpeed = (Math.random() - 0.5) * 0.3;
        this.bouncing = false;
        this.bounceHeight = 0;
        this.bounceSpeed = 0;
    }

    update() {
        if (!this.bouncing) {
            this.y += this.speed;
            this.rotation += this.rotationSpeed;
            
            if (this.y > height - 20) {
                this.bouncing = true;
                this.bounceSpeed = -this.speed * 0.3;
                this.bounceHeight = this.y;
            }
        } else {
            this.bounceSpeed += 0.5; // гравитация
            this.y += this.bounceSpeed;
            
            if (this.y >= this.bounceHeight) {
                this.bounceSpeed *= -0.6; // затухание отскока
                if (Math.abs(this.bounceSpeed) < 1) {
                    this.reset();
                }
            }
        }
        
        if (this.y > height + 50) {
            this.reset();
        }
    }

    draw() {
        ctx.save();
        ctx.globalAlpha = this.opacity;
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);
        
        // Рисуем градину как многоугольник
        ctx.fillStyle = 'white';
        ctx.strokeStyle = '#E8E8E8';
        ctx.lineWidth = 1;
        
        ctx.beginPath();
        const sides = 6;
        for (let i = 0; i < sides; i++) {
            const angle = (i / sides) * Math.PI * 2;
            const x = Math.cos(angle) * this.size;
            const y = Math.sin(angle) * this.size;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        ctx.restore();
    }
}

class FogParticle {
    constructor() {
        this.reset();
        this.baseY = this.y;
        this.floatSpeed = 0.002 + Math.random() * 0.008;
    }

    reset() {
        this.x = Math.random() * (width + 400) - 200;
        this.y = height * 0.3 + Math.random() * height * 0.7;
        this.size = 30 + Math.random() * 80;
        this.opacity = 0.1 + Math.random() * 0.2;
        this.speed = 0.2 + Math.random() * 0.5;
    }

    update() {
        this.x -= this.speed;
        this.y = this.baseY + Math.sin(time * this.floatSpeed + this.x * 0.01) * 15;
        
        if (this.x < -this.size - 100) {
            this.x = width + this.size + Math.random() * 200;
        }
    }

    draw() {
        ctx.save();
        ctx.globalAlpha = this.opacity;
        
        const gradient = ctx.createRadialGradient(
            this.x, this.y, 0,
            this.x, this.y, this.size
        );
        gradient.addColorStop(0, 'rgba(200, 200, 200, 0.8)');
        gradient.addColorStop(1, 'rgba(200, 200, 200, 0)');
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
    }
}

class WindParticle {
    constructor() {
        this.reset();
        this.waveOffset = Math.random() * Math.PI * 2;
    }

    reset() {
        this.x = -50;
        this.y = Math.random() * height;
        this.length = 15 + Math.random() * 25;
        this.speed = 3 + Math.random() * 4;
        this.opacity = 0.1 + Math.random() * 0.2;
        this.baseY = this.y;
    }

    update() {
        this.x += this.speed;
        this.y = this.baseY + Math.sin(this.x * 0.01 + this.waveOffset) * 20;
        
        if (this.x > width + 50) {
            this.reset();
        }
    }

    draw() {
        ctx.save();
        ctx.globalAlpha = this.opacity;
        ctx.strokeStyle = 'rgba(220, 220, 220, 0.6)';
        ctx.lineWidth = 1;
        ctx.lineCap = 'round';
        
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.x + this.length, this.y);
        
        ctx.lineTo(this.x + this.length - 5, this.y - 3);
        ctx.moveTo(this.x + this.length, this.y);
        ctx.lineTo(this.x + this.length - 5, this.y + 3);
        
        ctx.stroke();
        ctx.restore();
    }
}

class Lightning {
    constructor() {
        this.reset();
    }

    reset() {
        this.startX = width * 0.2 + Math.random() * width * 0.6;
        this.startY = 0;
        this.segments = [];
        this.createSegments();
        this.opacity = 1;
        this.fadeSpeed = 0.1;
    }

    createSegments() {
        this.segments = [];
        let x = this.startX;
        let y = this.startY;
        const segmentCount = 8 + Math.floor(Math.random() * 12);
        
        for (let i = 0; i < segmentCount; i++) {
            const nextX = x + (Math.random() - 0.5) * 60;
            const nextY = y + (height / segmentCount) + Math.random() * 20;
            
            this.segments.push({
                x1: x, y1: y,
                x2: nextX, y2: nextY,
                thickness: 1 + Math.random() * 3
            });
            
            x = nextX;
            y = nextY;
        }
    }

    update() {
        this.opacity -= this.fadeSpeed;
        return this.opacity > 0;
    }

    draw() {
        ctx.save();
        ctx.globalAlpha = this.opacity;
        ctx.strokeStyle = 'white';
        ctx.lineCap = 'round';
        ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
        ctx.shadowBlur = 10;
        
        this.segments.forEach(segment => {
            ctx.lineWidth = segment.thickness;
            ctx.beginPath();
            ctx.moveTo(segment.x1, segment.y1);
            ctx.lineTo(segment.x2, segment.y2);
            ctx.stroke();
        });
        
        ctx.restore();
    }
}

let lightningBolts = [];

function getParticleCount(baseCount) {
    switch(performanceMode) {
        case 'low': return Math.floor(baseCount * 0.3);
        case 'medium': return Math.floor(baseCount * 0.6);
        case 'high': return baseCount;
        default: return baseCount;
    }
}

function startAnimation(type) {
    // Скрываем все анимации и сбрасываем классы
    canvas.style.display = 'none';
    cssCloudContainer.style.display = 'none';
    cssCloudContainer.className = 'css-clouds';

    weatherType = type;
    particles = [];
    windParticles = [];
    fogParticles = [];
    hailParticles = [];
    lightningBolts = [];
    stars = [];
    sunRays = [];
    lightningAlpha = 0;
    lightningTimer = 0;
    time = 0;

    // Определяем время суток умно
    const isNight = isNightTime(type);

    // Обновляем фон с учетом реального времени суток
    updateBackground(type);
    updateAtmosphereEffects(type);

    if (!weatherType) {
        if (animationId) cancelAnimationFrame(animationId);
        if (bgAnimationId) cancelAnimationFrame(bgAnimationId);
        ctx.clearRect(0, 0, width, height);
        bgCtx.clearRect(0, 0, width, height);
        return;
    }

    switch(weatherType) {
        case 'rain':
            canvas.style.display = 'block';
            for (let i = 0; i < getParticleCount(200); i++) {
                particles.push(new RainDrop());
            }
            break;
        case 'snow':
            canvas.style.display = 'block';
            for (let i = 0; i < getParticleCount(100); i++) {
                particles.push(new SnowFlake());
            }
            break;
        case 'partly-cloudy':
            cssCloudContainer.style.display = 'block';
            cssCloudContainer.className = 'css-clouds partly-cloudy';
            break;
        case 'cloudy':
            cssCloudContainer.style.display = 'block';
            cssCloudContainer.className = 'css-clouds full-cloudy';
            break;
        case 'fog':
            canvas.style.display = 'block';
            for (let i = 0; i < getParticleCount(15); i++) {
                fogParticles.push(new FogParticle());
            }
            break;
        case 'wind':
            canvas.style.display = 'block';
            for (let i = 0; i < getParticleCount(30); i++) {
                windParticles.push(new WindParticle());
            }
            break;
        case 'hail':
            canvas.style.display = 'block';
            for (let i = 0; i < getParticleCount(80); i++) {
                hailParticles.push(new HailStone());
            }
            break;
        case 'clear-day':
            if (isNight) {
                for (let i = 0; i < getParticleCount(50); i++) {
                    stars.push(new Star());
                }
            } else {
                for (let i = 0; i < getParticleCount(8); i++) {
                    sunRays.push(new SunRay());
                }
            }
            break;
        case 'clear-night':
            for (let i = 0; i < getParticleCount(50); i++) {
                stars.push(new Star());
            }
            break;
        case 'thunderstorm':
            canvas.style.display = 'block';
            cssCloudContainer.style.display = 'block';
            for (let i = 0; i < getParticleCount(150); i++) {
                particles.push(new RainDrop());
            }
            break;
    }

    if (weatherType !== 'cloudy') {
        animate();
    }
    animateBackground();
}

function animate() {
    if (!isPageVisible) return;

    time++;
    ctx.clearRect(0, 0, width, height);

    switch(weatherType) {
        case 'rain':
            particles.forEach(p => {
                p.update();
                p.draw();
            });
            break;

        case 'snow':
            particles.forEach(p => {
                p.update();
                p.draw();
            });
            break;

        case 'fog':
            fogParticles.forEach(f => {
                f.update();
                f.draw();
            });
            break;

        case 'wind':
            windParticles.forEach(wp => {
                wp.update();
                wp.draw();
            });
            break;

        case 'hail':
            hailParticles.forEach(h => {
                h.update();
                h.draw();
            });
            break;

        case 'thunderstorm':
            particles.forEach(p => {
                p.update();
                p.draw();
            });

            if (lightningTimer <= 0 && Math.random() < 0.005) {
                lightningBolts.push(new Lightning());
                lightningTimer = 60 + Math.random() * 120;
            } else {
                lightningTimer--;
            }

            lightningBolts = lightningBolts.filter(lightning => {
                const alive = lightning.update();
                if (alive) lightning.draw();
                return alive;
            });

            if (lightningBolts.length > 0) {
                ctx.fillStyle = `rgba(255, 255, 255, ${0.1 * lightningBolts.length})`;
                ctx.fillRect(0, 0, width, height);
            }
            break;
    }

    animationId = requestAnimationFrame(animate);
}

function animateBackground() {
    if (!isPageVisible) return;

    bgCtx.clearRect(0, 0, width, height);

    // Анимация звезд для ночного неба
    if (weatherType === 'clear-night') {
        stars.forEach(star => {
            star.update();
            star.draw();
        });
    }

    // Анимация солнечных лучей для ясного дня
    if (weatherType === 'clear-day') {
        sunRays.forEach(ray => {
            ray.update();
            ray.draw();
        });
    }

    bgAnimationId = requestAnimationFrame(animateBackground);
}

function createWeatherCard({ dateStr, icon, temp, desc, precip, humidity, isToday, isCurrent, timeStr }) {
    const cardElement = document.createElement('div');
    cardElement.className = `card fade-in${isToday ? ' today' : ''}`;
    let dateHtml = isCurrent ? `Сейчас (${timeStr})` : dateStr;
    cardElement.innerHTML = `
        <div class="date">${dateHtml}</div>
        <img class="weather-icon" src="https://raw.githubusercontent.com/visualcrossing/WeatherIcons/main/PNG/2nd%20Set%20-%20Color/${icon}.png" alt="${desc}" />
        <div class="temp">${Math.round(temp)}°C</div>
        <div class="desc">${desc}</div>
        <div class="small-info">Осадки: ${precip} мм</div>
        ${humidity !== undefined ? `<div class="small-info">Влажность: ${humidity}%</div>` : ''}
    `;
    return cardElement;
}

async function getWeather() {
    const url = `https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/${LAT},${LON}/next4days?unitGroup=metric&key=${API_KEY}&contentType=json`;
    try {
        const res = await fetch(url);
        const data = await res.json();
        weatherContainer.innerHTML = "";
        const days = data.days;
        const todayStr = new Date().toISOString().split("T")[0];
        days.forEach(day => {
            const date = new Date(day.datetime);
            const isToday = day.datetime === todayStr;
            const weekday = date.toLocaleDateString("ru-RU", { 
                weekday: 'long', 
                day: 'numeric', 
                month: 'long' 
            });
            const card = createWeatherCard({
                dateStr: weekday,
                icon: day.icon,
                temp: day.temp,
                desc: translateCondition(day.icon, day.conditions),
                precip: day.precip,
                isToday,
            });
            weatherContainer.appendChild(card);
        });
        const current = data.currentConditions;
        const now = new Date();
        const timeStr = now.toLocaleTimeString("ru-RU", { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
        const currentCard = createWeatherCard({
            dateStr: '',
            icon: current.icon,
            temp: current.temp,
            desc: translateCondition(current.icon, current.conditions),
            precip: current.precip,
            humidity: current.humidity,
            isCurrent: true,
            timeStr
        });
        weatherContainer.appendChild(currentCard);
        const animationType = getAnimationType(current.icon);
        startAnimation(animationType);
    } catch (error) {
        weatherContainer.innerHTML = 
            "<div class='text-white text-xl'>Ошибка загрузки данных о погоде.</div>";
        startAnimation(null);
    }
}

function updateAtmosphereEffects(type) {
    frostOverlay.style.display = 'none';
    rainReflection.style.display = 'none';
    stormDarken.style.display = 'none';
    
    if (type === 'snow') {
        frostOverlay.style.display = 'block';
    } else if (type === 'rain') {
        rainReflection.style.display = 'block';
    } else if (type === 'thunderstorm') {
        stormDarken.style.display = 'block';
        setTimeout(() => { stormDarken.style.opacity = '1'; }, 100);
        setTimeout(() => { stormDarken.style.opacity = '0'; }, 800);
    }
}

// Инициализация приложения
getWeather();
setInterval(getWeather, 300000);