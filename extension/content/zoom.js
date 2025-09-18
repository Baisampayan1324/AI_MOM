// Zoom specific content script
class ZoomTranscription extends MeetingTranscriptionBase {
    constructor() {
        super('zoom');
        this.participantCount = 0;
        this.meetingTitle = '';
        this.isInMeeting = false;
        this.isWebClient = false;
    }
    
    async init() {
        await super.init();
        this.detectZoomClient();
        console.log(`🎯 Zoom transcription initialized (${this.isWebClient ? 'Web Client' : 'Desktop App'})`);
    }
    
    detectZoomClient() {
        // Detect if using Zoom web client or desktop app
        const webClientIndicators = [
            document.querySelector('#webclient'),
            document.querySelector('.webclient'),
            document.querySelector('[aria-label*="Zoom"]'),
            document.querySelector('.zm-video-view')
        ];
        
        this.isWebClient = webClientIndicators.some(indicator => indicator !== null);
        
        if (!this.isWebClient) {
            // Try to detect if in a Zoom meeting page
            this.isWebClient = window.location.href.includes('zoom.us') && 
                             (window.location.href.includes('/j/') || 
                              window.location.href.includes('/wc/'));
        }
    }
    
    setupEventListeners() {
        if (this.isWebClient) {
            this.observeWebClientMeeting();
        } else {
            this.observeDesktopMeeting();
        }
        
        this.observeParticipants();
        this.observeMeetingControls();
        this.setupZoomListeners();
    }
    
    checkForMeetingStart() {
        this.detectMeetingState();
        
        // Set up continuous monitoring
        setInterval(() => {
            this.detectMeetingState();
        }, 2000);
    }
    
    detectMeetingState() {
        let inMeeting = false;
        
        if (this.isWebClient) {
            // Web client detection
            const videoContainer = document.querySelector('.zm-video-view') ||
                                 document.querySelector('#video-view') ||
                                 document.querySelector('.gallery-view-content');
            
            const meetingControls = document.querySelector('.footer-button__wrapper') ||
                                  document.querySelector('.meeting-control-button') ||
                                  document.querySelector('[aria-label*="mute"]');
            
            const videoElements = document.querySelectorAll('video');
            
            inMeeting = !!(videoContainer && meetingControls && videoElements.length > 0);
        } else {
            // For desktop app detection, look for specific Zoom meeting indicators
            const meetingIndicators = [
                document.querySelector('.meeting-client'),
                document.querySelector('[class*="meeting"]'),
                document.querySelector('[class*="participant"]'),
                document.querySelector('video')
            ];
            
            inMeeting = meetingIndicators.some(indicator => indicator !== null);
        }
        
        if (inMeeting !== this.isInMeeting) {
            this.isInMeeting = inMeeting;
            this.onMeetingStateChange(inMeeting);
        }
    }
    
    onMeetingStateChange(isInMeeting) {
        console.log(`📱 Zoom state changed: ${isInMeeting ? 'In meeting' : 'Not in meeting'}`);
        
        if (isInMeeting) {
            this.showAutoStartNotification();
            this.positionOverlayForZoom();
            this.extractMeetingInfo();
        } else {
            if (this.isActive) {
                this.stopTranscription();
            }
        }
    }
    
    showAutoStartNotification() {
        // Show notification asking user if they want to start transcription
        const notification = document.createElement('div');
        notification.className = 'auto-start-notification zoom-notification';
        notification.innerHTML = `
            <div class="notification-content">
                <span class="notification-icon">🎤</span>
                <span class="notification-text">Start AI transcription for this Zoom meeting?</span>
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
    
    positionOverlayForZoom() {
        const overlay = document.getElementById('transcription-overlay');
        if (!overlay) return;
        
        // Position overlay appropriately for Zoom interface
        if (this.isWebClient) {
            // For web client, position in top right
            overlay.style.right = '20px';
            overlay.style.top = '80px';
        } else {
            // For desktop app, position in bottom right
            overlay.style.right = '20px';
            overlay.style.bottom = '80px';
        }
        
        overlay.style.left = 'auto';
        overlay.style.position = 'fixed';
        overlay.style.zIndex = '10000';
    }
    
    extractMeetingInfo() {
        // Try to extract meeting title and other info
        const titleSelectors = [
            '.meeting-title',
            '[aria-label*="meeting"]',
            '.zm-modal-header-text',
            'h1', 'h2', 'h3'
        ];
        
        for (const selector of titleSelectors) {
            const element = document.querySelector(selector);
            if (element && element.textContent.trim()) {
                this.meetingTitle = element.textContent.trim();
                console.log(`📋 Zoom meeting title: ${this.meetingTitle}`);
                break;
            }
        }
        
        // Extract meeting ID if available
        const urlParams = new URLSearchParams(window.location.search);
        const meetingId = urlParams.get('meetingId') || 
                         window.location.pathname.match(/\/j\/(\d+)/)?.[1];
        
        if (meetingId) {
            console.log(`🔢 Zoom meeting ID: ${meetingId}`);
        }
    }
    
    observeWebClientMeeting() {
        // Monitor web client specific changes
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    this.detectMeetingState();
                }
            });
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }
    
    observeDesktopMeeting() {
        // Monitor desktop app specific changes
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    this.detectMeetingState();
                }
            });
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }
    
    observeParticipants() {
        // Monitor participant changes
        const observer = new MutationObserver(() => {
            this.updateParticipantCount();
        });
        
        // Look for participant list containers
        const participantSelectors = [
            '.participants-section',
            '.zm-video-view',
            '.gallery-view-content',
            '[class*="participant"]'
        ];
        
        for (const selector of participantSelectors) {
            const container = document.querySelector(selector);
            if (container) {
                observer.observe(container, {
                    childList: true,
                    subtree: true
                });
                break;
            }
        }
    }
    
    updateParticipantCount() {
        // Count participants in different ways depending on view
        let count = 0;
        
        // Try counting video elements
        const videoElements = document.querySelectorAll('video');
        count = Math.max(count, videoElements.length);
        
        // Try counting participant containers
        const participantElements = document.querySelectorAll('[class*="participant-item"]') ||
                                  document.querySelectorAll('.zm-video-view > div');
        count = Math.max(count, participantElements.length);
        
        // Look for participant count in UI
        const participantCountElement = document.querySelector('[aria-label*="participants"]') ||
                                      document.querySelector('.participants-count');
        
        if (participantCountElement) {
            const match = participantCountElement.textContent.match(/(\d+)/);
            if (match) {
                count = Math.max(count, parseInt(match[1]));
            }
        }
        
        if (count !== this.participantCount && count > 0) {
            this.participantCount = count;
            console.log(`👥 Zoom participant count: ${count}`);
            this.updateOverlayParticipantInfo();
        }
    }
    
    updateOverlayParticipantInfo() {
        const statusText = document.getElementById('status-text');
        if (statusText && this.isInMeeting) {
            const baseStatus = this.isActive ? 'Recording and transcribing' : 'Ready to start';
            statusText.textContent = `${baseStatus} (${this.participantCount} participants)`;
        }
    }
    
    observeMeetingControls() {
        // Monitor mute/unmute and other controls
        const controlSelectors = [
            '[aria-label*="mute"]',
            '[aria-label*="Mute"]',
            '.footer-button__wrapper button',
            '.meeting-control-button'
        ];
        
        for (const selector of controlSelectors) {
            const controls = document.querySelectorAll(selector);
            controls.forEach(control => {
                const observer = new MutationObserver((mutations) => {
                    mutations.forEach((mutation) => {
                        if (mutation.type === 'attributes') {
                            this.checkMuteStatus(mutation.target);
                        }
                    });
                });
                
                observer.observe(control, {
                    attributes: true,
                    attributeFilter: ['aria-label', 'class', 'data-state']
                });
            });
        }
    }
    
    checkMuteStatus(element) {
        const ariaLabel = element.getAttribute('aria-label') || '';
        const className = element.className || '';
        
        const isMuted = ariaLabel.toLowerCase().includes('unmute') ||
                       className.includes('muted') ||
                       className.includes('off');
        
        console.log(`🎤 Zoom microphone ${isMuted ? 'muted' : 'unmuted'}`);
        
        if (this.isActive) {
            if (isMuted) {
                this.updateStatus('paused', 'Microphone muted - transcription paused');
            } else {
                this.updateStatus('active', 'Recording and transcribing...');
            }
        }
    }
    
    setupZoomListeners() {
        // Listen for Zoom specific events
        this.monitorChat();
        this.monitorScreenShare();
        this.monitorRecording();
    }
    
    monitorChat() {
        // Monitor Zoom chat
        const chatSelectors = [
            '.chat-section',
            '.zm-chat-container',
            '[class*="chat"]'
        ];
        
        for (const selector of chatSelectors) {
            const chatContainer = document.querySelector(selector);
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
                break;
            }
        }
    }
    
    processChatMessage(messageElement) {
        const messageText = messageElement.textContent || messageElement.innerText;
        if (messageText && messageText.trim()) {
            console.log(`💬 Zoom chat: ${messageText.trim()}`);
            
            if (this.isActive) {
                this.displayTranscription(`[Chat] ${messageText.trim()}`, Date.now() / 1000);
            }
        }
    }
    
    monitorScreenShare() {
        // Monitor for screen sharing in Zoom
        const observer = new MutationObserver(() => {
            const screenShareIndicators = [
                document.querySelector('[aria-label*="screen"]'),
                document.querySelector('[class*="screen-share"]'),
                document.querySelector('.screen-share-content')
            ];
            
            const isScreenSharing = screenShareIndicators.some(indicator => indicator !== null);
            
            if (isScreenSharing) {
                console.log('🖥️ Zoom screen sharing detected');
                
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
    
    monitorRecording() {
        // Monitor for Zoom recording indicators
        const observer = new MutationObserver(() => {
            const recordingIndicators = [
                document.querySelector('[aria-label*="recording"]'),
                document.querySelector('[class*="recording"]'),
                document.querySelector('.recording-indicator')
            ];
            
            const isRecording = recordingIndicators.some(indicator => indicator !== null);
            
            if (isRecording) {
                console.log('🔴 Zoom recording detected');
                
                if (this.isActive) {
                    this.updateStatus('active', 'Recording detected - transcribing...');
                }
            }
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }
    
    async getAudioConstraints() {
        // Zoom specific audio constraints
        return {
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                sampleRate: 16000,
                channelCount: 1
            }
        };
    }
    
    async startMeetingSession() {
        try {
            const formData = new FormData();
            formData.append('meeting_id', this.meetingId);
            formData.append('participants', JSON.stringify([{
                platform: this.platform,
                url: window.location.href,
                title: this.meetingTitle,
                participant_count: this.participantCount,
                client_type: this.isWebClient ? 'web' : 'desktop'
            }]));
            
            const response = await fetch('http://localhost:8000/api/start-meeting-session', {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
                throw new Error(`Failed to start session: ${response.status}`);
            }
            
            console.log('📋 Zoom session started in backend');
            
        } catch (error) {
            console.error('❌ Failed to start Zoom session:', error);
        }
    }
}

// Initialize Zoom transcription
if (window.location.hostname.includes('zoom.us')) {
    // Wait for page to be fully loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            new ZoomTranscription();
        });
    } else {
        new ZoomTranscription();
    }
}