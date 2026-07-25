(() => {
    const PLUGIN_ID = 'spoolman';
    if (window.NopalPluginRegistry?.[PLUGIN_ID]) return;

    const state = {
        config: null,
        spools: [],
        printers: [],
        links: {},
        reservations: [],
        quotes: [],
        summary: null,
        alerts: [],
        consumption: {},
        activeTab: 'resumen',
        viewMode: 'grid',
        search: '',
        materialFilter: 'all',
        statusFilter: 'all',
        loading: false,
        alertsExpanded: false,
        // Mini-cotizador de la barra lateral: cálculo local (precio real
        // del spool elegido, sin pasar por un archivo real de Cotizador)
        // -- es una previsualización de costo, no una cotización guardada.
        miniQuoteSpoolId: null,
        miniQuoteWeightG: '',
        miniQuoteWastePercent: 10,
    };

    let root = null;

    const icon = (body, size = 20) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
    const ICON_SPOOL = '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/>';
    const ICON_SCALE = '<path d="M12 3v18"/><path d="M5 8h14"/><path d="m3 8 2.5 5a2.5 2.5 0 0 0 5 0L8 8"/><path d="m16 8 2.5 5a2.5 2.5 0 0 0 5 0L21 8"/>';
    const ICON_ALERT = '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>';
    const ICON_LOCK = '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>';
    const ICON_CHART = '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>';
    const ICON_SETTINGS = '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>';
    const ICON_GRID = '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>';
    const ICON_LIST = '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>';
    const ICON_TRASH = '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 10v6M14 10v6"/>';
    const ICON_REFRESH = '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>';

    const esc = value => typeof window.escapeHtml === 'function' ? window.escapeHtml(value) : String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    const toast = (message, tone = 'success') => typeof window.showToast === 'function' ? window.showToast(message, tone) : console.log(message);
    const alertDialog = (message, title = '') => typeof window.appAlert === 'function' ? window.appAlert(message, title, 'danger') : window.alert(message);
    const confirmDialog = (message, title = '') => typeof window.appConfirm === 'function' ? window.appConfirm(message, title, 'danger') : Promise.resolve(window.confirm(message));

    async function api(url, options = {}) {
        const response = await fetch(url, options);
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.detail || 'Error de red');
        return data;
    }

    function fmtWeight(grams) {
        const value = Number(grams) || 0;
        return value >= 1000 ? `${(value / 1000).toFixed(2)} kg` : `${Math.round(value)} g`;
    }

    function fmtMoney(value) {
        return `$${(Number(value) || 0).toFixed(2)}`;
    }

    function spoolLabel(spool) {
        const filament = spool.filament || {};
        const parts = [filament.material, filament.name].filter(Boolean);
        return parts.length ? parts.join(' • ') : `Spool #${spool.id}`;
    }

    function spoolColor(spool) {
        const filament = spool.filament || {};
        const hex = filament.color_hex || (filament.multi_color_hexes || '').split(',')[0];
        return hex ? `#${hex.replace(/^#/, '')}` : 'var(--text-muted)';
    }

    function spoolStatus(spool) {
        const threshold = state.config?.low_stock_threshold_g ?? 250;
        const remaining = spool.remaining_weight ?? 0;
        const linkedPort = Object.entries(state.links).find(([, link]) => link.spool_id === spool.id)?.[0];
        if (remaining < threshold) return { key: 'low', label: 'Bajo' };
        if ((spool.reserved_weight || 0) >= remaining && spool.reserved_weight > 0) return { key: 'reserved', label: 'Reservado' };
        if (linkedPort) return { key: 'assigned', label: 'Asignado' };
        return { key: 'available', label: 'Disponible' };
    }

    // ── Carga de datos ──

    async function loadConfig() {
        state.config = await api('/api/spoolman/config').catch(() => null);
    }

    async function loadDashboardData() {
        const [spoolsRes, linksRes, reservationsRes, summaryRes, alertsRes, consumptionRes, printersRes] = await Promise.all([
            api('/api/spoolman/spools').catch(() => ({ spools: [] })),
            api('/api/spoolman/printers/active-spools').catch(() => ({ links: {} })),
            api('/api/spoolman/reservations').catch(() => ({ reservations: [] })),
            api('/api/spoolman/summary').catch(() => null),
            api('/api/spoolman/alerts').catch(() => ({ alerts: [] })),
            api('/api/spoolman/consumption/monthly').catch(() => ({ by_material: {} })),
            api('/api/printers/status').catch(() => ({ printers: [] })),
        ]);
        state.spools = spoolsRes.spools || [];
        state.links = linksRes.links || {};
        state.reservations = reservationsRes.reservations || [];
        state.summary = summaryRes;
        state.alerts = alertsRes.alerts || [];
        state.consumption = consumptionRes.by_material || {};
        state.printers = printersRes.printers || [];
        // Cotizador es opcional -- si no está instalado, /api/pricing/quotes
        // no existe y esto falla en silencio (Reservas simplemente no puede
        // sugerir pedidos, no rompe el resto del plugin).
        state.quotes = (await api('/api/pricing/quotes').catch(() => ({ quotes: [] }))).quotes || [];
    }

    async function refreshAll() {
        state.loading = true;
        render();
        await loadConfig();
        if (state.config?.configured) {
            try {
                await loadDashboardData();
            } catch (error) {
                console.error(error);
            }
        }
        state.loading = false;
        render();
    }

    // ── Render ──

    function statTile(iconSvg, label, value, sub, colorKey) {
        return `
            <div class="spm-tile">
                <div class="spm-tile-icon spm-tile-icon-${colorKey}">${iconSvg}</div>
                <div class="spm-tile-body">
                    <span class="spm-tile-value">${esc(value)}</span>
                    <span class="spm-tile-label">${esc(label)}</span>
                    ${sub ? `<span class="spm-tile-sub">${esc(sub)}</span>` : ''}
                </div>
            </div>`;
    }

    function renderStatTiles() {
        const summary = state.summary || { active_spools: 0, available_kg: 0, low_stock_count: 0, reserved_kg: 0, consumption_month_kg: 0 };
        return `
            <div class="spm-tiles">
                ${statTile(icon(ICON_SPOOL, 22), 'Bobinas activas', summary.active_spools, 'en inventario', 'green')}
                ${statTile(icon(ICON_SCALE, 22), 'Disponible', `${summary.available_kg} kg`, 'listo para usar', 'blue')}
                ${statTile(icon(ICON_ALERT, 22), 'Bajo inventario', summary.low_stock_count, 'requieren atención', 'orange')}
                ${statTile(icon(ICON_LOCK, 22), 'Reservado', `${summary.reserved_kg} kg`, 'para producción', 'purple')}
                ${statTile(icon(ICON_CHART, 22), 'Consumo del mes', `${summary.consumption_month_kg} kg`, 'este mes', 'blue')}
            </div>`;
    }

    function renderTabs() {
        const tabs = [['resumen', 'Resumen'], ['filamentos', 'Filamentos'], ['spools', 'Spools'], ['reservas', 'Reservas'], ['consumo', 'Consumo']];
        return `
            <div class="spm-tabs">
                ${tabs.map(([key, label]) => `<button type="button" class="spm-tab${state.activeTab === key ? ' active' : ''}" data-spm-tab="${key}">${esc(label)}</button>`).join('')}
            </div>`;
    }

    function filteredSpools() {
        return state.spools.filter(spool => {
            const filament = spool.filament || {};
            if (state.materialFilter !== 'all' && (filament.material || '') !== state.materialFilter) return false;
            if (state.statusFilter !== 'all' && spoolStatus(spool).key !== state.statusFilter) return false;
            if (state.search) {
                const haystack = `${filament.material || ''} ${filament.name || ''} ${(filament.vendor || {}).name || ''} ${spool.location || ''} #${spool.id}`.toLowerCase();
                if (!haystack.includes(state.search.toLowerCase())) return false;
            }
            return true;
        });
    }

    function spoolCard(spool) {
        const status = spoolStatus(spool);
        const filament = spool.filament || {};
        const remaining = spool.remaining_weight ?? 0;
        const price = spool.price || filament.price;
        const weightG = spool.initial_weight || filament.weight;
        const perGram = price && weightG ? price / weightG : null;
        return `
            <div class="spm-spool-card">
                <div class="spm-spool-card-top">
                    <span class="spm-spool-id">#${spool.id}</span>
                    <span class="spm-badge spm-badge-${status.key}">${esc(status.label)}</span>
                    <span class="spm-color-dot" style="background:${spoolColor(spool)}"></span>
                </div>
                <div class="spm-spool-name">${esc(spoolLabel(spool))}</div>
                <div class="spm-spool-vendor">${esc((filament.vendor || {}).name || '')}</div>
                <div class="spm-spool-weight">${esc(fmtWeight(remaining))} restantes</div>
                <div class="spm-spool-location">${esc(spool.location || 'Sin ubicación')}</div>
                ${perGram ? `<div class="spm-spool-price">${fmtMoney(perGram)} / g</div>` : ''}
            </div>`;
    }

    function renderFilamentos() {
        const spools = filteredSpools();
        const materials = [...new Set(state.spools.map(s => (s.filament || {}).material).filter(Boolean))];
        return `
            <div class="spm-toolbar">
                <input type="search" class="spm-search" id="spm-search" placeholder="Buscar spool..." value="${esc(state.search)}">
                <select class="spm-select" id="spm-material-filter">
                    <option value="all">Material: Todos</option>
                    ${materials.map(m => `<option value="${esc(m)}" ${state.materialFilter === m ? 'selected' : ''}>${esc(m)}</option>`).join('')}
                </select>
                <select class="spm-select" id="spm-status-filter">
                    <option value="all">Estado: Todos</option>
                    <option value="available" ${state.statusFilter === 'available' ? 'selected' : ''}>Disponible</option>
                    <option value="assigned" ${state.statusFilter === 'assigned' ? 'selected' : ''}>Asignado</option>
                    <option value="reserved" ${state.statusFilter === 'reserved' ? 'selected' : ''}>Reservado</option>
                    <option value="low" ${state.statusFilter === 'low' ? 'selected' : ''}>Bajo</option>
                </select>
                <div class="spm-view-switch">
                    <button type="button" class="spm-icon-btn${state.viewMode === 'grid' ? ' active' : ''}" data-spm-view="grid">${icon(ICON_GRID, 16)}</button>
                    <button type="button" class="spm-icon-btn${state.viewMode === 'list' ? ' active' : ''}" data-spm-view="list">${icon(ICON_LIST, 16)}</button>
                </div>
            </div>
            ${spools.length ? (state.viewMode === 'grid' ? `<div class="spm-spool-grid">${spools.map(spoolCard).join('')}</div>` : renderSpoolTable(spools)) : '<div class="spm-empty">No hay spools que coincidan con el filtro.</div>'}`;
    }

    function renderSpoolTable(spools) {
        return `
            <div class="spm-table-wrap">
                <table class="spm-table">
                    <thead><tr><th>ID</th><th>Filamento</th><th>Fabricante</th><th>Restante</th><th>Ubicación</th><th>$/g</th><th>Estado</th></tr></thead>
                    <tbody>
                        ${spools.map(spool => {
                            const status = spoolStatus(spool);
                            const filament = spool.filament || {};
                            const price = spool.price || filament.price;
                            const weightG = spool.initial_weight || filament.weight;
                            const perGram = price && weightG ? price / weightG : null;
                            return `<tr>
                                <td>#${spool.id}</td>
                                <td><span class="spm-color-dot" style="background:${spoolColor(spool)}"></span> ${esc(spoolLabel(spool))}</td>
                                <td>${esc((filament.vendor || {}).name || '')}</td>
                                <td>${esc(fmtWeight(spool.remaining_weight ?? 0))}</td>
                                <td>${esc(spool.location || '—')}</td>
                                <td>${perGram ? fmtMoney(perGram) : '—'}</td>
                                <td><span class="spm-badge spm-badge-${status.key}">${esc(status.label)}</span></td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>`;
    }

    function renderReservas() {
        const spoolOptions = state.spools.map(s => `<option value="${s.id}">#${s.id} · ${esc(spoolLabel(s))} (${esc(fmtWeight(s.available_weight ?? s.remaining_weight ?? 0))} disp.)</option>`).join('');
        const quoteOptions = state.quotes.map(q => `<option value="${esc(q.id)}" data-grams="${q.extracted?.filament_g || ''}" data-label="${esc(q.client_name ? `${q.client_name} — ${q.file?.name || ''}` : (q.file?.name || q.id))}">${esc(q.client_name ? `${q.client_name} — ${q.file?.name || ''}` : (q.file?.name || q.id))}</option>`).join('');
        return `
            <div class="spm-reservas-layout">
                <form class="spm-form" id="spm-reservation-form">
                    <h3>Nueva reserva</h3>
                    ${state.quotes.length ? `<label>Pedido / cotización<select name="quote_select" id="spm-quote-select"><option value="">— elegir —</option>${quoteOptions}</select></label>` : '<p class="spm-hint">No hay cotizaciones del Cotizador para vincular (¿está instalado ese plugin?). Podés reservar igual con una etiqueta libre.</p>'}
                    <label>Etiqueta del pedido<input type="text" name="quote_label" id="spm-quote-label" placeholder="Ej. Pedido #1274 — Caja ESP32" required></label>
                    <label>Spool<select name="spool_id" required><option value="">— elegir —</option>${spoolOptions}</select></label>
                    <label>Gramos<input type="number" name="grams" id="spm-reservation-grams" min="1" step="1" required></label>
                    <label>Fecha programada (opcional)<input type="date" name="scheduled_for"></label>
                    <label>Nota (opcional)<input type="text" name="note" maxlength="200"></label>
                    <button type="submit" class="spm-btn-accent">Reservar</button>
                </form>
                <div class="spm-reservas-list">
                    <h3>Reservas activas</h3>
                    ${state.reservations.length ? state.reservations.map(r => `
                        <div class="spm-reserva-row">
                            <div class="spm-reserva-info">
                                <strong>${esc(r.quote_label)}</strong>
                                <span>#${r.spool_id} · ${esc(fmtWeight(r.grams))}${r.scheduled_for ? ` · ${esc(r.scheduled_for)}` : ''}</span>
                            </div>
                            <button type="button" class="spm-icon-btn spm-icon-btn-danger" data-spm-delete-reservation="${esc(r.id)}">${icon(ICON_TRASH, 14)}</button>
                        </div>`).join('') : '<div class="spm-empty">Sin reservas activas.</div>'}
                </div>
            </div>`;
    }

    // Paleta fija para los materiales más comunes (coincide con la
    // convención de color ya usada en el resto de NOPAL); cualquier
    // material fuera de esta lista cae en el accent del tema en vez de
    // inventar un color nuevo por material.
    const MATERIAL_COLORS = { PLA: 'var(--green)', PETG: '#3b82f6', ABS: '#ef4444', TPU: 'var(--purple, #a855f7)', ASA: '#06b6d4' };
    const materialColor = material => MATERIAL_COLORS[(material || '').toUpperCase()] || 'var(--spm-accent)';

    function renderConsumo() {
        const entries = Object.entries(state.consumption);
        const max = Math.max(1, ...entries.map(([, g]) => g));
        return `
            <div class="spm-consumo">
                <h3>Consumo de este mes por material</h3>
                ${entries.length ? entries.map(([material, grams]) => `
                    <div class="spm-consumo-row">
                        <span class="spm-consumo-label">${esc(material)}</span>
                        <div class="spm-consumo-bar-track"><div class="spm-consumo-bar-fill" style="width:${Math.round((grams / max) * 100)}%;background:${materialColor(material)}"></div></div>
                        <span class="spm-consumo-value">${esc(fmtWeight(grams))}</span>
                    </div>`).join('') : '<div class="spm-empty">Todavía no hay consumo registrado este mes. Se va llenando con el uso real que reporte Spoolman.</div>'}
            </div>`;
    }

    function renderResumen() {
        return `
            <div class="spm-resumen">
                <p class="spm-hint">Usá las pestañas de arriba para ver el detalle de Filamentos, Spools, Reservas y Consumo. El panel de la derecha resume el estado de tus impresoras y las alertas activas.</p>
                ${renderConsumo()}
            </div>`;
    }

    function renderTabContent() {
        switch (state.activeTab) {
            case 'filamentos': return renderFilamentos();
            case 'spools': return renderSpoolTable(filteredSpools());
            case 'reservas': return renderReservas();
            case 'consumo': return renderConsumo();
            default: return renderResumen();
        }
    }

    function renderPrinterRow(printer) {
        const link = state.links[String(printer.port)];
        const spool = link ? state.spools.find(s => s.id === link.spool_id) : null;
        const stateKey = printer.status === 'online' ? (printer.job?.state || 'ready') : 'offline';
        const options = state.spools.map(s => `<option value="${s.id}" ${link?.spool_id === s.id ? 'selected' : ''}>#${s.id} · ${esc(spoolLabel(s))}</option>`).join('');
        return `
            <div class="spm-printer-row">
                <span class="spm-printer-dot spm-printer-dot-${esc(stateKey)}"></span>
                <div class="spm-printer-info">
                    <strong>${esc(printer.name || `Impresora ${printer.port}`)}</strong>
                    <span>${esc(stateKey)}</span>
                </div>
                ${spool ? `<span class="spm-color-dot spm-printer-spool-dot" style="background:${spoolColor(spool)}"></span>` : ''}
                <select class="spm-printer-spool-select" data-spm-printer-port="${printer.port}">
                    <option value="">Sin spool asignado</option>
                    ${options}
                </select>
                ${spool ? `<span class="spm-printer-weight">${esc(fmtWeight(spool.remaining_weight ?? 0))}</span>` : ''}
            </div>`;
    }

    function miniQuoteSpoolOptions() {
        return state.spools.map(s => `<option value="${s.id}" ${state.miniQuoteSpoolId === s.id ? 'selected' : ''}>${esc(spoolLabel(s))} (${esc((s.filament || {}).vendor?.name || '')})</option>`).join('');
    }

    function computeMiniQuote() {
        const spool = state.spools.find(s => s.id === state.miniQuoteSpoolId) || state.spools[0] || null;
        const filament = spool?.filament || {};
        const price = spool ? (spool.price || filament.price) : null;
        const weightG = spool ? (spool.initial_weight || filament.weight) : null;
        const costPerGram = price && weightG ? price / weightG : null;
        const estimatedWeight = Number(state.miniQuoteWeightG) || 0;
        const wastePercent = Number(state.miniQuoteWastePercent) || 0;
        const materialWithWaste = estimatedWeight * (1 + wastePercent / 100);
        const totalCost = costPerGram != null ? costPerGram * materialWithWaste : null;
        return { costPerGram, totalCost };
    }

    // Recalcula y pisa solo el texto de los 2 resultados, sin tocar los
    // <input> -- si esto llamara a render() en cada tecleo, innerHTML
    // recrearía el campo de texto en cada letra y el foco/cursor se
    // perdería a mitad de escribir.
    function updateMiniQuoteTotals() {
        const { costPerGram, totalCost } = computeMiniQuote();
        const costEl = root.querySelector('#spm-mq-cost');
        const totalEl = root.querySelector('#spm-mq-total');
        if (costEl) costEl.textContent = costPerGram != null ? fmtMoney(costPerGram) : '—';
        if (totalEl) totalEl.textContent = totalCost != null ? fmtMoney(totalCost) : '—';
    }

    function renderMiniCotizador() {
        const { costPerGram, totalCost } = computeMiniQuote();
        return `
            <section class="spm-sidebar-card spm-mini-cotizador">
                <h3>Cotizador NOPAL</h3>
                <label class="spm-mini-field">
                    <span>Material seleccionado</span>
                    <select id="spm-mq-spool">${miniQuoteSpoolOptions() || '<option value="">Sin spools</option>'}</select>
                </label>
                <div class="spm-mini-stat"><span>Costo/g</span><strong id="spm-mq-cost">${costPerGram != null ? fmtMoney(costPerGram) : '—'}</strong></div>
                <label class="spm-mini-field">
                    <span>Peso estimado (g)</span>
                    <input type="number" id="spm-mq-weight" min="0" step="1" value="${esc(state.miniQuoteWeightG)}" placeholder="0">
                </label>
                <label class="spm-mini-field">
                    <span>Desperdicio (%)</span>
                    <input type="number" id="spm-mq-waste" min="0" max="100" step="1" value="${esc(state.miniQuoteWastePercent)}">
                </label>
                <div class="spm-mini-stat spm-mini-stat-total"><span>Total material</span><strong id="spm-mq-total">${totalCost != null ? fmtMoney(totalCost) : '—'}</strong></div>
            </section>`;
    }

    function renderMiniConsumo() {
        const entries = Object.entries(state.consumption);
        const max = Math.max(1, ...entries.map(([, g]) => g));
        const totalKg = entries.reduce((sum, [, g]) => sum + g, 0) / 1000;
        return `
            <section class="spm-sidebar-card spm-mini-consumo">
                <h3>Consumo mensual</h3>
                ${entries.length ? entries.map(([material, grams]) => `
                    <div class="spm-mini-consumo-row">
                        <span>${esc(material)}</span>
                        <div class="spm-consumo-bar-track"><div class="spm-consumo-bar-fill" style="width:${Math.round((grams / max) * 100)}%;background:${materialColor(material)}"></div></div>
                        <strong>${esc(fmtWeight(grams))}</strong>
                    </div>`).join('') : '<div class="spm-empty">Sin consumo este mes.</div>'}
                <div class="spm-mini-consumo-total">Total: ${totalKg.toFixed(1)} kg</div>
            </section>`;
    }

    function renderMiniAlertas() {
        const visible = state.alertsExpanded ? state.alerts : state.alerts.slice(0, 3);
        return `
            <section class="spm-sidebar-card spm-mini-alertas">
                <h3>Alertas</h3>
                ${visible.length ? visible.map(a => `
                    <div class="spm-alert-row spm-alert-${esc(a.severity)}">${icon(ICON_ALERT, 14)}<span>${esc(a.message)}</span></div>
                `).join('') : '<div class="spm-empty">Sin alertas activas.</div>'}
                ${state.alerts.length > 3 ? `<button type="button" class="spm-mini-alertas-toggle" id="spm-toggle-alerts">${state.alertsExpanded ? 'Ver menos' : 'Ver todas las alertas'}</button>` : ''}
            </section>`;
    }

    function renderSidebar() {
        if (!state.config?.configured) return '';
        return `
            <aside class="spm-sidebar">
                <section class="spm-sidebar-card">
                    <div class="spm-sidebar-card-header">
                        <h3>Impresoras y spool asignado</h3>
                        <button type="button" class="spm-icon-btn" id="spm-refresh-printers" title="Actualizar">${icon(ICON_REFRESH, 14)}</button>
                    </div>
                    ${state.printers.length ? state.printers.map(renderPrinterRow).join('') : '<div class="spm-empty">No se detectaron impresoras Klipper.</div>'}
                </section>
                <section class="spm-sidebar-card">
                    <h3>Reservas para producción</h3>
                    ${state.reservations.length ? state.reservations.slice(0, 5).map(r => {
                        const spool = state.spools.find(s => s.id === r.spool_id);
                        return `
                        <div class="spm-mini-row">
                            ${icon(ICON_LOCK, 14)}
                            <span class="spm-mini-row-label">${esc(r.quote_label)}</span>
                            ${spool ? `<span class="spm-color-dot spm-mini-row-dot" style="background:${spoolColor(spool)}"></span><span class="spm-mini-row-material">${esc(spoolLabel(spool))}</span>` : ''}
                            <strong>${esc(fmtWeight(r.grams))}</strong>
                        </div>`;
                    }).join('') : '<div class="spm-empty">Sin reservas.</div>'}
                </section>
                <div class="spm-sidebar-mini-row">
                    ${renderMiniCotizador()}
                    ${renderMiniConsumo()}
                    ${renderMiniAlertas()}
                </div>
            </aside>`;
    }

    // Formulario de conexión -- vive en un único lugar (el panel de
    // Configuración, siempre presente en el DOM) para no duplicar el id
    // #spm-config-form; el cuerpo principal cuando no hay conexión solo
    // muestra un aviso corto que abre ese mismo panel.
    function renderConfigForm() {
        const config = state.config || {};
        return `
            <form id="spm-config-form" class="spm-form">
                <label>Host / IP<input type="text" name="host" placeholder="192.168.1.50" value="${esc(config.host || '')}" required></label>
                <label>Puerto<input type="number" name="port" placeholder="7912" value="${esc(config.port || 7912)}" required></label>
                <button type="submit" class="spm-btn-accent">Conectar</button>
            </form>`;
    }

    function renderNotConfiguredPrompt() {
        return `
            <div class="spm-config-gate">
                <div class="spm-config-card">
                    ${icon(ICON_SPOOL, 40)}
                    <h2>Conectá tu servidor Spoolman</h2>
                    <p>NOPAL va a leer tu inventario real de spools desde ahí -- no se duplica ni se inventa nada.</p>
                    <button type="button" class="spm-btn-accent" data-spm-open-settings-inline>Configurar conexión</button>
                </div>
            </div>`;
    }

    function moduleHtml() {
        return `
            <section id="spoolman-section" class="view-section spm-section" style="display:none">
                <div class="spm-scroll">
                    <header class="spm-header">
                        <div class="spm-header-copy">
                            <h1>Materiales</h1>
                            <div class="spm-header-subrow">
                                <span class="spm-header-sub">Inventario de filamentos e insumos</span>
                                <span class="spm-status-pill ${state.config?.connected ? 'spm-status-ok' : 'spm-status-off'}">
                                    <span class="spm-status-dot"></span>
                                    Spoolman ${state.config?.connected ? '· Conectado' : '· Desconectado'}
                                </span>
                            </div>
                        </div>
                        <div class="spm-header-actions">
                            <button type="button" class="spm-icon-btn" id="spm-open-settings" title="Configurar conexión">${icon(ICON_SETTINGS, 18)}</button>
                        </div>
                    </header>
                    <div id="spm-body">
                        ${state.config?.configured ? '' : renderNotConfiguredPrompt()}
                    </div>
                </div>

                <div class="spm-panel-overlay" id="spm-settings-panel" hidden>
                    <div class="spm-panel-backdrop" data-spm-close-settings></div>
                    <div class="spm-panel-dialog">
                        <div class="spm-panel-header"><strong>Configuración de Spoolman</strong><button type="button" data-spm-close-settings>${icon('<path d="M18 6 6 18M6 6l12 12"/>', 16)}</button></div>
                        ${renderConfigForm()}
                        ${state.config?.configured ? '<button type="button" class="spm-btn-danger" id="spm-disconnect-btn">Desconectar</button>' : ''}
                    </div>
                </div>
            </section>`;
    }

    function renderConfiguredBody() {
        return `
            ${renderStatTiles()}
            <div class="spm-main-layout">
                <div class="spm-main-content">
                    ${renderTabs()}
                    <div class="spm-tab-content">${renderTabContent()}</div>
                </div>
                ${renderSidebar()}
            </div>
            <p class="spm-footer-note">Inventario físico gestionado por Spoolman · Reservas, cotización y producción gestionadas por NOPAL</p>`;
    }

    // render() reemplaza #spm-body entero -- sin esto, escribir en el
    // buscador de Filamentos (que sí necesita un render completo, filtra
    // toda la grilla) perdía el foco/cursor en cada letra porque innerHTML
    // recrea el <input> de cero. Se guarda foco + selección antes y se
    // restaura después si el mismo id sigue existiendo en el HTML nuevo.
    function withPreservedFocus(fn) {
        const active = document.activeElement;
        const hadFocus = active && root?.contains(active) && active.id;
        const selectionStart = hadFocus && 'selectionStart' in active ? active.selectionStart : null;
        const selectionEnd = hadFocus && 'selectionEnd' in active ? active.selectionEnd : null;
        fn();
        if (hadFocus) {
            const restored = root.querySelector(`#${CSS.escape(active.id)}`);
            if (restored) {
                restored.focus();
                if (selectionStart != null && 'setSelectionRange' in restored) {
                    try { restored.setSelectionRange(selectionStart, selectionEnd); } catch (error) { /* tipos sin selección (number, etc.) */ }
                }
            }
        }
    }

    function render() {
        if (!root) return;
        withPreservedFocus(renderBody);
    }

    function renderBody() {
        const body = root.querySelector('#spm-body');
        if (body) body.innerHTML = state.config?.configured ? renderConfiguredBody() : renderNotConfiguredPrompt();
        const statusPill = root.querySelector('.spm-status-pill');
        if (statusPill) {
            statusPill.className = `spm-status-pill ${state.config?.connected ? 'spm-status-ok' : 'spm-status-off'}`;
            statusPill.innerHTML = `<span class="spm-status-dot"></span>Spoolman ${state.config?.connected ? '· Conectado' : '· Desconectado'}`;
        }
        const panelDialog = root.querySelector('#spm-settings-panel .spm-panel-dialog');
        if (panelDialog) {
            panelDialog.innerHTML = `
                <div class="spm-panel-header"><strong>Configuración de Spoolman</strong><button type="button" data-spm-close-settings>${icon('<path d="M18 6 6 18M6 6l12 12"/>', 16)}</button></div>
                ${renderConfigForm()}
                ${state.config?.configured ? '<button type="button" class="spm-btn-danger" id="spm-disconnect-btn">Desconectar</button>' : ''}`;
        }
        bindBodyEvents();
        bindSettingsPanelEvents();
    }

    // ── Eventos ──

    async function handleConfigSubmit(event) {
        event.preventDefault();
        const form = event.target;
        const formData = new FormData(form);
        try {
            await api('/api/spoolman/config', { method: 'POST', body: formData });
            toast('Conectado con Spoolman');
            root.querySelector('#spm-settings-panel').hidden = true;
            await refreshAll();
        } catch (error) {
            alertDialog(error.message || 'No se pudo conectar con Spoolman');
        }
    }

    async function handleReservationSubmit(event) {
        event.preventDefault();
        const form = event.target;
        const formData = new FormData(form);
        const quoteSelect = form.querySelector('#spm-quote-select');
        const selectedOption = quoteSelect ? quoteSelect.options[quoteSelect.selectedIndex] : null;
        formData.set('quote_id', formData.get('quote_select') || '');
        if (!formData.get('quote_label') && selectedOption) formData.set('quote_label', selectedOption.dataset.label || '');
        if (!formData.get('quote_id')) formData.set('quote_id', 'manual');
        try {
            await api('/api/spoolman/reservations', { method: 'POST', body: formData });
            toast('Reserva creada');
            await loadDashboardData();
            render();
        } catch (error) {
            alertDialog(error.message || 'No se pudo crear la reserva');
        }
    }

    function bindBodyEvents() {
        root.querySelector('#spm-refresh-printers')?.addEventListener('click', async () => {
            await loadDashboardData();
            render();
        });
        root.querySelector('#spm-mq-spool')?.addEventListener('change', event => {
            state.miniQuoteSpoolId = Number(event.target.value) || null;
            render();
        });
        root.querySelector('#spm-mq-weight')?.addEventListener('input', event => {
            state.miniQuoteWeightG = event.target.value;
            updateMiniQuoteTotals();
        });
        root.querySelector('#spm-mq-waste')?.addEventListener('input', event => {
            state.miniQuoteWastePercent = event.target.value;
            updateMiniQuoteTotals();
        });
        root.querySelector('#spm-toggle-alerts')?.addEventListener('click', () => {
            state.alertsExpanded = !state.alertsExpanded;
            render();
        });

        root.querySelectorAll('[data-spm-tab]').forEach(btn => {
            btn.addEventListener('click', () => { state.activeTab = btn.dataset.spmTab; render(); });
        });
        root.querySelectorAll('[data-spm-view]').forEach(btn => {
            btn.addEventListener('click', () => { state.viewMode = btn.dataset.spmView; render(); });
        });
        root.querySelector('#spm-search')?.addEventListener('input', event => { state.search = event.target.value; render(); });
        root.querySelector('#spm-material-filter')?.addEventListener('change', event => { state.materialFilter = event.target.value; render(); });
        root.querySelector('#spm-status-filter')?.addEventListener('change', event => { state.statusFilter = event.target.value; render(); });

        root.querySelectorAll('[data-spm-open-settings-inline]').forEach(btn => {
            btn.addEventListener('click', () => {
                const panel = root.querySelector('#spm-settings-panel');
                if (panel) panel.hidden = false;
            });
        });
        root.querySelector('#spm-reservation-form')?.addEventListener('submit', handleReservationSubmit);
        root.querySelector('#spm-quote-select')?.addEventListener('change', event => {
            const option = event.target.options[event.target.selectedIndex];
            const gramsInput = root.querySelector('#spm-reservation-grams');
            const labelInput = root.querySelector('#spm-quote-label');
            if (option?.dataset.grams && gramsInput && !gramsInput.value) gramsInput.value = Math.round(Number(option.dataset.grams));
            if (option?.dataset.label && labelInput) labelInput.value = option.dataset.label;
        });

        root.querySelectorAll('[data-spm-delete-reservation]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const confirmed = await confirmDialog('¿Liberar esta reserva?', 'Eliminar reserva');
                if (!confirmed) return;
                try {
                    await api(`/api/spoolman/reservations/${btn.dataset.spmDeleteReservation}`, { method: 'DELETE' });
                    toast('Reserva eliminada');
                    await loadDashboardData();
                    render();
                } catch (error) {
                    alertDialog(error.message || 'No se pudo eliminar la reserva');
                }
            });
        });

        root.querySelectorAll('.spm-printer-spool-select').forEach(select => {
            select.addEventListener('change', async () => {
                const port = select.dataset.spmPrinterPort;
                try {
                    if (select.value) {
                        const formData = new FormData();
                        formData.append('spool_id', select.value);
                        await api(`/api/spoolman/printers/${port}/active-spool`, { method: 'POST', body: formData });
                        toast('Spool asignado');
                    } else {
                        await api(`/api/spoolman/printers/${port}/active-spool`, { method: 'DELETE' });
                        toast('Spool desasignado');
                    }
                    await loadDashboardData();
                    render();
                } catch (error) {
                    alertDialog(error.message || 'No se pudo actualizar la asignación');
                }
            });
        });
    }

    // Elementos estáticos del overlay que nunca se recrean (el backdrop y el
    // botón engranaje de la topbar) -- se bindean una sola vez, al montar.
    function bindChromeEvents() {
        root.querySelector('#spm-open-settings')?.addEventListener('click', () => {
            const panel = root.querySelector('#spm-settings-panel');
            if (panel) panel.hidden = false;
        });
        root.querySelector('.spm-panel-backdrop')?.addEventListener('click', () => {
            const panel = root.querySelector('#spm-settings-panel');
            if (panel) panel.hidden = true;
        });
    }

    // Contenido del panel de Configuración -- se recrea en cada render()
    // (para reflejar host/puerto guardados y si ya hay conexión), así que
    // sus listeners se re-bindean cada vez, igual que bindBodyEvents().
    function bindSettingsPanelEvents() {
        root.querySelector('#spm-settings-panel .spm-panel-dialog [data-spm-close-settings]')?.addEventListener('click', () => {
            const panel = root.querySelector('#spm-settings-panel');
            if (panel) panel.hidden = true;
        });
        root.querySelector('#spm-config-form')?.addEventListener('submit', handleConfigSubmit);
        root.querySelector('#spm-disconnect-btn')?.addEventListener('click', async () => {
            const confirmed = await confirmDialog('¿Desconectar Spoolman? Se pierde la configuración guardada (no el inventario, que sigue viviendo en Spoolman).', 'Desconectar');
            if (!confirmed) return;
            await api('/api/spoolman/config', { method: 'DELETE' });
            root.querySelector('#spm-settings-panel').hidden = true;
            await refreshAll();
        });
    }

    function mount() {
        if (document.getElementById('spoolman-section')) return;
        const pluginsContainer = document.querySelector('.nav-category[data-group="plugins"] .nav-category-items');
        const navButton = document.createElement('button');
        navButton.type = 'button';
        navButton.className = 'nav-item';
        navButton.dataset.section = 'spoolman';
        navButton.dataset.pluginNav = PLUGIN_ID;
        navButton.title = 'Materiales';
        navButton.innerHTML = `${icon(ICON_SPOOL, 20)}<span>Materiales</span>`;
        // El plugin monta una sola vez y la sección queda en el DOM -- sin
        // esto, volver a "Materiales" después de visitar otra sección
        // mostraba datos ya viejos hasta el próximo refresh manual.
        navButton.addEventListener('click', () => {
            window.switchSection?.('spoolman');
            refreshAll();
        });
        pluginsContainer?.appendChild(navButton);

        const wrapper = document.createElement('div');
        wrapper.innerHTML = moduleHtml();
        root = wrapper.firstElementChild;
        const content = document.querySelector('.content');
        content?.insertBefore(root, document.getElementById('gcode-editor-section'));

        bindChromeEvents();
        refreshAll();
        window.applySidebarOrder?.();
    }

    function unmount() {
        document.querySelector(`[data-plugin-nav="${PLUGIN_ID}"]`)?.remove();
        document.getElementById('spoolman-section')?.remove();
        root = null;
    }

    window.NopalPluginRegistry = window.NopalPluginRegistry || {};
    window.NopalPluginRegistry[PLUGIN_ID] = { mount, unmount, version: '0.1.0' };
    mount();
})();
