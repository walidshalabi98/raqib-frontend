import { useMemo } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";

const GOVERNORATE_COORDS: Record<string, [number, number]> = {
  "Jenin": [32.4610, 35.2954],
  "Tubas": [32.3186, 35.3720],
  "Tulkarm": [32.3104, 35.0286],
  "Nablus": [32.2211, 35.2544],
  "Qalqilya": [32.1893, 34.9706],
  "Salfit": [32.0830, 35.1727],
  "Ramallah": [31.9038, 35.2034],
  "Jericho": [31.8667, 35.4500],
  "Jerusalem": [31.7683, 35.2137],
  "Bethlehem": [31.7054, 35.2024],
  "Hebron": [31.5326, 35.0998],
  "North Gaza": [31.5451, 34.4901],
  "Gaza": [31.5017, 34.4668],
  "Deir al-Balah": [31.4167, 34.3500],
  "Khan Yunis": [31.3462, 34.3061],
  "Rafah": [31.2969, 34.2452],
  "Gaza Strip": [31.4500, 34.4000],
  "West Bank": [31.9500, 35.2000],
  "Hebron Governorate": [31.5326, 35.0998],
  "Ramallah and Al-Bireh": [31.9038, 35.2034],
};

interface MapDataPoint {
  location: string;
  value: number;
  label: string;
  status?: string;
}

function getStatusColor(status?: string) {
  switch (status) {
    case "on_track": return "#10b981";
    case "at_risk": return "#f59e0b";
    case "off_track": return "#ef4444";
    default: return "#3b82f6";
  }
}

function getCoords(location: string): [number, number] {
  if (GOVERNORATE_COORDS[location]) return GOVERNORATE_COORDS[location];
  const lower = location.toLowerCase();
  for (const [key, coords] of Object.entries(GOVERNORATE_COORDS)) {
    if (lower.includes(key.toLowerCase()) || key.toLowerCase().includes(lower)) {
      return coords;
    }
  }
  return [31.9, 35.0];
}

export default function PalestineMap({ data, height = "400px" }: { data: MapDataPoint[]; height?: string }) {
  const mapData = useMemo(() =>
    data.map(d => ({ ...d, coords: getCoords(d.location) })),
  [data]);

  return (
    <div style={{ height }} className="rounded-lg overflow-hidden border">
      <MapContainer center={[31.7, 35.0]} zoom={8} style={{ height: "100%", width: "100%" }} scrollWheelZoom={false}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {mapData.map((point, idx) => (
          <CircleMarker
            key={idx}
            center={point.coords}
            radius={Math.max(8, Math.min(25, point.value / 2))}
            fillColor={getStatusColor(point.status)}
            fillOpacity={0.7}
            color={getStatusColor(point.status)}
            weight={2}
          >
            <Popup>
              <div className="text-sm">
                <strong>{point.location}</strong><br />
                {point.label}: {point.value}
                {point.status && <><br />Status: {point.status.replace("_", " ")}</>}
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
