import { useState, useRef } from 'react'
import { api, ProfileWithPoints } from '../api/client'
import { ParsedProfile } from '../utils/ArtisanProfileParser'

type Props = {
  onProfileLoaded: (profile: ParsedProfile) => void
  onClose: () => void
}

export function ProfileImporter({ onProfileLoaded, onClose }: Props) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadedProfile, setLoadedProfile] = useState<ProfileWithPoints | null>(null)
  const [profileName, setProfileName] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Convert ProfileWithPoints to ParsedProfile format
  const convertToParseFormat = (profileData: ProfileWithPoints): ParsedProfile => {
    const profile = profileData.profile
    const points = profileData.points

    // Calculate total time safely
    const totalTime = profile.target_total_time || 
      (points.length > 0 ? Math.max(...points.map(p => p.time_seconds).filter(t => !isNaN(t) && isFinite(t))) : 0)

    return {
      title: profile.name || 'Imported Profile',
      roastDate: profile.created_at || new Date().toISOString(),
      totalTime: !isNaN(totalTime) && isFinite(totalTime) ? totalTime : 0,
      points: points
        .filter(point => !isNaN(point.time_seconds) && !isNaN(point.target_temp) && 
                        isFinite(point.time_seconds) && isFinite(point.target_temp))
        .map(point => ({
          time: point.time_seconds,
          beanTemp: point.target_temp,
          envTemp: point.target_temp // Use target_temp for both since we don't have separate env temp
        })),
      events: [], // No events in the backend format yet
      metadata: {
        operator: 'Imported',
        roasterType: 'Unknown',
        beans: 'Unknown',
        weight: 0,
        totalRor: 0,
        dryPhaseRor: 0,
        midPhaseRor: 0,
        finishPhaseRor: 0
      }
    }
  }

  const handleFileLoad = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setIsLoading(true)
    setError(null)

    try {
      const content = await file.text()
      const name = profileName.trim() || file.name.replace('.alog', '')
      const profile = await api.importArtisanProfile(content, name)
      setLoadedProfile(profile)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import profile')
    } finally {
      setIsLoading(false)
    }
  }

  const handleUseProfile = () => {
    if (loadedProfile) {
      const parsedProfile = convertToParseFormat(loadedProfile)
      onProfileLoaded(parsedProfile)
      onClose()
    }
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        padding: '24px',
        minWidth: '500px',
        maxWidth: '700px',
        maxHeight: '80vh',
        overflow: 'auto',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px'
        }}>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '600' }}>
            Import Artisan Profile
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              color: '#6b7280'
            }}
          >
            ×
          </button>
        </div>

        {!loadedProfile && (
          <div style={{ marginBottom: '20px' }}>
            <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '16px' }}>
              Select an Artisan .alog file to import as a roasting profile.
            </p>
            
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '6px', color: '#374151' }}>
                Profile Name (optional)
              </label>
              <input
                type="text"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                placeholder="Enter a custom name or leave blank to use filename"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px'
                }}
              />
            </div>
            
            <input
              ref={fileInputRef}
              type="file"
              accept=".alog"
              onChange={handleFileLoad}
              style={{
                width: '100%',
                padding: '12px',
                border: '2px dashed #d1d5db',
                borderRadius: '8px',
                fontSize: '14px',
                cursor: 'pointer'
              }}
            />
            
            {isLoading && (
              <div style={{
                marginTop: '16px',
                textAlign: 'center',
                color: '#6b7280',
                fontSize: '14px'
              }}>
                Loading profile...
              </div>
            )}
            
            {error && (
              <div style={{
                marginTop: '16px',
                padding: '12px',
                backgroundColor: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '6px',
                color: '#dc2626',
                fontSize: '14px'
              }}>
                Error: {error}
              </div>
            )}
          </div>
        )}

        {loadedProfile && (
          <div>
            <div style={{
              backgroundColor: '#f0f9ff',
              border: '1px solid #e0f2fe',
              borderRadius: '8px',
              padding: '16px',
              marginBottom: '20px'
            }}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: '600', color: '#0c4a6e' }}>
                Profile Preview
              </h3>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>Profile Info</div>
                  <div style={{ fontSize: '13px', color: '#374151', lineHeight: '1.5' }}>
                    <div><strong>Name:</strong> {loadedProfile?.profile?.name || 'Unknown'}</div>
                    <div><strong>Description:</strong> {loadedProfile?.profile?.description || 'None'}</div>
                    <div><strong>Data Points:</strong> {loadedProfile?.points?.length || 0}</div>
                    <div><strong>Created:</strong> {loadedProfile?.profile?.created_at ? new Date(loadedProfile.profile.created_at).toLocaleDateString() : 'Unknown'}</div>
                  </div>
                </div>
                
                <div>
                  <div style={{ fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>Profile Settings</div>
                  <div style={{ fontSize: '13px', color: '#374151', lineHeight: '1.5' }}>
                    <div><strong>Target Total Time:</strong> {loadedProfile?.profile?.target_total_time ? formatDuration(loadedProfile.profile.target_total_time) : 'N/A'}</div>
                    <div><strong>Target First Crack:</strong> {loadedProfile?.profile?.target_first_crack ? formatDuration(loadedProfile.profile.target_first_crack) : 'N/A'}</div>
                    <div><strong>Target End Temp:</strong> {loadedProfile?.profile?.target_end_temp ? `${loadedProfile.profile.target_end_temp}°C` : 'N/A'}</div>
                    <div><strong>Preheat Temp:</strong> {loadedProfile?.profile?.preheat_temp ? `${loadedProfile.profile.preheat_temp}°C` : 'N/A'}</div>
                  </div>
                </div>
              </div>
            </div>

            {loadedProfile?.points?.length > 0 && (
              <div style={{
                backgroundColor: '#fefce8',
                border: '1px solid #fef3c7',
                borderRadius: '8px',
                padding: '16px',
                marginBottom: '20px'
              }}>
                <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#92400e' }}>
                  Profile Points ({loadedProfile?.points?.length || 0})
                </h4>
                <div style={{ maxHeight: '150px', overflowY: 'auto' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '8px' }}>
                    {(loadedProfile?.points || []).slice(0, 10).map((point, index) => (
                      <div
                        key={index}
                        style={{
                          fontSize: '12px',
                          color: '#451a03',
                          backgroundColor: '#fef7ed',
                          padding: '6px 8px',
                          borderRadius: '4px'
                        }}
                      >
                        <div>{formatDuration(point.time_seconds)}</div>
                        <div>{point.target_temp.toFixed(1)}°C</div>
                      </div>
                    ))}
                    {(loadedProfile?.points?.length || 0) > 10 && (
                      <div style={{
                        fontSize: '12px',
                        color: '#92400e',
                        fontStyle: 'italic',
                        padding: '6px 8px'
                      }}>
                        ... and {(loadedProfile?.points?.length || 0) - 10} more
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setLoadedProfile(null)
                  setError(null)
                  setProfileName('')
                  if (fileInputRef.current) {
                    fileInputRef.current.value = ''
                  }
                }}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#f3f4f6',
                  color: '#374151',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer'
                }}
              >
                Load Different File
              </button>
              <button
                onClick={handleUseProfile}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer'
                }}
              >
                Use This Profile
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}