let commands = [];
const commandList = document.getElementById('command-list');
const addModal = document.getElementById('add-modal');
const commandInput = document.getElementById('command-input');
const autolaunchToggle = document.getElementById('autolaunch-toggle');

// Navigation
function showTab(tab) {
    const commandView = document.getElementById('command-view');
    const guideView = document.getElementById('guide-view');
    const navCommands = document.getElementById('nav-commands');
    const navGuide = document.getElementById('nav-guide');

    if (tab === 'commands') {
        commandView.style.display = 'block';
        guideView.style.display = 'none';
        navCommands.classList.add('active');
        navGuide.classList.remove('active');
    } else {
        commandView.style.display = 'none';
        guideView.style.display = 'block';
        navCommands.classList.remove('active');
        navGuide.classList.add('active');
    }
}

function openLink(url) {
    window.api.openExternal(url);
}

// Initialize app
async function init() {
    commands = await window.api.getCommands();
    const isAutolaunch = await window.api.getAutoLaunch();
    autolaunchToggle.checked = isAutolaunch;
    
    renderCommands();

    // Auto-run on startup logic
    // We'll mark in sessionStorage that we've auto-run once per window session
    if (!sessionStorage.getItem('autoRunDone')) {
        console.log('App started, auto-running queue...');
        runAllCommands();
        sessionStorage.setItem('autoRunDone', 'true');
    }
}

// Render the queue
function renderCommands() {
    if (commands.length === 0) {
        commandList.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📂</div>
                <p>No commands added yet.</p>
            </div>`;
        return;
    }

    commandList.innerHTML = commands.map((cmd, index) => `
        <div class="command-card" id="cmd-${index}">
            <div class="command-header">
                <div class="command-info">
                    <div class="command-title-row">
                        <span class="method-badge">${cmd.method || 'GET'}</span>
                        <h4 class="command-memo-text">${cmd.memo || 'Untitled Request'}</h4>
                    </div>
                    <p class="command-url-text">${cmd.url}</p>
                </div>
                <div class="command-actions">
                    <button class="btn secondary" onclick="runCommand(${index})">Run</button>
                    <button class="btn ghost" onclick="openEditModal(${index})">✏️</button>
                    <button class="btn ghost" onclick="deleteCommand(${index})">🗑️</button>
                </div>
            </div>
            <div id="log-${index}" class="log-section">
                ${cmd.lastLog ? `<div class="log-entry">${cmd.lastLog}</div>` : '<div class="log-entry" style="opacity: 0.5">Waiting for execution...</div>'}
            </div>
        </div>
    `).join('');
}

// Run a single command
async function runCommand(index) {
    const cmd = commands[index];
    const logEl = document.getElementById(`log-${index}`);
    const cardEl = document.getElementById(`cmd-${index}`);
    
    logEl.innerHTML = '<div class="log-entry">🚀 Running (via backend)...</div>';
    cardEl.classList.add('running');

    try {
        const result = await window.api.executeRequest(cmd);

        if (!result.success) {
            throw new Error(result.error);
        }

        const { status, data, duration } = result;
        cardEl.classList.remove('running');
        
        let displayResult = data;
        try {
            // Try to format as JSON if possible
            displayResult = JSON.stringify(JSON.parse(data), null, 2);
        } catch(e) {}

        const logMsg = `[${new Date().toLocaleTimeString()}] Status: ${status} (${duration}ms)\n${displayResult.substring(0, 500)}${displayResult.length > 500 ? '...' : ''}`;
        
        cmd.lastLog = logMsg;
        logEl.innerHTML = `<div class="log-entry">${logMsg.replace(/\n/g, '<br>')}</div>`;
        
        // Add success/fail class for visual cue
        if (status >= 200 && status < 300) {
            cardEl.style.borderColor = 'var(--success)';
            return true; // Success
        } else {
            cardEl.style.borderColor = 'var(--error)';
            return false; // Failed
        }

        window.api.saveCommands(commands);
    } catch (error) {
        cardEl.classList.remove('running');
        cardEl.style.borderColor = 'var(--error)';
        const logMsg = `[${new Date().toLocaleTimeString()}] Error: ${error.message}`;
        cmd.lastLog = logMsg;
        logEl.innerHTML = `<div class="log-entry error">${logMsg}</div>`;
        window.api.saveCommands(commands);
        return false; // Failed
    }
}

// Run all commands in the queue
async function runAllCommands() {
    if (commands.length === 0) return;
    
    const statusBar = document.getElementById('status-bar');
    const statusText = document.getElementById('status-text');
    const statusCount = document.getElementById('status-count');
    const progressFill = document.getElementById('progress-fill');
    
    statusBar.style.display = 'block';
    let successCount = 0;
    
    for (let i = 0; i < commands.length; i++) {
        const progress = ((i + 1) / commands.length) * 100;
        statusText.innerText = `Processing Command ${i+1}...`;
        statusCount.innerText = `${i+1} / ${commands.length}`;
        progressFill.style.width = `${progress}%`;

        const isSuccess = await runCommand(i);
        if (isSuccess) successCount++;
        
        if (i < commands.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }

    setTimeout(() => {
        statusBar.style.display = 'none';
        showToast(`✅ Run All Complete: ${successCount} Success, ${commands.length - successCount} Failed`);
    }, 1000);
}

function showToast(message) {
    const toast = document.getElementById('toast');
    toast.innerText = message;
    toast.className = 'toast show';
    setTimeout(() => { toast.className = toast.className.replace('show', ''); }, 4000);
}

// Delete a command
function deleteCommand(index) {
    commands.splice(index, 1);
    renderCommands();
    window.api.saveCommands(commands);
}

// Add a command (parsing curl or fetch)
let editingIndex = -1;

async function addCommand() {
    const raw = commandInput.value.trim();
    const memoInput = document.getElementById('command-memo');
    const memo = memoInput.value.trim();
    if (!raw) return;

    if (editingIndex !== -1) {
        // Handle Editing
        const chunks = raw.split(/(?=fetch\s*\(|curl\s+)/).filter(c => c.trim().length > 5);
        if (chunks.length > 0) {
            const chunk = chunks[0].trim(); // Only take the first one for direct edit
            let parsed = null;
            if (chunk.startsWith('curl')) {
                const result = await window.api.parseCurl(chunk);
                if (result.success) parsed = result.data;
            } else if (chunk.startsWith('fetch')) {
                parsed = parseFetchString(chunk);
            }

            if (parsed) {
                // Keep the lastLog and other fields if needed
                const oldLog = commands[editingIndex].lastLog;
                commands[editingIndex] = { ...parsed, rawInput: chunk, lastLog: oldLog, memo: memo };
            }
        }
    } else {
        // Handle New Add
        const chunks = raw.split(/(?=fetch\s*\(|curl\s+)/).filter(c => c.trim().length > 5);
        let addedCount = 0;
        for (let chunk of chunks) {
            chunk = chunk.trim();
            let parsed = null;
            if (chunk.startsWith('curl')) {
                const result = await window.api.parseCurl(chunk);
                if (result.success) parsed = result.data;
            } else if (chunk.startsWith('fetch')) {
                parsed = parseFetchString(chunk);
            }
            if (parsed) {
                commands.push({ ...parsed, rawInput: chunk, lastLog: null, memo: memo });
                addedCount++;
            }
        }
        if (addedCount === 0) {
            alert('Could not find any valid fetch or curl commands.');
            return;
        }
    }

    renderCommands();
    window.api.saveCommands(commands);
    closeModal();
}

function openEditModal(index) {
    editingIndex = index;
    const cmd = commands[index];
    const memoInput = document.getElementById('command-memo');
    document.querySelector('#add-modal h3').innerText = 'Edit Command';
    document.getElementById('save-command-btn').innerText = 'Save Changes';
    commandInput.value = cmd.rawInput || ''; 
    memoInput.value = cmd.memo || '';
    openModal();
}

// Modal controls
function openModal() { addModal.style.display = 'block'; }
function closeModal() { 
    addModal.style.display = 'none'; 
    editingIndex = -1;
    const memoInput = document.getElementById('command-memo');
    document.querySelector('#add-modal h3').innerText = 'Add New Command';
    document.getElementById('save-command-btn').innerText = 'Add to Queue';
    commandInput.value = '';
    memoInput.value = '';
}

// Utility to parse fetch string into object
// Note: This is a simplified parser for common fetch patterns
function parseFetchString(str) {
    try {
        // This is a bit "hacky" but works for copy-pasted fetch from devtools
        // We'll use a safe evaluation approach by stripping "fetch(" and ending ")"
        const match = str.match(/fetch\s*\(\s*["'`](.*?)["'`]\s*(?:,\s*(\{[\s\S]*\}))?\s*\)/);
        if (!match) throw new Error('Invalid fetch format');

        const url = match[1];
        const optionsStr = match[2] || '{}';
        
        // Clean up optionsStr to be valid JSON if possible, or use Function to parse JS object
        // Many browser fetch copies use unquoted keys or JS features
        const options = new Function(`return ${optionsStr}`)();

        return {
            url: url,
            method: (options.method || 'GET').toUpperCase(),
            headers: options.headers || {},
            body: typeof options.body === 'string' ? options.body : (options.body ? JSON.stringify(options.body) : undefined)
        };
    } catch (e) {
        console.error('Parse error:', e);
        alert('Error parsing command structure. Please ensure it is a valid fetch or curl.');
        return null;
    }
}

// Event Listeners
document.getElementById('add-command-btn').onclick = openModal;
document.getElementById('close-modal-btn').onclick = closeModal;
document.getElementById('save-command-btn').onclick = addCommand;
document.getElementById('run-all-btn').onclick = runAllCommands;

autolaunchToggle.onchange = async (e) => {
    await window.api.setAutoLaunch(e.target.checked);
};

// Window click to close modal
window.onclick = (event) => {
    if (event.target == addModal) closeModal();
};

init();
