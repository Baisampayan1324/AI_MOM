# Meeting Minutes Real-time System

This system provides real-time transcription and summarization of meeting audio with optimized performance for both CPU and GPU systems.

## Features

- Audio file processing with transcription and summarization
- Real-time audio capture and transcription
- Enhanced speaker alert system for when you're mentioned in meetings
- Personalized alerts based on your name, role, projects, and custom keywords
- Speaker diarization (speaker identification) for multi-participant meetings
- Color-coded speaker names for visual distinction
- Line breaks between speakers for improved readability
- Real-time progress updates during processing
- Data persistence across page refreshes
- Optimized for both CPU and GPU processing
- WebSocket support for real-time updates
- Web-based frontend for easy access

## Performance Optimizations

1. **Model Selection**: Uses the "base" Whisper model for a balance of speed and accuracy
2. **GPU Acceleration**: Automatically utilizes GPU when available for faster processing
3. **Reduced Processing Overhead**: Optimized parameters for faster transcription
4. **Efficient Real-time Processing**: Direct numpy array processing to avoid file I/O overhead
5. **Robust Audio Parsing**: Enhanced WAV parsing and multiple format support

## Enhanced Speaker Alert System

The system now includes an intelligent speaker alert feature that detects when speakers mention:
- Your name (and variations)
- Your role or team
- Your projects or skills
- Custom keywords you define
- General participant-directed questions

When these are detected, the system generates appropriate alerts with suggested responses.

## Speaker Diarization (Speaker Identification)

The system includes enhanced speaker diarization capabilities to identify who is speaking what:
- Automatic speaker separation in multi-participant meetings
- Speaker labels (Speaker 0, Speaker 1, etc.) for clarity
- Color-coded speaker names for easy visual distinction:
  - Speaker 0: Green
  - Speaker 1: Blue
  - Speaker 2: Yellow
  - Speaker 3: Magenta
  - Speaker 4: Cyan
  - Speaker 5: Red
- Line breaks between different speakers for improved readability
- Integration with transcription for context-aware alerts

Example output format:
```
Speaker 0: Hello everyone, thank you for joining our weekly meeting.
Speaker 1: Good morning! I'm excited to discuss our project updates today.
Speaker 0: Let's start with John, can you update us on the Meeting Minutes System?
```

This improved format helps you understand who said what during the meeting and enables more accurate personal alerts, with each speaker clearly distinguished by color and line breaks.

## Real-time Processing Updates

The system provides real-time progress updates during audio file processing:
- Progress indicators showing transcription and summarization status
- Real-time WebSocket updates as processing stages complete
- Immediate display of results when processing finishes
- Optimized 5-second audio chunking with overlap for better accuracy
- Efficient memory management to prevent browser performance issues

## Data Persistence

The system now includes data persistence features:
- Real-time capture session data is saved and restored across page refreshes
- Audio processing results are saved and restored across page refreshes
- Data expires after 24 hours for privacy
- Manual clear buttons to reset saved data

## System Requirements

- Python 3.8+
- For GPU acceleration: CUDA-compatible GPU (NVIDIA) with appropriate drivers
- Microphone for real-time capture
- Modern web browser with JavaScript enabled

## Installation

1. Create a virtual environment:
   ```
   python -m venv venv
   ```

2. Activate the virtual environment:
   - Windows: `venv\Scripts\activate`
   - macOS/Linux: `source venv/bin/activate`

3. Install dependencies:
   ```
   pip install -r requirements.txt
   ```

4. Set up environment variables:
   Create a `.env` file with your Groq API key:
   ```
   GROQ_API_KEY=your_api_key_here
   ```

## Usage

### Starting the Backend Server

```
python main.py
```

The server will start on `http://localhost:8000`.

### Setting Up Your Profile

Before joining a meeting, set up your personal information:
1. Open `frontend/profile_settings.html` in your browser
2. Enter your:
   - Full name
   - Email
   - Role/Position
   - Team
   - Projects you work on
   - Skills you have
   - Custom keywords that should trigger alerts
3. Save your profile

Example profile:
```json
{
  "name": "John Smith",
  "email": "john.smith@example.com",
  "role": "Software Engineer",
  "team": "Backend Development",
  "projects": ["Project Alpha", "Project Beta", "Meeting Minutes System"],
  "skills": ["Python", "FastAPI", "Machine Learning", "Web Development"],
  "keywords": ["John", "Smith", "JS", "johnsmith"]
}
```

When speakers mention any of these terms, you'll receive personalized alerts.

### Using the Frontend

1. Open `frontend/audio_processing.html` in your browser to process audio files
2. Open `frontend/realtime_capture.html` in your browser for real-time audio capture
3. Open `frontend/profile_settings.html` to manage your personal information

### Data Persistence Features

- Real-time capture data is automatically saved to your browser's localStorage
- Audio processing results are saved to localStorage
- Data is restored when you refresh the page
- Data expires after 24 hours for privacy
- Use "Clear Session Data" or "Clear Saved Results" buttons to manually reset

### Testing

Run the test scripts to verify functionality:
```
python test_audio_processing.py
python test_speaker_alerts.py
python test_speaker_diarization.py
python test_real_time_updates.py
python test_chunk_endpoint.py
python test_speaker_identification.py
python test_comprehensive_improvements.py
```

See TESTING_GUIDE.md for comprehensive testing instructions.

## API Endpoints

- `POST /api/transcribe` - Transcribe an audio file
- `POST /api/summarize` - Summarize text
- `POST /api/process-audio` - Process audio file with transcription and summarization
- `POST /api/process-audio-chunk` - Process real-time audio chunks
- `POST /api/user-profile` - Create or update user profile
- `GET /api/user-profile` - Get current user profile
- `GET /` - API root
- `GET /health` - Health check
- `WebSocket /ws/meeting/{meeting_id}` - Real-time updates

## Performance Notes

- Processing time has been optimized and should be significantly faster than previous versions
- GPU acceleration is automatically utilized when available
- The system uses the "base" model which provides a good balance between speed and accuracy
- Real-time processing interval has been optimized to 1.5 seconds for better responsiveness
- Enhanced error handling and fallback mechanisms for robust operation

## Speaker Alert System

The enhanced speaker alert system detects when speakers may be directing questions to participants or mentioning your personal information. Two types of alerts are generated:

1. **Personal Alerts** (🚨): Triggered when your name, role, projects, skills, or custom keywords are mentioned
2. **General Alerts** (⚠️): Triggered when general participant-directed keywords are detected

## Troubleshooting

If you encounter issues with real-time audio capture:
1. Ensure your browser has microphone permissions
2. Check that no other applications are using the microphone
3. Verify your microphone is working in system settings

For GPU acceleration issues:
1. Ensure you have the appropriate CUDA drivers installed
2. Check that PyTorch with CUDA support is installed

For real-time updates not showing:
1. Check that WebSocket connections are not being blocked
2. Verify the backend server is running
3. Check browser console for JavaScript errors

For ANSI color codes showing as raw text:
1. Ensure the frontend JavaScript is not blocked
2. Check that files are served through a web server (not file://)
3. Clear browser cache and try again

For data persistence issues:
1. Check browser localStorage permissions
2. Verify no JavaScript errors in console
3. Test in different browser

## Recent Improvements

### Real-time Audio Processing
- Robust WAV parsing with proper header validation
- Support for multiple audio formats (8-bit, 16-bit, 32-bit)
- Enhanced error handling with detailed logging
- Multiple fallback mechanisms for audio conversion
- Stereo to mono conversion for multi-channel audio

### Speaker Formatting
- Color-coded speaker names using ANSI escape codes
- Line breaks between different speakers for clarity
- Proper grouping of consecutive segments from same speaker

### Data Persistence
- Automatic saving of session data to localStorage
- Data restoration across page refreshes
- 24-hour data expiration for privacy
- Manual clear functions for user control

### Testing and Documentation
- Comprehensive test scripts for all features
- Detailed testing guide (TESTING_GUIDE.md)
- Updated documentation and user guides