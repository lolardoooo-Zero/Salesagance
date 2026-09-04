// ============================================================
// AUTH HELPERS - Sales AganceOnline
// Handles login, register, logout, session, profile management
// ============================================================

const Auth = (() => {

    // --------------------------------------------------------
    // Get current session
    // --------------------------------------------------------
    async function getSession() {
        const client = getSupabaseClient();
        if (!client) return null;
        const { data: { session } } = await client.auth.getSession();
        return session;
    }

    // --------------------------------------------------------
    // Get current user's profile from profiles table
    // --------------------------------------------------------
    async function getUserProfile() {
        const client = getSupabaseClient();
        if (!client) return null;
        const session = await getSession();
        if (!session) return null;

        const { data, error } = await client
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();

        if (error) {
            console.error('Error fetching profile:', error);
            return null;
        }
        return data;
    }

    // --------------------------------------------------------
    // LOGIN
    // --------------------------------------------------------
    async function login(email, password) {
        const client = getSupabaseClient();
        if (!client) throw new Error('Supabase not configured');

        const { data, error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw error;

        // Update last_login timestamp
        await client
            .from('profiles')
            .update({ last_login: new Date().toISOString() })
            .eq('id', data.user.id);

        return data;
    }

    // --------------------------------------------------------
    // REGISTER
    // --------------------------------------------------------
    async function register(fullName, email, phone, password) {
        const client = getSupabaseClient();
        if (!client) throw new Error('Supabase not configured');

        const { data, error } = await client.auth.signUp({
            email,
            password,
            options: {
                data: {
                    full_name: fullName,
                    phone: phone
                }
            }
        });

        if (error) throw error;
        
        // Manually create profile as a fallback in case the database trigger fails
        if (data.user) {
            const { error: profileError } = await client.from('profiles').insert({
                id: data.user.id,
                full_name: fullName,
                email: email,
                phone: phone,
                role: 'sales',
                status: 'pending'
            });
            // Ignore duplicate key error (23505) in case trigger already inserted it
            if (profileError && profileError.code !== '23505') {
                console.error('Manual profile creation error:', profileError);
            }
        }
        
        return data;
    }

    // --------------------------------------------------------
    // LOGOUT
    // --------------------------------------------------------
    async function logout() {
        const client = getSupabaseClient();
        if (!client) return;
        await client.auth.signOut();
        window.location.href = './login.html';
    }

    // --------------------------------------------------------
    // UPDATE PROFILE
    // --------------------------------------------------------
    async function updateProfile(updates) {
        const client = getSupabaseClient();
        if (!client) throw new Error('Supabase not configured');
        const session = await getSession();
        if (!session) throw new Error('Not authenticated');

        // Only allow safe fields
        const allowed = { full_name: updates.full_name, phone: updates.phone };
        const { data, error } = await client
            .from('profiles')
            .update(allowed)
            .eq('id', session.user.id)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    return { getSession, getUserProfile, login, register, logout, updateProfile };
})();

window.Auth = Auth;
