const API_AUTH = '/api/auth/login';
const API_SIGNUP = '/api/auth/signup';

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('loginForm');
  const msg = document.getElementById('loginMessage');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.style.display = 'none';
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const register = document.getElementById('registerToggle').checked;
    const confirm = document.getElementById('confirm')?.value;

    if (register) {
      // basic confirm validation
      if (!confirm || confirm !== password) {
        msg.textContent = 'Passwords do not match';
        msg.style.display = 'block';
        return;
      }

      try {
        const resSignup = await fetch(API_SIGNUP, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });
        if (!resSignup.ok) {
          const err = await resSignup.json().catch(() => ({}));
          msg.textContent = err.message || 'Signup failed';
          msg.style.display = 'block';
          return;
        }
        // auto-login after signup
      } catch (err) {
        msg.textContent = 'Network error during signup';
        msg.style.display = 'block';
        console.error(err);
        return;
      }
    }

    try {
      const res = await fetch(API_AUTH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        msg.textContent = err.message || 'Login failed';
        msg.style.display = 'block';
        return;
      }

      const data = await res.json();
      // store token for later
      if (data && data.token) {
        sessionStorage.setItem('authToken', data.token);
        // also set a cookie so server static protection can read it
        document.cookie = `token=${data.token}; path=/;`;
        // redirect to the app main page
        window.location.href = '/index.html';
        return;
      }

      // If login returned non-token (older behavior), try signup fallback
      msg.textContent = 'Login failed';
      msg.style.display = 'block';
    } catch (err) {
      msg.textContent = 'Network error';
      msg.style.display = 'block';
      console.error(err);
    }
  });

  // toggle confirm password visibility when switching to register
  const registerToggle = document.getElementById('registerToggle');
  const confirmGroup = document.getElementById('confirmGroup');
  registerToggle.addEventListener('change', (e) => {
    confirmGroup.style.display = e.target.checked ? 'block' : 'none';
    // change submit button label
    const submitBtn = document.querySelector('#loginForm button[type="submit"]');
    submitBtn.textContent = e.target.checked ? 'Create account' : 'Sign in';
  });

  // guest button: create a temporary user with random suffix and login
  const guestBtn = document.getElementById('guestBtn');
  guestBtn.addEventListener('click', async (ev) => {
    ev.preventDefault();
    const uname = 'guest_' + Math.random().toString(36).substring(2,8);
    const pwd = Math.random().toString(36);
    try {
      const resSignup = await fetch(API_SIGNUP, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: uname, password: pwd }),
      });
      if (!resSignup.ok) {
        // fallback: try to login as admin
        console.warn('Guest signup failed');
        return;
      }
      // login
      const resLogin = await fetch(API_AUTH, { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ username: uname, password: pwd }) });
      if (!resLogin.ok) return;
      const data = await resLogin.json();
      if (data && data.token) {
        sessionStorage.setItem('authToken', data.token);
        document.cookie = `token=${data.token}; path=/;`;
        window.location.href = '/index.html';
      }
    } catch (err) {
      console.error(err);
    }
  });
});
