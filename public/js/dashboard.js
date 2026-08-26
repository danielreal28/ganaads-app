const token = localStorage.getItem('token');
if (!token) window.location.href = 'auth.html';

const authHeaders = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`,
};

let appConfig = { pointsPerAd: 10, pointsPerUsdt: 1000, minWithdrawalUsdt: 5, adsensePublisherId: '' };

// ---------- Navegación por pestañas ----------
const tabs = document.querySelectorAll('.nav-tab[data-section]');
const sections = {
  watch: document.getElementById('section-watch'),
  referrals: document.getElementById('section-referrals'),
  withdraw: document.getElementById('section-withdraw'),
  support: document.getElementById('section-support'),
};

tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    tabs.forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    Object.values(sections).forEach((s) => (s.style.display = 'none'));
    sections[tab.dataset.section].style.display = 'block';
    if (tab.dataset.section === 'referrals') loadReferrals();
    if (tab.dataset.section === 'withdraw') loadWithdrawals();
    if (tab.dataset.section === 'support') loadChat();
  });
});

document.getElementById('logout-tab').addEventListener('click', () => {
  localStorage.removeItem('token');
  window.location.href = 'auth.html';
});

// ---------- Carga de configuración pública + datos del usuario ----------
async function loadConfig() {
  const res = await fetch('/api/config');
  appConfig = await res.json();
  document.getElementById('withdraw-copy').textContent =
    `Retiro mínimo: US$${appConfig.minWithdrawalUsdt.toFixed(2)} USDT.`;
  document.getElementById('watch-copy').textContent =
    `Presiona el botón, mira el anuncio completo y recibe ${appConfig.pointsPerAd} puntos.`;

}

async function loadUser() {
  const res = await fetch('/api/user/me', { headers: authHeaders });
  if (res.status === 401) {
    localStorage.removeItem('token');
    window.location.href = 'auth.html';
    return;
  }
  const user = await res.json();
  document.getElementById('balance-usdt').textContent = `US$${user.balance_usdt}`;
  document.getElementById('balance-points').textContent = `${user.balance_points} puntos`;
  document.getElementById('stat-referrals').textContent = user.referral_count;
  document.getElementById('stat-views').textContent = user.adViewsSinceWithdrawal;
  window.currentUser = user;

  if (user.is_admin) {
    const adminTab = document.getElementById('admin-tab');
    adminTab.style.display = 'block';
    adminTab.addEventListener('click', () => {
      window.location.href = 'admin.html';
    });
  }

  const refLink = `${window.location.origin}/auth.html?ref=${user.referral_code}`;
  document.getElementById('ref-link').value = refLink;
}

async function loadAdHistory() {
  const res = await fetch('/api/ads/history', { headers: authHeaders });
  const history = await res.json();
}

// ---------- Ver anuncio y ganar puntos ----------
const watchBtn = document.getElementById('watch-btn');
const watchError = document.getElementById('watch-error');
const watchSuccess = document.getElementById('watch-success');
const adSlot = document.getElementById('ad-slot');

function triggerMonetagAd() {
  // Si estás conectado como administrador, NO se dispara el anuncio real
  // (evita que tus propias pruebas cuenten como auto-clics ante Monetag).
  if (window.currentUser && window.currentUser.is_admin) {
    console.log('[Modo admin] Anuncio de Monetag simulado, no se disparó de verdad.');
    return;
  }
  const script = document.createElement('script');
  script.dataset.zone = '11639500';
  script.src = 'https://nap5k.com/tag.min.js';
  document.body.appendChild(script);
}

watchBtn.addEventListener('click', () => {
  triggerMonetagAd();
  watchError.classList.remove('show');
  watchSuccess.classList.remove('show');
  watchBtn.disabled = true;
  watchBtn.innerHTML = '<span class="spin"></span>Cargando anuncio...';

  // Usa la Ad Placement API de Google (adBreak) diseñada específicamente
  // para anuncios recompensados en la web. Requiere tener AdSense aprobado
  // y el ADSENSE_PUBLISHER_ID configurado en el backend (.env).
  if (typeof window.adBreak === 'function' && appConfig.adsensePublisherId) {
    window.adBreak({
      type: 'reward',
      name: 'ver_anuncio_recompensa',
      beforeReward: (showAdFn) => {
        adSlot.textContent = 'Reproduciendo anuncio...';
        showAdFn();
      },
      adDismissed: () => {
        // El usuario cerró el anuncio antes de tiempo: no se otorgan puntos.
        watchError.textContent = 'Cerraste el anuncio antes de tiempo. No se otorgaron puntos.';
        watchError.classList.add('show');
        resetWatchButton();
      },
      adViewed: () => {
        // El anuncio se vio completo: se acredita la recompensa.
        creditAdView();
      },
      adBreakDone: () => {
        adSlot.textContent = 'El anuncio aparecerá aquí';
      },
    });
  } else {
    // Modo de prueba local: si aún no configuraste AdSense, simula el anuncio
    // con una espera de 5 segundos para que puedas probar el flujo completo.
    adSlot.textContent = 'Modo de prueba: simulando anuncio (10s)...';
    setTimeout(() => {
      adSlot.textContent = 'El anuncio aparecerá aquí';
      creditAdView();
    }, 10000);
  }
});

async function creditAdView() {
  try {
    const res = await fetch('/api/ads/view', { method: 'POST', headers: authHeaders });
    const data = await res.json();
    if (!res.ok) {
      let errorMsg = data.error || 'No se pudo registrar el anuncio.';
      if (data.resetAt) {
        const resetTime = new Date(data.resetAt).toLocaleString('es-ES', {
          hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit',
        });
        errorMsg += ` Se restablece el ${resetTime}.`;
      }
      watchError.textContent = errorMsg;
      watchError.classList.add('show');
    } else {
      watchSuccess.textContent = `¡Ganaste ${data.pointsEarned} puntos!` +
        (data.referralBonusTriggered ? ' Además, la persona que te invitó recibió su bono.' : '');
      watchSuccess.classList.add('show');
      await loadUser();
      await loadAdHistory();
    }
  } catch (err) {
    watchError.textContent = 'No se pudo conectar con el servidor.';
    watchError.classList.add('show');
  }
  resetWatchButton();
}

function resetWatchButton() {
  watchBtn.disabled = false;
  watchBtn.textContent = 'Ver anuncio';
}

// ---------- Referidos ----------
document.getElementById('copy-ref-btn').addEventListener('click', () => {
  const input = document.getElementById('ref-link');
  input.select();
  navigator.clipboard.writeText(input.value);
  const btn = document.getElementById('copy-ref-btn');
  const original = btn.textContent;
  btn.textContent = '¡Copiado!';
  setTimeout(() => (btn.textContent = original), 1500);
});

async function loadReferrals() {
  await loadUser();
  const list = document.getElementById('referrals-list');
  if (!window.currentUser.referrals || window.currentUser.referrals.length === 0) {
    list.innerHTML = '<p class="muted">Aún no tienes referidos.</p>';
    return;
  }
  list.innerHTML = window.currentUser.referrals
    .map((r) => `
      <div class="list-item">
        <div>${r.email}<div class="muted">${new Date(r.created_at).toLocaleDateString()}</div></div>
        <span class="badge ${r.referral_bonus_paid ? 'badge-approved' : 'badge-pending'}">
          ${r.referral_bonus_paid ? 'Bono pagado' : 'Esperando 1er anuncio'}
        </span>
      </div>
    `)
    .join('');
}

// ---------- Retiros ----------
const withdrawBtn = document.getElementById('withdraw-btn');
const withdrawError = document.getElementById('withdraw-error');
const withdrawSuccess = document.getElementById('withdraw-success');

withdrawBtn.addEventListener('click', async () => {
  withdrawError.classList.remove('show');
  withdrawSuccess.classList.remove('show');
  const walletAddress = document.getElementById('wallet-address').value.trim();

  if (!walletAddress) {
    withdrawError.textContent = 'Ingresa tu dirección de billetera USDT.';
    withdrawError.classList.add('show');
    return;
  }

  withdrawBtn.disabled = true;
  try {
    const res = await fetch('/api/withdrawals/request', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ walletAddress }),
    });
    const data = await res.json();
    if (!res.ok) {
      withdrawError.textContent = data.error || 'No se pudo procesar la solicitud.';
      withdrawError.classList.add('show');
    } else {
      withdrawSuccess.textContent = `Tu solicitud de US$${data.amount_usdt} USDT está en revisión. Será pagada en un plazo de 6 a 12 horas.`;
      withdrawSuccess.classList.add('show');
      document.getElementById('wallet-address').value = '';
      await loadUser();
      await loadWithdrawals();
    }
  } catch (err) {
    withdrawError.textContent = 'No se pudo conectar con el servidor.';
    withdrawError.classList.add('show');
  }
  withdrawBtn.disabled = false;
});

async function loadWithdrawals() {
  const res = await fetch('/api/withdrawals/mine', { headers: authHeaders });
  const list = await res.json();
  const container = document.getElementById('withdrawals-list');
  const clearBtn = document.getElementById('clear-history-btn');

  const hasProcessed = list.some((w) => w.status !== 'pending');
  clearBtn.style.display = hasProcessed ? 'inline-flex' : 'none';

  if (list.length === 0) {
    container.innerHTML = '<p class="muted">Aún no has solicitado retiros.</p>';
    return;
  }
  const badgeClass = { pending: 'badge-pending', approved: 'badge-approved', rejected: 'badge-rejected' };
  const badgeText = { pending: 'Pendiente', approved: 'Pagado', rejected: 'Rechazado' };
  container.innerHTML = list
    .map((w) => `
      <div class="list-item">
        <div>US$${w.amount_usdt} USDT<div class="muted">${new Date(w.requested_at).toLocaleDateString()}</div></div>
        <span class="badge ${badgeClass[w.status]}">${badgeText[w.status]}</span>
      </div>
    `)
    .join('');
}

document.getElementById('clear-history-btn').addEventListener('click', async () => {
  const confirmClear = confirm('¿Borrar el historial de retiros ya pagados o rechazados? Esto no se puede deshacer. Los retiros pendientes NO se borran.');
  if (!confirmClear) return;
  await fetch('/api/withdrawals/history', { method: 'DELETE', headers: authHeaders });
  await loadWithdrawals();
});

let chatPollInterval = null;

async function loadChat() {
  const res = await fetch('/api/support/mine', { headers: authHeaders });
  const messages = await res.json();
  renderChatMessages(messages);
  if (!chatPollInterval) {
    chatPollInterval = setInterval(async () => {
      const r = await fetch('/api/support/mine', { headers: authHeaders });
      const msgs = await r.json();
      renderChatMessages(msgs);
    }, 5000);
  }
}

function renderChatMessages(messages) {
  const container = document.getElementById('chat-messages');
  if (messages.length === 0) {
    container.innerHTML = '<p class="muted">Aun no has escrito nada.</p>';
    return;
  }
  container.innerHTML = messages.map(function(m) {
    var isAdmin = m.sender === 'admin';
    return '<div style="margin-bottom:10px; display:flex; justify-content:' + (isAdmin ? 'flex-start' : 'flex-end') + '">' +
      '<div style="max-width:75%; padding:10px 14px; border-radius:12px; background:' + (isAdmin ? 'var(--bg-panel-raised)' : 'var(--mint)') + '; color:' + (isAdmin ? 'var(--text)' : '#06231B') + ';">' +
      '<div style="font-size:0.85rem;">' + m.message + '</div></div></div>';
  }).join('');
  container.scrollTop = container.scrollHeight;
}

document.getElementById('chat-send-btn').addEventListener('click', async () => {
  const input = document.getElementById('chat-input');
  const message = input.value.trim();
  if (!message) return;
  input.value = '';
  await fetch('/api/support/send', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ message: message }),
  });
  await loadChat();
});

document.getElementById('chat-input').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    document.getElementById('chat-send-btn').click();
  }
});

// ---------- Inicio ----------
(async function init() {
  await loadConfig();
  await loadUser();
  await loadAdHistory();

  // Muestra el banner de Domingo Dorado si hoy es domingo
  const today = new Date().getDay(); // 0 = domingo, en hora local del navegador
  if (today === 0) {
    document.getElementById('sunday-banner').style.display = 'block';
  }
})();
