import { useState } from 'react'

export type ChartAnnotation = {
  id: string
  time: number
  value?: number
  label: string
  color?: string
  type: 'event' | 'milestone' | 'note'
}

type Props = {
  annotations: ChartAnnotation[]
  onAdd?: (annotation: Omit<ChartAnnotation, 'id'>) => void
  onRemove?: (id: string) => void
  onEdit?: (id: string, annotation: Omit<ChartAnnotation, 'id'>) => void
  sessionStartTime?: number
  readonly?: boolean
}

export function ChartAnnotations({
  annotations,
  onAdd,
  onRemove,
  onEdit,
  sessionStartTime,
  readonly = false
}: Props) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    label: '',
    type: 'event' as const,
    color: '#666',
    relativeTime: 0
  })

  const handleAdd = () => {
    if (!onAdd || !formData.label.trim()) return

    const absoluteTime = sessionStartTime ? sessionStartTime + formData.relativeTime : Date.now() / 1000

    onAdd({
      time: absoluteTime,
      label: formData.label,
      type: formData.type,
      color: formData.color
    })

    setFormData({
      label: '',
      type: 'event',
      color: '#666',
      relativeTime: 0
    })
    setShowAddForm(false)
  }

  const handleEdit = (id: string) => {
    const annotation = annotations.find(a => a.id === id)
    if (!annotation) return

    const relativeTime = sessionStartTime ? annotation.time - sessionStartTime : 0
    setFormData({
      label: annotation.label,
      type: annotation.type,
      color: annotation.color || '#666',
      relativeTime
    })
    setEditingId(id)
    setShowAddForm(true)
  }

  const handleSaveEdit = () => {
    if (!onEdit || !editingId || !formData.label.trim()) return

    const absoluteTime = sessionStartTime ? sessionStartTime + formData.relativeTime : Date.now() / 1000

    onEdit(editingId, {
      time: absoluteTime,
      label: formData.label,
      type: formData.type,
      color: formData.color
    })

    setFormData({
      label: '',
      type: 'event',
      color: '#666',
      relativeTime: 0
    })
    setEditingId(null)
    setShowAddForm(false)
  }

  const formatTime = (time: number) => {
    if (!sessionStartTime) {
      return new Date(time * 1000).toLocaleTimeString()
    }

    const relativeSeconds = Math.floor(time - sessionStartTime)
    const minutes = Math.floor(relativeSeconds / 60)
    const seconds = relativeSeconds % 60
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  const typeColors = {
    event: 'bg-blue-100 text-blue-800',
    milestone: 'bg-green-100 text-green-800',
    note: 'bg-yellow-100 text-yellow-800'
  }

  const typeIcons = {
    event: '⚡',
    milestone: '🎯',
    note: '📝'
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-sm font-semibold text-gray-700">Chart Annotations</h3>
        {!readonly && onAdd && (
          <button
            onClick={() => setShowAddForm(true)}
            className="px-3 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            + Add
          </button>
        )}
      </div>

      {/* Annotations List */}
      <div className="space-y-2 max-h-40 overflow-y-auto">
        {annotations.length === 0 ? (
          <div className="text-sm text-gray-500 text-center py-2">
            No annotations added
          </div>
        ) : (
          annotations.map(annotation => (
            <div
              key={annotation.id}
              className="flex items-center justify-between p-2 bg-gray-50 rounded"
            >
              <div className="flex items-center gap-2 flex-1">
                <span className="text-sm">{typeIcons[annotation.type]}</span>
                <div
                  className="w-3 h-3 rounded"
                  style={{ backgroundColor: annotation.color }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">
                    {annotation.label}
                  </div>
                  <div className="text-xs text-gray-500">
                    {formatTime(annotation.time)} •{' '}
                    <span className={`px-1 rounded ${typeColors[annotation.type]}`}>
                      {annotation.type}
                    </span>
                  </div>
                </div>
              </div>

              {!readonly && (
                <div className="flex gap-1">
                  {onEdit && (
                    <button
                      onClick={() => handleEdit(annotation.id)}
                      className="text-xs text-blue-600 hover:text-blue-800"
                    >
                      Edit
                    </button>
                  )}
                  {onRemove && (
                    <button
                      onClick={() => onRemove(annotation.id)}
                      className="text-xs text-red-600 hover:text-red-800"
                    >
                      Remove
                    </button>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Add/Edit Form */}
      {showAddForm && !readonly && (
        <div className="mt-4 p-3 bg-gray-50 rounded border">
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Label
              </label>
              <input
                type="text"
                value={formData.label}
                onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                placeholder="Annotation label"
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Time ({sessionStartTime ? 'relative seconds' : 'absolute'})
                </label>
                <input
                  type="number"
                  value={formData.relativeTime}
                  onChange={(e) => setFormData({ ...formData, relativeTime: parseInt(e.target.value) || 0 })}
                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Type
                </label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                >
                  <option value="event">Event</option>
                  <option value="milestone">Milestone</option>
                  <option value="note">Note</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Color
              </label>
              <div className="flex gap-2">
                {['#666', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'].map(color => (
                  <button
                    key={color}
                    onClick={() => setFormData({ ...formData, color })}
                    className={`w-6 h-6 rounded border-2 ${
                      formData.color === color ? 'border-gray-800' : 'border-gray-300'
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={editingId ? handleSaveEdit : handleAdd}
                className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                {editingId ? 'Save' : 'Add'}
              </button>
              <button
                onClick={() => {
                  setShowAddForm(false)
                  setEditingId(null)
                  setFormData({
                    label: '',
                    type: 'event',
                    color: '#666',
                    relativeTime: 0
                  })
                }}
                className="px-3 py-1 text-sm bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}