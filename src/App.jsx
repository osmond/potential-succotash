import React from 'react';
import PlantCard from './components/PlantCard.jsx';

const plants = [
  { id: 1, name: 'Aloe Vera', species: 'Aloe vera' },
  { id: 2, name: 'Peace Lily', species: 'Spathiphyllum' },
];

export default function App() {
  return (
    <div className="p-4 space-y-4">
      {plants.map((p) => (
        <PlantCard key={p.id} plant={p} />
      ))}
    </div>
  );
}
