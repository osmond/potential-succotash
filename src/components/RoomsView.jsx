import React from 'react';
import PlantCard from './PlantCard.jsx';
import { usePlantStore } from '../state/plantStore';

export default function RoomsView() {
  const plants = usePlantStore((state) => state.plants);
  return (
    <div className="p-4 space-y-4">
      {plants.map((p) => (
        <PlantCard key={p.id} plant={p} hydration={p.hydration}>
          {p.tasks.length > 0 && (
            <ul className="mt-4 text-sm text-gray-600">
              {p.tasks.map((t) => (
                <li key={t.id}>{t.message}</li>
              ))}
            </ul>
          )}
        </PlantCard>
      ))}
    </div>
  );
}
