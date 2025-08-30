import React, { useEffect, useState } from "react";
import { Droplet, Sun, Thermometer, ChevronDown, ChevronUp } from "lucide-react";

export interface PlantMetadata {
  name: string;
  species?: string;
  location?: string;
  imageUrl?: string;
}

export interface HydrationStatus {
  /** Hydration percentage from 0-100 */
  level: number;
  /** ISO string or human readable last watered date */
  lastWatered?: string;
}

export interface CareMetrics {
  /** Hours of sunlight the plant receives daily */
  sunlight?: number;
  /** Current temperature around the plant (°C) */
  temperature?: number;
  /** Relative humidity percentage */
  humidity?: number;
}

export interface PlantDetailProps {
  plant: PlantMetadata;
  hydration: HydrationStatus;
  metrics: CareMetrics;
}

const size = 120;
const stroke = 8;
const radius = (size - stroke) / 2;
const circumference = 2 * Math.PI * radius;

export const PlantDetail: React.FC<PlantDetailProps> = ({ plant, hydration, metrics }) => {
  const [expanded, setExpanded] = useState(false);
  const [dashOffset, setDashOffset] = useState(circumference);

  useEffect(() => {
    const progress = Math.min(Math.max(hydration.level, 0), 100) / 100;
    setDashOffset(circumference - progress * circumference);
  }, [hydration.level]);

  const stats = [
    { icon: Sun, label: "Sun", value: metrics.sunlight ? `${metrics.sunlight}h` : "--" },
    { icon: Thermometer, label: "Temp", value: metrics.temperature ? `${metrics.temperature}°C` : "--" },
    { icon: Droplet, label: "Humidity", value: metrics.humidity ? `${metrics.humidity}%` : "--" },
  ];

  return (
    <div className="bg-white rounded-xl shadow-md p-6 max-w-sm mx-auto">
      <div className="flex items-center space-x-4">
        {plant.imageUrl && (
          <img src={plant.imageUrl} alt={plant.name} className="w-16 h-16 rounded-lg object-cover" />
        )}
        <div>
          <h2 className="text-xl font-semibold">{plant.name}</h2>
          {plant.species && <p className="text-sm text-gray-500">{plant.species}</p>}
        </div>
      </div>

      <div className="relative mx-auto mt-6 w-[120px] h-[120px]">
        <svg
          width={size}
          height={size}
          className="transform -rotate-90"
          viewBox={`0 0 ${size} ${size}`}
        >
          <circle
            stroke="currentColor"
            className="text-gray-200"
            strokeWidth={stroke}
            fill="transparent"
            r={radius}
            cx={size / 2}
            cy={size / 2}
          />
          <circle
            stroke="currentColor"
            className="text-blue-500 transition-all duration-700 ease-out"
            strokeWidth={stroke}
            strokeLinecap="round"
            fill="transparent"
            r={radius}
            cx={size / 2}
            cy={size / 2}
            style={{
              strokeDasharray: `${circumference} ${circumference}`,
              strokeDashoffset: dashOffset,
            }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xl font-bold">{hydration.level}%</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mt-6">
        {stats.map(({ icon: Icon, label, value }) => (
          <div key={label} className="flex flex-col items-center">
            <Icon className="w-6 h-6 mb-1" />
            <span className="text-sm font-semibold">{value}</span>
            <span className="text-xs text-gray-500">{label}</span>
          </div>
        ))}
      </div>

      <button
        onClick={() => setExpanded((v) => !v)}
        className="mt-6 flex items-center text-sm text-green-600"
      >
        {expanded ? (
          <ChevronUp className="w-4 h-4 mr-1" />
        ) : (
          <ChevronDown className="w-4 h-4 mr-1" />
        )}
        {expanded ? "Hide details" : "More details"}
      </button>

      {expanded && (
        <div className="mt-4 space-y-2 text-sm text-gray-600">
          {plant.location && (
            <p>
              <span className="font-medium">Location:</span> {plant.location}
            </p>
          )}
          {hydration.lastWatered && (
            <p>
              <span className="font-medium">Last watered:</span> {hydration.lastWatered}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default PlantDetail;

