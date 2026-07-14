(() => {
  const form = document.getElementById('auth-form');
  const emailInput = document.getElementById('auth-email');
  const passwordInput = document.getElementById('auth-password');
  const submitBtn = document.getElementById('submit-btn');
  const errBox = document.getElementById('auth-err');
  const toggleLink = document.getElementById('toggle-link');
  const toggleText = document.getElementById('toggle-text');
  const subtitle = document.getElementById('header-subtitle');

  let mode = 'signin'; // 'signin' or 'signup'

  toggleLink.addEventListener('click', (e) => {
    e.preventDefault();
    errBox.style.display = 'none';
    if (mode === 'signin') {
      mode = 'signup';
      subtitle.textContent = 'Create a new account';
      submitBtn.textContent = 'Sign Up';
      toggleText.textContent = 'Already have an account?';
      toggleLink.textContent = 'Sign In';
    } else {
      mode = 'signin';
      subtitle.textContent = 'Sign in to access your Route Board';
      submitBtn.textContent = 'Sign In';
      toggleText.textContent = "Don't have an account?";
      toggleLink.textContent = 'Sign Up';
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errBox.style.display = 'none';
    submitBtn.disabled = true;
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    const supabase = await getSupabaseClient();
    if (!supabase) {
      errBox.textContent = 'Supabase client not initialized. Check your configuration.';
      errBox.style.display = 'block';
      submitBtn.disabled = false;
      return;
    }

    try {
      if (mode === 'signin') {
        const { error, data } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        window.location.href = '/index.html';
      } else {
        const { error, data } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (data?.session) {
          window.location.href = '/index.html';
        } else {
          errBox.style.background = 'rgba(95,208,138,0.08)';
          errBox.style.borderColor = 'rgba(95,208,138,0.2)';
          errBox.style.color = 'var(--green)';
          errBox.textContent = 'Registration successful! Check your email to confirm your account (or log in directly if confirmation is disabled in your Supabase dashboard).';
          errBox.style.display = 'block';
        }
      }
    } catch (err) {
      errBox.style.background = 'rgba(229,88,107,0.08)';
      errBox.style.borderColor = 'rgba(229,88,107,0.2)';
      errBox.style.color = 'var(--red)';
      errBox.textContent = err.message || 'Authentication failed.';
      errBox.style.display = 'block';
    } finally {
      submitBtn.disabled = false;
    }
  });
})();
