const loginForm = document.querySelector('#login-form');
const signupForm = document.querySelector('#signup-form');
const authError = document.querySelector('#auth-error');

function showError(message) {
  if (authError) authError.textContent = message;
}

async function postForm(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return response.json();
}

if (loginForm) {
  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    showError('');
    const email = loginForm.querySelector('#email').value.trim();
    const password = loginForm.querySelector('#password').value;

    const data = await postForm('/api/auth/login', { email, password });
    if (data.message === 'Login successful.') {
      window.location.href = '/';
    } else {
      showError(data.message || 'Unable to login.');
    }
  });
}

if (signupForm) {
  signupForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    showError('');
    const displayName = signupForm.querySelector('#displayName').value.trim();
    const email = signupForm.querySelector('#email').value.trim();
    const password = signupForm.querySelector('#password').value;

    const data = await postForm('/api/auth/signup', { displayName, email, password });
    if (data.message === 'Signup successful.') {
      window.location.href = '/';
    } else {
      showError(data.message || 'Unable to sign up.');
    }
  });
}
