import json
import os
from typing import Dict, List, Optional
from app.models.user_profile import UserProfile

class UserProfileService:
    def __init__(self, profile_file: str = "user_profile.json"):
        self.profile_file = profile_file
        self.profile: Optional[UserProfile] = None
        self.load_profile()
    
    def load_profile(self) -> bool:
        """Load user profile from file if it exists"""
        if os.path.exists(self.profile_file):
            try:
                with open(self.profile_file, 'r') as f:
                    data = json.load(f)
                    self.profile = UserProfile(**data)
                return True
            except Exception as e:
                print(f"Error loading profile: {e}")
                return False
        return False
    
    def save_profile(self, profile: UserProfile) -> bool:
        """Save user profile to file"""
        try:
            with open(self.profile_file, 'w') as f:
                json.dump(profile.dict(), f, indent=2)
            self.profile = profile
            return True
        except Exception as e:
            print(f"Error saving profile: {e}")
            return False
    
    def create_profile(self, name: str, **kwargs) -> UserProfile:
        """Create a new user profile"""
        profile_data = {"name": name, **kwargs}
        profile = UserProfile(**profile_data)
        self.save_profile(profile)
        return profile
    
    def update_profile(self, **kwargs) -> Optional[UserProfile]:
        """Update existing profile with new data"""
        if not self.profile:
            return None
        
        # Update profile fields
        profile_data = self.profile.dict()
        profile_data.update(kwargs)
        
        updated_profile = UserProfile(**profile_data)
        self.save_profile(updated_profile)
        return updated_profile
    
    def get_profile(self) -> Optional[UserProfile]:
        """Get current user profile"""
        return self.profile
    
    def get_alert_keywords(self) -> List[str]:
        """Get all keywords that should trigger alerts"""
        if not self.profile:
            return []
        
        keywords = []
        
        # Add user's name variations
        name_parts = self.profile.name.split()
        keywords.extend(name_parts)  # First name, last name, etc.
        keywords.append(self.profile.name)  # Full name
        
        # Add custom keywords
        if self.profile.keywords:
            keywords.extend(self.profile.keywords)
        
        # Add role/team if specified
        if self.profile.role:
            keywords.append(self.profile.role)
        if self.profile.team:
            keywords.append(self.profile.team)
        
        # Add projects
        if self.profile.projects:
            keywords.extend(self.profile.projects)
        
        # Add skills
        if self.profile.skills:
            keywords.extend(self.profile.skills)
        
        # Remove duplicates and convert to lowercase for matching
        return list(set([kw.lower() for kw in keywords]))