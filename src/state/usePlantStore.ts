import { create } from 'zustand';

export interface HydrationState {
  level: number;
  lastWatered?: string;
}

export interface PlantData {
  hydration: HydrationState;
  tasks: string[];
  photos: string[];
}

interface PlantStore {
  plants: Record<string, PlantData>;
  setHydration: (id: string, hydration: HydrationState) => void;
  logWater: (id: string, amount?: number) => void;
  addPhoto: (id: string, url: string) => void;
  addTask: (id: string, task: string) => void;
  completeTask: (id: string, index: number) => void;
}

export const usePlantStore = create<PlantStore>((set) => ({
  plants: {},
  setHydration: (id, hydration) =>
    set((state) => {
      const plant = state.plants[id] || { hydration: { level: 0 }, tasks: [], photos: [] };
      return {
        plants: {
          ...state.plants,
          [id]: { ...plant, hydration },
        },
      };
    }),
  logWater: (id, amount) =>
    set((state) => {
      const plant = state.plants[id] || {
        hydration: { level: 0 },
        tasks: [],
        photos: [],
      };
      const hydration: HydrationState = {
        level: Math.min(100, (amount ?? 100)),
        lastWatered: new Date().toISOString(),
      };
      const tasks = plant.tasks.filter((t) => t !== 'Water plant');
      return {
        plants: {
          ...state.plants,
          [id]: { ...plant, hydration, tasks },
        },
      };
    }),
  addPhoto: (id, url) =>
    set((state) => {
      const plant = state.plants[id] || {
        hydration: { level: 0 },
        tasks: [],
        photos: [],
      };
      return {
        plants: {
          ...state.plants,
          [id]: { ...plant, photos: [...plant.photos, url] },
        },
      };
    }),
  addTask: (id, task) =>
    set((state) => {
      const plant = state.plants[id] || {
        hydration: { level: 0 },
        tasks: [],
        photos: [],
      };
      return {
        plants: {
          ...state.plants,
          [id]: { ...plant, tasks: [...plant.tasks, task] },
        },
      };
    }),
  completeTask: (id, index) =>
    set((state) => {
      const plant = state.plants[id];
      if (!plant) return state;
      const tasks = plant.tasks.filter((_, i) => i !== index);
      return {
        plants: {
          ...state.plants,
          [id]: { ...plant, tasks },
        },
      };
    }),
}));
