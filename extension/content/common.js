// Common utilities and shared functionality for all content scripts
class MeetingTranscriptionBase {
    constructor(platform) {
        this.platform = platform;
        this.isActive = false;
        this.websocket = null;
        this.meetingId = this.generateMeetingId();
        this.mediaRecorder = null;
        this.audioContext = null;
        this.stream = null;
        this.backendUrl = 'ws://localhost:8000';
        this.overlayCreated = false;
        
        // Initialize after page load
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }
    
    async init() {
        // Check if screen capture is available and defer to it
        if (window.screenCaptureAvailable) {
            console.log(`📺 Screen capture available, deferring legacy transcription for ${this.platform}`);
            return;
        }
        
        console.log(`🚀 Meeting Transcription initialized for ${this.platform}`);
        await this.createOverlay();
        this.setupEventListeners();
        this.checkForMeetingStart();
        
        // Listen for messages from background script
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleMessage(message, sender, sendResponse);
        });
    }
    
    generateMeetingId() {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        return `${this.platform}_${timestamp}_${random}`;
    }
    
    async createOverlay() {
        if (this.overlayCreated) return;
        
        // Create overlay container
        const overlay = document.createElement('div');
        overlay.id = 'transcription-overlay';
        overlay.className = 'transcription-overlay';
        overlay.innerHTML = `
            <div class="transcription-header">
                <div class="transcription-title">
                    <span class="transcription-icon">🎤</span>
                    <span>AI Transcription</span>
                </div>
                <div class="transcription-controls">
                    <button id="transcription-toggle" class="control-btn" title="Start/Stop Transcription">
                        <span class="control-icon">▶️</span>
                    </button>
                    <button id="transcription-settings" class="control-btn" title="Settings">
                        <span class="control-icon">⚙️</span>
                    </button>
                    <button id="transcription-minimize" class="control-btn" title="Minimize">
                        <span class="control-icon">➖</span>
                    </button>
                    <button id="transcription-close" class="control-btn" title="Close">
                        <span class="control-icon">❌</span>
                    </button>
                </div>
            </div>
            <div class="transcription-content">
                <div class="transcription-status">
                    <span id="status-indicator" class="status-indicator inactive">●</span>
                    <span id="status-text">Ready to start</span>
                </div>
                <div class="transcription-text-container">
                    <div id="transcription-text" class="transcription-text"></div>
                </div>
                <div class="transcription-summary">
                    <div class="summary-header">
                        <span>📋 Key Points</span>
                        <button id="summary-toggle" class="summary-toggle">▼</button>
                    </div>
                    <div id="summary-content" class="summary-content">
                        <div id="key-points" class="key-points"></div>
                        <div id="action-items" class="action-items"></div>
                    </div>
                </div>
            </div>
            <div class="transcription-resize-handle"></div>
        `;
        
        // Make overlay draggable and resizable
        this.makeDraggable(overlay);
        this.makeResizable(overlay);
        
        // Add to page
        document.body.appendChild(overlay);
        this.overlayCreated = true;
        
        // Setup overlay event listeners
        this.setupOverlayControls();
        
        console.log('📱 Transcription overlay created');
    }
    
    setupOverlayControls() {
        // Toggle transcription
        document.getElementById('transcription-toggle').addEventListener('click', () => {
            this.toggleTranscription();
        });
        
        // Settings
        document.getElementById('transcription-settings').addEventListener('click', () => {
            this.openSettings();
        });
        
        // Minimize
        document.getElementById('transcription-minimize').addEventListener('click', () => {
            this.minimizeOverlay();
        });
        
        // Close
        document.getElementById('transcription-close').addEventListener('click', () => {
            this.closeOverlay();
        });
        
        // Summary toggle
        document.getElementById('summary-toggle').addEventListener('click', () => {
            this.toggleSummary();
        });
    }
    
    makeDraggable(element) {
        let isDragging = false;
        let currentX;
        let currentY;
        let initialX;
        let initialY;
        
        const header = element.querySelector('.transcription-header');
        
        header.addEventListener('mousedown', (e) => {
            if (e.target.closest('.transcription-controls')) return;
            
            isDragging = true;
            initialX = e.clientX - element.offsetLeft;
            initialY = e.clientY - element.offsetTop;
            
            document.addEventListener('mousemove', drag);
            document.addEventListener('mouseup', stopDrag);
        });
        
        function drag(e) {
            if (!isDragging) return;
            
            currentX = e.clientX - initialX;
            currentY = e.clientY - initialY;
            
            element.style.left = currentX + 'px';
            element.style.top = currentY + 'px';
        }
        
        function stopDrag() {
            isDragging = false;
            document.removeEventListener('mousemove', drag);
            document.removeEventListener('mouseup', stopDrag);
        }
    }
    
    makeResizable(element) {
        const resizeHandle = element.querySelector('.transcription-resize-handle');
        let isResizing = false;
        
        resizeHandle.addEventListener('mousedown', (e) => {
            isResizing = true;
            document.addEventListener('mousemove', resize);
            document.addEventListener('mouseup', stopResize);
        });
        
        function resize(e) {
            if (!isResizing) return;
            
            const rect = element.getBoundingClientRect();
            const width = e.clientX - rect.left;
            const height = e.clientY - rect.top;
            
            element.style.width = Math.max(300, width) + 'px';
            element.style.height = Math.max(200, height) + 'px';
        }
        
        function stopResize() {
            isResizing = false;
            document.removeEventListener('mousemove', resize);
            document.removeEventListener('mouseup', stopResize);
        }
    }
    
    async toggleTranscription() {
        if (this.isActive) {
            await this.stopTranscription();
        } else {
            await this.startTranscription();
        }
    }
    
    async startTranscription() {
        try {
            console.log('🎙️ Starting transcription...');
            
            // Update UI
            this.updateStatus('connecting', 'Connecting to backend...');
            
            // Connect to backend WebSocket
            await this.connectWebSocket();
            
            // Start audio capture
            await this.startAudioCapture();
            
            // Start session in backend
            await this.startMeetingSession();
            
            this.isActive = true;
            this.updateUI(true);
            this.updateStatus('active', 'Recording and transcribing...');
            
            console.log('✅ Transcription started successfully');
            
        } catch (error) {
            console.error('❌ Failed to start transcription:', error);
            this.updateStatus('error', 'Failed to start transcription');
            this.showNotification('Failed to start transcription: ' + error.message, 'error');
        }
    }
    
    async stopTranscription() {
        try {
            console.log('🛑 Stopping transcription...');
            
            this.isActive = false;
            
            // Stop audio capture
            if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
                this.mediaRecorder.stop();
            }
            
            if (this.stream) {
                this.stream.getTracks().forEach(track => track.stop());
            }
            
            // End session in backend
            await this.endMeetingSession();
            
            // Close WebSocket
            if (this.websocket) {
                this.websocket.close();
            }
            
            this.updateUI(false);
            this.updateStatus('inactive', 'Transcription stopped');
            
            console.log('✅ Transcription stopped successfully');
            
        } catch (error) {
            console.error('❌ Failed to stop transcription:', error);
            this.updateStatus('error', 'Failed to stop transcription');
        }
    }
    
    async connectWebSocket() {
        return new Promise((resolve, reject) => {
            const wsUrl = `${this.backendUrl}/ws/meeting/${this.meetingId}`;
            this.websocket = new WebSocket(wsUrl);
            
            this.websocket.onopen = () => {
                console.log('🔗 WebSocket connected');
                resolve();
            };
            
            this.websocket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.handleWebSocketMessage(data);
                } catch (error) {
                    console.error('❌ Failed to parse WebSocket message:', error);
                }
            };
            
            this.websocket.onerror = (error) => {
                console.error('❌ WebSocket error:', error);
                reject(error);
            };
            
            this.websocket.onclose = () => {
                console.log('🔗 WebSocket disconnected');
                if (this.isActive) {
                    this.updateStatus('error', 'Connection lost');
                }
            };
        });
    }
    
    handleWebSocketMessage(data) {
        switch (data.type) {
            case 'transcription':
                this.displayTranscription(data.text, data.timestamp);
                break;
            case 'summary':
                this.displaySummary(data.data);
                break;
            case 'progress':
                this.updateStatus('processing', data.message);
                break;
            case 'error':
                this.updateStatus('error', data.message);
                break;
        }
    }
    
    async startAudioCapture() {
        try {
            // For different platforms, we might need different audio capture methods
            const constraints = await this.getAudioConstraints();
            
            this.stream = await navigator.mediaDevices.getUserMedia(constraints);
            
            // Setup MediaRecorder for chunk-based processing
            this.mediaRecorder = new MediaRecorder(this.stream, {
                mimeType: 'audio/webm',
                audioBitsPerSecond: 128000
            });
            
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0 && this.isActive) {
                    this.sendAudioChunk(event.data);
                }
            };
            
            // Start recording with 2-second chunks
            this.mediaRecorder.start(2000);
            
            console.log('🎙️ Audio capture started');
            
        } catch (error) {
            throw new Error('Failed to access microphone: ' + error.message);
        }
    }
    
    async getAudioConstraints() {
        // Platform-specific audio constraints
        // This can be overridden by platform-specific implementations
        return {
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                sampleRate: 16000
            }
        };
    }
    
    async sendAudioChunk(audioBlob) {
        try {
            const formData = new FormData();
            formData.append('chunk', audioBlob, 'audio_chunk.webm');
            formData.append('meeting_id', this.meetingId);
            formData.append('language', 'en'); // Can be configurable
            
            const response = await fetch('http://localhost:8000/api/process-audio-chunk', {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
        } catch (error) {
            console.error('❌ Failed to send audio chunk:', error);
        }
    }
    
    async startMeetingSession() {
        try {
            const formData = new FormData();
            formData.append('meeting_id', this.meetingId);
            formData.append('participants', JSON.stringify([{
                platform: this.platform,
                url: window.location.href
            }]));
            
            const response = await fetch('http://localhost:8000/api/start-meeting-session', {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
                throw new Error(`Failed to start session: ${response.status}`);
            }
            
            console.log('📋 Meeting session started in backend');
            
        } catch (error) {
            console.error('❌ Failed to start meeting session:', error);
        }
    }
    
    async endMeetingSession() {
        try {
            const formData = new FormData();
            formData.append('meeting_id', this.meetingId);
            
            const response = await fetch('http://localhost:8000/api/end-meeting-session', {
                method: 'POST',
                body: formData
            });
            
            if (response.ok) {
                console.log('📋 Meeting session ended in backend');
            }
            
        } catch (error) {
            console.error('❌ Failed to end meeting session:', error);
        }
    }
    
    displayTranscription(text, timestamp) {
        const transcriptionText = document.getElementById('transcription-text');
        if (!transcriptionText) return;
        
        const entry = document.createElement('div');
        entry.className = 'transcription-entry';
        
        const time = new Date(timestamp * 1000).toLocaleTimeString();
        entry.innerHTML = `
            <span class="transcription-time">[${time}]</span>
            <span class="transcription-content">${text}</span>
        `;
        
        transcriptionText.appendChild(entry);
        transcriptionText.scrollTop = transcriptionText.scrollHeight;
    }
    
    displaySummary(summaryData) {
        // Display key points
        const keyPointsElement = document.getElementById('key-points');
        if (keyPointsElement && summaryData.key_points) {
            keyPointsElement.innerHTML = '<h4>🔑 Key Points:</h4>';
            summaryData.key_points.forEach((point, index) => {
                const pointElement = document.createElement('div');
                pointElement.className = 'key-point';
                pointElement.textContent = `${index + 1}. ${point}`;
                keyPointsElement.appendChild(pointElement);
            });
        }
        
        // Display action items
        const actionItemsElement = document.getElementById('action-items');
        if (actionItemsElement && summaryData.action_items) {
            actionItemsElement.innerHTML = '<h4>✅ Action Items:</h4>';
            summaryData.action_items.forEach((item, index) => {
                const itemElement = document.createElement('div');
                itemElement.className = 'action-item';
                itemElement.textContent = `${index + 1}. ${item}`;
                actionItemsElement.appendChild(itemElement);
            });
        }
    }
    
    updateStatus(status, message) {
        const statusIndicator = document.getElementById('status-indicator');
        const statusText = document.getElementById('status-text');
        
        if (statusIndicator && statusText) {
            statusIndicator.className = `status-indicator ${status}`;
            statusText.textContent = message;
        }
    }
    
    updateUI(isActive) {
        const toggleBtn = document.getElementById('transcription-toggle');
        if (toggleBtn) {
            const icon = toggleBtn.querySelector('.control-icon');
            icon.textContent = isActive ? '⏹️' : '▶️';
            toggleBtn.title = isActive ? 'Stop Transcription' : 'Start Transcription';
        }
    }
    
    minimizeOverlay() {
        const overlay = document.getElementById('transcription-overlay');
        if (overlay) {
            overlay.classList.toggle('minimized');
        }
    }
    
    closeOverlay() {
        if (this.isActive) {
            this.stopTranscription();
        }
        
        const overlay = document.getElementById('transcription-overlay');
        if (overlay) {
            overlay.remove();
            this.overlayCreated = false;
        }
    }
    
    toggleSummary() {
        const summaryContent = document.getElementById('summary-content');
        const toggleBtn = document.getElementById('summary-toggle');
        
        if (summaryContent && toggleBtn) {
            const isVisible = summaryContent.style.display !== 'none';
            summaryContent.style.display = isVisible ? 'none' : 'block';
            toggleBtn.textContent = isVisible ? '▶' : '▼';
        }
    }
    
    openSettings() {
        // Open extension popup or settings page
        chrome.runtime.sendMessage({action: 'openSettings'});
    }
    
    showNotification(message, type = 'info') {
        // Create and show notification
        const notification = document.createElement('div');
        notification.className = `transcription-notification ${type}`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 5000);
    }
    
    handleMessage(message, sender, sendResponse) {
        switch (message.action) {
            case 'startTranscription':
                this.startTranscription();
                break;
            case 'stopTranscription':
                this.stopTranscription();
                break;
            case 'getStatus':
                sendResponse({
                    isActive: this.isActive,
                    meetingId: this.meetingId,
                    platform: this.platform
                });
                break;
        }
    }
    
    setupEventListeners() {
        // Platform-specific event listeners should be implemented in subclasses
    }
    
    checkForMeetingStart() {
        // Platform-specific meeting detection should be implemented in subclasses
    }
}