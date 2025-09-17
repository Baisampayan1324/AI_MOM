# Meeting Minutes Real-time System

## Overview

The Meeting Minutes Real-time System is a comprehensive solution for automatically transcribing, analyzing, and summarizing meeting audio in real-time. It features speaker diarization (speaker identification), personalized alerts, and real-time progress updates.

## Features

### Core Features
- **Audio File Processing**: Transcribe and summarize pre-recorded audio files
- **Real-time Audio Capture**: Live transcription of meetings as they happen
- **Speaker Diarization**: Automatic identification and labeling of different speakers
- **Personalized Alerts**: Intelligent alerts when you or your keywords are mentioned
- **Summarization**: AI-powered meeting summaries with key points and action items
- **Multi-language Support**: Supports transcription in multiple languages
- **Data Persistence**: Session data is saved and restored across page refreshes

### Enhanced Features
- **Color-coded Speaker Formatting**: Each speaker is displayed in a different color for easy identification
- **Line Break Separation**: Clear visual separation between different speakers
- **Real-time Progress Updates**: Live status updates during audio processing
- **WebSocket Integration**: Real-time communication between frontend and backend
- **User Profile Management**: Personalize alerts with your name, role, projects, and keywords

## System Architecture

```
Frontend (HTML/CSS/JavaScript) ↔ WebSocket/REST API ↔ Backend (FastAPI/Python)
                                          ↓
                              Audio Processing (Whisper)
                                          ↓
                              AI Summarization (Groq LLM)
```

### Browser Extension Architecture

```
Browser Extension ↔ WebSocket/REST API ↔ Backend (FastAPI/Python)
        ↓                        ↓
Popup UI & Overlay      Audio Processing (Whisper)
        ↓                        ↓
  Content Scripts      AI Summarization (Groq LLM)
```

### Components
1. **Frontend**: Three main interfaces
   - Audio File Processing: Upload and process pre-recorded audio files
   - Real-time Capture: Live meeting transcription
   - Profile Settings: Manage personal information for alerts

2. **Browser Extension**: Chrome/Edge extension for in-browser meeting assistance
   - Popup UI for quick access controls
   - Overlay panel for real-time transcription display
   - System audio capture for meeting applications
   - Personalized alerts and notifications

3. **Backend API**: FastAPI server with endpoints for:
   - Audio transcription and summarization
   - Real-time audio chunk processing
   - User profile management
   - WebSocket communication

4. **Audio Processing Service**: Uses OpenAI's Whisper for speech-to-text conversion

5. **Summarization Service**: Uses Groq's LLM for text summarization and analysis

## Setup and Installation

### Prerequisites
- Python 3.8+
- pip (Python package manager)
- Virtual environment tool (venv or conda)
- Microphone for real-time capture
- Groq API key for summarization
- Virtual audio device for system audio capture (optional but recommended)

### Installation Steps

1. **Create and Activate Virtual Environment**:
   ```bash
   python -m venv venv
   # Windows:
   venv\Scripts\activate
   # macOS/Linux:
   source venv/bin/activate
   ```

2. **Install Dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

3. **Set Up Environment Variables**:
   Create a `.env` file in the backend directory with your Groq API key:
   ```
   GROQ_API_KEY=your_api_key_here
   ```

4. **Start the Backend Server**:
   ```bash
   python main.py
   ```
   The server will start on `http://localhost:8000`

## Usage Guide

### 1. Audio File Processing

**Purpose**: Process pre-recorded audio files to generate transcriptions and summaries

**Steps**:
1. Open `frontend/audio_processing.html` in your browser
2. Select an audio file (MP3, WAV, etc.)
3. Optionally enter a Meeting ID and select language
4. Click "Process Audio"
5. View real-time progress updates and final results

**Features**:
- Speaker-formatted transcription with color coding
- AI-generated summary with key points and action items
- Real-time progress indicators

### 2. Real-time Audio Capture

**Purpose**: Transcribe live meetings as they happen with automatic summarization

**Steps**:
1. Open `frontend/realtime_capture.html` in your browser
2. Enter a Meeting ID and select language
3. Click "Connect to Meeting"
4. Click "Start Recording" to begin capturing audio
5. View live transcription, automatic summaries, and speaker alerts

**Features**:
- Live transcription updates every 2-5 seconds
- Automatic summarization every 30 seconds
- Speaker alerts when your name or keywords are mentioned
- Audio level visualization
- Extension mode (right-side overlay for multitasking)
- **System Audio Capture Support**: Capture audio directly from applications (Google Meet, Zoom, WhatsApp, etc.)

**Extension Mode**:
The Meeting Assistant can run as a right-side overlay while you work:
1. Click "Toggle Extension Mode" to switch to overlay view
2. The interface will appear as a narrow panel on the right side of your screen
3. Perfect for keeping notes while participating in meetings

**System Audio Capture Setup**:
For capturing system audio instead of microphone input:
1. Install virtual audio cable software:
   - **Windows**: VB-Cable or enable Stereo Mix
   - **macOS**: BlackHole
   - **Linux**: Configure PulseAudio monitor
2. Route meeting audio to the virtual device
3. Select the virtual device as microphone in browser settings
4. Enable "System Audio Capture" in the Meeting Assistant

See `SYSTEM_AUDIO_CAPTURE.md` for detailed setup instructions.

### 3. Profile Settings

**Purpose**: Customize personal information for targeted alerts

**Steps**:
1. Open `frontend/profile_settings.html` in your browser
2. Fill in your personal information:
   - Full name
   - Email
   - Role/Position
   - Team
   - Projects
   - Skills
   - Custom keywords
3. Click "Save Profile"

**Benefits**:
- Personalized alerts when your name or role is mentioned
- Notifications about your projects or skills
- Custom keyword tracking

### 4. Browser Extension

**Purpose**: One-click in-browser meeting assistance with intelligent overlay panel

**Steps**:
1. Install the extension from the `extension` folder (see `extension/README.md`)
2. Click the extension icon to open the popup
3. Choose your audio capture mode:
   - **Microphone Mode (default)**: Captures your microphone input
   - **System Audio Mode**: Captures audio directly from meetings
4. Enter meeting details and start recording with one click
5. The overlay panel automatically opens on the right side

**Enhanced Features**:
- **Browser extension for Chrome/Edge** with completely streamlined workflow
- **One-click recording** - No complex setup, just click and start
- **Intelligent overlay panel** that automatically opens, drags, and resizes
- **Dual audio modes**: 
  - **Microphone Mode (default)**: No setup required, works immediately
  - **System Audio Mode**: For capturing online meetings (Google Meet, Zoom, etc.)
- **Real-time transcription** with 2-5 second updates
- **Automatic summarization** every 30 seconds
- **Speaker diarization** to identify different speakers
- **Personalized alerts** when your name or keywords are mentioned
- **Audio level visualization** with real-time feedback
- **User profile management** through options page

**System Audio Mode**:
When System Audio Mode is enabled:
- The browser will prompt you to select what to share (screen, window, or tab)
- You can still hear the audio normally while it's being captured
- Perfect for capturing audio from Google Meet, Zoom, or other online meeting platforms
- No additional software installation required (uses browser's built-in capabilities)

**What Makes It Special**:
- **90% of users can start immediately** with Microphone Mode - no additional software needed
- **System Audio Mode** available for capturing online meetings directly in the browser
- **Automatic panel management** - Opens when recording starts, cleans up when stopped
- **Professional features** in an easy-to-use package

## Speaker Diarization (Speaker Identification)

The system automatically identifies and labels different speakers in meetings:

### How It Works
1. Analyzes timing gaps between speech segments
2. Assigns speaker labels (Speaker 0, Speaker 1, etc.)
3. Formats output with color coding and line breaks

### Output Format
```
Speaker 0: Hello everyone, let's start the meeting.
Speaker 1: Good morning! I'm excited to be here.
Speaker 0: Let's discuss the quarterly results.
```

### Visual Features
- **Color Coding**: Each speaker has a distinct color
  - Speaker 0: Green
  - Speaker 1: Blue
  - Speaker 2: Yellow
  - Speaker 3: Magenta
  - Speaker 4: Cyan
  - Speaker 5: Red
- **Line Breaks**: Clear separation between speakers
- **Persistent Formatting**: Maintained across page refreshes

## Personalized Alert System

### Alert Types
1. **Personal Alerts** (🚨): Triggered when your personal information is mentioned
2. **General Alerts** (⚠️): Triggered when general participant-directed keywords are detected

### Triggers
- Your name (and variations)
- Your role or team
- Your projects or skills
- Custom keywords
- General questions directed at participants

## Testing Instructions

### 1. Backend API Testing

**Prerequisites**: Backend server running on `http://localhost:8000`

**Test Scripts**:
1. **Audio Processing Test**:
   ```bash
   python test_audio_processing.py
   ```
   Tests file upload and processing endpoints

2. **Speaker Alert Test**:
   ```bash
   python test_speaker_alerts.py
   ```
   Tests personalized alert functionality

3. **Speaker Diarization Test**:
   ```bash
   python test_speaker_diarization.py
   ```
   Tests speaker identification features

4. **Real-time Updates Test**:
   ```bash
   python test_real_time_updates.py
   ```
   Tests WebSocket communication

5. **Chunk Processing Test**:
   ```bash
   python test_chunk_endpoint.py
   ```
   Tests real-time audio chunk processing

### 2. Frontend Testing

**Prerequisites**: Backend server running, browser with microphone access

**Manual Testing Steps**:

1. **Audio File Processing**:
   - Open `frontend/audio_processing.html`
   - Upload an audio file
   - Verify:
     * Progress updates appear
     * Transcription is generated
     * Speaker-formatted text shows color coding
     * Summary with key points is created
   - Refresh page and verify data persistence

2. **Real-time Capture**:
   - Open `frontend/realtime_capture.html`
   - Connect to meeting
   - Start recording
   - Speak into microphone
   - Verify:
     * Live transcription appears
     * Audio level meter responds
     * Speaker alerts trigger when appropriate
   - Refresh page and verify session data restoration
   - Use "Clear Session Data" button to reset

3. **Profile Settings**:
   - Open `frontend/profile_settings.html`
   - Enter profile information
   - Save profile
   - Verify data is saved and loaded correctly

### 3. Integration Testing

1. **End-to-End Workflow**:
   - Set up user profile
   - Process an audio file with multiple speakers
   - Verify speaker identification and formatting
   - Check summary quality and key points
   - Refresh page and verify data persistence

2. **Real-time Workflow**:
   - Set up user profile
   - Start real-time capture session
   - Have multi-speaker conversation
   - Verify live speaker identification
   - Check for personalized alerts
   - Refresh page and verify session continuity

### 4. Error Handling Testing

1. **Network Issues**:
   - Disconnect network during processing
   - Verify graceful error handling
   - Reconnect and verify recovery

2. **Invalid Audio**:
   - Upload non-audio files
   - Verify appropriate error messages

3. **Missing Dependencies**:
   - Run without Groq API key
   - Verify fallback behavior

## API Endpoints

### Audio Processing
- `POST /api/transcribe`: Transcribe an audio file
- `POST /api/summarize`: Summarize text
- `POST /api/process-audio`: Process audio file with transcription and summarization
- `POST /api/process-audio-chunk`: Process real-time audio chunks

### User Profile
- `POST /api/user-profile`: Create or update user profile
- `GET /api/user-profile`: Get current user profile

### System
- `GET /`: API root
- `GET /health`: Health check

### WebSocket
- `WebSocket /ws/meeting/{meeting_id}`: Real-time updates

## Performance Notes

### Optimization Strategies
1. **Model Selection**: Uses Whisper "base" model for balance of speed and accuracy
2. **GPU Acceleration**: Automatically utilizes GPU when available
3. **Reduced Processing Overhead**: Optimized parameters for faster transcription
4. **Efficient Real-time Processing**: Direct numpy array processing to avoid file I/O overhead

### Expected Performance
- Audio file processing: 2-5 seconds per minute of audio (varies with system specs)
- Real-time processing: ~1.5 second latency
- Summarization: ~2-3 seconds for typical meeting length

## Troubleshooting

### Common Issues

1. **Real-time Audio Not Working**:
   - Ensure browser has microphone permissions
   - Check that no other applications are using the microphone
   - Verify microphone is working in system settings

2. **GPU Acceleration Issues**:
   - Ensure CUDA drivers are installed
   - Check that PyTorch with CUDA support is installed

3. **WebSocket Connection Problems**:
   - Verify backend server is running
   - Check for firewall blocking WebSocket connections

4. **Poor Transcription Quality**:
   - Ensure good audio quality
   - Try specifying language explicitly
   - Check microphone positioning

5. **Summarization Failures**:
   - Verify Groq API key is set correctly
   - Check internet connection
   - Ensure transcription is successful first

### Debugging Tips

1. **Check Browser Console**: Look for JavaScript errors
2. **Check Backend Logs**: Monitor server output for errors
3. **Test Network Connectivity**: Ensure all endpoints are accessible
4. **Verify Dependencies**: Confirm all packages are installed correctly

## Data Persistence

### Real-time Capture
- Session data is automatically saved to browser's localStorage
- Data is restored when page is refreshed
- Session data expires after 24 hours
- "Clear Session Data" button to manually reset

### Audio Processing
- Processing results are saved to localStorage
- Data is restored when page is refreshed
- Results expire after 24 hours
- "Clear Saved Results" button to manually reset

## Security Considerations

### Data Handling
- Audio files are processed locally and not stored permanently
- User profile data is stored locally in browser
- No sensitive data is transmitted to external servers (except for LLM processing)

### Best Practices
- Use strong, unique passwords for any authentication
- Keep software updated
- Review and understand privacy settings
- Be cautious with sharing meeting recordings

## Contributing

### Development Guidelines
1. Follow existing code style and conventions
2. Write clear, descriptive commit messages
3. Test all changes thoroughly
4. Document new features and changes

### Reporting Issues
1. Check existing issues before creating new ones
2. Provide detailed reproduction steps
3. Include system information and error messages
4. Attach relevant logs or screenshots

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- OpenAI Whisper for speech recognition
- Groq for LLM inference
- FastAPI for backend framework
- WebSocket for real-time communication