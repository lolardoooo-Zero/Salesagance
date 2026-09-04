// ============================================================
// USERS MANAGEMENT JS - Sales AganceOnline
// Owner only page
// ============================================================

(async () => {
    // Owner guard
    const profile = await Guards.requireOwner();
    if (!profile) return;

    Guards.applyRoleUI(profile);
    UI.initSidebar();

    const client = getSupabaseClient();
    if (!client) return;

    const avatarEl = document.getElementById('user-avatar');
    if (avatarEl) avatarEl.textContent = (profile.full_name || 'U')[0].toUpperCase();

    document.getElementById('logout-btn')?.addEventListener('click', async (e) => {
        e.preventDefault();
        if (await UI.confirm({ title:'Sign Out', message:'Sure?', confirmText:'Sign Out', icon:'🚪' }))
            await Auth.logout();
    });

    let allUsers = [];

    // --------------------------------------------------------
    // LOAD USERS
    // --------------------------------------------------------
    async function loadUsers() {
        try {
            const { data, error } = await client
                .from('profiles')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            allUsers = data || [];
            renderStats(allUsers);
            renderUsers(allUsers);
        } catch (err) {
            document.getElementById('users-tbody').innerHTML =
                `<tr><td colspan="7" style="text-align:center;color:var(--color-danger);padding:32px;">Failed to load users: ${err.message}</td></tr>`;
        }
    }

    // --------------------------------------------------------
    // STATS PILLS
    // --------------------------------------------------------
    function renderStats(users) {
        const el = document.getElementById('users-stats');
        const total    = users.length;
        const approved = users.filter(u => u.status === 'approved').length;
        const pending  = users.filter(u => u.status === 'pending').length;
        const rejected = users.filter(u => u.status === 'rejected').length;
        const suspended= users.filter(u => u.status === 'suspended').length;

        el.innerHTML = `
            <div class="users-stat-pill">Total: <strong>${total}</strong></div>
            <div class="users-stat-pill" style="border-color:var(--color-success);">✅ Approved: <strong>${approved}</strong></div>
            <div class="users-stat-pill" style="border-color:var(--color-warning);">⏳ Pending: <strong>${pending}</strong></div>
            <div class="users-stat-pill" style="border-color:var(--color-danger);">❌ Rejected: <strong>${rejected}</strong></div>
            ${suspended ? `<div class="users-stat-pill" style="border-color:var(--color-muted);">🚫 Suspended: <strong>${suspended}</strong></div>` : ''}
        `;
    }

    // --------------------------------------------------------
    // RENDER TABLE
    // --------------------------------------------------------
    function renderUsers(users) {
        const tbody = document.getElementById('users-tbody');
        const countEl = document.getElementById('results-count');
        if (countEl) countEl.textContent = `${users.length} user${users.length !== 1 ? 's' : ''}`;

        if (users.length === 0) {
            tbody.innerHTML = `
                <tr><td colspan="7" style="text-align:center;padding:40px;color:var(--color-muted);">
                    No users found
                </td></tr>`;
            return;
        }

        tbody.innerHTML = users.map(u => {
            const initial = (u.full_name || u.email || 'U')[0].toUpperCase();
            const isSelf = u.id === profile.id;
            const isPending = u.status === 'pending';

            // Build action menu
            const approveBtn = ['pending','rejected','suspended'].includes(u.status) && !isSelf
                ? `<button class="action-menu-item success" onclick="updateStatus('${u.id}','approved')">✅ Approve</button>` : '';
            const rejectBtn = u.status !== 'rejected' && !isSelf
                ? `<button class="action-menu-item danger" onclick="updateStatus('${u.id}','rejected')">❌ Reject</button>` : '';
            const suspendBtn = u.status === 'approved' && !isSelf
                ? `<button class="action-menu-item" onclick="updateStatus('${u.id}','suspended')">🚫 Suspend</button>` : '';
            const activateBtn = u.status === 'suspended' && !isSelf
                ? `<button class="action-menu-item success" onclick="updateStatus('${u.id}','approved')">▶️ Activate</button>` : '';
            const changeRoleBtn = !isSelf
                ? `<button class="action-menu-item" onclick="openChangeRole('${u.id}','${u.full_name}','${u.role}')">🔄 Change Role</button>` : '';
            const deleteBtn = !isSelf
                ? `<div class="action-menu-separator"></div><button class="action-menu-item danger" onclick="deleteUser('${u.id}')">🗑️ Delete</button>` : '';

            return `
                <tr class="${isPending ? 'pending-row' : ''}">
                    <td>
                        <div class="user-cell">
                            <div class="user-table-avatar">${initial}</div>
                            <div class="user-cell-info">
                                <div class="user-cell-name">${u.full_name || '—'} ${isSelf ? '<span class="badge badge-info" style="font-size:0.65rem;">You</span>' : ''}</div>
                                <div class="user-cell-email">${u.email}</div>
                            </div>
                        </div>
                    </td>
                    <td>${u.phone || '—'}</td>
                    <td>${UI.userRoleBadge(u.role)}</td>
                    <td>${UI.userStatusBadge(u.status)}</td>
                    <td>${UI.formatDate(u.created_at)}</td>
                    <td>${u.last_login ? UI.formatRelativeTime(u.last_login) : '—'}</td>
                    <td>
                        ${!isSelf ? `
                        <div class="action-menu" id="menu-${u.id}">
                            <button class="btn btn-sm btn-outline" onclick="toggleMenu('${u.id}')">Actions ▾</button>
                            <div class="action-menu-list">
                                ${approveBtn}${rejectBtn}${suspendBtn}${activateBtn}${changeRoleBtn}${deleteBtn}
                            </div>
                        </div>` : '<span class="text-muted text-sm">—</span>'}
                    </td>
                </tr>`;
        }).join('');
    }

    // --------------------------------------------------------
    // SEARCH & FILTER
    // --------------------------------------------------------
    function applyFilters() {
        const search = document.getElementById('search-input').value.toLowerCase().trim();
        const status = document.getElementById('filter-status').value;
        const role   = document.getElementById('filter-role').value;

        let filtered = allUsers;
        if (search) {
            filtered = filtered.filter(u =>
                (u.full_name||'').toLowerCase().includes(search) ||
                (u.email||'').toLowerCase().includes(search) ||
                (u.phone||'').includes(search)
            );
        }
        if (status) filtered = filtered.filter(u => u.status === status);
        if (role)   filtered = filtered.filter(u => u.role === role);
        renderUsers(filtered);
    }

    document.getElementById('search-input')?.addEventListener('input', applyFilters);
    document.getElementById('filter-status')?.addEventListener('change', applyFilters);
    document.getElementById('filter-role')?.addEventListener('change', applyFilters);
    document.getElementById('clear-filters')?.addEventListener('click', () => {
        document.getElementById('search-input').value = '';
        document.getElementById('filter-status').value = '';
        document.getElementById('filter-role').value = '';
        renderUsers(allUsers);
    });

    // --------------------------------------------------------
    // ACTION MENU TOGGLE
    // --------------------------------------------------------
    window.toggleMenu = function(id) {
        // Close all other menus
        document.querySelectorAll('.action-menu.open').forEach(m => {
            if (m.id !== `menu-${id}`) m.classList.remove('open');
        });
        document.getElementById(`menu-${id}`)?.classList.toggle('open');
    };

    // Close menus on outside click
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.action-menu')) {
            document.querySelectorAll('.action-menu.open').forEach(m => m.classList.remove('open'));
        }
    });

    // --------------------------------------------------------
    // UPDATE STATUS
    // --------------------------------------------------------
    window.updateStatus = async function(userId, newStatus) {
        document.querySelectorAll('.action-menu.open').forEach(m => m.classList.remove('open'));

        const labelMap = { approved: 'approve', rejected: 'reject', suspended: 'suspend' };
        const ok = await UI.confirm({
            title: `${cap(labelMap[newStatus] || newStatus)} User?`,
            message: `This will change the user's account status to "${newStatus}".`,
            confirmText: cap(labelMap[newStatus] || newStatus),
            type: newStatus === 'approved' ? 'success' : 'danger',
            icon: { approved:'✅', rejected:'❌', suspended:'🚫' }[newStatus] || '⚠️'
        });
        if (!ok) return;

        try {
            const { error } = await client.from('profiles').update({ status: newStatus }).eq('id', userId);
            if (error) throw error;
            UI.showSuccess(`User ${newStatus} successfully!`);
            await loadUsers();
        } catch (err) {
            UI.showError('Failed: ' + err.message);
        }
    };

    // --------------------------------------------------------
    // CHANGE ROLE
    // --------------------------------------------------------
    window.openChangeRole = function(userId, name, currentRole) {
        document.querySelectorAll('.action-menu.open').forEach(m => m.classList.remove('open'));
        document.getElementById('edit-role-user-id').value = userId;
        document.getElementById('edit-role-user-name').textContent = name;
        document.getElementById('edit-role-select').value = currentRole;
        UI.openModal('edit-role-modal');
    };

    document.getElementById('save-role-btn')?.addEventListener('click', async () => {
        const userId = document.getElementById('edit-role-user-id').value;
        const newRole = document.getElementById('edit-role-select').value;
        const btn = document.getElementById('save-role-btn');

        UI.setButtonLoading(btn, true, 'Saving...');
        try {
            const { error } = await client.from('profiles').update({ role: newRole }).eq('id', userId);
            if (error) throw error;
            UI.showSuccess('Role updated!');
            UI.closeModal('edit-role-modal');
            await loadUsers();
        } catch (err) {
            UI.showError('Failed: ' + err.message);
        } finally {
            UI.setButtonLoading(btn, false, 'Save Role');
        }
    });

    // --------------------------------------------------------
    // DELETE USER
    // --------------------------------------------------------
    window.deleteUser = async function(userId) {
        document.querySelectorAll('.action-menu.open').forEach(m => m.classList.remove('open'));
        const ok = await UI.confirm({
            title: 'Delete User',
            message: 'This will permanently delete this user and all their data. This cannot be undone.',
            confirmText: 'Delete Permanently',
            type: 'danger',
            icon: '🗑️'
        });
        if (!ok) return;

        try {
            // Delete profile (cascade handles auth.users via trigger)
            const { error } = await client.from('profiles').delete().eq('id', userId);
            if (error) throw error;
            UI.showSuccess('User deleted');
            await loadUsers();
        } catch (err) {
            UI.showError('Failed to delete: ' + err.message);
        }
    };
    // -- REALTIME ----------------------------------------------
    Realtime.autoRefresh('profiles', () => {
        loadUsers();
    }, { showToast: true, debounce: 900 });

    function cap(str) {
        if (!str) return '';
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    await loadUsers();
})();
