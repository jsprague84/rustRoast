import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'

export function Devices({ onPick, current }: { onPick: (id: string) => void, current: string }) {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['devices'], queryFn: api.devices, refetchInterval: 5000 })
  return (
    <div>
      <h2>Devices</h2>
      <button onClick={() => refetch()}>Refresh</button>
      {isLoading && <p>Loading…</p>}
      {error && <p style={{color:'crimson'}}>Failed to load devices</p>}
      <ul>
        {data?.devices.map(d => (
          <li key={d.device_id} style={{padding:'6px 0'}}>
            <button onClick={() => onPick(d.device_id)} style={{padding:'6px 10px', borderRadius:6, border: '1px solid #ddd', background: d.device_id===current?'#eef2ff':'#fff'}}>
              {d.device_id} <small style={{marginLeft:8, color:'#6b7280'}}>last_seen: {d.last_seen}</small>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

