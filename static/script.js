// Generate or retrieve session ID
let sessionId = localStorage.getItem('chatSessionId');
if (!sessionId) {
    sessionId = crypto.randomUUID();
    localStorage.setItem('chatSessionId', sessionId);
}

const chatBox = document.getElementById('chat-box');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const clearBtn = document.getElementById('clear-btn');

let isStreaming = false;
let currentAiBubble = null;

// Configure marked
marked.setOptions({
    breaks: true,
    gfm: true,
    highlight: function (code, lang) {
        if (lang && hljs.getLanguage(lang)) {
            try {
                return hljs.highlight(code, { language: lang }).value;
            } catch (e) {}
        }
        return code;
    }
});

// Send message
async function sendMessage() {
    const text = messageInput.value.trim();
    if (!text || isStreaming) return;

    messageInput.value = '';
    addMessage(text, 'user');
    isStreaming = true;
    sendBtn.disabled = true;

    // Create AI bubble with typing indicator
    const aiBubble = document.createElement('div');
    aiBubble.className = 'message ai-message';
    aiBubble.innerHTML = `<div class="bubble" id="ai-response"><span class="typing-indicator">...</span></div>`;
    chatBox.appendChild(aiBubble);
    currentAiBubble = aiBubble.querySelector('.bubble');
    scrollToBottom();

    try {
        const response = await fetch('/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: text, session_id: sessionId })
        });

        if (!response.ok) {
            throw new Error('Network response was not ok');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let aiContent = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            // Process SSE events
            const lines = buffer.split('\n');
            buffer = lines.pop(); // retain incomplete line

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const dataStr = line.slice(6);
                    try {
                        const data = JSON.parse(dataStr);
                        if (data.type === 'content') {
                            aiContent += data.data;
                            // Render markdown live (simple update)
                            currentAiBubble.innerHTML = marked.parse(aiContent);
                            addCopyButtons();
                            scrollToBottom();
                        } else if (data.type === 'done') {
                            // Final render
                            currentAiBubble.innerHTML = marked.parse(aiContent);
                            addCopyButtons();
                            scrollToBottom();
                        } else if (data.type === 'error') {
                            currentAiBubble.innerHTML = `<span style="color:red;">Error: ${data.data}</span>`;
                        }
                    } catch (e) {
                        console.error('Parse error', e);
                    }
                }
            }
        }

        // Remove typing indicator if still there
        if (currentAiBubble.querySelector('.typing-indicator')) {
            currentAiBubble.innerHTML = marked.parse(aiContent);
            addCopyButtons();
        }
    } catch (err) {
        console.error(err);
        currentAiBubble.innerHTML = `<span style="color:red;">Error: ${err.message}</span>`;
    } finally {
        isStreaming = false;
        sendBtn.disabled = false;
        currentAiBubble = null;
    }
}

// Add message to chat
function addMessage(text, role) {
    const div = document.createElement('div');
    div.className = `message ${role === 'user' ? 'user-message' : 'ai-message'}`;
    if (role === 'user') {
        div.innerHTML = `<div class="bubble">${escapeHtml(text)}</div>`;
    } else {
        div.innerHTML = `<div class="bubble">${marked.parse(text)}</div>`;
        addCopyButtons();
    }
    chatBox.appendChild(div);
    scrollToBottom();
}

// Escape HTML for user messages
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Auto-scroll to bottom
function scrollToBottom() {
    chatBox.scrollTop = chatBox.scrollHeight;
}

// Add copy buttons to code blocks
function addCopyButtons() {
    document.querySelectorAll('.bubble pre code').forEach((codeBlock) => {
        const pre = codeBlock.parentElement;
        // Avoid duplicate buttons
        if (pre.querySelector('.copy-btn')) return;
        const btn = document.createElement('button');
        btn.className = 'copy-btn';
        btn.textContent = 'Copy';
        btn.addEventListener('click', () => {
            navigator.clipboard.writeText(codeBlock.textContent).then(() => {
                btn.textContent = 'Copied!';
                setTimeout(() => btn.textContent = 'Copy', 2000);
            }).catch(() => {
                btn.textContent = 'Failed';
            });
        });
        pre.style.position = 'relative';
        pre.appendChild(btn);
    });
}

// Event listeners
sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

clearBtn.addEventListener('click', () => {
    chatBox.innerHTML = '';
    // Optionally reset session history? We'll keep history but clear UI
    // To also clear server history, we would need to send a delete request
    // For simplicity, we just clear UI.
});

// Auto-resize textarea
messageInput.addEventListener('input', () => {
    messageInput.style.height = 'auto';
    messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
});

// Initial scroll
scrollToBottom();
