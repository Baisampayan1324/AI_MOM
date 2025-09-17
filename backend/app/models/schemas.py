from pydantic import BaseModel
from typing import Optional, List

class AudioFileRequest(BaseModel):
    filename: str
    language: Optional[str] = None

class TranscriptionResponse(BaseModel):
    text: str
    language: str

class SummaryRequest(BaseModel):
    text: str
    meeting_id: str

class SummaryResponse(BaseModel):
    summary: str
    key_points: List[str]
    action_items: List[str]

class MeetingUpdate(BaseModel):
    meeting_id: str
    text: str
    timestamp: float