'use client';

import { useEffect, useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface WeddingPartyMember {
  id: string;
  name: string;
  role: string;
  relationship: string;
  photo?: string;
  bio?: string;
}

interface SortableRowProps {
  member: WeddingPartyMember;
  index: number;
  party: 'bride' | 'groom';
  onEdit: (party: 'bride' | 'groom', index: number) => void;
  onDelete: (party: 'bride' | 'groom', index: number) => void;
}

function SortableRow({ member, index, party, onEdit, onDelete }: SortableRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: member.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <tr ref={setNodeRef} style={style} className={isDragging ? 'bg-gray-50' : ''}>
      <td className="px-6 py-4 whitespace-nowrap">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 focus:outline-none"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">{member.name}</td>
      <td className="px-6 py-4 whitespace-nowrap">{member.role}</td>
      <td className="px-6 py-4 whitespace-nowrap">{member.relationship}</td>
      <td className="px-6 py-4 whitespace-nowrap text-right">
        <button
          onClick={() => onEdit(party, index)}
          className="text-blue-100 bg-blue-500 px-3 py-1 rounded hover:bg-blue-600 mr-2 text-sm"
        >
          Edit
        </button>
        <button
          onClick={() => onDelete(party, index)}
          className="text-red-100 bg-red-500 px-3 py-1 rounded hover:bg-red-600 text-sm"
        >
          Delete
        </button>
      </td>
    </tr>
  );
}

interface OfficiantInfo {
  name: string;
  relationship: string;
  photo?: string;
  bio?: string;
}

interface WeddingPartyData {
  brideParty: WeddingPartyMember[];
  groomParty: WeddingPartyMember[];
  officiant?: OfficiantInfo;
}

export default function AdminWeddingPartyPage() {
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingParty, setEditingParty] = useState<'bride' | 'groom' | 'officiant' | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [formData, setFormData] = useState<WeddingPartyMember>({
    id: '',
    name: '',
    role: '',
    relationship: '',
    photo: '',
    bio: '',
  });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    fetchConfig();
  }, []);

  const ensureIds = (members: any[]) => {
    return members.map((member, index) => ({
      ...member,
      id: member.id || `member-${index}-${Date.now()}`,
    }));
  };

  const fetchConfig = async () => {
    try {
      const response = await fetch('/api/admin/site-config');
      const data = await response.json();

      // Ensure all members have IDs
      if (data.weddingParty) {
        if (data.weddingParty.brideParty) {
          data.weddingParty.brideParty = ensureIds(data.weddingParty.brideParty);
        }
        if (data.weddingParty.groomParty) {
          data.weddingParty.groomParty = ensureIds(data.weddingParty.groomParty);
        }
      }

      setConfig(data);
    } catch (error) {
      console.error('Error fetching config:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDragEnd = (event: DragEndEvent, party: 'bride' | 'groom') => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const partyKey = party === 'bride' ? 'brideParty' : 'groomParty';
      const members = config.weddingParty[partyKey];

      const oldIndex = members.findIndex((m: WeddingPartyMember) => m.id === active.id);
      const newIndex = members.findIndex((m: WeddingPartyMember) => m.id === over.id);

      config.weddingParty[partyKey] = arrayMove(members, oldIndex, newIndex);
      setConfig({ ...config });
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/admin/site-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });

      if (response.ok) {
        alert('Wedding party updated successfully!');
      }
    } catch (error) {
      console.error('Error saving config:', error);
      alert('Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const addMember = (party: 'bride' | 'groom' | 'officiant') => {
    setEditingParty(party);
    setEditingIndex(null);
    setFormData({
      id: `member-new-${Date.now()}`,
      name: '',
      role: '',
      relationship: '',
      photo: '',
      bio: '',
    });
  };

  const editMember = (party: 'bride' | 'groom', index: number) => {
    const members = party === 'bride'
      ? config.weddingParty?.brideParty || []
      : config.weddingParty?.groomParty || [];

    setEditingParty(party);
    setEditingIndex(index);
    setFormData(members[index]);
  };

  const editOfficiant = () => {
    setEditingParty('officiant');
    setEditingIndex(null);
    const officiant = config.weddingParty?.officiant;
    setFormData({
      id: 'officiant',
      name: officiant?.name || '',
      role: 'Officiant',
      relationship: officiant?.relationship || '',
      photo: officiant?.photo || '',
      bio: officiant?.bio || '',
    });
  };

  const saveMember = () => {
    if (!config.weddingParty) {
      config.weddingParty = { brideParty: [], groomParty: [] };
    }

    if (editingParty === 'officiant') {
      // Save officiant
      config.weddingParty.officiant = {
        name: formData.name,
        relationship: formData.relationship,
        photo: formData.photo,
        bio: formData.bio,
      };
    } else {
      const partyKey = editingParty === 'bride' ? 'brideParty' : 'groomParty';

      if (editingIndex === null) {
        // Add new member
        config.weddingParty[partyKey].push(formData);
      } else {
        // Edit existing member
        config.weddingParty[partyKey][editingIndex] = formData;
      }
    }

    setConfig({ ...config });
    setEditingParty(null);
    setEditingIndex(null);
  };

  const deleteOfficiant = () => {
    if (!confirm('Are you sure you want to remove the officiant?')) return;
    if (config.weddingParty) {
      delete config.weddingParty.officiant;
      setConfig({ ...config });
    }
  };

  const deleteMember = (party: 'bride' | 'groom', index: number) => {
    if (!confirm('Are you sure you want to delete this member?')) return;

    const partyKey = party === 'bride' ? 'brideParty' : 'groomParty';
    config.weddingParty[partyKey].splice(index, 1);
    setConfig({ ...config });
  };

  if (loading) {
    return <div className="p-8">Loading...</div>;
  }

  const brideParty = config.weddingParty?.brideParty || [];
  const groomParty = config.weddingParty?.groomParty || [];

  return (
    <div className="max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Wedding Party Management</h1>
        <p className="text-gray-600">
          Add and manage your wedding party members
        </p>
      </div>

      {/* Bride's Party */}
      <div className="mb-12">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold">{config.brideName}'s Party</h2>
          <button
            onClick={() => addMember('bride')}
            className="bg-accent text-white px-4 py-2 rounded-md hover:bg-accent/90"
          >
            Add Member
          </button>
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={(event) => handleDragEnd(event, 'bride')}
        >
          <div className="bg-white rounded-lg shadow overflow-hidden">
            {brideParty.length === 0 ? (
              <p className="p-6 text-gray-500 text-center">No members added yet</p>
            ) : (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase w-12"></th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Relationship</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <SortableContext
                  items={brideParty.map((m: WeddingPartyMember) => m.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <tbody className="bg-white divide-y divide-gray-200">
                    {brideParty.map((member: WeddingPartyMember, index: number) => (
                      <SortableRow
                        key={member.id}
                        member={member}
                        index={index}
                        party="bride"
                        onEdit={editMember}
                        onDelete={deleteMember}
                      />
                    ))}
                  </tbody>
                </SortableContext>
              </table>
            )}
          </div>
        </DndContext>
      </div>

      {/* Groom's Party */}
      <div className="mb-12">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold">{config.groomName}'s Party</h2>
          <button
            onClick={() => addMember('groom')}
            className="bg-accent text-white px-4 py-2 rounded-md hover:bg-accent/90"
          >
            Add Member
          </button>
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={(event) => handleDragEnd(event, 'groom')}
        >
          <div className="bg-white rounded-lg shadow overflow-hidden">
            {groomParty.length === 0 ? (
              <p className="p-6 text-gray-500 text-center">No members added yet</p>
            ) : (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase w-12"></th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Relationship</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <SortableContext
                  items={groomParty.map((m: WeddingPartyMember) => m.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <tbody className="bg-white divide-y divide-gray-200">
                    {groomParty.map((member: WeddingPartyMember, index: number) => (
                      <SortableRow
                        key={member.id}
                        member={member}
                        index={index}
                        party="groom"
                        onEdit={editMember}
                        onDelete={deleteMember}
                      />
                    ))}
                  </tbody>
                </SortableContext>
              </table>
            )}
          </div>
        </DndContext>
      </div>

      {/* Officiant */}
      <div className="mb-12">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold">Officiant</h2>
          {!config.weddingParty?.officiant && (
            <button
              onClick={() => addMember('officiant')}
              className="bg-accent text-white px-4 py-2 rounded-md hover:bg-accent/90"
            >
              Add Officiant
            </button>
          )}
        </div>

        <div className="bg-white rounded-lg shadow overflow-hidden">
          {!config.weddingParty?.officiant ? (
            <p className="p-6 text-gray-500 text-center">No officiant added yet</p>
          ) : (
            <div className="p-6">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    {config.weddingParty.officiant.name}
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">
                    {config.weddingParty.officiant.relationship}
                  </p>
                  {config.weddingParty.officiant.bio && (
                    <p className="text-sm text-gray-500 mt-2">
                      {config.weddingParty.officiant.bio}
                    </p>
                  )}
                  {config.weddingParty.officiant.photo && (
                    <p className="text-xs text-gray-400 mt-2">
                      Photo: {config.weddingParty.officiant.photo}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={editOfficiant}
                    className="text-blue-600 hover:text-blue-900"
                  >
                    Edit
                  </button>
                  <button
                    onClick={deleteOfficiant}
                    className="text-red-600 hover:text-red-900"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-green-600 text-white px-6 py-2 rounded-md hover:bg-green-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save All Changes'}
        </button>
      </div>

      {/* Edit Modal */}
      {editingParty && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <h3 className="text-2xl font-bold mb-6">
              {editingIndex === null ? 'Add' : 'Edit'} Member
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                  required
                />
              </div>

              {editingParty !== 'officiant' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Role * (e.g., Maid of Honor, Best Man, Bridesmaid, Groomsman)
                  </label>
                  <input
                    type="text"
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                    required
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Relationship * (e.g., {editingParty === 'officiant' ? 'Friend, Pastor, Rabbi' : 'Sister, Best Friend, Brother'})
                </label>
                <input
                  type="text"
                  value={formData.relationship}
                  onChange={(e) => setFormData({ ...formData, relationship: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Photo Filename (optional - upload photo via Photos page first)
                </label>
                <input
                  type="text"
                  value={formData.photo || ''}
                  onChange={(e) => setFormData({ ...formData, photo: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                  placeholder="e.g., member-photo.jpg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Bio (optional)
                </label>
                <textarea
                  value={formData.bio || ''}
                  onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                  rows={4}
                  placeholder="A short description about this person..."
                />
              </div>
            </div>

            <div className="flex justify-end gap-4 mt-6">
              <button
                onClick={() => setEditingParty(null)}
                className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={saveMember}
                disabled={!formData.name || (editingParty !== 'officiant' && !formData.role) || !formData.relationship}
                className="px-4 py-2 bg-accent text-white rounded-md hover:bg-accent/90 disabled:opacity-50"
              >
                {editingParty === 'officiant' ? (config.weddingParty?.officiant ? 'Update' : 'Add') : (editingIndex === null ? 'Add' : 'Update')} {editingParty === 'officiant' ? 'Officiant' : 'Member'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
