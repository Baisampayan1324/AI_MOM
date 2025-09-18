// Background script for Meeting Transcription Extension
console.log('🚀 Meeting Transcription Extension Background Script Loaded');

class MeetingTranscriptionBackground {
    constructor() {
        this.activeSessions = new Map();
        this.init();
    }
    
    init() {
        // Setup message listeners
        this.setupMessageListeners();
        
        // Setup browser action
        this.setupBrowserAction();
        
        // Setup tab update listeners
        this.setupTabListeners();
        
        console.log('✅ Background script initialized');
    }
    
    setupMessageListeners() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            console.log('📨 Background received message:', message);
            
            switch (message.action) {
                case 'START_SCREEN_CAPTURE':
                    this.handleStartScreenCapture(message, sender, sendResponse);
                    return true; // Keep message channel open for async response
                    
                case 'STOP_SCREEN_CAPTURE':
                    this.handleStopScreenCapture(message, sender, sendResponse);
                    return true;
                    
                case 'GET_CAPTURE_STATUS':
                    this.handleGetCaptureStatus(message, sender, sendResponse);
                    break;
                    
                case 'UPDATE_BADGE':
                    this.updateBadge(message.status, sender.tab.id);
                    sendResponse({ success: true });
                    break;
                    
                case 'TEST_BACKEND_CONNECTION':
                    this.handleTestBackendConnection(message, sender, sendResponse);
                    return true;
                    
                case 'START_MEETING_SESSION':
                    this.handleStartMeetingSession(message, sender, sendResponse);
                    return true;
                    
                case 'END_MEETING_SESSION':
                    this.handleEndMeetingSession(message, sender, sendResponse);
                    return true;
                    
                case 'PROCESS_AUDIO_CHUNK':
                    this.handleProcessAudioChunk(message, sender, sendResponse);
                    return true;
                    
                default:
                    console.log('❓ Unknown message action:', message.action);
                    sendResponse({ success: false, error: 'Unknown action' });
            }
        });
    }
    
    async handleStartScreenCapture(message, sender, sendResponse) {
        try {
            // Get the current active tab if sender doesn't have tab info (popup case)
            let tabId;
            if (sender.tab && sender.tab.id) {
                tabId = sender.tab.id;
            } else {
                // Message from popup - get active tab
                const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
                if (tabs.length === 0) {
                    throw new Error('No active tab found');
                }
                tabId = tabs[0].id;
            }
            
            console.log('🎬 Starting screen capture for tab:', tabId);
            
            const settings = message.settings || {};
            
            // Store session info
            this.activeSessions.set(tabId, {
                platform: settings.platform || 'unknown',
                meetingTitle: settings.meetingTitle || 'Meeting',
                participants: settings.participants || [],
                startTime: Date.now(),
                status: 'starting'
            });
            
            // Ensure content script is injected before sending message
            await this.ensureContentScriptInjected(tabId);
            
            // Send message to content script to start screen capture
            chrome.tabs.sendMessage(tabId, {
                action: 'START_SCREEN_CAPTURE',
                settings: {
                    ...settings,
                    language: await this.getSetting('language', 'auto'),
                    showOverlay: await this.getSetting('showOverlay', true),
                    autoSummary: await this.getSetting('autoSummary', true)
                }
            }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('❌ Error sending message to content script:', chrome.runtime.lastError);
                    this.activeSessions.delete(tabId);
                    sendResponse({ success: false, error: chrome.runtime.lastError.message });
                } else if (response && response.success) {
                    console.log('✅ Screen capture started successfully');
                    this.activeSessions.get(tabId).status = 'active';
                    this.updateBadge('🎤', tabId);
                    sendResponse({ success: true });
                } else {
                    console.error('❌ Content script failed to start screen capture:', response?.error);
                    this.activeSessions.delete(tabId);
                    sendResponse({ success: false, error: response?.error || 'Unknown error' });
                }
            });
            
        } catch (error) {
            console.error('❌ Background script error starting screen capture:', error);
            sendResponse({ success: false, error: error.message });
        }
    }
    
    async handleStopScreenCapture(message, sender, sendResponse) {
        try {
            // Get the current active tab if sender doesn't have tab info (popup case)
            let tabId;
            if (sender.tab && sender.tab.id) {
                tabId = sender.tab.id;
            } else {
                // Message from popup - get active tab
                const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
                if (tabs.length === 0) {
                    throw new Error('No active tab found');
                }
                tabId = tabs[0].id;
            }
            
            console.log('⏹️ Stopping screen capture for tab:', tabId);
            
            // Ensure content script is available
            await this.ensureContentScriptInjected(tabId);
            
            // Send message to content script to stop screen capture
            chrome.tabs.sendMessage(tabId, {
                action: 'STOP_SCREEN_CAPTURE'
            }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('❌ Error stopping screen capture:', chrome.runtime.lastError);
                    sendResponse({ success: false, error: chrome.runtime.lastError.message });
                } else {
                    console.log('✅ Screen capture stopped successfully');
                }
                
                // Clean up session
                this.activeSessions.delete(tabId);
                this.updateBadge('', tabId);
                
                sendResponse({ success: true });
            });
            
        } catch (error) {
            console.error('❌ Background script error stopping screen capture:', error);
            sendResponse({ success: false, error: error.message });
        }
    }
    
    handleGetCaptureStatus(message, sender, sendResponse) {
        const tabId = sender.tab.id;
        const session = this.activeSessions.get(tabId);
        
        sendResponse({
            isActive: !!session,
            session: session || null
        });
    }
    
    setupBrowserAction() {
        // Handle extension icon click
        chrome.action.onClicked.addListener((tab) => {
            console.log('🖱️ Extension icon clicked for tab:', tab.id);
            
            // Check if this is a supported platform
            const supportedUrls = [
                'meet.google.com',
                'zoom.us',
                'youtube.com'
            ];
            
            const isSupported = supportedUrls.some(url => tab.url.includes(url));
            
            if (isSupported) {
                // Open popup or send message to content script
                chrome.tabs.sendMessage(tab.id, { action: 'TOGGLE_OVERLAY' });
            } else {
                // Show notification for unsupported site
                this.showNotification('Unsupported Site', 'This extension only works on Google Meet, Zoom, and YouTube.');
            }
        });
    }
    
    setupTabListeners() {
        // Handle tab updates
        chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
            if (changeInfo.status === 'complete' && this.activeSessions.has(tabId)) {
                // Check if we're still on a supported platform
                const supportedUrls = [
                    'meet.google.com',
                    'zoom.us', 
                    'youtube.com'
                ];
                
                const isSupported = supportedUrls.some(url => tab.url.includes(url));
                
                if (!isSupported) {
                    console.log('📱 Tab navigated away from supported platform, stopping session');
                    this.handleStopScreenCapture({}, { tab }, () => {});
                }
            }
        });
        
        // Handle tab removal
        chrome.tabs.onRemoved.addListener((tabId) => {
            if (this.activeSessions.has(tabId)) {
                console.log('📱 Tab closed, cleaning up session');
                this.activeSessions.delete(tabId);
            }
        });
    }
    
    updateBadge(text, tabId) {
        try {
            chrome.action.setBadgeText({
                text: text,
                tabId: tabId
            });
            
            if (text) {
                chrome.action.setBadgeBackgroundColor({
                    color: '#4CAF50',
                    tabId: tabId
                });
            }
        } catch (error) {
            console.error('❌ Error updating badge:', error);
        }
    }
    
    async getSetting(key, defaultValue) {
        try {
            const result = await chrome.storage.sync.get({ [key]: defaultValue });
            return result[key];
        } catch (error) {
            console.error('❌ Error getting setting:', error);
            return defaultValue;
        }
    }
    
    async handleTestBackendConnection(message, sender, sendResponse) {
        try {
            const response = await fetch(`${message.backendUrl}/health`);
            if (response.ok) {
                sendResponse({ success: true });
            } else {
                sendResponse({ success: false, error: `Backend health check failed: ${response.status}` });
            }
        } catch (error) {
            console.error('❌ Backend connection test failed:', error);
            sendResponse({ success: false, error: error.message });
        }
    }
    
    async handleStartMeetingSession(message, sender, sendResponse) {
        try {
            const formData = new FormData();
            formData.append('meeting_id', message.meetingId);
            formData.append('participants', JSON.stringify(message.participants));
            
            const response = await fetch(`${message.backendUrl}/api/start-meeting-session`, {
                method: 'POST',
                body: formData
            });
            
            if (response.ok) {
                sendResponse({ success: true });
            } else {
                sendResponse({ success: false, error: `Failed to start meeting session: ${response.status}` });
            }
        } catch (error) {
            console.error('❌ Start meeting session failed:', error);
            sendResponse({ success: false, error: error.message });
        }
    }
    
    async handleEndMeetingSession(message, sender, sendResponse) {
        try {
            const formData = new FormData();
            formData.append('meeting_id', message.meetingId);
            
            const response = await fetch(`${message.backendUrl}/api/end-meeting-session`, {
                method: 'POST',
                body: formData
            });
            
            if (response.ok) {
                sendResponse({ success: true });
            } else {
                sendResponse({ success: false, error: `Failed to end meeting session: ${response.status}` });
            }
        } catch (error) {
            console.error('❌ End meeting session failed:', error);
            sendResponse({ success: false, error: error.message });
        }
    }
    
    async ensureContentScriptInjected(tabId) {
        try {
            // First, try to ping the content script to see if it's already loaded
            return new Promise((resolve, reject) => {
                chrome.tabs.sendMessage(tabId, { action: 'PING' }, (response) => {
                    if (chrome.runtime.lastError) {
                        // Content script not loaded, inject it
                        console.log('📤 Content script not found, injecting...');
                        chrome.scripting.executeScript({
                            target: { tabId: tabId },
                            files: ['content/screen-capture.js']
                        }, () => {
                            if (chrome.runtime.lastError) {
                                console.error('❌ Failed to inject content script:', chrome.runtime.lastError);
                                reject(new Error('Failed to inject content script'));
                            } else {
                                console.log('✅ Content script injected successfully');
                                // Also inject CSS
                                chrome.scripting.insertCSS({
                                    target: { tabId: tabId },
                                    files: ['overlay/overlay.css']
                                }, () => {
                                    if (chrome.runtime.lastError) {
                                        console.warn('⚠️ Failed to inject CSS, but proceeding:', chrome.runtime.lastError);
                                    }
                                    // Wait a bit for the script to initialize
                                    setTimeout(() => resolve(), 500);
                                });
                            }
                        });
                    } else {
                        console.log('✅ Content script already loaded');
                        resolve();
                    }
                });
            });
        } catch (error) {
            console.error('❌ Error ensuring content script injection:', error);
            throw error;
        }
    }

    async handleProcessAudioChunk(message, sender, sendResponse) {
        try {
            console.log('📥 Processing audio chunk in background:', {
                meetingId: message.meetingId,
                dataLength: message.audioData ? message.audioData.length : 0
            });
            
            // Convert base64 back to blob
            const binaryString = atob(message.audioData);
            console.log('🔄 Converted base64 to binary string, length:', binaryString.length);
            
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            console.log('🔄 Converted binary string to Uint8Array, length:', bytes.length);
            
            const blob = new Blob([bytes], { type: 'audio/pcm' });
            console.log('🔄 Created blob with size:', blob.size);
            
            const formData = new FormData();
            formData.append('chunk', blob, 'audio_chunk.pcm');
            formData.append('meeting_id', message.meetingId);
            if (message.language) {
                formData.append('language', message.language);
            }
            
            console.log('📤 Sending request to backend:', {
                url: `${message.backendUrl}/api/process-audio-chunk`,
                meetingId: message.meetingId
            });
            
            const response = await fetch(`${message.backendUrl}/api/process-audio-chunk`, {
                method: 'POST',
                body: formData
            });
            
            console.log('📥 Received response from backend:', {
                status: response.status,
                ok: response.ok
            });
            
            if (response.ok) {
                sendResponse({ success: true });
            } else {
                const errorText = await response.text();
                console.error('❌ Backend error response:', errorText);
                sendResponse({ success: false, error: `Failed to process audio chunk: ${response.status} - ${errorText}` });
            }
        } catch (error) {
            console.error('❌ Process audio chunk failed:', error);
            sendResponse({ success: false, error: error.message });
        }
    }

    async getSetting(key, defaultValue) {
        try {
            const result = await chrome.storage.sync.get({ [key]: defaultValue });
            return result[key];
        } catch (error) {
            console.error('❌ Error getting setting:', error);
            return defaultValue;
        }
    }
    
    async setSetting(key, value) {
        try {
            await chrome.storage.sync.set({ [key]: value });
            return true;
        } catch (error) {
            console.error('❌ Error setting setting:', error);
            return false;
        }
    }
    
    showNotification(title, message) {
        try {
            chrome.notifications.create({
                type: 'basic',
                iconUrl: 'assets/icons/icon48.png',
                title: title,
                message: message
            });
        } catch (error) {
            console.error('❌ Error showing notification:', error);
        }
    }
}

// Initialize the background script
const meetingTranscriptionBackground = new MeetingTranscriptionBackground();