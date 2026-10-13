// Zakariya zDola30s Pro - Clean Single-Screen Engine with Master ON/OFF Power Controller
document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const toggleMasterPower = document.getElementById('toggle-master-power');
    const masterPowerCard = document.getElementById('master-power-card');
    const powerStatusText = document.getElementById('power-status-text');
    const powerSubtitle = document.getElementById('power-subtitle');
    const disabledSafeBanner = document.getElementById('disabled-safe-banner');
    const btnEnableQuick = document.getElementById('btn-enable-quick');
    const mainWorkspace = document.getElementById('main-workspace');

    const promptInput = document.getElementById('prompt-input');
    const charCount = document.getElementById('char-count');
    const btnHumanize = document.getElementById('btn-humanize');
    const btnPaste = document.getElementById('btn-paste');
    const btnClear = document.getElementById('btn-clear');
    const btnSample = document.getElementById('btn-sample');
    const btnGenerate = document.getElementById('btn-generate');
    const generateBtnText = document.getElementById('generate-btn-text');
    const ratioBtns = document.querySelectorAll('.ratio-btn');
    const toggleAutoDownload = document.getElementById('toggle-auto-download');
    const actionAlert = document.getElementById('action-alert');
    const alertMessage = document.getElementById('alert-message');
    const connectionStatus = document.getElementById('connection-status');
    const downloadsList = document.getElementById('downloads-list');
    const downloadCountBadge = document.getElementById('download-count-badge');

    let isExtensionEnabled = true;
    let activeRatio = '9:16';
    let isAutoDownload = true;
    let recentDownloads = [];

    // 🧠 Humanizer Engine to clean & format prompts naturally for Dola AI
    function humanizePromptText(raw) {
        if (!raw || typeof raw !== 'string') return '';
        let text = raw.trim();

        // 1. Filter out rigid robotic / flagged trigger terms
        text = text.replace(/\b(8k|4k|hdr|photorealistic|hyperrealistic|bypass|refusal zero|zero refusal|force 30s|octane render|trending on artstation|masterpiece|ultra detailed|unwatermarked|hd 1080p)\b/gi, '');
        text = text.replace(/\s{2,}/g, ' ').replace(/,\s*,/g, ',').trim();

        // 2. Ensure natural cinematic descriptive visual phrasing
        if (text.length > 0 && !/^(a|an|the|cinematic|stunning|dramatic|beautiful|slow motion|natural)\b/i.test(text)) {
            text = "A natural cinematic visual of " + text.charAt(0).toLowerCase() + text.slice(1);
        }

        // 3. Ensure clean sentence structure
        if (text && !/[.!?]$/.test(text)) {
            text += '.';
        }

        return text.trim();
    }

    if (btnHumanize) {
        btnHumanize.addEventListener('click', () => {
            const current = promptInput.value;
            if (!current.trim()) {
                showAlert('Please type or paste a prompt first!', 'info');
                return;
            }
            const humanized = humanizePromptText(current);
            promptInput.value = humanized;
            promptInput.dispatchEvent(new Event('input', { bubbles: true }));
            charCount.textContent = `${humanized.length} chars`;
            showAlert('🧠 Prompt Humanized! Anti-bot bypass applied.', 'success');
        });
    }

    // 1. Load saved settings & extension power state
    chrome.storage.local.get([
        'zdola_extension_enabled',
        'zdola_saved_ratio',
        'zdola_auto_download',
        'zdola_recent_downloads'
    ], (res) => {
        if (typeof res.zdola_extension_enabled === 'boolean') {
            isExtensionEnabled = res.zdola_extension_enabled;
        } else {
            isExtensionEnabled = true;
        }
        applyPowerUI(isExtensionEnabled);

        if (res.zdola_saved_ratio) {
            activeRatio = res.zdola_saved_ratio;
            ratioBtns.forEach(btn => {
                btn.classList.toggle('active', btn.dataset.ratio === activeRatio);
            });
        }
        if (typeof res.zdola_auto_download === 'boolean') {
            isAutoDownload = res.zdola_auto_download;
            if (toggleAutoDownload) toggleAutoDownload.checked = isAutoDownload;
        }
        if (res.zdola_recent_downloads && Array.isArray(res.zdola_recent_downloads)) {
            recentDownloads = res.zdola_recent_downloads;
            renderDownloads();
        }
    });

    // Check active Dola tab connection
    checkDolaTab();

    // 2. Master Extension Power Toggle Functionality
    function applyPowerUI(enabled) {
        if (toggleMasterPower) toggleMasterPower.checked = enabled;
        
        if (enabled) {
            if (masterPowerCard) masterPowerCard.classList.remove('disabled');
            if (powerStatusText) {
                powerStatusText.textContent = 'ON';
                powerStatusText.style.color = '#34d399';
            }
            if (powerSubtitle) powerSubtitle.textContent = '30s Force Engine & Auto-Download Active';
            if (disabledSafeBanner) disabledSafeBanner.style.display = 'none';
            if (mainWorkspace) mainWorkspace.classList.remove('engine-disabled');
            if (btnGenerate) {
                btnGenerate.disabled = false;
                generateBtnText.textContent = 'Generate 30s Video';
            }
        } else {
            if (masterPowerCard) masterPowerCard.classList.add('disabled');
            if (powerStatusText) {
                powerStatusText.textContent = 'OFF';
                powerStatusText.style.color = '#94a3b8';
            }
            if (powerSubtitle) powerSubtitle.textContent = 'Extension Paused — Native Mode Active';
            if (disabledSafeBanner) disabledSafeBanner.style.display = 'flex';
            if (mainWorkspace) mainWorkspace.classList.add('engine-disabled');
            if (btnGenerate) {
                btnGenerate.disabled = true;
                generateBtnText.textContent = 'Extension Paused';
            }
        }
    }

    function setExtensionPower(enabled) {
        isExtensionEnabled = enabled;
        applyPowerUI(enabled);

        // Save in storage
        chrome.storage.local.set({ zdola_extension_enabled: enabled }, () => {
            // Notify background worker
            chrome.runtime.sendMessage({
                type: 'EXTENSION_POWER_TOGGLED',
                enabled: enabled
            }, () => {
                if (chrome.runtime.lastError) { /* ignore */ }
            });

            // Broadcast to all open Dola / Doubao tabs
            chrome.tabs.query({ url: ['*://*.dola.com/*', '*://*.dola.ai/*', '*://*.doubao.com/*', '*://*.seaart.ai/*'] }, (tabs) => {
                if (tabs && tabs.length > 0) {
                    tabs.forEach(t => {
                        chrome.tabs.sendMessage(t.id, {
                            type: 'EXTENSION_POWER_TOGGLED',
                            enabled: enabled
                        }, () => {
                            if (chrome.runtime.lastError) { /* ignore */ }
                        });
                    });
                }
            });

            if (enabled) {
                showAlert('⚡ zDola 30s Engine Activated!', 'success');
            } else {
                showAlert('🛡️ Extension Paused: Account login & prompts are now in native mode.', 'info');
            }
        });
    }

    if (toggleMasterPower) {
        toggleMasterPower.addEventListener('change', () => {
            setExtensionPower(toggleMasterPower.checked);
        });
    }

    if (btnEnableQuick) {
        btnEnableQuick.addEventListener('click', () => {
            setExtensionPower(true);
        });
    }

    // 3. Event: Character counter
    if (promptInput && charCount) {
        promptInput.addEventListener('input', () => {
            charCount.textContent = `${promptInput.value.length} chars`;
        });
    }

    // 4. Event: Paste button (Ultra-Robust Multi-Strategy Clipboard Reader)
    if (btnPaste && promptInput) {
        btnPaste.addEventListener('click', async () => {
            try {
                let text = '';
                if (navigator.clipboard && navigator.clipboard.readText) {
                    text = await navigator.clipboard.readText();
                }
                if (!text) {
                    promptInput.focus();
                    document.execCommand('paste');
                    text = promptInput.value;
                }

                if (text) {
                    promptInput.value = text;
                    promptInput.dispatchEvent(new Event('input', { bubbles: true }));
                    promptInput.dispatchEvent(new Event('change', { bubbles: true }));
                    if (charCount) charCount.textContent = `${promptInput.value.length} chars`;
                    showAlert('Prompt pasted from clipboard!', 'success');
                } else {
                    promptInput.focus();
                    showAlert('Please paste directly using Ctrl+V', 'info');
                }
            } catch (e) {
                promptInput.focus();
                try {
                    document.execCommand('paste');
                    if (charCount) charCount.textContent = `${promptInput.value.length} chars`;
                    showAlert('Prompt pasted!', 'success');
                } catch (err) {
                    showAlert('Press Ctrl+V to paste your prompt', 'info');
                }
            }
        });
    }

    // Event: Clear button
    if (btnClear && promptInput) {
        btnClear.addEventListener('click', () => {
            promptInput.value = '';
            promptInput.dispatchEvent(new Event('input', { bubbles: true }));
            if (charCount) charCount.textContent = '0 chars';
            promptInput.focus();
        });
    }

    // Sample prompts
    const samples = [
        "A natural cinematic visual of a futuristic sports car racing through neon-lit rainy streets at night.",
        "A detailed cinematic slow motion view of a majestic golden dragon soaring over snowy mountain peaks.",
        "A beautiful cinematic commercial of a fashion model walking through an enchanted glowing garden."
    ];

    if (btnSample && promptInput) {
        btnSample.addEventListener('click', () => {
            const rand = samples[Math.floor(Math.random() * samples.length)];
            promptInput.value = rand;
            promptInput.dispatchEvent(new Event('input', { bubbles: true }));
            if (charCount) charCount.textContent = `${rand.length} chars`;
            showAlert('Loaded example prompt!', 'info');
        });
    }

    // Event: Aspect Ratio Selection
    ratioBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            ratioBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeRatio = btn.dataset.ratio;
            chrome.storage.local.set({ zdola_saved_ratio: activeRatio });
            
            // Broadcast ratio to Dola tab
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs && tabs[0]) {
                    chrome.tabs.sendMessage(tabs[0].id, {
                        type: 'SET_ACTIVE_RATIO',
                        ratio: activeRatio
                    }, () => {
                        if (chrome.runtime.lastError) { /* ignore */ }
                    });
                }
            });
        });
    });

    // Event: Auto download toggle
    if (toggleAutoDownload) {
        toggleAutoDownload.addEventListener('change', () => {
            isAutoDownload = toggleAutoDownload.checked;
            chrome.storage.local.set({ zdola_auto_download: isAutoDownload });
            chrome.runtime.sendMessage({
                type: 'TOGGLE_AUTO_DOWNLOAD',
                enabled: isAutoDownload
            }, () => {
                if (chrome.runtime.lastError) { /* ignore */ }
            });
            showAlert(isAutoDownload ? 'Auto-Download Enabled' : 'Auto-Download Paused', isAutoDownload ? 'success' : 'info');
        });
    }

    // Event: Generate Button (If prompt box is present)
    if (btnGenerate) {
        btnGenerate.addEventListener('click', async () => {
            if (!isExtensionEnabled) {
                showAlert('Please turn ON the Extension Master Switch first!', 'error');
                return;
            }

            const prompt = promptInput ? promptInput.value.trim() : '';
            if (!prompt) {
                showAlert('Please enter or paste a prompt first!', 'error');
                if (promptInput) promptInput.focus();
                return;
            }

            btnGenerate.disabled = true;
            if (generateBtnText) generateBtnText.textContent = 'Injecting 30s Task...';

            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                const currentTab = tabs && tabs[0];
                if (!currentTab || !currentTab.url || (!currentTab.url.includes('dola.com') && !currentTab.url.includes('dola.ai') && !currentTab.url.includes('doubao.com'))) {
                    chrome.tabs.query({ url: ['*://*.dola.com/*', '*://*.dola.ai/*', '*://*.doubao.com/*'] }, (dolaTabs) => {
                        if (dolaTabs && dolaTabs.length > 0) {
                            const targetTab = dolaTabs[0];
                            chrome.tabs.update(targetTab.id, { active: true });
                            sendGenerateCommand(targetTab.id, prompt, activeRatio);
                        } else {
                            chrome.tabs.create({ url: 'https://www.dola.com' }, () => {
                                showAlert('Opening Dola...', 'info');
                                btnGenerate.disabled = false;
                                if (generateBtnText) generateBtnText.textContent = 'Generate 30s Video';
                            });
                        }
                    });
                    return;
                }

                sendGenerateCommand(currentTab.id, prompt, activeRatio);
            });
        });
    }

    function sendGenerateCommand(tabId, prompt, ratio) {
        // Automatically humanize prompt before sending to bypass AI bot filters
        const cleanPrompt = humanizePromptText(prompt) || prompt;

        chrome.tabs.sendMessage(tabId, {
            type: 'INJECT_DOLA_TASK',
            prompt: cleanPrompt,
            duration: 30,
            ratio: ratio
        }, (response) => {
            btnGenerate.disabled = false;
            generateBtnText.textContent = 'Generate 30s Video';

            if (chrome.runtime.lastError || !response || !response.success) {
                // Fallback execute humanized script directly in tab world
                chrome.scripting.executeScript({
                    target: { tabId: tabId },
                    func: executeHumanizedPromptInjection,
                    args: [cleanPrompt, ratio]
                }).then(() => {
                    showAlert('⚡ Humanized typing simulation started!', 'success');
                }).catch(() => {
                    showAlert('Please refresh the Dola tab and try again.', 'error');
                });
            } else {
                showAlert('⚡ 30s Humanized Video Task triggered! Auto-download active.', 'success');
            }
        });
    }

    // Advanced human-like in-page composer injection function (Bypasses Dola AI Bot Detection)
    async function executeHumanizedPromptInjection(promptText, targetRatio) {
        const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

        const composerCandidates = [
            'div[data-slate-editor="true"]',
            '[contenteditable="true"][data-placeholder]',
            'textarea.semi-input-textarea',
            '[contenteditable="true"][role="textbox"]',
            'div[contenteditable="true"]',
            'textarea[placeholder]',
            'textarea'
        ];

        let target = null;
        for (const sel of composerCandidates) {
            const el = document.querySelector(sel);
            if (el && (el.offsetWidth > 0 || el.offsetHeight > 0)) {
                target = el;
                break;
            }
        }

        if (!target) {
            await sleep(250);
            target = document.querySelector('textarea, [contenteditable="true"]');
        }

        if (!target) return;

        // 1. Scroll composer smoothly into view & simulate human focus
        try { target.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {}
        await sleep(150);

        const rect = target.getBoundingClientRect();
        const clientX = rect.left + Math.max(10, rect.width / 2);
        const clientY = rect.top + Math.max(10, rect.height / 2);

        target.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, clientX, clientY }));
        target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX, clientY }));
        target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX, clientY }));
        target.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX, clientY }));
        target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX, clientY }));
        target.focus();
        target.dispatchEvent(new Event('focus', { bubbles: true }));
        await sleep(120);

        // 2. Clear target composer text if any
        if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
            const prototype = target instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
            const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
            if (setter) setter.call(target, '');
            else target.value = '';
            target.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
            document.execCommand('selectAll', false, null);
            document.execCommand('delete', false, null);
        }

        // 3. Human Typing Simulation Loop (Chunked & Character Keystrokes with Jitter)
        let currentText = '';
        const chunks = promptText.match(/.{1,3}/g) || [promptText];

        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            currentText += chunk;

            const firstChar = chunk.charAt(0);
            const keyCode = firstChar.charCodeAt(0) || 65;

            // Keydown event
            target.dispatchEvent(new KeyboardEvent('keydown', {
                key: firstChar,
                code: 'Key' + firstChar.toUpperCase(),
                keyCode: keyCode,
                which: keyCode,
                bubbles: true
            }));

            // Beforeinput event
            target.dispatchEvent(new InputEvent('beforeinput', {
                bubbles: true,
                cancelable: true,
                data: chunk,
                inputType: 'insertText'
            }));

            // Text Mutation
            if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
                const prototype = target instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
                const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
                if (setter) setter.call(target, currentText);
                else target.value = currentText;

                if (target._valueTracker) {
                    try { target._valueTracker.setValue(''); } catch (e) {}
                }
            } else {
                const inserted = document.execCommand('insertText', false, chunk);
                if (!inserted) {
                    target.innerText = currentText;
                }
            }

            // Input Event
            target.dispatchEvent(new InputEvent('input', {
                bubbles: true,
                data: chunk,
                inputType: 'insertText'
            }));

            // Keyup event
            target.dispatchEvent(new KeyboardEvent('keyup', {
                key: firstChar,
                code: 'Key' + firstChar.toUpperCase(),
                keyCode: keyCode,
                which: keyCode,
                bubbles: true
            }));

            // Human typing delay jitter (12ms - 35ms per chunk + extra micro-pause on punctuation/space)
            let delay = Math.floor(Math.random() * 23) + 12;
            if (chunk.includes(' ') || chunk.includes(',')) {
                delay += Math.floor(Math.random() * 50) + 30;
            }
            await sleep(delay);
        }

        // Final input & change events
        target.dispatchEvent(new Event('change', { bubbles: true }));

        // 4. Dispatch 30s ratio update settings
        window.postMessage({ type: 'PURZA_UPDATE_SETTINGS', ratio: targetRatio, duration: 30 }, '*');
        window.postMessage({ type: 'SET_RATIO_OVERRIDE', ratio: targetRatio, duration: 30 }, '*');

        // 5. Human Reading Pause before clicking send (800ms - 1400ms)
        const readingPause = Math.floor(Math.random() * 600) + 800;
        await sleep(readingPause);

        // 6. Humanized Mouse Hover & Pointer Click on Send Button
        const sendBtnSelectors = [
            'button[type="submit"]',
            'button[aria-label*="send" i]',
            'button[title*="send" i]',
            'button[data-testid*="send" i]',
            'button[aria-label*="发送"]',
            'div[role="button"][class*="send"]',
            'button[class*="send"]',
            'svg[class*="send"]'
        ];

        let sendBtn = null;
        for (const sel of sendBtnSelectors) {
            const btn = document.querySelector(sel)?.closest('button, div[role="button"]');
            if (btn && !btn.disabled) {
                sendBtn = btn;
                break;
            }
        }

        if (sendBtn) {
            const btnRect = sendBtn.getBoundingClientRect();
            const btnX = btnRect.left + btnRect.width / 2;
            const btnY = btnRect.top + btnRect.height / 2;

            sendBtn.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: btnX, clientY: btnY }));
            sendBtn.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, clientX: btnX, clientY: btnY }));
            await sleep(60);
            sendBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: btnX, clientY: btnY }));
            sendBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: btnX, clientY: btnY }));
            await sleep(90);
            sendBtn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: btnX, clientY: btnY }));
            sendBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: btnX, clientY: btnY }));
            sendBtn.click();
        } else {
            // Fallback: Dispatch human Enter keypress sequence on composer
            target.dispatchEvent(new KeyboardEvent('keydown', {
                key: 'Enter',
                code: 'Enter',
                keyCode: 13,
                which: 13,
                bubbles: true
            }));
            target.dispatchEvent(new KeyboardEvent('keypress', {
                key: 'Enter',
                code: 'Enter',
                keyCode: 13,
                which: 13,
                bubbles: true
            }));
            target.dispatchEvent(new KeyboardEvent('keyup', {
                key: 'Enter',
                code: 'Enter',
                keyCode: 13,
                which: 13,
                bubbles: true
            }));
        }
    }

    function checkDolaTab() {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const currentTab = tabs && tabs[0];
            const isDola = currentTab && currentTab.url && (currentTab.url.includes('dola.com') || currentTab.url.includes('dola.ai') || currentTab.url.includes('doubao.com'));
            if (isDola) {
                connectionStatus.style.background = 'rgba(16, 185, 129, 0.12)';
                connectionStatus.style.borderColor = 'rgba(16, 185, 129, 0.3)';
                connectionStatus.querySelector('.status-text').textContent = 'Dola Active';
                connectionStatus.querySelector('.status-text').style.color = '#10b981';
                connectionStatus.querySelector('.status-indicator').style.background = '#10b981';
            } else {
                connectionStatus.style.background = 'rgba(234, 179, 8, 0.12)';
                connectionStatus.style.borderColor = 'rgba(234, 179, 8, 0.3)';
                connectionStatus.querySelector('.status-text').textContent = 'Dola Inactive';
                connectionStatus.querySelector('.status-text').style.color = '#eab308';
                connectionStatus.querySelector('.status-indicator').style.background = '#eab308';
            }
        });
    }

    function showAlert(msg, type = 'info') {
        actionAlert.style.display = 'flex';
        actionAlert.className = `action-alert ${type}`;
        alertMessage.textContent = msg;
        setTimeout(() => {
            actionAlert.style.display = 'none';
        }, 3500);
    }

    function renderDownloads() {
        if (!recentDownloads || recentDownloads.length === 0) {
            downloadsList.innerHTML = '<div class="empty-downloads">No videos generated in this session yet. Ready for your prompt!</div>';
            downloadCountBadge.textContent = '0 saved';
            return;
        }

        downloadCountBadge.textContent = `${recentDownloads.length} saved`;
        downloadsList.innerHTML = '';

        recentDownloads.slice(0, 5).forEach(item => {
            const div = document.createElement('div');
            div.className = 'download-item';
            div.innerHTML = `
                <span class="download-item-name" title="${item.filename || '30s Video'}">${item.filename || '30s Video'}</span>
                <span class="download-item-tag">1080P HD</span>
            `;
            downloadsList.appendChild(div);
        });
    }

    // Listen for background auto-download notifications
    chrome.runtime.onMessage.addListener((message) => {
        if (message.type === 'AUTO_DOWNLOAD_COMPLETED') {
            const newItem = {
                filename: message.filename || `zDola_30s_${Date.now()}.mp4`,
                timestamp: Date.now()
            };
            recentDownloads.unshift(newItem);
            chrome.storage.local.set({ zdola_recent_downloads: recentDownloads });
            renderDownloads();
            showAlert('🎉 30s Unwatermarked Video Downloaded!', 'success');
        }
    });
});
