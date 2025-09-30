import { RoastControl } from '../components/RoastControl'

export function TestRoastControl() {
  return (
    <div style={{ padding: '20px' }}>
      <div style={{
        marginBottom: '20px',
        padding: '16px',
        backgroundColor: '#f0f9ff',
        border: '1px solid #0ea5e9',
        borderRadius: '8px'
      }}>
        <h1 style={{ margin: '0 0 8px 0', fontSize: '20px', fontWeight: '600', color: '#0c4a6e' }}>
          🧪 RoastControl Component Test
        </h1>
        <p style={{ margin: 0, fontSize: '14px', color: '#0c4a6e' }}>
          Testing the new clean RoastControl component in isolation using the proven AutoTune API pattern.
        </p>
      </div>

      <RoastControl deviceId="esp32_roaster_01" />
    </div>
  )
}