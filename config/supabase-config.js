// ============================================================
// SUPABASE CONFIGURATION
// Replace these values with your actual Supabase project credentials.
// Find them at: https://supabase.com/dashboard → Project → Settings → API
// ============================================================

const SUPABASE_CONFIG = {
    url: 'https://vujeegxrmnhofgfnaxow.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1amVlZ3hybW5ob2ZnZm5heG93Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg1MDYwMDMsImV4cCI6MjEwNDA4MjAwM30.6RXK8MKzNQqt-kAQhw9KAd181eMUEmfmTP-vvCw_qok'
};

// Export for use in supabase-client.js
window.SUPABASE_CONFIG = SUPABASE_CONFIG;
