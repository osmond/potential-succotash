import { create } from 'zustand';

export interface Task {
  id: string;
  message: string;
  action: string;
}

export interface PlantStateItem {
  id: number;
  name: string;
  species?: string;
  hydration: number; // 0-100
  tasks: Task[];
  photos: string[];
}

interface PlantStore {
  plants: PlantStateItem[];
  logWater: (id: number) => void;
  completeTask: (plantId: number, taskId: string) => void;
  addPhoto: (plantId: number, url: string) => void;
}

export const usePlantStore = create<PlantStore>((set) => ({
  plants: [
    {
      id: 1,
      name: 'Aloe Vera',
      species: 'Aloe vera',
      hydration: 40,
      tasks: [
        {
          id: 'mark-watered',
          message: 'Soil moisture is low. Consider watering.',
          action: 'Mark as Watered',
        },
      ],
      photos: [],
    },
    {
      id: 2,
      name: 'Peace Lily',
      species: 'Spathiphyllum',
      hydration: 70,
      tasks: [],
      photos: [],
    },
  ],
  logWater: (id) =>
    set((state) => ({
      plants: state.plants.map((p) =>
        p.id === id
          ? {
              ...p,
              hydration: Math.min(p.hydration + 10, 100),
              tasks: p.tasks.filter((t) => t.id !== 'mark-watered'),
            }
          : p
      ),
    })),
  completeTask: (plantId, taskId) =>
    set((state) => ({
      plants: state.plants.map((p) =>
        p.id === plantId
          ? { ...p, tasks: p.tasks.filter((t) => t.id !== taskId) }
          : p
      ),
    })),
  addPhoto: (plantId, url) =>
    set((state) => ({
      plants: state.plants.map((p) =>
        p.id === plantId
          ? { ...p, photos: [...p.photos, url] }
          : p
      ),
    })),
}));

export default usePlantStore;

