import logging
import os
import time
from datetime import datetime
from typing import Dict, Any, Optional
import json
import threading
from collections import deque

class MeetingLogger:
    """Enhanced logging system for meeting audio processing with real-time CMD output."""
    
    def __init__(self, log_dir: str = "logs"):
        """Initialize the meeting logger with both file and console output."""
        self.log_dir = log_dir
        self.ensure_log_directory()
        
        # Setup main logger
        self.logger = logging.getLogger("MeetingProcessor")
        self.logger.setLevel(logging.INFO)
        
        # Clear any existing handlers
        self.logger.handlers.clear()
        
        # Setup console handler for real-time CMD output
        self.setup_console_handler()
        
        # Setup file handler for persistent logging
        self.setup_file_handler()
        
        # Meeting session tracking
        self.active_sessions = {}
        self.session_stats = {}
        
        # Real-time event buffer for WebSocket broadcasting
        self.event_buffer = deque(maxlen=1000)
        self.buffer_lock = threading.Lock()
        
        self.logger.info("🚀 Meeting Logger initialized successfully")
    
    def ensure_log_directory(self):
        """Create log directory if it doesn't exist."""
        if not os.path.exists(self.log_dir):
            os.makedirs(self.log_dir)
    
    def setup_console_handler(self):
        """Setup enhanced console handler with colored output."""
        console_handler = logging.StreamHandler()
        console_handler.setLevel(logging.INFO)
        
        # Enhanced formatter with colors and emojis for better visibility
        class ColoredFormatter(logging.Formatter):
            """Custom formatter with colors and emojis."""
            
            # Color codes
            COLORS = {
                'DEBUG': '\033[36m',    # Cyan
                'INFO': '\033[32m',     # Green
                'WARNING': '\033[33m',  # Yellow
                'ERROR': '\033[31m',    # Red
                'CRITICAL': '\033[35m', # Magenta
                'RESET': '\033[0m'      # Reset
            }
            
            # Emojis for different log types
            EMOJIS = {
                'DEBUG': '🔍',
                'INFO': '📝',
                'WARNING': '⚠️',
                'ERROR': '❌',
                'CRITICAL': '🚨'
            }
            
            def format(self, record):
                # Add color and emoji
                color = self.COLORS.get(record.levelname, self.COLORS['RESET'])
                emoji = self.EMOJIS.get(record.levelname, '📝')
                reset = self.COLORS['RESET']
                
                # Enhanced format with timestamp and emoji
                timestamp = datetime.now().strftime("%H:%M:%S")
                formatted = f"{color}[{timestamp}] {emoji} {record.levelname}{reset}: {record.getMessage()}"
                
                return formatted
        
        console_handler.setFormatter(ColoredFormatter())
        self.logger.addHandler(console_handler)
    
    def setup_file_handler(self):
        """Setup file handler for persistent logging."""
        # Daily log file
        log_filename = f"meeting_processor_{datetime.now().strftime('%Y%m%d')}.log"
        log_filepath = os.path.join(self.log_dir, log_filename)
        
        file_handler = logging.FileHandler(log_filepath, encoding='utf-8')
        file_handler.setLevel(logging.DEBUG)
        
        # Detailed formatter for file logging
        file_formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(funcName)s:%(lineno)d - %(message)s'
        )
        file_handler.setFormatter(file_formatter)
        self.logger.addHandler(file_handler)
    
    def start_meeting_session(self, meeting_id: str, participants: Optional[list] = None) -> str:
        """Start a new meeting session with detailed logging."""
        session_start_time = datetime.now()
        
        self.active_sessions[meeting_id] = {
            "start_time": session_start_time,
            "participants": participants or [],
            "audio_chunks_processed": 0,
            "transcription_events": 0,
            "summary_events": 0,
            "total_processing_time": 0.0,
            "errors": 0,
            "warnings": 0
        }
        
        self.session_stats[meeting_id] = {
            "total_audio_duration": 0.0,
            "total_transcribed_words": 0,
            "average_chunk_size": 0,
            "processing_efficiency": 0.0
        }
        
        # Create session-specific log file
        session_log_file = os.path.join(
            self.log_dir, 
            f"session_{meeting_id}_{session_start_time.strftime('%Y%m%d_%H%M%S')}.log"
        )
        
        self.logger.info(f"🎬 MEETING SESSION STARTED")
        self.logger.info(f"📋 Meeting ID: {meeting_id}")
        self.logger.info(f"⏰ Start Time: {session_start_time.strftime('%Y-%m-%d %H:%M:%S')}")
        self.logger.info(f"👥 Participants: {len(participants or [])} participants")
        self.logger.info(f"📄 Session Log: {session_log_file}")
        self.logger.info("=" * 60)
        
        # Add to event buffer
        self.add_event("session_start", {
            "meeting_id": meeting_id,
            "start_time": session_start_time.isoformat(),
            "participants": participants or []
        })
        
        return session_log_file
    
    def log_audio_chunk_processing(self, meeting_id: str, chunk_info: Dict[str, Any]):
        """Log audio chunk processing with detailed metrics."""
        if meeting_id not in self.active_sessions:
            self.logger.warning(f"⚠️ No active session found for meeting {meeting_id}")
            return
        
        session = self.active_sessions[meeting_id]
        session["audio_chunks_processed"] += 1
        
        chunk_size = chunk_info.get("size_bytes", 0)
        processing_time = chunk_info.get("processing_time", 0)
        
        session["total_processing_time"] += processing_time
        
        # Update statistics
        stats = self.session_stats[meeting_id]
        stats["average_chunk_size"] = (
            (stats["average_chunk_size"] * (session["audio_chunks_processed"] - 1) + chunk_size) 
            / session["audio_chunks_processed"]
        )
        
        self.logger.info(f"🎵 Audio Chunk #{session['audio_chunks_processed']} processed")
        self.logger.info(f"   📦 Size: {chunk_size} bytes")
        self.logger.info(f"   ⏱️ Processing: {processing_time:.3f}s")
        
        # Add to event buffer
        self.add_event("audio_chunk", {
            "meeting_id": meeting_id,
            "chunk_number": session["audio_chunks_processed"],
            "chunk_info": chunk_info
        })
    
    def log_transcription_result(self, meeting_id: str, transcription_data: Dict[str, Any]):
        """Log transcription results with quality metrics."""
        if meeting_id not in self.active_sessions:
            self.logger.warning(f"⚠️ No active session found for meeting {meeting_id}")
            return
        
        session = self.active_sessions[meeting_id]
        session["transcription_events"] += 1
        
        text = transcription_data.get("text", "")
        language = transcription_data.get("language", "unknown")
        processing_time = transcription_data.get("processing_time", 0)
        confidence = transcription_data.get("confidence", "N/A")
        
        # Update word count
        word_count = len(text.split()) if text else 0
        self.session_stats[meeting_id]["total_transcribed_words"] += word_count
        
        if text.strip():
            self.logger.info(f"🗣️ TRANSCRIPTION #{session['transcription_events']}")
            self.logger.info(f"   🌐 Language: {language}")
            self.logger.info(f"   📝 Words: {word_count}")
            self.logger.info(f"   ⏱️ Time: {processing_time:.3f}s")
            self.logger.info(f"   🎯 Confidence: {confidence}")
            self.logger.info(f"   💬 Text: \"{text[:100]}{'...' if len(text) > 100 else ''}\"")
        else:
            self.logger.debug(f"🔇 Silent chunk #{session['transcription_events']} - no speech detected")
        
        # Add to event buffer
        self.add_event("transcription", {
            "meeting_id": meeting_id,
            "event_number": session["transcription_events"],
            "transcription_data": transcription_data
        })
    
    def log_summary_generation(self, meeting_id: str, summary_data: Dict[str, Any]):
        """Log summary generation with detailed breakdown."""
        if meeting_id not in self.active_sessions:
            self.logger.warning(f"⚠️ No active session found for meeting {meeting_id}")
            return
        
        session = self.active_sessions[meeting_id]
        session["summary_events"] += 1
        
        self.logger.info(f"📊 SUMMARY GENERATION #{session['summary_events']}")
        self.logger.info(f"   📝 Summary: {summary_data.get('summary', 'N/A')[:150]}...")
        
        key_points = summary_data.get('key_points', [])
        if key_points:
            self.logger.info(f"   🔑 Key Points ({len(key_points)}):")
            for i, point in enumerate(key_points[:3], 1):
                self.logger.info(f"      {i}. {point[:80]}{'...' if len(point) > 80 else ''}")
        
        action_items = summary_data.get('action_items', [])
        if action_items:
            self.logger.info(f"   ✅ Action Items ({len(action_items)}):")
            for i, item in enumerate(action_items[:3], 1):
                self.logger.info(f"      {i}. {item[:80]}{'...' if len(item) > 80 else ''}")
        
        processing_time = summary_data.get('processing_time', 0)
        self.logger.info(f"   ⏱️ Generation Time: {processing_time:.3f}s")
        
        # Add to event buffer
        self.add_event("summary", {
            "meeting_id": meeting_id,
            "event_number": session["summary_events"],
            "summary_data": summary_data
        })
    
    def log_error(self, meeting_id: str, error_type: str, error_message: str, context: Dict[str, Any] = None):
        """Log errors with context information."""
        if meeting_id in self.active_sessions:
            self.active_sessions[meeting_id]["errors"] += 1
        
        self.logger.error(f"❌ ERROR in {error_type}")
        self.logger.error(f"   🆔 Meeting: {meeting_id}")
        self.logger.error(f"   💥 Message: {error_message}")
        
        if context:
            self.logger.error(f"   📋 Context: {json.dumps(context, indent=2)}")
        
        # Add to event buffer
        self.add_event("error", {
            "meeting_id": meeting_id,
            "error_type": error_type,
            "error_message": error_message,
            "context": context or {}
        })
    
    def log_warning(self, meeting_id: str, warning_type: str, warning_message: str):
        """Log warnings with meeting context."""
        if meeting_id in self.active_sessions:
            self.active_sessions[meeting_id]["warnings"] += 1
        
        self.logger.warning(f"⚠️ WARNING: {warning_type}")
        self.logger.warning(f"   🆔 Meeting: {meeting_id}")
        self.logger.warning(f"   📝 Message: {warning_message}")
        
        # Add to event buffer
        self.add_event("warning", {
            "meeting_id": meeting_id,
            "warning_type": warning_type,
            "warning_message": warning_message
        })
    
    def log_system_performance(self, performance_data: Dict[str, Any]):
        """Log system performance metrics."""
        self.logger.info(f"⚡ SYSTEM PERFORMANCE UPDATE")
        self.logger.info(f"   🖥️ CPU Usage: {performance_data.get('cpu_percent', 'N/A')}%")
        self.logger.info(f"   💾 Memory: {performance_data.get('memory_mb', 'N/A')} MB")
        self.logger.info(f"   🎮 GPU Usage: {performance_data.get('gpu_percent', 'N/A')}%")
        self.logger.info(f"   📊 Active Sessions: {len(self.active_sessions)}")
        
        # Add to event buffer
        self.add_event("performance", {
            "performance_data": performance_data,
            "active_sessions": len(self.active_sessions)
        })
    
    def end_meeting_session(self, meeting_id: str) -> Dict[str, Any]:
        """End a meeting session and generate summary report."""
        if meeting_id not in self.active_sessions:
            self.logger.warning(f"⚠️ No active session found for meeting {meeting_id}")
            return {}
        
        session = self.active_sessions[meeting_id]
        stats = self.session_stats[meeting_id]
        
        end_time = datetime.now()
        duration = end_time - session["start_time"]
        
        # Calculate efficiency metrics
        if session["audio_chunks_processed"] > 0:
            avg_processing_time = session["total_processing_time"] / session["audio_chunks_processed"]
            stats["processing_efficiency"] = avg_processing_time
        
        self.logger.info("🏁 MEETING SESSION ENDED")
        self.logger.info("=" * 60)
        self.logger.info(f"📋 Meeting ID: {meeting_id}")
        self.logger.info(f"⏰ Duration: {duration}")
        self.logger.info(f"🎵 Audio Chunks: {session['audio_chunks_processed']}")
        self.logger.info(f"🗣️ Transcriptions: {session['transcription_events']}")
        self.logger.info(f"📊 Summaries: {session['summary_events']}")
        self.logger.info(f"💬 Total Words: {stats['total_transcribed_words']}")
        self.logger.info(f"⚡ Avg Processing: {stats['processing_efficiency']:.3f}s/chunk")
        self.logger.info(f"⚠️ Warnings: {session['warnings']}")
        self.logger.info(f"❌ Errors: {session['errors']}")
        self.logger.info("=" * 60)
        
        # Create session summary
        session_summary = {
            "meeting_id": meeting_id,
            "start_time": session["start_time"].isoformat(),
            "end_time": end_time.isoformat(),
            "duration_seconds": duration.total_seconds(),
            "statistics": {**session, **stats},
            "participants": session.get("participants", [])
        }
        
        # Save session summary to file
        summary_file = os.path.join(
            self.log_dir,
            f"summary_{meeting_id}_{session['start_time'].strftime('%Y%m%d_%H%M%S')}.json"
        )
        
        try:
            with open(summary_file, 'w', encoding='utf-8') as f:
                json.dump(session_summary, f, indent=2, default=str)
            self.logger.info(f"💾 Session summary saved: {summary_file}")
        except Exception as e:
            self.logger.error(f"❌ Failed to save session summary: {e}")
        
        # Add to event buffer
        self.add_event("session_end", {
            "meeting_id": meeting_id,
            "session_summary": session_summary
        })
        
        # Cleanup
        del self.active_sessions[meeting_id]
        del self.session_stats[meeting_id]
        
        return session_summary
    
    def add_event(self, event_type: str, event_data: Dict[str, Any]):
        """Add event to buffer for real-time monitoring."""
        with self.buffer_lock:
            event = {
                "timestamp": datetime.now().isoformat(),
                "type": event_type,
                "data": event_data
            }
            self.event_buffer.append(event)
    
    def get_recent_events(self, count: int = 50) -> list:
        """Get recent events from buffer."""
        with self.buffer_lock:
            return list(self.event_buffer)[-count:]
    
    def get_active_sessions_status(self) -> Dict[str, Any]:
        """Get status of all active sessions."""
        status = {}
        for meeting_id, session in self.active_sessions.items():
            duration = datetime.now() - session["start_time"]
            status[meeting_id] = {
                "duration_seconds": duration.total_seconds(),
                "chunks_processed": session["audio_chunks_processed"],
                "transcriptions": session["transcription_events"],
                "summaries": session["summary_events"],
                "errors": session["errors"],
                "warnings": session["warnings"]
            }
        return status
    
    def cleanup(self):
        """Cleanup logger resources."""
        try:
            # End all active sessions
            for meeting_id in list(self.active_sessions.keys()):
                self.end_meeting_session(meeting_id)
            
            # Close all handlers
            for handler in self.logger.handlers:
                handler.close()
            
            self.logger.info("🧹 Meeting Logger cleanup completed")
        except Exception as e:
            print(f"❌ Logger cleanup failed: {e}")


# Global logger instance
meeting_logger = MeetingLogger()