import { IS_PROD } from '../middleware/auth.js'

export const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((value) => value.trim()).filter(Boolean)
  : IS_PROD
    ? ['https://signifikation.de']
    : ['http://localhost:5173', 'http://localhost:3001']

export const CAPACITOR_ORIGINS = ['capacitor://localhost', 'http://localhost']

export function isAllowedOrigin(origin) {
  return !origin || ALLOWED_ORIGINS.includes(origin) || CAPACITOR_ORIGINS.includes(origin)
}
