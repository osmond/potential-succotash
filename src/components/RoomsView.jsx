import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';

function HydrationRing({ level }) {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (level / 100) * circumference;

  return (
    <div className="relative w-20 h-20">
      <svg className="w-full h-full rotate-[-90deg]" viewBox="0 0 80 80">
        <circle
          cx="40"
          cy="40"
          r={radius}
          strokeWidth="8"
          className="text-muted"
          stroke="currentColor"
          fill="none"
        />
        <circle
          cx="40"
          cy="40"
          r={radius}
          strokeWidth="8"
          className="text-accent"
          stroke="currentColor"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-sm font-semibold">
        {level}%
      </div>
    </div>
  );
}

export default function RoomsView() {
  const [fabOpen, setFabOpen] = useState(false);
  const rooms = [
    { id: 1, name: 'Living Room', hydration: 75 },
    { id: 2, name: 'Kitchen', hydration: 45 }
  ];

  return (
    <div className="min-h-screen p-4">
      <h1 className="text-2xl font-bold mb-4">Rooms</h1>
      <div className="grid gap-4">
        {rooms.map(room => (
          <div
            key={room.id}
            className="flex items-center justify-between p-4 rounded-xl border border-borderc bg-panel"
          >
            <span className="font-medium">{room.name}</span>
            <HydrationRing level={room.hydration} />
          </div>
        ))}
      </div>

      <div className="fixed bottom-6 right-6 flex flex-col items-end gap-2">
        {fabOpen && (
          <>
            <button className="w-12 h-12 rounded-full bg-panel shadow flex items-center justify-center">
              R
            </button>
            <button className="w-12 h-12 rounded-full bg-panel shadow flex items-center justify-center">
              P
            </button>
          </>
        )}
        <button
          onClick={() => setFabOpen(!fabOpen)}
          className="w-14 h-14 rounded-full bg-accent text-white flex items-center justify-center shadow-lg"
          aria-label="Toggle actions"
        >
          {fabOpen ? <X /> : <Plus />}
        </button>
      </div>
    </div>
  );
}

