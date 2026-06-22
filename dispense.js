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
  const DEFAULT_PI_URL = "https://c61be2c605ca34.lhr.life/dispense";
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

  function isTestMode() {
    return !!(activeSlot && activeSlot.isTest);
  }

  function isIntakeDetected() {
    return label === INTAKE_LABEL && confidence > CONFIDENCE_THRESHOLD;
  }

  function getPiUrl() {
    const input = document.getElementById("dispense-pi-url");
    const fromInput = input && input.value.trim();
    if (fromInput) return fromInput.replace(/\/$/, "");
    try {
      const saved = localStorage.getItem(PI_URL_STORAGE_KEY);
      if (saved) return saved.replace(/\/$/, "");
    } catch (e) {
      // ignore
    }
    return DEFAULT_PI_URL;
  }

  function savePiUrl(url) {
    try {
      localStorage.setItem(PI_URL_STORAGE_KEY, url);
    } catch (e) {
      // ignore
    }
  }

  function ensureCanvas() {
    if (canvasEl) return;
    const host = document.getElementById("dispense-canvas-host");
    if (!host) return;

    canvasEl = document.createElement("canvas");
    canvasEl.width = 640;
    canvasEl.height = 360;
    canvasEl.id = "dispense-canvas";
    host.innerHTML = "";
    host.appendChild(canvasEl);
    canvasCtx = canvasEl.getContext("2d");
  }

  function drawIdleScreen(message) {
    ensureCanvas();
    if (!canvasCtx || !canvasEl) return;
    canvasCtx.fillStyle = "#0f172a";
    canvasCtx.fillRect(0, 0, canvasEl.width, canvasEl.height);
    canvasCtx.fillStyle = "#94a3b8";
    canvasCtx.font = "18px sans-serif";
    canvasCtx.textAlign = "center";
    canvasCtx.textBaseline = "middle";
    const lines = (message || "아래 버튼을 누르면\n모터가 작동하고 카메라 감시가 시작됩니다.").split("\n");
    const mid = canvasEl.height / 2 - ((lines.length - 1) * 12);
    lines.forEach(function (line, i) {
      canvasCtx.fillText(line, canvasEl.width / 2, mid + i * 28);
    });
  }

  function drawCameraFrame() {
    if (!canvasCtx || !canvasEl) return;

    canvasCtx.fillStyle = "#000";
    canvasCtx.fillRect(0, 0, canvasEl.width, canvasEl.height);

    if (videoEl && videoEl.readyState >= videoEl.HAVE_CURRENT_DATA) {
      canvasCtx.save();
      canvasCtx.translate(canvasEl.width, 0);
      canvasCtx.scale(-1, 1);
      canvasCtx.drawImage(videoEl, 0, 0, canvasEl.width, canvasEl.height);
      canvasCtx.restore();
    }

    canvasCtx.textAlign = "center";
    canvasCtx.textBaseline = "alphabetic";

    if (isIntakeDetected()) {
      canvasCtx.fillStyle = "#22c55e";
      canvasCtx.font = "bold 28px sans-serif";
      canvasCtx.fillText(
        isTestMode() ? "테스트 성공! ✅ (기록 없음)" : "복용 완료! ✅",
        canvasEl.width / 2,
        canvasEl.height - 40
      );
    } else {
      canvasCtx.fillStyle = "#fff";
      canvasCtx.font = "22px sans-serif";
      canvasCtx.fillText("현재 상태: " + (label || "분석 중…"), canvasEl.width / 2, canvasEl.height - 40);
    }

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
      video: { facingMode: "user", width: 640, height: 360 },
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

  function triggerRaspberryPi() {
    isDispensing = true;
    const piUrl = getPiUrl();

    return fetch(piUrl, { method: "POST" })
      .then(function (response) {
        return response.json();
      })
      .then(function (data) {
        console.log("배출 신호 전달 성공:", data.message || data);
        setTimeout(function () {
          isDispensing = false;
        }, 5000);
      })
      .catch(function (error) {
        console.error("통신 에러!", error);
        setTimeout(function () {
          isDispensing = false;
        }, 5000);
        throw error;
      });
  }

  async function startSystem(slot) {
    if (isSystemStarted) return;

    if (!modelReady || !tmModel) {
      alert("AI 모델이 아직 로드되지 않았습니다.\n잠시 후 다시 시도해 주세요.");
      return;
    }

    activeSlot = slot || null;
    label = "";
    confidence = 0;
    lastResults = [];
    intakeHandled = false;

    console.log(isTestMode() ? "🧪 테스트 모드: 카메라 감시 시작 (기록 없음)" : "🚀 시스템 구동: 모터 작동 신호 송신 및 카메라 On!");
    updateDispenseUI();

    if (!isTestMode()) {
      triggerRaspberryPi().catch(function () {
        console.warn("라즈베리파이 연결 실패 — 카메라만 계속");
      });
    }

    try {
      await startCamera();
    } catch (e) {
      console.error("카메라 오류:", e);
      isSystemStarted = false;
      alert("카메라를 켤 수 없습니다.\n브라우저에서 카메라 권한을 허용했는지 확인해 주세요.\n(로컬 서버 http://localhost 로 실행 필요)");
      drawIdleScreen("카메라 오류\n권한 및 http://localhost 실행을 확인하세요.");
      updateDispenseUI();
    }
  }

  function stopSystem() {
    isSystemStarted = false;
    intakeHandled = false;
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
      if (modelLoadError) {
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
      startBtn.disabled = !modelReady || !hasSlot || (isSystemStarted && !done && !isTestMode());
      startBtn.textContent = done
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
    const map = {
      dispense: isSystemStarted && !isTest,
      camera: isSystemStarted && !!videoEl,
      detect: detected,
      done: detected && !isTest,
    };
    Object.keys(map).forEach(function (key) {
      const el = document.getElementById("step-" + key);
      if (el) {
        el.classList.toggle("dispense-step--active", !!map[key] && !(key === "done" && isTest));
        el.classList.toggle("dispense-step--done", !!map[key]);
      }
    });
  }

  function initDispenseBridge(options) {
    onCompleteCallback = options && options.onComplete ? options.onComplete : null;

    ensureCanvas();
    drawIdleScreen();

    const piInput = document.getElementById("dispense-pi-url");
    if (piInput) {
      try {
        piInput.value = localStorage.getItem(PI_URL_STORAGE_KEY) || DEFAULT_PI_URL;
      } catch (e) {
        piInput.value = DEFAULT_PI_URL;
      }
      piInput.addEventListener("change", function () {
        const url = piInput.value.trim();
        if (url) savePiUrl(url);
      });
    }

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
  }

  window.DispenseSystem = {
    init: initDispenseBridge,
    start: startSystem,
    stop: stopSystem,
    getState: function () {
      return isSystemStarted ? "watching" : "idle";
    },
    setPiUrl: savePiUrl,
  };
})();
