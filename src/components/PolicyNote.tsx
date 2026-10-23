import { useState } from 'react';

export default function PolicyNote() {
  const [open, setOpen] = useState(false);

  return (
    <div className="policy-note">
      {open && (
        <div className="policy-note-card">
          <button className="policy-note-close" onClick={() => setOpen(false)}>
            &times;
          </button>
          <h3>How countries are shown</h3>
          <p>
            Colors on this map follow a <strong>recognition-based rule</strong>: an area
            receives its own color if it is a <strong>UN member state</strong>, a{' '}
            <strong>UN observer state</strong> (Palestine, the Holy See), or a state{' '}
            <strong>recognized by a majority of UN members</strong> (Kosovo).
          </p>
          <p>
            Disputed territories, dependencies, and special areas carry a{' '}
            <strong>Status</strong> note on their info card describing the dispute or
            arrangement. Showing a boundary or color here is a cartographic convention,
            not a political endorsement.
          </p>
        </div>
      )}
      <button className="policy-note-toggle" onClick={() => setOpen(!open)}>
        <svg viewBox="0 0 24 24" width="14" height="14">
          <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
          <line x1="12" y1="11" x2="12" y2="17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <circle cx="12" cy="7.5" r="1.3" fill="currentColor" />
        </svg>
        About the borders
      </button>
    </div>
  );
}
