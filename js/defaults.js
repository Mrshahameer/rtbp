// Default route board — seeded into localStorage the first time the app runs.
// Every route belongs to a SOURCE (the buyer/publisher account these routes
// come from, e.g. "Cost Guide" or "Evercontractor"). This is what future
// admin-added routes must also carry, so the board can group/filter by it.
//
// Placeholders inside a url: {{CALLER_ID}} and {{ZIP}}
// `fields` lists which of those a route actually needs, in order.

const DEFAULT_CONFIG = {
  sources: [
    { id: 'cost-guide', name: 'Cost Guide', color: '#3FB8AF' },
    { id: 'evercontractor', name: 'Evercontractor', color: '#F2A93B' }
  ],
  routes: [
    {
      id: 'cg-siding',
      sourceId: 'cost-guide',
      name: 'Siding',
      url: 'https://rtb.moja.cloud/inbound_rtb/rtb_6b2efee00a1b47c5891c1f1b5294699a?CALLER_ID={{CALLER_ID}}&ZIP_CODE={{ZIP}}',
      fields: ['caller_id', 'zip']
    },
    {
      id: 'cg-bath',
      sourceId: 'cost-guide',
      name: 'Bath',
      url: 'https://rtb.moja.cloud/inbound_rtb/inbound_rtb_1774894662511_ea2800ce?CALLER_ID={{CALLER_ID}}&ZIP_CODE={{ZIP}}',
      fields: ['caller_id', 'zip']
    },
    {
      id: 'cg-roofing',
      sourceId: 'cost-guide',
      name: 'Roofing',
      url: 'https://rtb.moja.cloud/inbound_rtb/rtb_f492cc4906594d908ebf53a24c0db9ad?CALLER_ID={{CALLER_ID}}&ZIP_CODE={{ZIP}}',
      fields: ['caller_id', 'zip']
    },
    {
      id: 'cg-windows',
      sourceId: 'cost-guide',
      name: 'Windows',
      url: 'https://rtb.moja.cloud/inbound_rtb/rtb_b7820dee89bb402fbea459d2db4c41b1?CALLER_ID={{CALLER_ID}}&ZIP_CODE={{ZIP}}',
      fields: ['caller_id', 'zip']
    },
    {
      id: 'ec-bathrooms',
      sourceId: 'evercontractor',
      name: 'Bathrooms',
      url: 'https://rtb.moja.cloud/inbound_rtb/inbound_rtb_1780612426732_3aaf8557?CALLER_ID={{CALLER_ID}}',
      fields: ['caller_id']
    },
    {
      id: 'ec-roofing',
      sourceId: 'evercontractor',
      name: 'Roofing',
      url: 'https://rtb.moja.cloud/inbound_rtb/inbound_rtb_1780612109405_7672f4b1?CALLER_ID={{CALLER_ID}}',
      fields: ['caller_id']
    },
    {
      id: 'ec-windows',
      sourceId: 'evercontractor',
      name: 'Windows',
      url: 'https://rtb.moja.cloud/inbound_rtb/inbound_rtb_1780612283933_0705cdd8?CALLER_ID={{CALLER_ID}}',
      fields: ['caller_id']
    }
  ],
  // Payout display controls (admin-only)
  payoutVisible: false,   // false = show tier (1x/2x/3x), true = show actual $
  payoutRangeSize: 40     // each tier covers this many dollars: 1-40=1x, 41-80=2x …
};

const STORAGE_KEY = 'rtb_board_config_v1';

const BACKEND_URL = window.location.origin.startsWith('chrome-extension')
  ? 'https://rtbp.vercel.app' // Fallback for extension
  : window.location.origin;

let supabaseInstance = null;

async function getSupabaseClient() {
  if (supabaseInstance) return supabaseInstance;
  if (!window.supabase) {
    console.warn("Supabase library not loaded yet.");
    return null;
  }
  try {
    const res = await fetch(`${BACKEND_URL}/api/config`, { signal: AbortSignal.timeout(3000) });
    const { supabaseUrl, supabaseAnonKey } = await res.json();
    if (!supabaseUrl || !supabaseAnonKey) {
      console.warn("Supabase credentials not configured in Vercel environment variables.");
      return null;
    }
    supabaseInstance = window.supabase.createClient(supabaseUrl, supabaseAnonKey);
    return supabaseInstance;
  } catch (e) {
    console.error("Failed to initialize Supabase client:", e);
    return null;
  }
}

// Helper to load config fallback from localStorage
function fallbackLoadConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_CONFIG));
      return structuredClone(DEFAULT_CONFIG);
    }
    const parsed = JSON.parse(raw);
    if (parsed.payoutVisible  === undefined) parsed.payoutVisible  = false;
    if (parsed.payoutRangeSize === undefined) parsed.payoutRangeSize = 40;
    if (parsed.sources) parsed.sources.forEach(s => { if (s.paused === undefined) s.paused = false; });
    if (parsed.routes) parsed.routes.forEach(r => { if (r.paused === undefined) r.paused = false; });
    return parsed;
  } catch (e) {
    return structuredClone(DEFAULT_CONFIG);
  }
}

async function loadConfig() {
  const supabase = await getSupabaseClient();
  if (!supabase) {
    return fallbackLoadConfig();
  }

  try {
    const [sourcesRes, routesRes, settingsRes] = await Promise.all([
      supabase.from('sources').select('*').order('created_at'),
      supabase.from('routes').select('*').order('created_at'),
      supabase.from('settings').select('*')
    ]);

    if (sourcesRes.error) throw sourcesRes.error;
    if (routesRes.error) throw routesRes.error;

    // Auto-seed defaults if database is empty
    if ((!sourcesRes.data || sourcesRes.data.length === 0) && (!routesRes.data || routesRes.data.length === 0)) {
      console.log("Database is empty. Seeding defaults...");
      await saveConfig(DEFAULT_CONFIG);
      return loadConfig();
    }

    const sources = (sourcesRes.data || []).map(s => ({
      id: s.id,
      name: s.name,
      color: s.color,
      paused: s.paused
    }));

    const routes = (routesRes.data || []).map(r => ({
      id: r.id,
      sourceId: r.source_id,
      name: r.name,
      url: r.url,
      fields: r.fields,
      paused: r.paused
    }));

    const payoutRangeSizeSetting = settingsRes.data?.find(s => s.key === 'payoutRangeSize');
    const rangeSize = payoutRangeSizeSetting ? parseInt(payoutRangeSizeSetting.value) : 40;

    // Check currently logged-in user profile to determine payout visibility
    let payoutVisible = false;
    const currentUser = await checkAuth();
    if (currentUser) {
      payoutVisible = currentUser.reveal_payout === true;
    }

    return {
      sources,
      routes,
      payoutVisible,
      payoutRangeSize: rangeSize
    };
  } catch (e) {
    console.error("Supabase loadConfig failed, loading local:", e);
    return fallbackLoadConfig();
  }
}

async function saveConfig(newConfig) {
  const supabase = await getSupabaseClient();
  if (!supabase) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newConfig));
    return;
  }

  try {
    // 1. Update settings
    await supabase.from('settings').upsert({ key: 'payoutRangeSize', value: newConfig.payoutRangeSize });

    // 2. Load existing DB records to determine CRUD actions
    const [existingSourcesRes, existingRoutesRes] = await Promise.all([
      supabase.from('sources').select('id'),
      supabase.from('routes').select('id')
    ]);

    const dbSourceIds = new Set((existingSourcesRes.data || []).map(s => s.id));
    const dbRouteIds = new Set((existingRoutesRes.data || []).map(r => r.id));

    const newSourceIds = new Set(newConfig.sources.map(s => s.id));
    const newRouteIds = new Set(newConfig.routes.map(r => r.id));

    const sourcesToDelete = [...dbSourceIds].filter(id => !newSourceIds.has(id));
    const sourcesToUpsert = newConfig.sources.map(s => ({
      id: s.id,
      name: s.name,
      color: s.color,
      paused: s.paused ?? false
    }));

    const routesToDelete = [...dbRouteIds].filter(id => !newRouteIds.has(id));
    const routesToUpsert = newConfig.routes.map(r => ({
      id: r.id,
      source_id: r.sourceId,
      name: r.name,
      url: r.url,
      fields: r.fields,
      paused: r.paused ?? false
    }));

    // Execute operations ordered to respect SQL constraints
    if (routesToDelete.length > 0) {
      await supabase.from('routes').delete().in('id', routesToDelete);
    }
    if (sourcesToDelete.length > 0) {
      await supabase.from('sources').delete().in('id', sourcesToDelete);
    }
    if (sourcesToUpsert.length > 0) {
      await supabase.from('sources').upsert(sourcesToUpsert);
    }
    if (routesToUpsert.length > 0) {
      await supabase.from('routes').upsert(routesToUpsert);
    }
  } catch (e) {
    console.error("Supabase saveConfig failed, saving local:", e);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newConfig));
  }
}

// Authentication Helpers
async function checkAuth() {
  try {
    const raw = localStorage.getItem('rtb_user_session');
    if (!raw) return null;
    const session = JSON.parse(raw);
    
    // Verify user profile against DB to fetch live reveal_payout settings
    const profile = await loadUserProfile(session.id);
    if (!profile) {
      localStorage.removeItem('rtb_user_session');
      return null;
    }
    return profile;
  } catch (e) {
    console.error("checkAuth failed:", e);
    return null;
  }
}

async function loadUserProfile(userId) {
  try {
    const supabase = await getSupabaseClient();
    if (!supabase) {
      return { id: 'local-admin', email: 'admin@webstersolutions.com', reveal_payout: true, is_admin: true };
    }
    const { data: profile } = await supabase.from('user_profiles').select('*').eq('id', userId).maybeSingle();
    return profile;
  } catch (e) {
    console.error("loadUserProfile failed:", e);
    return null;
  }
}

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

// ── Automatic Theme management ─────────────────────────────
function initTheme() {
  let theme = 'light';
  try {
    theme = localStorage.getItem('theme') || 'light';
  } catch (e) {
    theme = 'light';
  }
  
  if (theme === 'dark') {
    document.documentElement.classList.add('dark-theme');
    document.body.classList.add('dark-theme');
  } else {
    document.documentElement.classList.remove('dark-theme');
    document.body.classList.remove('dark-theme');
  }
  
  // Wait for DOM to wire button
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireThemeBtn);
  } else {
    wireThemeBtn();
  }

  function wireThemeBtn() {
    const btn = document.getElementById('theme-toggle-btn');
    if (!btn) return;
    btn.textContent = theme === 'dark' ? '🌙' : '☀️';
    btn.addEventListener('click', () => {
      const isDark = document.documentElement.classList.toggle('dark-theme');
      document.body.classList.toggle('dark-theme', isDark);
      const newTheme = isDark ? 'dark' : 'light';
      btn.textContent = isDark ? '🌙' : '☀️';
      try {
        localStorage.setItem('theme', newTheme);
      } catch (e) {}
    });
  }
}
initTheme();
