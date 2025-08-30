import React, { useEffect, useState, useRef } from "react";
import PlantCard from "./PlantCard.jsx";
import {
  Droplet,
  ChevronDown,
  ChevronUp,
  FlaskConical,
  Camera,
  Activity,
  Plus,
  Info,
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
  /** Vapor pressure deficit (kPa) */
  vpd?: number;
  /** Reference evapotranspiration (mm/day) */
  eto?: number;
  /** Soil moisture percentage */
  soilMoisture?: number;
  /** Average watering interval in days */
  avgInterval?: number;
}

export interface PlantDetailProps {
  plant: PlantMetadata;
  hydration: HydrationStatus;
  metrics: CareMetrics;
  /** Callback when water is added */
  onWater?: () => void | Promise<void>;
  /** Callback when a photo is added */
  onPhoto?: (file: File) => void | Promise<void>;
  /** Callback when care plan is adjusted */
  onAdjustPlan?: () => void | Promise<void>;
}


export const PlantDetail: React.FC<PlantDetailProps> = ({
  plant,
  hydration,
  metrics,
  onWater,
  onPhoto,
  onAdjustPlan,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const [hydrationStatus, setHydrationStatus] = useState(hydration);
  const [dataPanelOpen, setDataPanelOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState<Record<string, boolean>>({});
  const [historyState, setHistoryState] = useState<PlantEvent[]>(plant.history || []);
  const [timelineEvents, setTimelineEvents] = useState<{ date: string; events: PlantEvent[] }[]>([]);
  const [wateringData, setWateringData] = useState<{ date: string; amount: number }[]>([]);
  const [suggestions, setSuggestions] = useState(
    [
      {
        id: "mark-watered",
        message: "Soil moisture is low. Consider watering.",
        action: "Mark as Watered",
      },
      {
        id: "adjust-care",
        message: "Nutrient levels appear low. Adjust care plan.",
        action: "Adjust Care Plan",
      },
    ]
  );
  const [fabOpen, setFabOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const toggleInfo = (key: string) =>
    setInfoOpen((o) => ({ ...o, [key]: !o[key] }));

  useEffect(() => {
    setHydrationStatus(hydration);
  }, [hydration]);

  useEffect(() => {
    setHistoryState(plant.history || []);
  }, [plant.history]);

  useEffect(() => {
    const groups: Record<string, PlantEvent[]> = {};
    for (const ev of historyState) {
      const date = ev.at.slice(0, 10);
      if (!groups[date]) groups[date] = [];
      groups[date].push(ev);
    }
    const grouped = Object.entries(groups)
      .sort((a, b) => Date.parse(b[0]) - Date.parse(a[0]))
      .map(([date, events]) => ({
        date,
        events: events.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)),
      }));
    setTimelineEvents(grouped);

    const today = new Date();
    const data: { date: string; amount: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      const amount = (groups[iso] || [])
        .filter((e) => e.type === "water" && typeof e.amount === "number")
        .reduce((sum, e) => sum + (e.amount || 0), 0);
      data.push({ date: label, amount });
    }
    setWateringData(data);
  }, [historyState]);

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
      if (onPhoto) {
        await onPhoto(file);
      } else {
        await (window as any).PlantDB?.putFile(file);
      }
      const url = URL.createObjectURL(file);
      setPhotos((p) => [...p, url]);
    } finally {
      e.target.value = "";
    }
  };

  const applySuggestion = async (id: string) => {
    const now = new Date().toISOString();
    if (id === "mark-watered") {
      setHydrationStatus((h) => ({
        ...h,
        level: Math.min(h.level + 10, 100),
        lastWatered: now,
      }));
      setHistoryState((h) => [...h, { type: "water", at: now }]);
      if (onWater) await onWater();
    } else if (id === "adjust-care") {
      setHistoryState((h) => [...h, { type: "adjust-care", at: now }]);
      if (onAdjustPlan) await onAdjustPlan();
    }
    setSuggestions((s) => s.filter((sg) => sg.id !== id));
  };

  const handleAddWater = async () => {
    const now = new Date().toISOString();
    setHydrationStatus((h) => ({
      ...h,
      level: Math.min(h.level + 10, 100),
      lastWatered: now,
    }));
    setHistoryState((h) => [...h, { type: "water", at: now }]);
    if (onWater) await onWater();
  };

  const handleAddFertilizer = () => {
    const now = new Date().toISOString();
    setHistoryState((h) => [...h, { type: "fertilize", at: now }]);
  };

  const handleFabPhoto = () => {
    fileInputRef.current?.click();
  };

  const fabActions = [
    { icon: Droplet, color: "bg-blue-500", handler: handleAddWater, label: "Add water" },
    {
      icon: FlaskConical,
      color: "bg-green-500",
      handler: handleAddFertilizer,
      label: "Add fertilizer",
    },
    { icon: Camera, color: "bg-yellow-500", handler: handleFabPhoto, label: "Add photo" },
  ];

  const metricDetails = [
    {
      key: "vpd",
      label: "VPD",
      value: metrics.vpd ? `${metrics.vpd} kPa` : "--",
      tip: "Vapor pressure deficit between air and leaf",
    },
    {
      key: "eto",
      label: "ET₀",
      value: metrics.eto ? `${metrics.eto} mm/day` : "--",
      tip: "Reference evapotranspiration rate",
    },
    {
      key: "soil",
      label: "Soil moisture",
      value: metrics.soilMoisture ? `${metrics.soilMoisture}%` : "--",
      tip: "Volumetric water content of soil",
    },
    {
      key: "avg",
      label: "Avg interval",
      value: metrics.avgInterval ? `${metrics.avgInterval}d` : "--",
      tip: "Average days between watering",
    },
  ];

  const eventIcons: Record<string, React.ComponentType<any>> = {
    water: Droplet,
    fertilize: FlaskConical,
    observe: Camera,
  };

  return (
    <PlantCard plant={plant} hydration={hydrationStatus.level}>
      <button
        onClick={() => setDataPanelOpen((o) => !o)}
        className="mt-4 flex items-center text-sm text-green-600"
      >
        {dataPanelOpen ? (
          <ChevronUp className="w-4 h-4 mr-1" />
        ) : (
          <ChevronDown className="w-4 h-4 mr-1" />
        )}
        {dataPanelOpen ? "Hide data" : "Show data"}
      </button>

      {dataPanelOpen && (
        <div className="mt-4 w-full space-y-3 text-sm">
          {metricDetails.map((m) => (
            <div key={m.key} className="flex flex-col">
              <div className="flex items-center justify-between">
                <span className="font-medium">{m.label}</span>
                <div className="flex items-center space-x-1">
                  <span>{m.value}</span>
                  <Info
                    className="w-4 h-4 text-gray-400 cursor-pointer"
                    onClick={() => toggleInfo(m.key)}
                  />
                </div>
              </div>
              {infoOpen[m.key] && (
                <p className="mt-1 text-xs text-gray-500">{m.tip}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="mt-4">
          <h3 className="font-semibold mb-2">Care Coach</h3>
          {suggestions.map((s) => (
            <div key={s.id} className="mb-4 p-4 bg-blue-50 rounded-lg shadow">
              <p className="mb-2 text-sm text-gray-700">{s.message}</p>
              <button
                className="px-3 py-2 text-sm font-medium text-white bg-green-600 rounded"
                onClick={() => applySuggestion(s.id)}
              >
                {s.action}
              </button>
            </div>
          ))}
        </div>
      )}

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
          {hydrationStatus.lastWatered && (
            <p>
              <span className="font-medium">Last watered:</span> {hydrationStatus.lastWatered}
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

          {timelineEvents.length > 0 && (
            <div>
              <h3 className="font-semibold mb-2">Care Timeline</h3>
              <ul className="space-y-4">
                {timelineEvents.map((group, i) => (
                  <li key={i}>
                    <div className="text-xs text-gray-500 mb-1">
                      {new Date(group.date).toLocaleDateString()}
                    </div>
                    <ul className="space-y-1">
                      {group.events.map((ev, j) => {
                        const Icon = eventIcons[ev.type] || Activity;
                        return (
                          <li key={j} className="flex items-center">
                            <Icon className="w-4 h-4 mr-2" />
                            <span className="capitalize">{ev.type}</span>
                            {typeof ev.amount === "number" && (
                              <span className="ml-2 text-xs text-gray-500">{ev.amount} ml</span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <h3 className="font-semibold mb-2">Observations</h3>
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: 9 }).map((_, i) => {
                const url = photos[i];
                return url ? (
                  <img
                    key={i}
                    src={url}
                    className="w-full h-24 object-cover rounded"
                  />
                ) : (
                  <label
                    key={i}
                    className="w-full h-24 bg-gray-100 flex items-center justify-center rounded cursor-pointer"
                  >
                    <Camera className="w-8 h-8 text-gray-400" />
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handlePhotoUpload}
                    />
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="fixed bottom-6 right-6 z-50">
        {fabActions.map((action, i) => {
          const Icon = action.icon;
          return (
            <button
              key={action.label}
              onClick={action.handler}
              aria-label={action.label}
              className={`${action.color} p-3 rounded-full text-white shadow-lg absolute bottom-0 right-0 transform transition-all duration-300 ${fabOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
              style={{ transform: fabOpen ? `translateY(-${(i + 1) * 56}px)` : 'translateY(0)' }}
            >
              <Icon className="w-5 h-5" />
            </button>
          );
        })}
        <button
          onClick={() => setFabOpen((o) => !o)}
          className={`p-4 rounded-full bg-green-600 text-white shadow-lg transition-transform duration-300 transform ${fabOpen ? 'rotate-45' : ''}`}
          aria-label="Toggle actions"
        >
          <Plus className="w-6 h-6" />
        </button>
        <input
          type="file"
          accept="image/*"
          ref={fileInputRef}
          onChange={handlePhotoUpload}
          className="hidden"
        />
      </div>
    </PlantCard>
  );
};

export default PlantDetail;
