import React from 'react';
import HydrationRing from './HydrationRing.jsx';

export default function PlantCard({ plant, hydration, compact = false, children }) {
  const ringSize = compact ? 64 : 120;
  const imageSize = compact ? 'w-12 h-12' : 'w-16 h-16';
  const titleSize = compact ? 'text-lg' : 'text-xl';
  const maxWidth = compact ? 'max-w-xs' : 'max-w-sm';

  return (
    <div className={`bg-white rounded-xl shadow-md p-6 ${maxWidth} mx-auto`}>
      <div className="flex items-center space-x-4">
        {plant?.imageUrl && (
          <img
            src={plant.imageUrl}
            alt={plant.name}
            className={`${imageSize} rounded-lg object-cover`}
          />
        )}
        <div>
          <h2 className={`${titleSize} font-semibold`}>{plant?.name}</h2>
          {plant?.species && <p className="text-sm text-gray-500">{plant.species}</p>}
        </div>
      </div>

      <div className="mt-6 flex flex-col items-center">
        <HydrationRing percentage={hydration} size={ringSize} />
        {children}
      </div>
    </div>
  );
}
