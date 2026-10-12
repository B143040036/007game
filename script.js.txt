const URL = "./my_model/";

let model, webcam, labelContainer, maxPredictions;
let gameActive = false;

let playerBullets = 0;
let aiBullets = 0;
let playerLastAction = "";
let aiLastAction = "";
let currentPredictions = [];

async function initGame() {
    try {
        const modelURL = URL + "model.json";
        const metadataURL = URL + "metadata.json";

        model = await tmImage.load(modelURL, metadataURL);
        maxPredictions = model.getTotalClasses();

        const flip = true;
        webcam = new tmImage.Webcam(200, 200, flip);
        await webcam.setup();
        await webcam.play();
        window.requestAnimationFrame(loop);

        document.getElementById("webcam-container").appendChild(webcam.canvas);
        labelContainer = document.getElementById("label-container");
        labelContainer.innerHTML = "";
        for (let i = 0; i < maxPredictions; i++) {
            labelContainer.appendChild(document.createElement("div"));
        }

        document.getElementById("start-screen").style.display = "none";
        document.getElementById("game-main").style.display = "grid";
        document.getElementById("control-panel").style.display = "block";
        gameActive = true;
        appendLog("攝影機啟動成功！模型載入完成。");
    } catch (e) {
        alert("模型載入失敗！請確認 ./my_model/ 資料夾內是否有 model.json、metadata.json 與 weights.bin。錯誤：" + e);
    }
}

async function loop() {
    if (gameActive) {
        webcam.update();
        await predict();
    }
    window.requestAnimationFrame(loop);
}

async function predict() {
    const prediction = await model.predict(webcam.canvas);
    currentPredictions = prediction;
    for (let i = 0; i < maxPredictions; i++) {
        const classPrediction = prediction[i].className + ": " + (prediction[i].probability * 100).toFixed(1) + "%";
        labelContainer.childNodes[i].innerHTML = classPrediction;
    }
}

function getPlayerDetectedAction() {
    if (currentPredictions.length === 0) return "存子彈";
    let best = currentPredictions[0];
    for (let i = 1; i < currentPredictions.length; i++) {
        if (currentPredictions[i].probability > best.probability) {
            best = currentPredictions[i];
        }
    }
    return best.className;
}

function getAIAction() {
    let validActions = ["存子彈"];
    
    if (aiBullets > 0) validActions.push("發射");
    if (aiLastAction !== "反彈") validActions.push("反彈");
    if (aiLastAction !== "交換") validActions.push("交換");

    const chosen = validActions[Math.floor(Math.random() * validActions.length)];
    return chosen;
}

async function startRound() {
    const btn = document.getElementById("countdown-btn");
    btn.disabled = true;

    let countdown = 3;
    document.getElementById("player-action-text").innerText = `請擺好姿勢... ${countdown}`;
    document.getElementById("ai-action-text").innerText = `敵方蓄力中...`;
    
    playSound('beep');

    let timer = setInterval(() => {
        countdown--;
        if (countdown > 0) {
            document.getElementById("player-action-text").innerText = `請擺好姿勢... ${countdown}`;
            playSound('beep');
        } else {
            clearInterval(timer);
            resolveRound();
            btn.disabled = false;
        }
    }, 1000);
}

function resolveRound() {
    let rawAction = getPlayerDetectedAction();
    let pAction = normalizeActionName(rawAction);

    if (pAction === "反彈" && playerLastAction === "反彈") {
        appendLog("⚠️ 【違規】你連續兩次使用「反彈」，判定為失誤！自動改為「存子彈」。");
        pAction = "存子彈";
    }
    if (pAction === "交換" && playerLastAction === "交換") {
        appendLog("⚠️ 【違規】你連續兩次使用「交換」，判定為失誤！自動改為「存子彈」。");
        pAction = "存子彈";
    }
    if (pAction === "發射" && playerBullets <= 0) {
        appendLog("⚠️ 【違規】你沒有子彈可以「發射」，判定為失誤！自動改為「存子彈」。");
        pAction = "存子彈";
    }

    let aAction = getAIAction();

    document.getElementById("player-action-text").innerText = `你出招：${pAction}`;
    document.getElementById("ai-action-text").innerText = `敵方出招：${aAction}`;
    document.getElementById("ai-last-action").innerText = aAction;

    appendLog(`--- 回合結算 --- | 你：${pAction} | AI：${aAction}`);

    let roundResultMsg = "";
    let gameOver = false;

    if (pAction === "存子彈") {
        playerBullets++;
    } else if (pAction === "發射") {
        playerBullets--;
        if (aAction === "反彈") {
            roundResultMsg += "🛡️ AI 成功反彈了你的子彈！";
            playSound('reflect');
        } else if (aAction === "發射") {
            roundResultMsg += "💥 雙方同時發射！平手或無事發生。";
            playSound('shoot');
        } else {
            roundResultMsg += "🎉 命中目標！你擊敗了敵方特務！";
            playSound('win');
            gameOver = true;
        }
    } else if (pAction === "反彈") {
        // 防禦
    } else if (pAction === "交換") {
        let temp = playerBullets;
        playerBullets = aiBullets;
        aiBullets = temp;
        roundResultMsg += "🔄 雙方子彈互換！";
        playSound('swap');
    }

    if (!gameOver) {
        if (aAction === "存子彈") {
            aiBullets++;
        } else if (aAction === "發射") {
            aiBullets--;
            if (pAction === "反彈") {
                roundResultMsg += " | 🛡️ 你成功反彈了 AI 的子彈！";
                playSound('reflect');
            } else if (aAction === "發射") {
                // 已在上一個條件處理
            } else {
                roundResultMsg += " | 💀 被擊中了！AI 贏了遊戲！";
                playSound('lose');
                gameOver = true;
            }
        }
    }

    playerLastAction = pAction;
    aiLastAction = aAction;

    document.getElementById("player-bullets").innerText = playerBullets;
    document.getElementById("ai-bullets").innerText = aiBullets;

    appendLog(roundResultMsg);

    if (gameOver) {
        setTimeout(() => {
            alert(roundResultMsg + "\n\n遊戲重新開始！");
            resetGame();
        }, 500);
    }
}

function normalizeActionName(name) {
    if (name.includes("存") || name.includes("charge") || name.includes("集")) return "存子彈";
    if (name.includes("射") || name.includes("shoot") || name.includes("開槍") || name.includes("砰")) return "發射";
    if (name.includes("反") || name.includes("reflect") || name.includes("防") || name.includes("擋")) return "反彈";
    if (name.includes("交") || name.includes("swap") || name.includes("換")) return "交換";
    return "存子彈";
}

function resetGame() {
    playerBullets = 0;
    aiBullets = 0;
    playerLastAction = "";
    aiLastAction = "";
    document.getElementById("player-bullets").innerText = 0;
    document.getElementById("ai-bullets").innerText = 0;
    document.getElementById("player-action-text").innerText = "等待出招...";
    document.getElementById("ai-action-text").innerText = "敵方等待中...";
    appendLog("[系統] 遊戲已重置，新的一局開始！");
}

function appendLog(text) {
    const log = document.getElementById("game-log");
    log.innerHTML += text + "<br>";
    log.scrollTop = log.scrollHeight;
}

function playSound(type) {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        let now = ctx.currentTime;
        if (type === 'beep') {
            osc.frequency.setValueAtTime(440, now);
            gain.gain.setValueAtTime(0.1, now);
            osc.start(now);
            osc.stop(now + 0.1);
        } else if (type === 'shoot') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(300, now);
            osc.frequency.exponentialRampToValueAtTime(80, now + 0.2);
            gain.gain.setValueAtTime(0.2, now);
            osc.start(now);
            osc.stop(now + 0.2);
        } else if (type === 'reflect') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(600, now);
            osc.frequency.exponentialRampToValueAtTime(900, now + 0.2);
            gain.gain.setValueAtTime(0.2, now);
            osc.start(now);
            osc.stop(now + 0.2);
        } else if (type === 'win') {
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(523.25, now);
            osc.frequency.setValueAtTime(659.25, now + 0.1);
            osc.frequency.setValueAtTime(783.99, now + 0.2);
            gain.gain.setValueAtTime(0.2, now);
            osc.start(now);
            osc.stop(now + 0.3);
        } else if (type === 'lose') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(200, now);
            osc.frequency.exponentialRampToValueAtTime(80, now + 0.4);
            gain.gain.setValueAtTime(0.2, now);
            osc.start(now);
            osc.stop(now + 0.4);
        }
    } catch (e) {
        // Audio policy fallback
    }
}