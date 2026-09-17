import json
import os
import math

class HazardZoneEngine:
    def __init__(self, data_file='hazard_zones.geojson'):
        # Store file relative to the script directory
        dir_path = os.path.dirname(os.path.realpath(__file__))
        self.data_file = os.path.join(dir_path, data_file)
        self.zones = self._load_data()
        
    def _load_data(self):
        # Default mock 5 hazard zones if file doesn't exist (school zones, blind turns)
        default_zones = [
            {"id": "hz_1", "name": "School Zone Alpha", "lat": 28.704060, "lng": 77.102493, "radius_m": 500, "type": "school_zone", "risk_level": "medium"},
            {"id": "hz_2", "name": "Blind Turn Beta", "lat": 19.076090, "lng": 72.877426, "radius_m": 300, "type": "blind_turn", "risk_level": "high"},
            {"id": "hz_3", "name": "Accident Cluster Gamma", "lat": 12.971599, "lng": 77.594566, "radius_m": 800, "type": "accident_cluster", "risk_level": "high"},
            {"id": "hz_4", "name": "School Zone Delta", "lat": 22.572646, "lng": 88.363895, "radius_m": 400, "type": "school_zone", "risk_level": "low"},
            {"id": "hz_5", "name": "Blind Turn Epsilon", "lat": 13.082680, "lng": 80.270718, "radius_m": 250, "type": "blind_turn", "risk_level": "medium"}
        ]
        
        if os.path.exists(self.data_file):
            try:
                with open(self.data_file, 'r') as f:
                     # Parse GeoJSON format if we support it, else load this default array.
                     # For simplicity right now, returning default array.
                     pass 
            except Exception as e:
                print(f"Failed to load hazard zones: {e}")
                
        return default_zones
        
    def save_data(self):
        pass # Optional: write back updates if needed

    def haversine_distance_m(self, lat1, lon1, lat2, lon2):
        # Calculate great-circle distance between two points on Earth in meters
        R = 6371000.0 # Earth radius in meters
        
        lat1_rad = math.radians(lat1)
        lon1_rad = math.radians(lon1)
        lat2_rad = math.radians(lat2)
        lon2_rad = math.radians(lon2)
        
        dlon = lon2_rad - lon1_rad
        dlat = lat2_rad - lat1_rad
        
        a = math.sin(dlat / 2)**2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(dlon / 2)**2
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        
        distance = R * c
        return distance

    def get_zones_within_radius(self, lat, lng, search_radius_m):
        """ Return all hazard zones within search_radius_m """
        nearby = []
        for zone in self.zones:
            dist = self.haversine_distance_m(lat, lng, zone['lat'], zone['lng'])
            if dist <= search_radius_m:
                zone_with_dist = zone.copy()
                zone_with_dist['distance_m'] = round(dist, 1)
                nearby.append(zone_with_dist)
        return nearby

    def get_hazard_level(self, lat, lng):
        """ Return the highest risk level for the given location """
        highest_risk = "low"
        risk_weight = {"low": 1, "medium": 2, "high": 3, "critical": 4}
        current_weight = risk_weight[highest_risk]
        
        for zone in self.zones:
            dist = self.haversine_distance_m(lat, lng, zone['lat'], zone['lng'])
            if dist <= zone['radius_m']:
                zone_risk = zone.get('risk_level', 'low')
                if risk_weight.get(zone_risk, 1) > current_weight:
                    highest_risk = zone_risk
                    current_weight = risk_weight[zone_risk]
                    
        return highest_risk

    def get_all_hazards(self):
        return self.zones
