import { useEntitlements } from './useEntitlements'

const FLAG_MAP = {
  classroom_v2: 'classroomV2',
}

export function useFeatureFlag(flag) {
  const entitlements = useEntitlements()
  const key = FLAG_MAP[flag]
  return key ? !!entitlements[key] : false
}
