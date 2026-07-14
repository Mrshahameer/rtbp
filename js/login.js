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
        const { data: user, error } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('email', email)
          .eq('password', password)
          .maybeSingle();

        if (error) throw error;
        if (!user) throw new Error('Invalid email or password.');

        // Save custom session
        localStorage.setItem('rtb_user_session', JSON.stringify({ id: user.id, email: user.email, is_admin: user.is_admin }));
        window.location.href = '/index.html';
      } else {
        // Check if email already registered
        const { data: existing, error: checkErr } = await supabase
          .from('user_profiles')
          .select('id')
          .eq('email', email)
          .maybeSingle();

        if (checkErr) throw checkErr;
        if (existing) throw new Error('Email is already registered.');

        // First user gets admin privileges
        const { data: allUsers } = await supabase.from('user_profiles').select('id').limit(1);
        const isFirst = !allUsers || allUsers.length === 0;

        const { error: insertErr } = await supabase
          .from('user_profiles')
          .insert({
            email,
            password,
            is_admin: isFirst,
            reveal_payout: isFirst
          });

        if (insertErr) throw insertErr;

        // Auto sign in
        const { data: newUser } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('email', email)
          .maybeSingle();

        localStorage.setItem('rtb_user_session', JSON.stringify({ id: newUser.id, email: newUser.email, is_admin: newUser.is_admin }));
        window.location.href = '/index.html';
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
