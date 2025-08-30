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

import React, { useState } from "react";
import { Plus, X, Image as ImageIcon, Droplet } from "lucide-react";

export default function RoomsView() {
  const [fabOpen, setFabOpen] = useState(false);

  // Example rooms data
  const rooms = [
    {
      name: "Living Room",
      plants: [
        { name: "Monstera", hydration: 80, photo: null },
        { name: "Pothos", hydration: 55, photo: null },
      ],
    },
    {
      name: "Bedroom",
      plants: [
        { name: "Fiddle Leaf Fig", hydration: 40, photo: null },
      ],
    },
    {
      name: "Office",
      plants: [
        { name: "Snake Plant", hydration: 95, photo: null },
      ],
    },
  ];

  return (
    <div className="relative w-full max-w-4xl mx-auto p-6 bg-white text-gray-900 min-h-screen">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Rooms</h1>
        <p className="text-sm text-gray-600">Group your plants by room for clarity and context.</p>
      </div>

      {/* Rooms Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
        {rooms.map((room, idx) => (
          <div key={idx} className="p-4 border rounded-2xl shadow-sm bg-white hover:shadow-md transition">
            <h2 className="text-lg font-semibold mb-3">{room.name}</h2>
            <div className="grid grid-cols-2 gap-3">
              {room.plants.map((plant, pIdx) => {
                let ringColor = "text-green-500";
                if (plant.hydration < 50) ringColor = "text-yellow-500";
                if (plant.hydration < 20) ringColor = "text-red-500";

                return (
                  <div
                    key={pIdx}
                    className="relative p-2 border rounded-xl bg-gray-50 flex flex-col items-center"
                  >
                    <div className="relative w-20 h-20 mb-2">
                      {plant.photo ? (
                        <img
                          src={plant.photo}
                          alt={plant.name}
                          className="w-full h-full object-cover rounded-lg"
                        />
                      ) : (
                        <div className="w-full h-full bg-gray-200 flex items-center justify-center rounded-lg">
                          <ImageIcon className="w-6 h-6 text-gray-400" />
                        </div>
                      )}
                      <svg className="absolute top-1 right-1 w-8 h-8" viewBox="0 0 36 36">
                        <path
                          className="text-gray-200"
                          strokeWidth="3"
                          stroke="currentColor"
                          fill="none"
                          d="M18 2.0845
                             a 15.9155 15.9155 0 0 1 0 31.831
                             a 15.9155 15.9155 0 0 1 0 -31.831"
                        />
                        <path
                          className={ringColor}
                          strokeWidth="3"
                          strokeDasharray={`${plant.hydration}, 100`}
                          strokeLinecap="round"
                          stroke="currentColor"
                          fill="none"
                          d="M18 2.0845
                             a 15.9155 15.9155 0 0 1 0 31.831
                             a 15.9155 15.9155 0 0 1 0 -31.831"
                        />
                      </svg>
                    </div>
                    <p className="text-sm font-medium text-gray-700">{plant.name}</p>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* FAB */}
      <div className="fixed bottom-6 right-6">
        <div className="relative flex flex-col items-end gap-3">
          {fabOpen && (
            <>
              <button className="flex items-center justify-center w-14 h-14 rounded-full bg-green-500 text-white shadow-lg hover:bg-green-600 transition">
                + Plant
              </button>
              <button className="flex items-center justify-center w-14 h-14 rounded-full bg-blue-500 text-white shadow-lg hover:bg-blue-600 transition">
                + Room
              </button>
            </>
          )}
          <button
            onClick={() => setFabOpen(!fabOpen)}
            className="flex items-center justify-center w-16 h-16 rounded-full bg-green-600 text-white shadow-lg hover:bg-green-700 transition"
          >
            {fabOpen ? <X className="w-7 h-7" /> : <Plus className="w-7 h-7" />}
          </button>
        </div>
      </div>
    </div>
  );
}


