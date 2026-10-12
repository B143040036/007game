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

// 嚴格比對機率，找出當前真正最高的動作
function getPlayerDetectedAction() {
    if (!currentPredictions || currentPredictions.length === 0) return "stay";
    
    let bestPred = currentPredictions[0];
    for (let i = 1; i < currentPredictions.length; i++) {
        if (currentPredictions[i].probability > bestPred.probability) {
            bestPred = currentPredictions[i];
        }
    }
    
    // 如果最高機率小於 40%，保險起見當作 stay 避免誤判
    if (bestPred.probability < 0.40) {
        return "stay";
    }

    return bestPred.className;
}

// AI 智慧出招邏輯
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

    // -----------------------------------------------------------------
    // 規則判定核心
    // -----------------------------------------------------------------
    let playerEffectiveAction = pAction;
    let aiEffectiveAction = aAction;

    let isPlayerCharging = (pAction === "charge");
    let isAiCharging = (aAction === "charge");
    let isPlayerChanging = (pAction === "change");
    let isAiChanging = (aAction === "change");

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

    // 處理玩家動作
    if (playerEffectiveAction === "charge") {
        playerBullets++;
    } else if (playerEffectiveAction === "discharge") {
        playerBullets--;
        if (aiEffectiveAction === "counterattack") {
            roundResultMsg += "🛡️ AI 成功 counterattack 了你的子彈！";
            playSound('reflect');
        } else if (aiEffectiveAction === "discharge") {
            roundResultMsg += "💥 雙方同時 discharge！平手無事發生。";
            playSound('shoot');
        } else {
            roundResultMsg += "🎉 命中目標！你把 AI 擊斃了！";
            playSound('win');
            gameOver = true;
            winnerText = "🎉 遊戲結束！你獲得勝利 (WIN)！";
        }
    }

    // 若尚未分出勝負，處理 AI 動作
    if (!gameOver) {
        if (aiEffectiveAction === "charge") {
            aiBullets++;
        } else if (aiEffectiveAction === "discharge") {
            aiBullets--;
            if (playerEffectiveAction === "counterattack") {
                roundResultMsg += " | 🛡️ 你成功 counterattack 了 AI 的子彈！";
                playSound('reflect');
            } else if (aiEffectiveAction === "discharge") {
                // 平手已處理
            } else {
                roundResultMsg += " | 💀 你被 AI 射死了！";
                playSound('lose');
                gameOver = true;
                winnerText = "💀 遊戲結束！AI 獲勝 (YOU LOSE)！";
            }
        }
    }

    playerLastAction = pAction;
    aiLastAction = aAction;
