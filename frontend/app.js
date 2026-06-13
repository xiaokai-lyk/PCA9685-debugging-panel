/**
 * PCA9685 Debug Panel — Frontend Application
 *
 * Manages SSE connection, REST API calls, channel state, and UI rendering.
 */

// Hide the JS-failure overlay — JS is running, so the app is functional.
document.getElementById('jsFailOverlay').style.display = 'none';

// ═══════════════════════════════════════════════════════════════════
// State
// ═══════════════════════════════════════════════════════════════════

const state = {
    status: 'offline',      // 'online' | 'offline' | 'error'
    i2cAddress: 0x40,
    frequencyHz: 50,
    minPulseUs: 600,
    maxPulseUs: 2400,
    outputEnabled: false,   // global output enable
    lastHeartbeat: null,    // ISO string or null
    lastError: '',          // last hardware error message
    mockMode: false,        // true when running without real hardware
    channels: [],           // Array of 16 channel objects (filled by fetchChannels)
    actions: [],            // Array of saved action objects (filled by fetchActions)
};

// Default channel template
function defaultChannel(i) {
    return {
        channel: i,
        name: i18n.t('channel.defaultName', i),
        enabled: true,
        angle: null,
        duty: null,
        minAngle: null,
        maxAngle: null,
        minPulse: null,
        maxPulse: null,
        calibrated: false,
        mode: 'angle',      // 'angle' or 'duty'
    };
}

// ═══════════════════════════════════════════════════════════════════
// API Helpers
// ═══════════════════════════════════════════════════════════════════

async function api(path, options = {}) {
    const res = await fetch(path, {
        headers: { 'Content-Type': 'application/json', ...options.headers },
        ...options,
    });
    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `HTTP ${res.status}`);
    }
    return res.json();
}

async function fetchStatus() {
    const data = await api('/api/status');
    state.status = data.status;
    state.i2cAddress = data.i2c_address;
    state.frequencyHz = data.frequency_hz;
    state.minPulseUs = data.min_pulse_us;
    state.maxPulseUs = data.max_pulse_us;
    state.outputEnabled = data.output_enabled;
    state.lastHeartbeat = data.last_heartbeat;
    state.mockMode = data.mock_mode || false;
    state.lastError = data.last_error || '';
    renderStatusBar();
    renderGlobalEnableBtn();
}

async function fetchChannels() {
    const data = await api('/api/servo/channels');
    state.channels = data.channels.map(ch => ({
        ...defaultChannel(ch.channel),
        ...ch,
        mode: ch.calibrated ? 'angle' : 'duty',
    }));
    renderAllChannels();
}

async function setServo(channel, angle, duty) {
    const body = angle !== null ? { channel, angle } : { channel, duty };
    await api('/api/servo/set', {
        method: 'POST',
        body: JSON.stringify(body),
    });
}

async function setChannelName(channel, name) {
    await api('/api/servo/name', {
        method: 'POST',
        body: JSON.stringify({ channel, name }),
    });
}

async function calibrateChannel(channel, calib) {
    await api('/api/servo/calibrate', {
        method: 'POST',
        body: JSON.stringify({ channel, ...calib }),
    });
}

async function setFrequency(hz) {
    await api('/api/pca9685/frequency', {
        method: 'POST',
        body: JSON.stringify({ frequency_hz: hz }),
    });
}

async function setPulseRange(minUs, maxUs) {
    await api('/api/pca9685/pulse_range', {
        method: 'POST',
        body: JSON.stringify({ min_pulse_us: minUs, max_pulse_us: maxUs }),
    });
}

async function exportWorkspace() {
    return api('/api/workspace/export');
}

async function setOutputGlobal(enabled) {
    return api('/api/output/global', {
        method: 'POST',
        body: JSON.stringify({ enabled }),
    });
}

async function setOutputChannel(channel, enabled) {
    return api('/api/output/channel', {
        method: 'POST',
        body: JSON.stringify({ channel, enabled }),
    });
}

async function importWorkspace(data) {
    return api('/api/workspace/import', {
        method: 'POST',
        body: JSON.stringify(data),
    });
}

async function clearConfig() {
    return api('/api/config/clear', { method: 'POST' });
}

async function fetchActions() {
    const data = await api('/api/actions');
    state.actions = data.actions;
    renderActions();
}

async function recordAction(name) {
    return api('/api/actions/record', {
        method: 'POST',
        body: JSON.stringify({ name }),
    });
}

async function playAction(index) {
    return api(`/api/actions/${index}/play`, { method: 'POST' });
}

async function deleteAction(index) {
    return api(`/api/actions/${index}`, { method: 'DELETE' });
}

async function renameAction(index, name) {
    return api(`/api/actions/${index}/rename`, {
        method: 'POST',
        body: JSON.stringify({ name }),
    });
}

// ═══════════════════════════════════════════════════════════════════
// SSE Connection
// ═══════════════════════════════════════════════════════════════════

let sseSource = null;
let sseReconnectTimer = null;

function connectSSE() {
    if (sseSource) { sseSource.close(); }
    if (sseReconnectTimer) { clearTimeout(sseReconnectTimer); }

    sseSource = new EventSource('/api/events');

    sseSource.addEventListener('status', (e) => {
        try {
            const data = JSON.parse(e.data);
            if (data.status != state.status) {
                const msg = data.status === 'online'
                    ? i18n.t('toast.deviceOnline')
                    : i18n.t('toast.deviceOffline');
                toast(msg, data.status === 'online' ? '' : 'error');
            }
            if (data.status) state.status = data.status;
            if (data.last_heartbeat !== undefined) state.lastHeartbeat = data.last_heartbeat;
            renderStatusBar();
        } catch (_) { /* ignore parse errors */ }
    });

    sseSource.onerror = () => {
        sseSource.close();
        sseSource = null;
        state.status = 'offline';
        renderStatusBar();
        // Reconnect after 3 seconds
        sseReconnectTimer = setTimeout(connectSSE, 3000);
    };

    sseSource.onopen = () => {
        // Re-fetch full state on reconnect
        fetchStatus().catch(() => {});
        fetchChannels().catch(() => {});
        fetchActions().catch(() => {});
    };
}

// ═══════════════════════════════════════════════════════════════════
// Toast
// ═══════════════════════════════════════════════════════════════════

function toast(msg, className = '') {
    // Remove any existing toast
    document.querySelectorAll('.toast').forEach(t => t.remove());
    const el = document.createElement('div');
    el.className = `toast ${className}`;
    el.textContent = msg;
    document.body.appendChild(el);
    // Fade out after 3s, then remove
    setTimeout(() => { el.classList.add('out'); }, 3000);
    el.addEventListener('animationend', (e) => {
        if (e.target === el && e.animationName === 'toastIn' && el.classList.contains('out')) {
            el.remove();
        }
    });
}

// ═══════════════════════════════════════════════════════════════════
// Click-to-edit helper
// ═══════════════════════════════════════════════════════════════════

function makeEditable(displayEl, onCommit) {
    displayEl.style.cursor = 'text';
    displayEl.title = i18n.t('tooltip.clickToEdit');

    displayEl.addEventListener('click', () => {
        // Extract numeric value from display text
        const match = displayEl.textContent.match(/[\d.]+/);
        const numVal = match ? parseFloat(match[0]) : 0;

        const input = document.createElement('input');
        input.type = 'number';
        input.value = numVal;
        input.step = 'any';
        Object.assign(input.style, {
            width: '70px',
            padding: '2px 4px',
            textAlign: 'right',
            fontSize: '13px',
            fontVariantNumeric: 'tabular-nums',
            border: '1px solid var(--accent)',
            borderRadius: '4px',
            background: 'var(--bg-input)',
            color: 'var(--text)',
            outline: 'none',
        });

        displayEl.replaceWith(input);
        input.focus();
        input.select();

        function done() {
            const val = parseFloat(input.value);
            input.replaceWith(displayEl);
            if (!isNaN(val)) onCommit(val);
        }

        input.addEventListener('blur', done);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') done();
            if (e.key === 'Escape') {
                input.replaceWith(displayEl);
            }
        });
    });
}

// ═══════════════════════════════════════════════════════════════════
// Group Collapse System
// ═══════════════════════════════════════════════════════════════════

/**
 * Initialize group collapse/expand.  Reads saved state from localStorage
 * and applies it on page load.  Each group's state is stored under
 * `pca9685-group-<name>` as 'collapsed' or 'expanded'.
 */
function initGroups() {
    document.querySelectorAll('.group').forEach(group => {
        const groupId = group.id.replace('group-', '');
        const key = 'pca9685-group-' + groupId;
        let saved = null;
        try { saved = localStorage.getItem(key); } catch (_) { /* noop */ }

        // Apply saved state (default: expanded if not saved yet)
        if (saved === 'collapsed') {
            group.classList.add('collapsed');
        }

        // Toggle on header click
        const header = group.querySelector('.group-header');
        if (header) {
            header.addEventListener('click', () => {
                const isNowCollapsed = !group.classList.contains('collapsed');
                if (isNowCollapsed) {
                    group.classList.add('collapsed');
                } else {
                    group.classList.remove('collapsed');
                }
                // Persist to localStorage
                try {
                    localStorage.setItem(key, isNowCollapsed ? 'collapsed' : 'expanded');
                } catch (_) { /* noop */ }
            });
        }
    });
}

// ═══════════════════════════════════════════════════════════════════
// Render: Status Bar
// ═══════════════════════════════════════════════════════════════════

function renderStatusBar() {
    const indicator = document.getElementById('statusIndicator');
    const text = document.getElementById('statusText');
    const i2c = document.getElementById('statusI2c');
    const freq = document.getElementById('statusFreq');
    const hb = document.getElementById('statusHeartbeat');
    const mockBadge = document.getElementById('mockBadge');

    indicator.className = 'status-indicator ' + state.status;
    text.textContent = i18n.t('status.' + state.status);
    i2c.textContent = '0x' + state.i2cAddress.toString(16).toUpperCase();
    freq.textContent = state.frequencyHz + ' Hz';

    if (state.lastHeartbeat) {
        const d = new Date(state.lastHeartbeat);
        hb.textContent = d.toLocaleTimeString();
    } else {
        hb.textContent = '—';
    }

    // Show/hide mock mode badge
    if (mockBadge) {
        mockBadge.style.display = state.mockMode ? 'inline-block' : 'none';
    }

    // Show error tooltip when offline
    if (state.status === 'offline' && state.lastError) {
        text.textContent = i18n.t('status.offline') + ' — ' + state.lastError;
        text.style.color = 'var(--offline)';
    } else {
        text.style.color = '';
    }
}

function renderGlobalEnableBtn() {
    const btn = document.getElementById('btnGlobalEnable');
    if (!btn) return;
    if (state.outputEnabled) {
        btn.textContent = i18n.t('btn.enabled');
        btn.className = 'btn btn-enable enabled';
    } else {
        btn.textContent = i18n.t('btn.disabled');
        btn.className = 'btn btn-enable disabled';
    }
}

// ═══════════════════════════════════════════════════════════════════
// Render: Channel Cards
// ═══════════════════════════════════════════════════════════════════

function renderAllChannels() {
    const grid = document.getElementById('channelGrid');
    grid.innerHTML = '';

    for (const ch of state.channels) {
        grid.appendChild(createChannelCard(ch));
    }
}

function createChannelCard(ch) {
    const card = document.createElement('div');
    card.className = 'channel-card'
        + (ch.calibrated ? ' calibrated' : '')
        + (ch.enabled ? '' : ' disabled');
    card.dataset.channel = ch.channel;

    // ── Header ──
    const header = document.createElement('div');
    header.className = 'card-header';

    const label = document.createElement('span');
    label.className = 'channel-label';
    label.textContent = i18n.t('channel.label', ch.channel);

    const nameInput = document.createElement('input');
    nameInput.className = 'channel-name';
    nameInput.value = ch.name;
    nameInput.maxLength = 20;
    nameInput.addEventListener('blur', () => onNameChange(ch.channel, nameInput.value));
    nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') nameInput.blur();
    });

    const calibBtn = document.createElement('button');
    calibBtn.className = 'btn-calibrate' + (ch.calibrated ? ' active' : '');
    calibBtn.textContent = '⚙';
    calibBtn.title = ch.calibrated ? i18n.t('tooltip.editCalibration') : i18n.t('tooltip.calibrate');
    calibBtn.addEventListener('click', () => openCalibrateModal(ch.channel));

    header.appendChild(label);
    header.appendChild(nameInput);
    header.appendChild(calibBtn);

    // ── Control ──
    const control = document.createElement('div');
    control.className = 'card-control';

    const sliderRow = document.createElement('div');
    sliderRow.className = 'slider-row';

    const slider = document.createElement('input');
    slider.type = 'range';

    const valueDisplay = document.createElement('span');
    valueDisplay.className = 'value-display';

    // Configure slider based on mode
    function configSlider() {
        if (ch.mode === 'angle' && ch.calibrated) {
            slider.min = ch.minAngle;
            slider.max = ch.maxAngle;
            slider.step = (ch.maxAngle - ch.minAngle) / 200;
            slider.value = ch.angle !== null ? ch.angle : (ch.minAngle + ch.maxAngle) / 2;
            valueDisplay.textContent = Number(slider.value).toFixed(1) + '°';
        } else {
            slider.min = state.minPulseUs;
            slider.max = state.maxPulseUs;
            slider.step = 1;
            const periodUs = 1_000_000 / state.frequencyHz;
            slider.value = ch.duty !== null ? Math.round(ch.duty * periodUs) : state.minPulseUs;
            valueDisplay.textContent = Math.round(Number(slider.value)) + ' µs';
        }
    }
    configSlider();

    slider.addEventListener('input', () => {
        if (ch.mode === 'angle' && ch.calibrated) {
            valueDisplay.textContent = Number(slider.value).toFixed(1) + '°';
        } else {
            valueDisplay.textContent = Math.round(Number(slider.value)) + ' µs';
        }
    });

    slider.addEventListener('change', () => {
        onSliderChange(ch, Number(slider.value));
    });

    sliderRow.appendChild(slider);
    sliderRow.appendChild(valueDisplay);

    // ── Mode toggle ──
    const toggleRow = document.createElement('div');
    toggleRow.style.display = 'flex';
    toggleRow.style.justifyContent = 'space-between';
    toggleRow.style.alignItems = 'center';
    toggleRow.style.gap = '6px';

    // Per-channel enable toggle
    const enableBtn = document.createElement('button');
    enableBtn.className = 'channel-enable-toggle ' + (ch.enabled ? 'on' : 'off');
    enableBtn.textContent = ch.enabled ? i18n.t('channel.on') : i18n.t('channel.off');
    enableBtn.title = ch.enabled ? i18n.t('tooltip.disableChannel') : i18n.t('tooltip.enableChannel');
    enableBtn.addEventListener('click', () => onChannelEnableToggle(ch, enableBtn, slider));

    const modeBtn = document.createElement('button');
    modeBtn.className = 'mode-toggle';
    modeBtn.textContent = ch.mode === 'angle' ? i18n.t('channel.modeAngle') : i18n.t('channel.modeDuty');
    modeBtn.addEventListener('click', () => {
        ch.mode = (ch.mode === 'angle') ? 'duty' : 'angle';
        modeBtn.textContent = ch.mode === 'angle' ? i18n.t('channel.modeAngle') : i18n.t('channel.modeDuty');
        configSlider();
    });

    // --- Pulse info (always shows µs) ---
    function updatePulseInfo() {
        const val = Number(slider.value);
        if (ch.mode === 'angle' && ch.calibrated) {
            const ratio = (val - ch.minAngle) / (ch.maxAngle - ch.minAngle);
            const pulse = ch.minPulse + ratio * (ch.maxPulse - ch.minPulse);
            pulseInfo.textContent = pulse.toFixed(0) + ' µs';
        } else {
            pulseInfo.textContent = Math.round(val) + ' µs';
        }
    }
    const pulseInfo = document.createElement('span');
    pulseInfo.className = 'pulse-display';
    updatePulseInfo();

    slider.addEventListener('input', updatePulseInfo);

    toggleRow.appendChild(enableBtn);
    toggleRow.appendChild(modeBtn);
    toggleRow.appendChild(pulseInfo);

    control.appendChild(sliderRow);
    control.appendChild(toggleRow);

    card.appendChild(header);
    // Disable slider when channel is off
    slider.disabled = !ch.enabled;

    // Click-to-edit on value display
    makeEditable(valueDisplay, (newVal) => {
        if (ch.mode === 'angle' && ch.calibrated) {
            newVal = Math.max(slider.min, Math.min(slider.max, newVal));
            slider.value = newVal;
        } else {
            newVal = Math.max(slider.min, Math.min(slider.max, newVal));
            slider.value = Math.round(newVal);
        }
        slider.dispatchEvent(new Event('input'));
        slider.dispatchEvent(new Event('change'));
    });

    // Click-to-edit on pulse display
    makeEditable(pulseInfo, (newVal) => {
        if (ch.mode === 'angle' && ch.calibrated) {
            // Convert pulse µs → angle
            const ratio = (newVal - ch.minPulse) / (ch.maxPulse - ch.minPulse);
            let angle = ch.minAngle + ratio * (ch.maxAngle - ch.minAngle);
            angle = Math.max(slider.min, Math.min(slider.max, angle));
            slider.value = angle;
        } else {
            newVal = Math.max(slider.min, Math.min(slider.max, newVal));
            slider.value = Math.round(newVal);
        }
        slider.dispatchEvent(new Event('input'));
        slider.dispatchEvent(new Event('change'));
    });

    card.appendChild(control);

    // Store refs for later updates
    card._slider = slider;
    card._valueDisplay = valueDisplay;
    card._modeBtn = modeBtn;
    card._pulseInfo = pulseInfo;
    card._nameInput = nameInput;
    card._calibBtn = calibBtn;
    card._enableBtn = enableBtn;

    return card;
}

// ═══════════════════════════════════════════════════════════════════
// Handlers
// ═══════════════════════════════════════════════════════════════════

async function onSliderChange(ch, value) {
    try {
        if (ch.mode === 'angle' && ch.calibrated) {
            await setServo(ch.channel, value, null);
            ch.angle = value;
            ch.duty = null;
        } else {
            // Slider is in µs; convert to duty (0–1)
            const periodUs = 1_000_000 / state.frequencyHz;
            const duty = Math.round(value) / periodUs;
            await setServo(ch.channel, null, duty);
            ch.duty = duty;
            ch.angle = null;
        }
    } catch (err) {
        toast(err.message, 'error');
        // Revert slider
        const card = document.querySelector(`.channel-card[data-channel="${ch.channel}"]`);
        if (card && card._slider) {
            if (ch.mode === 'angle' && ch.calibrated) {
                card._slider.value = ch.angle !== null ? ch.angle : 0;
            } else {
                const periodUs = 1_000_000 / state.frequencyHz;
                card._slider.value = ch.duty !== null ? Math.round(ch.duty * periodUs) : state.minPulseUs;
            }
        }
        renderAllChannels(); // full refresh on error
    }
}

async function onNameChange(channel, newName) {
    const trimmed = newName.trim();
    if (!trimmed) {
        // Revert to previous name
        const ch = state.channels[channel];
        const card = document.querySelector(`.channel-card[data-channel="${channel}"]`);
        if (card && card._nameInput) card._nameInput.value = ch.name;
        return;
    }
    try {
        await setChannelName(channel, trimmed);
        state.channels[channel].name = trimmed;
    } catch (err) {
        toast(err.message, 'error');
        const ch = state.channels[channel];
        const card = document.querySelector(`.channel-card[data-channel="${channel}"]`);
        if (card && card._nameInput) card._nameInput.value = ch.name;
    }
}

async function onChannelEnableToggle(ch, enableBtn, slider) {
    const newEnabled = !ch.enabled;
    try {
        await setOutputChannel(ch.channel, newEnabled);
        ch.enabled = newEnabled;
        enableBtn.className = 'channel-enable-toggle ' + (ch.enabled ? 'on' : 'off');
        enableBtn.textContent = ch.enabled ? i18n.t('channel.on') : i18n.t('channel.off');
        enableBtn.title = ch.enabled ? i18n.t('tooltip.disableChannel') : i18n.t('tooltip.enableChannel');
        slider.disabled = !ch.enabled;
        const card = document.querySelector(`.channel-card[data-channel="${ch.channel}"]`);
        if (card) {
            card.classList.toggle('disabled', !ch.enabled);
        }
    } catch (err) {
        toast(err.message, 'error');
    }
}

// ═══════════════════════════════════════════════════════════════════
// Render: Actions List
// ═══════════════════════════════════════════════════════════════════

function renderActions() {
    const list = document.getElementById('actionsList');
    if (!list) return;
    list.innerHTML = '';

    if (state.actions.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'actions-empty';
        empty.textContent = i18n.t('actions.empty');
        list.appendChild(empty);
        return;
    }

    state.actions.forEach((action, idx) => {
        const chCount = action.channels.filter(
            ch => ch.angle !== null || ch.duty !== null
        ).length;

        const card = document.createElement('div');
        card.className = 'action-card';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'action-name';
        nameSpan.textContent = action.name;
        nameSpan.title = action.name;

        const infoSpan = document.createElement('span');
        infoSpan.className = 'action-info';
        infoSpan.textContent = i18n.t('actions.channelsWithData', chCount);

        // ── Button row ──
        const btnRow = document.createElement('div');
        btnRow.className = 'action-buttons';

        const playBtn = document.createElement('button');
        playBtn.className = 'btn btn-primary btn-action-play';
        playBtn.textContent = i18n.t('actions.play');
        playBtn.addEventListener('click', () => handlePlayAction(idx));

        const renameBtn = document.createElement('button');
        renameBtn.className = 'btn btn-outline btn-action-rename';
        renameBtn.textContent = '✎';
        renameBtn.title = i18n.t('actions.renamePrompt');
        renameBtn.addEventListener('click', () => handleRenameAction(idx));

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-danger btn-action-delete';
        deleteBtn.textContent = i18n.t('actions.delete');
        deleteBtn.addEventListener('click', () => handleDeleteAction(idx));

        btnRow.appendChild(renameBtn);
        btnRow.appendChild(playBtn);
        btnRow.appendChild(deleteBtn);

        card.appendChild(nameSpan);
        card.appendChild(infoSpan);
        card.appendChild(btnRow);
        list.appendChild(card);
    });
}

async function handleRecordAction() {
    const input = document.getElementById('actionNameInput');
    const btn = document.getElementById('btnRecordAction');
    const finalName = input.value.trim() || input.placeholder;
    btn.disabled = true;
    try {
        await recordAction(finalName);
        await fetchActions();
        input.value = '';
        input.placeholder = i18n.t('actions.defaultName', state.actions.length + 1);
        toast(i18n.t('toast.actionRecorded'));
    } catch (err) {
        toast(err.message, 'error');
    } finally {
        btn.disabled = false;
    }
}

async function handlePlayAction(idx) {
    try {
        const result = await playAction(idx);
        toast(i18n.t('toast.actionPlayed', result.detail));
        await fetchChannels();
    } catch (err) {
        toast(err.message, 'error');
    }
}

async function handleDeleteAction(idx) {
    if (!confirm(i18n.t('actions.confirmDelete'))) return;
    try {
        await deleteAction(idx);
        await fetchActions();
        toast(i18n.t('toast.actionDeleted'));
    } catch (err) {
        toast(err.message, 'error');
    }
}

async function handleRenameAction(idx) {
    const action = state.actions[idx];
    const newName = prompt(i18n.t('actions.renamePrompt'), action.name);
    if (!newName || newName.trim() === '' || newName.trim() === action.name) return;
    try {
        await renameAction(idx, newName.trim());
        await fetchActions();
        toast(i18n.t('toast.actionRenamed'));
    } catch (err) {
        toast(err.message, 'error');
    }
}

// ═══════════════════════════════════════════════════════════════════
// Settings Modal
// ═══════════════════════════════════════════════════════════════════

let settingsOpen = false;

function openSettingsModal() {
    settingsOpen = true;
    document.getElementById('settingFreq').value = state.frequencyHz;
    document.getElementById('settingFreqNum').value = state.frequencyHz;
    document.getElementById('settingPulseMin').value = state.minPulseUs;
    document.getElementById('settingPulseMax').value = state.maxPulseUs;
    document.getElementById('settingsModal').classList.remove('hidden');
}

function closeSettingsModal() {
    settingsOpen = false;
    document.getElementById('settingsModal').classList.add('hidden');
}

async function applySettings() {
    const hz = Number(document.getElementById('settingFreq').value);
    const minUs = Number(document.getElementById('settingPulseMin').value);
    const maxUs = Number(document.getElementById('settingPulseMax').value);

    try {
        if (hz !== state.frequencyHz) {
            await setFrequency(hz);
            state.frequencyHz = hz;
        }
        if (minUs !== state.minPulseUs || maxUs !== state.maxPulseUs) {
            await setPulseRange(minUs, maxUs);
            state.minPulseUs = minUs;
            state.maxPulseUs = maxUs;
        }
        renderStatusBar();
        closeSettingsModal();
        toast(i18n.t('toast.settingsApplied'));
    } catch (err) {
        toast(err.message, 'error');
    }
}

async function handleClearCache() {
    if (!confirm(i18n.t('settings.confirmClearCache'))) return;
    try {
        await clearConfig();
        // Re-fetch everything to reflect the reset state
        await fetchStatus();
        await fetchChannels();
        await fetchActions();
        closeSettingsModal();
        toast(i18n.t('toast.cacheCleared'));
    } catch (err) {
        toast(err.message, 'error');
    }
}

// Frequency slider ↔ number sync
document.addEventListener('DOMContentLoaded', () => {
    const freqSlider = document.getElementById('settingFreq');
    const freqNum = document.getElementById('settingFreqNum');
    freqSlider.addEventListener('input', () => { freqNum.value = freqSlider.value; });
    freqNum.addEventListener('input', () => { freqSlider.value = freqNum.value; });
});

// ═══════════════════════════════════════════════════════════════════
// Calibrate Modal
// ═══════════════════════════════════════════════════════════════════

let calibChannel = 0;

function openCalibrateModal(channel) {
    calibChannel = channel;
    const ch = state.channels[channel];
    document.getElementById('calibModalTitle').textContent = i18n.t('calibrate.title', channel);

    document.getElementById('calibMinAngle').value = ch.calibrated ? ch.minAngle : 0;
    document.getElementById('calibMaxAngle').value = ch.calibrated ? ch.maxAngle : 180;
    document.getElementById('calibMinPulse').value = ch.calibrated ? ch.minPulse : state.minPulseUs;
    document.getElementById('calibMaxPulse').value = ch.calibrated ? ch.maxPulse : state.maxPulseUs;

    document.getElementById('calibrateModal').classList.remove('hidden');
}

function closeCalibrateModal() {
    document.getElementById('calibrateModal').classList.add('hidden');
    calibChannel = 0;
}

async function applyCalibrate() {
    const minAngle = Number(document.getElementById('calibMinAngle').value);
    const maxAngle = Number(document.getElementById('calibMaxAngle').value);
    const minPulse = Number(document.getElementById('calibMinPulse').value);
    const maxPulse = Number(document.getElementById('calibMaxPulse').value);

    if (minAngle >= maxAngle) { toast(i18n.t('validation.minAngleLtMaxAngle'), 'error'); return; }
    if (minPulse >= maxPulse) { toast(i18n.t('validation.minPulseLtMaxPulse'), 'error'); return; }

    try {
        await calibrateChannel(calibChannel, {
            min_angle: minAngle, max_angle: maxAngle,
            min_pulse: minPulse, max_pulse: maxPulse,
        });

        const ch = state.channels[calibChannel];
        ch.calibrated = true;
        ch.minAngle = minAngle;
        ch.maxAngle = maxAngle;
        ch.minPulse = minPulse;
        ch.maxPulse = maxPulse;
        ch.mode = 'angle';
        ch.angle = (minAngle + maxAngle) / 2;

        closeCalibrateModal();
        renderAllChannels();
        // Set initial angle
        await setServo(calibChannel, ch.angle, null);
        toast(i18n.t('toast.channelCalibrated', calibChannel));
    } catch (err) {
        toast(err.message, 'error');
    }
}

async function clearCalibrate() {
    try {
        // Send an empty calibration — we just unset via name change or re-fetch
        // Actually there's no "uncalibrate" endpoint, so we just clear locally
        // and tell the user to use duty mode.
        // For now, we set the calibration to a zeroed state which effectively
        // means no calibration.  But the API doesn't support clearing.
        // WORKAROUND: set min_angle=max_angle, which makes it invalid.
        // Better: just treat the "Clear" as switching to duty mode.
        toast(i18n.t('toast.useDutyMode', calibChannel));
        state.channels[calibChannel].calibrated = false;
        state.channels[calibChannel].mode = 'duty';
        closeCalibrateModal();
        renderAllChannels();
    } catch (err) {
        toast(err.message, 'error');
    }
}

// ═══════════════════════════════════════════════════════════════════
// Workspace Import / Export
// ═══════════════════════════════════════════════════════════════════

async function handleExport() {
    try {
        const data = await exportWorkspace();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        a.download = `pca9685-workspace-${timestamp}.json`;
        a.click();
        URL.revokeObjectURL(url);
        toast(i18n.t('toast.workspaceExported'));
    } catch (err) {
        toast(err.message, 'error');
    }
}

async function handleImport(file) {
    try {
        const text = await file.text();
        const data = JSON.parse(text);
        await importWorkspace(data);
        // Re-fetch everything
        await fetchStatus();
        await fetchChannels();
        toast(i18n.t('toast.workspaceImported'));
    } catch (err) {
        toast(i18n.t('toast.importFailed', err.message), 'error');
    }
}

// ═══════════════════════════════════════════════════════════════════
// Init
// ═══════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
    // ── i18n initialisation ──
    i18n.init();

    // ── Group system ──
    initGroups();

    // Re-render dynamic UI when language changes
    i18n._onChange = () => {
        renderStatusBar();
        renderGlobalEnableBtn();
        renderAllChannels();
        renderActions();
        // Update action name placeholder
        const inp = document.getElementById('actionNameInput');
        if (inp && !inp.value) {
            inp.placeholder = i18n.t('actions.defaultName', state.actions.length + 1);
        }
        // Update calibration modal title if it's open
        if (!document.getElementById('calibrateModal').classList.contains('hidden')) {
            document.getElementById('calibModalTitle').textContent = i18n.t('calibrate.title', calibChannel);
        }
    };

    // Language selector
    document.getElementById('langSelect').addEventListener('change', (e) => {
        i18n.setLocale(e.target.value);
    });

    // ── Button bindings ──
    document.getElementById('btnGlobalEnable').addEventListener('click', async () => {
        const btn = document.getElementById('btnGlobalEnable');
        btn.disabled = true;
        try {
            const newState = !state.outputEnabled;
            await setOutputGlobal(newState);
            state.outputEnabled = newState;
            renderGlobalEnableBtn();
            // Re-fetch channels to sync enable states
            await fetchChannels();
            toast(state.outputEnabled ? i18n.t('toast.outputEnabled') : i18n.t('toast.outputDisabled'));
        } catch (err) {
            toast(err.message, 'error');
        } finally {
            btn.disabled = false;
        }
    });
    document.getElementById('btnExport').addEventListener('click', handleExport);
    document.getElementById('btnImport').addEventListener('click', () => {
        document.getElementById('importFileInput').click();
    });
    document.getElementById('importFileInput').addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
            handleImport(e.target.files[0]);
            e.target.value = '';
        }
    });
    document.getElementById('btnSettings').addEventListener('click', openSettingsModal);
    document.getElementById('btnCloseSettings').addEventListener('click', closeSettingsModal);
    document.getElementById('btnApplySettings').addEventListener('click', applySettings);
    document.getElementById('btnClearCache').addEventListener('click', handleClearCache);

    // Calibrate modal
    document.getElementById('btnCloseCalibrate').addEventListener('click', closeCalibrateModal);
    document.getElementById('btnApplyCalibrate').addEventListener('click', applyCalibrate);
    document.getElementById('btnClearCalibrate').addEventListener('click', clearCalibrate);

    // ── Actions bindings ──
    const actionInput = document.getElementById('actionNameInput');
    actionInput.placeholder = i18n.t('actions.defaultName', 1);
    document.getElementById('btnRecordAction').addEventListener('click', handleRecordAction);
    actionInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleRecordAction();
    });

    // Close modals on overlay click
    document.getElementById('settingsModal').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeSettingsModal();
    });
    document.getElementById('calibrateModal').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeCalibrateModal();
    });

    // Close modals on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeSettingsModal();
            closeCalibrateModal();
        }
    });

    // ── Initial data load ──
    fetchStatus().catch(() => {});
    fetchChannels().catch(() => {});
    fetchActions().catch(() => {});

    // ── SSE connection ──
    connectSSE();
});
