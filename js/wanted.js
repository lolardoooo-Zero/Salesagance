// ============================================================
// WANTED CARS JS - Sales AganceOnline
// ============================================================

(async () => {
    const profile = await Guards.requireApproved();
    if (!profile) return;

    Guards.applyRoleUI(profile);
    UI.initSidebar();

    const client = getSupabaseClient();
    if (!client) return;

    const isOwner = profile.role === 'owner';
    const avatarEl = document.getElementById('user-avatar');
    if (avatarEl) avatarEl.textContent = (profile.full_name || 'U')[0].toUpperCase();

    if (isOwner) {
        const btn = document.getElementById('add-wanted-btn');
        if (btn) btn.style.display = '';
    }

    document.getElementById('logout-btn')?.addEventListener('click', async (e) => {
        e.preventDefault();
        if (await UI.confirm({ title:'Sign Out', message:'Sure you want to sign out?', confirmText:'Sign Out', icon:'🚪' }))
            await Auth.logout();
    });

    let allWanted = [];
    let editingId = null;

    // --------------------------------------------------------
    // LOAD
    // --------------------------------------------------------
    async function loadWanted() {
        const grid = document.getElementById('wanted-grid');
        grid.innerHTML = `<div style="grid-column:1/-1;display:flex;justify-content:center;padding:60px;"><div class="loader-spinner" style="width:40px;height:40px;border-width:3px;"></div></div>`;

        try {
            const { data, error } = await client
                .from('wanted_cars')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            allWanted = data || [];
            renderWanted(allWanted);
        } catch (err) {
            grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;color:var(--color-danger);padding:60px;">Failed to load: ${err.message}</div>`;
        }
    }

    // --------------------------------------------------------
    // RENDER
    // --------------------------------------------------------
    function renderWanted(items) {
        const grid = document.getElementById('wanted-grid');
        const countEl = document.getElementById('results-count');
        if (countEl) countEl.textContent = `${items.length} request${items.length !== 1 ? 's' : ''}`;

        if (items.length === 0) {
            grid.innerHTML = `
                <div style="grid-column:1/-1;">
                    <div class="empty-state">
                        <div class="empty-state-icon">🔍</div>
                        <h3>No Wanted Cars</h3>
                        <p>No wanted car requests match your search.</p>
                    </div>
                </div>`;
            return;
        }

        grid.innerHTML = items.map(w => {
            const ownerActions = isOwner ? `
                <div class="wanted-card-actions">
                    <button class="btn btn-sm btn-outline" onclick="event.stopPropagation(); openEditWanted('${w.id}')">✏️</button>
                    <button class="btn btn-sm btn-danger" onclick="event.stopPropagation(); deleteWanted('${w.id}')">🗑️</button>
                </div>` : '';

            const budgetText = w.min_budget || w.max_budget
                ? `${w.min_budget ? UI.formatPrice(w.min_budget) : '?'} – ${w.max_budget ? UI.formatPrice(w.max_budget) : '?'}`
                : 'Flexible';

            return `
                <div class="wanted-card priority-${w.priority}" onclick="openWantedDetail('${w.id}')">
                    <div class="wanted-card-header">
                        <div class="wanted-card-icon">🔍</div>
                        <div class="wanted-card-badges">
                            ${UI.priorityBadge(w.priority)}
                            ${UI.wantedStatusBadge(w.status)}
                        </div>
                    </div>
                    <div class="wanted-card-title">${w.brand} ${w.model}</div>
                    <div class="wanted-card-subtitle">
                        ${w.min_year || '?'}–${w.max_year || '?'} · Qty: ${w.quantity}
                    </div>
                    <div class="wanted-card-specs">
                        <div class="wanted-spec">
                            <div class="wanted-spec-label">Budget</div>
                            <div class="wanted-spec-value">${budgetText}</div>
                        </div>
                        <div class="wanted-spec">
                            <div class="wanted-spec-label">Max Mileage</div>
                            <div class="wanted-spec-value">${w.max_mileage ? UI.formatMileage(w.max_mileage) : 'Any'}</div>
                        </div>
                        <div class="wanted-spec">
                            <div class="wanted-spec-label">Transmission</div>
                            <div class="wanted-spec-value">${cap(w.transmission) || 'Any'}</div>
                        </div>
                        <div class="wanted-spec">
                            <div class="wanted-spec-label">Fuel</div>
                            <div class="wanted-spec-value">${cap(w.fuel_type) || 'Any'}</div>
                        </div>
                    </div>
                    <div class="wanted-card-footer">
                        <span class="wanted-card-date">📅 ${UI.formatDate(w.created_at)}</span>
                        ${ownerActions}
                        ${!isOwner ? '<span class="text-muted text-sm">Click for details</span>' : ''}
                    </div>
                </div>`;
        }).join('');
    }

    // --------------------------------------------------------
    // SEARCH & FILTER
    // --------------------------------------------------------
    function applyFilters() {
        const search = document.getElementById('search-input').value.toLowerCase().trim();
        const status = document.getElementById('filter-status').value;
        const priority = document.getElementById('filter-priority').value;

        let filtered = allWanted;
        if (search) {
            filtered = filtered.filter(w =>
                w.brand.toLowerCase().includes(search) ||
                w.model.toLowerCase().includes(search) ||
                (w.location || '').toLowerCase().includes(search)
            );
        }
        if (status) filtered = filtered.filter(w => w.status === status);
        if (priority) filtered = filtered.filter(w => w.priority === priority);
        renderWanted(filtered);
    }

    document.getElementById('search-input')?.addEventListener('input', applyFilters);
    document.getElementById('filter-status')?.addEventListener('change', applyFilters);
    document.getElementById('filter-priority')?.addEventListener('change', applyFilters);
    document.getElementById('clear-filters')?.addEventListener('click', () => {
        document.getElementById('search-input').value = '';
        document.getElementById('filter-status').value = '';
        document.getElementById('filter-priority').value = '';
        renderWanted(allWanted);
    });

    // --------------------------------------------------------
    // DETAIL MODAL
    // --------------------------------------------------------
    window.openWantedDetail = function(id) {
        const w = allWanted.find(x => x.id === id);
        if (!w) return;

        document.getElementById('wanted-detail-heading').textContent = `${w.brand} ${w.model}`;

        const budgetText = w.min_budget || w.max_budget
            ? `${w.min_budget ? UI.formatPrice(w.min_budget) : '?'} – ${w.max_budget ? UI.formatPrice(w.max_budget) : '?'}`
            : 'Flexible';

        const specs = [
            { label: 'Brand', value: w.brand },
            { label: 'Model', value: w.model },
            { label: 'Year Range', value: `${w.min_year || 'Any'} – ${w.max_year || 'Any'}` },
            { label: 'Budget Range', value: budgetText },
            { label: 'Preferred Color', value: w.preferred_color || 'Any' },
            { label: 'Max Mileage', value: w.max_mileage ? UI.formatMileage(w.max_mileage) : 'Any' },
            { label: 'Transmission', value: cap(w.transmission) || 'Any' },
            { label: 'Fuel Type', value: cap(w.fuel_type) || 'Any' },
            { label: 'Location', value: w.location || 'Any' },
            { label: 'Quantity Needed', value: w.quantity },
            { label: 'Priority', value: UI.priorityBadge(w.priority) },
            { label: 'Status', value: UI.wantedStatusBadge(w.status) },
            { label: 'Created', value: UI.formatDate(w.created_at) },
        ];

        document.getElementById('wanted-detail-body').innerHTML = `
            <div class="specs-grid" style="grid-template-columns:1fr 1fr;gap:10px;">
                ${specs.map(s => `
                    <div class="spec-item">
                        <div class="spec-item-label">${s.label}</div>
                        <div class="spec-item-value">${s.value}</div>
                    </div>`).join('')}
            </div>
            ${w.description ? `
                <div style="margin-top: 20px;">
                    <div class="form-label" style="margin-bottom: 8px;">Notes</div>
                    <div class="car-detail-description">${w.description}</div>
                </div>` : ''}`;

        const footer = document.getElementById('wanted-detail-footer');
        let footerHTML = '<button class="btn btn-outline" data-close-modal="wanted-detail-modal">Close</button>';
        if (isOwner) {
            footerHTML = `
                <button class="btn btn-outline" data-close-modal="wanted-detail-modal">Close</button>
                <button class="btn btn-success btn-sm" onclick="markFound('${w.id}')">✅ Mark Found</button>
                <button class="btn btn-outline btn-sm" onclick="UI.closeModal('wanted-detail-modal'); openEditWanted('${w.id}')">✏️ Edit</button>
                <button class="btn btn-danger btn-sm" onclick="UI.closeModal('wanted-detail-modal'); deleteWanted('${w.id}')">🗑️ Delete</button>
            `;
        }
        footer.innerHTML = footerHTML;

        UI.openModal('wanted-detail-modal');
    };

    // --------------------------------------------------------
    // ADD FORM
    // --------------------------------------------------------
    if (isOwner) {
        document.getElementById('add-wanted-btn')?.addEventListener('click', () => {
            editingId = null;
            document.getElementById('wanted-form-title').textContent = 'Add Wanted Car';
            document.getElementById('wanted-form').reset();
            document.getElementById('wanted-id').value = '';
            document.getElementById('wf-quantity').value = 1;
            document.getElementById('wf-priority').value = 'medium';
            document.getElementById('wf-status').value = 'active';
            UI.openModal('wanted-form-modal');
        });
    }

    window.openEditWanted = async function(id) {
        if (!isOwner) return;
        const w = allWanted.find(x => x.id === id);
        if (!w) return;
        editingId = id;
        document.getElementById('wanted-form-title').textContent = 'Edit Wanted Car';
        document.getElementById('wanted-id').value = w.id;

        const fields = {
            'wf-brand': w.brand, 'wf-model': w.model,
            'wf-min-year': w.min_year||'', 'wf-max-year': w.max_year||'',
            'wf-min-budget': w.min_budget||'', 'wf-max-budget': w.max_budget||'',
            'wf-color': w.preferred_color||'', 'wf-max-mileage': w.max_mileage||'',
            'wf-transmission': w.transmission||'', 'wf-fuel': w.fuel_type||'',
            'wf-location': w.location||'', 'wf-quantity': w.quantity||1,
            'wf-priority': w.priority||'medium', 'wf-status': w.status||'active',
            'wf-description': w.description||''
        };
        Object.entries(fields).forEach(([id, val]) => {
            const el = document.getElementById(id);
            if (el) el.value = val;
        });

        UI.openModal('wanted-form-modal');
    };

    // Save
    document.getElementById('save-wanted-btn')?.addEventListener('click', async () => {
        if (!isOwner) return;
        const btn = document.getElementById('save-wanted-btn');
        UI.setButtonLoading(btn, true, 'Saving...');

        try {
            const data = {
                brand: document.getElementById('wf-brand').value.trim(),
                model: document.getElementById('wf-model').value.trim(),
                min_year: parseInt(document.getElementById('wf-min-year').value) || null,
                max_year: parseInt(document.getElementById('wf-max-year').value) || null,
                min_budget: parseFloat(document.getElementById('wf-min-budget').value) || null,
                max_budget: parseFloat(document.getElementById('wf-max-budget').value) || null,
                preferred_color: document.getElementById('wf-color').value.trim() || null,
                max_mileage: parseInt(document.getElementById('wf-max-mileage').value) || null,
                transmission: document.getElementById('wf-transmission').value || null,
                fuel_type: document.getElementById('wf-fuel').value || null,
                location: document.getElementById('wf-location').value.trim() || null,
                quantity: parseInt(document.getElementById('wf-quantity').value) || 1,
                priority: document.getElementById('wf-priority').value,
                status: document.getElementById('wf-status').value,
                description: document.getElementById('wf-description').value.trim() || null,
                created_by: profile.id
            };

            if (!data.brand || !data.model) {
                UI.showError('Brand and Model are required');
                return;
            }

            if (editingId) {
                const { error } = await client.from('wanted_cars').update(data).eq('id', editingId);
                if (error) throw error;
                UI.showSuccess('Request updated!');
            } else {
                const { error } = await client.from('wanted_cars').insert(data);
                if (error) throw error;
                UI.showSuccess('Wanted car request added!');
            }

            UI.closeModal('wanted-form-modal');
            await loadWanted();
        } catch (err) {
            UI.showError('Failed: ' + err.message);
        } finally {
            UI.setButtonLoading(btn, false, '💾 Save Request');
        }
    });

    // Mark as found
    window.markFound = async function(id) {
        if (!isOwner) return;
        try {
            const { error } = await client.from('wanted_cars').update({ status: 'found' }).eq('id', id);
            if (error) throw error;
            UI.showSuccess('Marked as found!');
            UI.closeModal('wanted-detail-modal');
            await loadWanted();
        } catch (err) {
            UI.showError(err.message);
        }
    };

    // Delete
    window.deleteWanted = async function(id) {
        if (!isOwner) return;
        const w = allWanted.find(x => x.id === id);
        if (!w) return;
        const ok = await UI.confirm({
            title: 'Delete Request',
            message: `Delete "${w.brand} ${w.model}" request?`,
            confirmText: 'Delete',
            type: 'danger', icon: '🗑️'
        });
        if (!ok) return;
        try {
            const { error } = await client.from('wanted_cars').delete().eq('id', id);
            if (error) throw error;
            UI.showSuccess('Deleted!');
            await loadWanted();
        } catch (err) {
            UI.showError(err.message);
        }
    };
    // -- REALTIME ----------------------------------------------
    Realtime.autoRefresh('wanted_cars', () => {
        loadWanted();
    }, { showToast: true, debounce: 700 });

    function cap(str) {
        if (!str) return '';
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    await loadWanted();
})();
