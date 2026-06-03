import { Html5Qrcode } from 'html5-qrcode';

const API_URL = import.meta.env.VITE_API_URL || (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
  ? 'http://localhost:5000/api' 
  : `http://${window.location.hostname}:5000/api`);

// Variable global al archivo para trackear la actividad seleccionada
let currentSelectedActivity = "Jornada Laboral";

export async function loadActivityOptions() {
  console.log("loadActivityOptions ejecutado");
  const container = document.getElementById("activity-buttons-container");
  const bannerText = document.getElementById("selected-activity-text");
  if (!container) return;

  const updateSelectedActivity = (name) => {
    currentSelectedActivity = name;
    if (bannerText) bannerText.textContent = name;
    
    // Actualizar clases de los botones
    const buttons = container.querySelectorAll(".activity-btn");
    buttons.forEach(btn => {
      if (btn.dataset.activity === name) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });
  };

  try {
    const res = await fetch(`${API_URL}/activities?t=${Date.now()}`, { cache: 'no-store' });
    const activities = await res.json();
    container.innerHTML = '';
    
    let list = activities;
    if (list.length === 0) {
      list = [{ name: "Jornada Laboral" }];
    }

    list.forEach(act => {
      const btn = document.createElement("button");
      btn.className = "activity-btn";
      btn.dataset.activity = act.name;
      
      // Asignar un icono decorativo elegante según el nombre de la actividad
      let icon = "fa-briefcase";
      const nameLower = act.name.toLowerCase();
      if (nameLower.includes("comida") || nameLower.includes("almuerzo")) icon = "fa-utensils";
      else if (nameLower.includes("campo") || nameLower.includes("salida")) icon = "fa-person-walking-luggage";
      else if (nameLower.includes("capacita") || nameLower.includes("curso")) icon = "fa-graduation-cap";
      else if (nameLower.includes("reunion") || nameLower.includes("junta")) icon = "fa-users";
      else if (nameLower.includes("medico") || nameLower.includes("salud")) icon = "fa-heart-pulse";
      
      btn.innerHTML = `<i class="fa-solid ${icon}"></i> ${act.name}`;
      
      btn.addEventListener("click", () => {
        updateSelectedActivity(act.name);
      });
      
      container.appendChild(btn);
    });

    // Mantener la selección previa si sigue en la lista, o usar la primera
    const exists = list.some(act => act.name === currentSelectedActivity);
    if (exists) {
      updateSelectedActivity(currentSelectedActivity);
    } else {
      updateSelectedActivity(list[0].name);
    }
  } catch (err) {
    console.error("Error cargando opciones de actividades:", err);
    container.innerHTML = '';
    
    const btn = document.createElement("button");
    btn.className = "activity-btn active";
    btn.dataset.activity = "Jornada Laboral";
    btn.innerHTML = `<i class="fa-solid fa-briefcase"></i> Jornada Laboral`;
    container.appendChild(btn);
    
    updateSelectedActivity("Jornada Laboral");
  }
}

export function initScanner() {
  const html5QrCode = new Html5Qrcode("reader", { useBarCodeDetectorIfSupported: true });
  const canvasElem = document.getElementById("photo-canvas");
  const statusPanel = document.getElementById("scan-status");
  const countdownOverlay = document.getElementById("countdown-overlay");
  const countdownNumber = document.getElementById("countdown-number");
  const countdownInput = document.getElementById("countdown-time");
  
  let isProcessing = false;

  loadActivityOptions();

  const takePhoto = () => {
    const scannerVideo = document.querySelector('#reader video');
    if (!scannerVideo) return '';
    
    const maxDimension = 640;
    let width = scannerVideo.videoWidth || 640;
    let height = scannerVideo.videoHeight || 480;
    
    if (width > maxDimension || height > maxDimension) {
      if (width > height) {
        height = Math.round((height * maxDimension) / width);
        width = maxDimension;
      } else {
        width = Math.round((width * maxDimension) / height);
        height = maxDimension;
      }
    }
    
    canvasElem.width = width;
    canvasElem.height = height;
    const ctx = canvasElem.getContext("2d");
    ctx.drawImage(scannerVideo, 0, 0, canvasElem.width, canvasElem.height);
    // Reducir calidad a 0.7 para evitar enviar payloads excesivamente pesados
    return canvasElem.toDataURL('image/jpeg', 0.7);
  };

  const onScanSuccess = async (decodedText, decodedResult) => {
    if (isProcessing) return;
    isProcessing = true;

    // Pausar escáner para evitar múltiples escaneos
    html5QrCode.pause();

    let timeLeft = parseInt(countdownInput.value) || 0;

    if (timeLeft > 0) {
      statusPanel.innerHTML = `
        <i class="fa-solid fa-user-check fa-3x" style="color: var(--primary); margin-bottom: 1rem;"></i>
        <h3>QR Detectado</h3>
        <p>Por favor, mira a la cámara...</p>
      `;
      countdownOverlay.classList.add('active');
      countdownNumber.textContent = timeLeft;

      const timer = setInterval(async () => {
        timeLeft--;
        if (timeLeft > 0) {
          countdownNumber.textContent = timeLeft;
        } else {
          clearInterval(timer);
          countdownOverlay.classList.remove('active');
          await processAttendance(decodedText);
        }
      }, 1000);
    } else {
      await processAttendance(decodedText);
    }
  };

  const processAttendance = async (decodedText) => {
    statusPanel.innerHTML = `
      <i class="fa-solid fa-spinner fa-spin fa-3x" style="color: var(--primary); margin-bottom: 1rem;"></i>
      <h3>Procesando...</h3>
      <p>ID: ${decodedText}</p>
    `;

    // Tomar fotografía utilizando el frame actual del video del escáner
    const photoBase64 = takePhoto();

    // Obtener actividad seleccionada
    const selectedActivity = currentSelectedActivity;

    // Enviar a la API
    try {
      const res = await fetch(`${API_URL}/attendance`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-terminal-token': localStorage.getItem('terminalToken') || ''
        },
        body: JSON.stringify({
          identifier: decodedText,
          photo: photoBase64,
          activity: selectedActivity
        })
      });

      const data = await res.json();

      if (res.ok) {
        statusPanel.classList.add('success');
        statusPanel.innerHTML = `
          <i class="fa-solid fa-circle-check fa-3x" style="margin-bottom: 1rem;"></i>
          <h3>¡${data.attendance.type} Registrad${(data.attendance.type === 'Inicio' || data.attendance.type === 'Fin') ? 'o' : 'a'}!</h3>
          <p>${data.userName}<br><small>${data.attendance.activity}</small></p>
        `;
      } else {
        if (res.status === 403 && data.message && (data.message.includes('autorizado') || data.message.includes('revocado'))) {
          localStorage.removeItem('terminalToken');
          localStorage.removeItem('terminalName');
          statusPanel.innerHTML = `
            <i class="fa-solid fa-circle-xmark fa-3x" style="color: var(--danger); margin-bottom: 1rem;"></i>
            <h3 style="color: var(--danger)">Acceso Revocado</h3>
            <p>${data.message}</p>
          `;
          setTimeout(() => {
            window.location.reload();
          }, 3500);
          return;
        }
        throw new Error(data.message || 'Error al registrar');
      }
    } catch (err) {
      statusPanel.innerHTML = `
        <i class="fa-solid fa-circle-xmark fa-3x" style="color: var(--danger); margin-bottom: 1rem;"></i>
        <h3 style="color: var(--danger)">Error</h3>
        <p>${err.message}</p>
      `;
    }

    // Reanudar después de unos segundos
    setTimeout(() => {
      statusPanel.classList.remove('success');
      statusPanel.innerHTML = `
        <i class="fa-solid fa-camera fa-3x" style="color: #6c757d; margin-bottom: 1rem;"></i>
        <h3>Esperando Código QR...</h3>
        <p>Por favor, ubica el QR dentro del marco.</p>
      `;
      html5QrCode.resume();
      isProcessing = false;
    }, 4000);
  };

  let currentCameraId = null;
  let scannerReady = false;

  const makeConfig = (deviceId) => ({
    fps: 20,
    disableFlip: true,
    videoConstraints: {
      deviceId: { exact: deviceId },
      width: { ideal: 640, max: 1280 },
      height: { ideal: 480, max: 720 }
    }
  });

  const startCamera = async (deviceId) => {
    await html5QrCode.start(deviceId, makeConfig(deviceId), onScanSuccess);
  };

  const switchCamera = async () => {
    if (isProcessing || !scannerReady) return;
    try {
      await html5QrCode.stop();
      scannerReady = false;
      await new Promise(r => setTimeout(r, 300));

      const cameras = await Html5Qrcode.getCameras();
      if (cameras.length > 1) {
        const idx = cameras.findIndex(c => c.id === currentCameraId);
        const next = cameras[(idx + 1) % cameras.length];
        currentCameraId = next.id;
      }
      await startCamera(currentCameraId);
      scannerReady = true;
    } catch (err) {
      console.error("Error al cambiar cámara", err);
    }
  };

  (async () => {
    try {
      const cameras = await Html5Qrcode.getCameras();
      if (cameras.length === 0) throw new Error("No hay cámaras");
      const rear = cameras.find(c =>
        /back|trás|environment|trasera/i.test(c.label)
      );
      currentCameraId = (rear || cameras[0]).id;
      await startCamera(currentCameraId);
      scannerReady = true;
    } catch (err) {
      console.error("Error iniciando escáner", err);
      statusPanel.innerHTML = `
        <i class="fa-solid fa-triangle-exclamation fa-3x" style="color: var(--danger); margin-bottom: 1rem;"></i>
        <h3 style="color: var(--danger)">Error de Cámara</h3>
        <p>Por favor permite el acceso a la cámara y recarga la página.</p>
      `;
    }
  })();

  const switchBtn = document.getElementById("btn-switch-camera");
  if (switchBtn) {
    switchBtn.addEventListener("click", switchCamera);
  }
}
