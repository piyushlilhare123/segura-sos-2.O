import random

class SeverityClassifier:
    def __init__(self):
        # A simple rule-based model as fallback since we want it lightweight
        pass

    def classify(self, speed: float, g_force: float, severity_hint: str, confidence_score: float) -> str:
        """
        Classifies the severity into: Minor, Moderate, Severe
        """
        # Features that indicate severity:
        # - High speed (> 80km/h) + High G-force (> 3.0g) -> Severe
        # - Moderate speed (40-80) + Moderate G-force (1.5-3.0) -> Moderate
        # - Otherwise, Minor
        
        # If severity_hint from M1 is explicit, consider it
        hint_weight = 0
        if severity_hint:
            hint_lower = severity_hint.lower()
            if hint_lower in ['high', 'severe']:
                hint_weight = 2
            elif hint_lower in ['medium', 'moderate']:
                hint_weight = 1
            
        score = 0
        
        # Speed evaluation
        if speed > 80:
            score += 3
        elif speed > 40:
            score += 1
            
        # G-Force evaluation
        if g_force > 4.0:
            score += 3
        elif g_force > 2.0:
            score += 1
            
        # Factor in confidence score from M1 sensor engine
        if confidence_score > 0.8:
            score += 1  # Bonus point for high confidence of a crash
            
        score += hint_weight
        
        if score >= 6:
            return "severe"
        elif score >= 3:
            return "moderate"
        else:
            return "minor"
