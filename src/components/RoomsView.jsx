import React, { useState } from 'react';
import { Plus } from 'lucide-react';

function HydrationRing({ value }) {
  const radius = 24;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - value * circumference;
  return (
    <svg className="w-16 h-16" viewBox="0 0 60 60">
      <circle
        cx="30"
        cy="30"
        r={radius}
        strokeWidth="6"
        className="text-[color:var(--border)]"
        stroke="currentColor"
        fill="transparent"
      />
      <circle
        cx="30"
        cy="30"
        r={radius}
        strokeWidth="6"
        stroke="currentColor"
        fill="transparent"
        className="text-[color:var(--accent)]"
        strokeDasharray={`${circumference} ${circumference}`}
        strokeDashoffset={offset}
        strokeLinecap="round"
      />
    </svg>
  );
}

const demoRooms = [
  { id: 1, label: 'Living Room', hydrated: 0.8 },
  { id: 2, label: 'Kitchen', hydrated: 0.5 }
];

export default function RoomsView() {
  const [fabOpen, setFabOpen] = useState(false);

  return (
    <div className="p-4 relative">
      <h1 className="text-xl font-bold mb-4">Rooms</h1>
      <ul className="grid grid-cols-2 gap-4">
        {demoRooms.map(r => (
          <li
            key={r.id}
            className="rounded-xl border border-[color:var(--border)] bg-[color:var(--panel)] p-4 flex flex-col items-center gap-2"
          >
            <HydrationRing value={r.hydrated} />
            <span className="font-medium">{r.label}</span>
          </li>
        ))}
      </ul>
      {fabOpen && (
        <div className="fixed inset-0 bg-black/40" onClick={() => setFabOpen(false)} />
      )}
      <button
        className="fixed right-4 bottom-4 w-14 h-14 rounded-full bg-[color:var(--accent)] text-white flex items-center justify-center shadow-lg transition-transform"
        onClick={() => setFabOpen(!fabOpen)}
        aria-label="Add room"
      >
        <Plus className={`transition-transform ${fabOpen ? 'rotate-45' : ''}`} />
      </button>
    </div>
  );
}
