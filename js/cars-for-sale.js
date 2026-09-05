// ============================================================
// CARS FOR SALE JS — Sales AganceOnline
// Sales: Submit / edit own cars. Owner: Review, approve, reject
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

    // Logout
    document.getElementById('logout-btn')?.addEventListener('click', async (e) => {
        e.preventDefault();
        if (await UI.confirm({ title: 'Sign Out', message: 'Sure you want to sign out?', confirmText: 'Sign Out', icon: '🚪' }))
            await Auth.logout();
    });

    // Hide "Submit Car" button for owners (they review, not submit)
    const addBtn = document.getElementById('add-submission-btn');
    if (isOwner && addBtn) {
        addBtn.textContent = '＋ Add Submission';
        // Owner can also add on behalf, keep visible
    }

    // --------------------------------------------------------
    // STATE
    // --------------------------------------------------------
    let allSubmissions = [];
    let pendingImages  = [];
    let existingImages = [];
    let editingId      = null;

    // --------------------------------------------------------
    // LOAD SUBMISSIONS
    // --------------------------------------------------------
    async function loadSubmissions() {
        const grid = document.getElementById('cfs-grid');
        grid.innerHTML = `<div style="grid-column:1/-1;display:flex;justify-content:center;padding:60px;">
            <div class="loader-spinner" style="width:40px;height:40px;border-width:3px;"></div>
        </div>`;

        try {
            let query = client
                .from('cars_for_sale')
                .select(`
                    *,
                    cars_for_sale_images(id, url, is_primary, sort_order),
                    profiles!submitted_by(full_name, email)
                `)
                .order('created_at', { ascending: false });

            // Sales users see only their own submissions
            if (!isOwner) {
                query = query.eq('submitted_by', profile.id);
            }

            const { data, error } = await query;
            if (error) throw error;

            allSubmissions = data || [];
            populateUserFilter(allSubmissions);
            applyFilters();
        } catch (err) {
            console.error(err);
            grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;color:var(--color-danger);padding:60px;">
                Failed to load submissions: ${err.message}
            </div>`;
        }
    }

    // --------------------------------------------------------
    // POPULATE USER FILTER (Owner only)
    // --------------------------------------------------------
    function populateUserFilter(submissions) {
        const sel = document.getElementById('cfs-filter-user');
        if (!sel || !isOwner) return;
        const users = {};
        submissions.forEach(s => {
            if (s.profiles) users[s.submitted_by] = s.profiles.full_name;
        });
        sel.innerHTML = '<option value="">All Users</option>' +
            Object.entries(users).map(([id, name]) =>
                `<option value="${id}">${escHtml(name)}</option>`
            ).join('');
    }

    // --------------------------------------------------------
    // APPLY FILTERS
    // --------------------------------------------------------
    function applyFilters() {
        const search = (document.getElementById('cfs-search')?.value || '').toLowerCase().trim();
        const status = document.getElementById('cfs-filter-status')?.value || '';
        const userId = document.getElementById('cfs-filter-user')?.value || '';

        let filtered = allSubmissions;

        if (search) {
            filtered = filtered.filter(s =>
                s.brand.toLowerCase().includes(search) ||
                s.model.toLowerCase().includes(search) ||
                (s.trim || '').toLowerCase().includes(search) ||
                (s.location || '').toLowerCase().includes(search) ||
                String(s.year).includes(search) ||
                (s.profiles?.full_name || '').toLowerCase().includes(search)
            );
        }
        if (status) filtered = filtered.filter(s => s.status === status);
        if (userId) filtered = filtered.filter(s => s.submitted_by === userId);

        renderGrid(filtered);
    }

    ['cfs-search', 'cfs-filter-status', 'cfs-filter-user'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', applyFilters);
        document.getElementById(id)?.addEventListener('change', applyFilters);
    });

    document.getElementById('cfs-clear-filters')?.addEventListener('click', () => {
        ['cfs-search', 'cfs-filter-status', 'cfs-filter-user'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        applyFilters();
    });

    // --------------------------------------------------------
    // RENDER GRID
    // --------------------------------------------------------
    function renderGrid(submissions) {
        const grid = document.getElementById('cfs-grid');
        const countEl = document.getElementById('cfs-results-count');
        if (countEl) countEl.textContent = `${submissions.length} submission${submissions.length !== 1 ? 's' : ''}`;

        if (submissions.length === 0) {
            grid.innerHTML = `<div class="cfs-empty">
                <div class="empty-state">
                    <div class="empty-state-icon">🏷️</div>
                    <h3>No Submissions Yet</h3>
                    <p>${isOwner ? 'Sales users have not submitted any cars yet.' : 'You have not submitted any cars yet. Click "Submit Car" to get started.'}</p>
                </div>
            </div>`;
            return;
        }

        grid.innerHTML = submissions.map(sub => {
            const images  = sub.cars_for_sale_images || [];
            const primary = images.find(i => i.is_primary) || images[0];
            const imgHTML = primary
                ? `<img src="${primary.url}" alt="${sub.brand} ${sub.model}" loading="lazy">`
                : `<div class="cfs-card-image-placeholder">🚗</div>`;

            const statusBadge = saleStatusBadge(sub.status);
            const submitter   = sub.profiles?.full_name || 'Unknown';
            const isOwnSub    = sub.submitted_by === profile.id;
            const canEdit     = isOwner || (isOwnSub && sub.status === 'pending');

            const cardActions = canEdit ? `
                <div class="cfs-card-actions">
                    <button class="btn btn-sm btn-outline" onclick="event.stopPropagation(); openEditSubmission('${sub.id}')" title="Edit">✏️</button>
                    ${isOwner || isOwnSub ? `<button class="btn btn-sm btn-danger" onclick="event.stopPropagation(); deleteSubmission('${sub.id}')" title="Delete">🗑️</button>` : ''}
                </div>` : '';

            const offerLine = sub.owner_offer_price
                ? `<div class="cfs-offer-price">🏷️ Owner Offer: ${UI.formatPrice(sub.owner_offer_price)}</div>`
                : '';

            return `
                <div class="cfs-card" onclick="openReview('${sub.id}')">
                    <div class="cfs-card-image">
                        ${imgHTML}
                        <div class="cfs-card-status-badge">${statusBadge}</div>
                        ${images.length > 1 ? `<div class="cfs-card-img-count">📷 ${images.length}</div>` : ''}
                    </div>
                    <div class="cfs-card-body">
                        <div class="cfs-card-brand">${escHtml(sub.brand)}</div>
                        <div class="cfs-card-name">${escHtml(sub.model)} <span class="cfs-card-year">${sub.year}</span></div>
                        ${sub.trim ? `<div class="text-muted text-sm">${escHtml(sub.trim)}</div>` : ''}
                        <div class="cfs-card-submitter">👤 ${escHtml(submitter)}</div>
                        <div class="cfs-card-specs">
                            ${sub.mileage != null ? `<span class="cfs-card-spec">🛣️ ${UI.formatMileage(sub.mileage)}</span>` : ''}
                            ${sub.transmission ? `<span class="cfs-card-spec">⚙️ ${cap(sub.transmission)}</span>` : ''}
                            ${sub.fuel_type ? `<span class="cfs-card-spec">⛽ ${cap(sub.fuel_type)}</span>` : ''}
                        </div>
                    </div>
                    <div class="cfs-card-footer">
                        <div>
                            <div class="cfs-seller-price">${UI.formatPrice(sub.seller_price)}</div>
                            ${offerLine}
                        </div>
                        ${cardActions}
                    </div>
                </div>`;
        }).join('');
    }

    // --------------------------------------------------------
    // OPEN REVIEW / DETAIL MODAL
    // --------------------------------------------------------
    window.openReview = function(id) {
        const sub = allSubmissions.find(s => s.id === id);
        if (!sub) return;

        const images  = sub.cars_for_sale_images || [];
        const primary = images.find(i => i.is_primary) || images[0];
        const submitter = sub.profiles?.full_name || 'Unknown';

        document.getElementById('review-modal-title').textContent =
            `${sub.year} ${sub.brand} ${sub.model}${sub.trim ? ' · ' + sub.trim : ''}`;

        // Gallery
        const galleryHTML = `
            <div class="review-gallery">
                <div class="review-gallery-main">
                    ${primary
                        ? `<img id="review-main-img" src="${primary.url}" alt="Car image">`
                        : `<div class="cfs-card-image-placeholder" style="height:100%;">🚗</div>`}
                </div>
                ${images.length > 1 ? `
                    <div class="review-gallery-thumbs">
                        ${images.map((img, i) => `
                            <div class="review-gallery-thumb ${i === 0 ? 'active' : ''}"
                                onclick="switchReviewImage('${img.url}', this)">
                                <img src="${img.url}" loading="lazy">
                            </div>`).join('')}
                    </div>` : ''}
            </div>`;

        // Specs panel
        const specsHTML = `
            <div class="review-specs-panel">
                <!-- Submitter -->
                <div>
                    <div class="text-muted text-sm" style="margin-bottom:4px;">Submitted By</div>
                    <div style="font-weight:700; font-size:1rem;">${escHtml(submitter)}</div>
                    <div style="margin-top:6px;">${saleStatusBadge(sub.status)}</div>
                </div>

                <!-- Price Block -->
                <div class="review-price-block">
                    <div class="review-price-label">Asking Price (by Sales)</div>
                    <div class="review-price-value">${UI.formatPrice(sub.seller_price)}</div>
                    ${sub.owner_offer_price ? `
                        <div style="margin-top:8px;">
                            <div class="review-price-label">Owner Offer Price</div>
                            <div class="review-offer-price">${UI.formatPrice(sub.owner_offer_price)}</div>
                        </div>` : ''}
                </div>

                <!-- Specs Grid -->
                <div class="specs-grid">
                    ${buildSpecRow('Brand', sub.brand)}
                    ${buildSpecRow('Model', sub.model)}
                    ${buildSpecRow('Year', sub.year)}
                    ${buildSpecRow('Trim', sub.trim)}
                    ${buildSpecRow('Color', sub.color)}
                    ${buildSpecRow('Mileage', sub.mileage != null ? UI.formatMileage(sub.mileage) : null)}
                    ${buildSpecRow('Transmission', cap(sub.transmission))}
                    ${buildSpecRow('Fuel Type', cap(sub.fuel_type))}
                    ${buildSpecRow('Engine', sub.engine)}
                    ${buildSpecRow('Location', sub.location)}
                </div>

                <!-- Description -->
                ${sub.description ? `
                    <div>
                        <div class="form-label" style="margin-bottom:6px;">Description</div>
                        <div class="car-detail-description">${escHtml(sub.description)}</div>
                    </div>` : ''}

                <!-- Seller Notes -->
                ${sub.seller_notes ? `
                    <div>
                        <div class="form-label" style="margin-bottom:6px;">Seller Notes</div>
                        <div class="car-detail-description">${escHtml(sub.seller_notes)}</div>
                    </div>` : ''}

                <!-- Owner Notes (if set) -->
                ${sub.owner_notes ? `
                    <div style="background:rgba(var(--color-accent-rgb),0.06); border:1px solid rgba(var(--color-accent-rgb),0.2); border-radius:var(--radius-md); padding:14px;">
                        <div class="form-label" style="margin-bottom:6px; color:var(--color-accent);">Owner Notes</div>
                        <div style="font-size:0.9rem; color:var(--color-text);">${escHtml(sub.owner_notes)}</div>
                    </div>` : ''}

                <!-- Owner Action Section -->
                ${isOwner ? buildOwnerActionSection(sub) : ''}
            </div>`;

        document.getElementById('review-modal-body').innerHTML = galleryHTML + specsHTML;

        // Footer
        const footer = document.getElementById('review-modal-footer');
        let footerHTML = `<button class="btn btn-outline" data-close-modal="cfs-review-modal">Close</button>`;
        if (isOwner || (sub.submitted_by === profile.id && sub.status === 'pending')) {
            footerHTML += `<button class="btn btn-outline" onclick="UI.closeModal('cfs-review-modal'); openEditSubmission('${sub.id}')">✏️ Edit</button>`;
        }
        if (isOwner || sub.submitted_by === profile.id) {
            footerHTML += `<button class="btn btn-danger" onclick="UI.closeModal('cfs-review-modal'); deleteSubmission('${sub.id}')">🗑️ Delete</button>`;
        }
        footer.innerHTML = footerHTML;

        UI.openModal('cfs-review-modal');
    };

    function buildOwnerActionSection(sub) {
        return `
            <div class="review-owner-section">
                <div class="review-owner-section-title">🔑 Owner Actions</div>
                <div class="form-group" style="margin-bottom:12px;">
                    <label class="form-label">Owner Offer Price (EGP)</label>
                    <input type="number" id="review-offer-price" class="form-control"
                        value="${sub.owner_offer_price || ''}" placeholder="Enter your offer...">
                </div>
                <div class="form-group" style="margin-bottom:12px;">
                    <label class="form-label">Owner Notes</label>
                    <textarea id="review-owner-notes" class="form-control" rows="2"
                        placeholder="Add a note for the sales user...">${escHtml(sub.owner_notes || '')}</textarea>
                </div>
                <div class="review-action-buttons">
                    <button class="btn btn-sm btn-approve" onclick="reviewAction('${sub.id}', 'approved')">✅ Approve</button>
                    <button class="btn btn-sm btn-reject" onclick="reviewAction('${sub.id}', 'rejected')">❌ Reject</button>
                    <button class="btn btn-sm btn-ni" onclick="reviewAction('${sub.id}', 'not_interested')">👋 Not Interested</button>
                    <button class="btn btn-sm btn-outline" onclick="saveOfferPrice('${sub.id}')">💰 Save Offer</button>
                </div>
            </div>`;
    }

    function buildSpecRow(label, value) {
        if (!value && value !== 0) return '';
        return `<div class="spec-item">
            <div class="spec-item-label">${label}</div>
            <div class="spec-item-value">${escHtml(String(value))}</div>
        </div>`;
    }

    window.switchReviewImage = function(url, thumbEl) {
        const mainImg = document.getElementById('review-main-img');
        if (mainImg) mainImg.src = url;
        document.querySelectorAll('.review-gallery-thumb').forEach(t => t.classList.remove('active'));
        thumbEl.classList.add('active');
    };

    // --------------------------------------------------------
    // OWNER: REVIEW ACTIONS
    // --------------------------------------------------------
    window.reviewAction = async function(id, newStatus) {
        if (!isOwner) return;

        const sub = allSubmissions.find(s => s.id === id);
        if (!sub) return;

        const offerPriceEl = document.getElementById('review-offer-price');
        const notesEl      = document.getElementById('review-owner-notes');
        const offerPrice   = offerPriceEl ? (parseFloat(offerPriceEl.value) || null) : sub.owner_offer_price;
        const ownerNotes   = notesEl ? notesEl.value.trim() || null : sub.owner_notes;

        const labels = { approved: 'Approve', rejected: 'Reject', not_interested: 'Mark as Not Interested' };
        const ok = await UI.confirm({
            title: `${labels[newStatus]} Submission`,
            message: `Are you sure you want to ${labels[newStatus].toLowerCase()} this car?`,
            confirmText: labels[newStatus],
            icon: newStatus === 'approved' ? '✅' : newStatus === 'rejected' ? '❌' : '👋',
            type: newStatus === 'approved' ? 'info' : 'danger'
        });
        if (!ok) return;

        try {
            const { error } = await client
                .from('cars_for_sale')
                .update({ status: newStatus, owner_offer_price: offerPrice, owner_notes: ownerNotes })
                .eq('id', id);
            if (error) throw error;

            const actionMap = {
                approved:      'submission_approved',
                rejected:      'submission_rejected',
                not_interested:'submission_not_interested'
            };
            await Logs.record(
                actionMap[newStatus],
                'sale_submission', id,
                `${newStatus.replace('_',' ')} submission: ${sub.year} ${sub.brand} ${sub.model} (by ${sub.profiles?.full_name || 'Unknown'})`,
                { status: sub.status },
                { status: newStatus, owner_offer_price: offerPrice }
            );

            UI.showSuccess(`Submission ${newStatus.replace('_', ' ')} successfully`);
            UI.closeModal('cfs-review-modal');
            await loadSubmissions();
        } catch (err) {
            UI.showError('Failed: ' + err.message);
        }
    };

    window.saveOfferPrice = async function(id) {
        if (!isOwner) return;
        const sub = allSubmissions.find(s => s.id === id);
        if (!sub) return;

        const offerPriceEl = document.getElementById('review-offer-price');
        const notesEl      = document.getElementById('review-owner-notes');
        const offerPrice   = parseFloat(offerPriceEl?.value) || null;
        const ownerNotes   = notesEl?.value.trim() || null;

        try {
            const { error } = await client
                .from('cars_for_sale')
                .update({ owner_offer_price: offerPrice, owner_notes: ownerNotes })
                .eq('id', id);
            if (error) throw error;

            await Logs.record(
                'offer_price_changed',
                'sale_submission', id,
                `Owner set offer price for ${sub.year} ${sub.brand} ${sub.model}`,
                { owner_offer_price: sub.owner_offer_price },
                { owner_offer_price: offerPrice }
            );

            UI.showSuccess('Offer price saved!');
            await loadSubmissions();
        } catch (err) {
            UI.showError('Failed: ' + err.message);
        }
    };

    // --------------------------------------------------------
    // ADD / EDIT SUBMISSION
    // --------------------------------------------------------
    document.getElementById('add-submission-btn')?.addEventListener('click', () => {
        openAddForm();
    });

    function openAddForm() {
        editingId      = null;
        pendingImages  = [];
        existingImages = [];
        document.getElementById('cfs-form-title').textContent = 'Submit Car for Sale';
        document.getElementById('cfs-form').reset();
        document.getElementById('cfs-id').value = '';
        document.getElementById('cfs-image-preview').innerHTML = '';
        document.getElementById('cfs-save-btn').textContent = '📤 Submit Car';
        UI.openModal('cfs-form-modal');
    }

    window.openEditSubmission = function(id) {
        const sub = allSubmissions.find(s => s.id === id);
        if (!sub) return;

        // Sales can only edit their own pending submissions
        if (!isOwner && (sub.submitted_by !== profile.id || sub.status !== 'pending')) {
            UI.showError('You can only edit your own pending submissions.');
            return;
        }

        editingId      = id;
        pendingImages  = [];
        existingImages = (sub.cars_for_sale_images || []).map(img => ({ ...img }));

        document.getElementById('cfs-form-title').textContent = 'Edit Submission';
        document.getElementById('cfs-id').value = sub.id;

        const fields = {
            'cfs-brand': sub.brand, 'cfs-model': sub.model, 'cfs-year': sub.year,
            'cfs-trim': sub.trim || '', 'cfs-color': sub.color || '',
            'cfs-mileage': sub.mileage || 0, 'cfs-transmission': sub.transmission || '',
            'cfs-fuel': sub.fuel_type || '', 'cfs-engine': sub.engine || '',
            'cfs-price': sub.seller_price || 0, 'cfs-location': sub.location || '',
            'cfs-description': sub.description || '',
            'cfs-seller-notes': sub.seller_notes || ''
        };
        Object.entries(fields).forEach(([elId, val]) => {
            const el = document.getElementById(elId);
            if (el) el.value = val;
        });

        document.getElementById('cfs-save-btn').textContent = '💾 Save Changes';
        renderImagePreviews();
        UI.openModal('cfs-form-modal');
    };

    // ── Image Upload ──────────────────────────────────────────
    const uploadArea  = document.getElementById('cfs-upload-area');
    const imagesInput = document.getElementById('cfs-images-input');

    uploadArea?.addEventListener('click', () => imagesInput.click());
    uploadArea?.addEventListener('dragover', e => { e.preventDefault(); uploadArea.classList.add('drag-over'); });
    uploadArea?.addEventListener('dragleave', () => uploadArea.classList.remove('drag-over'));
    uploadArea?.addEventListener('drop', e => {
        e.preventDefault();
        uploadArea.classList.remove('drag-over');
        handleImageFiles(Array.from(e.dataTransfer.files));
    });
    imagesInput?.addEventListener('change', () => {
        handleImageFiles(Array.from(imagesInput.files));
        imagesInput.value = '';
    });

    function handleImageFiles(files) {
        files.filter(f => f.type.startsWith('image/')).forEach(file => {
            pendingImages.push({ file, url: URL.createObjectURL(file) });
        });
        renderImagePreviews();
    }

    function renderImagePreviews() {
        const list = document.getElementById('cfs-image-preview');
        const all  = [
            ...existingImages.map((img, i) => ({ type: 'existing', img, idx: i })),
            ...pendingImages.map((img, i) => ({ type: 'pending',  img, idx: i }))
        ];
        list.innerHTML = all.map(({ type, img, idx }) => `
            <div class="image-preview-item ${type === 'existing' && img.is_primary ? 'primary' : ''}">
                <img src="${type === 'existing' ? img.url : img.url}" alt="Preview">
                <button class="remove-img" onclick="removeCfsImage('${type}', ${idx})">✕</button>
            </div>`).join('');
    }

    window.removeCfsImage = function(type, idx) {
        if (type === 'existing') existingImages.splice(idx, 1);
        else pendingImages.splice(idx, 1);
        renderImagePreviews();
    };

    // ── Save ─────────────────────────────────────────────────
    document.getElementById('cfs-save-btn')?.addEventListener('click', async () => {
        const btn = document.getElementById('cfs-save-btn');
        UI.setButtonLoading(btn, true, 'Saving...');

        try {
            const data = {
                brand:        document.getElementById('cfs-brand').value.trim(),
                model:        document.getElementById('cfs-model').value.trim(),
                year:         parseInt(document.getElementById('cfs-year').value),
                trim:         document.getElementById('cfs-trim').value.trim() || null,
                color:        document.getElementById('cfs-color').value.trim() || null,
                mileage:      parseInt(document.getElementById('cfs-mileage').value) || 0,
                transmission: document.getElementById('cfs-transmission').value || null,
                fuel_type:    document.getElementById('cfs-fuel').value || null,
                engine:       document.getElementById('cfs-engine').value.trim() || null,
                seller_price: parseFloat(document.getElementById('cfs-price').value) || 0,
                location:     document.getElementById('cfs-location').value.trim() || null,
                description:  document.getElementById('cfs-description').value.trim() || null,
                seller_notes: document.getElementById('cfs-seller-notes').value.trim() || null,
                submitted_by: profile.id
            };

            if (!data.brand || !data.model || !data.year) {
                UI.showError('Brand, Model, and Year are required.');
                return;
            }

            if (data.year < 1900 || data.year > 2100) {
                UI.showError('Please enter a valid year (1900 - 2100).');
                return;
            }

            let subId = editingId;
            const oldSub = editingId ? allSubmissions.find(s => s.id === editingId) : null;

            if (editingId) {
                // Sales cannot change owner fields
                if (!isOwner) {
                    delete data.owner_offer_price;
                    delete data.owner_notes;
                    delete data.status;
                }
                const { error } = await client.from('cars_for_sale').update(data).eq('id', editingId);
                if (error) throw error;
            } else {
                data.status = 'pending';
                const { data: inserted, error } = await client.from('cars_for_sale').insert(data).select().single();
                if (error) throw error;
                subId = inserted.id;
            }

            // Upload pending images
            for (let i = 0; i < pendingImages.length; i++) {
                const { file } = pendingImages[i];
                const ext  = file.name.split('.').pop();
                const path = `${subId}/${Date.now()}_${i}.${ext}`;

                const { error: upErr } = await client.storage
                    .from('sale-submissions')
                    .upload(path, file, { upsert: true });

                if (upErr) { console.warn('Image upload failed:', upErr); continue; }

                const { data: { publicUrl } } = client.storage.from('sale-submissions').getPublicUrl(path);
                await client.from('cars_for_sale_images').insert({
                    car_sale_id: subId,
                    url: publicUrl,
                    is_primary: i === 0 && existingImages.length === 0,
                    sort_order: existingImages.length + i
                });
            }

            // Handle deleted existing images
            if (editingId && oldSub) {
                const origImages    = oldSub.cars_for_sale_images || [];
                const keepIds       = existingImages.map(img => img.id);
                const deletedImages = origImages.filter(img => !keepIds.includes(img.id));
                for (const img of deletedImages) {
                    await client.from('cars_for_sale_images').delete().eq('id', img.id);
                }
            }

            // Log it
            await Logs.record(
                editingId ? 'submission_edited' : 'submission_added',
                'sale_submission', subId,
                `${editingId ? 'Edited' : 'Added'} submission: ${data.year} ${data.brand} ${data.model}`,
                oldSub ? { brand: oldSub.brand, model: oldSub.model, seller_price: oldSub.seller_price } : null,
                { brand: data.brand, model: data.model, seller_price: data.seller_price }
            );

            UI.showSuccess(editingId ? 'Submission updated!' : 'Car submitted successfully!');
            UI.closeModal('cfs-form-modal');
            await loadSubmissions();
        } catch (err) {
            UI.showError('Failed: ' + err.message);
        } finally {
            UI.setButtonLoading(btn, false, editingId ? '💾 Save Changes' : '📤 Submit Car');
        }
    });

    // --------------------------------------------------------
    // DELETE SUBMISSION
    // --------------------------------------------------------
    window.deleteSubmission = async function(id) {
        const sub = allSubmissions.find(s => s.id === id);
        if (!sub) return;

        if (!isOwner && (sub.submitted_by !== profile.id)) {
            UI.showError('You can only delete your own submissions.');
            return;
        }

        const ok = await UI.confirm({
            title: 'Delete Submission',
            message: `Delete "${sub.year} ${sub.brand} ${sub.model}"? This cannot be undone.`,
            confirmText: 'Delete',
            type: 'danger',
            icon: '🗑️'
        });
        if (!ok) return;

        try {
            const { error } = await client.from('cars_for_sale').delete().eq('id', id);
            if (error) throw error;

            await Logs.record(
                'submission_deleted',
                'sale_submission', id,
                `Deleted submission: ${sub.year} ${sub.brand} ${sub.model}`
            );

            UI.showSuccess('Submission deleted.');
            await loadSubmissions();
        } catch (err) {
            UI.showError('Failed: ' + err.message);
        }
    };

    // --------------------------------------------------------
    // HELPERS
    // --------------------------------------------------------
    function saleStatusBadge(status) {
        const map = {
            pending:       { cls: 'badge-pending',        label: '⏳ Pending' },
            approved:      { cls: 'badge-approved',       label: '✅ Approved' },
            rejected:      { cls: 'badge-rejected',       label: '❌ Rejected' },
            not_interested:{ cls: 'badge-not-interested', label: '👋 Not Interested' }
        };
        const s = map[status] || { cls: 'badge-muted', label: status };
        return `<span class="badge ${s.cls}">${s.label}</span>`;
    }

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

    // ── LOAD ──────────────────────────────────────────────────
    await loadSubmissions();

    // Realtime refresh
    Realtime.autoRefresh('cars_for_sale', () => loadSubmissions(), { showToast: true, debounce: 700 });
    Realtime.autoRefresh('cars_for_sale_images', () => loadSubmissions(), { showToast: false, debounce: 800 });

})();
