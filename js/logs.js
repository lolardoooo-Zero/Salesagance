// ============================================================
// LOGS JS — Sales AganceOnline
// Activity log utility (Logs.record) + full Logs page logic
// This file is loaded on ALL pages for the record() function,
// and also contains the page logic for logs.html
// ============================================================

// ============================================================
// SHARED UTILITY: Logs.record()
// Call from any page after any important action
// ============================================================
const Logs = (() => {

    /**
     * Record an activity log entry in Supabase.
     * @param {string} actionType  - e.g. 'car_added', 'car_edited', 'login'
     * @param {string} targetType  - e.g. 'car', 'user', 'sale_submission', 'wanted_car'
     * @param {string|null} targetId   - UUID of the affected record
     * @param {string} description - Human-readable description
     * @param {object|null} oldData    - Previous values (JSONB)
     * @param {object|null} newData    - New values (JSONB)
     */
    async function record(actionType, targetType, targetId, description, oldData = null, newData = null) {
        try {
            const client = getSupabaseClient();
            if (!client) return;

            const { error } = await client.rpc('log_activity', {
                p_action_type: actionType,
                p_target_type: targetType,
                p_target_id:   targetId || null,
                p_description: description,
                p_old_data:    oldData ? JSON.parse(JSON.stringify(oldData)) : null,
                p_new_data:    newData ? JSON.parse(JSON.stringify(newData)) : null
            });

            if (error) console.warn('[Logs] Failed to record activity:', error.message);
        } catch (err) {
            console.warn('[Logs] record() exception:', err.message);
        }
    }

    return { record };
})();

window.Logs = Logs;

// ============================================================
// PAGE LOGIC: Only runs on logs.html
// ============================================================
if (document.getElementById('logs-table-body')) {
    (async () => {
        const profile = await Guards.requireOwner();
        if (!profile) return;

        Guards.applyRoleUI(profile);
        UI.initSidebar();

        const client = getSupabaseClient();
        if (!client) return;

        const avatarEl = document.getElementById('user-avatar');
        if (avatarEl) avatarEl.textContent = (profile.full_name || 'O')[0].toUpperCase();

        document.getElementById('logout-btn')?.addEventListener('click', async (e) => {
            e.preventDefault();
            if (await UI.confirm({ title: 'Sign Out', message: 'Sure you want to sign out?', confirmText: 'Sign Out', icon: '🚪' }))
                await Auth.logout();
        });

        // --------------------------------------------------------
        // STATE
        // --------------------------------------------------------
        let allLogs = [];
        let filteredLogs = [];
        let currentPage = 1;
        const PAGE_SIZE = 50;

        // --------------------------------------------------------
        // LOAD LOGS
        // --------------------------------------------------------
        async function loadLogs() {
            const tbody = document.getElementById('logs-table-body');
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;">
                <div class="loader-spinner" style="width:32px;height:32px;border-width:3px;margin:0 auto;"></div>
            </td></tr>`;

            try {
                const { data, error } = await client
                    .from('activity_logs')
                    .select('*')
                    .order('created_at', { ascending: false })
                    .limit(2000);

                if (error) throw error;

                allLogs = data || [];
                applyFilters();
                updateStats(allLogs);
            } catch (err) {
                console.error(err);
                tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--color-danger);padding:40px;">
                    Failed to load logs: ${err.message}
                </td></tr>`;
            }
        }

        // --------------------------------------------------------
        // FILTER & SEARCH
        // --------------------------------------------------------
        function applyFilters() {
            const search   = (document.getElementById('log-search')?.value || '').toLowerCase().trim();
            const action   = document.getElementById('log-filter-action')?.value || '';
            const role     = document.getElementById('log-filter-role')?.value || '';
            const dateFrom = document.getElementById('log-date-from')?.value || '';
            const dateTo   = document.getElementById('log-date-to')?.value || '';

            filteredLogs = allLogs.filter(log => {
                if (search) {
                    const haystack = [log.user_name, log.description, log.action_type, log.target_type].join(' ').toLowerCase();
                    if (!haystack.includes(search)) return false;
                }
                if (action && log.action_type !== action) return false;
                if (role   && log.user_role !== role)   return false;
                if (dateFrom) {
                    if (new Date(log.created_at) < new Date(dateFrom)) return false;
                }
                if (dateTo) {
                    const to = new Date(dateTo);
                    to.setHours(23, 59, 59, 999);
                    if (new Date(log.created_at) > to) return false;
                }
                return true;
            });

            currentPage = 1;
            renderTable();
            updatePagination();

            const countEl = document.getElementById('log-results-count');
            if (countEl) countEl.textContent = `${filteredLogs.length} log${filteredLogs.length !== 1 ? 's' : ''}`;
        }

        // --------------------------------------------------------
        // RENDER TABLE
        // --------------------------------------------------------
        function renderTable() {
            const tbody = document.getElementById('logs-table-body');
            const start = (currentPage - 1) * PAGE_SIZE;
            const end   = start + PAGE_SIZE;
            const page  = filteredLogs.slice(start, end);

            if (page.length === 0) {
                tbody.innerHTML = `<tr><td colspan="6">
                    <div class="empty-state" style="padding:48px;">
                        <div class="empty-state-icon">📋</div>
                        <h3>No Logs Found</h3>
                        <p>Try adjusting your filters or date range.</p>
                    </div>
                </td></tr>`;
                return;
            }

            tbody.innerHTML = page.map(log => {
                const date = new Date(log.created_at);
                const dateStr = date.toLocaleDateString('en-GB', { day:'2-digit', month:'2-digit', year:'numeric' });
                const timeStr = date.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' });

                const actionBadge = getActionBadge(log.action_type);
                const roleBadge   = log.user_role === 'owner'
                    ? `<span class="badge badge-red">Owner</span>`
                    : `<span class="badge badge-info">Sales</span>`;

                const hasChanges = log.old_data || log.new_data;
                const changesHTML = hasChanges ? buildChangesHTML(log) : '';

                return `<tr class="log-row" data-id="${log.id}">
                    <td class="log-datetime">
                        <div class="log-date">${dateStr}</div>
                        <div class="log-time">${timeStr}</div>
                    </td>
                    <td>
                        <div class="log-user-name">${escHtml(log.user_name)}</div>
                        <div style="margin-top:4px;">${roleBadge}</div>
                    </td>
                    <td>${actionBadge}</td>
                    <td>
                        <div class="log-target-type">${log.target_type ? cap(log.target_type.replace(/_/g,' ')) : '—'}</div>
                        ${log.description ? `<div class="log-description">${escHtml(log.description)}</div>` : ''}
                    </td>
                    <td class="log-changes-cell">
                        ${changesHTML ? `
                            <button class="btn btn-sm btn-ghost log-expand-btn" onclick="toggleLogDetails('${log.id}')">
                                👁 View
                            </button>
                            <div class="log-details hidden" id="log-detail-${log.id}">
                                ${changesHTML}
                            </div>` : '<span class="text-muted text-sm">—</span>'}
                    </td>
                </tr>`;
            }).join('');
        }

        window.toggleLogDetails = function(id) {
            const el = document.getElementById(`log-detail-${id}`);
            if (el) el.classList.toggle('hidden');
        };

        function buildChangesHTML(log) {
            const parts = [];
            if (log.old_data && typeof log.old_data === 'object') {
                parts.push(`<div class="log-change-block old-value">
                    <span class="log-change-label">Before:</span>
                    <pre>${escHtml(JSON.stringify(log.old_data, null, 2))}</pre>
                </div>`);
            }
            if (log.new_data && typeof log.new_data === 'object') {
                parts.push(`<div class="log-change-block new-value">
                    <span class="log-change-label">After:</span>
                    <pre>${escHtml(JSON.stringify(log.new_data, null, 2))}</pre>
                </div>`);
            }
            return parts.join('');
        }

        // --------------------------------------------------------
        // ACTION TYPE BADGE
        // --------------------------------------------------------
        function getActionBadge(action) {
            const map = {
                // Auth
                'login':               { cls: 'log-badge-auth',   icon: '🔐', label: 'Login' },
                'logout':              { cls: 'log-badge-auth',   icon: '🚪', label: 'Logout' },
                'register':            { cls: 'log-badge-auth',   icon: '📝', label: 'Register' },
                // User management
                'user_approved':       { cls: 'log-badge-success', icon: '✅', label: 'User Approved' },
                'user_rejected':       { cls: 'log-badge-danger',  icon: '❌', label: 'User Rejected' },
                'user_suspended':      { cls: 'log-badge-danger',  icon: '🚫', label: 'User Suspended' },
                'role_changed':        { cls: 'log-badge-warning', icon: '🔄', label: 'Role Changed' },
                // Cars
                'car_added':           { cls: 'log-badge-success', icon: '🚗', label: 'Car Added' },
                'car_edited':          { cls: 'log-badge-warning', icon: '✏️', label: 'Car Edited' },
                'car_deleted':         { cls: 'log-badge-danger',  icon: '🗑️', label: 'Car Deleted' },
                'car_status_changed':  { cls: 'log-badge-warning', icon: '🔀', label: 'Status Changed' },
                // Images
                'image_added':         { cls: 'log-badge-info',    icon: '📷', label: 'Image Added' },
                'image_removed':       { cls: 'log-badge-danger',  icon: '🗑️', label: 'Image Removed' },
                // Inspection
                'inspection_uploaded': { cls: 'log-badge-info',    icon: '📋', label: 'Inspection Uploaded' },
                'inspection_replaced': { cls: 'log-badge-warning', icon: '🔄', label: 'Inspection Replaced' },
                'inspection_removed':  { cls: 'log-badge-danger',  icon: '🗑️', label: 'Inspection Removed' },
                // Wanted
                'wanted_added':        { cls: 'log-badge-success', icon: '🔍', label: 'Wanted Added' },
                'wanted_edited':       { cls: 'log-badge-warning', icon: '✏️', label: 'Wanted Edited' },
                'wanted_deleted':      { cls: 'log-badge-danger',  icon: '🗑️', label: 'Wanted Deleted' },
                // Sale submissions
                'submission_added':    { cls: 'log-badge-success', icon: '📤', label: 'Submission Added' },
                'submission_edited':   { cls: 'log-badge-warning', icon: '✏️', label: 'Submission Edited' },
                'submission_approved': { cls: 'log-badge-success', icon: '✅', label: 'Submission Approved' },
                'submission_rejected': { cls: 'log-badge-danger',  icon: '❌', label: 'Submission Rejected' },
                'submission_not_interested': { cls: 'log-badge-muted', icon: '👋', label: 'Not Interested' },
                'offer_price_changed': { cls: 'log-badge-warning', icon: '💰', label: 'Offer Price Changed' },
            };
            const b = map[action] || { cls: 'log-badge-muted', icon: '📌', label: cap(action?.replace(/_/g,' ') || 'Action') };
            return `<span class="log-action-badge ${b.cls}">${b.icon} ${b.label}</span>`;
        }

        // --------------------------------------------------------
        // PAGINATION
        // --------------------------------------------------------
        function updatePagination() {
            const totalPages = Math.max(1, Math.ceil(filteredLogs.length / PAGE_SIZE));
            const pageInfo = document.getElementById('page-info');
            if (pageInfo) pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;

            const prevBtn = document.getElementById('page-prev');
            const nextBtn = document.getElementById('page-next');
            if (prevBtn) prevBtn.disabled = currentPage <= 1;
            if (nextBtn) nextBtn.disabled = currentPage >= totalPages;
        }

        document.getElementById('page-prev')?.addEventListener('click', () => {
            if (currentPage > 1) { currentPage--; renderTable(); updatePagination(); }
        });
        document.getElementById('page-next')?.addEventListener('click', () => {
            const totalPages = Math.ceil(filteredLogs.length / PAGE_SIZE);
            if (currentPage < totalPages) { currentPage++; renderTable(); updatePagination(); }
        });

        // --------------------------------------------------------
        // STATS CARDS
        // --------------------------------------------------------
        function updateStats(logs) {
            const today = new Date().toDateString();
            const todayLogs = logs.filter(l => new Date(l.created_at).toDateString() === today);

            const totalEl   = document.getElementById('stat-total-logs');
            const todayEl   = document.getElementById('stat-today-logs');
            const actionsEl = document.getElementById('stat-unique-actions');

            if (totalEl)   totalEl.textContent   = logs.length.toLocaleString();
            if (todayEl)   todayEl.textContent   = todayLogs.length.toLocaleString();
            if (actionsEl) actionsEl.textContent = [...new Set(logs.map(l => l.action_type))].length;
        }

        // --------------------------------------------------------
        // EXPORT CSV
        // --------------------------------------------------------
        document.getElementById('export-csv-btn')?.addEventListener('click', () => {
            const headers = ['Date', 'Time', 'User', 'Role', 'Action', 'Target Type', 'Description'];
            const rows = filteredLogs.map(log => {
                const d = new Date(log.created_at);
                return [
                    d.toLocaleDateString('en-GB'),
                    d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
                    log.user_name,
                    log.user_role,
                    log.action_type,
                    log.target_type || '',
                    (log.description || '').replace(/,/g, ';')
                ];
            });

            const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
            const blob = new Blob([csv], { type: 'text/csv' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `activity_logs_${new Date().toISOString().split('T')[0]}.csv`;
            a.click();
        });

        // --------------------------------------------------------
        // FILTER EVENTS
        // --------------------------------------------------------
        ['log-search', 'log-filter-action', 'log-filter-role', 'log-date-from', 'log-date-to'].forEach(id => {
            document.getElementById(id)?.addEventListener('input', applyFilters);
            document.getElementById(id)?.addEventListener('change', applyFilters);
        });

        document.getElementById('clear-log-filters')?.addEventListener('click', () => {
            ['log-search', 'log-filter-action', 'log-filter-role', 'log-date-from', 'log-date-to'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            applyFilters();
        });

        // --------------------------------------------------------
        // HELPERS
        // --------------------------------------------------------
        function cap(str) {
            if (!str) return '';
            return str.charAt(0).toUpperCase() + str.slice(1);
        }
        function escHtml(str) {
            if (!str) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
        }

        // ── LOAD ──────────────────────────────────────────────
        await loadLogs();

        // Realtime refresh
        Realtime.autoRefresh('activity_logs', () => loadLogs(), { showToast: false, debounce: 1000 });

    })();
}
