/**
 * 스마트 복용 — Teachable Machine 공식 라이브러리 사용
 * TM 모델: https://teachablemachine.withgoogle.com/models/zt8Dazmbp/
 * 라벨: 대기 | 약먹기전 | 약먹는중 | 꿀꺽
 *
 * ml5는 이 모델(tm 2.4 / @teachablemachine/image 0.8)과 호환되지 않아
 * @teachablemachine/image + tfjs 로 직접 predict 합니다.
 */
(function () {
  const IMAGE_MODEL_URL = "https://teachablemachine.withgoogle.com/models/zt8Dazmbp/";
  const INTAKE_LABEL = "꿀꺽";
  const CONFIDENCE_THRESHOLD = 0.9;
  const PREDICT_INTERVAL_MS = 200;
  const PI_URL_STORAGE_KEY = "dispensePiUrl";
  const FIXED_PI_URL = "https://c6d0f55b35d093.lhr.life";
  const PI_FETCH_TIMEOUT_MS = 12000;
  const TEST_SLOT_VALUE = "__test__|test";

  let tmModel = null;
  /** @type {HTMLVideoElement | null} */
  let videoEl = null;
  /** @type {HTMLCanvasElement | null} */
  let canvasEl = null;
  /** @type {CanvasRenderingContext2D | null} */
  let canvasCtx = null;
  let mediaStream = null;

  let label = "";
  let confidence = 0;
  let isDispensing = false;
  let isSystemStarted = false;
  let modelLabels = [];
  let modelReady = false;
  let modelLoadError = "";
  let lastResults = [];
  let activeSlot = null;
  /** @type {((slot: { vitaminId: string; time: string }) => void) | null} */
  let onCompleteCallback = null;

  let drawFrameId = null;
  let predictTimerId = null;
  let intakeHandled = false;
  let successBorderTimer = null;
  /** @type {"idle"|"connecting"|"dispensing"|"done"|"error"} */
  let piPhase = "idle";
  let piPhaseMessage = "";
  let piDispenseOk = false;

  function showSuccessBorder() {
    const stage = document.querySelector(".ai-layout__stage");
    if (!stage) return;
    stage.classList.add("ai-layout__stage--success");
    if (successBorderTimer) clearTimeout(successBorderTimer);
    successBorderTimer = window.setTimeout(function () {
      stage.classList.remove("ai-layout__stage--success");
      successBorderTimer = null;
    }, 2000);
  }

  function clearSuccessBorder() {
    const stage = document.querySelector(".ai-layout__stage");
    if (stage) stage.classList.remove("ai-layout__stage--success");
    if (successBorderTimer) {
      clearTimeout(successBorderTimer);
      successBorderTimer = null;
    }
  }

  function isTestMode() {
    return !!(activeSlot && activeSlot.isTest);
  }

  function isIntakeDetected() {
    return label === INTAKE_LABEL && confidence > CONFIDENCE_THRESHOLD;
  }

  function getPiUrl() {
    return FIXED_PI_URL;
  }

  function setPiStatus(text, tone) {
    const el = document.getElementById("dispense-pi-status");
    if (!el) return;
    el.textContent = text || "";
    el.className = "form-msg form-msg--tiny" + (tone === "ok" ? " form-msg--ok" : tone === "err" ? " form-msg--err" : "");
  }

  function initPiUrlField() {
    const piInput = document.getElementById("dispense-pi-url");
    if (piInput) {
      piInput.value = FIXED_PI_URL;
      piInput.readOnly = true;
    }
    savePiUrl(FIXED_PI_URL);
    setPiStatus("배출 단계에서 장비와 연동합니다.", "");
  }

  function fetchPi(options) {
    const controller = new AbortController();
    const timer = window.setTimeout(function () {
      controller.abort();
    }, PI_FETCH_TIMEOUT_MS);

    return fetch(FIXED_PI_URL, Object.assign({}, options || {}, { signal: controller.signal })).finally(function () {
      clearTimeout(timer);
    });
  }

  async function checkPiHealth() {
    piPhase = "connecting";
    piPhaseMessage = "라즈베리파이 연결 확인 중…";
    updateDispenseUI();
    drawPhaseScreen(piPhaseMessage);

    const res = await fetchPi({
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error("장비 응답 없음 (HTTP " + res.status + ")");
    }
    const data = await res.json();
    if (!data || data.ok !== true) {
      throw new Error((data && data.message) || "장비 상태 확인 실패");
    }
    return data;
  }

  async function runPiDispense() {
    piPhase = "dispensing";
    piPhaseMessage = "알약 배출 중… 모터 작동";
    updateDispenseUI();
    drawPhaseScreen(piPhaseMessage);

    const res = await fetchPi({
      method: "POST",
      headers: { Accept: "application/json" },
    });
    const data = await res.json().catch(function () {
      return { ok: false, message: "응답 파싱 실패" };
    });
    if (!res.ok || !data.ok) {
      throw new Error((data && data.message) || "배출 명령 실패 (HTTP " + res.status + ")");
    }
    piDispenseOk = true;
    piPhase = "done";
    piPhaseMessage = "배출 완료 · 카메라 준비";
    setPiStatus("라즈베리파이 배출 완료", "ok");
    updateDispenseUI();
    drawPhaseScreen(piPhaseMessage);
    return data;
  }

  /** 카메라 전 — health 확인 후 배출 POST 완료까지 대기 */
  async function triggerRaspberryPi() {
    isDispensing = true;
    piDispenseOk = false;
    setPiStatus("장비 연결 중…", "");

    try {
      const health = await checkPiHealth();
      const gpioNote = health.gpio ? "GPIO 연결됨" : "시뮬레이션 모드";
      setPiStatus("장비 연결됨 · " + gpioNote, "ok");
      return await runPiDispense();
    } catch (error) {
      piPhase = "error";
      piPhaseMessage = error && error.name === "AbortError" ? "장비 응답 시간 초과" : (error && error.message) || "연결 실패";
      setPiStatus(piPhaseMessage, "err");
      updateDispenseUI();
      drawPhaseScreen("라즈베리파이 연동 실패\n" + piPhaseMessage);
      throw error;
    } finally {
      isDispensing = false;
      updateDispenseUI();
    }
  }

  function drawPhaseScreen(message) {
    drawIdleScreen(message);
  }

  function savePiUrl(url) {
    try {
      localStorage.setItem(PI_URL_STORAGE_KEY, url);
    } catch (e) {
      // ignore
    }
  }

  function getCanvasHostSize() {
    const host = document.getElementById("dispense-canvas-host");
    if (!host) return { width: 960, height: 540 };
    const w = host.clientWidth || 960;
    const h = host.clientHeight || 540;
    return {
      width: Math.max(400, Math.floor(w)),
      height: Math.max(300, Math.floor(h)),
    };
  }

  function resizeCanvasToHost() {
    ensureCanvas();
    if (!canvasEl) return;
    const size = getCanvasHostSize();
    if (canvasEl.width !== size.width || canvasEl.height !== size.height) {
      canvasEl.width = size.width;
      canvasEl.height = size.height;
    }
  }

  function drawVideoCover() {
    if (!canvasCtx || !canvasEl || !videoEl || videoEl.readyState < videoEl.HAVE_CURRENT_DATA) return;

    const vw = videoEl.videoWidth || 640;
    const vh = videoEl.videoHeight || 480;
    const cw = canvasEl.width;
    const ch = canvasEl.height;
    const scale = Math.max(cw / vw, ch / vh);
    const dw = vw * scale;
    const dh = vh * scale;
    const dx = (cw - dw) / 2;
    const dy = (ch - dh) / 2;

    canvasCtx.save();
    canvasCtx.translate(cw, 0);
    canvasCtx.scale(-1, 1);
    canvasCtx.drawImage(videoEl, dx, dy, dw, dh);
    canvasCtx.restore();
  }

  function ensureCanvas() {
    if (canvasEl) return;
    const host = document.getElementById("dispense-canvas-host");
    if (!host) return;

    canvasEl = document.createElement("canvas");
    canvasEl.id = "dispense-canvas";
    host.innerHTML = "";
    host.appendChild(canvasEl);
    canvasCtx = canvasEl.getContext("2d");
    resizeCanvasToHost();
  }

  function drawIdleScreen(message) {
    resizeCanvasToHost();
    if (!canvasCtx || !canvasEl) return;
    canvasCtx.fillStyle = "#0f172a";
    canvasCtx.fillRect(0, 0, canvasEl.width, canvasEl.height);
    canvasCtx.fillStyle = "#94a3b8";
    const fontSize = Math.max(16, Math.round(canvasEl.height * 0.04));
    canvasCtx.font = fontSize + "px sans-serif";
    canvasCtx.textAlign = "center";
    canvasCtx.textBaseline = "middle";
    const lines = (message || "아래 버튼을 누르면\n모터가 작동하고 카메라 감시가 시작됩니다.").split("\n");
    const mid = canvasEl.height / 2 - ((lines.length - 1) * (fontSize * 0.5));
    lines.forEach(function (line, i) {
      canvasCtx.fillText(line, canvasEl.width / 2, mid + i * (fontSize * 1.4));
    });
  }

  function drawCameraFrame() {
    if (!canvasCtx || !canvasEl) return;

    resizeCanvasToHost();
    canvasCtx.fillStyle = "#000";
    canvasCtx.fillRect(0, 0, canvasEl.width, canvasEl.height);

    drawVideoCover();

    canvasCtx.textAlign = "center";
    canvasCtx.textBaseline = "alphabetic";

    const labelSize = Math.max(18, Math.round(canvasEl.height * 0.045));
    const bottomPad = Math.max(72, Math.round(canvasEl.height * 0.14));
    const textY = canvasEl.height - bottomPad;

    canvasCtx.shadowColor = "rgba(0,0,0,.75)";
    canvasCtx.shadowBlur = 6;
    canvasCtx.shadowOffsetY = 1;

    if (isIntakeDetected()) {
      canvasCtx.fillStyle = "#22c55e";
      canvasCtx.font = "bold " + labelSize + "px sans-serif";
      canvasCtx.fillText(
        isTestMode() ? "테스트 성공! ✅ (기록 없음)" : "복용 완료! ✅",
        canvasEl.width / 2,
        textY
      );
    } else {
      canvasCtx.fillStyle = "#fff";
      canvasCtx.font = labelSize + "px sans-serif";
      canvasCtx.fillText("현재 상태: " + (label || "분석 중…"), canvasEl.width / 2, textY);
    }

    canvasCtx.shadowColor = "transparent";
    canvasCtx.shadowBlur = 0;
    canvasCtx.shadowOffsetY = 0;

    if (isSystemStarted) {
      drawFrameId = requestAnimationFrame(drawCameraFrame);
    }
  }

  async function loadModel() {
    if (modelReady || tmModel) return;
    if (typeof tmImage === "undefined") {
      modelLoadError = "Teachable Machine 라이브러리 로드 실패";
      updateDispenseUI();
      return;
    }

    try {
      const modelURL = IMAGE_MODEL_URL + "model.json";
      const metadataURL = IMAGE_MODEL_URL + "metadata.json";
      tmModel = await tmImage.load(modelURL, metadataURL);
      if (typeof tmModel.getClassLabels === "function") {
        modelLabels = tmModel.getClassLabels();
      } else {
        const metaRes = await fetch(metadataURL);
        const meta = await metaRes.json();
        modelLabels = meta.labels || [];
      }
      modelReady = true;
      modelLoadError = "";
      console.log("AI 모델 로드 완료 | 라벨:", modelLabels.join(", "));
      updateDispenseUI();
      drawIdleScreen();
    } catch (e) {
      modelLoadError = "모델 로드 실패: " + (e.message || e);
      console.error(modelLoadError, e);
      updateDispenseUI();
      drawIdleScreen(modelLoadError);
    }
  }

  async function runPredict() {
    if (!isSystemStarted || !tmModel || !videoEl || intakeHandled) return;

    if (videoEl.readyState < videoEl.HAVE_CURRENT_DATA) {
      predictTimerId = window.setTimeout(runPredict, PREDICT_INTERVAL_MS);
      return;
    }

    try {
      const predictions = await tmModel.predict(videoEl);
      if (!predictions || !predictions.length) {
        predictTimerId = window.setTimeout(runPredict, PREDICT_INTERVAL_MS);
        return;
      }

      lastResults = predictions
        .map(function (p) {
          return {
            label: p.className,
            confidence: p.probability,
          };
        })
        .sort(function (a, b) {
          return b.confidence - a.confidence;
        });

      label = lastResults[0].label;
      confidence = lastResults[0].confidence;
      updateDispenseUI();

      if (isIntakeDetected() && !intakeHandled) {
        intakeHandled = true;
        showSuccessBorder();
        stopPredictLoop();
        handleIntakeComplete();
        return;
      }
    } catch (e) {
      console.error("predict 오류:", e);
    }

    if (isSystemStarted && !intakeHandled) {
      predictTimerId = window.setTimeout(runPredict, PREDICT_INTERVAL_MS);
    }
  }

  function startPredictLoop() {
    stopPredictLoop();
    predictTimerId = window.setTimeout(runPredict, 300);
  }

  function stopPredictLoop() {
    if (predictTimerId) {
      clearTimeout(predictTimerId);
      predictTimerId = null;
    }
  }

  function stopDrawLoop() {
    if (drawFrameId) {
      cancelAnimationFrame(drawFrameId);
      drawFrameId = null;
    }
  }

  async function startCamera() {
    ensureCanvas();
    videoEl = document.createElement("video");
    videoEl.width = 640;
    videoEl.height = 480;
    videoEl.playsInline = true;
    videoEl.muted = true;
    videoEl.setAttribute("playsinline", "");
    videoEl.style.display = "none";
    document.body.appendChild(videoEl);

    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });

    videoEl.srcObject = mediaStream;
    await videoEl.play();

    isSystemStarted = true;
    updateDispenseUI();
    drawCameraFrame();
    startPredictLoop();
  }

  function handleIntakeComplete() {
    if (isTestMode()) {
      updateDispenseUI();
      window.setTimeout(function () {
        if (!isSystemStarted || !isTestMode()) return;
        label = "";
        confidence = 0;
        lastResults = [];
        intakeHandled = false;
        updateDispenseUI();
        startPredictLoop();
      }, 2500);
      return;
    }

    updateDispenseUI();
    if (onCompleteCallback && activeSlot) {
      onCompleteCallback({
        vitaminId: activeSlot.vitaminId,
        time: activeSlot.time,
        isTest: false,
      });
    }
  }

  async function startSystem(slot) {
    if (isSystemStarted || isDispensing) return;

    if (!modelReady || !tmModel) {
      alert("AI 모델이 아직 로드되지 않았습니다.\n잠시 후 다시 시도해 주세요.");
      return;
    }

    activeSlot = slot || null;
    label = "";
    confidence = 0;
    lastResults = [];
    intakeHandled = false;
    piPhase = "idle";
    piDispenseOk = false;

    console.log(isTestMode() ? "🧪 테스트 모드: 카메라 감시 시작 (기록 없음)" : "🚀 배출 → 카메라 → AI 감시");
    updateDispenseUI();

    try {
      if (!isTestMode()) {
        await triggerRaspberryPi();
      }

      await startCamera();
    } catch (e) {
      console.error("시작 오류:", e);
      isSystemStarted = false;
      piPhase = piPhase === "error" ? "error" : "idle";

      if (!isTestMode() && piPhase === "error") {
        alert(
          "라즈베리파이와 연동하지 못했습니다.\n" +
            (piPhaseMessage || "연결을 확인한 뒤 다시 시도해 주세요.") +
            "\n\n카메라는 배출 성공 후에만 시작됩니다."
        );
        drawPhaseScreen("라즈베리파이 연동 실패\n" + (piPhaseMessage || "연결 확인 필요"));
      } else {
        alert("카메라를 켤 수 없습니다.\n브라우저에서 카메라 권한을 허용했는지 확인해 주세요.\n(로컬 서버 http://localhost 로 실행 필요)");
        drawIdleScreen("카메라 오류\n권한 및 http://localhost 실행을 확인하세요.");
      }
      updateDispenseUI();
    }
  }

  function stopSystem() {
    isSystemStarted = false;
    intakeHandled = false;
    isDispensing = false;
    piPhase = "idle";
    piPhaseMessage = "";
    piDispenseOk = false;
    clearSuccessBorder();
    label = "";
    confidence = 0;
    lastResults = [];
    activeSlot = null;

    stopPredictLoop();
    stopDrawLoop();

    if (mediaStream) {
      mediaStream.getTracks().forEach(function (t) {
        t.stop();
      });
      mediaStream = null;
    }

    if (videoEl) {
      videoEl.srcObject = null;
      videoEl.remove();
      videoEl = null;
    }

    updateDispenseUI();
    initPiUrlField();
    drawIdleScreen();
  }

  function updateDispenseUI() {
    const statusEl = document.getElementById("dispense-status");
    const confEl = document.getElementById("dispense-confidence");
    const labelsEl = document.getElementById("dispense-labels");
    const startBtn = document.getElementById("btn-dispense-start");
    const stopBtn = document.getElementById("btn-dispense-stop");
    const slotSelect = document.getElementById("dispense-slot");

    if (labelsEl) {
      labelsEl.textContent = modelLabels.length
        ? "모델 라벨: " + modelLabels.join(" · ")
        : modelLoadError
          ? modelLoadError
          : "모델 로딩 중…";
    }

    if (statusEl) {
      if (isDispensing || piPhase === "connecting" || piPhase === "dispensing") {
        statusEl.textContent = piPhaseMessage || "라즈베리파이 연동 중…";
        statusEl.dataset.tone = "warn";
      } else if (piPhase === "error") {
        statusEl.textContent = "라즈베리파이 연동 실패: " + (piPhaseMessage || "연결 확인 필요");
        statusEl.dataset.tone = "err";
      } else if (modelLoadError) {
        statusEl.textContent = modelLoadError;
        statusEl.dataset.tone = "err";
      } else if (!modelReady) {
        statusEl.textContent = "AI 모델 로딩 중…";
        statusEl.dataset.tone = "warn";
      } else if (isIntakeDetected() && isTestMode()) {
        statusEl.textContent = "테스트 성공! AI가 꿀꺽을 감지했습니다. (기록 없음 · 곧 다시 감시)";
        statusEl.dataset.tone = "ok";
      } else if (isIntakeDetected()) {
        statusEl.textContent = "복용 완료! ✅ 오늘 기록에 저장되었습니다.";
        statusEl.dataset.tone = "ok";
      } else if (isSystemStarted && isTestMode()) {
        statusEl.textContent = "테스트 모드 — 카메라로 AI 동작을 확인합니다. (기록 없음)";
        statusEl.dataset.tone = "info";
      } else if (isSystemStarted) {
        statusEl.textContent = "카메라로 복용을 확인하고 있습니다. (꿀꺽 ≥90%)";
        statusEl.dataset.tone = "info";
      } else {
        statusEl.textContent = "아래 버튼을 누르면 모터가 작동하고 카메라 감시가 시작됩니다.";
        statusEl.dataset.tone = "muted";
      }
    }

    if (confEl) {
      if (isSystemStarted && lastResults.length) {
        confEl.textContent = lastResults
          .map(function (r) {
            return r.label + " " + Math.round(r.confidence * 100) + "%";
          })
          .join("  |  ");
      } else if (!modelReady) {
        confEl.textContent = "Teachable Machine 모델 불러오는 중…";
      } else if (modelLabels.length) {
        confEl.textContent = "완료 조건: 꿀꺽 ≥90%";
      } else {
        confEl.textContent = "";
      }
    }

    if (startBtn) {
      const slotInput = document.getElementById("dispense-slot");
      const slotValue = slotInput && slotInput.value;
      const willTest = slotValue === TEST_SLOT_VALUE;
      const done = isIntakeDetected() && !isTestMode();
      const hasSlot = !!slotValue;
      startBtn.disabled =
        !modelReady || !hasSlot || isDispensing || (isSystemStarted && !done && !isTestMode());
      startBtn.textContent = isDispensing
        ? piPhase === "connecting"
          ? "장비 연결 중…"
          : "알약 배출 중…"
        : done
        ? "다시 시작"
        : isSystemStarted
          ? isTestMode()
            ? "테스트 중…"
            : "감시 중…"
          : !modelReady
            ? "AI 모델 로딩 중…"
            : willTest
              ? "테스트 시작"
              : "알약 배출 & 복용 감시 시작";
    }
    if (stopBtn) stopBtn.hidden = !isSystemStarted;
    if (slotSelect) slotSelect.disabled = isSystemStarted;

    updateSteps();
  }

  function updateSteps() {
    const detected = isIntakeDetected();
    const isTest = isTestMode();
    const dispenseBusy = isDispensing || piPhase === "connecting" || piPhase === "dispensing";
    const dispenseDone = piDispenseOk || (isSystemStarted && !isTest && !!videoEl);
    const map = {
      dispense: !isTest && (dispenseBusy || dispenseDone),
      camera: isSystemStarted && !!videoEl,
      detect: detected,
      done: detected && !isTest,
    };
    Object.keys(map).forEach(function (key) {
      const el = document.getElementById("step-" + key);
      if (el) {
        const active =
          key === "dispense"
            ? dispenseBusy
            : key === "camera"
              ? isSystemStarted && !!videoEl && !dispenseBusy
              : !!map[key] && !(key === "done" && isTest);
        const done = key === "dispense" ? dispenseDone && !dispenseBusy : !!map[key];
        el.classList.toggle("dispense-step--active", active);
        el.classList.toggle("dispense-step--done", done);
      }
    });
  }

  function initDispenseBridge(options) {
    onCompleteCallback = options && options.onComplete ? options.onComplete : null;

    ensureCanvas();
    drawIdleScreen();
    initPiUrlField();

    const startBtn = document.getElementById("btn-dispense-start");
    const stopBtn = document.getElementById("btn-dispense-stop");

    if (startBtn) {
      startBtn.addEventListener("click", function () {
        if (isIntakeDetected() && !isTestMode()) {
          stopSystem();
          return;
        }
        const slotInput = document.getElementById("dispense-slot");
        const value = slotInput && slotInput.value;
        if (!value) {
          const el = document.getElementById("dispense-status");
          if (el) {
            el.textContent = "「오늘의 복용」에서 항목을 선택해 주세요.";
            el.dataset.tone = "err";
          }
          return;
        }
        if (value === TEST_SLOT_VALUE) {
          startSystem({ isTest: true });
        } else {
          const parts = value.split("|");
          startSystem({ vitaminId: parts[0], time: parts[1], isTest: false });
        }
      });
    }

    if (stopBtn) {
      stopBtn.addEventListener("click", stopSystem);
    }

    const slotInputEl = document.getElementById("dispense-slot");
    if (slotInputEl) {
      slotInputEl.addEventListener("change", updateDispenseUI);
    }

    const testBtn = document.getElementById("btn-dispense-test");
    if (testBtn) {
      testBtn.addEventListener("click", function () {
        if (isSystemStarted) return;
        if (slotInputEl) slotInputEl.value = TEST_SLOT_VALUE;
        if (typeof updateDispenseSlotDisplay === "function") updateDispenseSlotDisplay();
        updateDispenseUI();
      });
    }

    loadModel();
    updateDispenseUI();

    let resizeTimer;
    window.addEventListener("resize", function () {
      clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(function () {
        resizeCanvasToHost();
        if (!isSystemStarted) drawIdleScreen();
      }, 120);
    });
  }

  window.DispenseSystem = {
    init: initDispenseBridge,
    start: startSystem,
    stop: stopSystem,
    resizeCanvas: function () {
      resizeCanvasToHost();
      if (!isSystemStarted) drawIdleScreen();
    },
    getState: function () {
      return isSystemStarted ? "watching" : "idle";
    },
    setPiUrl: savePiUrl,
  };
})();
