import React from 'react';
import ReactDOM from 'react-dom/client';
import RoomsView from './components/RoomsView.jsx';
import { PlantDetail } from './components/PlantDetail.tsx';

// Expose React and the PlantDetail component for non-React scripts
window.React = React;
window.ReactDOM = ReactDOM;
window.PlantDetail = PlantDetail;

ReactDOM.createRoot(document.getElementById('react-root')).render(
  <React.StrictMode>
    <RoomsView />
  </React.StrictMode>,
);

