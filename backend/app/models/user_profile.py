from pydantic import BaseModel
from typing import List, Optional

class UserProfile(BaseModel):
    name: str
    email: Optional[str] = None
    role: Optional[str] = None
    team: Optional[str] = None
    projects: Optional[List[str]] = []
    skills: Optional[List[str]] = []
    keywords: Optional[List[str]] = []  # Custom keywords to alert on