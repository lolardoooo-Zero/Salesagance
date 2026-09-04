// ============================================================
// ROUTE GUARDS - Sales AganceOnline
// Protect pages based on auth state, approval status, and role
// ============================================================

const Guards = (() => {

    // --------------------------------------------------------
    // Require any authenticated user
    // Redirects to login.html if not logged in
    // --------------------------------------------------------
    async function requireAuth() {
        const session = await Auth.getSession();
        if (!session) {
            window.location.replace('./login.html');
            return null;
        }
        return session;
    }

    // --------------------------------------------------------
    // Require approved user (approved status)
    // Pending/rejected/suspended users see status message
    // --------------------------------------------------------
    async function requireApproved() {
        const session = await requireAuth();
        if (!session) return null;

        const profile = await Auth.getUserProfile();
        if (!profile) {
            // Zombie session (user exists in auth but no profile). Sign out to fix loop.
            const client = getSupabaseClient();
            if (client) await client.auth.signOut();
            window.location.replace('./login.html');
            return null;
        }

        if (profile.status !== 'approved') {
            // Redirect to a status page instead of dashboard
            showAccessDenied(profile);
            return null;
        }

        return profile;
    }

    // --------------------------------------------------------
    // Require Owner role
    // --------------------------------------------------------
    async function requireOwner() {
        const profile = await requireApproved();
        if (!profile) return null;

        if (profile.role !== 'owner') {
            window.location.replace('./index.html');
            return null;
        }

        return profile;
    }

    // --------------------------------------------------------
    // Check auth and return profile (non-blocking, for pages
    // that need to know role but still render regardless)
    // --------------------------------------------------------
    async function getAuthState() {
        const session = await Auth.getSession();
        if (!session) return { session: null, profile: null };
        const profile = await Auth.getUserProfile();
        return { session, profile };
    }

    // --------------------------------------------------------
    // Show access denied overlay for non-approved users
    // --------------------------------------------------------
    function showAccessDenied(profile) {
        // Hide page content
        document.body.innerHTML = `
        <div style="
            min-height: 100vh;
            background: #080808;
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: Inter, sans-serif;
            padding: 24px;
        ">
            <div style="
                max-width: 480px;
                width: 100%;
                background: #111;
                border: 1px solid #2a2a2a;
                border-radius: 16px;
                padding: 48px 40px;
                text-align: center;
            ">
                <img src="./logo.jpg" alt="Logo" style="width: 80px; height: 80px; border-radius: 10px; object-fit: cover; margin: 0 auto 24px;">
                <div style="font-size: 3rem; margin-bottom: 16px;">${getStatusIcon(profile.status)}</div>
                <h1 style="font-size: 1.5rem; font-weight: 700; color: #fff; margin-bottom: 12px;">${getStatusTitle(profile.status)}</h1>
                <p style="color: #888; font-size: 0.9375rem; line-height: 1.7; margin-bottom: 32px;">${getStatusMessage(profile.status)}</p>
                <button onclick="Auth.logout()" style="
                    background: #c00000; color: #fff; border: none;
                    padding: 12px 24px; border-radius: 8px;
                    font-size: 0.9375rem; font-weight: 600;
                    cursor: pointer; letter-spacing: 0.04em;
                ">
                    Sign Out
                </button>
            </div>
        </div>`;
    }

    function getStatusIcon(status) {
        const icons = {
            pending:   '⏳',
            rejected:  '❌',
            suspended: '🚫'
        };
        return icons[status] || '⚠️';
    }

    function getStatusTitle(status) {
        const titles = {
            pending:   'Awaiting Approval',
            rejected:  'Access Denied',
            suspended: 'Account Suspended'
        };
        return titles[status] || 'Access Restricted';
    }

    function getStatusMessage(status) {
        const messages = {
            pending:   'Your account is currently pending Owner approval. You will be notified once your account is reviewed. Please check back later.',
            rejected:  'Your account registration has been rejected. Please contact your team Owner for more information.',
            suspended: 'Your account has been suspended. Please contact your team Owner to resolve this issue.'
        };
        return messages[status] || 'You do not have permission to access this page.';
    }

    // --------------------------------------------------------
    // Setup nav visibility based on role
    // Call after DOM is ready and profile is loaded
    // --------------------------------------------------------
    function applyRoleUI(profile) {
        if (!profile) return;

        // Hide owner-only elements for sales users
        if (profile.role !== 'owner') {
            document.querySelectorAll('[data-role="owner"]').forEach(el => {
                el.classList.add('hidden');
            });
        }

        // Set user info in nav
        const nameEls = document.querySelectorAll('[data-user-name]');
        nameEls.forEach(el => el.textContent = profile.full_name || 'User');

        const roleEls = document.querySelectorAll('[data-user-role]');
        roleEls.forEach(el => {
            el.textContent = profile.role.charAt(0).toUpperCase() + profile.role.slice(1);
        });

        const emailEls = document.querySelectorAll('[data-user-email]');
        emailEls.forEach(el => el.textContent = profile.email || '');
    }

    return { requireAuth, requireApproved, requireOwner, getAuthState, applyRoleUI };
})();

window.Guards = Guards;
