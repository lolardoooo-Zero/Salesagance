// ============================================================
// PROFILE JS - Sales AganceOnline
// ============================================================

(async () => {
    const profile = await Guards.requireApproved();
    if (!profile) return;

    Guards.applyRoleUI(profile);
    UI.initSidebar();

    const client = getSupabaseClient();

    const avatarEl = document.getElementById('user-avatar');
    if (avatarEl) avatarEl.textContent = (profile.full_name || 'U')[0].toUpperCase();

    // --------------------------------------------------------
    // Render profile header card
    // --------------------------------------------------------
    function renderHeader(p) {
        const initial = (p.full_name || p.email || 'U')[0].toUpperCase();
        document.getElementById('profile-header').innerHTML = `
            <div class="profile-avatar-large">${initial}</div>
            <div class="profile-header-info">
                <div class="profile-name">${p.full_name || '—'}</div>
                <div class="profile-email">${p.email}</div>
                <div class="profile-badges">
                    ${UI.userRoleBadge(p.role)}
                    ${UI.userStatusBadge(p.status)}
                </div>
            </div>
        `;
    }

    // --------------------------------------------------------
    // Render info grid
    // --------------------------------------------------------
    function renderInfo(p) {
        const infoItems = [
            { label: 'Full Name', value: p.full_name || '—' },
            { label: 'Email Address', value: p.email || '—' },
            { label: 'Phone Number', value: p.phone || '—' },
            { label: 'Account Role', value: UI.userRoleBadge(p.role) },
            { label: 'Account Status', value: UI.userStatusBadge(p.status) },
            { label: 'Member Since', value: UI.formatDate(p.created_at) },
            { label: 'Last Login', value: p.last_login ? UI.formatRelativeTime(p.last_login) : 'N/A' },
        ];

        document.getElementById('profile-info-grid').innerHTML = infoItems.map(item => `
            <div class="profile-info-item">
                <div class="profile-info-label">${item.label}</div>
                <div class="profile-info-value">${item.value}</div>
            </div>`).join('');
    }

    // --------------------------------------------------------
    // Prefill edit form
    // --------------------------------------------------------
    function prefillForm(p) {
        const nameEl = document.getElementById('edit-name');
        const phoneEl = document.getElementById('edit-phone');
        if (nameEl) nameEl.value = p.full_name || '';
        if (phoneEl) phoneEl.value = p.phone || '';
    }

    // Render everything
    renderHeader(profile);
    renderInfo(profile);
    prefillForm(profile);

    // --------------------------------------------------------
    // Save profile
    // --------------------------------------------------------
    document.getElementById('edit-profile-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('save-profile-btn');
        const fullName = document.getElementById('edit-name').value.trim();
        const phone    = document.getElementById('edit-phone').value.trim();

        if (!fullName) {
            UI.showError('Full name cannot be empty');
            return;
        }

        UI.setButtonLoading(btn, true, 'Saving...');
        try {
            const updated = await Auth.updateProfile({ full_name: fullName, phone });
            UI.showSuccess('Profile updated successfully!');
            renderHeader(updated);
            renderInfo(updated);
        } catch (err) {
            UI.showError('Failed: ' + err.message);
        } finally {
            UI.setButtonLoading(btn, false, '💾 Save Changes');
        }
    });

    // --------------------------------------------------------
    // Sign out
    // --------------------------------------------------------
    document.getElementById('sign-out-btn')?.addEventListener('click', async () => {
        const ok = await UI.confirm({
            title: 'Sign Out',
            message: 'Are you sure you want to sign out?',
            confirmText: 'Sign Out',
            icon: '🚪',
            type: 'danger'
        });
        if (ok) await Auth.logout();
    });

    document.getElementById('logout-btn')?.addEventListener('click', async (e) => {
        e.preventDefault();
        await Auth.logout();
    });

})();
