from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends, WebSocket, Request
from fastapi.responses import JSONResponse, FileResponse
from slowapi import Limiter
from slowapi.util import get_remote_address
import os
import tempfile
import uuid
import json
import time
import asyncio
from typing import Optional
from app.models.schemas import AudioFileRequest, TranscriptionResponse, SummaryRequest, SummaryResponse
from app.models.user_profile import UserProfile
from app.services.optimized_audio_processor import OptimizedAudioProcessor
from app.services.summarizer import Summarizer
from app.services.user_profile import UserProfileService
from app.services.meeting_logger import meeting_logger
from app.api.websocket import manager

# Initialize rate limiter
limiter = Limiter(key_func=get_remote_address)

# Initialize services with optimizations
try:
    audio_processor = OptimizedAudioProcessor(model_size="auto")
except Exception as e:
    # Fallback to original processor if optimized version fails
    print(f"Failed to load optimized processor: {e}")
    from app.services.audio_processor import AudioProcessor
    audio_processor = AudioProcessor()
    
summarizer = Summarizer()
user_profile_service = UserProfileService()

# Create router
router = APIRouter()

@router.post("/start-meeting-session")
@limiter.limit("50/minute")
async def start_meeting_session(request: Request, meeting_id: str = Form(...), participants: str = Form(None)):
    """
    Start a new meeting session with logging.
    
    Args:
        meeting_id: ID of the meeting
        participants: JSON string of participants list (optional)
        
    Returns:
        Session start confirmation
    """
    try:
        participants_list = []
        if participants:
            import json
            participants_list = json.loads(participants)
        
        log_file = meeting_logger.start_meeting_session(meeting_id, participants_list)
        
        # Broadcast session start to connected clients
        await manager.broadcast(meeting_id, {
            "type": "session_start",
            "meeting_id": meeting_id,
            "participants": participants_list,
            "log_file": log_file
        })
        
        return JSONResponse(content={
            "status": "success",
            "meeting_id": meeting_id,
            "log_file": log_file,
            "message": "Meeting session started successfully"
        })
    except Exception as e:
        meeting_logger.log_error(meeting_id, "session_start", str(e))
        raise HTTPException(status_code=500, detail=f"Failed to start meeting session: {str(e)}")

@router.post("/end-meeting-session")
@limiter.limit("50/minute")
async def end_meeting_session(request: Request, meeting_id: str = Form(...)):
    """
    End a meeting session and generate summary report.
    
    Args:
        meeting_id: ID of the meeting
        
    Returns:
        Session summary report
    """
    try:
        session_summary = meeting_logger.end_meeting_session(meeting_id)
        
        # Broadcast session end to connected clients
        await manager.broadcast(meeting_id, {
            "type": "session_end",
            "meeting_id": meeting_id,
            "session_summary": session_summary
        })
        
        # Clean up accumulated transcripts
        if meeting_id in meeting_transcripts:
            del meeting_transcripts[meeting_id]
        
        return JSONResponse(content={
            "status": "success",
            "session_summary": session_summary,
            "message": "Meeting session ended successfully"
        })
    except Exception as e:
        meeting_logger.log_error(meeting_id, "session_end", str(e))
        raise HTTPException(status_code=500, detail=f"Failed to end meeting session: {str(e)}")

@router.get("/meeting-status/{meeting_id}")
async def get_meeting_status(meeting_id: str):
    """
    Get status of a specific meeting session.
    
    Args:
        meeting_id: ID of the meeting
        
    Returns:
        Meeting session status
    """
    try:
        active_sessions = meeting_logger.get_active_sessions_status()
        
        if meeting_id in active_sessions:
            session_status = active_sessions[meeting_id]
            performance_stats = audio_processor.get_performance_stats() if hasattr(audio_processor, 'get_performance_stats') else {}
            
            return JSONResponse(content={
                "status": "active",
                "meeting_id": meeting_id,
                "session_status": session_status,
                "performance_stats": performance_stats
            })
        else:
            return JSONResponse(content={
                "status": "inactive",
                "meeting_id": meeting_id,
                "message": "No active session found"
            })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get meeting status: {str(e)}")

@router.get("/system-performance")
async def get_system_performance():
    """
    Get current system performance metrics.
    
    Returns:
        System performance data
    """
    try:
        import psutil
        
        # Get system metrics
        performance_data = {
            "cpu_percent": psutil.cpu_percent(interval=1),
            "memory_mb": psutil.virtual_memory().used / (1024**2),
            "memory_percent": psutil.virtual_memory().percent,
            "active_meetings": len(meeting_logger.get_active_sessions_status())
        }
        
        # Add GPU metrics if available
        if hasattr(audio_processor, 'get_performance_stats'):
            audio_stats = audio_processor.get_performance_stats()
            performance_data.update(audio_stats)
        
        # Log system performance
        meeting_logger.log_system_performance(performance_data)
        
        return JSONResponse(content=performance_data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get system performance: {str(e)}")

@router.post("/transcribe", response_model=TranscriptionResponse)
@limiter.limit("10/minute")
async def transcribe_audio_file(request: Request, file: UploadFile = File(...), language: str = Form(None)):
    """
    Transcribe an uploaded audio file.
    
    Args:
        file: Audio file to transcribe
        language: Language of the audio (optional)
        
    Returns:
        Transcription result
    """
    # Create a temporary file to save the uploaded audio
    with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(file.filename)[1]) as temp_file:
        temp_file.write(await file.read())
        temp_file_path = temp_file.name
    
    try:
        # Process the audio file
        result = audio_processor.transcribe_audio_file(temp_file_path, language)
        
        # Clean up temporary file
        os.unlink(temp_file_path)
        
        return JSONResponse(content={
            "text": result["text"],
            "language": result["language"]
        })
    except Exception as e:
        # Clean up temporary file in case of error
        if os.path.exists(temp_file_path):
            os.unlink(temp_file_path)
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")

@router.post("/summarize", response_model=SummaryResponse)
@limiter.limit("20/minute")
async def summarize_text(request: Request, request_data: SummaryRequest):
    """
    Summarize text and extract key points using Groq.
    
    Args:
        request: Summary request containing text and meeting ID
        
    Returns:
        Summary result
    """
    try:
        # Generate summary using Groq
        result = summarizer.summarize_text(request.text, request.meeting_id)
        
        # Broadcast the summary to all connected clients in the meeting
        await manager.broadcast(request.meeting_id, {
            "type": "summary",
            "meeting_id": request.meeting_id,
            "data": result
        })
        
        return JSONResponse(content=result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Summarization failed: {str(e)}")

@router.post("/process-audio")
async def process_audio_and_summarize(file: UploadFile = File(...), language: str = Form(None), meeting_id: str = Form(...)):
    """
    Process an audio file and generate summary.
    
    Args:
        file: Audio file to process
        language: Language of the audio (optional)
        meeting_id: ID of the meeting
        
    Returns:
        Combined transcription and summary result
    """
    # Create a temporary file to save the uploaded audio
    with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(file.filename)[1]) as temp_file:
        temp_file.write(await file.read())
        temp_file_path = temp_file.name
    
    try:
        # Record start time for processing
        import time
        start_time = time.time()
        
        # Send progress update - starting transcription
        await manager.broadcast(meeting_id, {
            "type": "progress",
            "meeting_id": meeting_id,
            "status": "transcribing",
            "message": "Starting audio transcription..."
        })
        
        # Process the audio file
        transcription_start = time.time()
        transcription_result = audio_processor.transcribe_audio_file(temp_file_path, language)
        transcription_time = time.time() - transcription_start
        
        # Send progress update - transcription complete
        await manager.broadcast(meeting_id, {
            "type": "progress",
            "meeting_id": meeting_id,
            "status": "transcribed",
            "message": f"Audio transcription complete ({transcription_time:.2f}s). Generating summary..."
        })
        
        # Generate summary using Groq
        summary_start = time.time()
        summary_result = summarizer.summarize_text(transcription_result["text"], meeting_id)
        summary_time = time.time() - summary_start
        
        # Calculate total processing time
        total_time = time.time() - start_time
        
        # Add timing information to the result
        if isinstance(summary_result, dict):
            summary_result["processing_times"] = {
                "transcription_time": round(transcription_time, 2),
                "summary_time": round(summary_time, 2),
                "total_time": round(total_time, 2)
            }
        
        # Send progress update - summary complete
        await manager.broadcast(meeting_id, {
            "type": "progress",
            "meeting_id": meeting_id,
            "status": "summarized",
            "message": f"Summary generation complete ({summary_time:.2f}s). Total processing time: {total_time:.2f}s"
        })
        
        # Clean up temporary file
        os.unlink(temp_file_path)
        
        # Broadcast the result to all connected clients in the meeting
        await manager.broadcast(meeting_id, {
            "type": "transcription_summary",
            "meeting_id": meeting_id,
            "transcription": transcription_result["text"],
            "speaker_formatted_text": transcription_result.get("speaker_formatted_text", ""),
            "summary": summary_result
        })
        
        return JSONResponse(content={
            "transcription": transcription_result["text"],
            "speaker_formatted_text": transcription_result.get("speaker_formatted_text", ""),
            "language": transcription_result["language"],
            "summary": summary_result
        })
    except Exception as e:
        # Clean up temporary file in case of error
        if os.path.exists(temp_file_path):
            os.unlink(temp_file_path)
        
        # Send error update
        await manager.broadcast(meeting_id, {
            "type": "progress",
            "meeting_id": meeting_id,
            "status": "error",
            "message": f"Processing failed: {str(e)}"
        })
        
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")

# Keep track of processing chunks to avoid overwhelming the system
processing_chunks = set()

# Store accumulated transcripts for summarization
meeting_transcripts = {}

@router.post("/process-audio-chunk")
@limiter.limit("30/minute")
async def process_audio_chunk(request: Request, chunk: UploadFile = File(...), meeting_id: str = Form(...), language: str = Form(None)):
    """
    Process a real-time audio chunk with enhanced logging and optimization.
    
    Args:
        chunk: Audio chunk to process
        meeting_id: ID of the meeting
        language: Language of the audio (optional, defaults to English)
        
    Returns:
        Transcription result for the chunk
    """
    # Force English language for all transcriptions
    language = "en"
    
    chunk_id = f"{meeting_id}_{hash(chunk.filename) % 10000}" if chunk.filename else meeting_id
    
    # Log information about the received chunk
    meeting_logger.logger.info(f"📥 Received audio chunk for meeting {meeting_id} (ID: {chunk_id})")
    meeting_logger.logger.info(f"📄 Chunk filename: {chunk.filename}")
    meeting_logger.logger.info(f"📦 Chunk content type: {chunk.content_type}")
    
    # Simple rate limiting to prevent overwhelming the system
    if chunk_id in processing_chunks:
        meeting_logger.log_warning(meeting_id, "rate_limiting", f"Skipping chunk {chunk_id} - already processing")
        return JSONResponse(content={
            "text": "",
            "language": language or "en",
            "timestamp": time.time(),
            "message": "Rate limited"
        })
    
    processing_chunks.add(chunk_id)
    
    try:
        meeting_logger.logger.info(f"🎵 Processing audio chunk for meeting {meeting_id} (ID: {chunk_id})")
        
        # Read the audio chunk
        audio_data = await chunk.read()
        meeting_logger.logger.info(f"📏 Audio data size: {len(audio_data)} bytes")
        
        # Log first few bytes for debugging
        if len(audio_data) > 0:
            meeting_logger.logger.info(f"🔍 First 20 bytes of audio data: {audio_data[:20]}")
        
        chunk_info = {
            "chunk_id": chunk_id,
            "size_bytes": len(audio_data),
            "filename": chunk.filename
        }
        
        meeting_logger.log_audio_chunk_processing(meeting_id, chunk_info)
        
        # Early return for very small chunks
        if len(audio_data) < 100:
            meeting_logger.log_warning(meeting_id, "small_chunk", "Audio chunk too small, likely silence or empty")
            return JSONResponse(content={
                "text": "",
                "language": language or "en",
                "timestamp": time.time(),
                "message": "Audio chunk too small"
            })
        
        # Process the audio chunk with optimized processor
        start_time = time.time()
        try:
            result = audio_processor.transcribe_chunk(audio_data, language)
            meeting_logger.logger.info(f"✅ Audio chunk transcription completed successfully")
        except Exception as e:
            meeting_logger.logger.error(f"❌ Audio processor failed: {e}")
            import traceback
            meeting_logger.logger.error(f"Full traceback: {traceback.format_exc()}")
            raise
        processing_time = time.time() - start_time
        
        # Add processing time to result
        result["processing_time"] = round(processing_time, 3)
        
        # Log transcription result with actual text
        meeting_logger.log_transcription_result(meeting_id, result)
        
        # ENHANCED LOGGING: Show actual transcribed text in logs
        if result["text"].strip():
            meeting_logger.logger.info(f"💬 TRANSCRIPT: \"{result['text']}\" (Language: {result.get('language', 'unknown')})")
        else:
            meeting_logger.logger.info(f"🔇 No speech detected in audio chunk")
        
        # If we have meaningful transcription, broadcast it
        if result["text"].strip():
            meeting_logger.logger.info(f"📢 Broadcasting transcription: {result['text'][:100]}...")
            
            # Broadcast the transcription to all connected clients in the meeting
            await manager.broadcast(meeting_id, {
                "type": "transcription",
                "meeting_id": meeting_id,
                "text": result["text"],
                "timestamp": result["timestamp"],
                "processing_time": result["processing_time"]
            })
            
            # Add to accumulated transcript for this meeting
            if meeting_id not in meeting_transcripts:
                meeting_transcripts[meeting_id] = []
            
            meeting_transcripts[meeting_id].append({
                "text": result["text"],
                "timestamp": result["timestamp"]
            })
            
            # Check if we should generate a summary
            accumulated_text = " ".join([item["text"] for item in meeting_transcripts[meeting_id]])
            if len(accumulated_text) > 300:  # Enough content for meaningful summary
                if len(meeting_transcripts[meeting_id]) % 5 == 0:
                    asyncio.create_task(generate_summary_async(accumulated_text, meeting_id))
        else:
            meeting_logger.logger.debug(f"🔇 No meaningful transcription found for chunk {chunk_id}")
        
        return JSONResponse(content=result)
        
    except Exception as e:
        meeting_logger.log_error(meeting_id, "chunk_processing", str(e), {
            "chunk_id": chunk_id,
            "chunk_size": len(audio_data) if 'audio_data' in locals() else 0
        })
        # Log the full traceback for debugging
        import traceback
        meeting_logger.logger.error(f"Full traceback for chunk processing error: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Chunk processing failed: {str(e)}")
    finally:
        # Remove from processing set
        processing_chunks.discard(chunk_id)

async def generate_summary_async(text: str, meeting_id: str):
    """
    Generate summary asynchronously and broadcast it.
    
    Args:
        text: Text to summarize
        meeting_id: ID of the meeting
    """
    try:
        # Generate summary using Groq
        result = summarizer.summarize_text(text, meeting_id)
        
        # Broadcast the summary to all connected clients in the meeting
        await manager.broadcast(meeting_id, {
            "type": "summary",
            "meeting_id": meeting_id,
            "data": result
        })
        
        print(f"Summary generated and broadcast for meeting {meeting_id}")
    except Exception as e:
        print(f"Error generating summary: {e}")
        # Send error update
        await manager.broadcast(meeting_id, {
            "type": "status",
            "meeting_id": meeting_id,
            "status": "error",
            "message": f"Summary generation failed: {str(e)}"
        })

@router.post("/user-profile")
async def create_user_profile(profile: UserProfile):
    """
    Create or update user profile.
    
    Args:
        profile: User profile data
        
    Returns:
        Updated user profile
    """
    try:
        if user_profile_service.save_profile(profile):
            return JSONResponse(content=profile.dict())
        else:
            raise HTTPException(status_code=500, detail="Failed to save profile")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Profile creation failed: {str(e)}")

@router.get("/user-profile")
async def get_user_profile():
    """
    Get current user profile.
    
    Returns:
        Current user profile
    """
    profile = user_profile_service.get_profile()
    if profile:
        return JSONResponse(content=profile.dict())
    else:
        raise HTTPException(status_code=404, detail="Profile not found")

def check_for_speaker_alerts(text: str, meeting_id: str):
    """
    Check transcription for keywords that might indicate the speaker is asking a question
    or directing attention to participants.
    """
    # Get user profile for personalized alerts
    profile = user_profile_service.get_profile()
    alert_keywords = user_profile_service.get_alert_keywords() if profile else []
    
    # General alert keywords
    general_keywords = [
        "can you", "could you", "would you", 
        "what do you", "how about you", "your thoughts",
        "any questions", "questions for you", "you should",
        "i need you", "i want you", "please"
    ]
    
    # Combine all keywords
    all_keywords = general_keywords + alert_keywords
    
    text_lower = text.lower()
    
    # Check for matches
    matched_keywords = []
    for keyword in all_keywords:
        # For better matching, we'll check for whole words and phrases
        if keyword in text_lower:
            matched_keywords.append(keyword)
        # Also check for word boundaries for single words
        elif len(keyword.split()) == 1 and f" {keyword} " in f" {text_lower} ":
            matched_keywords.append(keyword)
        elif len(keyword.split()) == 1 and text_lower.startswith(f"{keyword} "):
            matched_keywords.append(keyword)
        elif len(keyword.split()) == 1 and text_lower.endswith(f" {keyword}"):
            matched_keywords.append(keyword)
    
    if matched_keywords:
        # Determine alert type based on matched keywords
        is_personal = any(kw in matched_keywords for kw in alert_keywords)
        
        if is_personal:
            # Personal alert - user's name or info was mentioned
            alert_message = {
                "type": "speaker_alert",
                "alert_type": "personal",
                "meeting_id": meeting_id,
                "message": f"Speaker mentioned: {', '.join(matched_keywords)} - This may be directed at you!",
                "suggested_response": "Prepare to respond or take note of this request.",
                "matched_keywords": matched_keywords,
                "timestamp": float(int(time.time() * 1000)) / 1000
            }
        else:
            # General alert - generic question directed at participants
            alert_message = {
                "type": "speaker_alert",
                "alert_type": "general",
                "meeting_id": meeting_id,
                "message": f"Speaker may be directing a question to participants: '{matched_keywords[0]}'",
                "suggested_response": "Consider preparing a response or noting this question for follow-up.",
                "matched_keywords": matched_keywords,
                "timestamp": float(int(time.time() * 1000)) / 1000
            }
        
        # Broadcast the alert
        print(f"Broadcasting speaker alert: {alert_message}")
        asyncio.create_task(manager.broadcast(meeting_id, alert_message))

@router.get("/list-saved-audio")
async def list_saved_audio():
    """
    List all saved audio files with metadata.
    
    Returns:
        List of audio files with their information
    """
    try:
        # Define the directory where audio files are stored
        audio_dir = os.path.join(os.path.dirname(__file__), "..", "..", "saved_audio")
        
        # Create directory if it doesn't exist
        os.makedirs(audio_dir, exist_ok=True)
        
        audio_files = []
        
        # Scan for audio files
        for filename in os.listdir(audio_dir):
            if filename.lower().endswith(('.mp3', '.wav', '.m4a', '.ogg', '.flac')):
                file_path = os.path.join(audio_dir, filename)
                if os.path.isfile(file_path):
                    # Get file metadata
                    stat = os.stat(file_path)
                    file_size = stat.st_size
                    modified_time = stat.st_mtime
                    
                    # Format file size
                    if file_size < 1024:
                        size_str = f"{file_size} B"
                    elif file_size < 1024 * 1024:
                        size_str = f"{file_size / 1024:.1f} KB"
                    else:
                        size_str = f"{file_size / (1024 * 1024):.1f} MB"
                    
                    # Create display name
                    display_name = filename.replace('_', ' ').replace('.mp3', '').replace('.wav', '')
                    
                    audio_files.append({
                        "filename": filename,
                        "display_name": display_name,
                        "size": size_str,
                        "size_bytes": file_size,
                        "modified_time": modified_time
                    })
        
        # Sort by modification time (newest first)
        audio_files.sort(key=lambda x: x['modified_time'], reverse=True)
        
        return JSONResponse(content={
            "status": "success",
            "audio_files": audio_files,
            "count": len(audio_files)
        })
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list audio files: {str(e)}")

@router.get("/audio/{filename}")
async def serve_audio_file(filename: str):
    """
    Serve an audio file for playback or download.
    
    Args:
        filename: Name of the audio file to serve
        
    Returns:
        Audio file response
    """
    try:
        # Define the directory where audio files are stored
        audio_dir = os.path.join(os.path.dirname(__file__), "..", "..", "saved_audio")
        file_path = os.path.join(audio_dir, filename)
        
        # Security check - ensure the file is in the audio directory
        if not os.path.commonpath([audio_dir, file_path]) == audio_dir:
            raise HTTPException(status_code=400, detail="Invalid file path")
        
        # Check if file exists
        if not os.path.isfile(file_path):
            raise HTTPException(status_code=404, detail="Audio file not found")
        
        # Determine media type based on file extension
        media_type_map = {
            '.mp3': 'audio/mpeg',
            '.wav': 'audio/wav',
            '.m4a': 'audio/mp4',
            '.ogg': 'audio/ogg',
            '.flac': 'audio/flac'
        }
        
        file_ext = os.path.splitext(filename)[1].lower()
        media_type = media_type_map.get(file_ext, 'application/octet-stream')
        
        return FileResponse(
            path=file_path,
            media_type=media_type,
            filename=filename
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to serve audio file: {str(e)}")