const form = document.getElementById('auth-form');
const errorBox = document.getElementById('error-box');
const submitBtn = document.getElementById('submit-btn');
const formTitle = document.getElementById('form-title');
const switchText = document.getElementById('switch-text');
const switchLink = document.getElementById('switch-link');
const refField = document.getElementById('ref-field');
const refInput = document.getElementById('refcode');

let mode = 'register'; // o 'login'

// Si alguien entra con un link de invitación tipo index.html?ref=abc123,
// se precarga el código de referido automáticamente.
const params = new URLSearchParams(window.location.search);
const refFromUrl = params.get('ref');
if (refFromUrl) {
  refInput.value = refFromUrl;
}

function setMode(newMode) {
  mode = newMode;
  errorBox.classList.remove('show');
  if (mode === 'register') {
    formTitle.textContent = 'Crea tu cuenta';
    submitBtn.textContent = 'Crear cuenta';
    switchText.textContent = '¿Ya tienes cuenta?';
    switchLink.textContent = 'Inicia sesión';
    refField.style.display = 'block';
    document.getElementById('forgot-link-wrap').style.display = 'none';
  } else {
    formTitle.textContent = 'Inicia sesión';
    submitBtn.textContent = 'Entrar';
    switchText.textContent = '¿No tienes cuenta?';
    switchLink.textContent = 'Regístrate';
    refField.style.display = 'none';
    document.getElementById('forgot-link-wrap').style.display = 'block';
  }
}

switchLink.addEventListener('click', (e) => {
  e.preventDefault();
  setMode(mode === 'register' ? 'login' : 'register');
});

// Si ya hay una sesión guardada, va directo al panel
if (localStorage.getItem('token')) {
  window.location.href = 'dashboard.html';
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorBox.classList.remove('show');
  submitBtn.disabled = true;

  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const refCode = refInput.value.trim();

  const endpoint = mode === 'register' ? '/api/auth/register' : '/api/auth/login';
  const body = mode === 'register' ? { email, password, refCode } : { email, password };

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();

    if (!res.ok) {
      errorBox.textContent = data.error || 'Algo salió mal. Intenta de nuevo.';
      errorBox.classList.add('show');
      submitBtn.disabled = false;
      return;
    }

    localStorage.setItem('token', data.token);
    window.location.href = 'dashboard.html';
  } catch (err) {
    errorBox.textContent = 'No se pudo conectar con el servidor. Revisa tu conexión.';
    errorBox.classList.add('show');
    submitBtn.disabled = false;
  }
});

setMode('register');
