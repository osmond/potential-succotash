import React, { useEffect, useState } from 'react';

export default function HydrationRing({ percentage, size = 120, stroke = 8 }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const [dashOffset, setDashOffset] = useState(circumference);
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    let start = null;
    const from = display;
    const to = Math.min(Math.max(percentage, 0), 100);
    const duration = 700;

    const animate = (timestamp) => {
      if (!start) start = timestamp;
      const progress = Math.min((timestamp - start) / duration, 1);
      const value = Math.round(from + (to - from) * progress);
      setDisplay(value);
      setDashOffset(circumference - (value / 100) * circumference);
      if (progress < 1) requestAnimationFrame(animate);
    };

    requestAnimationFrame(animate);
  }, [percentage]);

  return (
    <div className={`relative w-[${size}px] h-[${size}px]`}>
      <svg
        width={size}
        height={size}
        className="transform -rotate-90"
        viewBox={`0 0 ${size} ${size}`}
      >
        <circle
          stroke="currentColor"
          className="text-gray-200"
          strokeWidth={stroke}
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
        <circle
          stroke="currentColor"
          className="text-blue-500"
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
          style={{
            strokeDasharray: `${circumference} ${circumference}`,
            strokeDashoffset: dashOffset,
            transition: 'stroke-dashoffset 0.7s ease-out',
          }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xl font-bold">{display}%</span>
      </div>
    </div>
  );
}
