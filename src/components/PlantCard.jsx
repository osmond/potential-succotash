import React, { useState, useRef } from 'react';
import { useSwipeable } from 'react-swipeable';
import { Droplet, FlaskConical, Camera } from 'lucide-react';

export default function PlantCard({ plant }) {
  const [showActions, setShowActions] = useState(false);
  const pressTimer = useRef(null);

  const handlers = useSwipeable({
    onSwipedLeft: () => setShowActions(true),
    onSwipedRight: () => setShowActions(false),
  });

  const startPress = () => {
    pressTimer.current = setTimeout(() => setShowActions(true), 600);
  };

  const endPress = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  return (
    <div
      {...handlers}
      onTouchStart={startPress}
      onTouchEnd={endPress}
      onMouseDown={startPress}
      onMouseUp={endPress}
      className="relative bg-white rounded shadow p-4"
    >
      <div className="flex items-center">
        {plant.image && (
          <img
            src={plant.image}
            alt={plant.name}
            className="w-12 h-12 rounded-full object-cover mr-4"
          />
        )}
        <div>
          <h3 className="font-semibold">{plant.name}</h3>
          {plant.species && (
            <p className="text-sm text-gray-500">{plant.species}</p>
          )}
        </div>
      </div>

      {showActions && (
        <div className="absolute inset-0 bg-white/90 flex items-center justify-around" onClick={() => setShowActions(false)}>
          <button className="flex flex-col items-center text-blue-600" onClick={(e) => e.stopPropagation()}>
            <Droplet className="w-6 h-6" />
            <span className="text-xs mt-1">Water</span>
          </button>
          <button className="flex flex-col items-center text-green-600" onClick={(e) => e.stopPropagation()}>
            <FlaskConical className="w-6 h-6" />
            <span className="text-xs mt-1">Fertilize</span>
          </button>
          <button className="flex flex-col items-center text-purple-600" onClick={(e) => e.stopPropagation()}>
            <Camera className="w-6 h-6" />
            <span className="text-xs mt-1">Photo</span>
          </button>
        </div>
      )}
    </div>
  );
}
