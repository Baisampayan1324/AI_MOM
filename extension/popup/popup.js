// Popup JavaScript for AI Meeting Transcription Extension

class PopupController {
    constructor() {
        this.backendUrl = 'http://localhost:8000';
        this.isCapturing = false;
        this.captureStartTime = null;
        this.wordCount = 0;
        this.connectionStatus = 'offline';
        
        this.init();
    }
    
    async init() {
        console.log('🚀 Popup controller initializing...');
        
        // Load saved settings
        await this.loadSettings();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Test backend connection
        await this.testConnection();
        
        // Check current tab platform
        await this.checkCurrentPlatform();
        
        // Enable capture button if connected
        this.updateUI();
        
        console.log('✅ Popup controller initialized');
    }
    
    async loadSettings() {
        try {
            const result = await chrome.storage.sync.get({
                backendUrl: 'http://localhost:8000',
                language: 'auto',
                showOverlay: true,
                autoSummary: true
            });
            
            this.backendUrl = result.backendUrl;
            
            // Update UI with saved settings
            document.getElementById('backend-url').value = result.backendUrl;
            document.getElementById('language-select').value = result.language;
            document.getElementById('show-overlay').checked = result.showOverlay;
            document.getElementById('auto-summary').checked = result.autoSummary;
            
        } catch (error) {
            console.error('❌ Failed to load settings:', error);
        }
    }
    
    async saveSettings() {
        try {
            const settings = {
                backendUrl: document.getElementById('backend-url').value,
                language: document.getElementById('language-select').value,
                showOverlay: document.getElementById('show-overlay').checked,
                autoSummary: document.getElementById('auto-summary').checked
            };
            
            await chrome.storage.sync.set(settings);
            this.backendUrl = settings.backendUrl;
            
            console.log('💾 Settings saved:', settings);
        } catch (error) {
            console.error('❌ Failed to save settings:', error);
        }
    }
    
    setupEventListeners() {
        // Screen capture buttons
        document.getElementById('start-screen-capture').addEventListener('click', () => {
            this.startScreenCapture();
        });
        
        document.getElementById('stop-screen-capture').addEventListener('click', () => {
            this.stopScreenCapture();
        });
        
        // Settings changes
        document.getElementById('backend-url').addEventListener('change', () => {
            this.saveSettings();
        });
        
        document.getElementById('language-select').addEventListener('change', () => {
            this.saveSettings();
        });
        
        document.getElementById('show-overlay').addEventListener('change', () => {
            this.saveSettings();
        });
        
        document.getElementById('auto-summary').addEventListener('change', () => {
            this.saveSettings();
        });
        
        // Action buttons
        document.getElementById('test-connection').addEventListener('click', () => {
            this.testConnection();
        });
        
        document.getElementById('export-transcript').addEventListener('click', () => {
            this.exportTranscript();
        });
        
        document.getElementById('clear-data').addEventListener('click', () => {
            this.clearData();
        });
    }
    
    async startScreenCapture() {
        try {
            console.log('🎬 Starting screen capture...');
            
            // Update UI immediately
            this.updateCaptureStatus('Starting...');
            
            // Get current tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            // Detect platform for enhanced features (optional)
            const supportedPlatforms = [
                { name: 'google-meet', urls: ['meet.google.com'] },
                { name: 'zoom', urls: ['zoom.us'] },
                { name: 'youtube', urls: ['youtube.com'] }
            ];
            
            const platform = supportedPlatforms.find(p => 
                p.urls.some(url => tab.url.includes(url))
            );
            
            // Use detected platform or default to 'universal'
            const platformName = platform ? platform.name : 'universal';
            
            console.log(`🌐 Screen capture available on ${tab.url} (platform: ${platformName})`);
            
            // Send message to background script to coordinate screen capture
            console.log('📤 Sending START_SCREEN_CAPTURE message...');
            const response = await chrome.runtime.sendMessage({
                action: 'START_SCREEN_CAPTURE',
                settings: {
                    platform: platformName,
                    backendUrl: this.backendUrl,
                    language: document.getElementById('language-select').value,
                    showOverlay: document.getElementById('show-overlay').checked,
                    autoSummary: document.getElementById('auto-summary').checked
                }
            });
            
            console.log('📥 Received response:', response);
            
            if (response && response.success) {
                this.isCapturing = true;
                this.captureStartTime = Date.now();
                this.wordCount = 0;
                
                // Update UI
                document.getElementById('start-screen-capture').style.display = 'none';
                document.getElementById('stop-screen-capture').style.display = 'flex';
                document.getElementById('capture-info').style.display = 'block';
                document.getElementById('export-transcript').disabled = false;
                
                this.updateCaptureStatus('Recording...');
                
                // Start duration timer
                this.startDurationTimer();
                
                console.log('✅ Screen capture started successfully');
            } else {
                throw new Error(response?.error || 'Failed to start screen capture - no response received');
            }
            
        } catch (error) {
            console.error('❌ Screen capture failed:', error);
            this.updateCaptureStatus('Failed');
            
            // Provide specific error messages for common issues
            let errorMessage = error.message;
            if (error.message.includes('Could not establish connection')) {
                errorMessage = 'Connection failed - please refresh the page and try again';
            } else if (error.message.includes('Receiving end does not exist')) {
                errorMessage = 'Content script not loaded - please refresh the page';
            }
            
            this.showError('Screen capture failed: ' + errorMessage);
        }
    }
    
    async stopScreenCapture() {
        try {
            console.log('⏹️ Stopping screen capture...');
            
            // Send message to background script to stop capture
            const response = await chrome.runtime.sendMessage({
                action: 'STOP_SCREEN_CAPTURE'
            });
            
            this.isCapturing = false;
            this.captureStartTime = null;
            
            // Update UI
            document.getElementById('start-screen-capture').style.display = 'flex';
            document.getElementById('stop-screen-capture').style.display = 'none';
            document.getElementById('capture-info').style.display = 'none';
            
            this.updateCaptureStatus('Stopped');
            
            console.log('✅ Screen capture stopped');
            
        } catch (error) {
            console.error('❌ Failed to stop screen capture:', error);
        }
    }
    
    startDurationTimer() {
        if (this.durationTimer) {
            clearInterval(this.durationTimer);
        }
        
        this.durationTimer = setInterval(() => {
            if (this.isCapturing && this.captureStartTime) {
                const elapsed = Date.now() - this.captureStartTime;
                const minutes = Math.floor(elapsed / 60000);
                const seconds = Math.floor((elapsed % 60000) / 1000);
                
                document.getElementById('capture-duration').textContent = 
                    `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            }
        }, 1000);
    }
    
    async testConnection() {
        try {
            this.updateConnectionStatus('connecting');
            
            const response = await fetch(`${this.backendUrl}/health`, {
                method: 'GET',
                timeout: 5000
            });
            
            if (response.ok) {
                const data = await response.json();
                this.updateConnectionStatus('online');
                this.updatePerformanceInfo('Backend connected');
                console.log('✅ Backend connection successful:', data);
            } else {
                throw new Error(`HTTP ${response.status}`);
            }
            
        } catch (error) {
            console.error('❌ Backend connection failed:', error);
            this.updateConnectionStatus('offline');
            this.updatePerformanceInfo('Connection failed');
        }
        
        this.updateUI();
    }
    
    async checkCurrentPlatform() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            const url = tab.url;
            
            // Reset all platform statuses
            document.getElementById('meet-status').textContent = 'Not detected';
            document.getElementById('zoom-status').textContent = 'Not detected';
            document.getElementById('youtube-status').textContent = 'Not detected';
            
            // Check platform
            if (url.includes('meet.google.com')) {
                document.getElementById('meet-status').textContent = 'Detected';
                document.getElementById('meet-status').style.color = '#4CAF50';
            } else if (url.includes('zoom.us')) {
                document.getElementById('zoom-status').textContent = 'Detected';
                document.getElementById('zoom-status').style.color = '#4CAF50';
            } else if (url.includes('youtube.com')) {
                document.getElementById('youtube-status').textContent = 'Detected';
                document.getElementById('youtube-status').style.color = '#4CAF50';
            }
            
            // Add universal screen capture availability message
            const currentSiteElement = document.getElementById('current-site-status');
            if (currentSiteElement) {
                const hostname = new URL(url).hostname;
                currentSiteElement.textContent = `Screen capture available on ${hostname}`;
                currentSiteElement.style.color = '#4CAF50';
            }
            
        } catch (error) {
            console.error('❌ Failed to check platform:', error);
        }
    }
    
    updateConnectionStatus(status) {
        this.connectionStatus = status;
        const statusDot = document.getElementById('connection-status');
        const statusText = document.getElementById('status-text');
        
        statusDot.className = `status-dot ${status}`;
        
        switch (status) {
            case 'online':
                statusText.textContent = 'Connected';
                break;
            case 'connecting':
                statusText.textContent = 'Connecting...';
                break;
            case 'offline':
            default:
                statusText.textContent = 'Offline';
                break;
        }
    }
    
    updateCaptureStatus(status) {
        document.getElementById('capture-status').textContent = status;
    }
    
    updatePerformanceInfo(info) {
        document.getElementById('performance-info').textContent = info;
    }
    
    updateWordCount(count) {
        this.wordCount = count;
        document.getElementById('word-count').textContent = count.toString();
    }
    
    updateUI() {
        const captureButton = document.getElementById('start-screen-capture');
        captureButton.disabled = this.connectionStatus !== 'online';
    }
    
    async exportTranscript() {
        try {
            // Get current tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            // Request transcript from content script
            const response = await chrome.tabs.sendMessage(tab.id, {
                action: 'GET_TRANSCRIPT'
            });
            
            if (response && response.transcript) {
                this.downloadTranscript(response.transcript, response.summary);
            } else {
                this.showError('No transcript available to export');
            }
            
        } catch (error) {
            console.error('❌ Export failed:', error);
            this.showError('Failed to export transcript: ' + error.message);
        }
    }
    
    downloadTranscript(transcript, summary) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `meeting-transcript-${timestamp}.txt`;
        
        let content = `AI Meeting Transcript\n`;
        content += `Generated: ${new Date().toLocaleString()}\n`;
        content += `Duration: ${document.getElementById('capture-duration').textContent}\n`;
        content += `Words: ${this.wordCount}\n\n`;
        content += `=== TRANSCRIPT ===\n${transcript}\n\n`;
        
        if (summary) {
            content += `=== SUMMARY ===\n${JSON.stringify(summary, null, 2)}\n`;
        }
        
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        
        chrome.downloads.download({
            url: url,
            filename: filename,
            saveAs: true
        });
    }
    
    async clearData() {
        try {
            // Clear storage
            await chrome.storage.local.clear();
            
            // Reset counters
            this.wordCount = 0;
            this.updateWordCount(0);
            
            // Reset UI
            document.getElementById('capture-duration').textContent = '00:00';
            document.getElementById('capture-status').textContent = 'Ready';
            
            this.updatePerformanceInfo('Data cleared');
            
            console.log('🗑️ Data cleared successfully');
            
        } catch (error) {
            console.error('❌ Failed to clear data:', error);
        }
    }
    
    showError(message) {
        // Create temporary error message
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            position: fixed;
            top: 10px;
            left: 50%;
            transform: translateX(-50%);
            background: #f44336;
            color: white;
            padding: 8px 16px;
            border-radius: 4px;
            font-size: 12px;
            z-index: 1000;
            max-width: 300px;
        `;
        errorDiv.textContent = message;
        
        document.body.appendChild(errorDiv);
        
        // Remove after 3 seconds
        setTimeout(() => {
            if (errorDiv.parentNode) {
                errorDiv.parentNode.removeChild(errorDiv);
            }
        }, 3000);
    }
}

// Message listener for updates from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'TRANSCRIPT_UPDATE') {
        // Update word count
        if (window.popupController) {
            window.popupController.updateWordCount(message.wordCount || 0);
        }
    } else if (message.type === 'CAPTURE_STATUS') {
        // Update capture status
        if (window.popupController) {
            window.popupController.updateCaptureStatus(message.status);
        }
    }
});

// Initialize popup when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.popupController = new PopupController();
});

// Cleanup on unload
window.addEventListener('beforeunload', () => {
    if (window.popupController && window.popupController.durationTimer) {
        clearInterval(window.popupController.durationTimer);
    }
});