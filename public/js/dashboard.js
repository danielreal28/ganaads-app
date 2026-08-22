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
};

tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    tabs.forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    Object.values(sections).forEach((s) => (s.style.display = 'none'));
    sections[tab.dataset.section].style.display = 'block';
    if (tab.dataset.section === 'referrals') loadReferrals();
    if (tab.dataset.section === 'withdraw') loadWithdrawals();
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
    `Retiro mínimo: $${appConfig.minWithdrawalUsdt.toFixed(2)} USDT.`;
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
  document.getElementById('balance-usdt').textContent = `$${user.balance_usdt}`;
  document.getElementById('balance-points').textContent = `${user.balance_points} puntos`;
  document.getElementById('stat-referrals').textContent = user.referral_count;
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
  document.getElementById('stat-views').textContent = history.length;
}

// ---------- Ver anuncio y ganar puntos ----------
const watchBtn = document.getElementById('watch-btn');
const watchError = document.getElementById('watch-error');
const watchSuccess = document.getElementById('watch-success');
const adSlot = document.getElementById('ad-slot');

watchBtn.addEventListener('click', () => {
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
    adSlot.textContent = 'Modo de prueba: simulando anuncio (5s)...';
    setTimeout(() => {
      adSlot.textContent = 'El anuncio aparecerá aquí';
      creditAdView();
    }, 5000);
  }
});

async function creditAdView() {
  try {
    const res = await fetch('/api/ads/view', { method: 'POST', headers: authHeaders });
    const data = await res.json();
    if (!res.ok) {
      watchError.textContent = data.error || 'No se pudo registrar el anuncio.';
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
      withdrawSuccess.textContent = `Solicitud enviada por $${data.amount_usdt} USDT. Te pagaremos pronto.`;
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
  if (list.length === 0) {
    container.innerHTML = '<p class="muted">Aún no has solicitado retiros.</p>';
    return;
  }
  const badgeClass = { pending: 'badge-pending', approved: 'badge-approved', rejected: 'badge-rejected' };
  const badgeText = { pending: 'Pendiente', approved: 'Pagado', rejected: 'Rechazado' };
  container.innerHTML = list
    .map((w) => `
      <div class="list-item">
        <div>$${w.amount_usdt} USDT<div class="muted">${new Date(w.requested_at).toLocaleDateString()}</div></div>
        <span class="badge ${badgeClass[w.status]}">${badgeText[w.status]}</span>
      </div>
    `)
    .join('');
}

// ---------- Inicio ----------
(async function init() {
  await loadConfig();
  await loadUser();
  await loadAdHistory();
})();
