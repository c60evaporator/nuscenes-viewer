import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Log } from '@/types/scene'

interface SceneFilterProps {
  logs:             Log[]
  selectedLogToken: string | null
  onFilterChange:   (token: string | null) => void
}

export default function SceneFilter({ logs, selectedLogToken, onFilterChange }: SceneFilterProps) {
  return (
    <div className="space-y-1">
      <p className="text-gray-300 text-xs font-medium">Log Filter</p>
      <Select
        value={selectedLogToken ?? '__all__'}
        onValueChange={(v) => onFilterChange(v === '__all__' ? null : v)}
      >
        <SelectTrigger className="h-8 text-xs bg-gray-700 border-gray-500 text-white">
          <SelectValue placeholder="すべて" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__" className="text-xs">すべて</SelectItem>
          {logs.map((log) => (
            <SelectItem key={log.token} value={log.token} className="text-xs">
              {log.logfile}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
