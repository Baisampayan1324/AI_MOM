// Google Meet specific content script with Screen Capture Integration
class GoogleMeetTranscription extends MeetingTranscriptionBase {
    constructor() {
        super('google-meet');
        this.participantCount = 0;
        this.meetingTitle = '';
        this.isInMeeting = false;
        this.screenCaptureActive = false;
    }
    
    async init() {
        await super.init();
        console.log('🎯 Google Meet transcription with screen capture initialized');
        
        // Listen for screen capture messages
        this.setupScreenCaptureIntegration();
    }
    
    setupScreenCaptureIntegration() {
        // Listen for screen capture events
        window.addEventListener('message', (event) => {
            if (event.data.type === 'SCREEN_CAPTURE_STATUS') {
                this.handleScreenCaptureStatus(event.data);
            }
        });
        
        // Override the auto-start notification to include screen capture option
        this.originalShowAutoStartNotification = this.showAutoStartNotification;
        this.showAutoStartNotification = this.showEnhancedAutoStartNotification;
    }
    
    handleScreenCaptureStatus(data) {
        this.screenCaptureActive = data.active;
        
        if (data.active) {
            console.log('📺 Screen capture active for Google Meet');
            // Hide the regular overlay since screen capture has its own
            if (this.overlayElement) {
                this.overlayElement.style.display = 'none';
            }
            
            // Show enhanced notification when user starts screen capture
            // This is user-initiated, so it's appropriate to ask about transcription
            this.showEnhancedAutoStartNotification();
        } else {
            console.log('📺 Screen capture stopped for Google Meet');
            // Show the regular overlay again
            if (this.overlayElement) {
                this.overlayElement.style.display = 'block';
            }
        }
    }
    
    showEnhancedAutoStartNotification() {
        // Enhanced notification with screen capture option
        const notification = document.createElement('div');
        notification.className = 'auto-start-notification enhanced';
        notification.innerHTML = `
            <div class="notification-content">
                <div class="notification-header">
                    <span class="notification-icon">🎤</span>
                    <span class="notification-text">AI Meeting Transcription</span>
                </div>
                <div class="notification-body">
                    <p>Start transcription for this Google Meet session?</p>
                    <div class="transcription-options">
                        <button id="screen-capture-btn" class="notification-btn primary">
                            📺 Screen Capture (Recommended)
                        </button>
                        <button id="tab-audio-btn" class="notification-btn secondary">
                            🎵 Tab Audio Only
                        </button>
                    </div>
                    <div class="notification-actions">
                        <button id="auto-start-no" class="notification-btn cancel">Cancel</button>
                    </div>
                </div>
            </div>
        `;
        
        // Enhanced styling
        const style = document.createElement('style');
        style.textContent = `
            .auto-start-notification.enhanced {
                position: fixed;
                top: 20px;
                right: 20px;
                background: rgba(0, 0, 0, 0.95);
                backdrop-filter: blur(15px);
                color: white;
                border-radius: 12px;
                box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
                z-index: 10000;
                font-family: 'Segoe UI', system-ui, sans-serif;
                border: 1px solid rgba(255, 255, 255, 0.1);
                width: 350px;
                animation: slideIn 0.3s ease-out;
            }
            
            .auto-start-notification.enhanced .notification-header {
                padding: 16px 16px 8px 16px;
                display: flex;
                align-items: center;
                gap: 8px;
                font-weight: 600;
                font-size: 16px;
            }
            
            .auto-start-notification.enhanced .notification-body {
                padding: 0 16px 16px 16px;
            }
            
            .auto-start-notification.enhanced .notification-body p {
                margin: 0 0 16px 0;
                color: rgba(255, 255, 255, 0.8);
                font-size: 14px;
            }
            
            .auto-start-notification.enhanced .transcription-options {
                display: flex;
                flex-direction: column;
                gap: 8px;
                margin-bottom: 16px;
            }
            
            .auto-start-notification.enhanced .notification-btn {
                padding: 12px 16px;
                border: none;
                border-radius: 8px;
                cursor: pointer;
                font-size: 14px;
                font-weight: 500;
                transition: all 0.2s;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
            }
            
            .auto-start-notification.enhanced .notification-btn.primary {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
            }
            
            .auto-start-notification.enhanced .notification-btn.primary:hover {
                transform: translateY(-1px);
                box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
            }
            
            .auto-start-notification.enhanced .notification-btn.secondary {
                background: rgba(255, 255, 255, 0.1);
                color: white;
            }
            
            .auto-start-notification.enhanced .notification-btn.secondary:hover {
                background: rgba(255, 255, 255, 0.2);
            }
            
            .auto-start-notification.enhanced .notification-btn.cancel {
                background: transparent;
                color: rgba(255, 255, 255, 0.6);
                font-size: 12px;
                padding: 8px 16px;
                align-self: center;
            }
            
            .auto-start-notification.enhanced .notification-btn.cancel:hover {
                color: rgba(255, 255, 255, 0.8);
            }
            
            .auto-start-notification.enhanced .notification-actions {
                display: flex;
                justify-content: center;
            }
            
            @keyframes slideIn {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
        `;
        
        document.head.appendChild(style);
        document.body.appendChild(notification);
        
        // Add event listeners
        document.getElementById('screen-capture-btn').addEventListener('click', () => {
            this.startScreenCapture();
            notification.remove();
        });
        
        document.getElementById('tab-audio-btn').addEventListener('click', () => {
            this.startTranscription();
            notification.remove();
        });
        
        document.getElementById('auto-start-no').addEventListener('click', () => {
            notification.remove();
        });
        
        // Auto-remove after 15 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 15000);
    }
    
    async startScreenCapture() {
        try {
            console.log('📺 Starting screen capture for Google Meet...');
            
            // Collect meeting information for the backend
            const meetingInfo = {
                platform: 'google-meet',
                meetingTitle: this.getMeetingTitle(),
                participants: this.getParticipants(),
                meetingUrl: window.location.href,
                backendUrl: 'http://localhost:8000'
            };
            
            // Send message to background script to start screen capture
            chrome.runtime.sendMessage({
                action: 'START_SCREEN_CAPTURE',
                settings: meetingInfo
            }, (response) => {
                if (response && response.success) {
                    console.log('✅ Screen capture started successfully');
                    this.screenCaptureActive = true;
                } else {
                    console.error('❌ Failed to start screen capture:', response?.error);
                    this.showErrorNotification('Failed to start screen capture. Please try again.');
                }
            });
            
        } catch (error) {
            console.error('❌ Screen capture error:', error);
            this.showErrorNotification('Screen capture error: ' + error.message);
        }
    }
    
    getMeetingTitle() {
        // Try multiple selectors for meeting title
        const titleSelectors = [
            '[data-meeting-title]',
            '.google-material-icons + span',
            '[jscontroller="kAPMuc"] h1',
            '.meeting-title'
        ];
        
        for (const selector of titleSelectors) {
            const element = document.querySelector(selector);
            if (element && element.textContent.trim()) {
                return element.textContent.trim();
            }
        }
        
        return 'Google Meet Session';
    }
    
    getParticipants() {
        const participants = [];
        
        // Try to get participant names from various selectors
        const participantSelectors = [
            '[data-participant-id]',
            '.participant-name',
            '[jscontroller="NQNWd"] span',
            '.VfPpkd-BFbNVe-bF1uUb .VfPpkd-rymPhb span'
        ];
        
        for (const selector of participantSelectors) {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => {
                const name = el.textContent?.trim();
                if (name && !participants.includes(name)) {
                    participants.push(name);
                }
            });
        }
        
        // If no participants found, add current user
        if (participants.length === 0) {
            participants.push('Current User');
        }
        
        return participants;
    }
    
    showErrorNotification(message) {
        const notification = document.createElement('div');
        notification.className = 'error-notification';
        notification.innerHTML = `
            <div class="error-content">
                <span class="error-icon">⚠️</span>
                <span class="error-text">${message}</span>
                <button class="error-close">✕</button>
            </div>
        `;
        
        // Error notification styling
        const style = document.createElement('style');
        style.textContent = `
            .error-notification {
                position: fixed;
                top: 20px;
                right: 20px;
                background: rgba(220, 53, 69, 0.95);
                backdrop-filter: blur(15px);
                color: white;
                border-radius: 8px;
                box-shadow: 0 4px 20px rgba(220, 53, 69, 0.3);
                z-index: 10001;
                font-family: 'Segoe UI', system-ui, sans-serif;
                animation: slideIn 0.3s ease-out;
                max-width: 350px;
            }
            
            .error-notification .error-content {
                padding: 12px 16px;
                display: flex;
                align-items: center;
                gap: 12px;
            }
            
            .error-notification .error-text {
                flex: 1;
                font-size: 14px;
            }
            
            .error-notification .error-close {
                background: none;
                border: none;
                color: white;
                cursor: pointer;
                font-size: 16px;
                padding: 4px;
                opacity: 0.8;
            }
            
            .error-notification .error-close:hover {
                opacity: 1;
            }
        `;
        
        document.head.appendChild(style);
        document.body.appendChild(notification);
        
        // Close button
        notification.querySelector('.error-close').addEventListener('click', () => {
            notification.remove();
        });
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 5000);
    }

    setupEventListeners() {
        // Monitor for meeting start/end
        this.observeMeetingState();
        
        // Monitor participant changes
        this.observeParticipants();
        
        // Monitor meeting title changes
        this.observeMeetingTitle();
        
        // Listen for Google Meet specific events
        this.setupGoogleMeetListeners();
    }
    
    checkForMeetingStart() {
        // Check if already in a meeting
        this.detectMeetingState();
        
        // Set up continuous monitoring
        setInterval(() => {
            this.detectMeetingState();
        }, 2000);
    }
    
    detectMeetingState() {
        // Check for meeting indicators
        const meetingContainer = document.querySelector('[data-meeting-title]') || 
                               document.querySelector('[jscontroller="kAPMuc"]') ||
                               document.querySelector('div[data-allocation-index]');
        
        const videoElements = document.querySelectorAll('video');
        const meetingControls = document.querySelector('[data-is-muted]') ||
                              document.querySelector('div[jscontroller="U1kXOc"]');
        
        const inMeeting = !!(meetingContainer && videoElements.length > 0 && meetingControls);
        
        if (inMeeting !== this.isInMeeting) {
            this.isInMeeting = inMeeting;
            this.onMeetingStateChange(inMeeting);
        }
    }
    
    onMeetingStateChange(isInMeeting) {
        console.log(`📱 Google Meet state changed: ${isInMeeting ? 'In meeting' : 'Not in meeting'}`);
        
        if (isInMeeting) {
            // Don't auto-show notification - wait for user to click Start Screen Capture
            // this.showAutoStartNotification(); // Disabled for better UX
            this.positionOverlayForGoogleMeet();
        } else {
            if (this.isActive) {
                this.stopTranscription();
            }
        }
    }
    
    showAutoStartNotification() {
        // Show notification asking user if they want to start transcription
        const notification = document.createElement('div');
        notification.className = 'auto-start-notification';
        notification.innerHTML = `
            <div class="notification-content">
                <span class="notification-icon">🎤</span>
                <span class="notification-text">Start AI transcription for this meeting?</span>
                <button id="auto-start-yes" class="notification-btn yes">Yes</button>
                <button id="auto-start-no" class="notification-btn no">No</button>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        // Add event listeners
        document.getElementById('auto-start-yes').addEventListener('click', () => {
            this.startTranscription();
            notification.remove();
        });
        
        document.getElementById('auto-start-no').addEventListener('click', () => {
            notification.remove();
        });
        
        // Auto-remove after 10 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 10000);
    }
    
    positionOverlayForGoogleMeet() {
        const overlay = document.getElementById('transcription-overlay');
        if (!overlay) return;
        
        // Position overlay in the right sidebar area or bottom right
        const rightPanel = document.querySelector('[data-tab-id="2"]') || // Chat panel
                          document.querySelector('div[jscontroller="d3FMOc"]'); // Activities panel
        
        if (rightPanel) {
            // Position next to the right panel
            overlay.style.right = '20px';
            overlay.style.top = '100px';
        } else {
            // Default bottom right position
            overlay.style.right = '20px';
            overlay.style.bottom = '100px';
        }
        
        overlay.style.left = 'auto';
        overlay.style.position = 'fixed';
        overlay.style.zIndex = '10000';
    }
    
    observeMeetingState() {
        // Create observer for meeting state changes
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    this.detectMeetingState();
                }
            });
        });
        
        // Observe the entire document for meeting-related changes
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }
    
    observeParticipants() {
        // Monitor participant count changes
        const observer = new MutationObserver(() => {
            this.updateParticipantCount();
        });
        
        // Watch for participant list changes
        const participantArea = document.querySelector('[jscontroller="lKdWgf"]') ||
                              document.querySelector('div[data-allocation-index]');
        
        if (participantArea) {
            observer.observe(participantArea, {
                childList: true,
                subtree: true
            });
        }
    }
    
    updateParticipantCount() {
        // Count visible video elements or participant indicators
        const videoElements = document.querySelectorAll('video');
        const participantElements = document.querySelectorAll('[data-allocation-index]');
        
        const count = Math.max(videoElements.length, participantElements.length);
        
        if (count !== this.participantCount) {
            this.participantCount = count;
            console.log(`👥 Participant count: ${count}`);
            
            // Update overlay with participant info
            this.updateOverlayParticipantInfo();
        }
    }
    
    updateOverlayParticipantInfo() {
        // Add participant count to overlay status
        const statusText = document.getElementById('status-text');
        if (statusText && this.isInMeeting) {
            const baseStatus = this.isActive ? 'Recording and transcribing' : 'Ready to start';
            statusText.textContent = `${baseStatus} (${this.participantCount} participants)`;
        }
    }
    
    observeMeetingTitle() {
        // Try to get meeting title
        const titleElement = document.querySelector('[data-meeting-title]') ||
                           document.querySelector('div[jscontroller="kAPMuc"] h1') ||
                           document.querySelector('h1[jsname="r4nke"]');
        
        if (titleElement) {
            this.meetingTitle = titleElement.textContent || titleElement.innerText || '';
            console.log(`📋 Meeting title: ${this.meetingTitle}`);
        }
        
        // Set up observer for title changes
        const observer = new MutationObserver(() => {
            if (titleElement) {
                const newTitle = titleElement.textContent || titleElement.innerText || '';
                if (newTitle !== this.meetingTitle) {
                    this.meetingTitle = newTitle;
                    console.log(`📋 Meeting title updated: ${this.meetingTitle}`);
                }
            }
        });
        
        if (titleElement) {
            observer.observe(titleElement, {
                childList: true,
                subtree: true,
                characterData: true
            });
        }
    }
    
    setupGoogleMeetListeners() {
        // Listen for Google Meet specific events
        
        // Monitor microphone and camera toggles
        this.monitorMediaControls();
        
        // Monitor chat messages
        this.monitorChat();
        
        // Monitor screen sharing
        this.monitorScreenShare();
    }
    
    monitorMediaControls() {
        // Watch for mute/unmute events
        const muteButton = document.querySelector('[data-is-muted]');
        if (muteButton) {
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.type === 'attributes' && mutation.attributeName === 'data-is-muted') {
                        const isMuted = mutation.target.getAttribute('data-is-muted') === 'true';
                        console.log(`🎤 Microphone ${isMuted ? 'muted' : 'unmuted'}`);
                        
                        // Optionally pause transcription when muted
                        if (isMuted && this.isActive) {
                            this.updateStatus('paused', 'Microphone muted - transcription paused');
                        } else if (!isMuted && this.isActive) {
                            this.updateStatus('active', 'Recording and transcribing...');
                        }
                    }
                });
            });
            
            observer.observe(muteButton, {
                attributes: true,
                attributeFilter: ['data-is-muted']
            });
        }
    }
    
    monitorChat() {
        // Monitor chat for important messages
        const chatContainer = document.querySelector('[jscontroller="J6IJ0c"]') ||
                            document.querySelector('div[data-tab-id="2"]');
        
        if (chatContainer) {
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.type === 'childList') {
                        mutation.addedNodes.forEach((node) => {
                            if (node.nodeType === Node.ELEMENT_NODE) {
                                this.processChatMessage(node);
                            }
                        });
                    }
                });
            });
            
            observer.observe(chatContainer, {
                childList: true,
                subtree: true
            });
        }
    }
    
    processChatMessage(messageElement) {
        // Extract chat message content
        const messageText = messageElement.textContent || messageElement.innerText;
        if (messageText && messageText.trim()) {
            console.log(`💬 Chat message: ${messageText.trim()}`);
            
            // Add chat messages to transcription
            if (this.isActive) {
                this.displayTranscription(`[Chat] ${messageText.trim()}`, Date.now() / 1000);
            }
        }
    }
    
    monitorScreenShare() {
        // Monitor for screen sharing events
        const observer = new MutationObserver(() => {
            const screenShareIndicator = document.querySelector('[aria-label*="screen"]') ||
                                       document.querySelector('[data-promo-anchor-id="screen_share"]');
            
            if (screenShareIndicator) {
                console.log('🖥️ Screen sharing detected');
                
                if (this.isActive) {
                    this.updateStatus('active', 'Recording with screen share...');
                }
            }
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }
    
    async getAudioConstraints() {
        // Google Meet specific audio constraints
        return {
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                sampleRate: 16000,
                channelCount: 1,
                // Try to capture system audio if available
                systemAudio: 'include'
            }
        };
    }
    
    // Override method to include Google Meet specific session data
    async startMeetingSession() {
        try {
            const formData = new FormData();
            formData.append('meeting_id', this.meetingId);
            formData.append('participants', JSON.stringify([{
                platform: this.platform,
                url: window.location.href,
                title: this.meetingTitle,
                participant_count: this.participantCount
            }]));
            
            const response = await fetch('http://localhost:8000/api/start-meeting-session', {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
                throw new Error(`Failed to start session: ${response.status}`);
            }
            
            console.log('📋 Google Meet session started in backend');
            
        } catch (error) {
            console.error('❌ Failed to start Google Meet session:', error);
        }
    }
}

// Initialize Google Meet transcription
if (window.location.hostname === 'meet.google.com') {
    // Wait for page to be fully loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            new GoogleMeetTranscription();
        });
    } else {
        new GoogleMeetTranscription();
    }
}