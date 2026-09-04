// ============================================================
// SUPABASE CLIENT SINGLETON
// Sales AganceOnline
// ============================================================

// Load the Supabase JS library via CDN (included in HTML)
// This file exports a singleton supabase client used across all pages

let _supabaseClient = null;

function getSupabaseClient() {
    if (_supabaseClient) return _supabaseClient;

    const config = window.SUPABASE_CONFIG;
    if (!config || !config.url || !config.anonKey ||
        config.url.includes('YOUR_PROJECT_ID') || config.anonKey.includes('YOUR_ANON_KEY')) {
        console.error(
            '[Sales AganceOnline] ⚠️  Supabase is not configured!\n' +
            'Edit /config/supabase-config.js and replace the placeholder values.'
        );
        showConfigWarning();
        return null;
    }

    _supabaseClient = supabase.createClient(config.url, config.anonKey, {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
        }
    });

    return _supabaseClient;
}

function showConfigWarning() {
    // Only show once
    if (document.getElementById('config-warning')) return;
    const div = document.createElement('div');
    div.id = 'config-warning';
    div.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; z-index: 99999;
        background: #c00000; color: #fff; text-align: center;
        padding: 12px 20px; font-family: monospace; font-size: 14px;
    `;
    div.innerHTML = '⚠️ Supabase not configured. Edit <strong>/config/supabase-config.js</strong> with your project URL and Anon Key.';
    document.body.prepend(div);
}

// Export as global
window.getSupabaseClient = getSupabaseClient;
window.db = new Proxy({}, {
    get(_, prop) {
        const client = getSupabaseClient();
        return client ? client[prop] : null;
    }
});
