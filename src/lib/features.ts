function enabled(value: string | undefined) {
  return value !== 'false' && value !== '0'
}

export const FEATURES = {
  realtime: enabled(import.meta.env.VITE_FEATURE_REALTIME),
  admin: enabled(import.meta.env.VITE_FEATURE_ADMIN),
}
