import React, { useEffect, useState, useRef } from "react";
import {
  Droplet,
  Sun,
  Thermometer,
  ChevronDown,
  ChevronUp,
  FlaskConical,
  Camera,
  Activity,
  Plus,
  X,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export interface PlantEvent {
  type: string;
  at: string;
  amount?: number;
}

export interface Observation {
  id: string;
  at: string;
  type: "photo" | "note";
  fileId?: string;
  note?: string;
}

export interface PlantMetadata {
  name: string;
  species?: string;
  location?: string;
  imageUrl?: string;
  history?: PlantEvent[];
  observations?: Observation[];
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
  const [photos, setPhotos] = useState<string[]>([]);
  const [hydrationState, setHydrationState] = useState(hydration);
  const [historyState, setHistoryState] = useState<PlantEvent[]>(plant.history || []);
  const [suggestions, setSuggestions] = useState(
    [
      {
        id: "increase-water",
        message: "Soil moisture is low. Consider increasing watering.",
        action: "Mark as Watered",
      },
      {
        id: "adjust-fertilizer",
        message: "Nutrient levels appear low. Consider adjusting fertilizer.",
        action: "Adjust Care Plan",
      },
    ]
  );
  const [fabOpen, setFabOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const fabClassName = fabOpen
    ? "opacity-100 translate-y-0"
    : "opacity-0 translate-y-4 pointer-events-none";

  useEffect(() => {
    const progress = Math.min(Math.max(hydrationState.level, 0), 100) / 100;
    setDashOffset(circumference - progress * circumference);
  }, [hydrationState.level]);

  useEffect(() => {
    setHydrationState(hydration);
  }, [hydration]);

  useEffect(() => {
    setHistoryState(plant.history || []);
  }, [plant.history]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const obs = plant.observations?.filter((o) => o.type === "photo" && o.fileId) || [];
      const urls: string[] = [];
      for (const o of obs) {
        try {
          const blob = await (window as any).PlantDB?.getFile(o.fileId);
          if (blob) {
            urls.push(URL.createObjectURL(blob));
          }
        } catch {}
      }
      if (!cancelled) setPhotos(urls);
    }
    load();
    return () => {
      cancelled = true;
      photos.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [plant.observations]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await (window as any).PlantDB?.putFile(file);
      const url = URL.createObjectURL(file);
      setPhotos((p) => [...p, url]);
    } finally {
      e.target.value = "";
    }
  };

  const handleSuggestion = (id: string) => {
    const now = new Date().toISOString();
    if (id === "increase-water") {
      setHydrationState((h) => ({
        ...h,
        level: Math.min(h.level + 10, 100),
        lastWatered: now,
      }));
    }
    setHistoryState((h) => [...h, { type: id, at: now }]);
    setSuggestions((s) => s.filter((sg) => sg.id !== id));
  };

  const handleAddWater = () => {
    const now = new Date().toISOString();
    setHydrationState((h) => ({
      ...h,
      level: Math.min(h.level + 10, 100),
      lastWatered: now,
    }));
    setHistoryState((h) => [...h, { type: "water", at: now }]);
  };

  const handleAddFertilizer = () => {
    const now = new Date().toISOString();
    setHistoryState((h) => [...h, { type: "fertilize", at: now }]);
  };

  const handleFabPhoto = () => {
    fileInputRef.current?.click();
  };

  const stats = [
    { icon: Sun, label: "Sun", value: metrics.sunlight ? `${metrics.sunlight}h` : "--" },
    { icon: Thermometer, label: "Temp", value: metrics.temperature ? `${metrics.temperature}°C` : "--" },
    { icon: Droplet, label: "Humidity", value: metrics.humidity ? `${metrics.humidity}%` : "--" },
  ];

  const timeline = historyState
    .slice()
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const eventIcons: Record<string, React.ComponentType<any>> = {
    water: Droplet,
    fertilize: FlaskConical,
    observe: Camera,
  };

  const wateringData = historyState
    .filter((h) => h.type === "water" && typeof h.amount === "number")
    .slice(-7)
    .map((h) => ({
      date: new Date(h.at).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      }),
      amount: h.amount as number,
    }));

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
          <span className="text-xl font-bold">{hydrationState.level}%</span>
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

      {suggestions.map((s) => (
        <div key={s.id} className="mt-4 p-4 bg-blue-50 rounded-lg shadow">
          <p className="mb-2 text-sm text-gray-700">{s.message}</p>
          <button
            className="px-3 py-2 text-sm font-medium text-white bg-green-600 rounded"
            onClick={() => handleSuggestion(s.id)}
          >
            {s.action}
          </button>
        </div>
      ))}

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
        <div className="mt-4 space-y-4 text-sm text-gray-600">
          {plant.location && (
            <p>
              <span className="font-medium">Location:</span> {plant.location}
            </p>
          )}
          {hydrationState.lastWatered && (
            <p>
              <span className="font-medium">Last watered:</span> {hydrationState.lastWatered}
            </p>
          )}

          {wateringData.length > 0 && (
            <div>
              <h3 className="font-semibold mb-2">Watering</h3>
              <ResponsiveContainer width="100%" height={150}>
                <BarChart data={wateringData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="amount" fill="#3b82f6" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {timeline.length > 0 && (
            <div>
              <h3 className="font-semibold mb-2">Care Timeline</h3>
              <ul className="space-y-2">
                {timeline.map((h, i) => {
                  const Icon = eventIcons[h.type] || Activity;
                  return (
                    <li key={i} className="flex items-center">
                      <Icon className="w-4 h-4 mr-2" />
                      <span className="capitalize">{h.type}</span>
                      <span className="ml-auto text-xs text-gray-500">
                        {new Date(h.at).toLocaleDateString()}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div>
            <h3 className="font-semibold mb-2">Observations</h3>
            <div className="grid grid-cols-3 gap-2">
              {photos.map((url, idx) => (
                <img
                  key={idx}
                  src={url}
                  className="w-full h-24 object-cover rounded"
                />
              ))}
              <label className="w-full h-24 bg-gray-100 flex items-center justify-center rounded cursor-pointer">
                <span className="text-gray-400 text-2xl">+</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePhotoUpload}
                />
              </label>
            </div>
          </div>
        </div>
      )}
      <div className="fixed bottom-6 right-6 z-50">
        <div className={`flex flex-col items-center mb-4 transition-all duration-300 ${fabClassName}`}>
          <button
            onClick={handleAddWater}
            className="mb-2 p-3 rounded-full bg-blue-500 text-white shadow-lg"
            aria-label="Add water"
          >
            <Droplet className="w-5 h-5" />
          </button>
          <button
            onClick={handleAddFertilizer}
            className="mb-2 p-3 rounded-full bg-green-500 text-white shadow-lg"
            aria-label="Add fertilizer"
          >
            <FlaskConical className="w-5 h-5" />
          </button>
          <button
            onClick={handleFabPhoto}
            className="mb-2 p-3 rounded-full bg-yellow-500 text-white shadow-lg"
            aria-label="Add photo"
          >
            <Camera className="w-5 h-5" />
          </button>
        </div>
        <button
          onClick={() => setFabOpen((o) => !o)}
          className="p-4 rounded-full bg-green-600 text-white shadow-lg transition-transform duration-300"
          aria-label="Toggle actions"
        >
          {fabOpen ? <X className="w-6 h-6" /> : <Plus className="w-6 h-6" />}
        </button>
        <input
          type="file"
          accept="image/*"
          ref={fileInputRef}
          onChange={handlePhotoUpload}
          className="hidden"
        />
      </div>
    </div>
  );
};

export default PlantDetail;

