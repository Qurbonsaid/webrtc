/**
 * WebRTC P2P Videoaloqa (Fayl orqali signaling)
 * Google ochiq STUN serveri bilan
 */

// Google ochiq STUN server konfiguratsiyasi
const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ]
};

// Global o'zgaruvchilar
let localStream = null;
let peerConnection = null;

// DOM elementlari
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const logArea = document.getElementById('logArea');

// Tugmalar va kiritish maydonlari
const startMediaBtn = document.getElementById('startMediaBtn');
const toggleMicBtn = document.getElementById('toggleMicBtn');
const toggleCamBtn = document.getElementById('toggleCamBtn');
const hangupBtn = document.getElementById('hangupBtn');
const createOfferBtn = document.getElementById('createOfferBtn');
const callerAnswerFileInput = document.getElementById('callerAnswerFileInput');
const calleeOfferFileInput = document.getElementById('calleeOfferFileInput');
const callerAnswerLabel = document.getElementById('callerAnswerLabel');
const calleeOfferLabel = document.getElementById('calleeOfferLabel');
const clearLogBtn = document.getElementById('clearLogBtn');

// ---------------------- LOG FUNKSIYASI ----------------------
function log(message, type = 'normal') {
  const time = new Date().toLocaleTimeString();
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  entry.innerHTML = `<span class="timestamp">[${time}]</span> ${message}`;
  logArea.appendChild(entry);
  logArea.scrollTop = logArea.scrollHeight;
}

clearLogBtn.addEventListener('click', () => {
  logArea.innerHTML = '';
});

// ---------------------- HOLAT KO'RSATKICHI ----------------------
function setStatus(text, state = '') {
  statusText.textContent = `Holat: ${text}`;
  statusDot.className = 'status-dot';
  if (state) {
    statusDot.classList.add(state);
  }
}

// ---------------------- 1. KAMERA VA MIKROFONNI ISHGA TUSHIRISH ----------------------
startMediaBtn.addEventListener('click', async () => {
  try {
    log("Kamera va mikrofonga ruxsat so'ralmoqda...", 'info');
    localStream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: 'user'
      },
      audio: true
    });

    localVideo.srcObject = localStream;
    startMediaBtn.disabled = true;
    startMediaBtn.innerHTML = '<span>✅</span> Kamera yoqilgan';
    toggleMicBtn.disabled = false;
    toggleCamBtn.disabled = false;
    createOfferBtn.disabled = false;
    calleeOfferFileInput.disabled = false;

    log("Kamera va mikrofon muvaffaqiyatli yoqildi.", 'success');
    setStatus("Kamera yoqildi. Taklif yarating yoki taklif faylini yuklang.");
  } catch (err) {
    log(`Kameraga ulanishda xatolik: ${err.message}`, 'error');
    alert(`Kamera yoki mikrofonga ulanib bo'lmadi: ${err.message}`);
  }
});

// Mikrofonni yoqish / o'chirish
toggleMicBtn.addEventListener('click', () => {
  if (!localStream) return;
  const audioTrack = localStream.getAudioTracks()[0];
  if (audioTrack) {
    audioTrack.enabled = !audioTrack.enabled;
    toggleMicBtn.innerHTML = audioTrack.enabled
      ? '<span>🎙️</span> Mikrofon'
      : '<span>🔇</span> Mikrofon (O\'chiq)';
    log(`Mikrofon holati: ${audioTrack.enabled ? 'Yoqildi' : 'O\'chirildi'}`);
  }
});

// Videoni yoqish / o'chirish
toggleCamBtn.addEventListener('click', () => {
  if (!localStream) return;
  const videoTrack = localStream.getVideoTracks()[0];
  if (videoTrack) {
    videoTrack.enabled = !videoTrack.enabled;
    toggleCamBtn.innerHTML = videoTrack.enabled
      ? '<span>📷</span> Video'
      : '<span>🚫</span> Video (O\'chiq)';
    log(`Video holati: ${videoTrack.enabled ? 'Yoqildi' : 'O\'chirildi'}`);
  }
});

// ---------------------- RTCPeerConnection YARATISH ----------------------
function createPeerConnection() {
  if (peerConnection) {
    peerConnection.close();
  }

  log("Yangi RTCPeerConnection yaratilmoqda (Google STUN)...", 'info');
  peerConnection = new RTCPeerConnection(rtcConfig);

  // Mahalliy treklarni Peer ga qo'shish
  if (localStream) {
    localStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, localStream);
    });
  }

  // Masofaviy trek qabul qilinganda
  peerConnection.ontrack = (event) => {
    log("Masofaviy video/audio oqimi (stream) qabul qilindi!", 'success');
    if (!remoteVideo.srcObject) {
      remoteVideo.srcObject = event.streams[0];
    }
  };

  // Ulanish holati o'zgarganda
  peerConnection.onconnectionstatechange = () => {
    const state = peerConnection.connectionState;
    log(`Ulanish holati o'zgardi: ${state}`, 'info');

    if (state === 'connected') {
      setStatus("To'g'ridan-to'g'ri P2P aloqa o'rnatildi!", 'connected');
      hangupBtn.disabled = false;
    } else if (state === 'connecting') {
      setStatus("P2P aloqa ulanmoqda...", 'connecting');
    } else if (state === 'disconnected') {
      setStatus("Aloqa uzildi", 'disconnected');
    } else if (state === 'failed') {
      setStatus("Ulanish amalga oshmadi", 'disconnected');
      log("Ulanish xatosi (ICE yoki tarmoq muammosi bo'lishi mumkin).", 'error');
    } else if (state === 'closed') {
      setStatus("Aloqa yopildi");
    }
  };

  // ICE holati
  peerConnection.oniceconnectionstatechange = () => {
    log(`ICE holati: ${peerConnection.iceConnectionState}`);
  };

  return peerConnection;
}

// ---------------------- ICE CANDIDATES YIG'ILISHINI KUTISH ----------------------
// Serverless (fayl orqali) ishlashda barcha ICE kandidatlar to'planib,
// to'liq SDP bitta faylda bo'lishi eng qulay usuldir.
function waitForIceGatheringComplete(pc) {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === 'complete') {
      resolve();
      return;
    }

    function checkState() {
      log(`ICE yig'ish holati: ${pc.iceGatheringState}...`);
      if (pc.iceGatheringState === 'complete') {
        pc.removeEventListener('icegatheringstatechange', checkState);
        resolve();
      }
    }

    pc.addEventListener('icegatheringstatechange', checkState);

    // Xavfsizlik uchun: agar 4 soniya ichida complete bo'lmasa ham davom ettirish
    setTimeout(() => {
      resolve();
    }, 4000);
  });
}

// ---------------------- FAYLNI YUKLAB BERISH (DOWNLOAD) ----------------------
function downloadJsonFile(filename, dataObj) {
  const jsonStr = JSON.stringify(dataObj, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------------------- FAYLNI O'QISH (FILE READER) ----------------------
function readFileAsJson(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        resolve(parsed);
      } catch (err) {
        reject(new Error("Fayl formati noto'g'ri (JSON bo'lishi kerak)"));
      }
    };
    reader.onerror = () => reject(new Error("Faylni o'qishda xatolik yuz berdi"));
    reader.readAsText(file);
  });
}

// ---------------------- 2. TAKLIF (OFFER) YARATISH (CALLER) ----------------------
createOfferBtn.addEventListener('click', async () => {
  try {
    createOfferBtn.disabled = true;
    createOfferBtn.innerHTML = '<span>⏳</span> Taklif tayyorlanmoqda...';
    setStatus("Taklif tayyorlanmoqda va STUN server orqali ICE nomzodlar yig'ilmoqda...", 'connecting');

    const pc = createPeerConnection();

    // Taklif yaratish
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    log("Lokal tavsif (Offer) o'rnatildi, ICE nomzodlari yig'ilmoqda...", 'info');

    // To'liq ICE kandidatlar yig'ilishini kutish
    await waitForIceGatheringComplete(pc);

    // Yakuniy SDP (barcha STUN ICE nomzodlar bilan birga)
    const offerData = {
      type: pc.localDescription.type,
      sdp: pc.localDescription.sdp,
      timestamp: new Date().toISOString()
    };

    downloadJsonFile('webrtc-taklif.json', offerData);
    log("'webrtc-taklif.json' fayli yuklab olindi! Uni suhbatdoshingizga yuboring.", 'success');
    setStatus("Taklif fayli yuklandi. Endi suhbatdoshdan 'webrtc-javob.json' faylini kuting.");

    createOfferBtn.innerHTML = '<span>✅</span> Taklif yuklab olindi';
    callerAnswerFileInput.disabled = false;
  } catch (err) {
    log(`Taklif yaratishda xato: ${err.message}`, 'error');
    createOfferBtn.disabled = false;
    createOfferBtn.innerHTML = '<span>📄</span> Taklif yaratish va faylni yuklab olish';
  }
});

// ---------------------- 3. JAVOB (ANSWER) FAYLINI YUKLASH (CALLER) ----------------------
callerAnswerFileInput.addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  try {
    callerAnswerLabel.innerHTML = `<span>⏳</span> ${file.name} o'qilmoqda...`;
    log(`Javob fayli yuklanmoqda: ${file.name}...`, 'info');

    const answerData = await readFileAsJson(file);

    if (!answerData.sdp || answerData.type !== 'answer') {
      throw new Error("Yuklangan fayl haqiqiy 'answer' (javob) ma'lumotlarini o'z ichiga olmagan!");
    }

    if (!peerConnection) {
      throw new Error("PeerConnection mavjud emas. Avval taklif yarating!");
    }

    await peerConnection.setRemoteDescription(new RTCSessionDescription({
      type: answerData.type,
      sdp: answerData.sdp
    }));

    callerAnswerLabel.innerHTML = `<span>✅</span> ${file.name} muvaffaqiyatli ulandi`;
    log("Masofaviy javob (Answer) qabul qilindi. Ulanish jarayoni boshlandi!", 'success');
    setStatus("Masofaviy javob qabul qilindi. Ulanish o'rnatilmoqda...", 'connecting');
  } catch (err) {
    log(`Javob faylini qabul qilishda xato: ${err.message}`, 'error');
    alert(`Xatolik: ${err.message}`);
    callerAnswerLabel.innerHTML = `<span>📥</span> Qayta urinib ko'ring`;
  }
});

// ---------------------- 4. TAKLIF FAYLINI QABUL QILIB, JAVOB YARATISH (CALLEE) ----------------------
calleeOfferFileInput.addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  try {
    calleeOfferLabel.innerHTML = `<span>⏳</span> ${file.name} o'qilmoqda...`;
    log(`Taklif fayli yuklanmoqda: ${file.name}...`, 'info');

    const offerData = await readFileAsJson(file);

    if (!offerData.sdp || offerData.type !== 'offer') {
      throw new Error("Yuklangan fayl haqiqiy 'offer' (taklif) ma'lumotlarini o'z ichiga olmagan!");
    }

    const pc = createPeerConnection();

    // Taklifni o'rnatish
    await pc.setRemoteDescription(new RTCSessionDescription({
      type: offerData.type,
      sdp: offerData.sdp
    }));
    log("Taklif (Offer) masofaviy tavsif sifatida qabul qilindi.", 'info');

    // Javob yaratish
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    log("Javob (Answer) yaratildi, STUN orqali ICE nomzodlar yig'ilmoqda...", 'info');

    setStatus("Javob yaratilmoqda va ICE nomzodlari yig'ilmoqda...", 'connecting');

    // ICE kandidatlar yig'ilishini kutish
    await waitForIceGatheringComplete(pc);

    // Yakuniy Answer SDP
    const answerData = {
      type: pc.localDescription.type,
      sdp: pc.localDescription.sdp,
      timestamp: new Date().toISOString()
    };

    downloadJsonFile('webrtc-javob.json', answerData);
    log("'webrtc-javob.json' fayli avtomatik yuklab olindi! Uni 1-foydalanuvchiga yuboring.", 'success');
    calleeOfferLabel.innerHTML = `<span>✅</span> Javob fayli yuklab olindi`;
    setStatus("Javob fayli yuklab olindi. Uni 1-foydalanuvchiga yuboring.");
  } catch (err) {
    log(`Taklifni qabul qilishda xato: ${err.message}`, 'error');
    alert(`Xatolik: ${err.message}`);
    calleeOfferLabel.innerHTML = `<span>📥</span> Qayta urinib ko'ring`;
  }
});

// ---------------------- 5. ALOQANI TUGATISH / QAYTA SOZLASH ----------------------
hangupBtn.addEventListener('click', () => {
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  remoteVideo.srcObject = null;
  hangupBtn.disabled = true;
  createOfferBtn.disabled = false;
  createOfferBtn.innerHTML = '<span>📄</span> Taklif yaratish va faylni yuklab olish';
  callerAnswerFileInput.value = '';
  callerAnswerFileInput.disabled = true;
  callerAnswerLabel.innerHTML = '<span>📥</span> <code>webrtc-javob.json</code> faylini tanlang';
  calleeOfferFileInput.value = '';
  calleeOfferLabel.innerHTML = '<span>📥</span> <code>webrtc-taklif.json</code> faylini tanlang';

  setStatus("Aloqa tugatildi", 'disconnected');
  log("Aloqa foydalanuvchi tomonidan tugatildi.", 'warning');
});
