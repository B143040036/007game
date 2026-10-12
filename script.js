const URL = "./";

let model, webcam, labelContainer, maxPredictions;
let gameActive = false;

let playerBullets = 0;
let aiBullets = 0;
let playerLastAction = "stay";
let aiLastAction = "stay";
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
        appendLog("攝影機啟動成功！特務系統就緒。");
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
    if (!currentPredictions || currentPredictions.length === 0) return "stay";
    
    let bestPred = currentPredictions[0];
    for (let i = 1; i < currentPredictions.length; i++) {
        if (currentPredictions[i].probability > bestPred.probability) {
            bestPred = currentPredictions[i];
        }
    }
    return bestPred.className;
}

function getAIAction() {
    let validActions = ["charge", "stay"];
    
    if (aiBullets > 0) validActions.push("discharge");
    if (aiLastAction !== "counterattack") validActions.push("counterattack");
    if (aiLastAction !== "change") validActions.push("change");

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

    // 違規檢查與修正
    if (pAction === "counterattack" && playerLastAction === "counterattack") {
        appendLog("⚠️ 【違規】你連續兩次使用 counterattack，判定為失誤！自動改為 stay。");
        pAction = "stay";
    }
    if (pAction === "change" && playerLastAction === "change") {
        appendLog("⚠️ 【違規】你連續兩次使用 change，判定為失誤！自動改為 stay。");
        pAction = "stay";
    }
    if (pAction === "discharge" && playerBullets <= 0) {
        appendLog("⚠️ 【違規】你沒有子彈可以 discharge，判定為失誤！自動改為 stay。");
        pAction = "stay";
    }

    let aAction = getAIAction();

    document.getElementById("player-action-text").innerText = `你出招：${pAction} (辨識為: ${rawAction})`;
    document.getElementById("ai-action-text").innerText = `敵方出招：${aAction}`;
    document.getElementById("ai-last-action").innerText = aAction;

    appendLog(`--- 回合結算 --- | 你：${pAction} | AI：${aAction}`);

    let roundResultMsg = "";
    let gameOver = false;
    let winnerText = "";

    let playerEffectiveAction = pAction;
    let aiEffectiveAction = aAction;

    let isPlayerCharging = (pAction === "charge");
    let isAiCharging = (aAction === "charge");
    let isPlayerChanging = (pAction === "change");
    let isAiChanging = (aAction === "change");

    // 交換規則 (一人 charge、一人 change)
    if (isPlayerChanging && isAiCharging) {
        let temp = playerBullets;
        playerBullets = aiBullets;
        aiBullets = temp;
        roundResultMsg += "🔄 一方 charge、一方 change！成功觸發交換子彈！";
        playSound('swap');
        playerEffectiveAction = "handled_change";
        aiEffectiveAction = "handled_change";
    } else if (isAiChanging && isPlayerCharging) {
        let temp = playerBullets;
        playerBullets = aiBullets;
        aiBullets = temp;
        roundResultMsg += "🔄 一方 charge、一方 change！成功觸發交換子彈！";
        playSound('swap');
        playerEffectiveAction = "handled_change";
        aiEffectiveAction = "handled_change";
    } else {
        if (isPlayerChanging) {
            roundResultMsg += "⚠️ 你的 change 失敗（對方未使用 charge），浪費一回合！ ";
        }
        if (isAiChanging) {
            roundResultMsg += "⚠️ AI 的 change 失敗（你未使用 charge），浪費一回合！ ";
        }
    }

    // 處理子彈消耗與勝負判定
    if (playerEffectiveAction === "charge") {
        playerBullets++;
    }
    if (aiEffectiveAction === "charge") {
        aiBullets++;
    }

    // 衝突判定：雙方同時 discharge
    if (playerEffectiveAction === "discharge" && aiEffectiveAction === "discharge") {
        playerBullets--;
        aiBullets--;
        roundResultMsg += "💥 雙方同時 discharge！子彈互相抵銷，平手無事發生！";
        playSound('shoot');
    } 
    // 玩家 discharge，AI 不是 counterattack -> 玩家勝利
    else if (playerEffectiveAction === "discharge" && aiEffectiveAction !== "counterattack") {
        playerBullets--;
        roundResultMsg += "🎉 命中目標！你成功 discharge 擊斃了 AI！";
        playSound('win');
        gameOver = true;
        winnerText = "🎉 遊戲結束！你獲得勝利 (WIN)！";
    }
    // 玩家 discharge，但被 AI counterattack -> 玩家失敗
    else if (playerEffectiveAction === "discharge" && aiEffectiveAction === "counterattack") {
        playerBullets--;
        roundResultMsg += "🛡️ AI 成功 counterattack 擋下了你的攻擊！";
        playSound('reflect');
        gameOver = true;
        winnerText = "💀 遊戲結束！你被對方 counterattack，AI 獲勝 (YOU LOSE)！";
    }
    // AI discharge，但被玩家 counterattack -> 玩家勝利（反彈成功）
    else if (aiEffectiveAction === "discharge" && playerEffectiveAction === "counterattack") {
        aiBullets--;
        roundResultMsg += "🛡️✨ 你成功 counterattack 反彈了 AI 的子彈，將 AI 擊斃！";
        playSound('win');
        gameOver = true;
        winnerText = "🎉 遊戲結束！你 counterattack 成功獲得勝利 (WIN)！";
    }
    // AI discharge，玩家沒有 counterattack -> 玩家失敗
    else if (aiEffectiveAction === "discharge" && playerEffectiveAction !== "counterattack") {
        aiBullets--;
        roundResultMsg += "💀 你被 AI 的 discharge 擊中了！";
        playSound('lose');
        gameOver = true;
        winnerText = "💀 遊戲結束！你被對方 discharge 擊殺，AI 獲勝 (YOU LOSE)！";
    }

    playerLastAction = pAction;
    aiLastAction = aAction;

    document.getElementById("player-bullets").innerText = playerBullets;
    document.getElementById("ai-bullets").innerText = aiBullets;

    appendLog(roundResultMsg);

    if (gameOver) {
        document.getElementById("countdown-btn").disabled = true;
        document.getElementById("player-action-text").innerText = winnerText;
        document.getElementById("ai-action-text").innerText = winnerText;
        
        setTimeout(() => {
            alert(winnerText + "\n\n點擊確定重新開始一局！");
            resetGame();
        }, 1000);
    }
}

function normalizeActionName(name) {
    let action = name.trim().toLowerCase();

    if (action === "discharge" || action.includes("discharge") || action.includes("shoot")) {
        return "discharge";
    }
    if (action === "counterattack" || action.includes("counter") || action.includes("attack")) {
        return "counterattack";
    }
    if (action === "change" || action.includes("change") || action.includes("swap")) {
        return "change";
    }
    if (action === "charge" || action.includes("charge")) {
        return "charge";
    }
    return "stay";
}

function resetGame() {
    playerBullets = 0;
    aiBullets = 0;
    playerLastAction = "stay";
    aiLastAction = "stay";
    document.getElementById("player-bullets").innerText = 0;
    document.getElementById("ai-bullets").innerText = 0;
    document.getElementById("player-action-text").innerText = "等待出招...";
    document.getElementById("ai-action-text").innerText = "敵方等待中...";
    document.getElementById("countdown-btn").disabled = false;
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
