import { Html5Qrcode } from 'html5-qrcode';

const API_URL = import.meta.env.VITE_API_URL || (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
  ? 'http://localhost:5000/api' 
  : `http://${window.location.hostname}:5000/api`);

export function initScanner() {
  const html5QrCode = new Html5Qrcode("reader");
  const canvasElem = document.getElementById("photo-canvas");
  const statusPanel = document.getElementById("scan-status");
  const countdownOverlay = document.getElementById("countdown-overlay");
  const countdownNumber = document.getElementById("countdown-number");
  const countdownInput = document.getElementById("countdown-time");
  
  let isProcessing = false;

  const takePhoto = () => {
    const scannerVideo = document.querySelector('#reader video');
    if (!scannerVideo) return '';
    
    canvasElem.width = scannerVideo.videoWidth || 640;
    canvasElem.height = scannerVideo.videoHeight || 480;
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

    // Enviar a la API
    try {
      const res = await fetch(`${API_URL}/attendance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: decodedText,
          photo: photoBase64
        })
      });

      const data = await res.json();

      if (res.ok) {
        statusPanel.classList.add('success');
        statusPanel.innerHTML = `
          <i class="fa-solid fa-circle-check fa-3x" style="margin-bottom: 1rem;"></i>
          <h3>¡${data.attendance.type} Registrada!</h3>
          <p>${data.userName}</p>
        `;
      } else {
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

  // Configuración del escáner
  const config = { fps: 10, qrbox: { width: 250, height: 250 } };
  
  html5QrCode.start({ facingMode: "user" }, config, onScanSuccess)
    .catch(err => {
      console.error("Error iniciando escáner", err);
      statusPanel.innerHTML = `
        <i class="fa-solid fa-triangle-exclamation fa-3x" style="color: var(--danger); margin-bottom: 1rem;"></i>
        <h3 style="color: var(--danger)">Error de Cámara</h3>
        <p>Por favor permite el acceso a la cámara y recarga la página.</p>
      `;
    });
}
