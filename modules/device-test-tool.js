function initDeviceTestTool() {
  const { notify } = window.ToolCommon;

  const keyInput = document.getElementById("key-test-input");
  const keyLog = document.getElementById("key-test-log");

  const mouseArea = document.getElementById("mouse-test-area");
  const mouseLog = document.getElementById("mouse-test-log");

  const startBtn = document.getElementById("start-media-test-btn");
  const stopBtn = document.getElementById("stop-media-test-btn");
  const speakerTestBtn = document.getElementById("speaker-test-btn");
  const cameraPreview = document.getElementById("camera-preview");
  const capturePhotoBtn = document.getElementById("capture-photo-btn");
  const downloadPhotoBtn = document.getElementById("download-photo-btn");
  const cameraCanvas = document.getElementById("camera-canvas");
  const cameraShot = document.getElementById("camera-shot");
  const micLevel = document.getElementById("mic-level");
  const startRecordBtn = document.getElementById("start-record-btn");
  const stopRecordBtn = document.getElementById("stop-record-btn");
  const playbackBtn = document.getElementById("playback-btn");
  const recordedAudio = document.getElementById("recorded-audio");
  const mediaStatus = document.getElementById("media-status");

  let mediaStream = null;
  let audioContext = null;
  let analyser = null;
  let micAnimationId = null;
  let shotDataUrl = "";
  let isRequestingMediaPermission = false;
  let mediaRecorder = null;
  let isRecording = false;
  let recordedChunks = [];
  let recordedAudioUrl = "";
  const EMPTY_SHOT_SRC = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";

  function syncMediaButtons() {
    startBtn.disabled = isRequestingMediaPermission || Boolean(mediaStream);
    stopBtn.disabled = isRequestingMediaPermission || !mediaStream;
    capturePhotoBtn.disabled = isRequestingMediaPermission || !mediaStream;
    startRecordBtn.disabled = isRequestingMediaPermission || !mediaStream || isRecording;
    stopRecordBtn.disabled = isRequestingMediaPermission || !isRecording;
    playbackBtn.disabled = !recordedAudioUrl || isRecording;
  }

  function resetRecordingState() {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
    }
    if (!isRecording) {
      mediaRecorder = null;
    }
    isRecording = false;
    recordedChunks = [];
  }

  function updateKeyLog(event) {
    keyLog.textContent = `按键: ${event.key} | 代码: ${event.code} | Ctrl:${event.ctrlKey} Shift:${event.shiftKey} Alt:${event.altKey}`;
  }

  function buttonName(button) {
    if (button === 0) {
      return "左键";
    }
    if (button === 1) {
      return "中键";
    }
    if (button === 2) {
      return "右键";
    }
    return `按钮${button}`;
  }

  function updateMouseLog(message) {
    mouseLog.textContent = message;
  }

  function stopMicMeter() {
    if (micAnimationId) {
      cancelAnimationFrame(micAnimationId);
      micAnimationId = null;
    }
    micLevel.value = 0;
  }

  function closeAudioContext() {
    if (audioContext) {
      audioContext.close().catch(() => {});
      audioContext = null;
    }
    analyser = null;
  }

  function cleanupMediaResources() {
    resetRecordingState();
    stopMicMeter();

    if (mediaStream) {
      mediaStream.getTracks().forEach((track) => track.stop());
      mediaStream = null;
    }

    closeAudioContext();
    cameraPreview.srcObject = null;

    if (!shotDataUrl) {
      cameraShot.src = EMPTY_SHOT_SRC;
      cameraShot.classList.add("is-empty");
    }
  }

  function stopMedia() {
    if (isRequestingMediaPermission) {
      return;
    }

    cleanupMediaResources();
    mediaStatus.textContent = "媒体已停止。";
    syncMediaButtons();
  }

  function startRecording() {
    if (!mediaStream) {
      notify("请先开始媒体测试。");
      return;
    }

    const audioTracks = mediaStream.getAudioTracks();
    if (!audioTracks.length) {
      notify("当前媒体流没有可用的麦克风音轨。");
      return;
    }

    try {
      const audioOnlyStream = new MediaStream(audioTracks);
      const recorder = new MediaRecorder(audioOnlyStream);
      mediaRecorder = recorder;
      recordedChunks = [];

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunks.push(event.data);
        }
      };

      recorder.onstop = () => {
        isRecording = false;
        if (recordedChunks.length) {
          const blob = new Blob(recordedChunks, { type: recorder.mimeType || "audio/webm" });
          if (recordedAudioUrl) {
            URL.revokeObjectURL(recordedAudioUrl);
          }
          recordedAudioUrl = URL.createObjectURL(blob);
          recordedAudio.src = recordedAudioUrl;
          mediaStatus.textContent = "录音完成，可点击播放录音。";
        }
        if (mediaRecorder === recorder) {
          mediaRecorder = null;
        }
        syncMediaButtons();
      };

      recorder.start();
      isRecording = true;
      mediaStatus.textContent = "录音中...";
      syncMediaButtons();
    } catch (error) {
      notify(`录音启动失败：${error.message}`);
    }
  }

  function stopRecording() {
    if (!mediaRecorder || !isRecording) {
      return;
    }
    mediaRecorder.stop();
  }

  function playbackRecording() {
    if (!recordedAudioUrl) {
      notify("暂无录音，请先录音。");
      return;
    }

    recordedAudio.currentTime = 0;
    recordedAudio.play().catch((error) => {
      notify(`播放失败：${error.message}`);
    });
  }

  async function playSpeakerTestTone() {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) {
      notify("当前浏览器不支持扬声器测试。",);
      return;
    }

    const ctx = new AudioContextCtor();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.value = 0.0001;

    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;
    gain.gain.exponentialRampToValueAtTime(0.15, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.48);

    osc.start(now);
    osc.stop(now + 0.5);

    await new Promise((resolve) => {
      osc.onended = resolve;
    });

    await ctx.close();
    mediaStatus.textContent = "扬声器测试音播放完成。";
  }

  function capturePhoto() {
    if (!mediaStream || !cameraPreview.srcObject) {
      notify("请先开始媒体测试，再拍照。",);
      return;
    }

    const width = cameraPreview.videoWidth;
    const height = cameraPreview.videoHeight;
    if (!width || !height) {
      notify("摄像头画面尚未就绪，请稍后再试。",);
      return;
    }

    cameraCanvas.width = width;
    cameraCanvas.height = height;

    const ctx = cameraCanvas.getContext("2d");
    ctx.drawImage(cameraPreview, 0, 0, width, height);
    shotDataUrl = cameraCanvas.toDataURL("image/png");
    cameraShot.src = shotDataUrl;
    cameraShot.classList.remove("is-empty");
    mediaStatus.textContent = "已完成截图，可点击下载。";
  }

  function downloadPhoto() {
    if (!shotDataUrl) {
      notify("暂无截图，请先拍照。",);
      return;
    }

    const link = document.createElement("a");
    link.href = shotDataUrl;
    link.download = `camera-shot-${Date.now()}.png`;
    link.click();
  }

  function startMicMeter() {
    if (!analyser) {
      return;
    }

    const data = new Uint8Array(analyser.fftSize);

    function tick() {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i += 1) {
        const centered = (data[i] - 128) / 128;
        sum += centered * centered;
      }
      const rms = Math.sqrt(sum / data.length);
      const level = Math.min(100, Math.round(rms * 220));
      micLevel.value = level;
      micAnimationId = requestAnimationFrame(tick);
    }

    tick();
  }

  async function startMedia() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      notify("当前浏览器不支持媒体设备测试。");
      return;
    }

    if (isRequestingMediaPermission) {
      return;
    }

    isRequestingMediaPermission = true;
    syncMediaButtons();

    cleanupMediaResources();

    try {
      mediaStatus.textContent = "等待你在浏览器弹窗中授权摄像头和麦克风...";
      mediaStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });

      cameraPreview.srcObject = mediaStream;

      const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      if (AudioContextCtor) {
        audioContext = new AudioContextCtor();
        const source = audioContext.createMediaStreamSource(mediaStream);
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 1024;
        source.connect(analyser);
        startMicMeter();
      }

      mediaStatus.textContent = "媒体测试已开始：摄像头预览与麦克风音量实时更新中。";
    } catch (error) {
      cleanupMediaResources();
      mediaStatus.textContent = `媒体测试失败：${error.message}`;
      notify(`无法启动麦克风/摄像头：${error.message}`);
    } finally {
      isRequestingMediaPermission = false;
      syncMediaButtons();
    }
  }

  keyInput.addEventListener("keydown", updateKeyLog);

  mouseArea.addEventListener("mousemove", (event) => {
    const rect = mouseArea.getBoundingClientRect();
    const x = Math.round(event.clientX - rect.left);
    const y = Math.round(event.clientY - rect.top);
    updateMouseLog(`移动坐标: (${x}, ${y})`);
  });

  mouseArea.addEventListener("mousedown", (event) => {
    updateMouseLog(`点击: ${buttonName(event.button)} | 坐标: (${event.offsetX}, ${event.offsetY})`);
  });

  mouseArea.addEventListener("wheel", (event) => {
    const direction = event.deltaY < 0 ? "向上" : "向下";
    updateMouseLog(`滚轮: ${direction} | deltaY=${Math.round(event.deltaY)}`);
    event.preventDefault();
  }, { passive: false });

  startBtn.addEventListener("click", startMedia);
  stopBtn.addEventListener("click", stopMedia);
  speakerTestBtn.addEventListener("click", () => {
    playSpeakerTestTone().catch((error) => {
      notify(`扬声器测试失败：${error.message}`);
    });
  });
  startRecordBtn.addEventListener("click", startRecording);
  stopRecordBtn.addEventListener("click", stopRecording);
  playbackBtn.addEventListener("click", playbackRecording);
  capturePhotoBtn.addEventListener("click", capturePhoto);
  downloadPhotoBtn.addEventListener("click", downloadPhoto);

  window.addEventListener("beforeunload", stopMedia);

  syncMediaButtons();
}

window.ToolModules = window.ToolModules || {};
window.ToolModules.initDeviceTestTool = initDeviceTestTool;
