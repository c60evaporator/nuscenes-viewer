import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from './client'
import type { SceneImportResult } from '../types/sceneImport'

// validateImportFolder が返す 6 ファイル（キー名は backend エンドポイントの引数に対応）
export interface ImportFiles {
  scenes_file:            File   // scene.json
  samples_file:           File   // sample.json
  sample_data_file:       File   // sample_data.json
  ego_pose_file:          File   // ego_pose.json
  log_file:               File   // log.json
  calibrated_sensor_file: File   // calibrated_sensor.json
}

/** 6 JSON を multipart/form-data で POST /scenes/import に送る */
export function useImportScenes() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (files: ImportFiles) => {
      const fd = new FormData()
      fd.append('scenes_file',            files.scenes_file)
      fd.append('samples_file',           files.samples_file)
      fd.append('sample_data_file',       files.sample_data_file)
      fd.append('ego_pose_file',          files.ego_pose_file)
      fd.append('log_file',               files.log_file)
      fd.append('calibrated_sensor_file', files.calibrated_sensor_file)
      fd.append('dry_run', 'false')   // 常に本投入モード
      return apiFetch<SceneImportResult>('/scenes/import', {
        method: 'POST',
        body:   fd,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scenes'] })
    },
  })
}
