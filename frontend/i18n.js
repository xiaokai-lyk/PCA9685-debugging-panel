/**
 * PCA9685 Debug Panel — i18n Module
 *
 * Provides translation support for English (en) and Chinese (zh-CN).
 * Usage: i18n.t('key', optionalArg1, optionalArg2, ...)
 */

const i18n = {
    locale: 'en',
    _onChange: null,

    translations: {
        'en': {
            // ── Status Bar ──────────────────────────────────────────
            'status.online': 'Online',
            'status.offline': 'Offline',
            'status.connecting': 'Connecting…',
            'status.mockMode': 'MOCK MODE',
            'status.i2c': 'I²C:',
            'status.freq': 'Freq:',
            'status.heartbeat': 'Heartbeat:',

            // ── Buttons ─────────────────────────────────────────────
            'btn.enabled': 'ENABLED',
            'btn.disabled': 'DISABLED',
            'btn.export': '⬇ Export',
            'btn.import': '⬆ Import',
            'btn.settings': '⚙ Settings',
            'btn.apply': 'Apply',
            'btn.saveCalibration': 'Save Calibration',
            'btn.clearCalibration': 'Clear Calibration',

            // ── Tooltips ────────────────────────────────────────────
            'tooltip.globalEnable': 'Toggle all channel outputs on/off',
            'tooltip.export': 'Save workspace to computer',
            'tooltip.import': 'Load workspace from computer',
            'tooltip.calibrate': 'Calibrate',
            'tooltip.editCalibration': 'Edit calibration',
            'tooltip.enableChannel': 'Enable this channel',
            'tooltip.disableChannel': 'Disable this channel',
            'tooltip.clickToEdit': 'Click to edit',

            // ── Groups ────────────────────────────────────────────────
            'group.channels': 'Channels',
            'group.actions': 'Actions',
            'group.placeholder': 'No actions configured yet.',

            // ── Channel Cards ───────────────────────────────────────
            'channel.label': 'CH {0}',
            'channel.defaultName': 'Channel {0}',
            'channel.on': 'ON',
            'channel.off': 'OFF',
            'channel.modeAngle': 'Angle',
            'channel.modeDuty': 'Duty',

            // ── Settings Modal ──────────────────────────────────────
            'settings.title': 'Advanced Settings',
            'settings.frequency': 'PWM Frequency',
            'settings.pulseRange': 'Default Pulse Width Range',
            'settings.min': 'Min',
            'settings.max': 'Max',
            'settings.hz': 'Hz',
            'settings.us': 'µs',
            'settings.freqHelp': 'Default 50 Hz. Range: 40–400 Hz.',
            'settings.pulseHelp': 'Used for uncalibrated channels.',

            // ── Calibration Modal ───────────────────────────────────
            'calibrate.title': 'Calibrate Channel {0}',
            'calibrate.angleRange': 'Angle Range',
            'calibrate.pulseRange': 'Pulse Width Range',
            'calibrate.deg': '°',

            // ── Toast Messages ──────────────────────────────────────
            'toast.deviceOnline': 'Device online',
            'toast.deviceOffline': 'Device offline',
            'toast.settingsApplied': 'Settings applied',
            'toast.workspaceExported': 'Workspace exported',
            'toast.workspaceImported': 'Workspace imported & applied',
            'toast.outputEnabled': 'Output enabled',
            'toast.outputDisabled': 'Output disabled',
            'toast.channelCalibrated': 'Channel {0} calibrated',
            'toast.useDutyMode': 'Use duty mode for channel {0} instead',
            'toast.importFailed': 'Import failed: {0}',

            // ── Actions ───────────────────────────────────────────
            'actions.record': 'Record Current Action',
            'actions.defaultName': 'Action {0}',
            'actions.namePlaceholder': 'Action name...',
            'actions.play': 'Play',
            'actions.delete': 'Delete',
            'actions.empty': 'No actions recorded yet.',
            'actions.channelsWithData': '{0} positions',
            'actions.confirmDelete': 'Delete this action?',
            'actions.renamePrompt': 'New name for this action:',
            'toast.actionRecorded': 'Action recorded',
            'toast.actionPlayed': '{0}',
            'toast.actionDeleted': 'Action deleted',
            'toast.actionRenamed': 'Action renamed',

            // ── Validation ─────────────────────────────────────────
            'validation.minAngleLtMaxAngle': 'min_angle must be < max_angle',
            'validation.minPulseLtMaxPulse': 'min_pulse must be < max_pulse',
        },

        'zh-CN': {
            // ── Status Bar ──────────────────────────────────────────
            'status.online': '已连接',
            'status.offline': '已断开',
            'status.connecting': '连接中…',
            'status.mockMode': '模拟模式',
            'status.i2c': 'I²C:',
            'status.freq': '频率:',
            'status.heartbeat': '心跳:',

            // ── Buttons ─────────────────────────────────────────────
            'btn.enabled': '已启用',
            'btn.disabled': '已禁用',
            'btn.export': '⬇ 导出',
            'btn.import': '⬆ 导入',
            'btn.settings': '⚙ 设置',
            'btn.apply': '应用',
            'btn.saveCalibration': '保存校准',
            'btn.clearCalibration': '清除校准',

            // ── Tooltips ────────────────────────────────────────────
            'tooltip.globalEnable': '切换所有通道输出开关',
            'tooltip.export': '保存工作区到电脑',
            'tooltip.import': '从电脑加载工作区',
            'tooltip.calibrate': '校准',
            'tooltip.editCalibration': '编辑校准',
            'tooltip.enableChannel': '启用此通道',
            'tooltip.disableChannel': '禁用此通道',
            'tooltip.clickToEdit': '点击编辑',

            // ── Groups ────────────────────────────────────────────────
            'group.channels': '通道',
            'group.actions': '动作',
            'group.placeholder': '暂无动作配置。',

            // ── Channel Cards ───────────────────────────────────────
            'channel.label': '通道 {0}',
            'channel.defaultName': '通道 {0}',
            'channel.on': '开',
            'channel.off': '关',
            'channel.modeAngle': '角度',
            'channel.modeDuty': '占空比',

            // ── Settings Modal ──────────────────────────────────────
            'settings.title': '高级设置',
            'settings.frequency': 'PWM 频率',
            'settings.pulseRange': '默认脉冲宽度范围',
            'settings.min': '最小',
            'settings.max': '最大',
            'settings.hz': 'Hz',
            'settings.us': 'µs',
            'settings.freqHelp': '默认 50 Hz。范围：40–400 Hz。',
            'settings.pulseHelp': '用于未校准的通道。',

            // ── Calibration Modal ───────────────────────────────────
            'calibrate.title': '校准通道 {0}',
            'calibrate.angleRange': '角度范围',
            'calibrate.pulseRange': '脉冲宽度范围',
            'calibrate.deg': '°',

            // ── Toast Messages ──────────────────────────────────────
            'toast.deviceOnline': '设备已连接',
            'toast.deviceOffline': '设备已断开',
            'toast.settingsApplied': '设置已应用',
            'toast.workspaceExported': '工作区已导出',
            'toast.workspaceImported': '工作区已导入并应用',
            'toast.outputEnabled': '输出已启用',
            'toast.outputDisabled': '输出已禁用',
            'toast.channelCalibrated': '通道 {0} 已校准',
            'toast.useDutyMode': '请改用占空比模式控制通道 {0}',
            'toast.importFailed': '导入失败：{0}',

            // ── Actions ───────────────────────────────────────────
            'actions.record': '记录当前动作',
            'actions.defaultName': '动作 {0}',
            'actions.namePlaceholder': '动作名称...',
            'actions.play': '执行',
            'actions.delete': '删除',
            'actions.empty': '暂无记录的动作。',
            'actions.channelsWithData': '{0} 个位置',
            'actions.confirmDelete': '确认删除此动作？',
            'actions.renamePrompt': '为此动作输入新名称：',
            'toast.actionRecorded': '动作已记录',
            'toast.actionPlayed': '{0}',
            'toast.actionDeleted': '动作已删除',
            'toast.actionRenamed': '动作已重命名',

            // ── Validation ─────────────────────────────────────────
            'validation.minAngleLtMaxAngle': '最小角度必须小于最大角度',
            'validation.minPulseLtMaxPulse': '最小脉冲必须小于最大脉冲',
        },
    },

    /**
     * Get a translated string by key.
     * Supports {0}, {1}, ... placeholders for interpolation.
     * Falls back to English if the key is missing in the current locale.
     */
    t(key, ...args) {
        const dict = this.translations[this.locale] || this.translations['en'];
        let msg = dict[key];
        if (msg === undefined) {
            msg = (this.translations['en'] || {})[key];
            if (msg === undefined) return key;
        }
        for (let i = 0; i < args.length; i++) {
            msg = msg.split('{' + i + '}').join(args[i]);
        }
        return msg;
    },

    /**
     * Switch the active locale.  Triggers `_onChange` callback (set by app.js)
     * so the UI can re-render.
     */
    setLocale(locale) {
        if (!this.translations[locale]) return;
        this.locale = locale;
        try { localStorage.setItem('pca9685-locale', locale); } catch (_) { /* noop */ }
        document.documentElement.lang = locale;
        this._refreshStaticDOM();
        if (typeof this._onChange === 'function') {
            this._onChange(locale);
        }
    },

    /**
     * Walk the DOM and update every element that carries a data-i18n,
     * data-i18n-title, or data-i18n-placeholder attribute.
     */
    _refreshStaticDOM() {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            el.textContent = this.t(el.getAttribute('data-i18n'));
        });
        document.querySelectorAll('[data-i18n-title]').forEach(el => {
            el.title = this.t(el.getAttribute('data-i18n-title'));
        });
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            el.placeholder = this.t(el.getAttribute('data-i18n-placeholder'));
        });
    },

    /**
     * Initialise the i18n module.  Reads the saved locale preference from
     * localStorage, auto-detects from the browser, and applies the result.
     * Call once on page load, before any rendering.
     */
    init() {
        let saved = null;
        try { saved = localStorage.getItem('pca9685-locale'); } catch (_) { /* noop */ }

        if (saved && this.translations[saved]) {
            this.locale = saved;
        } else {
            const navLang = navigator.language || '';
            this.locale = navLang.startsWith('zh') ? 'zh-CN' : 'en';
        }

        document.documentElement.lang = this.locale;

        // Sync the <select> element if it exists
        const sel = document.getElementById('langSelect');
        if (sel) sel.value = this.locale;

        this._refreshStaticDOM();
    },
};
