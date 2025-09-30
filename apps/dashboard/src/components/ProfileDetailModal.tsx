import { useQuery } from '@tanstack/react-query'
import { api, ProfileWithPoints } from '../api/client'
import { ProfileChart } from './ProfileChart'
import { calculateRoastLandmarks } from '../utils/rorCalculations'
import { useMemo } from 'react'

type Props = {
  profileId: string
  onClose: () => void
  onUseProfile?: (profile: ProfileWithPoints) => void
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export function ProfileDetailModal({ profileId, onClose, onUseProfile }: Props) {
  const { data: profile, isLoading, error } = useQuery({
    queryKey: ['profile', profileId],
    queryFn: () => api.getProfile(profileId)
  })

  const landmarks = useMemo(() => {
    if (!profile?.points) return {}
    return calculateRoastLandmarks(
      profile.points,
      profile.profile.target_first_crack || undefined
    )
  }, [profile])

  if (isLoading) {
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
          padding: '40px',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '16px', color: '#6b7280' }}>Loading profile...</div>
        </div>
      </div>
    )
  }

  if (error || !profile || !profile.profile) {
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
          padding: '40px',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '16px', color: '#ef4444', marginBottom: '16px' }}>
            Failed to load profile
          </div>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              backgroundColor: '#6b7280',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            Close
          </button>
        </div>
      </div>
    )
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
        maxWidth: '900px',
        width: '90%',
        maxHeight: '90vh',
        overflow: 'auto',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '24px',
          paddingBottom: '16px',
          borderBottom: '1px solid #e5e7eb'
        }}>
          <div>
            <h1 style={{ margin: '0 0 8px 0', fontSize: '24px', fontWeight: '700' }}>
              {profile.profile.name}
            </h1>
            {profile.profile.description && (
              <p style={{ margin: 0, fontSize: '14px', color: '#6b7280' }}>
                {profile.profile.description}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              color: '#6b7280',
              padding: '8px'
            }}
          >
            ×
          </button>
        </div>

        {/* Chart */}
        <div style={{ marginBottom: '24px' }}>
          <h2 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '600' }}>
            Temperature Profile
          </h2>
          <div style={{
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            padding: '16px',
            backgroundColor: '#f8fafc'
          }}>
            <ProfileChart 
              profile={profile} 
              height="400px" 
              dryEndTime={landmarks.dryEndTime}
              firstCrackTime={landmarks.firstCrackTime}
              secondCrackTime={landmarks.secondCrackTime}
            />
          </div>
        </div>

        {/* Profile Information */}
        <div style={{ marginBottom: '24px' }}>
          <h2 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '600' }}>
            Profile Details
          </h2>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px',
            marginBottom: '16px'
          }}>
            <div style={{
              padding: '12px',
              backgroundColor: '#f8fafc',
              borderRadius: '8px',
              border: '1px solid #e5e7eb'
            }}>
              <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Target Time</div>
              <div style={{ fontSize: '16px', fontWeight: '600' }}>
                {profile.profile.target_total_time ? formatTime(profile.profile.target_total_time) : '-'}
              </div>
            </div>
            <div style={{
              padding: '12px',
              backgroundColor: '#f8fafc',
              borderRadius: '8px',
              border: '1px solid #e5e7eb'
            }}>
              <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>End Temperature</div>
              <div style={{ fontSize: '16px', fontWeight: '600' }}>
                {profile.profile.target_end_temp ? `${profile.profile.target_end_temp}°C` : '-'}
              </div>
            </div>
            <div style={{
              padding: '12px',
              backgroundColor: '#f8fafc',
              borderRadius: '8px',
              border: '1px solid #e5e7eb'
            }}>
              <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>First Crack</div>
              <div style={{ fontSize: '16px', fontWeight: '600' }}>
                {profile.profile.target_first_crack ? formatTime(profile.profile.target_first_crack) : '-'}
              </div>
            </div>
            <div style={{
              padding: '12px',
              backgroundColor: '#f8fafc',
              borderRadius: '8px',
              border: '1px solid #e5e7eb'
            }}>
              <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Charge Temperature</div>
              <div style={{ fontSize: '16px', fontWeight: '600' }}>
                {profile.profile.charge_temp ? `${profile.profile.charge_temp}°C` : '-'}
              </div>
            </div>
          </div>
        </div>

        {/* Roast Landmarks */}
        {(landmarks.dryEndTime || landmarks.firstCrackTime || landmarks.secondCrackTime) && (
          <div style={{ marginBottom: '24px' }}>
            <h2 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '600' }}>
              Roast Landmarks
            </h2>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '16px'
            }}>
              {landmarks.dryEndTime && (
                <div style={{
                  padding: '12px',
                  backgroundColor: '#fef3c7',
                  borderRadius: '8px',
                  border: '1px solid #eab308'
                }}>
                  <div style={{ fontSize: '12px', color: '#92400e', marginBottom: '4px' }}>Dry End</div>
                  <div style={{ fontSize: '16px', fontWeight: '600', color: '#92400e' }}>
                    {formatTime(landmarks.dryEndTime)}
                  </div>
                  <div style={{ fontSize: '11px', color: '#92400e', marginTop: '2px' }}>~160°C</div>
                </div>
              )}
              {landmarks.firstCrackTime && (
                <div style={{
                  padding: '12px',
                  backgroundColor: '#fed7aa',
                  borderRadius: '8px',
                  border: '1px solid #f97316'
                }}>
                  <div style={{ fontSize: '12px', color: '#c2410c', marginBottom: '4px' }}>First Crack</div>
                  <div style={{ fontSize: '16px', fontWeight: '600', color: '#c2410c' }}>
                    {formatTime(landmarks.firstCrackTime)}
                  </div>
                  <div style={{ fontSize: '11px', color: '#c2410c', marginTop: '2px' }}>~196°C</div>
                </div>
              )}
              {landmarks.secondCrackTime && (
                <div style={{
                  padding: '12px',
                  backgroundColor: '#fecaca',
                  borderRadius: '8px',
                  border: '1px solid #dc2626'
                }}>
                  <div style={{ fontSize: '12px', color: '#991b1b', marginBottom: '4px' }}>Second Crack</div>
                  <div style={{ fontSize: '16px', fontWeight: '600', color: '#991b1b' }}>
                    {formatTime(landmarks.secondCrackTime)}
                  </div>
                  <div style={{ fontSize: '11px', color: '#991b1b', marginTop: '2px' }}>~224°C</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Temperature Points */}
        {profile.points.length > 0 && (
          <div style={{ marginBottom: '24px' }}>
            <h2 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '600' }}>
              Temperature Points ({profile.points.length})
            </h2>
            <div style={{
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              overflow: 'hidden'
            }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '100px 120px 100px 1fr',
                gap: '16px',
                padding: '12px 16px',
                backgroundColor: '#f3f4f6',
                fontSize: '12px',
                fontWeight: '600',
                color: '#6b7280'
              }}>
                <div>Time</div>
                <div>Temperature</div>
                <div>Fan Speed</div>
                <div>Notes</div>
              </div>
              {profile.points
                .sort((a, b) => a.time_seconds - b.time_seconds)
                .map((point, index) => (
                  <div key={point.id} style={{
                    display: 'grid',
                    gridTemplateColumns: '100px 120px 100px 1fr',
                    gap: '16px',
                    padding: '12px 16px',
                    backgroundColor: index % 2 === 0 ? 'white' : '#f8fafc',
                    borderTop: index === 0 ? 'none' : '1px solid #e5e7eb',
                    fontSize: '14px'
                  }}>
                    <div>{formatTime(point.time_seconds)}</div>
                    <div>{point.target_temp.toFixed(1)}°C</div>
                    <div>{point.fan_speed ? `${point.fan_speed}%` : '-'}</div>
                    <div style={{ fontSize: '13px', color: '#6b7280' }}>
                      {point.notes || '-'}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '12px 24px',
              backgroundColor: '#f3f4f6',
              color: '#374151',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer'
            }}
          >
            Close
          </button>
          {onUseProfile && (
            <button
              onClick={() => onUseProfile(profile)}
              style={{
                padding: '12px 24px',
                backgroundColor: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <span>🚀</span>
              Use Profile for New Roast
            </button>
          )}
        </div>
      </div>
    </div>
  )
}