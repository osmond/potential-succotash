import React from 'react';
import { usePlantStore } from '../state/usePlantStore';

const size = 80;
const stroke = 6;
const radius = (size - stroke) / 2;
const circumference = 2 * Math.PI * radius;

export const RoomsView: React.FC = () => {
  const plants = usePlantStore((s) => s.plants);
  const completeTask = usePlantStore((s) => s.completeTask);
  const logWater = usePlantStore((s) => s.logWater);
  return (
    <div className="grid grid-cols-1 gap-4">
      {Object.entries(plants).map(([id, plant]) => {
        const offset =
          circumference - (plant.hydration.level / 100) * circumference;
        return (
          <div key={id} className="p-4 border rounded">
            <div className="flex items-center space-x-4">
              <svg width={size} height={size}>
                <circle
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  stroke="#e5e7eb"
                  strokeWidth={stroke}
                  fill="none"
                />
                <circle
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  stroke="#3b82f6"
                  strokeWidth={stroke}
                  fill="none"
                  strokeDasharray={circumference}
                  strokeDashoffset={offset}
                  strokeLinecap="round"
                />
              </svg>
              <div>
                <div className="font-semibold">{id}</div>
                <div className="text-sm text-gray-500">
                  {plant.hydration.level}%
                </div>
              </div>
              <button
                onClick={() => logWater(id)}
                className="ml-auto px-2 py-1 text-xs text-white bg-green-600 rounded"
              >
                Water
              </button>
            </div>
            {plant.tasks.length > 0 && (
              <ul className="mt-2 text-sm list-disc list-inside">
                {plant.tasks.map((t, i) => (
                  <li key={i}>
                    <button
                      onClick={() => completeTask(id, i)}
                      className="text-left"
                    >
                      {t}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default RoomsView;
