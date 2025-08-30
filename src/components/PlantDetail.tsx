import React, { useRef } from "react";
import PlantCard from "./PlantCard.jsx";
import { Droplet, Camera } from "lucide-react";
import { usePlantStore } from "../state/plantStore";

interface PlantDetailProps {
  plantId: number;
}

export const PlantDetail: React.FC<PlantDetailProps> = ({ plantId }) => {
  const plant = usePlantStore((state) => state.plants.find((p) => p.id === plantId));
  const logWater = usePlantStore((state) => state.logWater);
  const addPhoto = usePlantStore((state) => state.addPhoto);
  const completeTask = usePlantStore((state) => state.completeTask);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!plant) return null;

  const handleWater = () => {
    logWater(plant.id);
    completeTask(plant.id, "mark-watered");
  };

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      addPhoto(plant.id, url);
      e.target.value = "";
    }
  };

  return (
    <PlantCard plant={plant} hydration={plant.hydration}>
      {plant.tasks.length > 0 && (
        <div className="w-full mt-4 text-sm">
          {plant.tasks.map((t) => (
            <div key={t.id} className="mb-2">
              <span>{t.message}</span>
              <button
                className="ml-2 px-2 py-1 bg-green-600 text-white rounded"
                onClick={() => completeTask(plant.id, t.id)}
              >
                {t.action}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex space-x-2">
        <button
          className="p-2 bg-blue-500 text-white rounded-full"
          onClick={handleWater}
          aria-label="Add water"
        >
          <Droplet className="w-4 h-4" />
        </button>
        <button
          className="p-2 bg-yellow-500 text-white rounded-full"
          onClick={() => fileInputRef.current?.click()}
          aria-label="Add photo"
        >
          <Camera className="w-4 h-4" />
        </button>
        <input
          type="file"
          accept="image/*"
          ref={fileInputRef}
          onChange={handlePhoto}
          className="hidden"
        />
      </div>

      {plant.photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mt-4">
          {plant.photos.map((url, i) => (
            <img key={i} src={url} className="w-full h-24 object-cover rounded" />
          ))}
        </div>
      )}
    </PlantCard>
  );
};

export default PlantDetail;

