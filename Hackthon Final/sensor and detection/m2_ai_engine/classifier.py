class SeverityClassifier:
    def classify(self, speed_kmh: float, impact_g: float) -> str:
        """
        Rule-based logic for crash severity:
        - speed > 60 AND G > 3 = severe
        - speed 30-60 AND G 2-3 = moderate
        - else minor
        """
        if speed_kmh > 60 and impact_g > 3.0:
            return "severe"
        elif 30 <= speed_kmh <= 60 and 2.0 <= impact_g <= 3.0:
            return "moderate"
        
        # We can expand rules lightly to be more realistic, e.g.
        # speed > 80 and G > 2 -> severe
        if speed_kmh > 80 and impact_g > 2.0:
            return "severe"
        elif impact_g > 3.0:
            return "moderate" # Even slow, high G is moderate
            
        return "minor"
