// YouTube specific content script
class YouTubeTranscription extends MeetingTranscriptionBase {
    constructor() {
        super('youtube');
        this.videoTitle = '';
        this.videoId = '';
        this.isWatchingVideo = false;
        this.videoDuration = 0;
        this.currentTime = 0;
    }
    
    async init() {
        await super.init();
        console.log('🎯 YouTube transcription initialized');
    }
    
    setupEventListeners() {
        this.observeVideoState();
        this.observeVideoInfo();
        this.setupYouTubeListeners();
        
        // Listen for YouTube navigation changes
        this.observeNavigation();
    }
    
    checkForMeetingStart() {
        this.detectVideoState();
        
        // Set up continuous monitoring
        setInterval(() => {
            this.detectVideoState();
            this.updateVideoProgress();
        }, 2000);
    }
    
    detectVideoState() {
        // Check if we're on a video page and video is playing
        const isVideoPage = window.location.pathname.includes('/watch');
        const videoElement = document.querySelector('video');
        const videoPlayer = document.querySelector('#movie_player');
        
        const isWatching = !!(isVideoPage && videoElement && videoPlayer && !videoElement.paused);
        
        if (isWatching !== this.isWatchingVideo) {
            this.isWatchingVideo = isWatching;
            this.onVideoStateChange(isWatching);
        }
    }
    
    onVideoStateChange(isWatching) {
        console.log(`📺 YouTube state changed: ${isWatching ? 'Watching video' : 'Not watching'}`);
        
        if (isWatching) {
            this.extractVideoInfo();
            this.showAutoStartNotification();
            this.positionOverlayForYouTube();
        } else {
            if (this.isActive) {
                this.stopTranscription();
            }
        }
    }
    
    extractVideoInfo() {
        // Extract video title
        const titleElement = document.querySelector('h1.ytd-video-primary-info-renderer') ||
                           document.querySelector('.title.style-scope.ytd-video-primary-info-renderer') ||
                           document.querySelector('h1[class*="title"]');
        
        if (titleElement) {
            this.videoTitle = titleElement.textContent.trim();
            console.log(`📹 Video title: ${this.videoTitle}`);
        }
        
        // Extract video ID from URL
        const urlParams = new URLSearchParams(window.location.search);
        this.videoId = urlParams.get('v') || '';
        console.log(`🆔 Video ID: ${this.videoId}`);
        
        // Get video duration
        const videoElement = document.querySelector('video');
        if (videoElement) {
            this.videoDuration = videoElement.duration || 0;
            console.log(`⏱️ Video duration: ${this.videoDuration}s`);
        }
    }
    
    showAutoStartNotification() {
        // Show notification asking user if they want to start transcription
        const notification = document.createElement('div');
        notification.className = 'auto-start-notification youtube-notification';
        notification.innerHTML = `
            <div class="notification-content">
                <span class="notification-icon">🎤</span>
                <span class="notification-text">Start AI transcription for this YouTube video?</span>
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
        
        // Auto-remove after 8 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 8000);
    }
    
    positionOverlayForYouTube() {
        const overlay = document.getElementById('transcription-overlay');
        if (!overlay) return;
        
        // Position overlay in the right sidebar or bottom right
        const secondaryColumn = document.querySelector('#secondary') ||
                              document.querySelector('#related');
        
        if (secondaryColumn) {
            // Position above the related videos
            overlay.style.right = '20px';
            overlay.style.top = '100px';
        } else {
            // Default position for theater mode or fullscreen
            overlay.style.right = '20px';
            overlay.style.bottom = '100px';
        }
        
        overlay.style.left = 'auto';
        overlay.style.position = 'fixed';
        overlay.style.zIndex = '10000';
    }
    
    observeVideoState() {
        // Monitor video state changes
        const videoElement = document.querySelector('video');
        if (videoElement) {
            videoElement.addEventListener('play', () => {
                console.log('▶️ YouTube video started playing');
                this.detectVideoState();
            });
            
            videoElement.addEventListener('pause', () => {
                console.log('⏸️ YouTube video paused');
                this.detectVideoState();
                
                if (this.isActive) {
                    this.updateStatus('paused', 'Video paused - transcription paused');
                }
            });
            
            videoElement.addEventListener('ended', () => {
                console.log('🏁 YouTube video ended');
                if (this.isActive) {
                    this.stopTranscription();
                }
            });
            
            videoElement.addEventListener('timeupdate', () => {
                this.currentTime = videoElement.currentTime;
            });
        }
        
        // Set up observer for video element changes
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    const newVideo = document.querySelector('video');
                    if (newVideo && newVideo !== videoElement) {
                        this.observeVideoState(); // Re-attach listeners to new video element
                    }
                }
            });
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }
    
    observeVideoInfo() {
        // Monitor video info changes (for navigation between videos)
        const observer = new MutationObserver(() => {
            this.extractVideoInfo();
        });
        
        const primaryInfo = document.querySelector('#primary-info') ||
                          document.querySelector('.ytd-video-primary-info-renderer');
        
        if (primaryInfo) {
            observer.observe(primaryInfo, {
                childList: true,
                subtree: true
            });
        }
    }
    
    observeNavigation() {
        // Monitor for YouTube navigation changes (SPA navigation)
        let currentUrl = window.location.href;
        
        const observer = new MutationObserver(() => {
            if (window.location.href !== currentUrl) {
                currentUrl = window.location.href;
                console.log('🔄 YouTube navigation detected');
                
                // Stop current transcription if active
                if (this.isActive) {
                    this.stopTranscription();
                }
                
                // Re-check video state after navigation
                setTimeout(() => {
                    this.detectVideoState();
                }, 1000);
            }
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }
    
    updateVideoProgress() {
        if (this.isWatchingVideo && this.isActive) {
            const videoElement = document.querySelector('video');
            if (videoElement) {
                this.currentTime = videoElement.currentTime;
                
                // Update status with video progress
                const progress = this.videoDuration > 0 ? 
                    `${Math.floor(this.currentTime / 60)}:${Math.floor(this.currentTime % 60).toString().padStart(2, '0')} / ${Math.floor(this.videoDuration / 60)}:${Math.floor(this.videoDuration % 60).toString().padStart(2, '0')}` :
                    `${Math.floor(this.currentTime / 60)}:${Math.floor(this.currentTime % 60).toString().padStart(2, '0')}`;
                
                this.updateStatus('active', `Recording [${progress}]`);
            }
        }
    }
    
    setupYouTubeListeners() {
        // Listen for YouTube specific events
        this.monitorComments();
        this.monitorPlaybackSettings();
        this.monitorLiveChat();
    }
    
    monitorComments() {
        // Monitor comments section for interesting content
        const commentsSection = document.querySelector('#comments') ||
                              document.querySelector('#comment-section-renderer');
        
        if (commentsSection) {
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.type === 'childList') {
                        mutation.addedNodes.forEach((node) => {
                            if (node.nodeType === Node.ELEMENT_NODE) {
                                this.processComment(node);
                            }
                        });
                    }
                });
            });
            
            observer.observe(commentsSection, {
                childList: true,
                subtree: true
            });
        }
    }
    
    processComment(commentElement) {
        // Extract and log interesting comments (optional feature)
        const commentText = commentElement.querySelector('#content-text');
        if (commentText && commentText.textContent.trim()) {
            const text = commentText.textContent.trim();
            console.log(`💬 YouTube comment: ${text.substring(0, 100)}...`);
            
            // Optionally add important comments to transcription
            if (this.isActive && text.length > 50) {
                // Only include longer, potentially meaningful comments
                this.displayTranscription(`[Comment] ${text.substring(0, 200)}...`, Date.now() / 1000);
            }
        }
    }
    
    monitorPlaybackSettings() {
        // Monitor playback speed changes
        const observer = new MutationObserver(() => {
            const playbackRateButton = document.querySelector('.ytp-playback-rate-button');
            if (playbackRateButton) {
                const rate = playbackRateButton.textContent.trim();
                if (rate && rate !== '1x') {
                    console.log(`⚡ Playback speed: ${rate}`);
                    
                    if (this.isActive) {
                        this.updateStatus('active', `Recording at ${rate} speed`);
                    }
                }
            }
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }
    
    monitorLiveChat() {
        // Monitor live chat for live streams
        const liveChatFrame = document.querySelector('#chatframe') ||
                            document.querySelector('iframe[src*="live_chat"]');
        
        if (liveChatFrame) {
            console.log('🔴 Live stream with chat detected');
            
            // Try to access live chat (limited by CORS)
            try {
                const chatDocument = liveChatFrame.contentDocument;
                if (chatDocument) {
                    const observer = new MutationObserver((mutations) => {
                        mutations.forEach((mutation) => {
                            if (mutation.type === 'childList') {
                                mutation.addedNodes.forEach((node) => {
                                    if (node.nodeType === Node.ELEMENT_NODE) {
                                        this.processLiveChatMessage(node);
                                    }
                                });
                            }
                        });
                    });
                    
                    observer.observe(chatDocument.body, {
                        childList: true,
                        subtree: true
                    });
                }
            } catch (error) {
                console.log('Cannot access live chat due to CORS restrictions');
            }
        }
    }
    
    processLiveChatMessage(messageElement) {
        const messageText = messageElement.textContent || messageElement.innerText;
        if (messageText && messageText.trim()) {
            console.log(`💬 Live chat: ${messageText.trim()}`);
            
            if (this.isActive) {
                this.displayTranscription(`[Live Chat] ${messageText.trim()}`, Date.now() / 1000);
            }
        }
    }
    
    async getAudioConstraints() {
        // YouTube specific audio constraints
        // Try to capture both microphone and system audio
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
    
    // Override transcription display to include timestamps
    displayTranscription(text, timestamp) {
        const transcriptionText = document.getElementById('transcription-text');
        if (!transcriptionText) return;
        
        const entry = document.createElement('div');
        entry.className = 'transcription-entry youtube-entry';
        
        // Use video timestamp if available
        const videoTime = this.currentTime;
        const videoTimeStr = `${Math.floor(videoTime / 60)}:${Math.floor(videoTime % 60).toString().padStart(2, '0')}`;
        const realTime = new Date(timestamp * 1000).toLocaleTimeString();
        
        entry.innerHTML = `
            <span class="transcription-time">[${videoTimeStr}] (${realTime})</span>
            <span class="transcription-content">${text}</span>
        `;
        
        transcriptionText.appendChild(entry);
        transcriptionText.scrollTop = transcriptionText.scrollHeight;
    }
    
    async startMeetingSession() {
        try {
            const formData = new FormData();
            formData.append('meeting_id', this.meetingId);
            formData.append('participants', JSON.stringify([{
                platform: this.platform,
                url: window.location.href,
                title: this.videoTitle,
                video_id: this.videoId,
                duration: this.videoDuration
            }]));
            
            const response = await fetch('http://localhost:8000/api/start-meeting-session', {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
                throw new Error(`Failed to start session: ${response.status}`);
            }
            
            console.log('📋 YouTube session started in backend');
            
        } catch (error) {
            console.error('❌ Failed to start YouTube session:', error);
        }
    }
}

// Initialize YouTube transcription
if (window.location.hostname.includes('youtube.com')) {
    // Wait for page to be fully loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            new YouTubeTranscription();
        });
    } else {
        new YouTubeTranscription();
    }
}