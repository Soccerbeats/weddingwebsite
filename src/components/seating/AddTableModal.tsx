'use client';

import { useState } from 'react';
import { TableType } from './types';

interface AddTableModalProps {
  defaultName?: string;
  onAdd: (data: { name: string; table_type: TableType }) => void;
  onClose: () => void;
}

const TABLE_TYPES: { type: TableType; label: string; description: string; icon: React.ReactNode }[] = [
  {
    type: 'round',
    label: 'Round',
    description: 'Seats arranged in a circle',
    icon: (
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
        <circle cx="18" cy="18" r="10" stroke="currentColor" strokeWidth="2" fill="none" />
        {[0, 1, 2, 3, 4, 5, 6, 7].map(i => {
          const angle = (2 * Math.PI * i) / 8 - Math.PI / 2;
          const x = 18 + 14 * Math.cos(angle);
          const y = 18 + 14 * Math.sin(angle);
          return <circle key={i} cx={x} cy={y} r="2.5" fill="currentColor" opacity="0.6" />;
        })}
      </svg>
    ),
  },
  {
    type: 'rectangular',
    label: 'Rectangular',
    description: 'Seats along top and bottom',
    icon: (
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
        <rect x="6" y="12" width="24" height="12" stroke="currentColor" strokeWidth="2" fill="none" rx="2" />
        {[0, 1, 2].map(i => (
          <circle key={`t${i}`} cx={10 + i * 8} cy="8" r="2.5" fill="currentColor" opacity="0.6" />
        ))}
        {[0, 1, 2].map(i => (
          <circle key={`b${i}`} cx={10 + i * 8} cy="28" r="2.5" fill="currentColor" opacity="0.6" />
        ))}
      </svg>
    ),
  },
  {
    type: 'head',
    label: 'Head Table',
    description: 'Wide table, seats along top',
    icon: (
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
        <rect x="2" y="16" width="32" height="10" stroke="currentColor" strokeWidth="2" fill="none" rx="2" />
        {[0, 1, 2, 3].map(i => (
          <circle key={i} cx={6 + i * 8} cy="12" r="2.5" fill="currentColor" opacity="0.6" />
        ))}
      </svg>
    ),
  },
];

export default function AddTableModal({ defaultName = 'Table', onAdd, onClose }: AddTableModalProps) {
  const [name, setName] = useState(defaultName);
  const [tableType, setTableType] = useState<TableType>('round');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onAdd({ name: name.trim(), table_type: tableType });
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">Add Table</h2>
          <button
            className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-md hover:bg-gray-100"
            onClick={onClose}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Table Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Table Name</label>
            <input
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-colors"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Table 1, Bridal Table"
              required
            />
          </div>

          {/* Table Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Table Type</label>
            <div className="grid grid-cols-3 gap-2">
              {TABLE_TYPES.map(({ type, label, description, icon }) => (
                <button
                  key={type}
                  type="button"
                  className={`flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all text-left
                    ${tableType === type
                      ? 'border-accent bg-accent/5 text-accent'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  onClick={() => setTableType(type)}
                >
                  <div className={tableType === type ? 'text-accent' : 'text-gray-400'}>
                    {icon}
                  </div>
                  <span className="text-xs font-semibold">{label}</span>
                  <span className="text-xs text-gray-400 text-center leading-tight">{description}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              className="flex-1 px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 text-sm font-medium text-white bg-accent rounded-lg hover:bg-accent-dark transition-colors disabled:opacity-50"
              disabled={!name.trim()}
            >
              Add Table
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
