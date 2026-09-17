class RiskEngine:
    def calculate_risk(self, speed_kmh: float, weather: str, road_type: str = "urban", speed_limit: float = 60.0) -> tuple[float, str, str]:
        """
        Inputs: speed_kmh, speed_limit (default 60), weather string, road_type (default "urban")
        Formula: score = (speed_kmh/speed_limit * 0.5) + weather_factor + road_factor
        weather_factor: clear=0, rain=0.4, fog=0.7
        road_factor: highway=0.1, urban=0.4, rural=0.7
        Clamp score to 0.0-1.0
        Returns (score, label, message)
        """
        # Weather factor
        w_factor = 0.0
        if weather == "rain":
            w_factor = 0.4
        elif weather == "fog":
            w_factor = 0.7
            
        # Road factor
        r_factor = 0.4 # urban default
        if road_type == "highway":
            r_factor = 0.1
        elif road_type == "rural":
            r_factor = 0.7
            
        score = (speed_kmh / speed_limit * 0.5) + w_factor + r_factor
        score = max(0.0, min(1.0, score)) # clamp
        
        # Determine label and message
        if score >= 0.8:
            label = "critical"
            msg = "Critical risk! Please reduce speed immediately."
        elif score >= 0.6:
            label = "high"
            msg = "High risk. Drive cautiously."
        elif score >= 0.4:
            label = "medium"
            msg = "Moderate risk conditions."
        else:
            label = "low"
            msg = "Safe driving conditions."
            
        return score, label, msg
